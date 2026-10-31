import { describe, expect, it } from "vitest";
import { PresenceLane, type PresenceAction } from "./presence-lane";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const on: PresenceAction = {
  type: "presence",
  slot: "A",
  connected: true,
  camera: true,
  microphone: false,
};
function harness() {
  const calls: Array<{
    action: PresenceAction;
    gate: ReturnType<typeof deferred<number | null>>;
  }> = [];
  let active = 0,
    maximum = 0;
  const lane = new PresenceLane<number>((action) => {
    active++;
    maximum = Math.max(maximum, active);
    const gate = deferred<number | null>();
    calls.push({ action, gate });
    return gate.promise.finally(() => {
      active--;
    });
  });
  return { lane, calls, maximum: () => maximum };
}

describe("independent presence request lane", () => {
  it("keeps one request in flight and coalesces pending ON samples", async () => {
    const { lane, calls, maximum } = harness();
    const first = lane.submit(on);
    await tick();
    const second = lane.submit({ ...on, microphone: true });
    const latest = lane.submit({ ...on, microphone: false });
    expect(calls).toHaveLength(1);
    calls[0].gate.resolve(1);
    expect(await first).toBe(1);
    await tick();
    expect(calls).toHaveLength(2);
    expect(calls[1].action.microphone).toBe(false);
    calls[1].gate.resolve(2);
    expect(await Promise.all([second, latest])).toEqual([2, 2]);
    expect(maximum()).toBe(1);
  });

  it("never replaces a pending disconnect barrier with a rapid reconnect", async () => {
    const { lane, calls, maximum } = harness();
    const first = lane.submit(on);
    await tick();
    const off = lane.submit({ ...on, connected: false, camera: false });
    const reconnect = lane.submit({ ...on, microphone: true });
    calls[0].gate.resolve(1);
    await first;
    await tick();
    expect(calls[1].action).toMatchObject({
      connected: false,
      camera: false,
      microphone: false,
    });
    expect(calls).toHaveLength(2);
    calls[1].gate.resolve(2);
    expect(await off).toBe(2);
    await tick();
    expect(calls[2].action).toMatchObject({
      connected: true,
      camera: true,
      microphone: true,
    });
    calls[2].gate.resolve(3);
    expect(await reconnect).toBe(3);
    expect(maximum()).toBe(1);
  });

  it("continues the OFF-before-ON sequence after a failed in-flight request", async () => {
    const { lane, calls } = harness();
    const first = lane.submit(on);
    await tick();
    const off = lane.submit({ ...on, connected: false, camera: false });
    const reconnect = lane.submit(on);
    calls[0].gate.reject(new Error("network timeout"));
    expect(await first).toBeNull();
    await tick();
    expect(calls[1].action.connected).toBe(false);
    calls[1].gate.resolve(2);
    await off;
    await tick();
    expect(calls[2].action.connected).toBe(true);
    calls[2].gate.resolve(3);
    await reconnect;
  });

  it("does not make another slot wait behind a slow presence request", async () => {
    const { lane, calls } = harness();
    const a = lane.submit(on),
      b = lane.submit({ ...on, slot: "B" });
    await tick();
    expect(calls.map((call) => call.action.slot)).toEqual(["A", "B"]);
    calls[1].gate.resolve(2);
    expect(await b).toBe(2);
    calls[0].gate.resolve(1);
    expect(await a).toBe(1);
  });
});
