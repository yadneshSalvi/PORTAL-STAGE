import type { ShowAction, ShowEnvelope } from "../lib/contracts";

export type RendererLeaseIdentity = {
  clientId: string;
  incarnationId: string;
  incarnationSequence: number;
};
export type RendererLeaseStatus =
  "loading" | "acquiring" | "active" | "lost" | "ended" | "unavailable";

type LeaseStorage = Pick<Storage, "getItem" | "setItem">;
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{8,128}$/.test(value);

/** A tab keeps its renderer through reloads; each mount fences old renewals/unloads. */
export function createRendererLeaseIdentity(
  showId: string,
  storage?: LeaseStorage,
  makeId: () => string = () => crypto.randomUUID(),
  replace = false,
): RendererLeaseIdentity {
  const incarnationId = makeId();
  try {
    const target = storage ?? window.sessionStorage;
    const key = `portal-stage:renderer:v1:${encodeURIComponent(showId)}`;
    let saved: unknown = null;
    try {
      saved = JSON.parse(target.getItem(key) || "null");
    } catch {
      // A corrupt browser value is replaced rather than trusted as an identity.
    }
    const prior =
      saved && typeof saved === "object"
        ? (saved as Record<string, unknown>)
        : null;
    const reusable =
      !replace &&
      validId(prior?.clientId) &&
      Number.isSafeInteger(prior?.sequence) &&
      Number(prior?.sequence) >= 0 &&
      Number(prior?.sequence) < Number.MAX_SAFE_INTEGER;
    const clientId = reusable ? (prior!.clientId as string) : makeId();
    const incarnationSequence = reusable ? Number(prior!.sequence) + 1 : 1;
    target.setItem(
      key,
      JSON.stringify({ clientId, sequence: incarnationSequence }),
    );
    return { clientId, incarnationId, incarnationSequence };
  } catch {
    // Storage can be disabled. A fresh identity remains safe and gets the normal
    // explicit lease-recovery flow rather than reusing an unfenced incarnation.
    return { clientId: makeId(), incarnationId, incarnationSequence: 1 };
  }
}

export function rendererLeaseStatus(
  envelope: ShowEnvelope | null,
  rendererId: string,
  serverNow: number,
  enabled: boolean,
  error: string,
  identity?: RendererLeaseIdentity | null,
  initialClaim = false,
): RendererLeaseStatus {
  if (!envelope) return "loading";
  const { show, role } = envelope;
  if (show.phase === "ended") return "ended";
  if (!enabled || role !== "director") return "unavailable";
  const lease = show.renderLease;
  if (
    rendererId &&
    lease.clientId === rendererId &&
    lease.epoch === show.epoch &&
    (!lease.incarnationId ||
      (lease.incarnationId === identity?.incarnationId &&
        lease.incarnationSequence === identity.incarnationSequence)) &&
    !lease.releasedAt &&
    lease.expiresAt > serverNow
  )
    return "active";
  if (initialClaim && !error) return "acquiring";
  return error || lease.clientId ? "lost" : "acquiring";
}

/** Only an existing incarnation renews with an epoch; a reload first reclaims it. */
export function rendererLeaseClaim(
  identity: RendererLeaseIdentity,
  envelope: ShowEnvelope,
  takeover: boolean,
) {
  const lease = envelope.show.renderLease;
  const renewal =
    lease.clientId === identity.clientId &&
    lease.incarnationId === identity.incarnationId &&
    lease.incarnationSequence === identity.incarnationSequence &&
    !lease.releasedAt;
  return {
    ...identity,
    takeover,
    ...(takeover || renewal ? { epoch: envelope.show.epoch } : {}),
  };
}

const emergencyActions = new Set<ShowAction["type"]>([
  "panic",
  "hold",
  "end",
  "hide",
  "leave",
]);

/** Recheck queued cues against the current mount; safety controls remain usable. */
export function maySendDirectorAction(
  action: ShowAction,
  envelope: ShowEnvelope,
  identity: RendererLeaseIdentity | null,
  serverNow: number,
  enabled = true,
): boolean {
  return (
    envelope.role !== "director" ||
    emergencyActions.has(action.type) ||
    (action.type === "ready" && !action.ready) ||
    (action.type === "consent" && !action.broadcast) ||
    rendererLeaseStatus(
      envelope,
      identity?.clientId || "",
      serverNow,
      enabled,
      "",
      identity,
    ) === "active"
  );
}

/** One timer and one renewal flight, with a fresh eligibility check after awaits. */
export function startRendererLeaseHeartbeat(
  claim: () => Promise<unknown>,
  eligible: () => boolean,
) {
  let active = true;
  let flight = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wake = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!active || flight || !eligible()) return;
    flight = true;
    try {
      await claim();
    } catch {
      // The claimant reports its own failure; the bounded heartbeat can retry.
    } finally {
      flight = false;
      if (active && eligible()) timer = setTimeout(wake, 4000);
    }
  };
  void wake();
  return {
    wake,
    stop() {
      active = false;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

/** The server accepts an unload only for this exact mount, never clientId alone. */
export function releaseRendererLease(
  showId: string,
  identity: RendererLeaseIdentity,
  epoch: number,
) {
  const path = `/api/shows/${encodeURIComponent(showId)}/lease/release`;
  const body = JSON.stringify({ ...identity, epoch });
  try {
    if (
      navigator.sendBeacon?.(
        path,
        new Blob([body], { type: "application/json" }),
      )
    )
      return;
  } catch {
    // Some browsers refuse beacon delivery during page lifecycle transitions.
  }
  void fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
