import { describe, expect, it } from "vitest";
import {
  activeAnchorSlot,
  anchorSenderSlot,
  ANCHOR_LIMITS,
  decodeAnchor,
  encodeAnchor,
  TransientAnchorReceiver,
} from "../src/media/anchor-protocol";
import type { AnchorPacket } from "../src/media/anchor-protocol";
import type { ShowState } from "../src/lib/contracts";
const now = 100_000;
function show(): ShowState {
  return {
    id: "ps_anchor_test",
    mode: "live",
    transport: "livekit",
    phase: "live",
    epoch: 3,
    renderLease: { clientId: "renderer", epoch: 3, expiresAt: now + 45_000 },
    umbrella: { owner: "B" },
    participants: {
      A: {
        connected: true,
        camera: true,
        ready: true,
        admitted: true,
        consentBroadcast: true,
        calibrated: true,
        anchor: { x: 0.6, y: 0.5 },
      },
      B: {
        connected: true,
        camera: true,
        ready: true,
        admitted: true,
        consentBroadcast: true,
        calibrated: true,
        anchor: { x: 0.4, y: 0.5 },
      },
    },
  } as ShowState;
}
const sender = {
  identity: "performer-ps_anchor_test-B",
  metadata: JSON.stringify({
    role: "performer",
    slot: "B",
    epoch: 2,
    showId: "ps_anchor_test",
  }),
};
const packet = (overrides: Partial<AnchorPacket> = {}) =>
  ({
    v: 1,
    showId: "ps_anchor_test",
    epoch: 3,
    seq: 1,
    sentAt: now,
    slot: "B",
    point: { x: 0.7, y: 0.4 },
    ...overrides,
  }) as AnchorPacket;
const bytes = (overrides: Partial<AnchorPacket> = {}) =>
  encodeAnchor(packet(overrides))!;

describe("disposable private-room anchors", () => {
  it("accepts only the immutable SDK role/slot/identity and current packet show/epoch", () => {
    const state = show();
    expect(anchorSenderSlot(sender, state)).toBe("B");
    const receive = new TransientAnchorReceiver();
    expect(receive.receive(bytes(), sender, state, now, now)).toBe(true);
    for (const invalid of [
      { ...sender, identity: "chosen-display-name" },
      {
        ...sender,
        metadata:
          '{"role":"performer","slot":"A","epoch":3,"showId":"ps_anchor_test"}',
      },
      {
        ...sender,
        metadata:
          '{"role":"performer","slot":"B","epoch":4,"showId":"ps_anchor_test"}',
      },
      { ...sender, metadata: "invalid" },
    ])
      expect(
        new TransientAnchorReceiver().receive(
          bytes(),
          invalid,
          state,
          now,
          now,
        ),
      ).toBe(false);
    for (const invalid of [
      { epoch: 2 },
      { showId: "another-show" },
      { slot: "A" as const },
    ])
      expect(
        new TransientAnchorReceiver().receive(
          bytes(invalid),
          sender,
          state,
          now,
          now,
        ),
      ).toBe(false);
    const oldDirector = {
      identity: "director-ps_anchor_test-2",
      metadata:
        '{"role":"director","slot":"A","epoch":2,"showId":"ps_anchor_test"}',
    };
    expect(anchorSenderSlot(oldDirector, state)).toBeNull();
  });
  it("rejects stale, future, duplicate, reordered and timestamp-rewound samples", () => {
    const state = show();
    const receive = new TransientAnchorReceiver();
    expect(receive.receive(bytes({ seq: 5 }), sender, state, now, now)).toBe(
      true,
    );
    for (const invalid of [
      { seq: 5 },
      { seq: 4 },
      { seq: 6, sentAt: now - 1 },
      { seq: 6, sentAt: now - ANCHOR_LIMITS.maxAgeMs - 1 },
      { seq: 6, sentAt: now + ANCHOR_LIMITS.futureSkewMs + 1 },
    ])
      expect(receive.receive(bytes(invalid), sender, state, now, now)).toBe(
        false,
      );
  });
  it("fences the replaced director and clears cached positions and sequence history on a mount change", () => {
    const state = show();
    state.umbrella.owner = "A";
    Object.assign(state.renderLease, {
      incarnationId: "first-mount",
      incarnationSequence: 1,
    });
    const director = (incarnationId: string, incarnationSequence: number) => ({
      identity: `director-ps_anchor_test-3-${incarnationId}`,
      metadata: JSON.stringify({
        role: "director",
        slot: "A",
        showId: state.id,
        epoch: 3,
        incarnationId,
        incarnationSequence,
      }),
    });
    const first = director("first-mount", 1);
    const next = director("next-mount", 2);
    const receive = new TransientAnchorReceiver();
    expect(
      receive.receive(bytes({ slot: "A", seq: 40 }), first, state, now, now),
    ).toBe(true);
    expect(receive.current(state, now, now).A).not.toBeNull();
    Object.assign(state.renderLease, {
      incarnationId: "next-mount",
      incarnationSequence: 2,
    });
    expect(receive.current(state, now, now).A).toBeNull();
    expect(
      receive.receive(bytes({ slot: "A", seq: 41 }), first, state, now, now),
    ).toBe(false);
    expect(
      receive.receive(bytes({ slot: "A", seq: 1 }), next, state, now, now),
    ).toBe(true);
    state.umbrella.owner = "B";
    expect(anchorSenderSlot(sender, state)).toBe("B");
    expect(receive.receive(bytes(), sender, state, now, now)).toBe(true);
  });
  it("bounds payloads, rejects nonfinite/out-of-range coordinates and never parses commands as anchors", () => {
    expect(decodeAnchor(new Uint8Array(257))).toBeNull();
    expect(decodeAnchor(new Uint8Array([255, 255]))).toBeNull();
    expect(
      decodeAnchor(
        new TextEncoder().encode('{"type":"accept","transferId":"x"}'),
      ),
    ).toBeNull();
    for (const point of [
      { x: Infinity, y: 0 },
      { x: -0.1, y: 0.2 },
      { x: 0.2, y: 1.1 },
      { x: 0.2, y: NaN },
    ])
      expect(encodeAnchor(packet({ point }))).toBeNull();
    const injected = new TextEncoder().encode(
      JSON.stringify({ ...packet(), action: "accept" }),
    );
    expect(decodeAnchor(injected)).toBeNull();
  });
  it("requires current ownership, readiness, consent, admission and live authority", () => {
    for (const field of [
      "connected",
      "camera",
      "ready",
      "admitted",
      "consentBroadcast",
      "calibrated",
    ] as const) {
      const state = show();
      state.participants.B[field] = false;
      expect(activeAnchorSlot(state, "B", now)).toBe(false);
    }
    for (const phase of ["hold", "backstage", "ended"] as const)
      expect(activeAnchorSlot({ ...show(), phase }, "B", now)).toBe(false);
    const expired = show();
    expired.renderLease.expiresAt = now;
    expect(activeAnchorSlot(expired, "B", now)).toBe(false);
    const otherOwner = show();
    otherOwner.umbrella.owner = "A";
    expect(activeAnchorSlot(otherOwner, "B", now)).toBe(false);
    expect(
      activeAnchorSlot(
        { ...show(), mode: "rehearsal", transport: "fixture" },
        "B",
        now,
      ),
    ).toBe(false);
  });
  it("allows solo A anchors within the media window and rejects a software-room performer grant", () => {
    const state = show();
    state.mode = "solo";
    state.solo = { endsAt: now + 1000, status: "scheduled" };
    state.umbrella.owner = "A";
    expect(activeAnchorSlot(state, "A", now)).toBe(true);
    expect(anchorSenderSlot(sender, state)).toBeNull();
    state.umbrella.owner = "B";
    expect(activeAnchorSlot(state, "B", now)).toBe(false);
    state.umbrella.owner = "A";
    expect(activeAnchorSlot(state, "A", now + 1000)).toBe(false);
  });
  it("expires to no transient value and clears on explicit epoch/peer reset", () => {
    const state = show();
    const receive = new TransientAnchorReceiver();
    receive.receive(bytes(), sender, state, now, now);
    expect(receive.current(state, now, now).B).toEqual({ x: 0.7, y: 0.4 });
    expect(
      receive.current(
        state,
        now + ANCHOR_LIMITS.ttlMs,
        now + ANCHOR_LIMITS.ttlMs,
      ).B,
    ).toBeNull();
    expect(receive.receive(bytes({ seq: 2 }), sender, state, now, now)).toBe(
      true,
    );
    receive.clear("B");
    expect(receive.current(state, now, now).B).toBeNull();
    receive.receive(bytes(), sender, state, now, now);
    state.epoch = 4;
    expect(receive.current(state, now, now).B).toBeNull();
  });
  it("limits a valid sender's packets without allocating per-supplied-identity state", () => {
    const receive = new TransientAnchorReceiver();
    const state = show();
    for (let seq = 1; seq <= 20; seq++)
      expect(receive.receive(bytes({ seq }), sender, state, now, now)).toBe(
        true,
      );
    expect(receive.receive(bytes({ seq: 21 }), sender, state, now, now)).toBe(
      false,
    );
    expect(
      receive.receive(
        bytes({ seq: 22, sentAt: now + 1000 }),
        sender,
        state,
        now + 1000,
        now + 1000,
      ),
    ).toBe(true);
  });
});
