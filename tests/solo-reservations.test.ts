import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const records = vi.hoisted(() => new Map<string, unknown>());
const hooks = vi.hoisted(() => ({
  afterUpdate: null as ((id: string) => Promise<void>) | null,
}));
const mocks = vi.hoisted(() => ({
  start: vi.fn(async (..._args: unknown[]) => ({
    runId: "fixture-workflow-receipt",
  })),
  createRoom: vi.fn(async (_options: { name: string }) => ({})),
  removeParticipant: vi.fn(async (..._args: unknown[]) => undefined),
  deleteRoom: vi.fn(async (_name: string) => undefined),
}));
vi.mock("workflow/api", () => ({ start: mocks.start }));
vi.mock("@/server/store", () => ({
  getStore: () => ({
    get: async (id: string) => structuredClone(records.get(id) ?? null),
    create: async (id: string, value: unknown) => {
      if (records.has(id)) return false;
      records.set(id, structuredClone(value));
      return true;
    },
    update: async (id: string, change: (value: any) => unknown) => {
      const value = structuredClone(records.get(id));
      if (!value) throw new Error("Missing fixture");
      const result = change(value);
      records.set(id, value);
      await hooks.afterUpdate?.(id);
      return result;
    },
  }),
}));
vi.mock("@/server/twitch-grants", async (original) => ({
  ...(await original<typeof import("@/server/twitch-grants")>()),
  ensureOAuthGrant: vi.fn(async () => ({
    userId: "101",
    login: "ordinary_host",
    accessToken: "fixture-only-access",
    scopes: ["user:read:chat"],
    expiresAt: Date.now() + 3600_000,
  })),
  validateTwitchToken: vi.fn(async () => ({
    client_id: "fixture-app",
    user_id: "101",
    login: "ordinary_host",
    expires_in: 3600,
    scopes: ["user:read:chat"],
  })),
}));
vi.mock("livekit-server-sdk", async (original) => ({
  ...(await original<typeof import("livekit-server-sdk")>()),
  RoomServiceClient: class {
    createRoom = mocks.createRoom;
    removeParticipant = mocks.removeParticipant;
    deleteRoom = mocks.deleteRoom;
  },
}));

import {
  createShow,
  invite,
  sessionInfo,
  hostAllowed,
  command,
} from "@/server/shows";
import { acquireLease } from "@/server/core";
import { mintMediaToken } from "@/server/media";
import { closeSoloReservation } from "@/server/solo-closure";
import {
  allocateSolo,
  SOLO_QUOTA_KEY,
  soloLimits,
  reserveSolo,
  recoverUnissuedReservations,
  confirmSoloQuota,
  type SoloQuota,
} from "@/server/solo-policy";
import type { SessionRecord, ShowRecord } from "@/server/records";
import { sign } from "@/server/security";
import { finishOAuth, startOAuth } from "@/server/twitch";
import { TokenVerifier } from "livekit-server-sdk";

const owner = "123e4567-e89b-12d3-a456-426614174099";
const now = Date.UTC(2026, 10, 1, 12);
function request() {
  return new Request("http://localhost:3200/api", {
    headers: {
      Cookie: `portal_session=${sign({ id: owner, expiresAt: Date.now() + 3600_000 })}`,
      Origin: "http://localhost:3200",
    },
  });
}
const read = (id: string) => records.get(`show:${id}`) as ShowRecord;
const quota = () => records.get(SOLO_QUOTA_KEY) as SoloQuota;
async function reserved() {
  const result = await createShow(owner, "solo", request());
  const record = read(result.show.id);
  acquireLease(record, "fixture-renderer", false, Date.now());
  Object.assign(record.state.participants.A, {
    consentBroadcast: true,
    calibrated: true,
  });
  return record;
}
beforeEach(() => {
  records.clear();
  hooks.afterUpdate = null;
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.resetAllMocks();
  mocks.start.mockResolvedValue({ runId: "fixture-workflow-receipt" });
  mocks.createRoom.mockResolvedValue({});
  mocks.removeParticipant.mockResolvedValue(undefined);
  mocks.deleteRoom.mockResolvedValue(undefined);
  vi.stubEnv(
    "SESSION_SECRET",
    "fixture-only-solo-session-secret-32-characters",
  );
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", "55".repeat(32));
  vi.stubEnv("APP_BASE_URL", "http://localhost:3200");
  vi.stubEnv(
    "TWITCH_REDIRECT_URI",
    "http://localhost:3200/auth/twitch/callback",
  );
  vi.stubEnv("TWITCH_CLIENT_ID", "fixture-app");
  vi.stubEnv("TWITCH_CLIENT_SECRET", "fixture-only-app-secret");
  vi.stubEnv("TWITCH_ALLOWED_HOSTS", "invited_somebody_else");
  vi.stubEnv("DATABASE_URL", "postgres://fixture-only-not-contacted");
  vi.stubEnv("LIVEKIT_URL", "wss://fixture-only.invalid");
  vi.stubEnv("LIVEKIT_API_KEY", "fixture-only-key");
  vi.stubEnv(
    "LIVEKIT_API_SECRET",
    "fixture-only-media-signing-secret-32-chars",
  );
  vi.stubEnv("PORTAL_PUBLIC_SOLO", "1");
  vi.stubEnv("PORTAL_SOLO_PER_ACCOUNT_DAILY", "3");
  vi.stubEnv("PORTAL_SOLO_GLOBAL_DAILY", "30");
  vi.stubEnv("PORTAL_SOLO_GLOBAL_CONCURRENT", "5");
  vi.stubEnv("PORTAL_SOLO_SESSION_SECONDS", "1200");
  records.set(`session:${owner}`, {
    id: owner,
    createdAt: now,
    currentShowId: null,
    rates: {},
    credentialId: "credential:fixture",
    userId: "101",
    login: "ordinary_host",
    displayName: "Ordinary Host",
  } satisfies SessionRecord);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        access_token: "fixture-only-new-access",
        refresh_token: "fixture-only-new-refresh",
      }),
    ),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("durable solo reservation and public account eligibility", () => {
  it("reclaims a proven unissued orphan after its grace without refunding its daily charge", async () => {
    const auth = records.get(`session:${owner}`) as SessionRecord;
    const pending = await reserveSolo(auth, "ps_0000000000000001", now);
    await recoverUnissuedReservations(now + 59_999);
    expect(Object.keys(quota().active)).toHaveLength(1);
    await recoverUnissuedReservations(now + 60_000);
    expect(quota().active).toEqual({});
    expect(Object.values(quota().days)[0].total).toBe(1);
    await expect(
      confirmSoloQuota("ps_0000000000000001", pending, "late-receipt"),
    ).rejects.toMatchObject({ code: "solo_closed" });
    expect(mocks.createRoom).not.toHaveBeenCalled();
  });
  it("a late scheduler receipt cannot revive a reservation already reclaimed while the response was lost", async () => {
    let resolve!: (value: { runId: string }) => void;
    mocks.start.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const creation = createShow(owner, "solo", request());
    for (let i = 0; i < 40 && !mocks.start.mock.calls.length; i++)
      await Promise.resolve();
    expect(mocks.start).toHaveBeenCalledOnce();
    const id = (records.get(`session:${owner}`) as SessionRecord)
      .currentShowId!;
    vi.setSystemTime(now + 60_001);
    await recoverUnissuedReservations();
    expect(read(id).state.phase).toBe("ended");
    expect(quota().active).toEqual({});
    resolve({ runId: "late-fixture-receipt" });
    await expect(creation).rejects.toMatchObject({ code: "solo_closed" });
    await expect(
      mintMediaToken(id, request(), { purpose: "output-view" }),
    ).rejects.toMatchObject({ code: "solo_closed" });
    expect(Object.values(quota().days)[0].total).toBe(1);
  });
  it("never reclaims a confirmed workflow or an issued identity on age alone", async () => {
    const record = await reserved(),
      reservation = record.soloReservation!;
    vi.setSystemTime(now + 61_000);
    await recoverUnissuedReservations();
    expect(quota().active[reservation.id].confirmed).toBe(true);
    quota().active[reservation.id].confirmed = false;
    delete record.soloReservation!.runId;
    record.soloReservation!.issued.push({
      room: `portal-${record.state.id}-program`,
      identity: "issued-disconnected-fixture",
      issuedAt: now,
      expiresAt: now + 120_000,
    });
    await recoverUnissuedReservations();
    expect(quota().active[reservation.id]).toBeDefined();
  });
  it("admits an ordinary authenticated Twitch account without the duet allowlist and schedules before media", async () => {
    expect(hostAllowed(records.get(`session:${owner}`) as SessionRecord)).toBe(
      false,
    );
    const record = await reserved();
    expect(record.soloReservation).toMatchObject({
      status: "scheduled",
      runId: "fixture-workflow-receipt",
      expiresAt: now + 1200_000,
    });
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.createRoom).not.toHaveBeenCalled();
    expect(await sessionInfo(owner)).toMatchObject({
      soloAllowed: true,
      hostAllowed: false,
      soloUsage: { remaining: 2, available: false },
    });
    await expect(invite(record.state.id, request(), "B")).rejects.toMatchObject(
      { code: "audience_room_only" },
    );
  });
  it("keeps quota and denies every media purpose when scheduling outcome is uncertain", async () => {
    mocks.start.mockRejectedValueOnce(new Error("fixture uncertain scheduler"));
    await expect(createShow(owner, "solo", request())).rejects.toMatchObject({
      code: "solo_schedule",
    });
    const session = records.get(`session:${owner}`) as SessionRecord,
      record = read(session.currentShowId!);
    expect(record.soloReservation?.status).toBe("uncertain");
    expect(Object.keys(quota().active)).toHaveLength(1);
    for (const purpose of [
      "director",
      "output-publish",
      "output-view",
      "performer",
    ])
      await expect(
        mintMediaToken(record.state.id, request(), { purpose }),
      ).rejects.toMatchObject({ code: "solo_closed" });
    expect(mocks.createRoom).not.toHaveBeenCalled();
    expect(record.soloReservation?.issued).toHaveLength(0);
    await expect(createShow(owner, "solo", request())).rejects.toMatchObject({
      code: "solo_active",
    });
    expect(mocks.start).toHaveBeenCalledOnce();
  });
  it("arbitrates account, global daily, and concurrent limits without releasing uncertain expired reservations", () => {
    const value: SoloQuota = { days: {}, active: {} };
    for (let i = 0; i < 3; i++) {
      allocateSolo(value, "account-a", `show-${i}`, `reservation-${i}`, now);
      delete value.active[`reservation-${i}`];
    }
    expect(() =>
      allocateSolo(value, "account-a", "show-4", "reservation-4", now),
    ).toThrow();
    for (let i = 0; i < 5; i++)
      allocateSolo(value, `account-${i}`, `show-${i}`, `active-${i}`, now);
    expect(() =>
      allocateSolo(value, "another", "show-x", "active-x", now + 3600_000),
    ).toThrow();
    vi.stubEnv("PORTAL_SOLO_GLOBAL_DAILY", "8");
    value.active = {};
    expect(() =>
      allocateSolo(value, "another", "show-x", "active-x", now),
    ).toThrow();
    expect(soloLimits().globalDaily).toBe(8);
  });
  it("does not encrypt or retain a new grant when hosting is unavailable to that account", async () => {
    vi.stubEnv("PORTAL_PUBLIC_SOLO", "0");
    const session = records.get(`session:${owner}`) as SessionRecord;
    delete session.credentialId;
    const oauth = new URL(await startOAuth(owner));
    expect(
      await finishOAuth(
        owner,
        oauth.searchParams.get("state")!,
        "fixture-code",
      ),
    ).toBe(false);
    expect(
      [...records.keys()].filter((key) => key.startsWith("credential:")),
    ).toEqual([]);
    expect(records.get(`session:${owner}`)).not.toHaveProperty("credentialId");
    expect(JSON.stringify([...records.values()])).not.toContain(
      "fixture-only-new-refresh",
    );
  });
  it("stores a fresh encrypted OAuth grant for a capped public solo host", async () => {
    const session = records.get(`session:${owner}`) as SessionRecord;
    delete session.credentialId;
    const oauth = new URL(await startOAuth(owner));
    expect(
      await finishOAuth(
        owner,
        oauth.searchParams.get("state")!,
        "fixture-code",
      ),
    ).toBe(true);
    const credential = [...records.entries()].find(([key]) =>
      key.startsWith("credential:"),
    )?.[1];
    expect(credential).toMatchObject({
      source: "oauth-code",
      ownerId: owner,
      status: "ready",
    });
    expect(JSON.stringify(credential)).not.toContain(
      "fixture-only-new-refresh",
    );
  });
});

describe("solo issuance and closure races", () => {
  it("can repeat an ended cue and finish provider cleanup without changing the deadline or ownership", async () => {
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
    await mintMediaToken(id, request(), { purpose: "output-view" });
    await command(id, request(), {
      action: { type: "end" },
      idempotencyKey: "first-end-fixture",
      epoch: 1,
    });
    mocks.removeParticipant.mockRejectedValueOnce(
      new Error("fixture provider outage"),
    );
    await expect(
      closeSoloReservation(id, reservation.id, 1, undefined, Date.now(), true),
    ).rejects.toThrow();
    const generation = read(id).outputGeneration;
    await command(id, request(), {
      action: { type: "end" },
      idempotencyKey: "retry-end-fixture",
      epoch: 1,
    });
    await closeSoloReservation(
      id,
      reservation.id,
      1,
      undefined,
      Date.now(),
      true,
    );
    expect(read(id).outputGeneration).toBe(generation);
    expect(read(id).soloReservation?.expiresAt).toBe(reservation.expiresAt);
    expect(quota().active).toEqual({});
  });
  it("ends an uncertain unissued reservation without depending on unavailable provider cleanup", async () => {
    mocks.start.mockRejectedValueOnce(
      new Error("fixture no scheduler receipt"),
    );
    await expect(createShow(owner, "solo", request())).rejects.toThrow();
    const id = (records.get(`session:${owner}`) as SessionRecord)
        .currentShowId!,
      reservation = read(id).soloReservation!;
    mocks.deleteRoom.mockRejectedValue(new Error("fixture provider outage"));
    await command(id, request(), {
      action: { type: "end" },
      idempotencyKey: "end-uncertain-fixture",
      epoch: 1,
    });
    await closeSoloReservation(
      id,
      reservation.id,
      1,
      undefined,
      Date.now(),
      true,
    );
    expect(mocks.removeParticipant).not.toHaveBeenCalled();
    expect(mocks.deleteRoom).not.toHaveBeenCalled();
    expect(quota().active).toEqual({});
    expect(Object.values(quota().days)[0].total).toBe(1);
  });
  it("uses a fresh future revocation cutoff after deletion to cover refreshes during delayed removal", async () => {
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
    await mintMediaToken(id, request(), { purpose: "output-view" });
    vi.setSystemTime(reservation.expiresAt);
    mocks.deleteRoom.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 6000);
    });
    await closeSoloReservation(id, reservation.id, 1);
    const [first, second] = mocks.removeParticipant.mock.calls.map(
      (call) => (call[2] as { revokeTokenTs: bigint }).revokeTokenTs,
    );
    expect(second).toBeGreaterThan(first);
    expect(second).toBe(BigInt(Math.floor(Date.now() / 1000) + 30));
  });
  it("ledgers a signed identity, uses bounded room configuration without a CreateRoom RPC, and cannot mint a human B", async () => {
    const record = await reserved(),
      id = record.state.id;
    vi.setSystemTime(record.soloReservation!.expiresAt - 45_000);
    acquireLease(read(id), "fixture-renderer", false, Date.now());
    const token = await mintMediaToken(id, request(), {
      purpose: "director",
      rendererId: "fixture-renderer",
      epoch: read(id).state.epoch,
    });
    const decoded = await new TokenVerifier(
      "fixture-only-key",
      "fixture-only-media-signing-secret-32-chars",
    ).verify(token.token);
    expect(Number(decoded.exp) * 1000).toBeLessThanOrEqual(
      record.soloReservation!.expiresAt,
    );
    expect(read(id).soloReservation?.issued).toHaveLength(1);
    expect(mocks.createRoom).not.toHaveBeenCalled();
    expect(decoded.roomConfig).toMatchObject({
      name: token.room,
      maxParticipants: 1,
      emptyTimeout: 60,
      departureTimeout: 30,
    });
    await expect(
      mintMediaToken(id, request(), { purpose: "performer" }),
    ).rejects.toMatchObject({ code: "guest_required" });
  });
  it("denies a JWT after closure wins the race against its final issuance fence", async () => {
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
    hooks.afterUpdate = async (key) => {
      if (key !== `show:${id}` || !read(id).soloReservation?.issued.length)
        return;
      hooks.afterUpdate = null;
      vi.setSystemTime(reservation.expiresAt + 1);
      await closeSoloReservation(id, reservation.id, 1);
    };
    await expect(
      mintMediaToken(id, request(), {
        purpose: "director",
        rendererId: "fixture-renderer",
        epoch: 1,
      }),
    ).rejects.toMatchObject({ code: "solo_closed" });
    expect(read(id).soloReservation?.status).toBe("closed");
    expect(mocks.removeParticipant).toHaveBeenCalledTimes(2);
    expect(mocks.createRoom).not.toHaveBeenCalled();
    expect(mocks.deleteRoom).toHaveBeenCalledTimes(2);
    expect(quota().active).toEqual({});
  });
  it("revokes all issued identities including disconnected ones, before closing both rooms", async () => {
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
    await mintMediaToken(id, request(), {
      purpose: "director",
      rendererId: "fixture-renderer",
      epoch: 1,
    });
    await mintMediaToken(id, request(), {
      purpose: "output-publish",
      rendererId: "fixture-renderer",
      epoch: 1,
    });
    await mintMediaToken(id, request(), { purpose: "output-view" });
    vi.setSystemTime(reservation.expiresAt);
    expect(await closeSoloReservation(id, reservation.id, 1)).toEqual({
      closed: true,
      stale: false,
    });
    expect(mocks.removeParticipant).toHaveBeenCalledTimes(6);
    for (const call of mocks.removeParticipant.mock.calls)
      expect(call[2]).toEqual({
        revokeTokenTs: BigInt(Math.floor(Date.now() / 1000) + 30),
      });
    expect(mocks.deleteRoom.mock.calls.map((call) => call[0]).sort()).toEqual([
      `portal-${id}-backstage`,
      `portal-${id}-program`,
    ]);
    expect(
      Math.max(...mocks.removeParticipant.mock.invocationCallOrder.slice(0, 3)),
    ).toBeLessThan(Math.min(...mocks.deleteRoom.mock.invocationCallOrder));
    expect(
      Math.min(...mocks.removeParticipant.mock.invocationCallOrder.slice(3)),
    ).toBeGreaterThan(Math.max(...mocks.deleteRoom.mock.invocationCallOrder));
    expect(read(id).state.phase).toBe("ended");
    expect(read(id).soloReservation?.status).toBe("closed");
    expect(quota().active).toEqual({});
    await closeSoloReservation(id, reservation.id, 1);
    expect(mocks.removeParticipant).toHaveBeenCalledTimes(6);
  });
  it("retains capacity on uncertain provider revocation and retries without reopening minting", async () => {
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
    await mintMediaToken(id, request(), { purpose: "output-view" });
    vi.setSystemTime(reservation.expiresAt);
    mocks.removeParticipant.mockRejectedValueOnce(
      new Error("fixture provider outage"),
    );
    await expect(closeSoloReservation(id, reservation.id, 1)).rejects.toThrow(
      "retry required",
    );
    expect(read(id).soloReservation?.status).toBe("closing");
    expect(Object.keys(quota().active)).toHaveLength(1);
    await expect(
      mintMediaToken(id, request(), { purpose: "output-view" }),
    ).rejects.toMatchObject({ code: "solo_closed" });
    await closeSoloReservation(id, reservation.id, 1);
    expect(quota().active).toEqual({});
    expect(mocks.removeParticipant).toHaveBeenCalledTimes(4);
  });
  it("a stale reservation or generation never removes a newer session's media", async () => {
    const record = await reserved(),
      id = record.state.id;
    expect(await closeSoloReservation(id, "older-reservation", 1)).toEqual({
      closed: false,
      stale: true,
    });
    expect(
      await closeSoloReservation(id, record.soloReservation!.id, 0),
    ).toEqual({ closed: false, stale: true });
    expect(mocks.removeParticipant).not.toHaveBeenCalled();
    expect(mocks.deleteRoom).not.toHaveBeenCalled();
    expect(read(id).state.phase).toBe("backstage");
  });
});
