import { describe, expect, it } from "vitest";
import type {
  ActionEnvelope,
  EpisodeId,
  ShowAction,
  ShowMode,
} from "@/lib/contracts";
import {
  acquireLease,
  applyAction,
  createRecord,
  expireState,
  needsExpiry,
} from "@/server/core";
import { castVote, eventOrder, presenceEffect } from "@/server/audience";
import { parseAction } from "@/server/schema";
import type { Actor, ShowRecord } from "@/server/records";
import {
  captureFixtureAction,
  type FixtureAction,
} from "./helpers/show-action";

const host: Actor = { id: "fixture-host", role: "director", slot: "A" };
const renderer = "fixture-renderer";
class Scene {
  now = Date.UTC(2026, 10, 1, 12);
  key = 0;
  record: ShowRecord;
  constructor(
    mode: ShowMode = "rehearsal",
    episode: EpisodeId = "borrowed-weather",
  ) {
    this.record = createRecord(
      "ps_authored_fixture",
      host.id,
      mode,
      this.now,
      "fixture-channel",
      episode,
    );
    if (mode === "solo") {
      const endsAt = this.now + 1200_000;
      this.record.soloReservation = {
        id: "fixture-reservation",
        account: "fixture-account",
        createdAt: this.now,
        expiresAt: endsAt,
        generation: 1,
        status: "scheduled",
        runId: "fixture-run",
        issued: [],
      };
      this.record.state.solo = { endsAt, status: "scheduled" };
      Object.assign(this.record.state.participants.A, {
        joined: true,
        connected: true,
        camera: true,
        consentBroadcast: true,
        ready: true,
        admitted: true,
        calibrated: true,
        lastSeenAt: this.now,
      });
    }
    this.record.state.twitch.connected = true;
    this.record.state.twitch.lastHeartbeatAt = this.now;
    acquireLease(this.record, renderer, false, this.now);
    this.run({ type: "start" });
  }
  get show() {
    return this.record.state;
  }
  run(action: FixtureAction, identity = `fixture-key-${++this.key}`) {
    this.now += 10;
    const copy = structuredClone(this.record);
    expireState(copy, this.now);
    const input: ActionEnvelope = parseAction({
      action: captureFixtureAction(action, this.show),
      idempotencyKey: identity,
      rendererId: renderer,
      epoch: copy.state.epoch,
      expectedVersion: copy.state.umbrella.version,
    });
    applyAction(copy, host, input, this.now);
    this.record = copy;
  }
  vote(choice: Parameters<typeof castVote>[3], voter = "fixture-voter") {
    this.now += 10;
    castVote(
      this.record,
      voter,
      `fixture-message-${++this.key}`,
      choice,
      this.now,
      this.now,
      this.show.mode === "rehearsal",
    );
  }
  close(choice?: Parameters<typeof castVote>[3]) {
    if (choice) this.vote(choice);
    this.run({ type: "close-round" });
    if (this.show.mode !== "rehearsal") {
      this.now += 3000;
      expireState(this.record, this.now);
    }
  }
  arrival() {
    this.run({ type: "arrive", transferId: this.show.umbrella.transfer!.id });
  }
}

describe("authored audience decisions", () => {
  it("changes the creature's name, behavior and final ending using separate labeled rehearsal ballots", () => {
    const scene = new Scene();
    scene.run({ type: "open-round", kind: "weather" });
    scene.close("wild");
    scene.run({ type: "apply-weather" });
    scene.run({ type: "hatch" });
    scene.run({ type: "open-round", kind: "name" });
    scene.close("pip2");
    scene.run({ type: "apply-choice" });
    scene.run({ type: "open-round", kind: "mood" });
    scene.close("shy");
    scene.run({ type: "apply-choice" });
    scene.run({ type: "open-round", kind: "ending" });
    scene.close("chase");
    scene.run({ type: "apply-choice" });
    scene.run({ type: "shelter" });
    expect(scene.show.preset).toMatchObject({
      creatureName: "Sprig",
      creatureCuriosity: 0.2,
      ending: "playful-chase",
    });
    expect(scene.show.creature.mood).toBe("gentle");
    expect(scene.show.decisions).toMatchObject({
      weather: { choice: "wild", source: "rehearsal" },
      name: { choice: "pip2" },
      mood: { choice: "shy" },
      ending: { choice: "chase" },
    });
    expect(scene.show.decisions.name?.contributors).toEqual([]);
  });
  it.each([false, true])(
    "requires an explicit director choice for an empty/tied round (tie=%s)",
    (tie) => {
      const scene = new Scene();
      scene.run({ type: "open-round", kind: "ending" });
      if (tie) {
        scene.vote("share", "one");
        scene.vote("chase", "two");
      }
      scene.close();
      expect(scene.show.round).toMatchObject({
        result: null,
        source: null,
        needsDirectorChoice: true,
      });
      expect(() => scene.run({ type: "apply-choice" })).toThrow();
      scene.run({ type: "resolve-round", choice: "share" });
      scene.run({ type: "apply-choice" });
      expect(scene.show.decisions.ending).toMatchObject({
        choice: "share",
        source: "director",
        contributors: [],
      });
    },
  );
  it("rejects commands from another authored choice and sanitizes only real display-name credits", () => {
    const scene = new Scene("solo");
    scene.run({ type: "open-round", kind: "name" });
    expect(() => scene.vote("wild")).toThrow();
    castVote(
      scene.record,
      "account-a",
      "message-name",
      "pip3",
      scene.now + 1,
      scene.now + 1,
      false,
      "<Test_User>\n123",
    );
    scene.close();
    scene.run({ type: "apply-choice" });
    expect(scene.show.decisions.name?.contributors).toEqual(["Test_User123"]);
    expect(JSON.stringify(scene.show.decisions)).not.toContain("account-a");
    expect(scene.show.preset.creatureName).toBe("Moth");
  });
  it("keeps the latest Twitch timestamp even when an older notification arrives later", () => {
    const scene = new Scene("solo");
    scene.run({ type: "open-round" });
    const first = new Date(scene.now + 10)
      .toISOString()
      .replace("Z", "123456Z");
    const second = new Date(scene.now + 10)
      .toISOString()
      .replace("Z", "999999Z");
    castVote(
      scene.record,
      "one",
      "newer",
      "wild",
      Date.parse(second),
      scene.now + 20,
      false,
      "One",
      eventOrder(second, "newer"),
    );
    castVote(
      scene.record,
      "one",
      "older",
      "gentle",
      Date.parse(first),
      scene.now + 30,
      false,
      "One",
      eventOrder(first, "older"),
    );
    expect(scene.show.round).toMatchObject({
      uniqueVoters: 1,
      tallies: { gentle: 0, wild: 1 },
    });
    expect(scene.record.messageIds).toContain("older");
  });
  it("accepts bounded in-window late delivery, then seals the result against later rewrite", () => {
    const scene = new Scene("solo");
    scene.run({ type: "open-round", kind: "ending" });
    const sentAt = scene.now + 5;
    scene.now += 20;
    scene.run({ type: "close-round" });
    expect(scene.show.round?.status).toBe("closing");
    expect(() => scene.run({ type: "apply-choice" })).toThrow();
    expect(
      castVote(
        scene.record,
        "late",
        "late-before-close",
        "share",
        sentAt,
        scene.now + 2000,
        false,
      ),
    ).toBe(true);
    scene.now += 3000;
    expireState(scene.record, scene.now);
    scene.run({ type: "apply-choice" });
    expect(() =>
      castVote(
        scene.record,
        "late",
        "too-late",
        "chase",
        sentAt + 1,
        scene.now,
        false,
      ),
    ).toThrow();
    expect(scene.show.decisions.ending?.choice).toBe("share");
  });
  it("bounds presence effects per person, globally, by age, and in timestamp order", () => {
    const scene = new Scene("solo");
    const now = scene.now;
    expect(
      presenceEffect(scene.record, "one", "m01", "cheer", now, now, false),
    ).toBe(true);
    expect(
      presenceEffect(
        scene.record,
        "one",
        "m02",
        "rain",
        now + 1,
        now + 1,
        false,
      ),
    ).toBe(false);
    for (let i = 2; i <= 5; i++)
      expect(
        presenceEffect(
          scene.record,
          `u${i}`,
          `m0${i + 1}`,
          "rain",
          now + i,
          now + i,
          false,
        ),
      ).toBe(true);
    expect(
      presenceEffect(
        scene.record,
        "six",
        "m08",
        "thunder",
        now + 9,
        now + 9,
        false,
      ),
    ).toBe(false);
    expect(
      presenceEffect(
        scene.record,
        "old",
        "m09",
        "cheer",
        now - 1,
        now + 2000,
        false,
      ),
    ).toBe(false);
    expect(
      presenceEffect(
        scene.record,
        "stale",
        "m10",
        "cheer",
        now,
        now + 6000,
        false,
      ),
    ).toBe(false);
    expect(
      presenceEffect(
        scene.record,
        "one",
        "m11",
        "cheer",
        now + 3100,
        now + 3100,
        false,
      ),
    ).toBe(true);
    expect(scene.show.presenceEffects).toHaveLength(6);
  });
  it("includes a Twitch timestamp exactly at close, but rejects later timestamps and delivery after grace", () => {
    const scene = new Scene("solo");
    scene.run({ type: "open-round" });
    scene.now += 100;
    scene.run({ type: "close-round" });
    const close = scene.show.round!.closesAt;
    expect(
      castVote(
        scene.record,
        "boundary",
        "at-close",
        "wild",
        close,
        close + 100,
        false,
      ),
    ).toBe(true);
    expect(() =>
      castVote(
        scene.record,
        "after",
        "after-close",
        "gentle",
        close + 1,
        close + 100,
        false,
      ),
    ).toThrow();
    expect(() =>
      castVote(
        scene.record,
        "grace",
        "after-grace",
        "gentle",
        close,
        close + 3000,
        false,
      ),
    ).toThrow();
  });
});

describe("server-authorized solo Audience Room", () => {
  it.each(["tie", "decided"] as const)(
    "recovers an expired offer without applying its delayed %s round",
    (result) => {
      const scene = new Scene("solo");
      scene.show.preset.roundSeconds = 15;
      scene.run({ type: "offer" });
      scene.vote("accept", "one");
      if (result === "tie") scene.vote("wait", "two");
      scene.close();
      const round = structuredClone(scene.show.round!),
        expiresAt = scene.show.umbrella.transfer!.expiresAt;
      const delayedResolve: ShowAction = {
        type: "resolve-round",
        roundId: round.id,
        choice: "accept",
      };
      const delayedApply: ShowAction = {
        type: "apply-choice",
        roundId: round.id,
      };
      const delayedOpen: ShowAction = {
        type: "open-round",
        kind: "accept",
        previousRoundId: round.id,
      };
      scene.now = expiresAt - 20_000;
      scene.run({
        type: "presence",
        connected: true,
        camera: true,
        microphone: false,
      });
      acquireLease(scene.record, renderer, false, scene.now);
      scene.now = expiresAt + 1;
      expireState(scene.record, scene.now);
      expect(scene.show.phase).toBe("live");
      expect(scene.show.umbrella).toMatchObject({
        owner: "A",
        acceptedTransfers: 0,
        transfer: { status: "expired" },
      });
      expect(scene.show.round).toMatchObject({
        id: round.id,
        status: "cancelled",
        result: round.result,
        source: round.source,
        tallies: round.tallies,
      });
      expect(() => scene.run(delayedResolve)).toThrow();
      expect(() => scene.run(delayedApply)).toThrow();
      expect(() => scene.run(delayedOpen)).toThrow();
      scene.run({ type: "offer" });
      expect(scene.show.round).toMatchObject({
        kind: "accept",
        status: "open",
        uniqueVoters: 0,
      });
      expect(scene.show.round!.id).not.toBe(round.id);
      expect(() => scene.run(delayedResolve)).toThrow(
        expect.objectContaining({ code: "round_stale" }),
      );
      expect(() => scene.run(delayedOpen)).toThrow(
        expect.objectContaining({ code: "round_stale" }),
      );
      expect(scene.show.umbrella.owner).toBe("A");
    },
  );
  it("cancels unapplied handoff choices on manual cancellation and recall while retaining their result", () => {
    const scene = new Scene("solo");
    scene.run({ type: "offer" });
    scene.close("accept");
    const first = scene.show.round!.id;
    scene.run({
      type: "cancel-offer",
      transferId: scene.show.umbrella.transfer!.id,
    });
    expect(scene.show.round).toMatchObject({
      id: first,
      status: "cancelled",
      result: "accept",
      source: "audience",
      uniqueVoters: 1,
    });
    scene.run({ type: "offer" });
    scene.close("accept");
    scene.run({ type: "apply-choice" });
    scene.arrival();
    scene.run({ type: "open-round", kind: "giveback" });
    scene.close("giveback");
    scene.run({ type: "recall", to: "A" });
    expect(scene.show.round).toMatchObject({
      status: "cancelled",
      result: "giveback",
      source: "audience",
    });
    expect(scene.show.umbrella.owner).toBe("A");
    expect(
      scene.show.events.filter((event) => event.type === "round.cancelled"),
    ).toHaveLength(2);
  });
  it("reconciles a changed prop's unapplied handoff round without erasing applied history", () => {
    const scene = new Scene("solo");
    scene.run({ type: "offer" });
    scene.close("wait");
    scene.run({ type: "apply-choice" });
    expireState(scene.record, scene.now);
    expect(scene.show.round).toMatchObject({
      status: "applied",
      result: "wait",
    });
    scene.run({ type: "offer" });
    scene.close("accept");
    scene.run({ type: "apply-choice" });
    scene.arrival();
    scene.run({ type: "open-round", kind: "giveback" });
    scene.close("giveback");
    scene.run({ type: "apply-weather", weather: "gentle" });
    expect(needsExpiry(scene.record, scene.now)).toBe(true);
    expireState(scene.record, scene.now);
    expect(scene.show.round).toMatchObject({
      status: "cancelled",
      result: "giveback",
      source: "audience",
    });
    expect(scene.show.umbrella.owner).toBe("B");
    scene.run({ type: "open-round", kind: "giveback" });
    expect(scene.show.round?.status).toBe("open");
  });
  it("cannot resolve, close or apply a replacement offer with delayed intents from an older round", () => {
    const scene = new Scene("solo");
    scene.run({ type: "offer" });
    scene.close();
    const oldRoundId = scene.show.round!.id;
    const oldClose: ShowAction = { type: "close-round", roundId: oldRoundId };
    const oldResolve: ShowAction = {
      type: "resolve-round",
      roundId: oldRoundId,
      choice: "accept",
    };
    const oldApply: ShowAction = { type: "apply-choice", roundId: oldRoundId };
    scene.run({
      type: "cancel-offer",
      transferId: scene.show.umbrella.transfer!.id,
    });
    scene.run({ type: "offer" });
    const newRoundId = scene.show.round!.id;
    expect(newRoundId).not.toBe(oldRoundId);
    expect(() => scene.run(oldClose)).toThrow(
      expect.objectContaining({ code: "round_stale" }),
    );
    expect(scene.show.round?.status).toBe("open");
    scene.close();
    const before = structuredClone(scene.record);
    for (const action of [
      oldResolve,
      oldApply,
      {
        type: "open-round" as const,
        kind: "ending" as const,
        previousRoundId: oldRoundId,
      },
    ]) {
      expect(() => scene.run(action)).toThrow(
        expect.objectContaining({ code: "round_stale" }),
      );
      expect(scene.record).toEqual(before);
    }
    expect(scene.show.umbrella.owner).toBe("A");
    expect(scene.show.round?.needsDirectorChoice).toBe(true);
    scene.run({ type: "resolve-round", roundId: newRoundId, choice: "accept" });
    scene.run({ type: "apply-choice", roundId: newRoundId });
    expect(scene.show.umbrella).toMatchObject({
      owner: "B",
      acceptedTransfers: 1,
    });
  });
  it("fences weather, fixture ballots and missing bindings against replacement choices", () => {
    const scene = new Scene();
    scene.run({ type: "open-round" });
    scene.close("wild");
    const oldRoundId = scene.show.round!.id;
    const applyOld: ShowAction = { type: "apply-weather", roundId: oldRoundId };
    scene.run({ type: "open-round" });
    expect(() =>
      scene.run({
        type: "rehearsal-vote",
        roundId: oldRoundId,
        choice: "wild",
        voter: "fixture",
      }),
    ).toThrow(expect.objectContaining({ code: "round_stale" }));
    scene.close("gentle");
    expect(() => scene.run(applyOld)).toThrow(
      expect.objectContaining({ code: "round_stale" }),
    );
    expect(() =>
      scene.run({ type: "apply-weather", roundId: null, weather: "wild" }),
    ).toThrow(expect.objectContaining({ code: "round_stale" }));
    expect(scene.show.weather).toBeNull();
    scene.run({ type: "apply-weather" });
    expect(scene.show.weather).toBe("gentle");
    for (const action of [
      { type: "open-round" },
      { type: "close-round" },
      { type: "resolve-round", choice: "gentle" },
      { type: "apply-choice" },
      { type: "apply-weather" },
      { type: "rehearsal-vote", choice: "wild", voter: "fixture" },
    ]) {
      expect(() =>
        parseAction({ action, idempotencyKey: "fixture-missing-binding" }),
      ).toThrow();
    }
  });
  it("commits B only after its resolved choice, then requires A's explicit acceptance of the return", () => {
    const scene = new Scene("solo");
    expect(scene.show.participants.B).toMatchObject({
      name: "Audience Room",
      connected: false,
      camera: false,
      consentBroadcast: false,
      ready: false,
    });
    const id = scene.show.umbrella.id;
    scene.run({ type: "offer" });
    expect(scene.show.round?.kind).toBe("accept");
    expect(scene.show.umbrella.owner).toBe("A");
    scene.close("accept");
    expect(scene.show.umbrella.owner).toBe("A");
    scene.run({ type: "apply-choice" });
    expect(scene.show.umbrella.owner).toBe("B");
    const version = scene.show.umbrella.version;
    scene.arrival();
    expect(scene.show.umbrella.version).toBe(version);
    expect(
      scene.show.events.find((event) => event.type === "action.accept")?.actor,
    ).toBe("audience");
    scene.run({ type: "open-round", kind: "giveback" });
    scene.close("giveback");
    scene.run({ type: "apply-choice" });
    expect(scene.show.umbrella.owner).toBe("B");
    expect(scene.show.umbrella.transfer).toMatchObject({
      from: "B",
      to: "A",
      status: "offered",
    });
    scene.run({ type: "accept", transferId: scene.show.umbrella.transfer!.id });
    scene.arrival();
    expect(scene.show.umbrella).toMatchObject({ id, owner: "A" });
  });
  it("wait and keep never silently move ownership; a fresh choice can later offer a return", () => {
    const scene = new Scene("solo");
    scene.run({ type: "offer" });
    scene.close("wait");
    scene.run({ type: "apply-choice" });
    expect(scene.show.umbrella).toMatchObject({
      owner: "A",
      transfer: { status: "declined" },
    });
    scene.run({ type: "offer" });
    scene.close("accept");
    scene.run({ type: "apply-choice" });
    scene.arrival();
    scene.run({ type: "open-round", kind: "giveback" });
    scene.close("keep");
    scene.run({ type: "apply-choice" });
    expect(scene.show.umbrella).toMatchObject({
      owner: "B",
      transfer: { status: "arrived" },
    });
    scene.run({ type: "open-round", kind: "giveback" });
    expect(scene.show.round?.status).toBe("open");
  });
  it("fences a fabricated audience actor, director control of B, a changed prop and withdrawn camera", () => {
    const scene = new Scene("solo");
    scene.run({ type: "offer" });
    scene.close("accept");
    expect(() =>
      scene.run({
        type: "accept",
        transferId: scene.show.umbrella.transfer!.id,
        slot: "B",
      }),
    ).toThrow();
    expect(() =>
      applyAction(
        scene.record,
        {
          id: "forged",
          role: "audience",
          slot: "B",
          roundId: scene.show.round!.id,
        },
        {
          action: {
            type: "accept",
            transferId: scene.show.umbrella.transfer!.id,
          },
          idempotencyKey: "forged-fixture-key",
          expectedVersion: scene.show.umbrella.version,
          epoch: scene.show.epoch,
        },
        scene.now,
      ),
    ).toThrow();
    const copy = structuredClone(scene.record);
    scene.show.umbrella.version += 1;
    expect(() => scene.run({ type: "apply-choice" })).toThrow();
    scene.record = copy;
    scene.run({ type: "consent", broadcast: false, recording: false });
    expect(() => scene.run({ type: "apply-choice" })).toThrow();
    expect(scene.show.umbrella.owner).toBe("A");
  });
  it("cannot commit an audience acceptance or reset after the immutable reservation expires", () => {
    const scene = new Scene("solo");
    scene.run({ type: "offer" });
    scene.close("accept");
    scene.now = scene.show.solo!.endsAt;
    expireState(scene.record, scene.now);
    expect(scene.show.phase).toBe("ended");
    expect(scene.show.umbrella.owner).toBe("A");
    expect(() => scene.run({ type: "apply-choice" })).toThrow();
    expect(() => scene.run({ type: "reset" })).toThrow();
  });
  it("empty acceptance needs a labeled director resolution and duplicate delivery cannot commit twice", () => {
    const scene = new Scene("solo");
    scene.run({ type: "offer" });
    scene.close();
    expect(scene.show.round?.needsDirectorChoice).toBe(true);
    expect(scene.show.umbrella.owner).toBe("A");
    scene.run({ type: "resolve-round", choice: "accept" });
    const before = structuredClone(scene.record),
      input = {
        action: {
          type: "apply-choice" as const,
          roundId: scene.show.round!.id,
        },
        idempotencyKey: "same-apply-choice",
        rendererId: renderer,
        epoch: scene.show.epoch,
        expectedVersion: scene.show.umbrella.version,
      };
    applyAction(scene.record, host, input, scene.now);
    const version = scene.show.umbrella.version;
    applyAction(scene.record, host, input, scene.now + 1);
    expect(scene.show.umbrella.version).toBe(version);
    expect(version).toBe(before.state.umbrella.version + 1);
    expect(scene.show.decisions.accept?.source).toBe("director");
  });
});

describe("Midnight Parcel's distinct persistent consequence", () => {
  it.each(["stars", "garden"] as const)(
    "carries a persistent tag/damage and opens %s in the other room, then brings it home",
    (contents) => {
      const scene = new Scene("rehearsal", "midnight-parcel");
      const id = scene.show.umbrella.id,
        tag = scene.show.parcel!.tag;
      expect(() => scene.run({ type: "offer" })).toThrow();
      scene.run({ type: "open-round", kind: "contents" });
      scene.close(contents);
      scene.run({ type: "apply-choice" });
      scene.run({ type: "stamp-parcel" });
      scene.run({ type: "offer" });
      scene.run({
        type: "accept",
        transferId: scene.show.umbrella.transfer!.id,
        slot: "B",
      });
      scene.arrival();
      scene.run({ type: "open-parcel" });
      expect(scene.show.parcel).toMatchObject({
        tag,
        contents,
        opened: true,
        transformedRoom: "B",
      });
      scene.run({ type: "offer", from: "B" });
      scene.run({
        type: "accept",
        transferId: scene.show.umbrella.transfer!.id,
      });
      scene.arrival();
      scene.run({ type: "open-round", kind: "parcel-ending" });
      scene.close("keep");
      scene.run({ type: "apply-choice" });
      scene.run({ type: "finish-parcel" });
      expect(scene.show.parcel).toMatchObject({
        tag,
        ending: "keep",
        transformedRoom: "A",
        contents,
      });
      expect(scene.show.parcel!.damage).toBeCloseTo(0.48);
      expect(scene.show.umbrella).toMatchObject({ id, owner: "A" });
      expect(scene.show.weather).toBeNull();
      expect(scene.show.creature.hatched).toBe(false);
      expect(scene.show.beat).toBe("delivery");
    },
  );
  it("works in real-mode solo protocol with a server audience actor and a leave-the-gift ending", () => {
    const scene = new Scene("solo", "midnight-parcel");
    scene.run({ type: "open-round", kind: "contents" });
    scene.close("stars");
    scene.run({ type: "apply-choice" });
    scene.run({ type: "stamp-parcel" });
    scene.run({ type: "offer" });
    scene.close("accept");
    scene.run({ type: "apply-choice" });
    scene.arrival();
    scene.run({ type: "open-parcel" });
    scene.run({ type: "open-round", kind: "giveback" });
    scene.close("giveback");
    scene.run({ type: "apply-choice" });
    scene.run({ type: "accept", transferId: scene.show.umbrella.transfer!.id });
    scene.arrival();
    scene.run({ type: "open-round", kind: "parcel-ending" });
    scene.close("deliver");
    scene.run({ type: "apply-choice" });
    scene.run({ type: "finish-parcel" });
    expect(scene.show.parcel).toMatchObject({
      ending: "deliver",
      transformedRoom: "B",
    });
    expect(scene.show.umbrella.owner).toBe("A");
  });
});
