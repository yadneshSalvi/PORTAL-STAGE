import type { ShowAction } from "@/lib/contracts";

/** Closing an on-air path stays available even after this director loses its lease. */
export function canIssueDirectorAction(
  action: ShowAction,
  leaseValid: boolean,
) {
  return (
    leaseValid ||
    action.type === "panic" ||
    action.type === "hold" ||
    action.type === "end" ||
    action.type === "hide" ||
    action.type === "leave" ||
    (action.type === "consent" && !action.broadcast) ||
    (action.type === "ready" && !action.ready)
  );
}
