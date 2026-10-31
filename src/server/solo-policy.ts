import { randomBytes } from "node:crypto";
import type { SessionInfo } from "@/lib/contracts";
import { assert } from "./errors";
import { privateActor } from "./security";
import type { SessionRecord, ShowRecord, SoloReservation } from "./records";
import { getStore } from "./store";

export const SOLO_QUOTA_KEY = "quota:public-solo:v1";
export type SoloQuota = {
  days: Record<string, { total: number; accounts: Record<string, number> }>;
  active: Record<
    string,
    {
      showId: string;
      account: string;
      createdAt: number;
      expiresAt: number;
      confirmed: boolean;
      runId?: string;
    }
  >;
};
const bounded = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) => {
  const number = Number(value);
  return value && Number.isSafeInteger(number) && number >= min && number <= max
    ? number
    : fallback;
};
export function soloLimits() {
  return {
    perAccount: bounded(process.env.PORTAL_SOLO_PER_ACCOUNT_DAILY, 3, 1, 10),
    globalDaily: bounded(process.env.PORTAL_SOLO_GLOBAL_DAILY, 30, 1, 100),
    concurrent: bounded(process.env.PORTAL_SOLO_GLOBAL_CONCURRENT, 5, 1, 10),
    seconds: bounded(process.env.PORTAL_SOLO_SESSION_SECONDS, 1200, 60, 1800),
  };
}
export function publicSoloConfigured() {
  return (
    process.env.PORTAL_PUBLIC_SOLO !== "0" &&
    Boolean(
      process.env.DATABASE_URL &&
      process.env.LIVEKIT_URL &&
      process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET,
    )
  );
}
export function soloEligible(auth: SessionRecord | null) {
  return (
    publicSoloConfigured() &&
    Boolean(auth?.credentialId && auth.userId && auth.login)
  );
}
export function accountKey(userId: string) {
  return privateActor(`solo-account:${userId}`);
}
const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);

/** One CAS document arbitrates account/day/global/concurrent caps together. */
export function allocateSolo(
  quota: SoloQuota,
  account: string,
  showId: string,
  reservationId: string,
  now: number,
): SoloReservation {
  const limits = soloLimits(),
    today = dayKey(now);
  for (const day of Object.keys(quota.days))
    if (day < dayKey(now - 86400_000)) delete quota.days[day];
  const day = (quota.days[today] ??= { total: 0, accounts: {} });
  assert(
    (day.accounts[account] ?? 0) < limits.perAccount,
    429,
    "solo_account_limit",
    "Today's solo sessions for this Twitch account are used. Local camera rehearsal stays available.",
  );
  assert(
    day.total < limits.globalDaily,
    429,
    "solo_daily_limit",
    "Today's shared solo capacity is used. Local camera rehearsal stays available.",
  );
  assert(
    !Object.values(quota.active).some((entry) => entry.account === account),
    409,
    "solo_active",
    "This Twitch account already has a reserved solo session. End it before starting another.",
  );
  assert(
    Object.keys(quota.active).length < limits.concurrent,
    429,
    "solo_capacity",
    "All shared solo stages are currently reserved. Try again after a session closes, or use local rehearsal.",
  );
  const expiresAt = now + limits.seconds * 1000;
  day.total += 1;
  day.accounts[account] = (day.accounts[account] ?? 0) + 1;
  quota.active[reservationId] = {
    showId,
    account,
    createdAt: now,
    expiresAt,
    confirmed: false,
  };
  return {
    id: reservationId,
    account,
    createdAt: now,
    expiresAt,
    generation: 1,
    status: "pending",
    issued: [],
  };
}
export async function reserveSolo(
  auth: SessionRecord,
  showId: string,
  now: number,
) {
  assert(
    soloEligible(auth),
    403,
    "solo_unavailable",
    "Sign in with Twitch to use an available solo stage. Local rehearsal remains open without a room.",
  );
  const store = getStore(),
    id = `solo_${randomBytes(16).toString("hex")}`;
  await store.create<SoloQuota>(SOLO_QUOTA_KEY, { days: {}, active: {} });
  await recoverUnissuedReservations(now);
  return store.update<SoloQuota, SoloReservation>(SOLO_QUOTA_KEY, (quota) =>
    allocateSolo(quota, accountKey(auth.userId!), showId, id, now),
  );
}
/** Fences the quota first: a late scheduling receipt can never revive a reclaimed reservation. */
export async function recoverUnissuedReservations(now = Date.now()) {
  const store = getStore(),
    snapshot = await store.get<SoloQuota>(SOLO_QUOTA_KEY);
  const candidates = Object.entries(snapshot?.active ?? {}).filter(
    ([, entry]) =>
      !entry.confirmed &&
      Number.isFinite(entry.createdAt) &&
      now - entry.createdAt >= 60_000,
  );
  for (const [id, entry] of candidates) {
    const record = await store.get<ShowRecord>(`show:${entry.showId}`);
    // An issuance ledger or a confirmed run is never reclaimed on a wall-clock guess.
    if (
      record?.soloReservation?.issued.length ||
      record?.soloReservation?.runId
    )
      continue;
    const reclaimed = await store.update<SoloQuota, boolean>(
      SOLO_QUOTA_KEY,
      (quota) => {
        const current = quota.active[id];
        if (
          !current ||
          current.confirmed ||
          current.showId !== entry.showId ||
          now - current.createdAt < 60_000
        )
          return false;
        delete quota.active[id];
        // Daily/account usage is deliberately retained, including uncertain start outcomes.
        return true;
      },
    );
    if (reclaimed && record)
      await store.update<ShowRecord, void>(`show:${entry.showId}`, (value) => {
        const current = value.soloReservation;
        if (
          !current ||
          current.id !== id ||
          current.issued.length ||
          current.runId
        )
          return;
        current.status = "closed";
        current.closedAt = now;
        value.state.phase = "ended";
        value.state.beat = "curtain";
        value.state.solo = { endsAt: current.expiresAt, status: "closed" };
      });
  }
}
export async function confirmSoloQuota(
  showId: string,
  reservation: SoloReservation,
  runId: string,
) {
  await getStore().update<SoloQuota, void>(SOLO_QUOTA_KEY, (quota) => {
    const entry = quota.active[reservation.id];
    assert(
      entry &&
        entry.showId === showId &&
        entry.expiresAt === reservation.expiresAt &&
        entry.expiresAt > Date.now(),
      409,
      "solo_closed",
      "This reservation was reclaimed or expired before scheduling completed. No media access was issued.",
    );
    entry.confirmed = true;
    entry.runId = runId;
  });
}
export async function soloUsage(
  auth: SessionRecord | null,
  now = Date.now(),
): Promise<NonNullable<SessionInfo["soloUsage"]>> {
  const limits = soloLimits(),
    configured = publicSoloConfigured();
  if (configured && auth?.credentialId) await recoverUnissuedReservations(now);
  const quota = configured
    ? await getStore().get<SoloQuota>(SOLO_QUOTA_KEY)
    : null;
  const account = auth?.userId ? accountKey(auth.userId) : "";
  const day = quota?.days[dayKey(now)];
  const remaining = Math.max(
    0,
    limits.perAccount - (day?.accounts[account] ?? 0),
  );
  const reason = !configured
    ? "Live solo setup is unavailable. Local camera rehearsal is ready."
    : !auth?.credentialId
      ? "Sign in with Twitch for a live solo session."
      : Object.values(quota?.active ?? {}).some(
            (entry) => entry.account === account,
          )
        ? "This account already has a reserved solo session."
        : remaining === 0
          ? "Today's sessions for this account are used."
          : (day?.total ?? 0) >= limits.globalDaily
            ? "Today's shared solo capacity is used."
            : Object.keys(quota?.active ?? {}).length >= limits.concurrent
              ? "All shared solo stages are reserved."
              : null;
  return {
    remaining,
    limit: limits.perAccount,
    minutes: limits.seconds / 60,
    available: !reason,
    reason,
  };
}
export function requireSoloAccess(record: ShowRecord, now = Date.now()) {
  if (record.state.mode !== "solo") return;
  const reservation = record.soloReservation;
  assert(
    reservation &&
      reservation.status === "scheduled" &&
      reservation.runId &&
      reservation.expiresAt > now &&
      record.state.solo?.endsAt === reservation.expiresAt &&
      record.state.phase !== "ended",
    409,
    "solo_closed",
    "This solo reservation is not active. A confirmed closure schedule is required before media connects; ended sessions cannot be extended.",
  );
}
export function fenceExpiredSolo(record: ShowRecord, now: number) {
  if (
    record.state.mode !== "solo" ||
    !record.soloReservation ||
    record.soloReservation.expiresAt > now ||
    record.soloReservation.status === "closed"
  )
    return false;
  record.soloReservation.status = "closing";
  if (record.state.solo) record.state.solo.status = "closing";
  return true;
}
