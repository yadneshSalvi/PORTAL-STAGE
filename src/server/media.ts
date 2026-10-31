import { randomBytes } from "node:crypto";
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
  type VideoGrant,
} from "livekit-server-sdk";
import type { MediaToken, Slot } from "@/lib/contracts";
import { rendererMediaIdentity } from "@/lib/media-identity";
import { assert } from "./errors";
import { localMediaTestingEnabled } from "./environment";
import { rate, recordEvent, requireDirector, requireLease } from "./core";
import { actorFor, loadRecord, showKey } from "./shows";
import { getStore } from "./store";
import type { ShowRecord } from "./records";
export const mediaRoom = (id: string, output = false) =>
  `portal-${id}-${output ? "program" : "backstage"}`;
export function mediaService() {
  const url = process.env.LIVEKIT_URL,
    key = process.env.LIVEKIT_API_KEY,
    secret = process.env.LIVEKIT_API_SECRET;
  assert(
    url && key && secret,
    503,
    "media_unconfigured",
    "Live media is not configured yet. The labeled rehearsal remains available.",
  );
  const parsed = new URL(url);
  assert(
    parsed.protocol === "wss:" ||
      (localMediaTestingEnabled() && parsed.protocol === "ws:"),
    503,
    "media_url",
    "Configure a secure LiveKit endpoint for this deployment.",
  );
  return new RoomServiceClient(url.replace(/^ws/, "http"), key, secret);
}
export async function mintMediaToken(
  id: string,
  request: Request,
  body: Record<string, unknown>,
): Promise<MediaToken> {
  const purpose = body.purpose;
  assert(
    typeof purpose === "string" &&
      ["director", "performer", "output-publish", "output-view"].includes(
        purpose,
      ),
    400,
    "media_purpose",
    "Choose a supported media role.",
  );
  const outputView = purpose === "output-view",
    output = outputView || purpose === "output-publish";
  const record = await loadRecord(id),
    actor = await actorFor(record, request, outputView);
  assert(
    record.state.phase !== "ended",
    409,
    "show_ended",
    "This show's media room has closed.",
  );
  assert(
    record.state.mode === "live" || localMediaTestingEnabled(),
    403,
    "rehearsal_media",
    "Public rehearsal uses generated stage plates without billable media rooms. Live media requires an invited host.",
  );
  const rendererId =
      typeof body.rendererId === "string" ? body.rendererId : undefined,
    epoch = typeof body.epoch === "number" ? body.epoch : undefined,
    incarnationId =
      typeof body.incarnationId === "string" ? body.incarnationId : undefined,
    incarnationSequence =
      typeof body.incarnationSequence === "number"
        ? body.incarnationSequence
        : undefined;
  assert(
    (body.incarnationId === undefined &&
      body.incarnationSequence === undefined) ||
      (typeof incarnationId === "string" &&
        /^[a-zA-Z0-9_-]{8,128}$/.test(incarnationId) &&
        Number.isSafeInteger(incarnationSequence) &&
        Number(incarnationSequence) > 0),
    400,
    "renderer_incarnation",
    "A valid director page identifier is required.",
  );
  if (purpose === "director" || purpose === "output-publish") {
    requireDirector(actor);
    requireLease(
      record,
      rendererId,
      epoch,
      Date.now(),
      incarnationId,
      incarnationSequence,
    );
  }
  if (purpose === "performer")
    assert(
      actor.role === "performer" && actor.slot,
      403,
      "guest_required",
      "This media grant belongs to an invited performer.",
    );
  if (!output) {
    const p = record.state.participants[actor.slot!];
    assert(
      p.joined && p.consentBroadcast && p.calibrated,
      409,
      "media_consent",
      "Confirm the broadcast consent and calibrate your shelter region before connecting backstage.",
    );
  }
  await getStore().update<ShowRecord, void>(showKey(id), (value) =>
    rate(value.rates, actor.id + ":media", 20, 60_000),
  );
  const room = mediaRoom(id, output),
    service = mediaService();
  await service.createRoom({
    name: room,
    emptyTimeout: 60,
    departureTimeout: 30,
    maxParticipants: output ? 4 : 3,
    metadata: JSON.stringify({
      showId: id,
      purpose: output ? "program-only" : "private-backstage",
      recordings: false,
    }),
  });
  const slot: Slot | null = output ? null : actor.slot;
  const identity = outputView
    ? `program-${randomBytes(10).toString("hex")}`
    : purpose === "output-publish"
      ? rendererMediaIdentity(
          id,
          record.state.epoch,
          "output-publisher",
          incarnationId,
        )
      : purpose === "director"
        ? rendererMediaIdentity(
            id,
            record.state.epoch,
            "director",
            incarnationId,
          )
        : `performer-${id}-${slot}`;
  const role = outputView
    ? "program"
    : purpose === "output-publish"
      ? "output-publisher"
      : purpose;
  const grant: VideoGrant = {
    roomJoin: true,
    room,
    roomCreate: false,
    roomList: false,
    roomRecord: false,
    roomAdmin: false,
    canSubscribe: purpose !== "output-publish",
    canPublish: !outputView,
    canPublishData: !output,
    canUpdateOwnMetadata: false,
    canSubscribeMetrics: false,
    canManageAgentSession: false,
  };
  if (purpose === "director")
    grant.canPublishSources = [
      TrackSource.CAMERA,
      TrackSource.MICROPHONE,
      TrackSource.SCREEN_SHARE,
    ];
  else if (purpose === "performer")
    grant.canPublishSources = [TrackSource.CAMERA, TrackSource.MICROPHONE];
  else if (purpose === "output-publish")
    grant.canPublishSources = [
      TrackSource.SCREEN_SHARE,
      TrackSource.SCREEN_SHARE_AUDIO,
    ];
  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    {
      identity,
      ttl: 120,
      metadata: JSON.stringify({
        role,
        slot,
        epoch: record.state.epoch,
        showId: id,
        ...((purpose === "director" || purpose === "output-publish") &&
        incarnationId
          ? { incarnationId, incarnationSequence }
          : {}),
      }),
    },
  );
  token.addGrant(grant);
  // Issue before the final database fence: revocation can invalidate even a token
  // that was reserved but has not connected to LiveKit yet.
  const signedToken = await token.toJwt();
  // Recheck after the room operation so withdrawn consent cannot race token issuance.
  await getStore().update<ShowRecord, void>(showKey(id), (value) => {
    assert(
      value.state.phase !== "ended" &&
        (output
          ? (value.outputGeneration ?? value.inviteGeneration) ===
            (record.outputGeneration ?? record.inviteGeneration)
          : purpose !== "performer" ||
            value.inviteGeneration === record.inviteGeneration),
      409,
      "media_revoked",
      "This media session was revoked before it could connect.",
    );
    if (purpose === "director" || purpose === "output-publish")
      requireLease(
        value,
        rendererId,
        epoch,
        Date.now(),
        incarnationId,
        incarnationSequence,
      );
    if (outputView) {
      const identities = (value.outputIdentities ??= []);
      assert(
        identities.length < 64,
        409,
        "output_capacity",
        "Unpair previous outputs before connecting more Program viewers.",
      );
      identities.push(identity);
    }
    if (!output) {
      value.state.transport = "livekit";
      assert(
        value.participantSessions[slot!] === actor.id &&
          value.state.participants[slot!].consentBroadcast,
        403,
        "media_revoked",
        "This performer's media access was revoked.",
      );
      const p = value.state.participants[slot!];
      p.ready = false;
      p.admitted = false;
      p.connected = false;
      p.camera = false;
      p.microphone = false;
      recordEvent(
        value,
        "media.grant",
        slot!,
        "A short-lived private media grant was issued. Reconnection requires readiness and admission again.",
        Date.now(),
      );
    }
  });
  return {
    url: process.env.LIVEKIT_URL!,
    token: signedToken,
    room,
    identity,
    expiresAt: Date.now() + 120_000,
    slot,
    purpose: purpose as MediaToken["purpose"],
  };
}
/** Revoke viewers only. The canonical publisher and backstage room stay intact. */
export async function removeMediaOutputs(
  id: string,
  issuedIdentities: string[] = [],
) {
  if (!process.env.LIVEKIT_URL) return;
  const service = mediaService(),
    room = mediaRoom(id, true);
  const connected = await service.listParticipants(room).catch(() => []);
  const identities = new Set([
    ...issuedIdentities,
    ...connected
      .filter((participant) => participant.identity.startsWith("program-"))
      .map((participant) => participant.identity),
  ]);
  await Promise.allSettled(
    [...identities].map((identity) =>
      service.removeParticipant(room, identity, {
        revokeTokenTs: BigInt(Math.floor(Date.now() / 1000) + 1),
      }),
    ),
  );
}
export async function removeMediaParticipant(
  id: string,
  slot: Slot,
  epoch: number,
  incarnationId?: string,
) {
  if (!process.env.LIVEKIT_URL) return;
  const identity =
    slot === "A"
      ? rendererMediaIdentity(id, epoch, "director", incarnationId)
      : `performer-${id}-${slot}`;
  await mediaService()
    .removeParticipant(mediaRoom(id), identity, {
      revokeTokenTs: BigInt(Math.floor(Date.now() / 1000) + 1),
    })
    .catch(() => undefined);
}
export async function fenceMedia(
  id: string,
  oldEpoch: number,
  oldIncarnationId?: string,
) {
  if (!process.env.LIVEKIT_URL) return;
  const service = mediaService();
  await Promise.allSettled([
    service.removeParticipant(
      mediaRoom(id),
      rendererMediaIdentity(id, oldEpoch, "director", oldIncarnationId),
      {
        revokeTokenTs: BigInt(Math.floor(Date.now() / 1000) + 1),
      },
    ),
    service.removeParticipant(
      mediaRoom(id, true),
      rendererMediaIdentity(id, oldEpoch, "output-publisher", oldIncarnationId),
      { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000) + 1) },
    ),
  ]);
}
export async function closeMedia(id: string) {
  if (!process.env.LIVEKIT_URL) return;
  const service = mediaService();
  await Promise.allSettled([
    service.deleteRoom(mediaRoom(id)),
    service.deleteRoom(mediaRoom(id, true)),
  ]);
}
