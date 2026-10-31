import type { Point, SessionRole, ShowState, Slot } from "../lib/contracts";

export type MediaStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";
export type MediaQuality = "unknown" | "excellent" | "good" | "poor" | "lost";
export type DevicePermission =
  "unknown" | "prompt" | "granted" | "denied" | "unavailable";
export type MediaIssue = {
  code:
    | "unsupported"
    | "insecure-context"
    | "permission-denied"
    | "device-missing"
    | "device-busy"
    | "device-constraints"
    | "device-ended"
    | "connection"
    | "authorization"
    | "stale-renderer"
    | "program"
    | "unknown";
  message: string;
  device?: "camera" | "microphone";
  recoverable: boolean;
};
export type MediaPresence = {
  connected: boolean;
  camera: boolean;
  microphone: boolean;
};
export type MediaCapabilities = {
  secureContext: boolean;
  webRTC: boolean;
  devices: boolean;
  canvasCapture: boolean;
  audioMix: boolean;
  outputSelection: boolean;
};
export type MediaRoomOptions = {
  show: ShowState;
  role: SessionRole;
  slot: Slot | null;
  rendererId?: string;
  epoch?: number;
  /** Last server clock sample, for fencing despite a skewed browser clock. */
  serverNow?: number;
  /** Development-only transport check. Server also gates test grants to local development. */
  allowSyntheticMedia?: boolean;
  onPresence?: (presence: MediaPresence) => void | Promise<unknown>;
  onStateHint?: (message: string) => void;
};
export type MediaSnapshot = {
  anchors: Record<Slot, Point>;
  transientAnchors: Record<Slot, Point | null>;
  videos: Record<Slot, HTMLVideoElement | null>;
  localPreview: HTMLVideoElement | null;
  programVideo: HTMLVideoElement | null;
  connected: boolean;
  status: MediaStatus;
  cameraEnabled: boolean;
  /** Active explicit capture attempt; independent of Permissions API state. */
  cameraRequestPending: boolean;
  microphoneEnabled: boolean;
  cameraPublished: boolean;
  microphonePublished: boolean;
  syntheticCamera: boolean;
  programPublishing: boolean;
  programStatus:
    "idle" | "connecting" | "publishing" | "reconnecting" | "error";
  devices: MediaDeviceInfo[];
  selectedDevices: Partial<Record<MediaDeviceKind, string>>;
  permissions: { camera: DevicePermission; microphone: DevicePermission };
  error: MediaIssue | null;
  quality: MediaQuality;
  audioBlocked: boolean;
  videoBlocked: boolean;
  audioLevels: Record<Slot | "program", number>;
  capabilities: MediaCapabilities;
};
