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
} from "@/lib/contracts";
import { assert, HttpError } from "./errors";
import type { Actor, RateBucket, ShowRecord } from "./records";
import { hashData } from "./security";

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
      ? `Test plate ${slot}`
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
export function createRecord(
  id: string,
  ownerId: string,
  mode: ShowMode,
  now: number,
  channel: string | null = null,
): ShowRecord {
  const rehearsal = mode === "rehearsal";
  const state: ShowState = {
    id,
    mode,
    transport: rehearsal ? "fixture" : "livekit",
    title: "Borrowed Weather",
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
      B: participant("B", rehearsal, now),
    },
    umbrella: {
      id: `${id}-umbrella-1`,
      owner: "A",
      version: 1,
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
    preset: { ...DEFAULT_PRESET },
    savedPresets: [{ ...DEFAULT_PRESET }],
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
    twitchSessionId: null,
  };
  recordEvent(
    record,
    "show.created",
    "director",
    rehearsal
      ? "Labeled solo rehearsal created with synthetic test plates."
      : "Private show created; performers enter backstage before admission.",
    now,
  );
  return record;
}
export function recordEvent(
  record: ShowRecord,
  type: string,
  actor: "director" | Slot | "twitch" | "system",
  summary: string,
  now: number,
  detail?: Record<string, string | number | boolean | null>,
) {
  const s = record.state;
  s.sequence += 1;
  s.updatedAt = now;
  s.events.push({
    id: `${s.id}:${s.sequence}`,
    sequence: s.sequence,
    at: now,
    type,
    actor,
    summary,
    propId: s.umbrella.id,
    propVersion: s.umbrella.version,
    owner: s.umbrella.owner,
    ...(detail ? { detail } : {}),
  });
  if (s.events.length > 2000) s.events.splice(0, s.events.length - 2000);
}
export function rate(
  buckets: Record<string, RateBucket>,
  key: string,
  max: number,
  windowMs: number,
  now = Date.now(),
) {
  let bucket = buckets[key];
  if (!bucket || now - bucket.at >= windowMs)
    bucket = buckets[key] = { at: now, count: 0 };
  assert(
    bucket.count < max,
    429,
    "rate_limit",
    "This control is moving too quickly. Wait a moment and retry.",
  );
  bucket.count += 1;
  if (Object.keys(buckets).length > 200)
    for (const [id, value] of Object.entries(buckets))
      if (now - value.at > 3600_000) delete buckets[id];
}
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
) {
  const lease = record.state.renderLease;
  assert(
    rendererId &&
      rendererId === lease.clientId &&
      epoch === lease.epoch &&
      epoch === record.state.epoch &&
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
) {
  assert(
    /^[a-zA-Z0-9_-]{8,128}$/.test(clientId),
    400,
    "renderer_id",
    "A valid director tab identifier is required.",
  );
  const s = record.state,
    previous = s.renderLease;
  if (previous.clientId === clientId && previous.expiresAt > now) {
    restoreFixtureReadiness(record, now);
    previous.expiresAt = now + LEASE_MS;
    return;
  }
  assert(
    !previous.clientId || previous.expiresAt <= now || takeover,
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
    for (const p of Object.values(s.participants)) {
      p.ready = false;
      p.admitted = false;
    }
  }
  restoreFixtureReadiness(record, now);
  s.renderLease = { clientId, epoch: s.epoch, expiresAt: now + LEASE_MS };
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
function cancelPendingOffer(record: ShowRecord, reason: string, now: number) {
  const transfer = record.state.umbrella.transfer;
  if (transfer?.status === "offered") {
    transfer.status = "cancelled";
    record.state.umbrella.version += 1;
    recordEvent(record, "transfer.cancelled", "system", reason, now, {
      transferId: transfer.id,
    });
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
  }
  if (s.round?.status === "open" && s.round.closesAt <= now)
    closeRound(record, s.preset.defaultWeather, now);
  if (s.mode === "live" || s.transport === "livekit") {
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
    if (s.round?.status === "open") s.round.status = "cancelled";
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
    (s.umbrella.transfer?.status === "offered" &&
      s.umbrella.transfer.expiresAt <= now) ||
    (s.round?.status === "open" && s.round.closesAt <= now) ||
    ((s.mode === "live" || s.transport === "livekit") &&
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
function closeRound(record: ShowRecord, fallback: Weather, now: number) {
  const round = record.state.round;
  assert(
    round?.status === "open",
    409,
    "round_closed",
    "There is no open weather choice to close.",
  );
  round.status = "closed";
  round.closedAt = now;
  const { gentle, wild } = round.tallies;
  round.result = gentle === wild ? fallback : gentle > wild ? "gentle" : "wild";
  round.source =
    round.uniqueVoters === 0 || gentle === wild
      ? "director"
      : record.state.mode === "rehearsal"
        ? "rehearsal"
        : "audience";
  recordEvent(
    record,
    "round.closed",
    "director",
    `${round.source === "director" ? "Director's choice" : round.source === "rehearsal" ? "Rehearsal ballots chose" : "Twitch audience chose"}: ${round.result}.`,
    now,
    {
      roundId: round.id,
      voters: round.uniqueVoters,
      gentle,
      wild,
      source: round.source,
    },
  );
}
export function castVote(
  record: ShowRecord,
  voter: string,
  messageId: string,
  choice: Weather,
  sentAt: number,
  now: number,
  synthetic: boolean,
) {
  const s = record.state,
    round = s.round;
  assert(
    round?.status === "open" &&
      now < round.closesAt &&
      sentAt >= round.openedAt &&
      sentAt < round.closesAt,
    409,
    "vote_window",
    "That command is outside the open round. Join the next weather choice.",
  );
  assert(
    s.phase === "live",
    409,
    "stage_held",
    "Audience choices are paused while the stage is held.",
  );
  assert(
    synthetic
      ? s.mode === "rehearsal"
      : s.mode === "live" && s.twitch.connected,
    409,
    "vote_source",
    "This vote source is not eligible for the current show.",
  );
  if (record.messageIds.includes(messageId)) return;
  assert(
    record.messageIds.length < 5000,
    409,
    "vote_capacity",
    "This show's audience event budget is full. Start a fresh show.",
  );
  assert(
    record.ballots[voter] || Object.keys(record.ballots).length < 2000,
    409,
    "round_capacity",
    "This round has reached its participant limit.",
  );
  record.messageIds.push(messageId);
  const previous = record.ballots[voter];
  if (previous) round.tallies[previous] -= 1;
  else round.uniqueVoters += 1;
  record.ballots[voter] = choice;
  round.tallies[choice] += 1;
  round.lastMessageAt = now;
  if (!synthetic) s.twitch.lastEventAt = now;
  recordEvent(
    record,
    "round.vote",
    synthetic ? "director" : "twitch",
    `${synthetic ? "A labeled test ballot" : "A Twitch account"} ${previous ? "replaced its choice with" : "chose"} ${choice}.`,
    now,
    {
      roundId: round.id,
      choice,
      replaced: Boolean(previous),
      messageRef: messageId.slice(0, 16),
      synthetic,
    },
  );
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
  const action = envelope.action,
    s = record.state;
  const key = `${actor.id}:${envelope.idempotencyKey}`;
  const hash = hashData({
    action,
    expectedVersion: envelope.expectedVersion,
    epoch: envelope.epoch,
    rendererId: envelope.rendererId,
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
      ["reset", "save-preset", "load-preset", "presence", "leave"].includes(
        action.type,
      ),
    409,
    "show_ended",
    "The show has ended. Start a fresh episode to continue.",
  );
  if (DIRECTOR_ACTIONS.has(action.type)) requireDirector(actor);
  if (
    (s.mode === "live" || s.transport === "livekit") &&
    actor.role === "director" &&
    !["panic", "hold", "end", "hide", "consent", "leave"].includes(action.type)
  )
    requireLease(record, envelope.rendererId, envelope.epoch, now);
  if (HANDOFF.has(action.type)) {
    assert(
      envelope.expectedVersion === s.umbrella.version,
      409,
      "stale_prop",
      "The umbrella changed. Read its current owner before trying again.",
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
  const who = actor.role === "director" ? "director" : actor.slot!;
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
        Object.values(s.participants).every(
          (p) =>
            p.ready &&
            p.admitted &&
            p.consentBroadcast &&
            p.connected &&
            p.camera,
        ),
        409,
        "not_ready",
        "Both performers must consent, be ready, and be admitted before the curtain rises.",
      );
      s.phase = "live";
      s.beat = "overture";
      summary = "The curtain rose on two admitted performers.";
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
      if (s.round?.status === "open") s.round.status = "cancelled";
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
      if (s.round?.status === "open") s.round.status = "cancelled";
      summary =
        "Emergency curtain closed immediately; performers need readiness and re-admission.";
      break;
    case "resume":
      assert(s.phase === "hold", 409, "not_held", "The stage is not on hold.");
      assert(
        Object.values(s.participants).every(
          (p) =>
            p.ready &&
            p.admitted &&
            p.connected &&
            p.consentBroadcast &&
            p.camera,
        ),
        409,
        "not_ready",
        "Restore both performers' readiness and admission before resuming.",
      );
      s.phase = "live";
      summary = "The director resumed the committed scene.";
      break;
    case "end":
      s.phase = "ended";
      s.beat = "curtain";
      record.inviteGeneration += 1;
      for (const slot of ["A", "B"] as Slot[]) {
        hideParticipant(record, slot, now, "The show ended before acceptance.");
        s.participants[slot].connected = false;
        s.participants[slot].camera = false;
        s.participants[slot].microphone = false;
      }
      if (s.round?.status === "open") s.round.status = "cancelled";
      s.twitch.connected = false;
      s.twitch.status = "Show ended.";
      summary = "The show ended; invitations and output grants were revoked.";
      break;
    case "reset": {
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
      record.ballots = {};
      s.umbrella = {
        id: `${s.id}-umbrella-${s.sequence + 1}`,
        owner: "A",
        version: 1,
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
        "Returned to labeled synthetic plates and closed media transport. The umbrella, creature, and saved rules are preserved.";
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
        (s.mode === "live" || s.transport === "livekit")
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
        "Only the umbrella's holder may arm their cue.",
      );
      s.umbrella.armed = action.armed;
      summary = `The umbrella cue is ${action.armed ? "armed" : "disarmed"}.`;
      break;
    case "offer": {
      active(s);
      const from = ownSlot(record, actor, action.from),
        to = OTHER_SLOT[from];
      assert(
        s.umbrella.owner === from,
        409,
        "prop_owner",
        "Only the current holder may offer this umbrella.",
      );
      assert(
        s.umbrella.armed,
        409,
        "not_armed",
        "Arm the umbrella cue before offering it.",
      );
      assert(
        !s.umbrella.transfer ||
          !["offered", "accepted"].includes(s.umbrella.transfer.status),
        409,
        "transfer_pending",
        "Finish or cancel the current handoff first.",
      );
      assert(
        [from, to].every((slot) => {
          const p = s.participants[slot];
          return (
            p.ready &&
            p.admitted &&
            p.connected &&
            p.camera &&
            p.consentBroadcast
          );
        }),
        409,
        "receiver_unavailable",
        "Both performers must be ready and on stage before a handoff.",
      );
      const id = `${s.id}-transfer-${s.sequence + 1}`;
      s.umbrella.transfer = {
        id,
        from,
        to,
        offeredAt: now,
        expiresAt: now + 20_000,
        status: "offered",
        committedAt: null,
        commitSequence: null,
        arrivedAt: null,
      };
      s.umbrella.version += 1;
      s.beat = "crossing";
      summary = `${s.participants[from].name} offered the same umbrella to ${s.participants[to].name}. Ownership remains with ${from}.`;
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
        "The offer expired; its sender still owns the umbrella.",
      );
      assert(
        slot === transfer.to && s.umbrella.owner === transfer.from,
        403,
        "receiver_only",
        "Only this offer's receiver may accept it.",
      );
      assert(
        [transfer.from, transfer.to].every((key) => {
          const p = s.participants[key];
          return (
            p.connected &&
            p.ready &&
            p.admitted &&
            p.camera &&
            p.consentBroadcast
          );
        }),
        409,
        "receiver_unavailable",
        "A performer went backstage before acceptance. Ownership did not change.",
      );
      // This assignment is part of the durable CAS commit. Renderers may animate only its returned snapshot.
      s.umbrella.owner = transfer.to;
      s.umbrella.version += 1;
      s.creature.shelterOwner = transfer.to;
      transfer.status = "accepted";
      transfer.committedAt = now;
      transfer.commitSequence = s.sequence + 1;
      summary = `Acceptance committed owner ${transfer.to} before the crossing animation. Patch and wetness are retained.`;
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
      summary = `The offer was ${transfer.status} before commit. Owner ${s.umbrella.owner} retains the umbrella.`;
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
      s.umbrella.owner = action.to;
      s.umbrella.version += 1;
      s.umbrella.transfer = null;
      s.creature.shelterOwner = action.to;
      summary = `Director recall committed a new ownership event to ${action.to}; no earlier transfer was rolled back.`;
      break;
    case "open-round":
      active(s);
      assert(
        s.mode === "rehearsal" || s.twitch.connected,
        409,
        "chat_offline",
        "Connect Twitch chat before opening an audience round. A director weather cue remains available.",
      );
      assert(
        s.round?.status !== "open",
        409,
        "round_open",
        "A weather choice is already open.",
      );
      s.round = {
        id: `${s.id}-round-${s.sequence + 1}`,
        status: "open",
        openedAt: now,
        closesAt: now + s.preset.roundSeconds * 1000,
        closedAt: null,
        tallies: { gentle: 0, wild: 0 },
        uniqueVoters: 0,
        result: null,
        source: null,
        lastMessageAt: null,
      };
      record.ballots = {};
      s.beat = "weather";
      summary =
        "The weather window opened: !gentle or !wild. Each account has one replaceable choice.";
      break;
    case "close-round":
      closeRound(record, action.fallback ?? s.preset.defaultWeather, now);
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
        action.weather || s.round?.status === "closed",
        409,
        "round_open",
        "Close the audience round before applying its weather.",
      );
      const weather = action.weather ?? s.round!.result!;
      if (action.weather) {
        if (s.round) {
          s.round.status = "applied";
          s.round.result = weather;
          s.round.source = "director";
        }
        summary = `Director's choice: ${weather} weather. ${weather === "gentle" ? "Soft rain will hatch a shy shelter-seeker" : "Heavy rain will hatch an energetic umbrella-chaser"}.`;
      } else {
        s.round!.status = "applied";
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
        s.round?.status !== "open",
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
      summary = `${p.name} left the stage. Any already committed umbrella owner is preserved.`;
      break;
    }
    default:
      throw new HttpError(400, "unknown_action", "Unknown stage action.");
  }
  if (summary)
    recordEvent(record, `action.${action.type}`, who, summary, now, detail);
  remember(record, key, hash, now);
}
