import { randomBytes } from "node:crypto";
import type {
  ActionEnvelope,
  Invitation,
  SessionInfo,
  ShowEnvelope,
  ShowMode,
  EpisodeId,
  Slot,
} from "@/lib/contracts";
import {
  acquireLease,
  applyAction,
  createRecord,
  hydrateRecord,
  expireState,
  LEASE_MS,
  needsExpiry,
  rate,
  recordEvent,
  requireDirector,
} from "./core";
import { assert } from "./errors";
import type {
  Actor,
  InviteRecord,
  OutputGrantRecord,
  SessionRecord,
  ShowRecord,
} from "./records";
import {
  appOrigin,
  cookieValue,
  digest,
  privateActor,
  readSession,
  unsign,
  type ProgramSession,
} from "./security";
import { getStore } from "./store";
import { ensureOAuthGrant } from "./twitch-grants";
import {
  publicSoloConfigured,
  refundFailedSoloStart,
  reserveSolo,
  requireSoloAccess,
  soloEligible,
  soloUsage,
} from "./solo-policy";
import { scheduleSolo } from "./solo-schedule";

export const showKey = (id: string) => "show:" + id;
export const sessionKey = (id: string) => "session:" + id;
export function validShowId(id: string) {
  assert(
    /^ps_[a-f0-9]{16}$/.test(id),
    404,
    "show_not_found",
    "This stage could not be found.",
  );
}
export async function sessionRecord(id: string): Promise<SessionRecord> {
  const store = getStore();
  const initial: SessionRecord = {
    id,
    createdAt: Date.now(),
    currentShowId: null,
    rates: {},
  };
  await store.create(sessionKey(id), initial);
  return (await store.get<SessionRecord>(sessionKey(id)))!;
}
export function invitedLogin(login: string, userId?: string) {
  const allowed = (process.env.TWITCH_ALLOWED_HOSTS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return (
    allowed.includes(login.toLowerCase()) ||
    Boolean(userId && allowed.includes(userId))
  );
}
export function hostAllowed(record: SessionRecord | null) {
  return Boolean(
    record?.login &&
    record.credentialId &&
    invitedLogin(record.login, record.userId),
  );
}
export async function sessionInfo(id: string): Promise<SessionInfo> {
  const auth = await getStore().get<SessionRecord>(sessionKey(id));
  return {
    authenticated: Boolean(auth?.credentialId),
    hostAllowed: hostAllowed(auth),
    soloAllowed: soloEligible(auth),
    soloUsage: await soloUsage(auth),
    displayName: auth?.displayName || null,
    login: auth?.login || null,
    twitchConnected: Boolean(auth?.credentialId),
    currentShowId: auth?.currentShowId ?? null,
    services: {
      database: process.env.DATABASE_URL
        ? "postgres"
        : process.env.NODE_ENV === "production"
          ? "unavailable"
          : "local",
      mediaConfigured: Boolean(
        process.env.LIVEKIT_URL &&
        process.env.LIVEKIT_API_KEY &&
        process.env.LIVEKIT_API_SECRET,
      ),
      twitchConfigured: Boolean(
        process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET,
      ),
    },
  };
}
export async function addressRate(
  request: Request,
  category: string,
  max: number,
  windowMs: number,
) {
  const address =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = "rate:" + privateActor(address).slice(0, 24) + ":" + category;
  await getStore().create(key, { buckets: {} });
  await getStore().update<
    { buckets: Record<string, { at: number; count: number }> },
    void
  >(key, (record) => rate(record.buckets, category, max, windowMs));
}
export async function loadRecord(id: string) {
  validShowId(id);
  const record = await getStore().get<ShowRecord>(showKey(id));
  assert(
    record && record.state.expiresAt > Date.now(),
    404,
    "show_not_found",
    "This stage has ended or its access has expired.",
  );
  return record;
}
export async function actorFor(
  record: ShowRecord,
  request: Request,
  forceProgram = false,
): Promise<Actor> {
  const browser = readSession(request);
  if (!forceProgram && browser) {
    if (record.ownerId === browser.id)
      return { id: browser.id, role: "director", slot: "A" };
    for (const slot of ["A", "B"] as Slot[])
      if (record.participantSessions[slot] === browser.id)
        return { id: browser.id, role: "performer", slot };
  }
  const token = unsign<ProgramSession>(
    cookieValue(request, "portal_program_" + record.state.id),
  );
  if (
    token &&
    token.showId === record.state.id &&
    token.expiresAt > Date.now()
  ) {
    const grant = await getStore().get<OutputGrantRecord>(
      "output:" + token.grantId,
    );
    if (
      grant &&
      grant.redeemed &&
      grant.showId === record.state.id &&
      grant.generation ===
        (record.outputGeneration ?? record.inviteGeneration) &&
      record.state.phase !== "ended"
    )
      return { id: "program:" + token.grantId, role: "program", slot: null };
  }
  if (forceProgram && browser?.id === record.ownerId)
    return { id: "program-owner:" + browser.id, role: "program", slot: null };
  assert(
    false,
    403,
    "show_access",
    "This stage is private. Open its invitation or use the director's browser.",
  );
}
export function envelope(record: ShowRecord, actor: Actor): ShowEnvelope {
  assert(
    actor.role !== "audience",
    403,
    "internal_actor",
    "Audience authority is server-only.",
  );
  hydrateRecord(record);
  const show = structuredClone(record.state);
  show.events = show.events.slice(-50);
  show.revision ??= show.sequence;
  show.transport ??= show.mode === "rehearsal" ? "fixture" : "livekit";
  return { show, role: actor.role, slot: actor.slot, serverNow: Date.now() };
}
export async function currentShow(
  id: string,
  request: Request,
  program = false,
): Promise<ShowEnvelope> {
  let record = await loadRecord(id);
  const actor = await actorFor(record, request, program);
  if (needsExpiry(record, Date.now())) {
    record = await getStore().update<ShowRecord, ShowRecord>(
      showKey(id),
      (value) => {
        expireState(value, Date.now());
        return value;
      },
    );
    await actorFor(record, request, program);
  }
  return envelope(record, actor);
}
export async function createShow(
  ownerId: string,
  mode: ShowMode,
  request: Request,
  episode: EpisodeId = "borrowed-weather",
): Promise<ShowEnvelope> {
  await addressRate(request, "create-show", 60, 3600_000);
  const auth = await sessionRecord(ownerId);
  if (mode === "live") {
    assert(
      hostAllowed(auth),
      403,
      "host_invitation",
      "Live shows are reserved for an invited Twitch host. Connect the invited account, or explore the free labeled rehearsal.",
    );
    await ensureOAuthGrant(auth.credentialId!, ownerId, true);
  }
  if (mode === "solo") {
    assert(
      soloEligible(auth),
      403,
      "solo_unavailable",
      "Connect Twitch to start a capped solo stage. Local rehearsal is always available.",
    );
    await ensureOAuthGrant(auth.credentialId!, ownerId, true);
  }
  await getStore().update<SessionRecord, void>(sessionKey(ownerId), (value) =>
    rate(value.rates, "create-show", mode === "live" ? 8 : 30, 3600_000),
  );
  const id = "ps_" + randomBytes(8).toString("hex");
  const record = createRecord(
    id,
    ownerId,
    mode,
    Date.now(),
    mode !== "rehearsal" ? auth.login! : null,
    episode,
  );
  if (mode !== "rehearsal") {
    record.credentialId = auth.credentialId!;
    record.channelId = auth.userId!;
    record.state.participants.A.name = auth.displayName || auth.login!;
  }
  if (mode === "solo") {
    record.soloReservation = await reserveSolo(auth, id, Date.now());
    record.state.solo = {
      endsAt: record.soloReservation.expiresAt,
      status: "reserved",
    };
  }
  try {
    await getStore().create(showKey(id), record);
    await getStore().update<SessionRecord, void>(
      sessionKey(ownerId),
      (value) => {
        value.currentShowId = id;
      },
    );
    if (record.soloReservation) {
      await scheduleSolo(id, record.soloReservation);
      return envelope((await getStore().get<ShowRecord>(showKey(id)))!, {
        id: ownerId,
        role: "director",
        slot: "A",
      });
    }
    return envelope(record, { id: ownerId, role: "director", slot: "A" });
  } catch (error) {
    if (record.soloReservation)
      await refundFailedSoloStart(id, record.soloReservation).catch(() => {
        console.warn(
          "portal.solo.quota " +
            JSON.stringify({
              showId: id,
              reservationId: record.soloReservation!.id,
              step: "refund-failed-start",
              outcome: "cleanup-pending",
            }),
        );
      });
    throw error;
  }
}
export async function command(
  id: string,
  request: Request,
  action: ActionEnvelope,
): Promise<ShowEnvelope> {
  validShowId(id);
  const browser = readSession(request);
  assert(
    browser,
    403,
    "read_only",
    "This browser has no performer or director control role.",
  );
  const result = await getStore().update<
    ShowRecord,
    { record: ShowRecord; actor: Actor }
  >(showKey(id), (record) => {
    let actor: Actor | null =
      record.ownerId === browser.id
        ? { id: browser.id, role: "director", slot: "A" }
        : null;
    for (const slot of ["A", "B"] as Slot[])
      if (!actor && record.participantSessions[slot] === browser.id)
        actor = { id: browser.id, role: "performer", slot };
    assert(actor, 403, "role_revoked", "This role has been revoked.");
    assert(
      record.state.expiresAt > Date.now(),
      410,
      "show_expired",
      "This stage's access has expired. Create a new show.",
    );
    expireState(record, Date.now());
    applyAction(record, actor, action, Date.now());
    return { record, actor };
  });
  return envelope(result.record, result.actor);
}
export async function lease(
  id: string,
  request: Request,
  clientId: string,
  takeover: boolean,
  epoch?: number,
  incarnationId?: string,
  incarnationSequence?: number,
) {
  validShowId(id);
  const browser = readSession(request);
  assert(
    browser,
    403,
    "director_required",
    "Only the director can acquire the stage.",
  );
  assert(
    /^[a-zA-Z0-9_-]{8,128}$/.test(clientId),
    400,
    "renderer_id",
    "A valid director tab identifier is required.",
  );
  const store = getStore();
  const incarnation = parseIncarnation(incarnationId, incarnationSequence);
  if (!takeover && epoch !== undefined && store.renewShowLease) {
    const renewed = await store.renewShowLease(
      showKey(id),
      browser.id,
      clientId,
      epoch,
      LEASE_MS,
      incarnation,
    );
    if (renewed)
      return {
        envelope: envelope(renewed, {
          id: browser.id,
          role: "director",
          slot: "A",
        }),
        oldEpoch: renewed.state.epoch,
        oldIncarnationId: renewed.state.renderLease.incarnationId,
        rendererChanged: false,
        changed: false,
      };
  }
  const result = await store.update<
    ShowRecord,
    {
      record: ShowRecord;
      oldEpoch: number;
      oldIncarnationId?: string;
      rendererChanged: boolean;
    }
  >(showKey(id), (value) => {
    assert(
      value.ownerId === browser.id,
      403,
      "director_required",
      "This show belongs to another director.",
    );
    assert(
      value.state.expiresAt > Date.now() && value.state.phase !== "ended",
      409,
      "show_ended",
      "A finished show has no active renderer.",
    );
    assert(
      epoch === undefined || epoch === value.state.epoch,
      409,
      "renderer_fenced",
      "The stage's director authority changed. Refresh before recovering it.",
    );
    const oldEpoch = value.state.epoch;
    const oldIncarnationId = value.state.renderLease.incarnationId;
    const hadRenderer = Boolean(value.state.renderLease.clientId);
    if (
      !takeover &&
      epoch !== undefined &&
      value.state.renderLease.clientId === clientId &&
      value.state.renderLease.incarnationId
    )
      assert(
        incarnation?.id === value.state.renderLease.incarnationId &&
          incarnation?.sequence ===
            value.state.renderLease.incarnationSequence &&
          !value.state.renderLease.releasedAt,
        409,
        "renderer_fenced",
        "This director page was replaced by a newer page. Use the current studio.",
      );
    rate(value.rates, "lease:" + clientId, 30, 60_000);
    acquireLease(value, clientId, takeover, Date.now(), incarnation);
    return {
      record: value,
      oldEpoch,
      oldIncarnationId,
      rendererChanged:
        hadRenderer &&
        oldIncarnationId !== value.state.renderLease.incarnationId,
    };
  });
  return {
    envelope: envelope(result.record, {
      id: browser.id,
      role: "director",
      slot: "A",
    }),
    oldEpoch: result.oldEpoch,
    oldIncarnationId: result.oldIncarnationId,
    rendererChanged: result.rendererChanged,
    changed: result.oldEpoch !== result.record.state.epoch,
  };
}
function parseIncarnation(id?: string, sequence?: number) {
  if (id === undefined && sequence === undefined) return undefined;
  assert(
    typeof id === "string" &&
      /^[a-zA-Z0-9_-]{8,128}$/.test(id) &&
      Number.isSafeInteger(sequence) &&
      Number(sequence) > 0,
    400,
    "renderer_incarnation",
    "A valid director page identifier is required.",
  );
  return { id, sequence: sequence! };
}
/** A pagehide beacon releases this mount, never a newer reload of the same tab. */
export async function releaseLease(
  id: string,
  request: Request,
  clientId: string,
  epoch: number,
  incarnationId: string,
  incarnationSequence: number,
) {
  validShowId(id);
  const browser = readSession(request),
    incarnation = parseIncarnation(incarnationId, incarnationSequence)!;
  assert(
    browser,
    403,
    "director_required",
    "Only the director can release the stage.",
  );
  return getStore().update<ShowRecord, { released: boolean }>(
    showKey(id),
    (value) => {
      assert(
        value.ownerId === browser.id,
        403,
        "director_required",
        "This show belongs to another director.",
      );
      const current = value.state.renderLease;
      if (
        value.state.phase === "ended" ||
        current.clientId !== clientId ||
        current.epoch !== epoch ||
        current.incarnationId !== incarnation.id ||
        current.incarnationSequence !== incarnation.sequence ||
        current.releasedAt
      )
        return { released: false };
      // Keep the bounded lease window so a prompt reload preserves its cue and offer.
      // Program gates the released renderer until that same tab explicitly reclaims it.
      current.releasedAt = Date.now();
      return { released: true };
    },
  );
}
export async function invite(
  id: string,
  request: Request,
  slot: Slot,
): Promise<Invitation> {
  const record = await loadRecord(id),
    actor = await actorFor(record, request);
  requireDirector(actor);
  assert(
    record.state.mode !== "solo",
    403,
    "audience_room_only",
    "Solo uses a software Audience Room. Create a duet to invite another performer.",
  );
  assert(
    slot === "B",
    400,
    "guest_slot",
    "This two-performer show invites its second performer to stage B.",
  );
  assert(
    record.state.phase !== "ended",
    409,
    "show_ended",
    "Start a new show before inviting a performer.",
  );
  const code = randomBytes(18).toString("base64url"),
    hash = digest(code),
    expiresAt = Date.now() + 15 * 60_000;
  const generation = await getStore().update<ShowRecord, number>(
    showKey(id),
    (value) => {
      assert(
        value.ownerId === actor.id &&
          value.state.phase !== "ended" &&
          value.state.expiresAt > Date.now(),
        409,
        "show_ended",
        "This stage can no longer issue invitations.",
      );
      rate(value.rates, "invites", 20, 3600_000);
      (value.activeInvitations ??= {})[slot] = hash;
      return value.inviteGeneration;
    },
  );
  await getStore().create<InviteRecord>("invite:" + hash, {
    hash,
    showId: id,
    slot,
    expiresAt,
    usedBy: null,
    generation,
  });
  return {
    code,
    expiresAt,
    slot,
    url: `${appOrigin(request)}/backstage?invite=${encodeURIComponent(code)}`,
  };
}
export async function invitationInfo(code: string) {
  assert(
    /^[\w-]{24}$/.test(code),
    404,
    "invite_invalid",
    "This invitation is not valid.",
  );
  const invite = await getStore().get<InviteRecord>("invite:" + digest(code));
  assert(
    invite && invite.expiresAt > Date.now(),
    410,
    "invite_expired",
    "This invitation expired. Ask the director for a new backstage invitation.",
  );
  const show = await loadRecord(invite.showId);
  assert(
    invite.generation === show.inviteGeneration && show.state.phase !== "ended",
    410,
    "invite_revoked",
    "The director revoked this invitation or ended the show.",
  );
  assert(
    show.activeInvitations?.[invite.slot] === invite.hash,
    410,
    "invite_replaced",
    "The director replaced this invitation. Ask for the newest backstage link.",
  );
  return {
    showId: invite.showId,
    title: show.state.title,
    channel: show.state.channel,
    hostName: show.state.participants.A.name,
    slot: invite.slot,
    mode: show.state.mode,
    expiresAt: invite.expiresAt,
    recordingEnabled: false,
  };
}
export async function joinShow(
  code: string,
  name: string,
  sessionId: string,
  request: Request,
) {
  await addressRate(request, "join", 30, 10 * 60_000);
  const info = await invitationInfo(code),
    hash = digest(code);
  assert(
    name.trim().length >= 1 && name.trim().length <= 40,
    400,
    "performer_name",
    "Choose a stage name of 1–40 characters.",
  );
  const base = await loadRecord(info.showId);
  assert(
    sessionId !== base.ownerId,
    409,
    "separate_performer",
    "This browser is the director. Open the invitation in a separate browser or private window for the second performer.",
  );
  await getStore().update<InviteRecord, void>("invite:" + hash, (value) => {
    assert(
      value.expiresAt > Date.now() &&
        (!value.usedBy || value.usedBy === sessionId),
      410,
      "invite_used",
      "This invitation has already been used or expired. Ask for a fresh invitation.",
    );
    value.usedBy = sessionId;
  });
  const record = await getStore().update<ShowRecord, ShowRecord>(
    showKey(info.showId),
    (value) => {
      assert(
        value.inviteGeneration === base.inviteGeneration &&
          value.state.phase !== "ended",
        410,
        "invite_revoked",
        "This invitation was revoked.",
      );
      assert(
        value.activeInvitations?.[info.slot] === hash &&
          value.state.expiresAt > Date.now(),
        410,
        "invite_replaced",
        "This invitation was replaced before it could be redeemed. Ask for the newest link.",
      );
      assert(
        !value.participantSessions[info.slot] ||
          value.participantSessions[info.slot] === sessionId,
        409,
        "slot_occupied",
        "This backstage place is already occupied. The director must revoke the old guest before replacing them.",
      );
      if (value.participantSessions[info.slot] === sessionId) return value;
      value.participantSessions[info.slot] = sessionId;
      value.state.transport = "livekit";
      const p = value.state.participants[info.slot];
      p.name = name.trim();
      p.joined = true;
      p.connected = false;
      p.camera = false;
      p.microphone = false;
      p.ready = false;
      p.admitted = false;
      p.consentBroadcast = false;
      p.consentRecording = false;
      p.calibrated = false;
      p.lastSeenAt = Date.now();
      recordEvent(
        value,
        "participant.joined",
        info.slot,
        `${p.name} joined private backstage. Camera, consent, readiness, and admission remain separate.`,
        Date.now(),
      );
      return value;
    },
  );
  await sessionRecord(sessionId);
  return envelope(record, {
    id: sessionId,
    role: "performer",
    slot: info.slot,
  });
}
export async function revokeGuest(id: string, request: Request) {
  const initial = await loadRecord(id),
    actor = await actorFor(initial, request);
  requireDirector(actor);
  const record = await getStore().update<ShowRecord, ShowRecord>(
    showKey(id),
    (value) => {
      value.outputGeneration ??= value.inviteGeneration;
      value.inviteGeneration += 1;
      value.activeInvitations = {};
      delete value.participantSessions.B;
      const p = value.state.participants.B;
      p.joined = false;
      p.connected = false;
      p.camera = false;
      p.microphone = false;
      p.ready = false;
      p.admitted = false;
      p.consentBroadcast = false;
      p.consentRecording = false;
      if (value.state.umbrella.transfer?.status === "offered") {
        value.state.umbrella.transfer.status = "cancelled";
        value.state.umbrella.version += 1;
      }
      recordEvent(
        value,
        "participant.revoked",
        "director",
        "Guest access and unredeemed invitations were revoked. Committed prop ownership is preserved.",
        Date.now(),
      );
      return value;
    },
  );
  return envelope(record, actor);
}
export async function createOutputGrant(id: string, request: Request) {
  const record = await loadRecord(id),
    actor = await actorFor(record, request);
  requireDirector(actor);
  requireSoloAccess(record);
  assert(
    record.state.phase !== "ended",
    409,
    "show_ended",
    "The show has ended.",
  );
  const generation = await getStore().update<ShowRecord, number>(
    showKey(id),
    (value) => {
      assert(
        value.state.phase !== "ended",
        409,
        "show_ended",
        "The show has ended.",
      );
      rate(value.rates, "output-grant", 10, 60_000);
      return (value.outputGeneration ??= value.inviteGeneration);
    },
  );
  const code = randomBytes(5).toString("hex").toUpperCase(),
    hash = digest(code),
    expiresAt = Date.now() + 5 * 60_000;
  await getStore().create<OutputGrantRecord>("output:" + hash, {
    hash,
    showId: id,
    expiresAt,
    redeemed: false,
    generation,
  });
  return {
    code,
    expiresAt,
    showId: id,
    url: `${appOrigin(request)}/program?show=${id}`,
  };
}
export async function revokeOutputs(id: string, request: Request) {
  const initial = await loadRecord(id),
    actor = await actorFor(initial, request);
  requireDirector(actor);
  const result = await getStore().update<
    ShowRecord,
    { record: ShowRecord; identities: string[] }
  >(showKey(id), (value) => {
    const identities = value.outputIdentities ?? [];
    value.outputIdentities = [];
    value.outputGeneration =
      (value.outputGeneration ?? value.inviteGeneration) + 1;
    recordEvent(
      value,
      "output.revoked",
      "director",
      "Program viewers were explicitly unpaired. Backstage performers and the committed scene are unchanged.",
      Date.now(),
    );
    return { record: value, identities };
  });
  return {
    envelope: envelope(result.record, actor),
    identities: result.identities,
  };
}
export async function redeemOutput(id: string, code: string, request: Request) {
  await addressRate(request, "output-redeem", 20, 10 * 60_000);
  validShowId(id);
  assert(
    /^[a-fA-F0-9]{10}$/.test(code),
    400,
    "output_code",
    "Enter the ten-character output code from the director.",
  );
  const hash = digest(code.toUpperCase()),
    record = await loadRecord(id);
  await getStore().update<OutputGrantRecord, void>(
    "output:" + hash,
    (grant) => {
      assert(
        grant.showId === id &&
          grant.expiresAt > Date.now() &&
          !grant.redeemed &&
          grant.generation ===
            (record.outputGeneration ?? record.inviteGeneration) &&
          record.state.phase !== "ended",
        410,
        "output_expired",
        "This output code expired or was already used. Generate another in the director console.",
      );
      grant.redeemed = true;
    },
  );
  const token: ProgramSession = {
    showId: id,
    expiresAt: Date.now() + 2 * 3600_000,
    grantId: hash,
  };
  return {
    token,
    result: envelope(record, {
      id: "program:" + hash,
      role: "program",
      slot: null,
    }),
  };
}
