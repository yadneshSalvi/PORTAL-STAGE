"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { act, api, getShow } from "@/lib/client";
import type { ShowAction, ShowEnvelope } from "@/lib/contracts";
import {
  createRendererLeaseIdentity,
  maySendDirectorAction,
  releaseRendererLease,
  rendererLeaseClaim,
  rendererLeaseStatus,
  startRendererLeaseHeartbeat,
  type RendererLeaseIdentity,
} from "@/media/renderer-lease";
import { PresenceLane, type PresenceAction } from "./presence-lane";

export function useNow() {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
type Resolve = (result: ShowEnvelope | null) => void;
type Task = { action: ShowAction; quiet: boolean; resolve: Resolve };
export function useShowController(
  showId: string,
  options: { lease?: boolean } = {},
) {
  const [envelope, setEnvelope] = useState<ShowEnvelope | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [rendererId, setRendererId] = useState(""),
    [serverOffset, setServerOffset] = useState(0),
    [leaseError, setLeaseError] = useState(""),
    [leaseRecovery, setLeaseRecovery] = useState(""),
    [documentHidden, setDocumentHidden] = useState(false);
  const leaseEnabled = options.lease !== false;
  const latest = useRef<ShowEnvelope | null>(null),
    mounted = useRef(true),
    idRef = useRef(""),
    identityRef = useRef<RendererLeaseIdentity | null>(null),
    leaving = useRef(false),
    leaseEnabledRef = useRef(leaseEnabled),
    clockOffset = useRef(0),
    leaseHeartbeat = useRef<ReturnType<
      typeof startRendererLeaseHeartbeat
    > | null>(null),
    working = useRef(false),
    foreground = useRef<Task[]>([]),
    samples = useRef(new Map<string, Task>()),
    leaseFlight = useRef<Promise<ShowEnvelope | null> | null>(null),
    snapshotFlight = useRef<Promise<ShowEnvelope | null> | null>(null),
    reconciliation = useRef<Promise<ShowEnvelope | null> | null>(null),
    kick = useRef<() => void>(() => undefined);
  leaseEnabledRef.current = leaseEnabled;
  const receive = useCallback(
    (next: ShowEnvelope) => {
      if (!mounted.current || leaving.current || next.show.id !== showId)
        return;
      const current = latest.current;
      const revision = (value: ShowEnvelope) =>
        value.show.revision ?? value.show.sequence;
      if (
        current &&
        (next.show.epoch < current.show.epoch ||
          (next.show.epoch === current.show.epoch &&
            revision(next) < revision(current)))
      )
        return;
      clockOffset.current = next.serverNow - Date.now();
      setServerOffset(clockOffset.current);
      latest.current = next;
      setEnvelope(next);
      if (next.show.phase === "live") setLeaseRecovery("");
    },
    [showId],
  );
  const refresh = useCallback((): Promise<ShowEnvelope | null> => {
    if (snapshotFlight.current) return snapshotFlight.current;
    const identity = identityRef.current;
    const task = getShow(showId)
      .then((next) => {
        if (
          identity !== identityRef.current ||
          !mounted.current ||
          leaving.current
        )
          return null;
        receive(next);
        return next;
      })
      .catch((e: unknown) => {
        if (
          mounted.current &&
          identity === identityRef.current &&
          !leaving.current
        )
          setError(
            e instanceof Error
              ? e.message
              : "The stage connection was interrupted.",
          );
        return null;
      })
      .finally(() => {
        if (snapshotFlight.current === task) snapshotFlight.current = null;
      });
    snapshotFlight.current = task;
    return task;
  }, [showId, receive]);
  useEffect(() => {
    mounted.current = true;
    leaving.current = false;
    const identity = createRendererLeaseIdentity(showId);
    identityRef.current = identity;
    idRef.current = identity.clientId;
    setRendererId(identity.clientId);
    latest.current = null;
    snapshotFlight.current = null;
    leaseFlight.current = null;
    setEnvelope(null);
    setError("");
    setLeaseError("");
    setLeaseRecovery("");
    setDocumentHidden(document.hidden);
    let active = true;
    let timer: number;
    async function poll() {
      await refresh();
      if (active)
        timer = window.setTimeout(poll, document.hidden ? 5000 : 1500);
    }
    const release = () => {
      leaving.current = true;
      const current = latest.current;
      const identity = identityRef.current;
      if (
        identity &&
        leaseEnabledRef.current &&
        current?.role === "director" &&
        current.show.id === showId &&
        current.show.phase !== "ended" &&
        current.show.renderLease.clientId === identity.clientId
      )
        releaseRendererLease(showId, identity, current.show.epoch);
    };
    const visibility = () => {
      setDocumentHidden(document.hidden);
      if (!leaving.current) {
        void refresh();
        void leaseHeartbeat.current?.wake();
      }
    };
    const pageShow = () => {
      leaving.current = false;
      visibility();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", release);
    window.addEventListener("pageshow", pageShow);
    void poll();
    return () => {
      release();
      mounted.current = false;
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", release);
      window.removeEventListener("pageshow", pageShow);
      foreground.current.splice(0).forEach((task) => task.resolve(null));
      samples.current.forEach((task) => task.resolve(null));
      samples.current.clear();
    };
  }, [showId, refresh]);
  const maySend = useCallback(
    (action: ShowAction, current: ShowEnvelope) =>
      maySendDirectorAction(
        action,
        current,
        identityRef.current,
        Date.now() + clockOffset.current,
        leaseEnabledRef.current,
      ),
    [],
  );
  const sendPresence = useCallback(
    async (action: PresenceAction) => {
      const current = latest.current;
      const identity = identityRef.current;
      if (
        !current ||
        !mounted.current ||
        leaving.current ||
        !maySend(action, current)
      )
        return null;
      try {
        const next = await act(showId, action, {
          expectedVersion: current.show.umbrella.version,
          epoch: current.show.epoch,
          rendererId: idRef.current,
          incarnationId: identity?.incarnationId,
          incarnationSequence: identity?.incarnationSequence,
        });
        if (identity !== identityRef.current) return null;
        receive(next);
        return next;
      } catch {
        // Presence failure must not hold the semantic queue or lease renewal.
        if (identity === identityRef.current) void refresh();
        return null;
      }
    },
    [showId, receive, refresh, maySend],
  );
  const presenceLane = useMemo(
    () => new PresenceLane<ShowEnvelope>(sendPresence),
    [sendPresence],
  );
  useEffect(() => () => presenceLane.clearPending(), [presenceLane]);
  const execute = useCallback(
    async (task: Task) => {
      const current = latest.current;
      const identity = identityRef.current;
      if (!current || !mounted.current || leaving.current) {
        task.resolve(null);
        return;
      }
      if (!maySend(task.action, current)) {
        if (!task.quiet)
          setError(
            "This studio no longer owns the stage. Recover the current studio before sending a cue.",
          );
        task.resolve(null);
        return;
      }
      if (!task.quiet) {
        setBusy(true);
        setError("");
      }
      try {
        const next = await act(showId, task.action, {
          expectedVersion: current.show.umbrella.version,
          epoch: current.show.epoch,
          rendererId: idRef.current,
          incarnationId: identity?.incarnationId,
          incarnationSequence: identity?.incarnationSequence,
        });
        if (identity === identityRef.current) {
          receive(next);
          task.resolve(next);
        } else task.resolve(null);
      } catch (e) {
        if (identity !== identityRef.current) {
          task.resolve(null);
          return;
        }
        if (mounted.current && !task.quiet)
          setError(
            e instanceof Error ? e.message : "That cue could not be completed.",
          );
        if (!reconciliation.current) {
          const previous = snapshotFlight.current;
          const recovery = previous
            ? previous.then(() => refresh())
            : refresh();
          reconciliation.current = recovery;
          if (mounted.current) setBusy(true);
          void recovery.finally(() => {
            if (reconciliation.current === recovery) {
              reconciliation.current = null;
              if (
                mounted.current &&
                !foreground.current.length &&
                !reconciliation.current
              )
                setBusy(false);
              kick.current();
            }
          });
        }
        task.resolve(null);
      }
    },
    [showId, receive, refresh, maySend],
  );
  const drain = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    try {
      while (mounted.current) {
        let task = !reconciliation.current
          ? foreground.current.shift() || null
          : null;
        if (!task) {
          const first = samples.current.entries().next();
          if (!first.done) {
            const [key, sample] = first.value;
            samples.current.delete(key);
            task = sample;
          }
        }
        if (!task) break;
        await execute(task);
        if (
          mounted.current &&
          !foreground.current.length &&
          !reconciliation.current
        )
          setBusy(false);
      }
    } finally {
      working.current = false;
      if (
        mounted.current &&
        !foreground.current.length &&
        !reconciliation.current
      )
        setBusy(false);
    }
  }, [execute]);
  useEffect(() => {
    kick.current = () => {
      void drain();
    };
  }, [drain]);
  const run = useCallback(
    (action: ShowAction, quiet = false): Promise<ShowEnvelope | null> =>
      new Promise((resolve) => {
        if (!latest.current || !mounted.current || leaving.current) {
          resolve(null);
          return;
        }
        if (!maySend(action, latest.current)) {
          if (!quiet)
            setError(
              "This studio no longer owns the stage. Recover the current studio before sending a cue.",
            );
          resolve(null);
          return;
        }
        if (action.type === "presence") {
          void presenceLane.submit(action).then(resolve);
          return;
        }
        const task: Task = { action, quiet, resolve };
        // Semantic actions share this pump; presence and lease renewal have independent lanes.
        if (action.type === "panic") {
          foreground.current.splice(0).forEach((t) => t.resolve(null));
          samples.current.forEach((t) => t.resolve(null));
          samples.current.clear();
          void execute(task).finally(() => {
            if (mounted.current) setBusy(false);
          });
          return;
        }
        if (quiet) {
          const slot = "slot" in action ? action.slot || "self" : "stage",
            key = `${action.type}:${slot}`;
          samples.current.get(key)?.resolve(null);
          samples.current.set(key, task);
        } else {
          foreground.current.push(task);
          setBusy(true);
        }
        void drain();
      }),
    [execute, drain, presenceLane, maySend],
  );
  const claimLease = useCallback(
    (takeover = false): Promise<ShowEnvelope | null> => {
      if (leaseFlight.current) return leaseFlight.current;
      let identity = identityRef.current;
      const current = latest.current;
      if (
        !identity ||
        !mounted.current ||
        leaving.current ||
        !leaseEnabled ||
        current?.role !== "director" ||
        current.show.phase === "ended"
      )
        return Promise.resolve(null);
      if (takeover) {
        // A copied tab can have an equal sequence. Explicit recovery creates a
        // new renderer, while ordinary reload keeps the stable per-show ID.
        identity = createRendererLeaseIdentity(
          showId,
          undefined,
          undefined,
          true,
        );
        identityRef.current = identity;
        idRef.current = identity.clientId;
        setRendererId(identity.clientId);
        foreground.current.splice(0).forEach((task) => task.resolve(null));
        samples.current.forEach((task) => task.resolve(null));
        samples.current.clear();
        presenceLane.clearPending();
      }
      const claimant = identity;
      const task = api<ShowEnvelope>(
        `/api/shows/${encodeURIComponent(showId)}/lease`,
        {
          method: "POST",
          body: JSON.stringify(rendererLeaseClaim(claimant, current, takeover)),
        },
      )
        .then((next) => {
          if (
            !mounted.current ||
            leaving.current ||
            claimant !== identityRef.current ||
            latest.current?.show.phase === "ended"
          )
            return null;
          receive(next);
          setLeaseError("");
          if (
            next.show.epoch !== current.show.epoch &&
            next.show.phase === "hold"
          )
            setLeaseRecovery(
              "Director authority was recovered. The committed scene is held; resume when ready.",
            );
          return next;
        })
        .catch((e: unknown) => {
          if (
            mounted.current &&
            !leaving.current &&
            claimant === identityRef.current
          )
            setLeaseError(
              e instanceof Error
                ? e.message
                : "Another director has the stage.",
            );
          return null;
        })
        .finally(() => {
          if (leaseFlight.current === task) leaseFlight.current = null;
        });
      leaseFlight.current = task;
      return task;
    },
    [showId, receive, leaseEnabled, presenceLane],
  );
  const role = envelope?.role,
    ended = envelope?.show.phase === "ended";
  useEffect(() => {
    if (!leaseEnabled || role !== "director" || ended) return;
    const heartbeat = startRendererLeaseHeartbeat(
      claimLease,
      () =>
        mounted.current &&
        !leaving.current &&
        latest.current?.role === "director" &&
        latest.current.show.phase !== "ended",
    );
    leaseHeartbeat.current = heartbeat;
    return () => {
      heartbeat.stop();
      if (leaseHeartbeat.current === heartbeat) leaseHeartbeat.current = null;
    };
  }, [role, ended, claimLease, leaseEnabled]);
  const now = useNow();
  return {
    envelope,
    error,
    setError,
    busy,
    run,
    receive,
    refresh,
    rendererId,
    rendererIncarnationId: identityRef.current?.incarnationId,
    rendererIncarnationSequence: identityRef.current?.incarnationSequence,
    serverOffset,
    leaseError,
    leaseRecovery,
    documentHidden,
    leaseStatus: rendererLeaseStatus(
      envelope,
      rendererId,
      (now || Date.now()) + serverOffset,
      leaseEnabled,
      leaseError,
      identityRef.current,
    ),
    claimLease,
  };
}
