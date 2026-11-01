import { FatalError, sleep } from "workflow";
import { closeSoloReservation } from "@/server/solo-closure";

export async function closeRooms(
  showId: string,
  reservationId: string,
  generation: number,
) {
  "use step";
  try {
    const result = await closeSoloReservation(
      showId,
      reservationId,
      generation,
    );
    return result.stale ? "stale" : result.closed ? "closed" : "retry";
  } catch {
    // The bounded workflow and lazy quota sweep repeat the same idempotent closure.
    return "retry";
  }
}
closeRooms.maxRetries = 0;

export async function expireSoloSession(
  showId: string,
  reservationId: string,
  generation: number,
  expiresAt: number,
) {
  "use workflow";
  await sleep(new Date(expiresAt));
  for (let attempt = 1; attempt <= 5; attempt++) {
    const result = await closeRooms(showId, reservationId, generation);
    if (result !== "retry")
      return { closed: result === "closed", stale: result === "stale" };
    if (attempt < 5) await sleep("30s");
  }
  console.warn("portal.solo.expiry cleanup attempts exhausted", {
    showId,
    reservationId,
    generation,
  });
  throw new FatalError(
    "Solo media closure retries exhausted. Capacity stays reserved until lazy recovery or a director retry succeeds.",
  );
}
