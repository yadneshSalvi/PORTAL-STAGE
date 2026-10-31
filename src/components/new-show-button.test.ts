import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionInfo } from "@/lib/contracts";
import { createShow, getSession } from "@/lib/client";
import { createRecord } from "@/server/core";
import { createShowWithRecovery } from "./new-show-button";

vi.mock("@/lib/client", () => ({ createShow: vi.fn(), getSession: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const session = (currentShowId: string | null): SessionInfo => ({
  authenticated: true,
  hostAllowed: false,
  soloAllowed: true,
  displayName: "TestHost",
  login: "test_host",
  twitchConnected: true,
  currentShowId,
  services: {
    database: "postgres",
    mediaConfigured: true,
    twitchConfigured: true,
  },
});
const original =
  "Media closure scheduling is unavailable. Open the reserved show to recover.";
const sessions = vi.mocked(getSession),
  creation = vi.mocked(createShow);
beforeEach(() => vi.resetAllMocks());

describe("explicit solo creation recovery", () => {
  it("offers the newly reserved show after scheduling fails without creating again", async () => {
    sessions
      .mockResolvedValueOnce(session("ps_before"))
      .mockResolvedValueOnce(session("ps_reserved"));
    creation.mockRejectedValueOnce(new Error(original));
    expect(await createShowWithRecovery("solo", "midnight-parcel")).toEqual({
      ok: false,
      error: original,
      reservedShowId: "ps_reserved",
    });
    expect(creation).toHaveBeenCalledExactlyOnceWith("solo", "midnight-parcel");
    expect(sessions).toHaveBeenCalledTimes(2);
  });
  it.each([
    ["ps_before", "ps_before"],
    ["ps_before", null],
    [null, null],
  ] as const)(
    "does not link an unchanged or absent current show (%s → %s)",
    async (before, after) => {
      sessions
        .mockResolvedValueOnce(session(before))
        .mockResolvedValueOnce(session(after));
      creation.mockRejectedValueOnce(new Error(original));
      expect(await createShowWithRecovery("solo", "borrowed-weather")).toEqual({
        ok: false,
        error: original,
        reservedShowId: null,
      });
      expect(creation).toHaveBeenCalledTimes(1);
    },
  );
  it("preserves the original creation error when the recovery lookup also fails", async () => {
    sessions
      .mockResolvedValueOnce(session(null))
      .mockRejectedValueOnce(new Error("Session refresh is offline"));
    creation.mockRejectedValueOnce(new Error(original));
    expect(await createShowWithRecovery("solo", "borrowed-weather")).toEqual({
      ok: false,
      error: original,
      reservedShowId: null,
    });
    expect(creation).toHaveBeenCalledTimes(1);
  });
  it("does not infer a reservation when preflight failed before creation", async () => {
    sessions.mockRejectedValueOnce(new Error("Session preflight failed"));
    expect(await createShowWithRecovery("solo", "borrowed-weather")).toEqual({
      ok: false,
      error: "Session preflight failed",
      reservedShowId: null,
    });
    expect(sessions).toHaveBeenCalledTimes(1);
    expect(creation).not.toHaveBeenCalled();
  });
  it.each(["rehearsal", "live"] as const)(
    "does not run solo recovery for a failed %s creation",
    async (mode) => {
      sessions.mockResolvedValueOnce(session("ps_before"));
      creation.mockRejectedValueOnce(new Error(original));
      expect(await createShowWithRecovery(mode, "borrowed-weather")).toEqual({
        ok: false,
        error: original,
        reservedShowId: null,
      });
      expect(sessions).toHaveBeenCalledTimes(1);
      expect(creation).toHaveBeenCalledTimes(1);
    },
  );
  it("navigates to a successfully created show without a recovery lookup", async () => {
    sessions.mockResolvedValueOnce(session("ps_before"));
    creation.mockResolvedValueOnce({
      show: createRecord("ps_created", "unit-host", "solo", 1000).state,
      role: "director",
      slot: "A",
      serverNow: 1000,
    });
    expect(await createShowWithRecovery("solo", "borrowed-weather")).toEqual({
      ok: true,
      showId: "ps_created",
    });
    expect(sessions).toHaveBeenCalledTimes(1);
    expect(creation).toHaveBeenCalledTimes(1);
  });
});
