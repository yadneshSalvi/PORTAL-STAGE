import { EyeOff, Radio, ShieldCheck } from "lucide-react";
import type { ShowPhase, ShowState } from "@/lib/contracts";
import type { ClientState as TwitchClientState } from "@/lib/twitch-client";

type LeaseStatus =
  "loading" | "acquiring" | "active" | "lost" | "ended" | "unavailable";

export function StudioChatWarning({ message }: { message: string }) {
  if (!message.includes("commands may not have reached")) return null;
  return (
    <span
      className="chip status-pill status-gold"
      role="status"
      title={message}
      aria-label={message}
    >
      <span className="status-dot" aria-hidden="true" />
      Commands dropped
    </span>
  );
}

export function StudioChatStatus({
  show,
  enabled,
  leaseValid,
  connection,
}: {
  show: Pick<ShowState, "mode" | "phase" | "twitch">;
  enabled: boolean;
  leaseValid: boolean;
  connection: TwitchClientState;
}) {
  const rehearsal = show.mode === "rehearsal";
  const active = !rehearsal && enabled && leaseValid && show.phase !== "ended";
  const listening = active && connection === "connected";
  const label = rehearsal
    ? "Test ballots"
    : listening
      ? "Listening"
      : active && connection === "connecting"
        ? "Connecting…"
        : show.phase !== "ended" && show.twitch.connected
          ? "Reconnect required"
          : "Not connected";
  return (
    <span
      className="stage-connection"
      role="img"
      title={`Twitch chat: ${label}`}
      aria-label={`Twitch chat: ${label}`}
    >
      <Radio size={17} aria-hidden="true" />
      <span
        className={`connection-indicator ${listening ? "connected" : ""}`}
      />
    </span>
  );
}

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
  wasHidden = false,
  onAcknowledge,
}: {
  hidden: boolean;
  phase: ShowPhase;
  wasHidden?: boolean;
  onAcknowledge?: () => void;
}) {
  if ((!hidden && !wasHidden) || phase === "ended") return null;
  return (
    <div className="authority-notice visibility-notice" role="alert">
      <EyeOff size={22} aria-hidden="true" />
      <p>
        <strong>
          {hidden
            ? "Keep the director window visible."
            : "Check the picture after returning."}
        </strong>
        <span>
          {hidden
            ? "Hidden or covered browser windows can pause stage frames and freeze Program. Rendering continues at a reduced cadence while the browser allows it."
            : "This director window was hidden. Stage frames may have paused. Check the current Program picture before continuing."}{" "}
          Keep this stage in a dedicated, uncovered Chrome window.
        </span>
      </p>
      {!hidden && onAcknowledge ? (
        <button
          className="button button-dark button-small"
          onClick={onAcknowledge}
        >
          I checked the picture
        </button>
      ) : null}
    </div>
  );
}
