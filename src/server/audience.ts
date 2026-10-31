import type {
  AudienceChoice,
  PresenceEffect,
  RoundKind,
} from "@/lib/contracts";
import {
  choicesFor,
  DELIVERY_GRACE_MS,
  isChoiceFor,
  ROUND_DEFINITIONS,
} from "@/lib/show-grammar";
import { assert } from "./errors";
import type { ShowRecord } from "./records";
import { recordEvent } from "./protocol-events";

export function safeContributor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .slice(0, 25);
  return name || null;
}
export function eventOrder(timestamp: string, messageId: string): string {
  const ms = Date.parse(timestamp);
  const fraction = /\.(\d{1,9})(?:Z|[+-]\d\d:\d\d)$/.exec(timestamp)?.[1] ?? "";
  return `${Math.floor(ms / 1000)
    .toString()
    .padStart(13, "0")}:${fraction.padEnd(9, "0")}:${messageId}`;
}
export function openRound(record: ShowRecord, kind: RoundKind, now: number) {
  const s = record.state;
  assert(
    !s.round || !["open", "closing"].includes(s.round.status),
    409,
    "round_open",
    "Finish the current audience choice before opening another.",
  );
  assert(
    s.mode === "rehearsal" || s.twitch.connected,
    409,
    "chat_offline",
    "Connect Twitch chat before opening an audience choice.",
  );
  assert(
    !["accept", "giveback"].includes(kind) || s.mode === "solo",
    403,
    "audience_room_only",
    "Performer handoffs are accepted by their real receiver. Audience Room choices belong to solo shows.",
  );
  assert(
    !["contents", "parcel-ending"].includes(kind) ||
      s.episode === "midnight-parcel",
    409,
    "episode_choice",
    "This choice belongs to Midnight Parcel.",
  );
  assert(
    s.episode !== "midnight-parcel" ||
      ["contents", "parcel-ending", "accept", "giveback"].includes(kind),
    409,
    "episode_choice",
    "Midnight Parcel has contents, handoff and delivery choices.",
  );
  if (kind === "accept")
    assert(
      s.umbrella.transfer?.status === "offered" &&
        s.umbrella.transfer.to === "B",
      409,
      "offer_stale",
      "Offer the prop to the Audience Room first.",
    );
  if (kind === "giveback")
    assert(
      s.umbrella.owner === "B" &&
        !["accepted", "offered"].includes(s.umbrella.transfer?.status ?? ""),
      409,
      "prop_owner",
      "The Audience Room must be holding the arrived prop before a return choice.",
    );
  s.round = {
    id: `${s.id}-round-${s.sequence + 1}`,
    kind,
    status: "open",
    openedAt: now,
    closesAt: now + s.preset.roundSeconds * 1000,
    closedAt: null,
    tallies: Object.fromEntries(choicesFor(kind).map((choice) => [choice, 0])),
    uniqueVoters: 0,
    result: null,
    source: null,
    lastMessageAt: null,
    contributors: [],
    needsDirectorChoice: false,
    epoch: s.epoch,
    boundPropVersion: s.umbrella.version,
    boundTransferId: s.umbrella.transfer?.id ?? null,
  };
  record.ballots = {};
  recordEvent(
    record,
    "round.opened",
    "director",
    `${ROUND_DEFINITIONS[kind].question} One replaceable choice per Twitch account.`,
    now,
    { roundId: s.round.id, kind },
  );
}
export function finalizeRound(record: ShowRecord, now: number) {
  const round = record.state.round;
  assert(
    round && ["open", "closing"].includes(round.status),
    409,
    "round_closed",
    "There is no audience choice to close.",
  );
  const entries = choicesFor(round.kind ?? "weather").map((choice) => ({
    choice,
    votes: round.tallies[choice] ?? 0,
  }));
  const max = Math.max(...entries.map((entry) => entry.votes));
  const winners = entries.filter((entry) => entry.votes === max);
  const fallback = max === 0 || winners.length !== 1;
  round.status = "closed";
  round.closedAt = now;
  round.needsDirectorChoice = fallback && !round.fallbackChoice;
  round.result = fallback ? (round.fallbackChoice ?? null) : winners[0].choice;
  round.source = fallback
    ? round.result
      ? "director"
      : null
    : record.state.mode === "rehearsal"
      ? "rehearsal"
      : "audience";
  recordEvent(
    record,
    "round.closed",
    "system",
    round.result
      ? `${round.source === "director" ? "Director's choice" : round.source === "rehearsal" ? "Labeled rehearsal ballots chose" : "Twitch audience chose"}: ${round.result}.`
      : "The choice ended without a unique audience winner. An explicit director choice is required.",
    now,
    {
      roundId: round.id,
      kind: round.kind ?? "weather",
      voters: round.uniqueVoters,
      result: round.result,
      source: round.source,
      needsDirectorChoice: Boolean(round.needsDirectorChoice),
    },
  );
}
export function closeRound(
  record: ShowRecord,
  fallback: AudienceChoice | undefined,
  now: number,
) {
  const round = record.state.round;
  assert(
    round?.status === "open",
    409,
    "round_closed",
    "There is no open audience choice to close.",
  );
  if (fallback) {
    assert(
      isChoiceFor(round.kind ?? "weather", fallback),
      400,
      "choice_invalid",
      "Choose one of this round's authored options.",
    );
    round.fallbackChoice = fallback;
  }
  round.closesAt = Math.min(round.closesAt, now);
  if (record.state.mode === "rehearsal") return finalizeRound(record, now);
  round.status = "closing";
  round.graceEndsAt = round.closesAt + DELIVERY_GRACE_MS;
  recordEvent(
    record,
    "round.closing",
    "director",
    "Voting has closed. Messages sent inside the window have a three-second delivery grace period.",
    now,
    { roundId: round.id },
  );
  if (now >= round.graceEndsAt) finalizeRound(record, now);
}
export function resolveRound(
  record: ShowRecord,
  choice: AudienceChoice,
  now: number,
) {
  const round = record.state.round;
  assert(
    round?.status === "closed" && round.needsDirectorChoice && !round.result,
    409,
    "choice_resolved",
    "Only an unresolved tie or empty round needs a director choice.",
  );
  assert(
    isChoiceFor(round.kind ?? "weather", choice),
    400,
    "choice_invalid",
    "Choose one of this round's authored options.",
  );
  round.result = choice;
  round.source = "director";
  round.needsDirectorChoice = false;
  recordEvent(
    record,
    "round.resolved",
    "director",
    `Director's choice: ${choice}. No audience winner is claimed.`,
    now,
    { roundId: round.id, choice },
  );
}
export function rememberDecision(record: ShowRecord, now: number) {
  const round = record.state.round!;
  assert(
    round.status === "closed" &&
      round.result &&
      round.source &&
      !round.needsDirectorChoice,
    409,
    "choice_unresolved",
    "Close the round and resolve any tie before applying this choice.",
  );
  (record.state.decisions ??= {})[round.kind ?? "weather"] = {
    choice: round.result,
    source: round.source,
    voters: round.uniqueVoters,
    contributors:
      round.source === "audience" ? (round.contributors ?? []).slice(0, 3) : [],
    at: now,
    roundId: round.id,
  };
  round.status = "applied";
}
export function castVote(
  record: ShowRecord,
  voter: string,
  messageId: string,
  choice: AudienceChoice,
  sentAt: number,
  now: number,
  synthetic: boolean,
  contributor?: string | null,
  order = `${String(sentAt).padStart(16, "0")}:${messageId}`,
) {
  const s = record.state,
    round = s.round;
  const deadline = round
    ? round.closesAt + (synthetic ? 0 : DELIVERY_GRACE_MS)
    : 0;
  assert(
    round &&
      ["open", "closing"].includes(round.status) &&
      now < deadline &&
      sentAt >= round.openedAt &&
      sentAt <= round.closesAt,
    409,
    "vote_window",
    "That command is outside the current choice's voting or delivery window.",
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
      : s.mode !== "rehearsal" && s.twitch.connected,
    409,
    "vote_source",
    "This vote source is not eligible for the current show.",
  );
  assert(
    isChoiceFor(round.kind ?? "weather", choice),
    409,
    "choice_inactive",
    "That command belongs to another audience choice.",
  );
  if (record.messageIds.includes(messageId)) return false;
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
  if (previous && typeof previous !== "string" && previous.order >= order)
    return false;
  const previousChoice =
    typeof previous === "string" ? previous : previous?.choice;
  if (previousChoice)
    round.tallies[previousChoice] = Math.max(
      0,
      (round.tallies[previousChoice] ?? 0) - 1,
    );
  else round.uniqueVoters += 1;
  record.ballots[voter] = {
    choice,
    sentAt,
    order,
    contributor: synthetic ? null : safeContributor(contributor),
  };
  round.tallies[choice] = (round.tallies[choice] ?? 0) + 1;
  round.lastMessageAt = now;
  round.contributors = [
    ...new Set(
      Object.values(record.ballots).flatMap((ballot) =>
        typeof ballot !== "string" && ballot.contributor
          ? [ballot.contributor]
          : [],
      ),
    ),
  ].slice(0, 3);
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
      sentAt,
    },
  );
  return true;
}
export function presenceEffect(
  record: ShowRecord,
  voter: string,
  messageId: string,
  effect: PresenceEffect,
  sentAt: number,
  now: number,
  synthetic: boolean,
  contributor?: string | null,
  order = `${String(sentAt).padStart(16, "0")}:${messageId}`,
) {
  const s = record.state;
  assert(
    s.phase === "live" &&
      (synthetic
        ? s.mode === "rehearsal"
        : s.mode !== "rehearsal" && s.twitch.connected),
    409,
    "effect_source",
    "Audience presence is paused outside a live scene.",
  );
  if (
    now - sentAt > 5000 ||
    sentAt > now + 1000 ||
    record.messageIds.includes(messageId) ||
    (record.presenceOrder && order <= record.presenceOrder)
  )
    return false;
  const buckets = (record.presenceRates ??= {});
  for (const [key, at] of Object.entries(buckets))
    if (now - at >= 3000) delete buckets[key];
  s.presenceEffects = (s.presenceEffects ?? []).filter(
    (entry) => now - entry.at < 5000,
  );
  if (
    buckets[voter] ||
    Object.keys(buckets).length >= 15 ||
    s.presenceEffects.filter((entry) => now - entry.at < 1000).length >= 5 ||
    record.messageIds.length >= 5000
  )
    return false;
  buckets[voter] = now;
  record.presenceOrder = order;
  record.messageIds.push(messageId);
  s.presenceEffects.push({
    id: messageId.slice(0, 24),
    effect,
    at: now,
    contributor: synthetic ? null : safeContributor(contributor),
  });
  s.presenceEffects = s.presenceEffects.slice(-24);
  if (!synthetic) s.twitch.lastEventAt = now;
  recordEvent(
    record,
    "audience.presence",
    synthetic ? "director" : "twitch",
    `${synthetic ? "Labeled rehearsal effect" : "Audience presence"}: ${effect}.`,
    now,
    { effect, synthetic, sentAt },
  );
  return true;
}
