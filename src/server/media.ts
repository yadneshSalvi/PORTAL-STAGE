import { randomBytes } from "node:crypto";
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
  type VideoGrant,
} from "livekit-server-sdk";
import type { MediaToken, Slot } from "@/lib/contracts";
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
    epoch = typeof body.epoch === "number" ? body.epoch : undefined;
  if (purpose === "director" || purpose === "output-publish") {
    requireDirector(actor);
    requireLease(record, rendererId, epoch, Date.now());
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
      ? `renderer-${id}-${record.state.epoch}`
      : purpose === "director"
        ? `director-${id}-${record.state.epoch}`
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
      }),
    },
  );
  token.addGrant(grant);
  // Recheck after the room operation so withdrawn consent cannot race token issuance.
  await getStore().update<ShowRecord, void>(showKey(id), (value) => {
    assert(
      value.state.phase !== "ended" &&
        value.inviteGeneration === record.inviteGeneration,
      409,
      "media_revoked",
      "This media session was revoked before it could connect.",
    );
    if (purpose === "director" || purpose === "output-publish")
      requireLease(value, rendererId, epoch, Date.now());
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
    token: await token.toJwt(),
    room,
    identity,
    expiresAt: Date.now() + 120_000,
    slot,
    purpose: purpose as MediaToken["purpose"],
  };
}
export async function removeMediaParticipant(
  id: string,
  slot: Slot,
  epoch: number,
) {
  if (!process.env.LIVEKIT_URL) return;
  const identity =
    slot === "A" ? `director-${id}-${epoch}` : `performer-${id}-${slot}`;
  await mediaService()
    .removeParticipant(mediaRoom(id), identity, {
      revokeTokenTs: BigInt(Math.floor(Date.now() / 1000) + 1),
    })
    .catch(() => undefined);
}
export async function fenceMedia(id: string, oldEpoch: number) {
  if (!process.env.LIVEKIT_URL) return;
  const service = mediaService();
  await Promise.allSettled([
    service.removeParticipant(mediaRoom(id), `director-${id}-${oldEpoch}`, {
      revokeTokenTs: BigInt(Math.floor(Date.now() / 1000) + 1),
    }),
    service.removeParticipant(
      mediaRoom(id, true),
      `renderer-${id}-${oldEpoch}`,
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
