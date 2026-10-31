import { sleep } from "workflow";
import { closeSoloReservation } from "@/server/solo-closure";

async function closeRooms(
  showId: string,
  reservationId: string,
  generation: number,
) {
  "use step";
  try {
    await closeSoloReservation(showId, reservationId, generation);
    return true;
  } catch {
    // Keep retrying durable, idempotent cleanup without publishing provider errors or credentials.
    return false;
  }
}

export async function expireSoloSession(
  showId: string,
  reservationId: string,
  generation: number,
  expiresAt: number,
) {
  "use workflow";
  await sleep(new Date(expiresAt));
  while (!(await closeRooms(showId, reservationId, generation)))
    await sleep("30s");
  return { closed: true };
}
