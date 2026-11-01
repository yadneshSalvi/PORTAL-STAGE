import type {
  AudienceChoice,
  ShowState,
  Slot,
  Weather,
  SessionRole,
} from "@/lib/contracts";
export type RateBucket = { at: number; count: number };
export type SessionRecord = {
  id: string;
  createdAt: number;
  currentShowId: string | null;
  credentialId?: string;
  userId?: string;
  login?: string;
  displayName?: string;
  oauth?: { hash: string; expiresAt: number };
  rates: Record<string, RateBucket>;
};
export type ShowRecord = {
  state: ShowState;
  ownerId: string;
  participantSessions: Partial<Record<Slot, string>>;
  credentialId: string | null;
  channelId: string | null;
  ballots: Record<
    string,
    | Weather
    | {
        choice: AudienceChoice;
        sentAt: number;
        order: string;
        contributor: string | null;
      }
  >;
  presenceRates?: Record<string, number>;
  presenceOrder?: string;
  /** Latest presence deliveries; optional for records saved before separation. */
  effectMessageIds?: string[];
  /** Accepted vote deliveries for the current round. */
  messageIds: string[];
  idempotency: Record<string, { hash: string; sequence: number; at: number }>;
  rates: Record<string, RateBucket>;
  inviteGeneration: number;
  /** Legacy grants adopt the invitation generation before its next change. */
  outputGeneration?: number;
  /** Bounded issued viewer identities, including tokens not connected yet. */
  outputIdentities?: string[];
  activeInvitations?: Partial<Record<Slot, string>>;
  twitchSessionId: string | null;
  soloReservation?: SoloReservation;
};
export type SoloReservation = {
  id: string;
  account: string;
  createdAt: number;
  expiresAt: number;
  generation: number;
  status: "pending" | "uncertain" | "scheduled" | "closing" | "closed";
  runId?: string;
  closedAt?: number;
  /** A failed startup fences the show before its quota refund can race a late grant. */
  startFailedAt?: number;
  /** Distinguishes a completed concurrent cleanup from a legacy closed record awaiting quota release. */
  closureReceipt?: string;
  /** Resumable, monotonic cleanup after issuance is fenced and the identity ledger is fixed. */
  closureProgress?: {
    phase: "before-delete" | "delete-rooms" | "after-delete" | "complete";
    nextIdentity: number;
  };
  issued: {
    room: string;
    identity: string;
    issuedAt: number;
    expiresAt: number;
  }[];
};
export type InviteRecord = {
  hash: string;
  showId: string;
  slot: Slot;
  expiresAt: number;
  usedBy: string | null;
  generation: number;
};
export type OutputGrantRecord = {
  hash: string;
  showId: string;
  expiresAt: number;
  redeemed: boolean;
  generation: number;
};
export type Actor = {
  id: string;
  role: SessionRole | "audience";
  slot: Slot | null;
  roundId?: string;
};
