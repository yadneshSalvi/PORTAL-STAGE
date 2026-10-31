import { describe, expect, it } from "vitest";
import type {
  ActionEnvelope,
  ShowAction,
  ShowMode,
  Slot,
} from "../src/lib/contracts";
import {
  acquireLease,
  applyAction,
  castVote,
  createRecord,
  expireState,
  hydrateRecord,
  LEASE_MS,
  needsExpiry,
  PRESENCE_MS,
  recordEvent,
} from "../src/server/core";
import type { Actor, ShowRecord } from "../src/server/records";
import { parseAction } from "../src/server/schema";
import { HttpError } from "../src/server/errors";
import {
  captureFixtureAction,
  type FixtureAction,
} from "./helpers/show-action";

const DIRECTOR: Actor = { id: "host-session", role: "director", slot: "A" };
const GUEST: Actor = { id: "guest-session", role: "performer", slot: "B" };
const PROGRAM: Actor = { id: "output-session", role: "program", slot: null };
const RENDERER = "director-tab-for-tests";
const initialTime = Date.UTC(2026, 9, 31, 10);

/** Matches the command CAS callback: expire first, apply, then persist only success. */
class Stage {
  now = initialTime;
  record: ShowRecord;
  key = 0;
  constructor(mode: ShowMode = "live", start = true) {
    this.record = createRecord("ps_core_tests", DIRECTOR.id, mode, this.now);
    this.record.participantSessions.B = GUEST.id;
    for (const slot of ["A", "B"] as const)
      Object.assign(this.record.state.participants[slot], {
        joined: true,
        connected: true,
        camera: true,
        microphone: false,
        consentBroadcast: true,
        consentRecording: false,
        ready: true,
        admitted: true,
        calibrated: true,
        lastSeenAt: this.now,
      });
    acquireLease(this.record, RENDERER, false, this.now);
    if (start) this.run({ type: "start" });
  }
  get state() {
    return this.record.state;
  }
  envelope(
    action: FixtureAction,
    overrides: Partial<ActionEnvelope> = {},
  ): ActionEnvelope {
    return parseAction({
      action: captureFixtureAction(action, this.state),
      idempotencyKey: `request-${String(++this.key).padStart(7, "0")}`,
      expectedVersion: this.state.umbrella.version,
      rendererId: RENDERER,
      epoch: this.state.epoch,
      ...overrides,
    });
  }
  commit(actor: Actor, envelope: ActionEnvelope) {
    const candidate = structuredClone(this.record);
    expireState(candidate, this.now);
    applyAction(candidate, actor, envelope, this.now);
    this.record = candidate;
    return this.state;
  }
  run(
    action: FixtureAction,
    actor = DIRECTOR,
    overrides: Partial<ActionEnvelope> = {},
  ) {
    return this.commit(actor, this.envelope(action, overrides));
  }
  advance(ms = 100) {
    this.now += ms;
  }
  renew() {
    acquireLease(this.record, RENDERER, false, this.now);
    this.run(
      { type: "presence", connected: true, camera: true, microphone: false },
      DIRECTOR,
    );
    this.run(
      { type: "presence", connected: true, camera: true, microphone: false },
      GUEST,
    );
  }
  offer() {
    this.run(
      { type: "offer" },
      this.state.umbrella.owner === "A" ? DIRECTOR : GUEST,
    );
    return this.state.umbrella.transfer!;
  }
  accept() {
    const transfer = this.state.umbrella.transfer!;
    return this.run(
      { type: "accept", transferId: transfer.id },
      transfer.to === "A" ? DIRECTOR : GUEST,
    );
  }
  expire() {
    const candidate = structuredClone(this.record);
    expireState(candidate, this.now);
    this.record = candidate;
  }
  vote(
    voter: string,
    messageId: string,
    choice: "gentle" | "wild",
    sentAt = this.now,
    synthetic = false,
  ) {
    const candidate = structuredClone(this.record);
    expireState(candidate, this.now);
    castVote(candidate, voter, messageId, choice, sentAt, this.now, synthetic);
    this.record = candidate;
  }
  audience() {
    this.state.twitch.connected = true;
    this.state.twitch.lastHeartbeatAt = this.now;
  }
}
function rejects(code: string, callback: () => unknown) {
  let failure: unknown;
  try {
    callback();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(HttpError);
  expect((failure as HttpError).code).toBe(code);
}

describe("server-committed, persistent prop ownership", () => {
  it("completes 100 two-way transfers with one umbrella and one creature identity, committing before animation", () => {
    const stage = new Stage();
    stage.run({ type: "apply-weather", weather: "wild" });
    stage.run({ type: "hatch" });
    const umbrellaId = stage.state.umbrella.id,
      creatureId = stage.state.creature.id,
      wetness = stage.state.umbrella.wetness;
    let heartbeatedAt = stage.now;
    for (let i = 0; i < 100; i++) {
      const originalOwner = stage.state.umbrella.owner;
      const target: Slot = originalOwner === "A" ? "B" : "A";
      if (stage.now - heartbeatedAt >= 8000) {
        stage.renew();
        heartbeatedAt = stage.now;
      }
      const transfer = stage.offer();
      expect(stage.state.umbrella.owner).toBe(originalOwner);
      expect(transfer.status).toBe("offered");
      stage.advance(1100);
      if (stage.now - heartbeatedAt >= 8000) {
        stage.renew();
        heartbeatedAt = stage.now;
      }
      stage.accept();
      expect(stage.state.umbrella.owner).toBe(target);
      expect(stage.state.umbrella.transfer?.status).toBe("accepted");
      expect(stage.state.umbrella.transfer?.commitSequence).toBe(
        stage.state.sequence,
      );
      expect(stage.state.umbrella.transfer?.arrivedAt).toBeNull();
      const committedVersion = stage.state.umbrella.version;
      stage.advance(1100);
      if (stage.now - heartbeatedAt >= 8000) {
        stage.renew();
        heartbeatedAt = stage.now;
      }
      stage.run({ type: "arrive", transferId: transfer.id });
      expect(stage.state.umbrella).toMatchObject({
        id: umbrellaId,
        owner: target,
        version: committedVersion,
        wetness,
        repairPatch: "coral",
      });
      expect(stage.state.creature.id).toBe(creatureId);
      expect(stage.state.creature.shelterOwner).toBe(target);
      expect(stage.state.umbrella.transfer?.status).toBe("arrived");
      stage.advance(1100);
    }
    expect(stage.state.umbrella.owner).toBe("A");
    expect(
      stage.state.events.filter((event) => event.type === "action.accept"),
    ).toHaveLength(100);
    expect(new Set(stage.state.events.map((event) => event.id)).size).toBe(
      stage.state.events.length,
    );
    expect(
      stage.state.events.every(
        (event, i, events) =>
          i === 0 || event.sequence === events[i - 1].sequence + 1,
      ),
    ).toBe(true);
  });
  it("returns an identical acceptance once for an idempotency key and rejects a reused key with changed payload", () => {
    const stage = new Stage();
    const offer = stage.offer();
    const acceptance = stage.envelope({ type: "accept", transferId: offer.id });
    stage.commit(GUEST, acceptance);
    const after = structuredClone(stage.state);
    stage.commit(GUEST, acceptance);
    expect(stage.state).toEqual(after);
    rejects("idempotency_conflict", () =>
      stage.commit(GUEST, {
        ...acceptance,
        action: { type: "decline", transferId: offer.id },
      }),
    );
    expect(stage.state).toEqual(after);
    rejects("offer_stale", () =>
      stage.run({ type: "accept", transferId: offer.id }, GUEST),
    );
    expect(stage.state.umbrella.owner).toBe("B");
  });
  it("rejects stale versions and old epochs without partially committing a transfer", () => {
    const stage = new Stage();
    const offer = stage.offer();
    const before = structuredClone(stage.state);
    rejects("stale_prop", () =>
      stage.run({ type: "accept", transferId: offer.id }, GUEST, {
        expectedVersion: before.umbrella.version - 1,
      }),
    );
    rejects("stale_epoch", () =>
      stage.run({ type: "accept", transferId: offer.id }, GUEST, {
        epoch: before.epoch - 1,
      }),
    );
    expect(stage.state).toEqual(before);
    expect(stage.state.umbrella.owner).toBe("A");
  });
  it("does not let a live director impersonate the receiver or use a wrong receiver slot", () => {
    const stage = new Stage();
    const offer = stage.offer();
    rejects("performer_required", () =>
      stage.run({ type: "accept", transferId: offer.id, slot: "B" }, DIRECTOR),
    );
    rejects("receiver_only", () =>
      stage.run({ type: "accept", transferId: offer.id }, DIRECTOR),
    );
    rejects("performer_required", () =>
      stage.run({ type: "accept", transferId: offer.id, slot: "A" }, GUEST),
    );
    expect(stage.state.umbrella.owner).toBe("A");
    stage.accept();
    expect(stage.state.umbrella.owner).toBe("B");
  });
  it("keeps the separately labeled rehearsal's director-controlled receiver behavior explicit", () => {
    const stage = new Stage("rehearsal");
    const offer = stage.offer();
    stage.run({ type: "accept", transferId: offer.id, slot: "B" });
    expect(stage.state.umbrella.owner).toBe("B");
    expect(stage.state.mode).toBe("rehearsal");
    expect(stage.state.events[0].summary).toContain("synthetic");
  });
  it("preserves ownership on decline, sender cancel, and offer expiry", () => {
    for (const action of ["decline", "cancel-offer"] as const) {
      const stage = new Stage();
      const offer = stage.offer();
      stage.run(
        { type: action, transferId: offer.id },
        action === "decline" ? GUEST : DIRECTOR,
      );
      expect(stage.state.umbrella.owner).toBe("A");
      expect(stage.state.umbrella.transfer?.status).toBe(
        action === "decline" ? "declined" : "cancelled",
      );
    }
    const stage = new Stage();
    const offer = stage.offer();
    stage.advance(18_000);
    stage.renew();
    stage.now = offer.expiresAt + 1;
    // An otherwise unchanged presence command still persists expiry inside the same CAS callback.
    stage.run(
      { type: "presence", connected: true, camera: true, microphone: false },
      GUEST,
    );
    expect(stage.state.umbrella.transfer?.status).toBe("expired");
    expect(stage.state.umbrella.owner).toBe("A");
    rejects("offer_stale", () =>
      stage.run({ type: "accept", transferId: offer.id }, GUEST),
    );
  });
  it("cancels an uncommitted offer on disconnect, and preserves a committed owner on a later disconnect", () => {
    const before = new Stage();
    before.offer();
    before.run(
      { type: "presence", connected: false, camera: false, microphone: false },
      GUEST,
    );
    expect(before.state.umbrella.transfer?.status).toBe("cancelled");
    expect(before.state.umbrella.owner).toBe("A");
    expect(before.state.participants.B).toMatchObject({
      connected: false,
      ready: false,
      admitted: false,
    });
    const after = new Stage();
    const offer = after.offer();
    after.accept();
    const committedVersion = after.state.umbrella.version;
    after.run(
      { type: "presence", connected: false, camera: false, microphone: false },
      GUEST,
    );
    expect(after.state.umbrella).toMatchObject({
      owner: "B",
      version: committedVersion,
    });
    expect(after.state.umbrella.transfer?.status).toBe("accepted");
    after.run({ type: "arrive", transferId: offer.id });
    expect(after.state.umbrella).toMatchObject({
      owner: "B",
      version: committedVersion,
    });
    expect(after.state.participants.B.admitted).toBe(false);
  });
  it("retains owner/version for repeated arrival and uses an explicit recall as a new ownership event", () => {
    const stage = new Stage();
    const offer = stage.offer();
    stage.accept();
    const committed = stage.state.umbrella.version;
    stage.run({ type: "arrive", transferId: offer.id });
    const arrivedSequence = stage.state.sequence;
    stage.run({ type: "arrive", transferId: offer.id });
    expect(stage.state.sequence).toBe(arrivedSequence);
    expect(stage.state.umbrella).toMatchObject({
      owner: "B",
      version: committed,
      acceptedTransfers: 1,
    });
    stage.run({ type: "recall", to: "A" });
    expect(stage.state.umbrella).toMatchObject({
      owner: "A",
      version: committed + 1,
      acceptedTransfers: 1,
      transfer: null,
    });
    expect(stage.state.events.at(-1)?.type).toBe("action.recall");
    expect(
      stage.state.events.some(
        (event) => event.type === "action.accept" && event.owner === "B",
      ),
    ).toBe(true);
  });
  it("migrates accepted-transfer progress before projection and keeps it after event eviction", () => {
    const stage = new Stage();
    for (let i = 0; i < 2; i++) {
      const offer = stage.offer();
      stage.accept();
      stage.run({ type: "arrive", transferId: offer.id });
    }
    delete (stage.state.umbrella as Partial<typeof stage.state.umbrella>)
      .acceptedTransfers;
    hydrateRecord(stage.record);
    expect(stage.state.umbrella.acceptedTransfers).toBe(2);
    stage.state.events = [];
    hydrateRecord(stage.record);
    expect(stage.state.umbrella.acceptedTransfers).toBe(2);
    stage.run({ type: "hold" });
    stage.run({ type: "reset" });
    expect(stage.state.umbrella.acceptedTransfers).toBe(0);
  });
  it("marks legacy progress unknown when its capped history no longer proves the transfers", () => {
    const stage = new Stage();
    for (let i = 0; i < 2; i++) {
      const offer = stage.offer();
      stage.accept();
      stage.run({ type: "arrive", transferId: offer.id });
    }
    const prop = structuredClone(stage.state.umbrella);
    for (let i = 0; i < 2001; i++)
      recordEvent(
        stage.record,
        "round.vote",
        "twitch",
        "Synthetic migration-history fixture.",
        stage.now,
      );
    delete (stage.state.umbrella as Partial<typeof stage.state.umbrella>)
      .acceptedTransfers;
    hydrateRecord(stage.record);
    expect(stage.state.umbrella.acceptedTransfers).toBeNull();
    expect(stage.state.umbrella).toMatchObject({
      id: prop.id,
      owner: prop.owner,
      version: prop.version,
      wetness: prop.wetness,
    });
    hydrateRecord(stage.record);
    expect(stage.state.umbrella.acceptedTransfers).toBeNull();
    stage.run({ type: "hold" });
    stage.run({ type: "reset" });
    expect(stage.state.umbrella.acceptedTransfers).toBe(0);
  });
  it("immediately removes admission and cancels an offer when a performer withdraws broadcast consent", () => {
    const stage = new Stage();
    stage.offer();
    stage.run({ type: "consent", broadcast: false, recording: false }, GUEST);
    expect(stage.state.participants.B).toMatchObject({
      consentBroadcast: false,
      consentRecording: false,
      admitted: false,
      ready: false,
    });
    expect(stage.state.umbrella.transfer?.status).toBe("cancelled");
    expect(stage.state.umbrella.owner).toBe("A");
    rejects("readiness", () => stage.run({ type: "admit", slot: "B" }));
  });
  it("keeps readiness and admission separate after reconnect", () => {
    const stage = new Stage();
    stage.run({ type: "leave" }, GUEST);
    stage.run(
      { type: "presence", connected: true, camera: true, microphone: false },
      GUEST,
    );
    expect(stage.state.participants.B).toMatchObject({
      connected: true,
      ready: false,
      admitted: false,
    });
    rejects("director_required", () =>
      stage.run({ type: "admit", slot: "B" }, GUEST),
    );
    stage.run({ type: "ready", ready: true }, GUEST);
    expect(stage.state.participants.B.admitted).toBe(false);
    stage.run({ type: "admit", slot: "B" });
    expect(stage.state.participants.B.admitted).toBe(true);
  });
  it("refuses guest director cues and all Program mutations", () => {
    for (const action of [
      { type: "hold" },
      { type: "panic" },
      { type: "hatch" },
      { type: "apply-weather", weather: "wild" },
      { type: "recall", to: "A" },
      { type: "open-round" },
      { type: "end" },
    ] as ShowAction[]) {
      const stage = new Stage();
      const before = structuredClone(stage.state);
      rejects("director_required", () => stage.run(action, GUEST));
      expect(stage.state).toEqual(before);
    }
    const stage = new Stage();
    rejects("read_only", () =>
      stage.run(
        { type: "presence", connected: true, camera: false, microphone: false },
        PROGRAM,
      ),
    );
  });
  it("keeps repeated End director-only after the show has already ended", () => {
    const stage = new Stage();
    stage.run({ type: "end" });
    const before = structuredClone(stage.record);
    rejects("director_required", () => stage.run({ type: "end" }, GUEST));
    expect(stage.record).toEqual(before);
    stage.run({ type: "end" });
    expect(stage.record.outputGeneration).toBe(before.outputGeneration);
    expect(stage.record.inviteGeneration).toBe(before.inviteGeneration);
    expect(stage.state.umbrella).toEqual(before.state.umbrella);
  });
  it("fences takeover and expired leases while preserving already committed ownership", () => {
    const stage = new Stage();
    stage.offer();
    stage.accept();
    const version = stage.state.umbrella.version;
    const oldEpoch = stage.state.epoch;
    acquireLease(stage.record, "new-director-tab", true, stage.now);
    expect(stage.state.epoch).toBe(oldEpoch + 1);
    expect(stage.state.phase).toBe("hold");
    expect(stage.state.umbrella).toMatchObject({ owner: "B", version });
    expect(
      Object.values(stage.state.participants).every(
        (participant) => !participant.ready && !participant.admitted,
      ),
    ).toBe(true);
    rejects("renderer_fenced", () =>
      stage.run({ type: "resume" }, DIRECTOR, {
        rendererId: RENDERER,
        epoch: oldEpoch,
      }),
    );
    const expired = new Stage();
    expired.advance(LEASE_MS + 1);
    expired.expire();
    expect(expired.state.phase).toBe("hold");
    expect(expired.state.events.at(-1)?.type).toBe("renderer.expired");
  });
  it("rejects an old director tab's cleanup presence and anchor after a takeover", () => {
    const stage = new Stage();
    const oldEpoch = stage.state.epoch;
    acquireLease(stage.record, "replacement-director", true, stage.now);
    const before = structuredClone(stage.state);
    rejects("renderer_fenced", () =>
      stage.run(
        {
          type: "presence",
          connected: false,
          camera: false,
          microphone: false,
        },
        DIRECTOR,
        { rendererId: RENDERER, epoch: oldEpoch },
      ),
    );
    rejects("renderer_fenced", () =>
      stage.run({ type: "anchor", anchor: { x: 0.1, y: 0.1 } }, DIRECTOR, {
        rendererId: RENDERER,
        epoch: oldEpoch,
      }),
    );
    expect(stage.state).toEqual(before);
    expect(stage.state.participants.A.camera).toBe(true);
  });
  it("expires stale performer presence before acting and closes that camera aperture", () => {
    const stage = new Stage();
    stage.offer();
    stage.advance(18_000);
    acquireLease(stage.record, RENDERER, false, stage.now);
    stage.now = initialTime + PRESENCE_MS + 1;
    stage.run(
      { type: "presence", connected: true, camera: true, microphone: false },
      DIRECTOR,
    );
    expect(stage.state.participants.B).toMatchObject({
      connected: false,
      camera: false,
      microphone: false,
      admitted: false,
      ready: false,
    });
    expect(stage.state.umbrella.owner).toBe("A");
    expect(
      stage.state.events.some(
        (event) => event.type === "participant.interrupted",
      ),
    ).toBe(true);
  });
});

describe("bounded audience choices and reusable variation", () => {
  it("replaces a person's vote, deduplicates message IDs, and rejects early and late commands", () => {
    const stage = new Stage();
    stage.audience();
    stage.run({ type: "open-round" });
    stage.advance();
    stage.vote("account-1", "message-1", "gentle");
    stage.advance();
    stage.vote("account-1", "message-2", "wild");
    expect(stage.state.round).toMatchObject({
      tallies: { gentle: 0, wild: 1 },
      uniqueVoters: 1,
    });
    const sequence = stage.state.sequence;
    stage.vote("account-2", "message-2", "gentle");
    expect(stage.state.sequence).toBe(sequence);
    expect(stage.state.round?.uniqueVoters).toBe(1);
    rejects("vote_window", () =>
      stage.vote(
        "account-3",
        "message-3",
        "gentle",
        stage.state.round!.openedAt - 1,
      ),
    );
    rejects("vote_window", () =>
      stage.vote(
        "account-3",
        "message-4",
        "gentle",
        stage.state.round!.closesAt + 1,
      ),
    );
    stage.run({ type: "close-round" });
    stage.advance(1);
    rejects("vote_window", () =>
      stage.vote("account-4", "message-5", "gentle"),
    );
    stage.advance(3000);
    stage.expire();
    expect(stage.state.round).toMatchObject({
      result: "wild",
      source: "audience",
      uniqueVoters: 1,
    });
  });
  it("labels an empty round and a tie as Director's choice, then applies the authored consequence", () => {
    for (const tie of [false, true]) {
      const stage = new Stage();
      stage.audience();
      stage.run({ type: "open-round" });
      if (tie) {
        stage.vote("account-1", "message-a", "gentle");
        stage.vote("account-2", "message-b", "wild");
      }
      stage.run({ type: "close-round", fallback: "wild" });
      stage.advance(3000);
      stage.expire();
      expect(stage.state.round).toMatchObject({
        result: "wild",
        source: "director",
      });
      expect(stage.state.events.at(-1)?.summary).toContain("Director's choice");
      stage.run({ type: "apply-weather" });
      expect(stage.state.creature.mood).toBe("wild");
      expect(stage.state.umbrella.wetness).toBeGreaterThan(0);
    }
  });
  it("keeps synthetic ballots out of a live show and real ballots out of a rehearsal", () => {
    const live = new Stage();
    live.audience();
    live.run({ type: "open-round" });
    rejects("fixture_only", () =>
      live.run({ type: "rehearsal-vote", choice: "wild", voter: "fixture-1" }),
    );
    rejects("vote_source", () =>
      live.vote("fixture-1", "synthetic-1", "gentle", live.now, true),
    );
    const rehearsal = new Stage("rehearsal");
    rehearsal.run({ type: "open-round" });
    rejects("vote_source", () =>
      rehearsal.vote("actual-1", "real-message-1", "wild"),
    );
    rehearsal.run({
      type: "rehearsal-vote",
      choice: "wild",
      voter: "fixture-1",
    });
    rehearsal.run({ type: "close-round" });
    expect(rehearsal.state.round?.source).toBe("rehearsal");
  });
  it("reloads a saved variation and uses its weather, timing, character and ending rules", () => {
    const stage = new Stage();
    const preset = {
      ...stage.state.preset,
      id: "paper-storm",
      name: "Paper Storm",
      episodeTitle: "A Wilder Crossing",
      creatureName: "Moth",
      defaultWeather: "wild" as const,
      crossingMs: 1400,
      rainIntensity: 1,
      creatureCuriosity: 0.9,
      roundSeconds: 45,
      reducedMotion: true,
      ending: "playful-chase" as const,
    };
    stage.run({ type: "save-preset", preset });
    stage.run({ type: "load-preset", presetId: "borrowed-weather" });
    expect(stage.state.preset.id).toBe("borrowed-weather");
    stage.run({ type: "load-preset", presetId: preset.id });
    expect(stage.state.preset).toEqual(preset);
    expect(stage.state.title).toBe("A Wilder Crossing");
    stage.run({
      type: "apply-weather",
      weather: stage.state.preset.defaultWeather,
    });
    stage.run({ type: "hatch" });
    stage.run({ type: "shelter" });
    expect(stage.state.creature.mood).toBe("wild");
    expect(stage.state.umbrella.wetness).toBeCloseTo(0.8);
    expect(stage.state.events.at(-1)?.summary).toContain(
      "Moth invites one last playful chase",
    );
    rejects("preset_not_found", () =>
      stage.run({ type: "load-preset", presetId: "not-saved" }),
    );
  });
  it("bounds memo storage after more than 1000 anchor and unchanged presence commands without flooding events", () => {
    const stage = new Stage("rehearsal");
    const sequence = stage.state.sequence;
    const successfulCallback = (action: ShowAction) => {
      // Exercise the actual CAS callback in place; snapshot rollback and store
      // isolation are checked separately, rather than cloning the memo 2210 times.
      const envelope = stage.envelope(action);
      acquireLease(stage.record, RENDERER, false, stage.now);
      expireState(stage.record, stage.now);
      applyAction(stage.record, DIRECTOR, envelope, stage.now);
    };
    for (let i = 0; i < 1105; i++) {
      stage.advance(2100);
      successfulCallback({
        type: "anchor",
        anchor: { x: 0.2 + (i % 10) * 0.02, y: 0.45 },
      });
      stage.advance(2100);
      successfulCallback({
        type: "presence",
        connected: true,
        camera: true,
        microphone: false,
      });
    }
    expect(Object.keys(stage.record.idempotency)).toHaveLength(1000);
    expect(
      stage.record.idempotency[`${DIRECTOR.id}:request-0000002`],
    ).toBeUndefined();
    expect(
      stage.record.idempotency[
        `${DIRECTOR.id}:request-${String(stage.key).padStart(7, "0")}`
      ],
    ).toBeDefined();
    expect(stage.state.sequence).toBe(sequence);
    expect(Object.keys(stage.record.rates).length).toBeLessThanOrEqual(3);
    expect(stage.state.participants.A.lastSeenAt).toBe(stage.now);
  }, 15_000);
});

describe("fixture recovery and explicit LiveKit rehearsal transport", () => {
  function committedScene(stage: Stage) {
    const preset = {
      ...stage.state.preset,
      id: "recovered-storm",
      name: "Recovered Storm",
      episodeTitle: "The Same Storm",
      creatureName: "Moth",
      ending: "playful-chase" as const,
    };
    stage.run({ type: "save-preset", preset });
    stage.run({ type: "load-preset", presetId: preset.id });
    stage.run({ type: "apply-weather", weather: "wild" });
    stage.run({ type: "hatch" });
    const transfer = stage.offer();
    stage.run({ type: "accept", transferId: transfer.id, slot: "B" }, DIRECTOR);
    stage.run({ type: "arrive", transferId: transfer.id });
    stage.run({ type: "shelter" });
    return {
      umbrella: structuredClone(stage.state.umbrella),
      creature: structuredClone(stage.state.creature),
      preset: structuredClone(stage.state.preset),
      savedPresets: structuredClone(stage.state.savedPresets),
      weather: stage.state.weather,
      beat: stage.state.beat,
    };
  }
  it("preserves a fixture scene on takeover and restores synthetic readiness under a held curtain", () => {
    const stage = new Stage("rehearsal");
    delete stage.record.participantSessions.B;
    const scene = committedScene(stage);
    stage.run({ type: "panic" });
    expect(
      Object.values(stage.state.participants).every(
        (person) => !person.ready && !person.admitted,
      ),
    ).toBe(true);
    const previousEpoch = stage.state.epoch;
    acquireLease(stage.record, "recovered-director", true, stage.now);
    expect(stage.state).toMatchObject({
      mode: "rehearsal",
      transport: "fixture",
      phase: "hold",
      epoch: previousEpoch + 1,
      ...scene,
    });
    for (const slot of ["A", "B"] as const)
      expect(stage.state.participants[slot]).toMatchObject({
        name: `Test plate ${slot}`,
        connected: true,
        camera: true,
        microphone: false,
        consentBroadcast: true,
        consentRecording: false,
        calibrated: true,
        ready: true,
        admitted: true,
      });
    expect(
      stage.state.events.some((event) => event.type === "fixture.ready"),
    ).toBe(true);
    stage.run({ type: "resume" }, DIRECTOR, {
      rendererId: "recovered-director",
    });
    expect(stage.state.phase).toBe("live");
    expect(stage.state.umbrella).toEqual(scene.umbrella);
    expect(stage.state.creature).toEqual(scene.creature);
  });
  it("can recover fixture readiness on a renewal without resetting the episode or lifting hold", () => {
    const stage = new Stage("rehearsal");
    const scene = committedScene(stage);
    stage.run({ type: "panic" });
    const epoch = stage.state.epoch;
    acquireLease(stage.record, RENDERER, false, stage.now + 100);
    expect(stage.state).toMatchObject({
      transport: "fixture",
      phase: "hold",
      epoch,
      ...scene,
    });
    expect(
      Object.values(stage.state.participants).every(
        (person) => person.ready && person.admitted,
      ),
    ).toBe(true);
    const sequence = stage.state.sequence;
    acquireLease(stage.record, RENDERER, false, stage.now + 200);
    expect(stage.state.sequence).toBe(sequence);
  });
  it("does not expire synthetic fixture participants as if they were network clients", () => {
    const stage = new Stage("rehearsal");
    stage.advance(PRESENCE_MS + LEASE_MS + 1);
    expect(needsExpiry(stage.record, stage.now)).toBe(false);
    stage.expire();
    expect(stage.state.phase).toBe("live");
    expect(
      Object.values(stage.state.participants).every(
        (person) =>
          person.connected && person.camera && person.ready && person.admitted,
      ),
    ).toBe(true);
  });
  it("does not restore actual LiveKit rehearsal participants on director takeover", () => {
    const stage = new Stage("rehearsal");
    const scene = committedScene(stage);
    stage.state.transport = "livekit";
    acquireLease(stage.record, "livekit-replacement", true, stage.now);
    expect(stage.state).toMatchObject({
      mode: "rehearsal",
      transport: "livekit",
      phase: "hold",
      ...scene,
    });
    expect(
      Object.values(stage.state.participants).every(
        (person) => !person.ready && !person.admitted,
      ),
    ).toBe(true);
    expect(
      stage.state.events.some((event) => event.type === "fixture.ready"),
    ).toBe(false);
    rejects("not_ready", () =>
      stage.run({ type: "resume" }, DIRECTOR, {
        rendererId: "livekit-replacement",
      }),
    );
  });
  it("expires actual LiveKit rehearsal authority and media despite its rehearsal mode", () => {
    const stage = new Stage("rehearsal");
    const scene = committedScene(stage);
    stage.state.transport = "livekit";
    stage.advance(Math.max(LEASE_MS, PRESENCE_MS) + 1);
    expect(needsExpiry(stage.record, stage.now)).toBe(true);
    stage.expire();
    expect(stage.state.phase).toBe("hold");
    expect(stage.state.events.at(-1)?.type).toBe("renderer.expired");
    for (const person of Object.values(stage.state.participants))
      expect(person).toMatchObject({
        connected: false,
        camera: false,
        microphone: false,
        ready: false,
        admitted: false,
      });
    expect(stage.state.umbrella).toEqual(scene.umbrella);
    expect(stage.state.creature).toEqual(scene.creature);
    expect(
      stage.state.events.filter(
        (event) => event.type === "participant.interrupted",
      ),
    ).toHaveLength(2);
  });
  it("requires fresh readiness and admission when a LiveKit rehearsal performer rejoins", () => {
    const stage = new Stage("rehearsal");
    stage.state.transport = "livekit";
    stage.run(
      { type: "presence", connected: false, camera: false, microphone: false },
      GUEST,
    );
    stage.run(
      { type: "presence", connected: true, camera: true, microphone: false },
      GUEST,
    );
    expect(stage.state.participants.B).toMatchObject({
      connected: true,
      camera: true,
      ready: false,
      admitted: false,
    });
    stage.run({ type: "ready", ready: true }, GUEST);
    expect(stage.state.participants.B.admitted).toBe(false);
    stage.run({ type: "admit", slot: "B" });
    expect(stage.state.participants.B.admitted).toBe(true);
  });
  it("hard-fences missing or stale director lease fields for LiveKit rehearsal presence", () => {
    const stage = new Stage("rehearsal");
    stage.state.transport = "livekit";
    const oldEpoch = stage.state.epoch;
    acquireLease(stage.record, "livekit-current-tab", true, stage.now);
    const before = structuredClone(stage.state);
    const presence: ShowAction = {
      type: "presence",
      connected: false,
      camera: false,
      microphone: false,
    };
    for (const invalid of [
      { rendererId: undefined, epoch: undefined },
      { rendererId: RENDERER, epoch: oldEpoch },
      { rendererId: RENDERER, epoch: stage.state.epoch },
      { rendererId: "livekit-current-tab", epoch: oldEpoch },
    ])
      rejects("renderer_fenced", () => stage.run(presence, DIRECTOR, invalid));
    expect(stage.state).toEqual(before);
    stage.run(presence, DIRECTOR, { rendererId: "livekit-current-tab" });
    expect(stage.state.participants.A).toMatchObject({
      connected: false,
      camera: false,
    });
    stage.run(
      { type: "presence", connected: false, camera: false, microphone: false },
      GUEST,
      { rendererId: undefined },
    );
    expect(stage.state.participants.B.connected).toBe(false);
  });
  it("requires receiver-owned acceptance, consent, readiness, calibration, and presence in LiveKit rehearsal", () => {
    const stage = new Stage("rehearsal");
    stage.state.transport = "livekit";
    const transfer = stage.offer();
    const before = structuredClone(stage.record);
    for (const action of [
      { type: "accept", transferId: transfer.id, slot: "B" },
      { type: "consent", slot: "B", broadcast: true, recording: true },
      { type: "ready", slot: "B", ready: true },
      {
        type: "calibrate",
        slot: "B",
        anchor: { x: 0.8, y: 0.2 },
        handedness: "left",
      },
      {
        type: "presence",
        slot: "B",
        connected: true,
        camera: true,
        microphone: true,
      },
    ] as ShowAction[])
      rejects("performer_required", () => stage.run(action));
    expect(stage.record).toEqual(before);
    stage.run({ type: "accept", transferId: transfer.id }, GUEST);
    expect(stage.state.umbrella.owner).toBe("B");
  });
  it("restores solo fixture participation, revokes guest/invitation generation, and preserves the committed scene", () => {
    const stage = new Stage("rehearsal");
    const scene = committedScene(stage);
    stage.state.transport = "livekit";
    stage.state.participants.B.name = "A consenting remote performer";
    stage.state.participants.B.consentRecording = true;
    const generation = stage.record.inviteGeneration;
    const restoration = stage.envelope({ type: "restore-rehearsal" });
    stage.commit(DIRECTOR, restoration);
    expect(stage.state).toMatchObject({
      mode: "rehearsal",
      transport: "fixture",
      phase: "hold",
      ...scene,
    });
    expect(stage.record.participantSessions).toEqual({ A: DIRECTOR.id });
    expect(stage.record.inviteGeneration).toBe(generation + 1);
    for (const slot of ["A", "B"] as const)
      expect(stage.state.participants[slot]).toMatchObject({
        name: `Test plate ${slot}`,
        ready: true,
        admitted: true,
        camera: true,
        microphone: false,
        consentRecording: false,
      });
    expect(stage.state.events.at(-1)?.type).toBe("action.restore-rehearsal");
    const after = structuredClone(stage.record);
    stage.commit(DIRECTOR, restoration);
    expect(stage.record).toEqual(after);
    stage.run({ type: "resume" });
    expect(stage.state.phase).toBe("live");
  });
  it("cancels an uncommitted offer when restoring fixtures without changing its owner or physical traits", () => {
    const stage = new Stage("rehearsal");
    stage.run({ type: "apply-weather", weather: "wild" });
    const offered = stage.offer();
    stage.state.transport = "livekit";
    const { id, owner, wetness, repairPatch, version } = stage.state.umbrella;
    stage.run({ type: "restore-rehearsal" });
    expect(stage.state.umbrella).toMatchObject({
      id,
      owner,
      wetness,
      repairPatch,
      version: version + 1,
      transfer: { id: offered.id, status: "cancelled" },
    });
    expect(stage.record.participantSessions.B).toBeUndefined();
  });
  it("never exposes fixture restoration to a live show, guest, Program viewer, or ended episode", () => {
    const live = new Stage();
    const before = structuredClone(live.record);
    rejects("fixture_only", () => live.run({ type: "restore-rehearsal" }));
    expect(live.record).toEqual(before);
    const rehearsal = new Stage("rehearsal");
    rehearsal.state.transport = "livekit";
    rejects("director_required", () =>
      rehearsal.run({ type: "restore-rehearsal" }, GUEST),
    );
    rejects("read_only", () =>
      rehearsal.run({ type: "restore-rehearsal" }, PROGRAM),
    );
    rehearsal.run({ type: "end" });
    rejects("show_ended", () => rehearsal.run({ type: "restore-rehearsal" }));
  });
});
