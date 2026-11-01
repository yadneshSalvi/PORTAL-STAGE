import { randomBytes } from "node:crypto";
import { RoomServiceClient } from "livekit-server-sdk";
import type { ShowRecord, SoloReservation } from "./records";
import { getStore } from "./store";
import { SOLO_QUOTA_KEY, type SoloQuota } from "./solo-quota";
import { recordEvent } from "./protocol-events";
import { HttpError } from "./errors";

type RoomCloser = Pick<RoomServiceClient, "removeParticipant" | "deleteRoom">;
type ClosureOptions = { budgetMs?: number; requestTimeoutSeconds?: number };
type ClosureProgress = NonNullable<SoloReservation["closureProgress"]>;
const progressRank = (progress: ClosureProgress) =>
  ["before-delete", "delete-rooms", "after-delete", "complete"].indexOf(
    progress.phase,
  ) *
    1024 +
  progress.nextIdentity;
function service(requestTimeout = 8): RoomCloser {
  if (
    !process.env.LIVEKIT_URL ||
    !process.env.LIVEKIT_API_KEY ||
    !process.env.LIVEKIT_API_SECRET
  )
    throw new Error("Solo closure media configuration unavailable.");
  return new RoomServiceClient(
    process.env.LIVEKIT_URL.replace(/^ws/, "http"),
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { requestTimeout, failover: false },
  );
}
function notFound(error: unknown) {
  if (error && typeof error === "object") {
    const value = error as {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
      message?: unknown;
    };
    // Structured authentication, authorization and other failures must never become
    // successful cleanup just because their message mentions a missing API key/resource.
    if (
      (typeof value.code === "string" &&
        value.code &&
        value.code !== "not_found") ||
      [value.status, value.statusCode].some(
        (status) =>
          typeof status === "number" && status >= 400 && status !== 404,
      )
    )
      return false;
    if (
      value.code === "not_found" ||
      value.status === 404 ||
      value.statusCode === 404
    )
      return true;
    if (typeof value.message === "string")
      return /\bnot[ _-]?found\b|\bdoes not exist\b|\bcould not find\b|\bno such (?:participant|room)\b/i.test(
        value.message,
      );
  }
  return (
    typeof error === "string" &&
    /\bnot[ _-]?found\b|\bdoes not exist\b|\bcould not find\b|\bno such (?:participant|room)\b/i.test(
      error,
    )
  );
}

/** Fences minting before I/O, revokes disconnected identities too, and releases capacity only after both rooms close. */
export async function closeSoloReservation(
  showId: string,
  reservationId: string,
  generation: number,
  provider?: RoomCloser,
  now = Date.now(),
  early = false,
  options: ClosureOptions = {},
) {
  const store = getStore(),
    key = `show:${showId}`,
    completionReceipt = randomBytes(12).toString("hex"),
    deadline =
      options.budgetMs === undefined ? Infinity : Date.now() + options.budgetMs;
  const existing = await store.get<ShowRecord>(key);
  if (
    !existing?.soloReservation ||
    existing.soloReservation.id !== reservationId ||
    existing.soloReservation.generation !== generation
  )
    return { closed: false, stale: true };
  const reservation = await store.update<
    ShowRecord,
    ShowRecord["soloReservation"]
  >(key, (record) => {
    const current = record.soloReservation;
    if (
      !current ||
      current.id !== reservationId ||
      current.generation !== generation
    )
      return undefined;
    if (!early && now < current.expiresAt)
      throw new Error("Solo closure deadline has not arrived.");
    if (current.status !== "closed") {
      current.status = "closing";
      record.state.solo = { endsAt: current.expiresAt, status: "closing" };
      if (record.state.phase !== "ended") {
        record.state.phase = "ended";
        record.state.beat = "curtain";
        record.inviteGeneration += 1;
        record.outputGeneration =
          (record.outputGeneration ?? record.inviteGeneration - 1) + 1;
        if (record.state.umbrella.transfer?.status === "offered")
          record.state.umbrella.transfer.status = "cancelled";
        if (
          record.state.round &&
          ["open", "closing"].includes(record.state.round.status)
        )
          record.state.round.status = "cancelled";
        for (const p of Object.values(record.state.participants))
          Object.assign(p, {
            connected: false,
            camera: false,
            microphone: false,
            ready: false,
            admitted: false,
          });
        record.state.twitch.connected = false;
        record.state.twitch.status = "Solo session closed.";
        recordEvent(
          record,
          "solo.closed",
          "system",
          "The solo reservation ended; media minting is fenced and both media rooms are closing.",
          now,
          { expiresAt: current.expiresAt },
        );
      }
    }
    return structuredClone(current);
  });
  if (!reservation) return { closed: false, stale: true };
  const log = (
    step: string,
    outcome: string,
    attempt: number,
    detail: { room?: string; identity?: string; phase?: string } = {},
  ) =>
    console.info(
      "portal.solo.closure " +
        JSON.stringify({
          showId,
          reservationId,
          generation,
          step,
          outcome,
          attempt,
          ...detail,
        }),
    );
  const attemptStep = async (
    step: string,
    action: () => Promise<string | void>,
    detail: { room?: string; identity?: string; phase?: string } = {},
    absentIsSuccess = false,
    providerStep = false,
  ): Promise<"succeeded" | "failed" | "deferred"> => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (providerStep && Date.now() >= deadline) {
        log(step, "deferred", attempt, detail);
        return "deferred";
      }
      log(step, "started", attempt, detail);
      try {
        const outcome = await action();
        log(step, outcome ?? "succeeded", attempt, detail);
        return "succeeded";
      } catch (error) {
        if (absentIsSuccess && notFound(error)) {
          log(step, "already-absent", attempt, detail);
          return "succeeded";
        }
        // Never log provider messages, credentials or JWTs. Identities here are server-issued media IDs.
        log(step, "failed", attempt, detail);
        if (attempt === 1)
          await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    return "failed";
  };
  let failedStep = "Saving the media closure failed after two attempts.";
  try {
    let progress: ClosureProgress = reservation.closureProgress ?? {
      phase: "before-delete",
      nextIdentity: 0,
    };
    const providerPending = () => progress.phase !== "complete";
    if (
      reservation.status !== "closed" &&
      reservation.issued.length &&
      providerPending()
    ) {
      failedStep = "Connecting to the media service failed.";
      log("media-configuration", "started", 1);
      let client: RoomCloser;
      try {
        client = provider ?? service(options.requestTimeoutSeconds);
      } catch (error) {
        log("media-configuration", "failed", 1);
        throw error;
      }
      log("media-configuration", "succeeded", 1);
      const checkpoint = async (next: ClosureProgress) => {
        failedStep = "Saving media cleanup progress failed after two attempts.";
        const saved = await attemptStep("record-progress", async () => {
          const current = await store.update<
            ShowRecord,
            ClosureProgress | undefined
          >(key, (record) => {
            const value = record.soloReservation;
            if (
              !value ||
              value.id !== reservationId ||
              value.generation !== generation
            )
              return undefined;
            if (value.status === "closed")
              return { phase: "complete", nextIdentity: 0 };
            if (
              !value.closureProgress ||
              progressRank(value.closureProgress) < progressRank(next)
            )
              value.closureProgress = structuredClone(next);
            return structuredClone(value.closureProgress);
          });
          if (!current)
            throw new Error("Solo reservation changed during cleanup.");
          progress = current;
        });
        if (saved !== "succeeded")
          throw new HttpError(503, "solo_closure", failedStep);
      };
      // The fenced ledger cannot grow. Persisting each successful batch lets a later
      // bounded pass resume without repeating all earlier revocations. CAS never rewinds progress.
      while (progress.phase !== "complete") {
        let providerFailure: string | undefined;
        if (progress.phase === "delete-rooms") {
          await Promise.all(
            [`portal-${showId}-backstage`, `portal-${showId}-program`].map(
              async (room) => {
                const deleted = await attemptStep(
                  "delete-room",
                  () => client.deleteRoom(room),
                  { room },
                  true,
                  true,
                );
                if (deleted !== "succeeded")
                  providerFailure ??= `Deleting the ${room.endsWith("-backstage") ? "backstage" : "Program"} room ${deleted === "deferred" ? "is pending; recovery reached its time limit" : "failed after two attempts"}.`;
              },
            ),
          );
          if (providerFailure) {
            failedStep = providerFailure;
            throw new HttpError(503, "solo_closure", failedStep);
          }
          await checkpoint({ phase: "after-delete", nextIdentity: 0 });
          continue;
        }
        const phase = progress.phase,
          end = Math.min(reservation.issued.length, progress.nextIdentity + 16);
        await Promise.all(
          reservation.issued
            .slice(progress.nextIdentity, end)
            .map(async ({ room, identity }) => {
              const removed = await attemptStep(
                "remove-participant",
                () =>
                  client.removeParticipant(room, identity, {
                    // A fresh post-deletion cutoff covers refreshed tokens, including across recovery passes.
                    revokeTokenTs: BigInt(Math.floor(Date.now() / 1000) + 30),
                  }),
                { room, identity, phase },
                true,
                true,
              );
              if (removed !== "succeeded")
                providerFailure ??= `Removing a participant from ${room.endsWith("-backstage") ? "backstage" : "Program"}${phase === "after-delete" ? " after room deletion" : ""} ${removed === "deferred" ? "is pending; recovery reached its time limit" : "failed after two attempts"}.`;
            }),
        );
        if (providerFailure) {
          failedStep = providerFailure;
          throw new HttpError(503, "solo_closure", failedStep);
        }
        await checkpoint(
          end < reservation.issued.length
            ? { phase, nextIdentity: end }
            : {
                phase: phase === "before-delete" ? "delete-rooms" : "complete",
                nextIdentity: 0,
              },
        );
      }
    }
    // Publish closed only after the quota CAS succeeds. A failed release keeps the visible retry path.
    failedStep = "Releasing the reserved stage failed after two attempts.";
    const released = await attemptStep("release-quota", async () => {
      const removed = await store.update<SoloQuota, boolean>(
        SOLO_QUOTA_KEY,
        (quota) => {
          if (quota.active[reservationId]?.showId !== showId) return false;
          delete quota.active[reservationId];
          return true;
        },
      );
      return removed ? "released" : "already-released";
    });
    if (released !== "succeeded")
      throw new HttpError(503, "solo_closure", failedStep);
    failedStep = "Saving the media closure failed after two attempts.";
    const saved = await attemptStep("record-closure", async () => {
      await store.update<ShowRecord, void>(key, (record) => {
        if (
          record.soloReservation?.id !== reservationId ||
          record.soloReservation.generation !== generation
        )
          return;
        record.soloReservation.status = "closed";
        record.soloReservation.closedAt ??= Date.now();
        record.soloReservation.closureReceipt = completionReceipt;
        record.soloReservation.closureProgress = {
          phase: "complete",
          nextIdentity: 0,
        };
        record.state.solo = {
          endsAt: record.soloReservation.expiresAt,
          status: "closed",
        };
      });
    });
    if (saved !== "succeeded")
      throw new HttpError(503, "solo_closure", failedStep);
    return { closed: true, stale: false };
  } catch {
    const completedElsewhere = await store
      .update<ShowRecord, boolean>(key, (record) => {
        if (
          record.soloReservation?.id !== reservationId ||
          record.soloReservation.generation !== generation
        )
          return false;
        if (
          record.soloReservation.status === "closed" &&
          record.soloReservation.closureReceipt
        )
          return true;
        record.soloReservation.status = "closing";
        record.state.solo = {
          endsAt: record.soloReservation.expiresAt,
          status: "closing",
          closureError: failedStep,
        };
        return false;
      })
      .catch(() => {
        log("record-failure", "failed", 1);
        return false;
      });
    if (completedElsewhere) {
      log("record-closure", "completed-elsewhere", 1);
      return { closed: true, stale: false };
    }
    throw new HttpError(503, "solo_closure", failedStep);
  }
}
