import type { ShowState, Slot } from "../lib/contracts";
import { rendererMediaIdentity } from "../lib/media-identity";
import type { MediaCapabilities, MediaIssue, MediaRoomOptions } from "./types";

export const MEDIA_TRACKS = {
  camera: "portal-camera",
  microphone: "portal-microphone",
  returnVideo: "portal-return",
  programVideo: "portal-program",
  programAudio: "portal-program-audio",
} as const;

/** Metadata is signed by the token service. Never infer a role from a display name. */
export function participantSlot(metadata: string | undefined): Slot | null {
  try {
    const value: unknown = JSON.parse(metadata || "null");
    if (!value || typeof value !== "object") return null;
    const data = value as Record<string, unknown>;
    if (data.role === "director" && data.slot === "A") return "A";
    if (data.role === "performer" && data.slot === "B") return "B";
  } catch {
    /* Unknown participants are never admitted to a camera slot. */
  }
  return null;
}

export function hasRenderAuthority(
  options: MediaRoomOptions,
  serverNow = Date.now(),
): boolean {
  const { show, role, rendererId, epoch } = options;
  return (
    role === "director" &&
    (show.mode === "live" || !!options.allowSyntheticMedia) &&
    show.phase !== "ended" &&
    !!rendererId &&
    epoch === show.epoch &&
    epoch === show.renderLease.epoch &&
    show.renderLease.clientId === rendererId &&
    (!show.renderLease.incarnationId ||
      (show.renderLease.incarnationId === options.rendererIncarnationId &&
        show.renderLease.incarnationSequence ===
          options.rendererIncarnationSequence)) &&
    !show.renderLease.releasedAt &&
    show.renderLease.expiresAt > serverNow
  );
}

/** A muted, disconnected, backstage, or withdrawn participant contributes no public audio. */
export function mayMixSlot(show: ShowState, slot: Slot): boolean {
  const participant = show.participants[slot];
  return (
    show.phase === "live" &&
    participant.connected &&
    participant.admitted &&
    participant.consentBroadcast &&
    participant.microphone
  );
}

export type MediaSender = { identity: string; metadata?: string };

/** A signed role also belongs to one immutable show epoch and renderer mount. */
export function rendererParticipantMatches(
  show: ShowState,
  sender: MediaSender,
  kind: "director" | "output-publisher",
): boolean {
  if (!sender.metadata || sender.metadata.length > 512) return false;
  try {
    const data: unknown = JSON.parse(sender.metadata);
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    const metadata = data as Record<string, unknown>;
    const lease = show.renderLease;
    return (
      metadata.role === kind &&
      metadata.showId === show.id &&
      metadata.epoch === show.epoch &&
      lease.epoch === show.epoch &&
      (kind !== "director" || metadata.slot === "A") &&
      (lease.incarnationId
        ? metadata.incarnationId === lease.incarnationId &&
          metadata.incarnationSequence === lease.incarnationSequence
        : metadata.incarnationId === undefined &&
          metadata.incarnationSequence === undefined) &&
      sender.identity ===
        rendererMediaIdentity(show.id, show.epoch, kind, lease.incarnationId)
    );
  } catch {
    return false;
  }
}

export function mayReceiveRendererMedia(
  show: ShowState,
  sender: MediaSender,
  kind: "director" | "output-publisher",
  serverNow: number,
): boolean {
  return (
    show.phase !== "ended" &&
    !!show.renderLease.clientId &&
    !show.renderLease.releasedAt &&
    show.renderLease.expiresAt > serverNow &&
    rendererParticipantMatches(show, sender, kind)
  );
}

/** The output viewer closes its own audio path even if a stale publisher is audible. */
export function mayPlayProgramAudio(
  show: ShowState,
  sender: MediaSender,
  serverNow: number,
): boolean {
  return (
    show.phase === "live" &&
    mayReceiveRendererMedia(show, sender, "output-publisher", serverNow)
  );
}

export function mediaCapabilities(): MediaCapabilities {
  return {
    secureContext: typeof window !== "undefined" && window.isSecureContext,
    webRTC: typeof RTCPeerConnection !== "undefined",
    devices:
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia,
    canvasCapture:
      typeof HTMLCanvasElement !== "undefined" &&
      "captureStream" in HTMLCanvasElement.prototype,
    audioMix: typeof AudioContext !== "undefined",
    outputSelection:
      typeof HTMLMediaElement !== "undefined" &&
      "setSinkId" in HTMLMediaElement.prototype,
  };
}

export function mediaIssue(
  error: unknown,
  device?: "camera" | "microphone",
): MediaIssue {
  const name = error instanceof Error ? error.name : "";
  const noun = device === "microphone" ? "microphone" : "camera";
  if (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    name === "SecurityError"
  )
    return {
      code: "permission-denied",
      device,
      recoverable: true,
      message: `Access to the ${noun} was blocked. Allow it in this site's browser settings, then select Enable ${noun} again.`,
    };
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return {
      code: "device-missing",
      device,
      recoverable: true,
      message: `No ${noun} was found. Connect a device and select it, or continue with it off.`,
    };
  if (
    name === "NotReadableError" ||
    name === "TrackStartError" ||
    name === "AbortError"
  )
    return {
      code: "device-busy",
      device,
      recoverable: true,
      message: `The ${noun} is busy or was disconnected. Close other apps using it, reconnect it, then try again.`,
    };
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError")
    return {
      code: "device-constraints",
      device,
      recoverable: true,
      message: `The selected ${noun} cannot use those settings. Select another device or its default settings.`,
    };
  const status =
    typeof error === "object" && error && "status" in error
      ? Number(error.status)
      : 0;
  if (status === 401 || status === 403 || status === 409)
    return {
      code: "authorization",
      recoverable: true,
      message:
        "Media access has changed. Check consent, calibration, and the active director lease, then reconnect from backstage.",
    };
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
  if (status === 503 && ["media_unconfigured", "media_url"].includes(code))
    return {
      code: "connection",
      recoverable: true,
      message:
        "Live media is not configured for this deployment yet. Device preview remains private; use the labeled rehearsal while the host configures LiveKit.",
    };
  if (status === 503)
    return {
      code: "connection",
      recoverable: true,
      message:
        "The media or control service is temporarily unavailable. Your devices and committed scene are preserved; check the connection and try again shortly.",
    };
  return {
    code: device ? "unknown" : "connection",
    device,
    recoverable: true,
    message: device
      ? `The ${noun} could not start. Check the device and browser permission, then try again.`
      : "The media connection could not be established. Check your network and media setup, then reconnect.",
  };
}
