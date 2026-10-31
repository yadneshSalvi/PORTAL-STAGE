import type { ShowState, Slot, Weather, SessionRole } from "@/lib/contracts";
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
  ballots: Record<string, Weather>;
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
export type Actor = { id: string; role: SessionRole; slot: Slot | null };
