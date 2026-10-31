import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PresenceReporter,
  PRESENCE_HEARTBEAT_MS,
} from "../src/media/presence-reporter";

const ON = { connected: true, camera: true, microphone: false };
const OFF = { connected: false, camera: false, microphone: false };
const flush = () => vi.advanceTimersByTimeAsync(0);
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
});
afterEach(() => vi.useRealTimers());

describe("bounded media presence", () => {
  it("suppresses identical action notifications until the heartbeat is due", async () => {
    const callback = vi.fn(async () => undefined);
    const reporter = new PresenceReporter(callback, Date.now, vi.fn());
    reporter.report(ON);
    reporter.report(ON);
    reporter.report(ON);
    await flush();
    expect(callback).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(PRESENCE_HEARTBEAT_MS - 1);
    reporter.report(ON);
    await flush();
    expect(callback).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    reporter.report(ON);
    await flush();
    expect(callback).toHaveBeenCalledTimes(2);
  });
  it("keeps one latest pending sample and discards stale true heartbeat backlog on disconnect", async () => {
    const releases: Array<() => void> = [];
    const callback = vi.fn(
      () => new Promise<void>((resolve) => releases.push(resolve)),
    );
    const reporter = new PresenceReporter(callback, Date.now, vi.fn());
    reporter.report(ON);
    await flush();
    for (let i = 0; i < 100; i++)
      reporter.report({ ...ON, microphone: i % 2 === 0 });
    await vi.advanceTimersByTimeAsync(16_000);
    reporter.report(ON);
    reporter.report(OFF);
    reporter.report(OFF);
    expect(callback).toHaveBeenCalledTimes(1);
    releases[0]();
    await flush();
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith(OFF);
    releases[1]();
    await flush();
    expect(callback).toHaveBeenCalledTimes(2);
  });
  it("preserves a disconnect barrier during a rapid reconnect", async () => {
    const releases: Array<() => void> = [];
    const callback = vi.fn(
      () => new Promise<void>((resolve) => releases.push(resolve)),
    );
    const reporter = new PresenceReporter(callback, Date.now, vi.fn());
    reporter.report(ON);
    await flush();
    reporter.report(OFF);
    reporter.report(ON);
    releases[0]();
    await flush();
    expect(callback).toHaveBeenLastCalledWith(OFF);
    releases[1]();
    await flush();
    expect(callback).toHaveBeenLastCalledWith(ON);
    releases[2]();
    await flush();
    expect(callback).toHaveBeenCalledTimes(3);
  });
  it("reports changed devices immediately without waiting for the heartbeat", async () => {
    const callback = vi.fn(async () => undefined);
    const reporter = new PresenceReporter(callback, Date.now, vi.fn());
    reporter.report(ON);
    await flush();
    reporter.report({ ...ON, microphone: true });
    await flush();
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith({ ...ON, microphone: true });
  });
  it("does not retry forever after a slow callback or an error without a fresh sample", async () => {
    const error = vi.fn();
    let release!: () => void;
    const callback = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const reporter = new PresenceReporter(callback, Date.now, error);
    reporter.report(ON);
    await flush();
    await vi.advanceTimersByTimeAsync(30_000);
    release();
    await flush();
    expect(callback).toHaveBeenCalledTimes(1);
    callback.mockRejectedValueOnce(new Error("offline"));
    reporter.report(ON);
    await flush();
    expect(error).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
