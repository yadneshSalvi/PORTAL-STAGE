import { describe, expect, it } from "vitest";
import type {
  AudienceChoice,
  EpisodeId,
  RoundKind,
  ShowAction,
  ShowMode,
} from "@/lib/contracts";
import {
  acquireLease,
  applyAction,
  createRecord,
  expireState,
} from "@/server/core";
import type { Actor } from "@/server/records";
import { nextCue } from "./cue-flow";

const director: Actor = { id: "ui-director", role: "director", slot: "A" };
function theater(mode: ShowMode, episode: EpisodeId) {
  let now = 1_800_000_000_000,
    key = 0;
  const record = createRecord(
    `ps_ui_${mode}_${episode}`,
    director.id,
    mode,
    now,
    null,
    episode,
  );
  if (mode === "solo") {
    Object.assign(record.state.participants.A, {
      joined: true,
      connected: true,
      camera: true,
      consentBroadcast: true,
      calibrated: true,
      ready: true,
      admitted: true,
      lastSeenAt: now,
    });
    record.state.twitch.connected = true;
    record.state.twitch.lastHeartbeatAt = now;
    record.state.solo = { endsAt: now + 30 * 60_000, status: "scheduled" };
    record.soloReservation = {
      id: "unit-reservation",
      account: "unit-account",
      createdAt: now,
      expiresAt: record.state.solo.endsAt,
      generation: 1,
      status: "scheduled",
      issued: [],
      runId: "unit-closure-run",
    };
  }
  acquireLease(record, "renderer-ui-tests", false, now, {
    id: "mount-ui-tests",
    sequence: 1,
  });
  const run = (action: ShowAction) => {
    now += 100;
    expireState(record, now);
    applyAction(
      record,
      director,
      {
        action,
        idempotencyKey: `ui-action-${++key}`,
        epoch: record.state.epoch,
        expectedVersion: record.state.umbrella.version,
        rendererId: "renderer-ui-tests",
        incarnationId: "mount-ui-tests",
        incarnationSequence: 1,
      },
      now,
    );
  };
  return {
    record,
    run,
    get now() {
      return now;
    },
    renew() {
      acquireLease(record, "renderer-ui-tests", false, now, {
        id: "mount-ui-tests",
        sequence: 1,
      });
      record.state.twitch.lastHeartbeatAt = now;
      run({
        type: "presence",
        connected: true,
        camera: true,
        microphone: false,
        slot: "A",
      });
    },
    advance(ms: number) {
      now += ms;
      expireState(record, now);
    },
  };
}
const choices: Record<RoundKind, AudienceChoice> = {
  weather: "wild",
  name: "pip2",
  mood: "shy",
  ending: "chase",
  accept: "accept",
  giveback: "giveback",
  contents: "garden",
  "parcel-ending": "keep",
};
function finish(mode: ShowMode, episode: EpisodeId) {
  const stage = theater(mode, episode),
    show = stage.record.state;
  const tag = show.parcel?.tag;
  const kinds = new Set<RoundKind>();
  for (let steps = 0; show.phase !== "ended" && steps < 90; steps++) {
    const round = show.round;
    if (round?.status === "closing") {
      stage.advance(3001);
      continue;
    }
    if (round?.status === "closed" && round.needsDirectorChoice) {
      stage.run({
        type: "resolve-round",
        roundId: round.id,
        choice: choices[round.kind ?? "weather"],
      });
      continue;
    }
    if (show.umbrella.transfer?.status === "accepted") {
      stage.advance(1400);
      stage.run({ type: "arrive", transferId: show.umbrella.transfer.id });
      continue;
    }
    if (round?.status === "open") {
      kinds.add(round.kind ?? "weather");
      if (mode === "rehearsal")
        stage.run({
          type: "rehearsal-vote",
          roundId: round.id,
          choice: choices[round.kind ?? "weather"],
          voter: "labeled-test-account",
        });
    }
    const next = nextCue(show);
    expect(next.act, `${episode}: ${next.title}`).not.toBeNull();
    stage.run(next.act!);
  }
  expect(show.phase).toBe("ended");
  expect(show.umbrella.owner).toBe("A");
  if (mode === "solo") expect(show.participants.B.camera).toBe(false);
  return { show, kinds, tag };
}

describe("authored cue paths", () => {
  it("returns to a fresh offer after the server expires an offer and cancels its unapplied ballot", () => {
    const stage = theater("solo", "borrowed-weather"),
      show = stage.record.state;
    show.preset.roundSeconds = 15;
    stage.run({ type: "start" });
    stage.run({ type: "apply-weather", weather: "gentle", roundId: null });
    stage.run({ type: "offer", from: "A" });
    const expiredId = show.umbrella.transfer!.id;
    const expiresAt = show.umbrella.transfer!.expiresAt;
    const roundId = show.round!.id;
    stage.run({ type: "close-round", roundId });
    stage.advance(3001);
    stage.run({ type: "resolve-round", roundId, choice: "accept" });
    expect(nextCue(show).act).toEqual({ type: "apply-choice", roundId });
    while (stage.now < expiresAt + 1) {
      stage.renew();
      const remaining = expiresAt + 1 - stage.now;
      if (remaining > 0) stage.advance(Math.min(5000, remaining));
    }
    expect(show.phase).toBe("live");
    expect(show.renderLease.expiresAt).toBeGreaterThan(stage.now);
    expect(
      show.participants.A.ready &&
        show.participants.A.admitted &&
        show.participants.A.connected,
    ).toBe(true);
    expect(show.umbrella.transfer?.status).toBe("expired");
    expect(show.round?.status).toBe("cancelled");
    expect(show.umbrella.owner).toBe("A");
    expect(show.umbrella.acceptedTransfers).toBe(0);
    expect(nextCue(show).act).toEqual({ type: "offer", from: "A" });
    stage.run(nextCue(show).act!);
    expect(show.umbrella.transfer!.id).not.toBe(expiredId);
    expect(show.round!.id).not.toBe(roundId);
  });
  it.each([
    {
      kind: "weather",
      status: "applied",
      result: "gentle",
      expected: {
        type: "open-round",
        kind: "name",
        previousRoundId: "round-old",
      },
    },
    {
      kind: "name",
      status: "open",
      result: null,
      expected: { type: "close-round", roundId: "round-old" },
    },
    {
      kind: "name",
      status: "closed",
      result: "pip1",
      expected: { type: "apply-choice", roundId: "round-old" },
    },
    {
      kind: "weather",
      status: "closed",
      result: "wild",
      expected: { type: "apply-weather", roundId: "round-old" },
    },
  ] as const)(
    "captures the displayed round for $expected.type across replacement",
    ({ kind, status, result, expected }) => {
      const show = createRecord(
        "ps_round_capture",
        "director",
        "rehearsal",
        1000,
      ).state;
      show.phase = "live";
      show.weather = "gentle";
      show.umbrella.acceptedTransfers = 1;
      show.round = {
        id: "round-old",
        kind,
        status,
        openedAt: 1000,
        closesAt: 31000,
        closedAt: status === "open" ? null : 2000,
        tallies: {},
        uniqueVoters: 1,
        result,
        source: result ? "rehearsal" : null,
        lastMessageAt: null,
      };
      const captured = nextCue(show).act;
      show.round = { ...show.round, id: "round-new" };
      expect(captured).toEqual(expected);
      expect(nextCue(show).act).not.toEqual(captured);
    },
  );

  it.each(["borrowed-weather", "midnight-parcel"] as const)(
    "requires deliberate recovery for unknown %s legacy progress without changing the prop",
    (episode) => {
      const show = createRecord(
        "ps_legacy_progress",
        "director",
        "rehearsal",
        1000,
        null,
        episode,
      ).state;
      show.phase = "live";
      show.weather = episode === "borrowed-weather" ? "gentle" : null;
      show.umbrella.acceptedTransfers = null;
      show.umbrella.owner = "B";
      const prop = structuredClone(show.umbrella);
      const recovery = nextCue(show);
      expect(recovery.act).toBeNull();
      expect(recovery.waiting).toBe(false);
      expect(recovery.title).toContain("Earlier scene history is incomplete");
      expect(recovery.description).toContain("current prop is intact");
      expect(recovery.description).toContain("manual controls");
      expect(show.umbrella).toEqual(prop);
    },
  );
  it.each(["borrowed-weather", "midnight-parcel"] as const)(
    "retains %s cue progress after both acceptances leave the public event window",
    (episode) => {
      const show = createRecord(
        "ps_busy_window",
        "director",
        "rehearsal",
        1000,
        null,
        episode,
      ).state;
      show.phase = "live";
      show.umbrella.acceptedTransfers = 2;
      show.umbrella.owner = "A";
      show.umbrella.version = 5;
      show.events = Array.from({ length: 50 }, (_, index) => ({
        id: `test-effect-${index}`,
        sequence: index + 51,
        at: 2000 + index,
        type: "presence.effect",
        actor: "system" as const,
        summary: "Labeled test effect",
        propId: show.umbrella.id,
        propVersion: 5,
        owner: "A" as const,
      }));
      show.sequence = 100;
      if (show.parcel)
        Object.assign(show.parcel, {
          contents: "stars",
          stamped: true,
          opened: true,
          openedAt: 1500,
          transformedRoom: "B",
        });
      else {
        show.weather = "gentle";
        show.creature.hatched = true;
        show.decisions.name = {
          choice: "pip1",
          source: "rehearsal",
          voters: 1,
          contributors: [],
          at: 1200,
          roundId: "test-name",
        };
        show.decisions.mood = {
          choice: "shy",
          source: "rehearsal",
          voters: 1,
          contributors: [],
          at: 1300,
          roundId: "test-mood",
        };
      }
      expect(show.events).toHaveLength(50);
      expect(show.events.some((event) => event.type === "action.accept")).toBe(
        false,
      );
      expect(nextCue(show).act).toEqual({
        type: "open-round",
        previousRoundId: null,
        kind: episode === "midnight-parcel" ? "parcel-ending" : "ending",
      });
    },
  );
  it.each(["rehearsal", "solo"] as const)(
    "runs every Borrowed Weather decision through server actions in %s",
    (mode) => {
      const { show, kinds } = finish(mode, "borrowed-weather");
      expect(kinds).toEqual(
        new Set(
          mode === "solo"
            ? ["weather", "accept", "name", "mood", "giveback", "ending"]
            : ["weather", "name", "mood", "ending"],
        ),
      );
      expect(show.preset.creatureName).toBe("Sprig");
      expect(show.creature.mood).toBe("gentle");
      expect(show.preset.ending).toBe("playful-chase");
    },
  );
  it.each(["rehearsal", "solo"] as const)(
    "runs the distinct parcel path, retaining its tag and damage in %s",
    (mode) => {
      const { show, kinds, tag } = finish(mode, "midnight-parcel");
      expect(kinds.has("weather")).toBe(false);
      expect(kinds.has("contents")).toBe(true);
      expect(kinds.has("parcel-ending")).toBe(true);
      expect(show.parcel).toMatchObject({
        tag,
        contents: "garden",
        stamped: true,
        opened: true,
        transformedRoom: "A",
        ending: "keep",
      });
      expect(show.parcel!.damage).toBeGreaterThan(0);
      expect(show.creature.hatched).toBe(false);
    },
  );
  it("never accepts an empty solo ballot without a deliberate director choice", () => {
    const stage = theater("solo", "borrowed-weather"),
      show = stage.record.state;
    stage.run({ type: "start" });
    stage.run({
      type: "apply-weather",
      weather: "gentle",
      roundId: show.round?.id ?? null,
    });
    stage.run({ type: "offer", from: "A" });
    expect(show.round?.kind).toBe("accept");
    stage.run(nextCue(show).act!);
    stage.advance(3001);
    expect(show.round?.needsDirectorChoice).toBe(true);
    expect(nextCue(show).act).toBeNull();
    expect(nextCue(show).waiting).toBe(false);
    expect(show.umbrella.owner).toBe("A");
    stage.run({
      type: "resolve-round",
      choice: "accept",
      roundId: show.round!.id,
    });
    stage.run(nextCue(show).act!);
    expect(show.umbrella.owner).toBe("B");
    expect(show.umbrella.transfer?.status).toBe("accepted");
  });
});
