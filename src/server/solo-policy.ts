import { randomBytes } from "node:crypto";
import type { SessionInfo } from "@/lib/contracts";
import { assert } from "./errors";
import { privateActor } from "./security";
import type { SessionRecord, ShowRecord, SoloReservation } from "./records";
import { getStore } from "./store";
import { closeSoloReservation } from "./solo-closure";
import { SOLO_QUOTA_KEY, type SoloQuota } from "./solo-quota";

export { SOLO_QUOTA_KEY, type SoloQuota } from "./solo-quota";
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
    mediaIssued: false,
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
  await recoverSoloReservations(now);
  return store.update<SoloQuota, SoloReservation>(SOLO_QUOTA_KEY, (quota) =>
    allocateSolo(quota, accountKey(auth.userId!), showId, id, now),
  );
}
/** A failed start can return its original daily charge only before any media claim wins. */
export async function refundFailedSoloStart(
  showId: string,
  reservation: SoloReservation,
  now = Date.now(),
  unconfirmedOnly = false,
) {
  const store = getStore(),
    key = `show:${showId}`,
    record = await store.get<ShowRecord>(key);
  if (
    record &&
    (record.soloReservation?.id !== reservation.id ||
      record.soloReservation.generation !== reservation.generation ||
      record.soloReservation.issued.length ||
      (record.state.phase === "ended" &&
        record.soloReservation.startFailedAt === undefined))
  )
    return false;
  // Claim the refund fence first. The media claim and scheduler confirmation use this same CAS row.
  const fenced = await store.update<SoloQuota, boolean>(
    SOLO_QUOTA_KEY,
    (quota) => {
      const current = quota.active[reservation.id];
      if (
        !current ||
        current.showId !== showId ||
        current.account !== reservation.account ||
        current.expiresAt !== reservation.expiresAt ||
        (unconfirmedOnly && current.confirmed && !current.refunding) ||
        current.mediaIssued
      )
        return false;
      current.refunding = true;
      return true;
    },
  );
  if (!fenced) return false;
  if (record) {
    const startupFenced = await store.update<ShowRecord, boolean>(
      key,
      (value) => {
        const current = value.soloReservation;
        if (
          !current ||
          current.id !== reservation.id ||
          current.generation !== reservation.generation ||
          current.issued.length ||
          (value.state.phase === "ended" &&
            current.startFailedAt === undefined) ||
          (unconfirmedOnly &&
            current.startFailedAt === undefined &&
            (current.status === "scheduled" || current.runId))
        )
          return false;
        current.startFailedAt ??= now;
        current.status = "closing";
        value.state.phase = "ended";
        value.state.beat = "curtain";
        value.state.solo = { endsAt: current.expiresAt, status: "closing" };
        return true;
      },
    );
    if (!startupFenced) {
      // Another failed-start caller may be using this same fence. Keep it until
      // that caller finishes, or lazy recovery observes a manual End and closes without a refund.
      return false;
    }
  }
  // Delete and refund in one CAS; retries cannot subtract this reservation twice or touch a newer day.
  const refunded = await store.update<SoloQuota, boolean>(
    SOLO_QUOTA_KEY,
    (quota) => {
      const current = quota.active[reservation.id];
      if (
        !current ||
        current.showId !== showId ||
        current.account !== reservation.account ||
        current.expiresAt !== reservation.expiresAt ||
        !current.refunding ||
        current.mediaIssued
      )
        return false;
      const day = quota.days[dayKey(current.createdAt)];
      if (day) {
        day.total = Math.max(0, day.total - 1);
        const used = day.accounts[current.account] ?? 0;
        if (used > 1) day.accounts[current.account] = used - 1;
        else delete day.accounts[current.account];
      }
      delete quota.active[reservation.id];
      return true;
    },
  );
  if (!refunded) return false;
  console.info(
    "portal.solo.quota " +
      JSON.stringify({
        showId,
        reservationId: reservation.id,
        step: "refund-failed-start",
        outcome: "refunded",
        day: dayKey(reservation.createdAt),
      }),
  );
  if (record)
    await store.update<ShowRecord, void>(key, (value) => {
      const current = value.soloReservation;
      if (
        !current ||
        current.id !== reservation.id ||
        current.generation !== reservation.generation ||
        current.issued.length
      )
        return;
      current.status = "closed";
      current.closedAt = now;
      current.startFailedAt ??= now;
      value.state.phase = "ended";
      value.state.beat = "curtain";
      value.state.solo = { endsAt: current.expiresAt, status: "closed" };
    });
  return true;
}

/** Claim before writing the show ledger so a failed-start refund cannot race token return. */
export async function claimSoloMedia(
  showId: string,
  reservation: SoloReservation,
  now = Date.now(),
) {
  await getStore().update<SoloQuota, void>(SOLO_QUOTA_KEY, (quota) => {
    const entry = quota.active[reservation.id];
    assert(
      entry &&
        entry.confirmed &&
        !entry.refunding &&
        entry.showId === showId &&
        entry.account === reservation.account &&
        entry.expiresAt === reservation.expiresAt &&
        entry.expiresAt > now &&
        (!entry.runId || entry.runId === reservation.runId),
      409,
      "solo_closed",
      "This solo reservation was released or expired before media could connect.",
    );
    entry.mediaIssued = true;
  });
}

/** Recover missed workflows lazily; provider failures always retain concurrent capacity. */
export async function recoverSoloReservations(now = Date.now()) {
  const store = getStore(),
    snapshot = await store.get<SoloQuota>(SOLO_QUOTA_KEY);
  type Entry = SoloQuota["active"][string];
  const overdue = (entry: Entry) =>
    Number.isFinite(entry.expiresAt) && now - entry.expiresAt >= 120_000;
  const abandoned = (entry: Entry) =>
    !entry.confirmed &&
    Number.isFinite(entry.createdAt) &&
    now - entry.createdAt >= 60_000;
  const needsRecovery = (entry: Entry) =>
    overdue(entry) || abandoned(entry) || Boolean(entry.refunding);
  if (!Object.values(snapshot?.active ?? {}).some(needsRecovery))
    return { pending: 0 };
  // A shared cooldown and least-recently-attempted order prevent a failing old entry
  // from monopolizing every lobby request. At most two bounded cleanups run together.
  const candidates = await store.update<SoloQuota, [string, Entry][]>(
    SOLO_QUOTA_KEY,
    (quota) => {
      const selected = Object.entries(quota.active)
        .filter(
          ([, entry]) =>
            needsRecovery(entry) &&
            (entry.recoveryAt === undefined ||
              now - entry.recoveryAt >= 30_000),
        )
        .sort(
          ([, a], [, b]) =>
            (a.recoveryAt ?? 0) - (b.recoveryAt ?? 0) ||
            a.expiresAt - b.expiresAt,
        )
        .slice(0, 2);
      for (const [, entry] of selected) entry.recoveryAt = now;
      return structuredClone(selected);
    },
  );
  await Promise.all(
    candidates.map(async ([id, entry]) => {
      try {
        const record = await store.get<ShowRecord>(`show:${entry.showId}`),
          reservation = record?.soloReservation;
        if (reservation && reservation.id !== id) return;
        const closureOptions = { budgetMs: 10_000, requestTimeoutSeconds: 2 };
        if (
          reservation &&
          ((entry.refunding && reservation.issued.length) ||
            (record?.state.phase === "ended" &&
              reservation.startFailedAt === undefined))
        )
          await closeSoloReservation(
            entry.showId,
            id,
            reservation.generation,
            undefined,
            now,
            true,
            closureOptions,
          );
        else if (
          !entry.refunding &&
          overdue(entry) &&
          reservation &&
          (entry.confirmed || reservation.runId || reservation.issued.length)
        )
          await closeSoloReservation(
            entry.showId,
            id,
            reservation.generation,
            undefined,
            now,
            false,
            closureOptions,
          );
        else if (
          (abandoned(entry) || entry.refunding) &&
          !reservation?.issued.length
        )
          await refundFailedSoloStart(
            entry.showId,
            reservation ?? {
              id,
              account: entry.account,
              createdAt: entry.createdAt,
              expiresAt: entry.expiresAt,
              generation: 1,
              status: "pending",
              issued: [],
            },
            now,
            !entry.refunding,
          );
      } catch {
        console.warn(
          "portal.solo.recovery " +
            JSON.stringify({
              showId: entry.showId,
              reservationId: id,
              outcome: "cleanup-pending",
            }),
        );
      }
    }),
  );
  const remaining = await store.get<SoloQuota>(SOLO_QUOTA_KEY),
    pending = Object.values(remaining?.active ?? {}).filter(
      needsRecovery,
    ).length;
  if (pending)
    console.info(
      "portal.solo.recovery " +
        JSON.stringify({ outcome: "cleanup-pending", pending }),
    );
  return { pending };
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
        !entry.refunding &&
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
  const recovery =
    configured && auth?.credentialId
      ? await recoverSoloReservations(now)
      : null;
  const quota = configured
    ? await getStore().get<SoloQuota>(SOLO_QUOTA_KEY)
    : null;
  const account = auth?.userId ? accountKey(auth.userId) : "";
  const day = quota?.days[dayKey(now)];
  const remaining = Math.max(
    0,
    limits.perAccount - (day?.accounts[account] ?? 0),
  );
  const active = Object.values(quota?.active ?? {}).find(
    (entry) => entry.account === account,
  );
  const accountRecovering =
    active &&
    (active.refunding ||
      now - active.expiresAt >= 120_000 ||
      (!active.confirmed && now - active.createdAt >= 60_000));
  const reason = !configured
    ? "Live solo setup is unavailable. Local camera rehearsal is ready."
    : !auth?.credentialId
      ? "Sign in with Twitch for a live solo session."
      : active
        ? accountRecovering
          ? "A reserved solo session is still closing. Try again shortly or retry media closure from that show."
          : "This account already has a reserved solo session."
        : remaining === 0
          ? "Today's sessions for this account are used."
          : (day?.total ?? 0) >= limits.globalDaily
            ? "Today's shared solo capacity is used."
            : Object.keys(quota?.active ?? {}).length >= limits.concurrent
              ? recovery?.pending
                ? "Shared solo stages are still closing. Try again shortly or use local rehearsal."
                : "All shared solo stages are reserved."
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
