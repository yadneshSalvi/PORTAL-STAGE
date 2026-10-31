import { start } from "workflow/api";
import { expireSoloSession } from "@/workflows/solo-expiry";
import { assert, HttpError } from "./errors";
import { getStore } from "./store";
import type { ShowRecord, SoloReservation } from "./records";
import { confirmSoloQuota } from "./solo-policy";

export async function scheduleSolo(
  showId: string,
  reservation: SoloReservation,
) {
  let runId: string;
  try {
    const run = await start(expireSoloSession, [
      showId,
      reservation.id,
      reservation.generation,
      reservation.expiresAt,
    ]);
    runId = run.runId;
    assert(
      typeof runId === "string" && runId.length > 0,
      503,
      "solo_schedule",
      "The solo closure schedule was not confirmed.",
    );
  } catch {
    await getStore().update<ShowRecord, void>(`show:${showId}`, (record) => {
      if (
        record.soloReservation?.id === reservation.id &&
        record.soloReservation.status === "pending"
      )
        record.soloReservation.status = "uncertain";
    });
    throw new HttpError(
      503,
      "solo_schedule",
      "The solo closure schedule could not be confirmed. No media access was issued. This reservation still counts toward today's allowance; open the reserved show to end it safely.",
    );
  }
  await confirmSoloQuota(showId, reservation, runId);
  await getStore().update<ShowRecord, void>(`show:${showId}`, (record) => {
    const current = record.soloReservation;
    assert(
      current?.id === reservation.id &&
        current.generation === reservation.generation &&
        current.status === "pending" &&
        current.expiresAt > Date.now(),
      409,
      "solo_closed",
      "This reservation closed before scheduling finished. No media access was issued.",
    );
    current.runId = runId;
    current.status = "scheduled";
    record.state.solo = { endsAt: current.expiresAt, status: "scheduled" };
  });
}
