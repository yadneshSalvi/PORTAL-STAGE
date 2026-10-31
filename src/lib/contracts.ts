/** Shared, JSON-only protocol. Secret/auth fields live exclusively in server records. */
export type Slot = "A" | "B";
export type Weather = "gentle" | "wild";
export type ShowMode = "rehearsal" | "live";
export type ShowPhase = "backstage" | "live" | "hold" | "ended";
export type SessionRole = "director" | "performer" | "program";
export type SceneBeat =
  "overture" | "weather" | "crossing" | "hatching" | "shelter" | "curtain";
export type Point = { x: number; y: number };
export type ShowPreset = {
  id: string;
  name: string;
  episodeTitle: string;
  creatureName: string;
  defaultWeather: Weather;
  crossingMs: number;
  rainIntensity: number;
  creatureCuriosity: number;
  roundSeconds: number;
  reducedMotion: boolean;
  ending: "shared-shelter" | "playful-chase";
};
export type ParticipantState = {
  slot: Slot;
  name: string;
  joined: boolean;
  connected: boolean;
  camera: boolean;
  microphone: boolean;
  consentBroadcast: boolean;
  consentRecording: boolean;
  ready: boolean;
  admitted: boolean;
  calibrated: boolean;
  handedness: "left" | "right";
  anchor: Point;
  lastSeenAt: number | null;
};
export type TransferState = {
  id: string;
  from: Slot;
  to: Slot;
  offeredAt: number;
  expiresAt: number;
  status:
    "offered" | "accepted" | "arrived" | "declined" | "cancelled" | "expired";
  committedAt: number | null;
  commitSequence: number | null;
  arrivedAt: number | null;
};
export type UmbrellaState = {
  id: string;
  owner: Slot;
  version: number;
  repairPatch: "coral";
  wetness: number;
  armed: boolean;
  transfer: TransferState | null;
};
export type RoundState = {
  id: string;
  status: "open" | "closed" | "applied" | "cancelled";
  openedAt: number;
  closesAt: number;
  closedAt: number | null;
  tallies: Record<Weather, number>;
  uniqueVoters: number;
  result: Weather | null;
  source: "audience" | "director" | "rehearsal" | null;
  lastMessageAt: number | null;
};
export type StageEvent = {
  id: string;
  sequence: number;
  at: number;
  type: string;
  actor: "director" | Slot | "twitch" | "system";
  summary: string;
  propId: string;
  propVersion: number;
  owner: Slot;
  detail?: Record<string, string | number | boolean | null>;
};
export type ShowState = {
  id: string;
  mode: ShowMode;
  transport: "fixture" | "livekit";
  title: string;
  phase: ShowPhase;
  beat: SceneBeat;
  sequence: number;
  revision: number;
  epoch: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  channel: string | null;
  participants: Record<Slot, ParticipantState>;
  umbrella: UmbrellaState;
  weather: Weather | null;
  rainStartedAt: number | null;
  creature: {
    id: string;
    hatched: boolean;
    hatchedAt: number | null;
    mood: Weather;
    shelterOwner: Slot;
  };
  round: RoundState | null;
  preset: ShowPreset;
  savedPresets: ShowPreset[];
  events: StageEvent[];
  renderLease: {
    clientId: string | null;
    epoch: number;
    expiresAt: number;
    /** Per-mount fencing; optional only for records created before this protocol. */
    incarnationId?: string;
    incarnationSequence?: number;
    releasedAt?: number;
  };
  twitch: {
    connected: boolean;
    connectedAt: number | null;
    lastEventAt: number | null;
    lastHeartbeatAt: number | null;
    status: string;
    subscriptionId: string | null;
  };
};
export type SessionInfo = {
  authenticated: boolean;
  hostAllowed: boolean;
  displayName: string | null;
  login: string | null;
  twitchConnected: boolean;
  currentShowId: string | null;
  services: {
    database: "postgres" | "local" | "unavailable";
    mediaConfigured: boolean;
    twitchConfigured: boolean;
  };
};
export type ShowEnvelope = {
  show: ShowState;
  role: SessionRole;
  slot: Slot | null;
  serverNow: number;
};
export type ActionEnvelope = {
  action: ShowAction;
  idempotencyKey: string;
  expectedVersion?: number;
  epoch?: number;
  rendererId?: string;
  incarnationId?: string;
  incarnationSequence?: number;
};
export type ShowAction =
  | {
      type:
        | "start"
        | "hold"
        | "resume"
        | "end"
        | "panic"
        | "reset"
        | "restore-rehearsal";
    }
  | { type: "admit" | "hide"; slot: Slot }
  | {
      type: "consent";
      broadcast: boolean;
      recording: boolean;
      name?: string;
      slot?: Slot;
    }
  | {
      type: "presence";
      connected: boolean;
      camera: boolean;
      microphone: boolean;
      slot?: Slot;
    }
  | { type: "ready"; ready: boolean; slot?: Slot }
  | {
      type: "calibrate";
      anchor: Point;
      handedness: "left" | "right";
      slot?: Slot;
    }
  | { type: "anchor"; anchor: Point; slot?: Slot }
  | { type: "arm"; armed: boolean }
  | { type: "offer"; from?: Slot }
  | {
      type: "accept" | "decline" | "cancel-offer";
      transferId: string;
      slot?: Slot;
    }
  | { type: "arrive"; transferId: string }
  | { type: "recall"; to: Slot }
  | { type: "open-round" }
  | { type: "close-round"; fallback?: Weather }
  | { type: "apply-weather"; weather?: Weather }
  | { type: "rehearsal-vote"; choice: Weather; voter: string }
  | { type: "hatch" | "shelter" }
  | { type: "save-preset"; preset: ShowPreset }
  | { type: "load-preset"; presetId: string }
  | { type: "leave"; slot?: Slot };
export type Invitation = {
  code: string;
  expiresAt: number;
  slot: Slot;
  url: string;
};
export type MediaToken = {
  url: string;
  token: string;
  room: string;
  identity: string;
  expiresAt: number;
  slot: Slot | null;
  purpose: "performer" | "director" | "output-publish" | "output-view";
};
export const DEFAULT_PRESET: ShowPreset = {
  id: "borrowed-weather",
  name: "Borrowed Weather",
  episodeTitle: "Borrowed Weather",
  creatureName: "Pip",
  defaultWeather: "gentle",
  crossingMs: 1200,
  rainIntensity: 0.65,
  creatureCuriosity: 0.6,
  roundSeconds: 30,
  reducedMotion: false,
  ending: "shared-shelter",
};
export const OTHER_SLOT: Record<Slot, Slot> = { A: "B", B: "A" };
