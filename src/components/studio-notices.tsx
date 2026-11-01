import { EyeOff, Radio, ShieldCheck } from "lucide-react";
import type { ShowPhase, ShowState } from "@/lib/contracts";
import type { ClientState as TwitchClientState } from "@/lib/twitch-client";
import { StatusPill } from "./ui";

type LeaseStatus =
  "loading" | "acquiring" | "active" | "lost" | "ended" | "unavailable";

const CHAT_FAILURES: Partial<Record<TwitchClientState, string>> = {
  gap: "Chat gap — messages may be missed",
  revoked: "Twitch access revoked",
  failed: "Chat subscription failed",
};

/** A short visible label for a chat failure; the full message stays in the title. */
export function chatWarningLabel(
  state: TwitchClientState,
  message: string,
): string | null {
  return (
    CHAT_FAILURES[state] ??
    (message.includes("commands may not have reached")
      ? "Commands dropped"
      : null)
  );
}

/** A stopped connector needs a fresh attempt rather than a disconnect. */
export function chatToggleAction(
  enabled: boolean,
  state: TwitchClientState,
): "connect" | "reconnect" | "disconnect" {
  if (!enabled) return "connect";
  return state === "failed" || state === "revoked" ? "reconnect" : "disconnect";
}

export function StudioChatWarning({
  state,
  message,
}: {
  state: TwitchClientState;
  message: string;
}) {
  const label = chatWarningLabel(state, message);
  if (!label) return null;
  return (
    <StatusPill tone="gold" live title={message} ariaLabel={message || label}>
      {label}
    </StatusPill>
  );
}

const MEDIA_HINT_LABELS: [RegExp, string][] = [
  [
    /^Program (transport was interrupted|publication stopped|is held)/i,
    "Program interrupted",
  ],
  [/^Program needs/i, "Program not publishing"],
  [/media room disconnected/i, "Media room disconnected"],
  [/^Media is reconnecting/i, "Media reconnecting"],
  [/^Media reconnected/i, "Media reconnected"],
  [/performer left/i, "Performer left"],
  [/stopped delivering frames/i, "Video feed stalled"],
  [/feed is temporarily paused/i, "Feed paused"],
  [/track could not be received/i, "Feed not received"],
  [/^Audio is blocked/i, "Audio blocked"],
  [/^Audio output/i, "Audio output unchanged"],
  [/^Synthetic transport test is enabled/i, "Synthetic test plate"],
  [/^Synthetic transport media/i, "Test media unavailable"],
  [/synthetic control rehearsal/i, "Rehearsal has no media room"],
  [
    /Audience Room (is illustrated|does not join)/i,
    "Audience Room has no media",
  ],
  [/^Joined with microphone muted/i, "Microphone muted"],
  [/^Camera changed/i, "Camera changed"],
  [/did not acknowledge device presence/i, "Presence not confirmed"],
  [/solo media session has closed|show has ended/i, "Media closed"],
  [/HTTPS/, "Secure link required"],
  [/browser (does not|cannot)/i, "Browser unsupported"],
  [/not configured/i, "Media not configured"],
  [/temporarily unavailable/i, "Media service unavailable"],
  [/^Media access has changed/i, "Media access changed"],
  [/media connection could not be established/i, "Media connection failed"],
  [/^Access to the camera was blocked/i, "Camera blocked"],
  [/^Access to the microphone was blocked/i, "Microphone blocked"],
  [/microphone/i, "Microphone unavailable"],
  [/camera/i, "Camera unavailable"],
];

/** Derives a short, specific chip label from a media controller hint. */
export function mediaHintLabel(hint: string): string {
  const match = MEDIA_HINT_LABELS.find(([pattern]) => pattern.test(hint));
  if (match) return match[1];
  const sentence = hint.split(/(?<=[.!?])\s/)[0].replace(/[.!?]$/, "");
  if (sentence.length <= 32) return sentence;
  const cut = sentence.slice(0, 32);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 16 ? cut.lastIndexOf(" ") : 32)}…`;
}

export function StudioMediaHint({ hint }: { hint: string }) {
  if (!hint) return null;
  return (
    <div className="media-status-chip">
      <StatusPill tone="gold" live title={hint} ariaLabel={hint}>
        {mediaHintLabel(hint)}
      </StatusPill>
    </div>
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
  const failure = active ? CHAT_FAILURES[connection] : undefined;
  const label = rehearsal
    ? "Test ballots"
    : listening
      ? "Listening"
      : failure
        ? failure
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
        className={`connection-indicator ${listening ? "connected" : failure ? "warning" : ""}`}
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
            ? "Program may freeze while this window is hidden."
            : "Program may have paused while this window was hidden."}
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
