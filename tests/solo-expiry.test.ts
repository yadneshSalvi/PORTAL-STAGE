import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  sleep: vi.fn(async (_when: Date | string) => undefined),
}));
vi.mock("@/server/solo-closure", () => ({ closeSoloReservation: mocks.close }));
vi.mock("workflow", () => ({
  sleep: mocks.sleep,
  FatalError: class FatalError extends Error {},
}));

import { closeRooms, expireSoloSession } from "@/workflows/solo-expiry";

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("bounded solo expiry workflow", () => {
  it("waits for the immutable deadline and completes successful cleanup", async () => {
    mocks.close.mockResolvedValue({ closed: true, stale: false });
    const deadline = Date.UTC(2026, 10, 1, 12, 20);
    expect(
      await expireSoloSession(
        "fixture-show",
        "fixture-reservation",
        1,
        deadline,
      ),
    ).toEqual({ closed: true, stale: false });
    expect(mocks.sleep).toHaveBeenCalledExactlyOnceWith(new Date(deadline));
    expect(mocks.close).toHaveBeenCalledExactlyOnceWith(
      "fixture-show",
      "fixture-reservation",
      1,
    );
    expect(closeRooms.maxRetries).toBe(0);
  });

  it("retries a transient cleanup after thirty seconds", async () => {
    mocks.close
      .mockRejectedValueOnce(new Error("fixture transient failure"))
      .mockResolvedValue({ closed: true, stale: false });
    expect(
      await expireSoloSession("fixture-show", "fixture-reservation", 1, 0),
    ).toEqual({ closed: true, stale: false });
    expect(mocks.close).toHaveBeenCalledTimes(2);
    expect(mocks.sleep.mock.calls.map((call) => call[0])).toEqual([
      new Date(0),
      "30s",
    ]);
  });

  it("stops after five failed passes and leaves recovery to later requests or the director", async () => {
    mocks.close.mockRejectedValue(
      new Error("fixture persistent provider outage"),
    );
    await expect(
      expireSoloSession("fixture-show", "fixture-reservation", 1, 0),
    ).rejects.toThrow("retries exhausted");
    expect(mocks.close).toHaveBeenCalledTimes(5);
    expect(mocks.sleep).toHaveBeenCalledTimes(5);
    expect(
      mocks.sleep.mock.calls.slice(1).every((call) => call[0] === "30s"),
    ).toBe(true);
  });

  it("finishes a stale generation without claiming its replacement was closed", async () => {
    mocks.close.mockResolvedValue({ closed: false, stale: true });
    expect(
      await expireSoloSession("fixture-show", "old-reservation", 1, 0),
    ).toEqual({ closed: false, stale: true });
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
