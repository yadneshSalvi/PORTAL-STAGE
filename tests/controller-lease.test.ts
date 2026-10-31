import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShowAction, ShowEnvelope } from "../src/lib/contracts";
import {
  createRendererLeaseIdentity,
  maySendDirectorAction,
  releaseRendererLease,
  rendererLeaseClaim,
  rendererLeaseStatus,
  startRendererLeaseHeartbeat,
} from "../src/media/renderer-lease";

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}
function ids() {
  let sequence = 0;
  return () => `renderer-instance-${++sequence}`;
}
async function flush() {
  for (let i = 0; i < 8; ++i) await Promise.resolve();
}
function envelope(): ShowEnvelope {
  return {
    role: "director",
    show: {
      phase: "live",
      epoch: 2,
      renderLease: { clientId: "renderer-tab", epoch: 2, expiresAt: 45_000 },
    },
  } as ShowEnvelope;
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("renderer reload lifecycle", () => {
  it("retains a per-show tab ID while strictly increasing each mount incarnation", () => {
    const target = storage();
    const makeId = ids();
    const original = createRendererLeaseIdentity("ps_first", target, makeId);
    const reloaded = createRendererLeaseIdentity("ps_first", target, makeId);
    const otherShow = createRendererLeaseIdentity("ps_other", target, makeId);
    const later = createRendererLeaseIdentity("ps_first", target, makeId);
    expect(reloaded.clientId).toBe(original.clientId);
    expect(later.clientId).toBe(original.clientId);
    expect(otherShow.clientId).not.toBe(original.clientId);
    expect(
      new Set([
        original.incarnationId,
        reloaded.incarnationId,
        later.incarnationId,
      ]).size,
    ).toBe(3);
    expect([
      original.incarnationSequence,
      reloaded.incarnationSequence,
      later.incarnationSequence,
    ]).toEqual([1, 2, 3]);
  });

  it("replaces malformed storage and uses a fresh safe ID when storage is blocked", () => {
    const target = storage();
    target.values.set("portal-stage:renderer:v1:ps_corrupt", "{invalid");
    const makeId = ids();
    const repaired = createRendererLeaseIdentity("ps_corrupt", target, makeId);
    expect(
      createRendererLeaseIdentity("ps_corrupt", target, makeId).clientId,
    ).toBe(repaired.clientId);
    const blocked = {
      getItem() {
        throw new Error("storage blocked");
      },
      setItem() {
        throw new Error("storage blocked");
      },
    };
    const first = createRendererLeaseIdentity("ps_first", blocked, makeId);
    const second = createRendererLeaseIdentity("ps_first", blocked, makeId);
    expect(first.clientId).not.toBe(second.clientId);
    expect(first.incarnationId).not.toBe(second.incarnationId);
  });
  it("persists a fresh renderer for explicit takeover after a copied equal-sequence mount is fenced", () => {
    const target = storage();
    const makeId = ids();
    const original = createRendererLeaseIdentity("ps_first", target, makeId);
    const takeover = createRendererLeaseIdentity(
      "ps_first",
      target,
      makeId,
      true,
    );
    const reloaded = createRendererLeaseIdentity("ps_first", target, makeId);
    expect(takeover.clientId).not.toBe(original.clientId);
    expect(takeover.incarnationId).not.toBe(original.incarnationId);
    expect(takeover.incarnationSequence).toBe(1);
    expect(reloaded.clientId).toBe(takeover.clientId);
    expect(reloaded.incarnationSequence).toBe(2);
  });

  it("coalesces visibility wakes with a flight and stops acquiring after the show ends", async () => {
    vi.useFakeTimers();
    let eligible = true;
    let resolve!: () => void;
    const claim = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const heartbeat = startRendererLeaseHeartbeat(claim, () => eligible);
    await Promise.all([heartbeat.wake(), heartbeat.wake()]);
    expect(claim).toHaveBeenCalledTimes(1);
    eligible = false;
    resolve();
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    await heartbeat.wake();
    expect(claim).toHaveBeenCalledTimes(1);
    heartbeat.stop();
  });

  it("renews promptly on a visibility wake without adding a second timer", async () => {
    vi.useFakeTimers();
    const claim = vi.fn(async () => undefined);
    const heartbeat = startRendererLeaseHeartbeat(claim, () => true);
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    await heartbeat.wake();
    expect(claim).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(claim).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(claim).toHaveBeenCalledTimes(3);
    heartbeat.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(claim).toHaveBeenCalledTimes(3);
  });

  it("sends the exact mount incarnation in its unload beacon", async () => {
    const sendBeacon = vi.fn((_path: string, _body: Blob) => true);
    const fetch = vi.fn(async () => new Response());
    vi.stubGlobal("navigator", { sendBeacon });
    vi.stubGlobal("fetch", fetch);
    const identity = createRendererLeaseIdentity("ps_first", storage(), ids());
    releaseRendererLease("ps_first", identity, 4);
    expect(sendBeacon).toHaveBeenCalledOnce();
    const [path, body] = sendBeacon.mock.calls[0];
    expect(path).toBe("/api/shows/ps_first/lease/release");
    expect(body.type).toBe("application/json");
    expect(JSON.parse(await body.text())).toEqual({ ...identity, epoch: 4 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to a same-origin keepalive request when a beacon is refused", () => {
    vi.stubGlobal("navigator", { sendBeacon: vi.fn(() => false) });
    const fetch = vi.fn(async () => new Response());
    vi.stubGlobal("fetch", fetch);
    const identity = createRendererLeaseIdentity("ps_first", storage(), ids());
    releaseRendererLease("ps_first", identity, 4);
    expect(fetch).toHaveBeenCalledWith("/api/shows/ps_first/lease/release", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...identity, epoch: 4 }),
    });
  });

  it("reports ended after lease expiry and lost authority after release or mount replacement", () => {
    const current = envelope();
    expect(rendererLeaseStatus(current, "renderer-tab", 1000, true, "")).toBe(
      "active",
    );
    current.show.renderLease.incarnationId = "new-mount-incarnation";
    current.show.renderLease.incarnationSequence = 2;
    expect(
      rendererLeaseStatus(current, "renderer-tab", 1000, true, "", {
        clientId: "renderer-tab",
        incarnationId: "old-mount-incarnation",
        incarnationSequence: 1,
      }),
    ).toBe("lost");
    current.show.renderLease.releasedAt = 1000;
    expect(rendererLeaseStatus(current, "renderer-tab", 1001, true, "")).toBe(
      "lost",
    );
    current.show.phase = "ended";
    expect(rendererLeaseStatus(current, "renderer-tab", 90_000, true, "")).toBe(
      "ended",
    );
  });
  it("reclaims a reload without an epoch and renews only its matching unreleased incarnation", () => {
    const current = envelope();
    const identity = {
      clientId: "renderer-tab",
      incarnationId: "new-mount-incarnation",
      incarnationSequence: 2,
    };
    current.show.renderLease.incarnationId = "old-mount-incarnation";
    current.show.renderLease.incarnationSequence = 1;
    expect(rendererLeaseClaim(identity, current, false)).not.toHaveProperty(
      "epoch",
    );
    current.show.renderLease.incarnationId = identity.incarnationId;
    current.show.renderLease.incarnationSequence = identity.incarnationSequence;
    expect(rendererLeaseClaim(identity, current, false)).toMatchObject({
      ...identity,
      epoch: 2,
      takeover: false,
    });
    current.show.renderLease.releasedAt = 1000;
    expect(rendererLeaseClaim(identity, current, false)).not.toHaveProperty(
      "epoch",
    );
    expect(rendererLeaseClaim(identity, current, true)).toMatchObject({
      epoch: 2,
      takeover: true,
    });
  });
  it("fences queued director cues and presence after a copied tab loses its mount, preserving safety controls", () => {
    const current = envelope();
    const identity = {
      clientId: "renderer-tab",
      incarnationId: "original-mount",
      incarnationSequence: 1,
    };
    Object.assign(current.show.renderLease, {
      incarnationId: identity.incarnationId,
      incarnationSequence: 1,
    });
    const cues: ShowAction[] = [
      { type: "offer" },
      { type: "start" },
      { type: "arm", armed: true },
      { type: "presence", connected: true, camera: true, microphone: false },
    ];
    for (const cue of cues)
      expect(maySendDirectorAction(cue, current, identity, 1000)).toBe(true);
    Object.assign(current.show.renderLease, {
      incarnationId: "replacement-mount",
      incarnationSequence: 2,
    });
    for (const cue of cues)
      expect(maySendDirectorAction(cue, current, identity, 1000)).toBe(false);
    const safety: ShowAction[] = [
      { type: "panic" },
      { type: "hold" },
      { type: "end" },
      { type: "hide", slot: "A" },
      { type: "consent", broadcast: false, recording: false },
      { type: "ready", ready: false },
      { type: "leave" },
    ];
    for (const action of safety)
      expect(maySendDirectorAction(action, current, identity, 1000)).toBe(true);
    expect(
      maySendDirectorAction(
        { type: "consent", broadcast: true, recording: false },
        current,
        identity,
        1000,
      ),
    ).toBe(false);
    expect(
      maySendDirectorAction(
        {
          type: "presence",
          connected: false,
          camera: false,
          microphone: false,
        },
        current,
        identity,
        1000,
      ),
    ).toBe(false);
    current.role = "performer";
    expect(
      maySendDirectorAction({ type: "offer" }, current, null, 90_000, false),
    ).toBe(true);
  });
});
