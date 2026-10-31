import type { ShowState } from "../lib/contracts";

export function rejectedProgramGrant(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("status" in error)) return false;
  return [401, 403, 404, 410].includes(Number(error.status));
}

/** A Program receiver covers an unowned picture as well as closing its audio. */
export function programAuthorityIssue(
  show: ShowState,
  serverNow: number,
): string | null {
  if (show.phase === "ended") return null;
  if (show.renderLease.releasedAt)
    return "The director left the stage. Program picture and audio are held until the director returns.";
  if (
    !show.renderLease.clientId ||
    show.renderLease.epoch !== show.epoch ||
    show.renderLease.expiresAt <= serverNow
  )
    return "The director’s stage connection has expired. Program picture and audio are held while the director recovers it.";
  return null;
}
