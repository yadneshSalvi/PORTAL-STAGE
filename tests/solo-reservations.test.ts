import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const records = vi.hoisted(() => new Map<string, unknown>());
const hooks = vi.hoisted(() => ({
  beforeCreate: null as ((id: string) => Promise<void>) | null,
  beforeUpdate: null as ((id: string) => Promise<void>) | null,
  afterUpdate: null as ((id: string) => Promise<void>) | null,
}));
const mocks = vi.hoisted(() => ({
  start: vi.fn(async (..._args: unknown[]) => ({
    runId: "fixture-workflow-receipt",
  })),
  createRoom: vi.fn(async (_options: { name: string }) => ({})),
  removeParticipant: vi.fn(async (..._args: unknown[]) => undefined),
  deleteRoom: vi.fn(async (_name: string) => undefined),
  serviceOptions: vi.fn((_options: unknown) => undefined),
}));
vi.mock("workflow/api", () => ({ start: mocks.start }));
vi.mock("@/server/store", () => ({
  getStore: () => ({
    get: async (id: string) => structuredClone(records.get(id) ?? null),
    create: async (id: string, value: unknown) => {
      if (hooks.beforeCreate) await hooks.beforeCreate(id);
      if (records.has(id)) return false;
      records.set(id, structuredClone(value));
      return true;
    },
    update: async (id: string, change: (value: any) => unknown) => {
      if (hooks.beforeUpdate) await hooks.beforeUpdate(id);
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
    constructor(...args: unknown[]) {
      mocks.serviceOptions(args[3]);
    }
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
import { acquireLease, createRecord, expireState } from "@/server/core";
import { mintMediaToken } from "@/server/media";
import { closeSoloReservation } from "@/server/solo-closure";
import {
  allocateSolo,
  SOLO_QUOTA_KEY,
  soloLimits,
  reserveSolo,
  recoverSoloReservations,
  confirmSoloQuota,
  refundFailedSoloStart,
  soloUsage,
  type SoloQuota,
} from "@/server/solo-policy";
import type { SessionRecord, ShowRecord } from "@/server/records";
import { sign } from "@/server/security";
import { finishOAuth, startOAuth } from "@/server/twitch";
import { TokenVerifier } from "livekit-server-sdk";
import { POST } from "@/app/api/shows/[showId]/[...action]/route";

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
async function flushBackoff<T>(pending: Promise<T>): Promise<T> {
  const settled = pending.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await vi.runAllTimersAsync();
  const result = await settled;
  if (!result.ok) throw result.error;
  return result.value;
}
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
  hooks.beforeCreate = null;
  hooks.beforeUpdate = null;
  hooks.afterUpdate = null;
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
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
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("durable solo reservation and public account eligibility", () => {
  it("reclaims a proven unissued orphan after its grace and refunds its daily account/global charge", async () => {
    const auth = records.get(`session:${owner}`) as SessionRecord;
    const pending = await reserveSolo(auth, "ps_0000000000000001", now);
    await recoverSoloReservations(now + 59_999);
    expect(Object.keys(quota().active)).toHaveLength(1);
    await recoverSoloReservations(now + 60_000);
    expect(quota().active).toEqual({});
    expect(Object.values(quota().days)[0]).toEqual({ total: 0, accounts: {} });
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
    await recoverSoloReservations();
    expect(read(id).state.phase).toBe("ended");
    expect(quota().active).toEqual({});
    resolve({ runId: "late-fixture-receipt" });
    await expect(creation).rejects.toMatchObject({ code: "solo_closed" });
    await expect(
      mintMediaToken(id, request(), { purpose: "output-view" }),
    ).rejects.toMatchObject({ code: "solo_closed" });
    expect(Object.values(quota().days)[0]).toEqual({ total: 0, accounts: {} });
  });
  it("never reclaims a confirmed workflow or an issued identity on age alone", async () => {
    const record = await reserved(),
      reservation = record.soloReservation!;
    vi.setSystemTime(now + 61_000);
    await recoverSoloReservations();
    expect(quota().active[reservation.id].confirmed).toBe(true);
    quota().active[reservation.id].confirmed = false;
    delete record.soloReservation!.runId;
    record.soloReservation!.issued.push({
      room: `portal-${record.state.id}-program`,
      identity: "issued-disconnected-fixture",
      issuedAt: now,
      expiresAt: now + 120_000,
    });
    await recoverSoloReservations();
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
  it("refunds a failed schedule before any media and denies every purpose on that failed show", async () => {
    mocks.start.mockRejectedValueOnce(new Error("fixture uncertain scheduler"));
    await expect(createShow(owner, "solo", request())).rejects.toMatchObject({
      code: "solo_schedule",
    });
    const session = records.get(`session:${owner}`) as SessionRecord,
      record = read(session.currentShowId!);
    expect(record.soloReservation?.status).toBe("closed");
    expect(Object.keys(quota().active)).toHaveLength(0);
    expect(Object.values(quota().days)[0]).toEqual({ total: 0, accounts: {} });
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
    expect((await createShow(owner, "solo", request())).show.mode).toBe("solo");
    expect(mocks.start).toHaveBeenCalledTimes(2);
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

describe("failed solo start refunds", () => {
  it("refunds setup failure before the show document was created", async () => {
    hooks.beforeCreate = async (id) => {
      if (!id.startsWith("show:")) return;
      hooks.beforeCreate = null;
      throw new Error("fixture show creation failed");
    };
    await expect(createShow(owner, "solo", request())).rejects.toThrow(
      "fixture show creation failed",
    );
    expect(quota().active).toEqual({});
    expect(Object.values(quota().days)[0]).toEqual({ total: 0, accounts: {} });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("refunds a quota-confirmed start whose show scheduling update fails", async () => {
    hooks.beforeUpdate = async (key) => {
      if (!key.startsWith("show:")) return;
      const record = records.get(key) as ShowRecord;
      if (
        record.soloReservation?.status !== "pending" ||
        !quota().active[record.soloReservation.id]?.confirmed
      )
        return;
      hooks.beforeUpdate = null;
      throw new Error("fixture scheduling record failed");
    };
    await expect(createShow(owner, "solo", request())).rejects.toThrow(
      "fixture scheduling record failed",
    );
    const id = (records.get(`session:${owner}`) as SessionRecord)
      .currentShowId!;
    expect(read(id).soloReservation?.status).toBe("closed");
    expect(quota().active).toEqual({});
    expect(Object.values(quota().days)[0]).toEqual({ total: 0, accounts: {} });
    await expect(
      mintMediaToken(id, request(), { purpose: "output-view" }),
    ).rejects.toMatchObject({ code: "solo_closed" });
  });

  it("refunds only the original UTC day and is idempotent across concurrent callers", async () => {
    const auth = records.get(`session:${owner}`) as SessionRecord,
      id = "ps_0000000000000001",
      pending = await reserveSolo(auth, id, now),
      tomorrow = now + 86400_000;
    allocateSolo(
      quota(),
      "fixture-other-account",
      "other-show",
      "other-reservation",
      tomorrow,
    );
    vi.setSystemTime(tomorrow);
    const results = await Promise.all([
      refundFailedSoloStart(id, pending),
      refundFailedSoloStart(id, pending),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(quota().days["2026-11-01"]).toEqual({ total: 0, accounts: {} });
    expect(quota().days["2026-11-02"]).toEqual({
      total: 1,
      accounts: { "fixture-other-account": 1 },
    });
    expect(await refundFailedSoloStart(id, pending)).toBe(false);
    expect(quota().days["2026-11-02"].total).toBe(1);
  });

  it("never subtracts today's usage when the original day was already pruned", async () => {
    const auth = records.get(`session:${owner}`) as SessionRecord,
      id = "ps_0000000000000001",
      pending = await reserveSolo(auth, id, now),
      later = now + 3 * 86400_000;
    allocateSolo(
      quota(),
      "fixture-other-account",
      "other-show",
      "other-reservation",
      later,
    );
    expect(quota().days["2026-11-01"]).toBeUndefined();
    expect(await refundFailedSoloStart(id, pending, later)).toBe(true);
    expect(quota().days["2026-11-04"].total).toBe(1);
  });

  it("fences a media request already in flight when its failed start is refunded", async () => {
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
    hooks.afterUpdate = async (key) => {
      if (key !== `show:${id}`) return;
      hooks.afterUpdate = null;
      expect(await refundFailedSoloStart(id, reservation)).toBe(true);
    };
    await expect(
      mintMediaToken(id, request(), { purpose: "output-view" }),
    ).rejects.toMatchObject({ code: "solo_closed" });
    expect(read(id).soloReservation?.issued).toHaveLength(0);
    expect(quota().active).toEqual({});
    expect(Object.values(quota().days)[0].total).toBe(0);
    expect(mocks.removeParticipant).not.toHaveBeenCalled();
  });

  it("retains the charge when the first media claim wins before its show ledger write", async () => {
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
    hooks.afterUpdate = async (key) => {
      if (
        key !== SOLO_QUOTA_KEY ||
        !quota().active[reservation.id]?.mediaIssued
      )
        return;
      hooks.afterUpdate = null;
      expect(read(id).soloReservation?.issued).toHaveLength(0);
      expect(await refundFailedSoloStart(id, reservation)).toBe(false);
    };
    expect(
      (await mintMediaToken(id, request(), { purpose: "output-view" })).token,
    ).toBeTypeOf("string");
    expect(read(id).soloReservation?.issued).toHaveLength(1);
    expect(Object.values(quota().days)[0].total).toBe(1);
    expect(await refundFailedSoloStart(id, reservation)).toBe(false);
  });

  it("keeps a shared refund fence when an unconfirmed-only caller cannot adopt its scheduled show", async () => {
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
    hooks.afterUpdate = async (key) => {
      if (key !== SOLO_QUOTA_KEY || !quota().active[reservation.id]?.refunding)
        return;
      hooks.afterUpdate = null;
      expect(
        await refundFailedSoloStart(id, reservation, Date.now(), true),
      ).toBe(false);
      expect(quota().active[reservation.id].refunding).toBe(true);
      await expect(
        confirmSoloQuota(id, reservation, "late-fixture-receipt"),
      ).rejects.toMatchObject({ code: "solo_closed" });
    };
    expect(await refundFailedSoloStart(id, reservation)).toBe(true);
    expect(Object.values(quota().days)[0].total).toBe(0);
  });

  it("retains the charge if manual End wins between the quota fence and show inspection", async () => {
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
    hooks.afterUpdate = async (key) => {
      if (key !== SOLO_QUOTA_KEY || !quota().active[reservation.id]?.refunding)
        return;
      hooks.afterUpdate = null;
      await command(id, request(), {
        action: { type: "end" },
        idempotencyKey: "end-refund-race-fixture",
        epoch: 1,
      });
    };
    expect(await refundFailedSoloStart(id, reservation)).toBe(false);
    expect(read(id).soloReservation?.startFailedAt).toBeUndefined();
    await recoverSoloReservations();
    expect(quota().active).toEqual({});
    expect(Object.values(quota().days)[0].total).toBe(1);
  });

  it("closes a refund fence with a legacy issued ledger while retaining its daily charge", async () => {
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
    delete quota().active[reservation.id].mediaIssued;
    quota().active[reservation.id].refunding = true;
    record.soloReservation!.issued.push({
      room: `portal-${id}-program`,
      identity: "fixture-legacy-issued",
      issuedAt: now,
      expiresAt: now + 120_000,
    });
    await recoverSoloReservations();
    expect(read(id).soloReservation?.status).toBe("closed");
    expect(mocks.removeParticipant).toHaveBeenCalledTimes(2);
    expect(mocks.deleteRoom).toHaveBeenCalledTimes(2);
    expect(quota().active).toEqual({});
    expect(Object.values(quota().days)[0].total).toBe(1);
  });
});

describe("missed solo expiry recovery", () => {
  it("safely closes an expired unconfirmed show already ended by a state read without refunding ordinary closure", async () => {
    const auth = records.get(`session:${owner}`) as SessionRecord,
      id = "ps_0000000000000001",
      pending = await reserveSolo(auth, id, now),
      record = createRecord(id, owner, "solo", now, "fixture_host");
    record.soloReservation = pending;
    record.state.solo = { endsAt: pending.expiresAt, status: "reserved" };
    records.set(`show:${id}`, record);
    vi.setSystemTime(pending.expiresAt + 1);
    expireState(read(id), Date.now());
    expect(read(id).state.phase).toBe("ended");
    expect(read(id).soloReservation?.issued).toHaveLength(0);
    expect(await recoverSoloReservations()).toEqual({ pending: 0 });
    expect(read(id).soloReservation?.status).toBe("closed");
    expect(quota().active).toEqual({});
    expect(Object.values(quota().days)[0].total).toBe(1);
    expect(mocks.removeParticipant).not.toHaveBeenCalled();
    expect(mocks.deleteRoom).not.toHaveBeenCalled();
  });

  it("finishes all 128 identities across bounded lazy passes without repeating completed cleanup phases", async () => {
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
    record.soloReservation!.issued = Array.from(
      { length: 128 },
      (_, index) => ({
        room: `portal-${id}-program`,
        identity: `fixture-issued-${index}`,
        issuedAt: now,
        expiresAt: now + 120_000,
      }),
    );
    quota().active[reservation.id].mediaIssued = true;
    vi.setSystemTime(reservation.expiresAt + 180_000);
    mocks.removeParticipant.mockImplementation(async (..._args: unknown[]) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      return undefined;
    });
    mocks.deleteRoom.mockImplementation(async (_room: string) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      return undefined;
    });
    expect(await flushBackoff(recoverSoloReservations())).toEqual({
      pending: 1,
    });
    expect(read(id).soloReservation?.closureProgress).toEqual({
      phase: "after-delete",
      nextIdentity: 16,
    });
    expect(mocks.removeParticipant).toHaveBeenCalledTimes(144);
    expect(mocks.deleteRoom).toHaveBeenCalledTimes(2);
    expect(quota().active[reservation.id]).toBeDefined();
    await expect(
      mintMediaToken(id, request(), { purpose: "output-view" }),
    ).rejects.toMatchObject({ code: "solo_closed" });
    vi.setSystemTime(Date.now() + 30_000);
    expect(await flushBackoff(recoverSoloReservations())).toEqual({
      pending: 0,
    });
    expect(mocks.removeParticipant).toHaveBeenCalledTimes(256);
    expect(mocks.deleteRoom).toHaveBeenCalledTimes(2);
    const removals = new Map<string, number>();
    for (const [, identity] of mocks.removeParticipant.mock.calls)
      removals.set(String(identity), (removals.get(String(identity)) ?? 0) + 1);
    expect(removals.size).toBe(128);
    expect([...removals.values()].every((count) => count === 2)).toBe(true);
    expect(read(id).soloReservation?.closureProgress).toEqual({
      phase: "complete",
      nextIdentity: 0,
    });
    expect(read(id).state.solo?.status).toBe("closed");
    expect(quota().active).toEqual({});
  });

  it("the next solo start reclaims a confirmed stage three minutes past expiry and revokes its identity", async () => {
    vi.stubEnv("PORTAL_SOLO_GLOBAL_CONCURRENT", "1");
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
    await mintMediaToken(id, request(), { purpose: "output-view" });
    vi.setSystemTime(reservation.expiresAt + 180_000);
    const next = await createShow(owner, "solo", request());
    expect(next.show.id).not.toBe(id);
    expect(read(id).soloReservation?.status).toBe("closed");
    expect(Object.keys(quota().active)).toHaveLength(1);
    expect(mocks.removeParticipant).toHaveBeenCalledTimes(2);
    expect(mocks.deleteRoom).toHaveBeenCalledTimes(2);
    expect(Object.values(quota().days)[0].total).toBe(2);
  });

  it.each(["legacy quota fields", "quota-confirmed/show-pending"])(
    "a quota request recovers an overdue confirmed reservation with %s",
    async (shape) => {
      const record = await reserved(),
        id = record.state.id,
        reservation = record.soloReservation!;
      delete quota().active[reservation.id].mediaIssued;
      delete quota().active[reservation.id].runId;
      if (shape === "quota-confirmed/show-pending") {
        record.soloReservation!.status = "pending";
        delete record.soloReservation!.runId;
      }
      vi.setSystemTime(reservation.expiresAt + 120_000);
      await soloUsage(null);
      expect(quota().active).toEqual({});
      expect(read(id).soloReservation?.status).toBe("closed");
      expect(Object.values(quota().days)[0].total).toBe(1);
    },
  );

  it("refuses an application media-grant renewal at and after the solo deadline", async () => {
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
    await mintMediaToken(id, request(), { purpose: "output-view" });
    for (const at of [reservation.expiresAt, reservation.expiresAt + 1]) {
      vi.setSystemTime(at);
      await expect(
        mintMediaToken(id, request(), { purpose: "output-view" }),
      ).rejects.toMatchObject({ code: "solo_closed" });
    }
    expect(read(id).soloReservation?.issued).toHaveLength(1);
  });

  it("keeps an overdue stage reserved when provider removal fails and reports pending recovery", async () => {
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
    await mintMediaToken(id, request(), { purpose: "output-view" });
    vi.setSystemTime(reservation.expiresAt + 180_000);
    mocks.removeParticipant.mockRejectedValue(
      new Error("fixture provider outage"),
    );
    const usage = await flushBackoff(
      soloUsage(records.get(`session:${owner}`) as SessionRecord),
    );
    expect(usage.available).toBe(false);
    expect(usage.reason).toContain("still closing");
    expect(quota().active[reservation.id]).toBeDefined();
    expect(read(id).state.solo).toMatchObject({
      status: "closing",
      closureError: expect.stringContaining("Removing a participant"),
    });
  });

  it("limits a lazy pass to two reservations and lets later entries run during earlier entries' cooldown", async () => {
    records.set(SOLO_QUOTA_KEY, { days: {}, active: {} } satisfies SoloQuota);
    const ids: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const id = `ps_${String(i).padStart(16, "0")}`,
        reservation = allocateSolo(
          quota(),
          `fixture-account-${i}`,
          id,
          `fixture-reservation-${i}`,
          now,
        ),
        record = createRecord(id, owner, "solo", now, "fixture_host");
      Object.assign(reservation, {
        status: "scheduled",
        runId: `fixture-run-${i}`,
      });
      reservation.issued.push({
        room: `portal-${id}-program`,
        identity: `fixture-issued-${i}`,
        issuedAt: now,
        expiresAt: now + 120_000,
      });
      record.soloReservation = reservation;
      record.state.solo = {
        endsAt: reservation.expiresAt,
        status: "scheduled",
      };
      quota().active[reservation.id].confirmed = true;
      records.set(`show:${id}`, record);
      ids.push(id);
    }
    vi.setSystemTime(now + 1380_000);
    mocks.removeParticipant.mockRejectedValue(
      new Error("fixture provider outage"),
    );
    expect(await flushBackoff(recoverSoloReservations())).toEqual({
      pending: 3,
    });
    expect(
      new Set(mocks.removeParticipant.mock.calls.map((call) => call[1])),
    ).toEqual(new Set(["fixture-issued-1", "fixture-issued-2"]));
    expect(read(ids[2]).state.phase).toBe("backstage");
    await flushBackoff(recoverSoloReservations());
    expect(
      new Set(mocks.removeParticipant.mock.calls.map((call) => call[1])),
    ).toContain("fixture-issued-3");
    expect(Object.keys(quota().active)).toHaveLength(3);
  });

  it("does not call a healthy active account closing because another account has pending cleanup", async () => {
    const record = await reserved(),
      reservation = record.soloReservation!;
    const otherId = "ps_0000000000000001",
      other = createRecord(otherId, owner, "solo", now, "fixture_host");
    const otherReservation = allocateSolo(
      quota(),
      "fixture-other-account",
      otherId,
      "fixture-overdue",
      now - 1400_000,
    );
    Object.assign(otherReservation, {
      status: "scheduled",
      runId: "fixture-other-run",
    });
    otherReservation.issued.push({
      room: `portal-${otherId}-program`,
      identity: "fixture-other-issued",
      issuedAt: now - 1300_000,
      expiresAt: now - 1200_000,
    });
    other.soloReservation = otherReservation;
    other.state.solo = {
      endsAt: otherReservation.expiresAt,
      status: "scheduled",
    };
    quota().active[otherReservation.id].confirmed = true;
    records.set(`show:${otherId}`, other);
    mocks.removeParticipant.mockRejectedValue(
      new Error("fixture provider outage"),
    );
    const usage = await flushBackoff(
      soloUsage(records.get(`session:${owner}`) as SessionRecord),
    );
    expect(usage.reason).toBe(
      "This account already has a reserved solo session.",
    );
    expect(quota().active[reservation.id]).toBeDefined();
  });
});

describe("solo cleanup provider compatibility and bounded retries", () => {
  it.each(
    ["participant", "room"].flatMap((step) => [
      {
        step,
        shape: "code",
        error: { code: "unauthenticated", message: "API key not found" },
      },
      {
        step,
        shape: "status",
        error: { status: 401, message: "API key not found" },
      },
      {
        step,
        shape: "code/status",
        error: {
          code: "unauthenticated",
          status: 401,
          message: "API key not found",
        },
      },
    ]),
  )(
    "retains issued capacity for explicit $step $shape failures mentioning missing credentials",
    async ({ step, error }) => {
      const record = await reserved(),
        id = record.state.id,
        reservation = record.soloReservation!;
      await mintMediaToken(id, request(), { purpose: "output-view" });
      vi.setSystemTime(reservation.expiresAt);
      if (step === "participant")
        mocks.removeParticipant.mockRejectedValue(error);
      else mocks.deleteRoom.mockRejectedValue(error);
      await expect(
        flushBackoff(closeSoloReservation(id, reservation.id, 1)),
      ).rejects.toThrow("failed after two attempts");
      expect(read(id).soloReservation?.status).toBe("closing");
      expect(read(id).soloReservation?.closureProgress?.phase).not.toBe(
        "complete",
      );
      expect(quota().active[reservation.id]).toBeDefined();
      expect(Object.values(quota().days)[0].total).toBe(1);
    },
  );

  it.each([
    ["Twirp code", { code: "not_found", message: "fixture absent" }],
    ["HTTP status", { status: 404 }],
    ["HTTP statusCode", { statusCode: 404 }],
    ["participant message", new Error("participant not found")],
    ["room message", new Error("Room does not exist")],
    ["Twirp message", new Error("rpc error: not_found")],
    ["text response", "could not find participant"],
  ])(
    "accepts %s as already absent for participant removal and room deletion",
    async (_label, error) => {
      const record = await reserved(),
        id = record.state.id,
        reservation = record.soloReservation!;
      await mintMediaToken(id, request(), { purpose: "output-view" });
      vi.setSystemTime(reservation.expiresAt);
      mocks.removeParticipant.mockRejectedValue(error);
      mocks.deleteRoom.mockRejectedValue(error);
      expect(await closeSoloReservation(id, reservation.id, 1)).toEqual({
        closed: true,
        stale: false,
      });
      expect(mocks.removeParticipant).toHaveBeenCalledTimes(2);
      expect(mocks.deleteRoom).toHaveBeenCalledTimes(2);
      expect(quota().active).toEqual({});
    },
  );

  it.each(["participant", "room"])(
    "retries a transient %s error once before returning successful closure",
    async (step) => {
      const record = await reserved(),
        id = record.state.id,
        reservation = record.soloReservation!;
      await mintMediaToken(id, request(), { purpose: "output-view" });
      vi.setSystemTime(reservation.expiresAt);
      const operation =
        step === "participant" ? mocks.removeParticipant : mocks.deleteRoom;
      operation.mockRejectedValueOnce(
        new Error("fixture transient provider interruption"),
      );
      expect(
        await flushBackoff(closeSoloReservation(id, reservation.id, 1)),
      ).toEqual({ closed: true, stale: false });
      expect(operation).toHaveBeenCalledTimes(3);
      expect(read(id).state.solo?.closureError).toBeUndefined();
    },
  );

  it.each(["scheduled", "legacy-closed"])(
    "keeps closing and capacity after both quota-release attempts fail from %s, then allows retry",
    async (initialStatus) => {
      const record = await reserved(),
        id = record.state.id,
        reservation = record.soloReservation!;
      await mintMediaToken(id, request(), { purpose: "output-view" });
      vi.setSystemTime(reservation.expiresAt);
      if (initialStatus === "legacy-closed") {
        const current = read(id);
        current.soloReservation!.status = "closed";
        current.soloReservation!.closedAt = Date.now() - 1000;
        current.state.phase = "ended";
        current.state.solo = {
          endsAt: reservation.expiresAt,
          status: "closed",
        };
      }
      hooks.beforeUpdate = async (key) => {
        if (key === SOLO_QUOTA_KEY)
          throw new Error("fixture quota unavailable");
      };
      await expect(
        flushBackoff(closeSoloReservation(id, reservation.id, 1)),
      ).rejects.toThrow(
        "Releasing the reserved stage failed after two attempts.",
      );
      expect(read(id).state.solo).toMatchObject({
        status: "closing",
        closureError: "Releasing the reserved stage failed after two attempts.",
      });
      expect(quota().active[reservation.id]).toBeDefined();
      expect(
        vi
          .mocked(console.info)
          .mock.calls.map((call) => call.join(" "))
          .join("\n"),
      ).not.toContain('"outcome":"released"');
      hooks.beforeUpdate = null;
      await closeSoloReservation(id, reservation.id, 1);
      expect(read(id).state.solo?.status).toBe("closed");
      expect(quota().active).toEqual({});
    },
  );

  it("preserves another closer's successful closed receipt after a held provider removal exhausts retries", async () => {
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
    await mintMediaToken(id, request(), { purpose: "output-view" });
    vi.setSystemTime(reservation.expiresAt);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slowProvider = {
      removeParticipant: vi.fn(async (..._args: unknown[]) => {
        await held;
        throw new Error("fixture delayed provider outage");
      }),
      deleteRoom: vi.fn(async (_room: string) => undefined),
    };
    const slow = closeSoloReservation(id, reservation.id, 1, slowProvider);
    for (
      let i = 0;
      i < 100 && !slowProvider.removeParticipant.mock.calls.length;
      i++
    )
      await Promise.resolve();
    expect(slowProvider.removeParticipant).toHaveBeenCalledOnce();
    expect(await closeSoloReservation(id, reservation.id, 1)).toEqual({
      closed: true,
      stale: false,
    });
    const receipt = read(id).soloReservation!.closureReceipt;
    expect(receipt).toBeTypeOf("string");
    release();
    expect(await flushBackoff(slow)).toEqual({ closed: true, stale: false });
    expect(slowProvider.removeParticipant).toHaveBeenCalledTimes(2);
    expect(read(id).soloReservation).toMatchObject({
      status: "closed",
      closureReceipt: receipt,
    });
    expect(read(id).state.solo?.status).toBe("closed");
    expect(read(id).state.solo?.closureError).toBeUndefined();
    expect(quota().active).toEqual({});
  });

  it("preserves a successful receipt when a sequential duplicate cannot update released quota", async () => {
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
    await mintMediaToken(id, request(), { purpose: "output-view" });
    vi.setSystemTime(reservation.expiresAt);
    await closeSoloReservation(id, reservation.id, 1);
    const receipt = read(id).soloReservation!.closureReceipt;
    expect(receipt).toBeTypeOf("string");
    expect(quota().active).toEqual({});
    hooks.beforeUpdate = async (key) => {
      if (key === SOLO_QUOTA_KEY)
        throw new Error("fixture quota unavailable after completed close");
    };
    expect(
      await flushBackoff(closeSoloReservation(id, reservation.id, 1)),
    ).toEqual({ closed: true, stale: false });
    expect(read(id).soloReservation).toMatchObject({
      status: "closed",
      closureReceipt: receipt,
    });
    expect(read(id).state.solo?.status).toBe("closed");
    expect(read(id).state.solo?.closureError).toBeUndefined();
    expect(mocks.removeParticipant).toHaveBeenCalledTimes(2);
    expect(mocks.deleteRoom).toHaveBeenCalledTimes(2);
    expect(quota().active).toEqual({});
  });

  it("never rewinds another closer's completed provider progress while quota release is pending", async () => {
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
    await mintMediaToken(id, request(), { purpose: "output-view" });
    vi.setSystemTime(reservation.expiresAt);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slowProvider = {
      removeParticipant: vi.fn(async (..._args: unknown[]) => {
        await held;
      }),
      deleteRoom: vi.fn(async (_room: string) => undefined),
    };
    const slow = closeSoloReservation(id, reservation.id, 1, slowProvider);
    for (
      let i = 0;
      i < 100 && !slowProvider.removeParticipant.mock.calls.length;
      i++
    )
      await Promise.resolve();
    expect(slowProvider.removeParticipant).toHaveBeenCalledOnce();
    hooks.beforeUpdate = async (key) => {
      if (key === SOLO_QUOTA_KEY) throw new Error("fixture quota unavailable");
    };
    await expect(
      flushBackoff(closeSoloReservation(id, reservation.id, 1)),
    ).rejects.toThrow("Releasing the reserved stage failed");
    expect(read(id).soloReservation?.closureProgress).toEqual({
      phase: "complete",
      nextIdentity: 0,
    });
    expect(read(id).soloReservation?.status).toBe("closing");
    expect(quota().active[reservation.id]).toBeDefined();
    hooks.beforeUpdate = null;
    release();
    expect(await slow).toEqual({ closed: true, stale: false });
    expect(slowProvider.removeParticipant).toHaveBeenCalledOnce();
    expect(slowProvider.deleteRoom).not.toHaveBeenCalled();
    expect(read(id).soloReservation?.closureProgress).toEqual({
      phase: "complete",
      nextIdentity: 0,
    });
    expect(quota().active).toEqual({});
  });

  it("logs each issued identity, both room deletions, and only a committed quota release", async () => {
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
    await mintMediaToken(id, request(), { purpose: "output-view" });
    vi.setSystemTime(reservation.expiresAt);
    mocks.removeParticipant.mockRejectedValueOnce(
      new Error("fixture-provider-private-diagnostic"),
    );
    await flushBackoff(closeSoloReservation(id, reservation.id, 1));
    const logs = vi
      .mocked(console.info)
      .mock.calls.map((call) => call.join(" "))
      .join("\n");
    expect(logs).toContain(read(id).soloReservation!.issued[0].identity);
    expect(logs).toContain(`portal-${id}-backstage`);
    expect(logs).toContain(`portal-${id}-program`);
    expect(logs).toContain('"step":"release-quota","outcome":"released"');
    expect(logs).not.toContain("fixture-provider-private-diagnostic");
    expect(logs).not.toContain("fixture-only-media-signing-secret");
  });

  it("defers provider steps at a lazy budget boundary without claiming two failed attempts or releasing capacity", async () => {
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
    await mintMediaToken(id, request(), { purpose: "output-view" });
    vi.setSystemTime(reservation.expiresAt);
    await expect(
      closeSoloReservation(
        id,
        reservation.id,
        1,
        undefined,
        Date.now(),
        false,
        { budgetMs: 0, requestTimeoutSeconds: 2 },
      ),
    ).rejects.toThrow("is pending; recovery reached its time limit");
    expect(mocks.removeParticipant).not.toHaveBeenCalled();
    expect(mocks.deleteRoom).not.toHaveBeenCalled();
    expect(read(id).state.solo?.closureError).not.toContain("two attempts");
    expect(quota().active[reservation.id]).toBeDefined();
  });

  it("awaits one bounded provider attempt, then defers its retry after the lazy budget expires", async () => {
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
    await mintMediaToken(id, request(), { purpose: "output-view" });
    vi.setSystemTime(reservation.expiresAt);
    mocks.removeParticipant.mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + 10_001);
      throw new Error("fixture slow bounded provider failure");
    });
    await expect(
      flushBackoff(
        closeSoloReservation(
          id,
          reservation.id,
          1,
          undefined,
          Date.now(),
          false,
          { budgetMs: 10_000, requestTimeoutSeconds: 2 },
        ),
      ),
    ).rejects.toThrow("is pending; recovery reached its time limit");
    expect(mocks.removeParticipant).toHaveBeenCalledTimes(1);
    expect(mocks.deleteRoom).not.toHaveBeenCalled();
    expect(mocks.serviceOptions).toHaveBeenCalledWith({
      requestTimeout: 2,
      failover: false,
    });
    expect(read(id).state.solo?.closureError).not.toContain("two attempts");
    expect(quota().active[reservation.id]).toBeDefined();
  });

  it.each(["closed", "pending"])(
    "returns the current %s solo status after an End API request",
    async (outcome) => {
      const record = await reserved(),
        id = record.state.id;
      await mintMediaToken(id, request(), { purpose: "output-view" });
      if (outcome === "pending")
        mocks.removeParticipant.mockRejectedValue(
          new Error("fixture provider outage"),
        );
      else
        mocks.removeParticipant.mockRejectedValueOnce(
          new Error("fixture transient provider outage"),
        );
      const base = request();
      const response = await flushBackoff(
        POST(
          new Request(`http://localhost:3200/api/shows/${id}/action`, {
            method: "POST",
            headers: {
              Cookie: base.headers.get("Cookie")!,
              Origin: "http://localhost:3200",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: { type: "end" },
              idempotencyKey: `end-api-${outcome}-fixture`,
              epoch: 1,
            }),
          }),
          { params: Promise.resolve({ showId: id, action: ["action"] }) },
        ),
      );
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.show.solo.status).toBe(
        outcome === "closed" ? "closed" : "closing",
      );
      if (outcome === "pending") {
        expect(result.show.solo.closureError).toBe(
          "Removing a participant from Program failed after two attempts.",
        );
        expect(Object.keys(quota().active)).toHaveLength(1);
      } else expect(quota().active).toEqual({});
    },
  );
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
    mocks.removeParticipant.mockRejectedValue(
      new Error("fixture provider outage"),
    );
    await expect(
      flushBackoff(
        closeSoloReservation(
          id,
          reservation.id,
          1,
          undefined,
          Date.now(),
          true,
        ),
      ),
    ).rejects.toThrow();
    const generation = read(id).outputGeneration;
    await command(id, request(), {
      action: { type: "end" },
      idempotencyKey: "retry-end-fixture",
      epoch: 1,
    });
    mocks.removeParticipant.mockResolvedValue(undefined);
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
  it("an ordinary early End with zero grants retains its daily charge without provider I/O", async () => {
    const record = await reserved(),
      id = record.state.id,
      reservation = record.soloReservation!;
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
    expect(await refundFailedSoloStart(id, reservation)).toBe(false);
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
    mocks.removeParticipant.mockRejectedValue(
      new Error("fixture provider outage"),
    );
    await expect(
      flushBackoff(closeSoloReservation(id, reservation.id, 1)),
    ).rejects.toThrow(
      "Removing a participant from Program failed after two attempts.",
    );
    expect(read(id).soloReservation?.status).toBe("closing");
    expect(Object.keys(quota().active)).toHaveLength(1);
    await expect(
      mintMediaToken(id, request(), { purpose: "output-view" }),
    ).rejects.toMatchObject({ code: "solo_closed" });
    mocks.removeParticipant.mockResolvedValue(undefined);
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
