import {
  DEFAULT_PRESET,
  OTHER_SLOT,
  type ActionEnvelope,
  type ParticipantState,
  type ShowAction,
  type ShowMode,
  type ShowState,
  type Slot,
  type Weather,
  type EpisodeId,
  type ParcelState,
} from "@/lib/contracts";
import { assert, HttpError } from "./errors";
import type { Actor, ShowRecord } from "./records";
import { recordEvent, rate } from "./protocol-events";
import { hashData } from "./security";
import { fenceExpiredSolo, requireSoloAccess } from "./solo-policy";
import {
  CREATURE_NAMES,
  DELIVERY_GRACE_MS,
  isAudienceRoom,
  isStageReady,
  propLabel,
} from "@/lib/show-grammar";
import {
  castVote,
  closeRound,
  finalizeRound,
  openRound,
  presenceEffect,
  rememberDecision,
  resolveRound,
} from "./audience";
export { castVote } from "./audience";

export const LEASE_MS = 45_000;
export const PRESENCE_MS = 45_000;
const HANDOFF = new Set([
  "offer",
  "accept",
  "decline",
  "cancel-offer",
  "recall",
]);
const DIRECTOR_ACTIONS = new Set([
  "start",
  "hold",
  "resume",
  "end",
  "panic",
  "reset",
  "restore-rehearsal",
  "admit",
  "hide",
  "arrive",
  "recall",
  "open-round",
  "close-round",
  "apply-weather",
  "apply-choice",
  "resolve-round",
  "rehearsal-effect",
  "stamp-parcel",
  "open-parcel",
  "finish-parcel",
  "hatch",
  "shelter",
  "save-preset",
  "load-preset",
  "rehearsal-vote",
]);
function participant(
  slot: Slot,
  rehearsal: boolean,
  now: number,
): ParticipantState {
  return {
    slot,
    name: rehearsal
      ? `Room ${slot}`
      : slot === "A"
        ? "Director"
        : "Invited performer",
    joined: rehearsal || slot === "A",
    connected: rehearsal,
    camera: rehearsal,
    microphone: false,
    consentBroadcast: rehearsal,
    consentRecording: false,
    ready: rehearsal,
    admitted: rehearsal,
    calibrated: rehearsal,
    handedness: "right",
    anchor: { x: slot === "A" ? 0.65 : 0.35, y: 0.48 },
    lastSeenAt: rehearsal ? now : null,
  };
}
function initialParcel(id: string): ParcelState {
  return {
    tag: `MP-${id.replace(/^ps_/, "").slice(-8).toUpperCase()}`,
    damage: 0,
    contents: null,
    stamped: false,
    opened: false,
    openedAt: null,
    transformedRoom: null,
    ending: null,
  };
}
function episodePreset(episode: EpisodeId) {
  return episode === "midnight-parcel"
    ? {
        ...DEFAULT_PRESET,
        id: episode,
        episode,
        name: "Midnight Parcel",
        episodeTitle: "Midnight Parcel",
        defaultContents: "stars" as const,
        parcelEnding: "deliver" as const,
      }
    : { ...DEFAULT_PRESET, episode };
}
/** Old saved weather shows keep their original prop, cue and ballot identities. */
export function hydrateRecord(record: ShowRecord) {
  const s = record.state;
  s.episode ??= "borrowed-weather";
  s.parcel ??= s.episode === "midnight-parcel" ? initialParcel(s.id) : null;
  s.decisions ??= {};
  s.presenceEffects ??= [];
  s.solo ??= null;
  if (s.umbrella.acceptedTransfers === undefined) {
    const inceptionRetained = s.events.some(
      (event) =>
        event.propId === s.umbrella.id &&
        ["show.created", "action.reset"].includes(event.type),
    );
    const untouched =
      s.umbrella.version === 1 &&
      s.umbrella.owner === "A" &&
      !s.umbrella.transfer;
    s.umbrella.acceptedTransfers =
      inceptionRetained || untouched
        ? s.events.filter(
            (event) =>
              event.type === "action.accept" && event.propId === s.umbrella.id,
          ).length
        : null;
  }
}
function authorizeAudienceActor(
  record: ShowRecord,
  actor: Actor,
  action: ShowAction,
) {
  const s = record.state,
    round = s.round;
  assert(
    s.mode === "solo" &&
      actor.slot === "B" &&
      round &&
      actor.roundId === round.id &&
      actor.id === `audience:${round.id}` &&
      round.status === "closed" &&
      !round.needsDirectorChoice &&
      round.epoch === s.epoch &&
      round.boundPropVersion === s.umbrella.version &&
      round.boundTransferId === (s.umbrella.transfer?.id ?? null),
    403,
    "audience_actor",
    "The Audience Room needs a current, resolved handoff choice.",
  );
  const allowed =
    round.kind === "accept"
      ? (action.type === "accept" && round.result === "accept") ||
        (action.type === "decline" && round.result === "wait")
      : round.kind === "giveback" &&
        round.result === "giveback" &&
        action.type === "offer";
  assert(
    allowed,
    403,
    "audience_actor",
    "This audience choice does not authorize that handoff.",
  );
}
export function createRecord(
  id: string,
  ownerId: string,
  mode: ShowMode,
  now: number,
  channel: string | null = null,
  episode: EpisodeId = "borrowed-weather",
): ShowRecord {
  const rehearsal = mode === "rehearsal";
  const state: ShowState = {
    id,
    mode,
    episode,
    parcel: episode === "midnight-parcel" ? initialParcel(id) : null,
    decisions: {},
    presenceEffects: [],
    solo: null,
    transport: rehearsal ? "fixture" : "livekit",
    title:
      episode === "midnight-parcel" ? "Midnight Parcel" : "Borrowed Weather",
    phase: "backstage",
    beat: "overture",
    sequence: 0,
    revision: 1,
    epoch: 1,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + (rehearsal ? 24 : 7 * 24) * 3600_000,
    channel,
    participants: {
      A: participant("A", rehearsal, now),
      B:
        mode === "solo"
          ? {
              ...participant("B", false, now),
              name: "Audience Room",
              joined: false,
            }
          : participant("B", rehearsal, now),
    },
    umbrella: {
      id: `${id}-${episode === "midnight-parcel" ? "parcel" : "umbrella"}-1`,
      owner: "A",
      version: 1,
      acceptedTransfers: 0,
      repairPatch: "coral",
      wetness: 0,
      armed: true,
      transfer: null,
    },
    weather: null,
    rainStartedAt: null,
    creature: {
      id: `${id}-pip-1`,
      hatched: false,
      hatchedAt: null,
      mood: "gentle",
      shelterOwner: "A",
    },
    round: null,
    preset: episodePreset(episode),
    savedPresets: [episodePreset(episode)],
    events: [],
    renderLease: { clientId: null, epoch: 1, expiresAt: 0 },
    twitch: {
      connected: false,
      connectedAt: null,
      lastEventAt: null,
      lastHeartbeatAt: null,
      status: "Chat is not connected.",
      subscriptionId: null,
    },
  };
  const record: ShowRecord = {
    state,
    ownerId,
    participantSessions: { A: ownerId },
    credentialId: null,
    channelId: null,
    ballots: {},
    messageIds: [],
    idempotency: {},
    rates: {},
    inviteGeneration: 1,
    outputGeneration: 1,
    twitchSessionId: null,
  };
  recordEvent(
    record,
    "show.created",
    "director",
    rehearsal
      ? "Labeled solo rehearsal created with synthetic test plates."
      : mode === "solo"
        ? "Solo show created: one real streamer and a software Audience Room controlled by Twitch choices."
        : "Private show created; performers enter backstage before admission.",
    now,
  );
  return record;
}
export { recordEvent, rate } from "./protocol-events";
export function requireDirector(actor: Actor) {
  assert(
    actor.role === "director",
    403,
    "director_required",
    "Only the director can issue this cue.",
  );
}
export function requireLease(
  record: ShowRecord,
  rendererId: string | undefined,
  epoch: number | undefined,
  now: number,
  incarnationId?: string,
  incarnationSequence?: number,
) {
  const lease = record.state.renderLease;
  assert(
    rendererId &&
      rendererId === lease.clientId &&
      epoch === lease.epoch &&
      epoch === record.state.epoch &&
      (!lease.incarnationId ||
        (lease.incarnationId === incarnationId &&
          lease.incarnationSequence === incarnationSequence)) &&
      !lease.releasedAt &&
      lease.expiresAt > now,
    409,
    "renderer_fenced",
    "This director tab no longer owns the stage. Recover the current stage before sending a cue.",
  );
}
function restoreFixtureReadiness(record: ShowRecord, now: number) {
  const s = record.state;
  if (
    s.mode !== "rehearsal" ||
    s.transport === "livekit" ||
    s.phase === "ended"
  )
    return;
  if (
    ![s.participants.A, s.participants.B].every((p) => p.ready && p.admitted)
  ) {
    for (const slot of ["A", "B"] as Slot[])
      s.participants[slot] = participant(slot, true, now);
    recordEvent(
      record,
      "fixture.ready",
      "system",
      "Synthetic rehearsal plates were restored. The committed scene remains intact; the director can resume.",
      now,
    );
  }
}
export function acquireLease(
  record: ShowRecord,
  clientId: string,
  takeover: boolean,
  now: number,
  incarnation?: { id: string; sequence: number },
) {
  assert(
    /^[a-zA-Z0-9_-]{8,128}$/.test(clientId),
    400,
    "renderer_id",
    "A valid director tab identifier is required.",
  );
  const s = record.state,
    previous = s.renderLease;
  if (previous.clientId === clientId && previous.incarnationId) {
    assert(
      incarnation &&
        (incarnation.sequence > (previous.incarnationSequence ?? 0) ||
          (incarnation.sequence === previous.incarnationSequence &&
            incarnation.id === previous.incarnationId)),
      409,
      "renderer_fenced",
      "This director page was replaced by a newer page. Use the current studio.",
    );
  }
  if (previous.clientId === clientId && previous.expiresAt > now) {
    restoreFixtureReadiness(record, now);
    previous.expiresAt = now + LEASE_MS;
    if (incarnation) {
      previous.incarnationId = incarnation.id;
      previous.incarnationSequence = incarnation.sequence;
    }
    delete previous.releasedAt;
    return;
  }
  assert(
    !previous.clientId ||
      previous.expiresAt <= now ||
      previous.releasedAt ||
      takeover,
    409,
    "renderer_busy",
    "Another director tab owns this stage. Close it or explicitly take over.",
  );
  if (previous.clientId) {
    s.epoch += 1;
    s.phase = s.phase === "ended" ? "ended" : "hold";
    cancelPendingOffer(
      record,
      "Director authority changed; the uncommitted offer was cancelled.",
      now,
    );
    if (s.round && ["open", "closing"].includes(s.round.status))
      s.round.status = "cancelled";
    for (const p of Object.values(s.participants)) {
      p.ready = false;
      p.admitted = false;
    }
  }
  restoreFixtureReadiness(record, now);
  s.renderLease = {
    clientId,
    epoch: s.epoch,
    expiresAt: now + LEASE_MS,
    ...(incarnation
      ? {
          incarnationId: incarnation.id,
          incarnationSequence: incarnation.sequence,
        }
      : {}),
  };
  recordEvent(
    record,
    "renderer.acquired",
    "director",
    previous.clientId
      ? "A new director epoch recovered the committed scene under a holding curtain."
      : "One director tab acquired the canonical stage.",
    now,
    { epoch: s.epoch },
  );
}
function cancelBoundHandoffRound(
  record: ShowRecord,
  transferId: string | null,
  reason: string,
  now: number,
) {
  const round = record.state.round;
  if (
    !round ||
    !["accept", "giveback"].includes(round.kind ?? "weather") ||
    round.boundTransferId !== transferId ||
    !["open", "closing", "closed"].includes(round.status)
  )
    return;
  round.status = "cancelled";
  recordEvent(record, "round.cancelled", "system", reason, now, {
    roundId: round.id,
    transferId,
    result: round.result,
    source: round.source,
    voters: round.uniqueVoters,
    ...Object.fromEntries(
      Object.entries(round.tallies).map(([choice, count]) => [
        `tally_${choice}`,
        count ?? 0,
      ]),
    ),
  });
}
function handoffRoundChanged(record: ShowRecord) {
  const s = record.state,
    round = s.round;
  return Boolean(
    round &&
    ["accept", "giveback"].includes(round.kind ?? "weather") &&
    ["open", "closing", "closed"].includes(round.status) &&
    (round.epoch !== s.epoch ||
      round.boundPropVersion !== s.umbrella.version ||
      round.boundTransferId !== (s.umbrella.transfer?.id ?? null)),
  );
}
function cancelPendingOffer(record: ShowRecord, reason: string, now: number) {
  const transfer = record.state.umbrella.transfer;
  if (transfer?.status === "offered") {
    transfer.status = "cancelled";
    record.state.umbrella.version += 1;
    recordEvent(record, "transfer.cancelled", "system", reason, now, {
      transferId: transfer.id,
    });
    cancelBoundHandoffRound(
      record,
      transfer.id,
      "The waiting handoff was cancelled. Its unapplied audience choice is cancelled too; the recorded ballots remain in the trace.",
      now,
    );
  }
}
function hideParticipant(
  record: ShowRecord,
  slot: Slot,
  now: number,
  reason: string,
) {
  const p = record.state.participants[slot];
  p.admitted = false;
  p.ready = false;
  const t = record.state.umbrella.transfer;
  if (t?.status === "offered" && (t.from === slot || t.to === slot))
    cancelPendingOffer(record, reason, now);
}
/** Expiry is persisted on the next state read/action; the clients also close stale apertures immediately. */
export function expireState(record: ShowRecord, now: number): boolean {
  const before = record.state.sequence,
    s = record.state;
  if (fenceExpiredSolo(record, now) && s.phase !== "ended") {
    s.phase = "ended";
    s.beat = "curtain";
    record.outputGeneration =
      (record.outputGeneration ?? record.inviteGeneration) + 1;
    record.inviteGeneration += 1;
    cancelPendingOffer(
      record,
      "The solo session deadline arrived before acceptance.",
      now,
    );
    if (s.round && ["open", "closing"].includes(s.round.status))
      s.round.status = "cancelled";
    for (const p of Object.values(s.participants))
      Object.assign(p, {
        connected: false,
        camera: false,
        microphone: false,
        ready: false,
        admitted: false,
      });
    s.twitch.connected = false;
    s.twitch.status = "Solo session ended.";
    recordEvent(
      record,
      "solo.expired",
      "system",
      "The solo session deadline arrived. Further media issuance and show cues are closed.",
      now,
    );
  }
  if (
    s.umbrella.transfer?.status === "offered" &&
    s.umbrella.transfer.expiresAt <= now
  ) {
    s.umbrella.transfer.status = "expired";
    s.umbrella.version += 1;
    recordEvent(
      record,
      "transfer.expired",
      "system",
      "The offer expired before acceptance; ownership did not change.",
      now,
    );
    cancelBoundHandoffRound(
      record,
      s.umbrella.transfer.id,
      "The offer expired before its audience handoff was applied. Make a fresh offer; ownership is unchanged.",
      now,
    );
  }
  if (handoffRoundChanged(record))
    cancelBoundHandoffRound(
      record,
      s.round!.boundTransferId ?? null,
      "The prop or stage changed before this handoff choice was applied. Ask again for the current handoff; its recorded ballots remain in the trace.",
      now,
    );
  if (s.round?.status === "open" && s.round.closesAt <= now)
    closeRound(record, undefined, now);
  if (s.round?.status === "closing" && (s.round.graceEndsAt ?? 0) <= now)
    finalizeRound(record, now);
  if (s.mode !== "rehearsal" || s.transport === "livekit") {
    for (const slot of ["A", "B"] as Slot[]) {
      const p = s.participants[slot];
      if (p.connected && p.lastSeenAt && now - p.lastSeenAt > PRESENCE_MS) {
        p.connected = false;
        p.camera = false;
        p.microphone = false;
        hideParticipant(
          record,
          slot,
          now,
          "A performer disconnected before acceptance.",
        );
        recordEvent(
          record,
          "participant.interrupted",
          slot,
          `${p.name}'s connection expired; their aperture is closed and re-admission is required.`,
          now,
        );
      }
    }
    if (
      s.renderLease.clientId &&
      s.renderLease.expiresAt <= now &&
      s.phase === "live"
    ) {
      s.phase = "hold";
      cancelPendingOffer(
        record,
        "The director lease expired before acceptance.",
        now,
      );
      recordEvent(
        record,
        "renderer.expired",
        "system",
        "The canonical renderer lease expired; the show is held until explicit recovery.",
        now,
      );
    }
  }
  if (
    s.twitch.connected &&
    s.twitch.lastHeartbeatAt &&
    now - s.twitch.lastHeartbeatAt > 65_000
  ) {
    s.twitch.connected = false;
    s.twitch.status =
      "Connection gap. Missed Twitch messages cannot be replayed.";
    if (s.round && ["open", "closing"].includes(s.round.status))
      s.round.status = "cancelled";
    recordEvent(
      record,
      "twitch.gap",
      "system",
      "Twitch heartbeat expired; the active audience round was cancelled.",
      now,
    );
  }
  return s.sequence !== before;
}
export function needsExpiry(record: ShowRecord, now: number) {
  const s = record.state;
  return (
    handoffRoundChanged(record) ||
    (s.mode === "solo" &&
      s.phase !== "ended" &&
      Boolean(s.solo && s.solo.endsAt <= now)) ||
    (s.umbrella.transfer?.status === "offered" &&
      s.umbrella.transfer.expiresAt <= now) ||
    (s.round?.status === "open" && s.round.closesAt <= now) ||
    (s.round?.status === "closing" && (s.round.graceEndsAt ?? 0) <= now) ||
    ((s.mode !== "rehearsal" || s.transport === "livekit") &&
      ((s.phase === "live" && s.renderLease.expiresAt <= now) ||
        Object.values(s.participants).some(
          (p) =>
            p.connected && p.lastSeenAt && now - p.lastSeenAt > PRESENCE_MS,
        ))) ||
    (s.twitch.connected &&
      s.twitch.lastHeartbeatAt &&
      now - s.twitch.lastHeartbeatAt > 65_000)
  );
}
function active(s: ShowState) {
  assert(
    s.phase === "live",
    409,
    "stage_held",
    "Bring the stage live before this cue. Committed ownership stays safe while held.",
  );
}
function ownSlot(record: ShowRecord, actor: Actor, requested?: Slot): Slot {
  const slot = requested ?? actor.slot;
  assert(
    !(
      slot === "B" &&
      record.state.mode === "solo" &&
      actor.role !== "audience"
    ),
    403,
    "audience_room_only",
    "The software Audience Room is controlled by its current audience choice.",
  );
  assert(
    slot &&
      (slot === actor.slot ||
        (actor.role === "director" &&
          record.state.mode === "rehearsal" &&
          record.state.transport !== "livekit")),
    403,
    "performer_required",
    "A performer can control only their own camera and gestures.",
  );
  return slot;
}
/** Pure synchronous mutation: safe to replay inside a database compare-and-swap transaction. */
function remember(record: ShowRecord, key: string, hash: string, now: number) {
  record.idempotency[key] = { hash, sequence: record.state.sequence, at: now };
  const entries = Object.entries(record.idempotency);
  if (entries.length > 1000)
    for (const [old] of entries
      .sort((a, b) => a[1].at - b[1].at)
      .slice(0, entries.length - 1000))
      delete record.idempotency[old];
}
export function applyAction(
  record: ShowRecord,
  actor: Actor,
  envelope: ActionEnvelope,
  now: number,
) {
  assert(
    actor.role !== "program",
    403,
    "read_only",
    "Program output is read-only.",
  );
  hydrateRecord(record);
  const action = envelope.action,
    s = record.state;
  if (actor.role === "audience") authorizeAudienceActor(record, actor, action);
  const key = `${actor.id}:${envelope.idempotencyKey}`;
  const hash = hashData({
    action,
    expectedVersion: envelope.expectedVersion,
    epoch: envelope.epoch,
    rendererId: envelope.rendererId,
    incarnationId: envelope.incarnationId,
    incarnationSequence: envelope.incarnationSequence,
  });
  const previous = record.idempotency[key];
  if (previous) {
    assert(
      previous.hash === hash,
      409,
      "idempotency_conflict",
      "That request identifier was already used for a different action.",
    );
    return;
  }
  assert(
    s.expiresAt > now,
    410,
    "show_expired",
    "This show has expired. Create a fresh stage.",
  );
  assert(
    s.phase !== "ended" ||
      [
        "end",
        "reset",
        "save-preset",
        "load-preset",
        "presence",
        "leave",
      ].includes(action.type),
    409,
    "show_ended",
    "The show has ended. Start a fresh episode to continue.",
  );
  if (
    s.mode === "solo" &&
    !["end", "panic", "hold", "hide", "leave"].includes(action.type) &&
    !(action.type === "consent" && !action.broadcast) &&
    !(action.type === "ready" && !action.ready)
  )
    requireSoloAccess(record, now);
  if (DIRECTOR_ACTIONS.has(action.type)) requireDirector(actor);
  if (action.type === "open-round") {
    assert(
      action.previousRoundId === (s.round?.id ?? null),
      409,
      "round_stale",
      "The audience choice changed before this request arrived. Read the current choice before trying again.",
    );
  } else if (
    [
      "close-round",
      "resolve-round",
      "apply-choice",
      "rehearsal-vote",
      "apply-weather",
    ].includes(action.type)
  ) {
    const roundId = (action as { roundId?: string | null }).roundId;
    assert(
      roundId !== undefined &&
        roundId === (s.round?.id ?? null) &&
        (action.type === "apply-weather" || typeof roundId === "string"),
      409,
      "round_stale",
      "This request belongs to an earlier audience choice. Read the current choice before trying again.",
    );
  }
  if (
    actor.role === "director" &&
    !["panic", "hold", "end", "hide", "leave"].includes(action.type) &&
    !(action.type === "consent" && !action.broadcast) &&
    !(action.type === "ready" && !action.ready)
  )
    requireLease(
      record,
      envelope.rendererId,
      envelope.epoch,
      now,
      envelope.incarnationId,
      envelope.incarnationSequence,
    );
  if (HANDOFF.has(action.type)) {
    assert(
      envelope.expectedVersion === s.umbrella.version,
      409,
      "stale_prop",
      "The prop changed. Read its current owner before trying again.",
    );
    assert(
      envelope.epoch === s.epoch,
      409,
      "stale_epoch",
      "This action belongs to an older stage. Refresh the current cue.",
    );
  } else if (envelope.epoch !== undefined)
    assert(
      envelope.epoch === s.epoch,
      409,
      "stale_epoch",
      "This action belongs to an older stage. Refresh the current cue.",
    );
  rate(
    record.rates,
    `${actor.id}:${action.type === "anchor" ? "anchor" : action.type === "presence" ? "presence" : "actions"}`,
    action.type === "anchor" ? 180 : action.type === "presence" ? 30 : 100,
    60_000,
    now,
  );
  const who =
    actor.role === "director"
      ? "director"
      : actor.role === "audience"
        ? "audience"
        : actor.slot!;
  let detail: Record<string, string | number | boolean | null> | undefined;
  let summary = "";
  switch (action.type) {
    case "start":
      assert(
        s.phase === "backstage",
        409,
        "already_started",
        "This episode has already started.",
      );
      assert(
        (["A", "B"] as Slot[]).every((slot) => isStageReady(s, slot)),
        409,
        "not_ready",
        "All required performers must consent, be ready, and be admitted before the curtain rises.",
      );
      s.phase = "live";
      s.beat = "overture";
      summary =
        s.mode === "solo"
          ? "The curtain rose on one admitted streamer and the illustrated Audience Room."
          : "The curtain rose on two admitted performers.";
      break;
    case "hold":
      assert(
        s.phase !== "backstage",
        409,
        "not_started",
        "The show is still backstage.",
      );
      s.phase = "hold";
      cancelPendingOffer(
        record,
        "The director held the stage before acceptance.",
        now,
      );
      if (s.round && ["open", "closing"].includes(s.round.status))
        s.round.status = "cancelled";
      summary =
        "The director held the stage; committed prop ownership is preserved.";
      break;
    case "panic":
      s.phase = "hold";
      for (const slot of ["A", "B"] as Slot[])
        hideParticipant(
          record,
          slot,
          now,
          "Emergency curtain cancelled an uncommitted offer.",
        );
      if (s.round && ["open", "closing"].includes(s.round.status))
        s.round.status = "cancelled";
      summary =
        "Emergency curtain closed immediately; performers need readiness and re-admission.";
      break;
    case "resume":
      assert(s.phase === "hold", 409, "not_held", "The stage is not on hold.");
      assert(
        (["A", "B"] as Slot[]).every((slot) => isStageReady(s, slot)),
        409,
        "not_ready",
        "Restore the required performers' readiness and admission before resuming.",
      );
      s.phase = "live";
      summary = "The director resumed the committed scene.";
      break;
    case "end":
      if (s.phase === "ended") break;
      if (record.soloReservation) {
        record.soloReservation.status = "closing";
        if (s.solo) s.solo.status = "closing";
      }
      s.phase = "ended";
      s.beat = "curtain";
      record.outputGeneration =
        (record.outputGeneration ?? record.inviteGeneration) + 1;
      record.inviteGeneration += 1;
      for (const slot of ["A", "B"] as Slot[]) {
        hideParticipant(record, slot, now, "The show ended before acceptance.");
        s.participants[slot].connected = false;
        s.participants[slot].camera = false;
        s.participants[slot].microphone = false;
      }
      if (s.round && ["open", "closing"].includes(s.round.status))
        s.round.status = "cancelled";
      s.twitch.connected = false;
      s.twitch.status = "Show ended.";
      summary = "The show ended; invitations and output grants were revoked.";
      break;
    case "reset": {
      assert(
        s.mode !== "solo" ||
          (s.phase !== "ended" && Boolean(s.solo && s.solo.endsAt > now)),
        409,
        "solo_closed",
        "Create a new solo reservation after this session ends; resetting cannot extend its deadline.",
      );
      assert(
        s.phase === "ended" || s.phase === "hold" || s.phase === "backstage",
        409,
        "hold_first",
        "Hold or end this episode before starting another.",
      );
      s.phase = "backstage";
      s.beat = "overture";
      s.weather = null;
      s.rainStartedAt = null;
      s.round = null;
      s.decisions = {};
      s.presenceEffects = [];
      s.parcel =
        s.episode === "midnight-parcel"
          ? initialParcel(`${s.id}-${s.sequence + 1}`)
          : null;
      record.ballots = {};
      s.umbrella = {
        id: `${s.id}-${propLabel(s)}-${s.sequence + 1}`,
        owner: "A",
        version: 1,
        acceptedTransfers: 0,
        repairPatch: "coral",
        wetness: 0,
        armed: true,
        transfer: null,
      };
      s.creature = {
        id: `${s.id}-pip-${s.sequence + 1}`,
        hatched: false,
        hatchedAt: null,
        mood: s.preset.defaultWeather,
        shelterOwner: "A",
      };
      if (s.mode === "rehearsal" && s.transport !== "livekit")
        for (const slot of ["A", "B"] as Slot[])
          s.participants[slot] = participant(slot, true, now);
      summary =
        "A new episode was explicitly initialized with new prop identities.";
      break;
    }
    case "restore-rehearsal":
      assert(
        s.mode === "rehearsal",
        403,
        "fixture_only",
        "Generated plates are available only in a labeled rehearsal.",
      );
      s.transport = "fixture";
      s.phase = "hold";
      record.outputGeneration ??= record.inviteGeneration;
      record.inviteGeneration += 1;
      delete record.participantSessions.B;
      cancelPendingOffer(
        record,
        "Returning to solo rehearsal cancelled an uncommitted offer.",
        now,
      );
      for (const slot of ["A", "B"] as Slot[])
        s.participants[slot] = participant(slot, true, now);
      summary =
        "Returned to labeled synthetic plates and closed media transport. The committed prop, scene, and saved rules are preserved.";
      break;
    case "consent": {
      const slot = ownSlot(record, actor, action.slot),
        p = s.participants[slot];
      p.consentBroadcast = action.broadcast;
      p.consentRecording = action.recording;
      if (action.name) p.name = action.name;
      if (!action.broadcast)
        hideParticipant(
          record,
          slot,
          now,
          "A performer withdrew broadcast consent before acceptance.",
        );
      summary = `${p.name} ${action.broadcast ? "consented to broadcast; recording permission remains a separate choice" : "withdrew broadcast consent and was hidden"}.`;
      detail = {
        slot,
        broadcast: action.broadcast,
        recording: action.recording,
      };
      break;
    }
    case "presence": {
      const slot = ownSlot(record, actor, action.slot),
        p = s.participants[slot];
      const changed =
        p.connected !== action.connected ||
        p.camera !== action.camera ||
        p.microphone !== action.microphone;
      if (
        !p.connected &&
        action.connected &&
        (s.mode !== "rehearsal" || s.transport === "livekit")
      ) {
        p.ready = false;
        p.admitted = false;
      }
      p.connected = action.connected;
      p.camera = action.connected && action.camera;
      p.microphone = action.connected && action.microphone;
      p.lastSeenAt = now;
      if (!p.connected || !p.camera)
        hideParticipant(
          record,
          slot,
          now,
          "A performer lost media before acceptance.",
        );
      if (!changed) {
        remember(record, key, hash, now);
        return;
      }
      summary = `${p.name}'s media is ${p.connected ? "connected" : "disconnected"}; camera ${p.camera ? "enabled" : "off"}, microphone ${p.microphone ? "enabled" : "muted"}.`;
      detail = {
        slot,
        connected: p.connected,
        camera: p.camera,
        microphone: p.microphone,
      };
      break;
    }
    case "ready": {
      const slot = ownSlot(record, actor, action.slot),
        p = s.participants[slot];
      if (action.ready)
        assert(
          p.joined &&
            p.connected &&
            p.camera &&
            p.consentBroadcast &&
            p.calibrated,
          409,
          "readiness",
          "Consent to broadcast, connect your camera, and calibrate before marking ready.",
        );
      p.ready = action.ready;
      if (!action.ready)
        hideParticipant(
          record,
          slot,
          now,
          "A performer returned backstage before acceptance.",
        );
      summary = `${p.name} is ${p.ready ? "ready backstage; director admission is still separate" : "backstage and off air"}.`;
      break;
    }
    case "admit": {
      assert(
        !isAudienceRoom(s, action.slot),
        403,
        "audience_room_only",
        "The Audience Room is software, not a performer awaiting admission.",
      );
      const p = s.participants[action.slot];
      assert(
        p.ready &&
          p.connected &&
          p.camera &&
          p.consentBroadcast &&
          p.calibrated,
        409,
        "readiness",
        "The performer must consent, connect, calibrate, and mark ready before admission.",
      );
      p.admitted = true;
      summary = `${p.name} was admitted by the director.`;
      break;
    }
    case "hide":
      hideParticipant(
        record,
        action.slot,
        now,
        "The director hid a performer before acceptance.",
      );
      summary = `${s.participants[action.slot].name}'s aperture is closed. Readiness and admission are required again.`;
      break;
    case "calibrate": {
      const slot = ownSlot(record, actor, action.slot),
        p = s.participants[slot];
      p.anchor = action.anchor;
      p.handedness = action.handedness;
      p.calibrated = true;
      summary = `${p.name} calibrated the virtual shelter region. No physical object recognition is used.`;
      break;
    }
    case "anchor": {
      const slot = ownSlot(record, actor, action.slot);
      s.participants[slot].anchor = action.anchor;
      remember(record, key, hash, now);
      s.updatedAt = now;
      return;
    }
    case "arm":
      assert(
        actor.role === "director" || actor.slot === s.umbrella.owner,
        403,
        "prop_owner",
        "Only the prop's holder may arm their cue.",
      );
      s.umbrella.armed = action.armed;
      summary = `The ${propLabel(s)} cue is ${action.armed ? "armed" : "disarmed"}.`;
      break;
    case "offer": {
      active(s);
      assert(
        !s.parcel || s.parcel.stamped,
        409,
        "parcel_stamp",
        "Stamp the parcel before its first crossing.",
      );
      const from = ownSlot(record, actor, action.from),
        to = OTHER_SLOT[from];
      assert(
        s.umbrella.owner === from,
        409,
        "prop_owner",
        "Only the current holder may offer this prop.",
      );
      assert(
        s.umbrella.armed,
        409,
        "not_armed",
        "Arm the prop cue before offering it.",
      );
      assert(
        !s.umbrella.transfer ||
          !["offered", "accepted"].includes(s.umbrella.transfer.status),
        409,
        "transfer_pending",
        "Finish or cancel the current handoff first.",
      );
      assert(
        [from, to].every((slot) => isStageReady(s, slot)),
        409,
        "receiver_unavailable",
        "The required stage participants must be ready before a handoff.",
      );
      if (actor.role !== "audience")
        cancelBoundHandoffRound(
          record,
          s.umbrella.transfer?.id ?? null,
          "A fresh offer replaced the earlier handoff choice. Its recorded ballots remain in the trace.",
          now,
        );
      const id = `${s.id}-transfer-${s.sequence + 1}`;
      s.umbrella.transfer = {
        id,
        from,
        to,
        offeredAt: now,
        expiresAt:
          now +
          (s.mode === "solo" && to === "B"
            ? s.preset.roundSeconds * 1000 + DELIVERY_GRACE_MS + 30_000
            : 20_000),
        status: "offered",
        committedAt: null,
        commitSequence: null,
        arrivedAt: null,
      };
      s.umbrella.version += 1;
      s.beat = "crossing";
      if (s.mode === "solo" && to === "B") openRound(record, "accept", now);
      summary = `${s.participants[from].name} offered the same ${propLabel(s)} to ${s.participants[to].name}. Ownership remains with ${from}.`;
      detail = { transferId: id, from, to };
      break;
    }
    case "accept": {
      active(s);
      const transfer = s.umbrella.transfer,
        slot = ownSlot(record, actor, action.slot);
      assert(
        transfer?.id === action.transferId && transfer.status === "offered",
        409,
        "offer_stale",
        "This offer is no longer waiting for acceptance.",
      );
      assert(
        transfer.expiresAt > now,
        409,
        "offer_expired",
        "The offer expired; its sender still owns the prop.",
      );
      assert(
        slot === transfer.to && s.umbrella.owner === transfer.from,
        403,
        "receiver_only",
        "Only this offer's receiver may accept it.",
      );
      assert(
        [transfer.from, transfer.to].every((slot) => isStageReady(s, slot)),
        409,
        "receiver_unavailable",
        "A performer went backstage before acceptance. Ownership did not change.",
      );
      // This assignment is part of the durable CAS commit. Renderers may animate only its returned snapshot.
      s.umbrella.owner = transfer.to;
      s.umbrella.version += 1;
      if (s.umbrella.acceptedTransfers !== null)
        s.umbrella.acceptedTransfers += 1;
      s.creature.shelterOwner = transfer.to;
      if (s.parcel) s.parcel.damage = Math.min(1, s.parcel.damage + 0.18);
      transfer.status = "accepted";
      transfer.committedAt = now;
      transfer.commitSequence = s.sequence + 1;
      summary = `Acceptance committed owner ${transfer.to} before the crossing animation. ${s.parcel ? "The same parcel tag and accumulated handling marks are retained" : "Patch and wetness are retained"}.`;
      detail = {
        transferId: transfer.id,
        from: transfer.from,
        to: transfer.to,
        wetness: s.umbrella.wetness,
        patch: s.umbrella.repairPatch,
      };
      break;
    }
    case "decline":
    case "cancel-offer": {
      const transfer = s.umbrella.transfer,
        slot = ownSlot(record, actor, action.slot);
      assert(
        transfer?.id === action.transferId && transfer.status === "offered",
        409,
        "offer_stale",
        "This offer can no longer be declined or cancelled.",
      );
      assert(
        slot === (action.type === "decline" ? transfer.to : transfer.from),
        403,
        "offer_role",
        "This handoff action belongs to the other performer.",
      );
      transfer.status = action.type === "decline" ? "declined" : "cancelled";
      s.umbrella.version += 1;
      summary = `The offer was ${transfer.status} before commit. Owner ${s.umbrella.owner} retains the ${propLabel(s)}.`;
      if (actor.role !== "audience")
        cancelBoundHandoffRound(
          record,
          transfer.id,
          "The receiver declined or the sender cancelled this offer. Its unapplied handoff choice is cancelled too.",
          now,
        );
      break;
    }
    case "arrive": {
      const transfer = s.umbrella.transfer;
      assert(
        transfer?.id === action.transferId &&
          ["accepted", "arrived"].includes(transfer.status),
        409,
        "arrival_stale",
        "This arrival does not match a committed transfer.",
      );
      if (transfer.status === "arrived") break;
      transfer.status = "arrived";
      transfer.arrivedAt = now;
      summary = `The renderer acknowledged arrival. Owner ${s.umbrella.owner} was already committed; ownership was not written again.`;
      detail = {
        transferId: transfer.id,
        commitSequence: transfer.commitSequence,
      };
      break;
    }
    case "recall":
      cancelBoundHandoffRound(
        record,
        s.umbrella.transfer?.id ?? null,
        "Director recall replaced the pending handoff choice. Its recorded ballots remain in the trace.",
        now,
      );
      s.umbrella.owner = action.to;
      s.umbrella.version += 1;
      s.umbrella.transfer = null;
      s.creature.shelterOwner = action.to;
      summary = `Director recall committed a new ownership event to ${action.to}; no earlier transfer was rolled back.`;
      break;
    case "open-round":
      active(s);
      openRound(record, action.kind ?? "weather", now);
      break;
    case "close-round":
      closeRound(record, action.fallback, now);
      break;
    case "resolve-round":
      resolveRound(record, action.choice, now);
      break;
    case "apply-choice": {
      active(s);
      const round = s.round;
      assert(
        round?.status === "closed" &&
          round.result &&
          round.source &&
          !round.needsDirectorChoice,
        409,
        "choice_unresolved",
        "Close this choice and resolve any tie before applying it.",
      );
      const kind = round.kind ?? "weather",
        choice = round.result;
      assert(
        kind !== "weather",
        409,
        "weather_cue",
        "Use the weather cue to bring this rain on stage.",
      );
      if (kind === "name") s.preset.creatureName = CREATURE_NAMES[choice]!;
      if (kind === "mood") {
        s.creature.mood = choice === "curious" ? "wild" : "gentle";
        s.preset.creatureCuriosity = choice === "curious" ? 0.95 : 0.2;
      }
      if (kind === "ending")
        s.preset.ending =
          choice === "share" ? "shared-shelter" : "playful-chase";
      if (kind === "contents") {
        assert(
          s.parcel && !s.parcel.opened,
          409,
          "parcel_opened",
          "Choose the contents before opening the parcel.",
        );
        s.parcel.contents = choice as "stars" | "garden";
      }
      if (kind === "parcel-ending") {
        assert(
          s.parcel?.opened,
          409,
          "parcel_closed",
          "Open the parcel before choosing its final home.",
        );
        s.parcel.ending = choice as "deliver" | "keep";
      }
      if (kind === "accept" || kind === "giveback") {
        assert(
          s.mode === "solo" &&
            round.epoch === s.epoch &&
            round.boundPropVersion === s.umbrella.version &&
            round.boundTransferId === (s.umbrella.transfer?.id ?? null),
          409,
          "audience_choice_stale",
          "The prop changed while this audience choice was open. Ask again for its current handoff.",
        );
        if (kind === "accept" || choice === "giveback") {
          const handoff: ShowAction =
            kind === "accept"
              ? {
                  type: choice === "accept" ? "accept" : "decline",
                  transferId: s.umbrella.transfer!.id,
                  slot: "B",
                }
              : { type: "offer", from: "B" };
          applyAction(
            record,
            {
              id: `audience:${round.id}`,
              role: "audience",
              slot: "B",
              roundId: round.id,
            },
            {
              action: handoff,
              idempotencyKey: `audience-${round.id}`,
              expectedVersion: s.umbrella.version,
              epoch: s.epoch,
            },
            now,
          );
        }
      }
      rememberDecision(record, now);
      summary = `${round.source === "audience" ? "Twitch audience" : round.source === "rehearsal" ? "Labeled rehearsal choice" : "Director's choice"} applied ${kind}: ${choice}.`;
      detail = { roundId: round.id, kind, choice, source: round.source };
      break;
    }
    case "rehearsal-effect":
      presenceEffect(
        record,
        "fixture",
        `fixture:${envelope.idempotencyKey}`,
        action.effect,
        now,
        now,
        true,
      );
      break;
    case "rehearsal-vote":
      assert(
        s.mode === "rehearsal",
        403,
        "fixture_only",
        "Test ballots cannot enter a live Twitch show.",
      );
      castVote(
        record,
        `fixture:${action.voter}`,
        `fixture:${envelope.idempotencyKey}`,
        action.choice,
        now,
        now,
        true,
      );
      break;
    case "apply-weather": {
      active(s);
      assert(
        action.weather ||
          (s.round?.status === "closed" &&
            (s.round.kind ?? "weather") === "weather" &&
            s.round.result &&
            !s.round.needsDirectorChoice),
        409,
        "round_open",
        "Close the audience round before applying its weather.",
      );
      const weather = action.weather ?? (s.round!.result as Weather);
      assert(
        s.episode !== "midnight-parcel",
        409,
        "episode_cue",
        "Midnight Parcel uses contents, stamps and delivery cues.",
      );
      if (action.weather) {
        if (s.round && (s.round.kind ?? "weather") === "weather") {
          s.round.status = "applied";
          s.round.result = weather;
          s.round.source = "director";
        }
        s.decisions.weather = {
          choice: weather,
          source: "director",
          voters: 0,
          contributors: [],
          at: now,
          roundId: `director-weather-${s.sequence + 1}`,
        };
        summary = `Director's choice: ${weather} weather. ${weather === "gentle" ? "Soft rain will hatch a shy shelter-seeker" : "Heavy rain will hatch an energetic umbrella-chaser"}.`;
      } else {
        rememberDecision(record, now);
        summary = `${s.round!.source === "audience" ? "Twitch audience" : s.round!.source === "rehearsal" ? "Labeled rehearsal ballot" : "Director's choice"}: ${weather} weather is now on stage.`;
      }
      s.weather = weather;
      s.rainStartedAt = now;
      s.creature.mood = weather;
      s.beat = "weather";
      s.umbrella.wetness = Math.min(
        1,
        s.umbrella.wetness +
          (weather === "gentle" ? 0.45 : 0.8) * s.preset.rainIntensity,
      );
      s.umbrella.version += 1;
      detail = {
        weather,
        source: action.weather ? "director" : s.round!.source,
        roundId: s.round?.id ?? null,
      };
      break;
    }
    case "hatch":
      active(s);
      assert(
        s.episode !== "midnight-parcel",
        409,
        "episode_cue",
        "Open the parcel to reveal its contents.",
      );
      assert(
        s.weather && s.umbrella.wetness > 0,
        409,
        "no_runoff",
        "Choose the weather first; the creature hatches from the umbrella's runoff.",
      );
      assert(
        !s.creature.hatched,
        409,
        "already_hatched",
        "This episode's creature has already hatched.",
      );
      s.creature.hatched = true;
      s.creature.hatchedAt = now;
      s.creature.shelterOwner = s.umbrella.owner;
      s.beat = "hatching";
      summary = `${s.preset.creatureName} hatched from the same umbrella's runoff with ${s.creature.mood} behavior.`;
      detail = { creatureId: s.creature.id, weather: s.creature.mood };
      break;
    case "shelter":
      active(s);
      assert(
        s.creature.hatched,
        409,
        "not_hatched",
        "Hatch the creature before the ending cue.",
      );
      s.beat = "shelter";
      s.creature.shelterOwner = s.umbrella.owner;
      summary =
        s.preset.ending === "shared-shelter"
          ? `${s.preset.creatureName} found the same umbrella. The performers can share the shelter.`
          : `${s.preset.creatureName} invites one last playful chase after the same umbrella.`;
      break;
    case "stamp-parcel":
      active(s);
      assert(
        s.parcel &&
          s.parcel.contents &&
          !s.parcel.stamped &&
          s.umbrella.owner === "A",
        409,
        "parcel_stamp",
        "Choose the contents, then stamp the unopened parcel in the sender's room.",
      );
      s.parcel.stamped = true;
      s.parcel.damage = 0.12;
      s.umbrella.version += 1;
      s.beat = "sorting";
      summary = `Parcel ${s.parcel.tag} received its persistent stamp and first handling mark.`;
      break;
    case "open-parcel":
      active(s);
      assert(
        s.parcel?.stamped &&
          s.parcel.contents &&
          !s.parcel.opened &&
          s.umbrella.owner === "B" &&
          s.umbrella.transfer?.status === "arrived",
        409,
        "parcel_unavailable",
        "The stamped parcel must arrive in the receiving room before it can open.",
      );
      s.parcel.opened = true;
      s.parcel.openedAt = now;
      s.parcel.transformedRoom = "B";
      s.umbrella.version += 1;
      s.beat = "unpacking";
      summary = `The same parcel ${s.parcel.tag} opened into ${s.parcel.contents === "stars" ? "a constellation" : "a midnight garden"} in room B.`;
      break;
    case "finish-parcel":
      active(s);
      assert(
        s.parcel?.opened &&
          s.parcel.ending &&
          s.umbrella.owner === "A" &&
          s.umbrella.transfer?.status === "arrived",
        409,
        "parcel_return",
        "Return the same parcel and choose the gift's final home before the ending.",
      );
      s.parcel.transformedRoom = s.parcel.ending === "deliver" ? "B" : "A";
      s.beat = "delivery";
      summary = `Parcel ${s.parcel.tag} returned with its handling marks. Its ${s.parcel.contents} now belongs to room ${s.parcel.transformedRoom}.`;
      break;
    case "save-preset":
      assert(
        s.savedPresets.some((p) => p.id === action.preset.id) ||
          s.savedPresets.length < 10,
        409,
        "preset_capacity",
        "This show already has ten saved variations.",
      );
      s.savedPresets = [
        ...s.savedPresets.filter((p) => p.id !== action.preset.id),
        { ...action.preset },
      ];
      summary = `Saved the authored variation “${action.preset.name}”. Saving a preset does not record media.`;
      break;
    case "load-preset": {
      assert(
        !s.umbrella.transfer ||
          !["offered", "accepted"].includes(s.umbrella.transfer.status),
        409,
        "finish_transfer",
        "Finish the handoff before changing the episode preset.",
      );
      assert(
        !s.round || !["open", "closing"].includes(s.round.status),
        409,
        "round_open",
        "Close the weather window before changing its rules.",
      );
      const preset = s.savedPresets.find((p) => p.id === action.presetId);
      assert(
        preset,
        404,
        "preset_not_found",
        "That variation has not been saved.",
      );
      assert(
        (preset.episode ?? "borrowed-weather") === s.episode,
        409,
        "episode_preset",
        "Create a new show to change episodes; this variation belongs to another show grammar.",
      );
      s.preset = { ...preset };
      s.title = preset.episodeTitle;
      summary = `Loaded “${preset.name}”; its rain, creature, crossing, and ending rules are active.`;
      break;
    }
    case "leave": {
      const slot = ownSlot(record, actor, action.slot),
        p = s.participants[slot];
      hideParticipant(record, slot, now, "A performer left before acceptance.");
      p.connected = false;
      p.camera = false;
      p.microphone = false;
      p.lastSeenAt = now;
      summary = `${p.name} left the stage. The committed ${propLabel(s)} owner is preserved.`;
      break;
    }
    default:
      throw new HttpError(400, "unknown_action", "Unknown stage action.");
  }
  if (summary)
    recordEvent(record, `action.${action.type}`, who, summary, now, detail);
  remember(record, key, hash, now);
}
