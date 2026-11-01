export const SOLO_QUOTA_KEY = "quota:public-solo:v1";

export type SoloQuota = {
  days: Record<string, { total: number; accounts: Record<string, number> }>;
  active: Record<
    string,
    {
      showId: string;
      account: string;
      createdAt: number;
      expiresAt: number;
      confirmed: boolean;
      runId?: string;
      /** Set atomically before a grant enters the show ledger; prevents a racing refund. */
      mediaIssued?: boolean;
      /** Fences late scheduling/issuance while a failed start is inspected and refunded. */
      refunding?: boolean;
      /** Fair, short recovery cooldown shared across application instances. */
      recoveryAt?: number;
    }
  >;
};
