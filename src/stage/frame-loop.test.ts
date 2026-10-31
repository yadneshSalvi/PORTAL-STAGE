import { describe, expect, it, vi } from "vitest";
import { HIDDEN_FRAME_MS, startStageFrameLoop } from "./frame-loop";

function clock() {
  let time = 0;
  let hidden = false;
  let nextId = 0;
  const tasks = new Map<
    number,
    { at: number; kind: string; run: () => void }
  >();
  const listeners = new Set<() => void>();
  const environment = {
    hidden: () => hidden,
    now: () => time,
    requestFrame: (callback: FrameRequestCallback) => {
      const id = ++nextId;
      tasks.set(id, {
        at: time + 1000 / 60,
        kind: "frame",
        run: () => callback(time),
      });
      return id;
    },
    cancelFrame: (id: number) => {
      tasks.delete(id);
    },
    setTimer: (run: () => void, delay: number) => {
      const id = ++nextId;
      tasks.set(id, { at: time + delay, kind: "timer", run });
      return id;
    },
    clearTimer: (id: number) => {
      tasks.delete(id);
    },
    listen: (callback: () => void) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
  };
  return {
    environment,
    tasks,
    listeners,
    setHidden(value: boolean) {
      hidden = value;
      listeners.forEach((callback) => callback());
    },
    advance(ms: number) {
      const target = time + ms;
      for (;;) {
        const next = [...tasks].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > target) break;
        tasks.delete(next[0]);
        time = next[1].at;
        next[1].run();
      }
      time = target;
    },
  };
}

describe("canonical stage frame scheduling", () => {
  it("bounds visible drawing and switches to one reduced timer while hidden", () => {
    const runtime = clock();
    const draw = vi.fn();
    const stop = startStageFrameLoop(draw, runtime.environment);
    runtime.advance(1000);
    expect(draw.mock.calls.length).toBeGreaterThanOrEqual(29);
    expect(draw.mock.calls.length).toBeLessThanOrEqual(31);
    runtime.setHidden(true);
    draw.mockClear();
    expect([...runtime.tasks.values()].map((task) => task.kind)).toEqual([
      "timer",
    ]);
    runtime.advance(1000);
    expect(draw).toHaveBeenCalledTimes(8);
    expect(runtime.tasks.size).toBe(1);
    stop();
  });

  it("redraws on return without retaining a hidden loop", () => {
    const runtime = clock();
    const draw = vi.fn();
    const stop = startStageFrameLoop(draw, runtime.environment);
    runtime.setHidden(true);
    runtime.advance(HIDDEN_FRAME_MS);
    const lateHiddenCallback = [...runtime.tasks.values()][0].run;
    const beforeReturn = draw.mock.calls.length;
    runtime.setHidden(false);
    expect(draw.mock.calls.length).toBe(beforeReturn + 1);
    expect([...runtime.tasks.values()].map((task) => task.kind)).toEqual([
      "frame",
    ]);
    lateHiddenCallback();
    expect(draw.mock.calls.length).toBe(beforeReturn + 1);
    expect(runtime.tasks.size).toBe(1);
    runtime.setHidden(true);
    runtime.setHidden(false);
    expect(runtime.tasks.size).toBe(1);
    stop();
  });

  it("cancels callbacks and visibility listeners on cleanup, including a late callback", () => {
    const runtime = clock();
    const draw = vi.fn();
    const stop = startStageFrameLoop(draw, runtime.environment);
    runtime.setHidden(true);
    const lateCallback = [...runtime.tasks.values()][0].run;
    const count = draw.mock.calls.length;
    stop();
    lateCallback();
    runtime.advance(10_000);
    runtime.setHidden(false);
    expect(draw.mock.calls.length).toBe(count);
    expect(runtime.tasks.size).toBe(0);
    expect(runtime.listeners.size).toBe(0);
  });
});
