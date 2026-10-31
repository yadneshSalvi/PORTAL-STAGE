import { EyeOff, ShieldCheck } from "lucide-react";
import type { ShowPhase } from "@/lib/contracts";

type LeaseStatus =
  "loading" | "acquiring" | "active" | "lost" | "ended" | "unavailable";

export function StudioAuthorityNotice({
  phase,
  leaseValid,
  status,
  error,
  recovery,
  onTakeover,
}: {
  phase: ShowPhase;
  leaseValid: boolean;
  status: LeaseStatus;
  error: string;
  recovery: string;
  onTakeover: () => void;
}) {
  if (phase === "ended" || (leaseValid && !recovery)) return null;
  if (leaseValid)
    return (
      <div className="authority-notice recovery-notice" role="status">
        <ShieldCheck size={20} aria-hidden="true" />
        <p>{recovery}</p>
      </div>
    );
  const pending = status === "loading" || status === "acquiring";
  return (
    <div className="authority-notice" role="status">
      <ShieldCheck size={20} aria-hidden="true" />
      <p>
        <strong>
          {pending
            ? "Reserving this stage."
            : "This studio does not control the stage."}
        </strong>
        <span>
          {error ||
            (pending
              ? "Waiting for the single canonical renderer. Your story stays on the server."
              : "The renderer lease is unavailable. Check the other director window or take over here.")}
        </span>
      </p>
      {!pending ? (
        <button
          className="button button-dark button-small"
          onClick={onTakeover}
        >
          Take over the stage
        </button>
      ) : null}
    </div>
  );
}

export function StudioVisibilityNotice({
  hidden,
  phase,
}: {
  hidden: boolean;
  phase: ShowPhase;
}) {
  if (!hidden || phase === "ended") return null;
  return (
    <div className="authority-notice visibility-notice" role="alert">
      <EyeOff size={22} aria-hidden="true" />
      <p>
        <strong>Keep the director window visible.</strong>
        <span>
          Hidden or covered browser windows can pause stage frames and freeze
          Program. Rendering continues at a reduced cadence while the browser
          allows it. Keep this stage in a dedicated, uncovered Chrome window.
        </span>
      </p>
    </div>
  );
}
