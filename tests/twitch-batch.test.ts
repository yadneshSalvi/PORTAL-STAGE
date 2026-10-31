import { afterEach, describe, expect, it, vi } from "vitest";
import { TwitchEventBatcher } from "@/lib/twitch-batch";
import { ApiError } from "@/lib/client";

afterEach(() => vi.useRealTimers());
describe("bounded browser notification forwarding", () => {
  it("sends a synthetic hundred-message burst in five ordered requests, with one request in flight", async () => {
    vi.useFakeTimers();
    const batches: number[][] = [];
    const release: (() => void)[] = [];
    let active = 0,
      maximum = 0;
    const queue = new TwitchEventBatcher<number>(
      async (batch) => {
        active += 1;
        maximum = Math.max(maximum, active);
        batches.push(batch);
        await new Promise<void>((resolve) => release.push(resolve));
        active -= 1;
      },
      vi.fn(),
      vi.fn(),
    );
    for (let i = 0; i < 100; i++) queue.push(i);
    await vi.advanceTimersByTimeAsync(250);
    expect(batches).toHaveLength(1);
    for (let i = 0; i < 5; i++) {
      release[i]();
      await vi.advanceTimersByTimeAsync(1);
    }
    expect(batches.map((batch) => batch.length)).toEqual([20, 20, 20, 20, 20]);
    expect(batches.flat()).toEqual(Array.from({ length: 100 }, (_, i) => i));
    expect(maximum).toBe(1);
    queue.stop();
  });
  it("bounds overload at200 waiting messages and drops queued work when the connector stops", async () => {
    vi.useFakeTimers();
    const failed = vi.fn(),
      send = vi.fn(async () => undefined);
    const queue = new TwitchEventBatcher<number>(send, failed, vi.fn());
    for (let i = 0; i < 200; i++) expect(queue.push(i)).toBe(true);
    expect(queue.push(201)).toBe(false);
    expect(failed).toHaveBeenCalledOnce();
    queue.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).not.toHaveBeenCalled();
  });
  it("retries a transient failure once with unchanged message IDs and reports an unresolved delivery", async () => {
    vi.useFakeTimers();
    const failed = vi.fn(),
      send = vi.fn(async () => {
        throw new ApiError("fixture timeout", 0);
      });
    const queue = new TwitchEventBatcher<{ id: string }>(send, failed, vi.fn());
    queue.push({ id: "fixture-message" });
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(5000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(
      send.mock.calls.every(
        (call) =>
          JSON.stringify(call) ===
          JSON.stringify([[{ id: "fixture-message" }]]),
      ),
    ).toBe(true);
    expect(failed).toHaveBeenCalledOnce();
    queue.stop();
  });
  it("redelivers committed-but-response-lost batches without duplicate counted identities", async () => {
    vi.useFakeTimers();
    const counted = new Set<string>(),
      failed = vi.fn();
    let attempt = 0;
    const send = vi.fn(async (batch: { id: string }[]) => {
      for (const event of batch) counted.add(event.id);
      if (++attempt === 1)
        throw new ApiError("fixture response lost after commit", 0);
    });
    const queue = new TwitchEventBatcher(send, failed, vi.fn());
    queue.push({ id: "same-original-id" });
    await vi.advanceTimersByTimeAsync(500);
    expect(send).toHaveBeenCalledTimes(2);
    expect(counted.size).toBe(1);
    expect(failed).not.toHaveBeenCalled();
    queue.stop();
  });
  it("never retries a permanent response or a stopped in-flight request", async () => {
    vi.useFakeTimers();
    const forbidden = vi.fn(async () => {
      throw new ApiError("fixture role revoked", 403);
    });
    const permanent = new TwitchEventBatcher<number>(
      forbidden,
      vi.fn(),
      vi.fn(),
    );
    permanent.push(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(forbidden).toHaveBeenCalledOnce();
    permanent.stop();
    let reject!: (error: unknown) => void;
    const flushed = vi.fn(),
      failed = vi.fn();
    const send = vi.fn(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        }),
    );
    const queue = new TwitchEventBatcher<number>(send, failed, flushed);
    queue.push(1);
    await vi.advanceTimersByTimeAsync(250);
    queue.stop();
    reject(new ApiError("fixture network failure", 0));
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledOnce();
    expect(failed).not.toHaveBeenCalled();
    expect(flushed).not.toHaveBeenCalled();
  });
  it("cancels the scheduled retry when stopped during the retry delay", async () => {
    vi.useFakeTimers();
    const send = vi.fn(async () => {
      throw new ApiError("fixture retryable", 503);
    });
    const queue = new TwitchEventBatcher<number>(send, vi.fn(), vi.fn());
    queue.push(1);
    await vi.advanceTimersByTimeAsync(250);
    queue.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledOnce();
  });
});
