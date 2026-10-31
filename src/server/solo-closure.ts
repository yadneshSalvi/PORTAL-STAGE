import { RoomServiceClient } from "livekit-server-sdk";
import type { ShowRecord } from "./records";
import { getStore } from "./store";
import { SOLO_QUOTA_KEY, type SoloQuota } from "./solo-policy";
import { recordEvent } from "./protocol-events";

type RoomCloser = Pick<RoomServiceClient, "removeParticipant" | "deleteRoom">;
function service(): RoomCloser {
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
    { requestTimeout: 8, failover: false },
  );
}
const notFound = (error: unknown) =>
  Boolean(
    error &&
    typeof error === "object" &&
    ((error as { code?: string }).code === "not_found" ||
      (error as { status?: number }).status === 404),
  );

/** Fences minting before I/O, revokes disconnected identities too, and releases capacity only after both rooms close. */
export async function closeSoloReservation(
  showId: string,
  reservationId: string,
  generation: number,
  provider?: RoomCloser,
  now = Date.now(),
  early = false,
) {
  const store = getStore(),
    key = `show:${showId}`;
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
  if (reservation.status !== "closed" && reservation.issued.length) {
    const client = provider ?? service();
    // Cloud enforces this explicit cutoff for identities not currently connected as well.
    // Every JWT was signed before entering this ledger; a concurrent mint cannot escape the fence above.
    const revoke = async () => {
      let failed = false;
      for (let i = 0; i < reservation.issued.length; i += 16) {
        const results = await Promise.allSettled(
          reservation.issued.slice(i, i + 16).map(({ room, identity }) =>
            client.removeParticipant(room, identity, {
              revokeTokenTs: BigInt(Math.floor(Date.now() / 1000) + 30),
            }),
          ),
        );
        failed ||= results.some((result) => result.status === "rejected");
      }
      return failed;
    };
    const revocationFailed = await revoke();
    const closures = await Promise.allSettled(
      [`portal-${showId}-backstage`, `portal-${showId}-program`].map((room) =>
        client.deleteRoom(room).catch((error) => {
          if (!notFound(error)) throw error;
        }),
      ),
    );
    // A second fresh cutoff after deletion covers refresh tokens pushed during removal.
    // +30s stays inside Cloud's documented60s allowance; each RPC is bounded at8s without failover.
    const postDeleteFailed = await revoke();
    if (
      revocationFailed ||
      postDeleteFailed ||
      closures.some((result) => result.status === "rejected")
    )
      throw new Error("Solo media closure is incomplete; retry required.");
  }
  if (reservation.status !== "closed") {
    await store.update<ShowRecord, void>(key, (record) => {
      if (
        record.soloReservation?.id !== reservationId ||
        record.soloReservation.generation !== generation
      )
        return;
      record.soloReservation.status = "closed";
      record.soloReservation.closedAt = Date.now();
      record.state.solo = {
        endsAt: record.soloReservation.expiresAt,
        status: "closed",
      };
    });
  }
  await store.update<SoloQuota, void>(SOLO_QUOTA_KEY, (quota) => {
    if (quota.active[reservationId]?.showId === showId)
      delete quota.active[reservationId];
  });
  return { closed: true, stale: false };
}
