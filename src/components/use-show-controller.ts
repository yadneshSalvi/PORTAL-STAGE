"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { act, api, getShow } from "@/lib/client";
import type { ShowAction, ShowEnvelope } from "@/lib/contracts";
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
    [leaseError, setLeaseError] = useState("");
  const latest = useRef<ShowEnvelope | null>(null),
    mounted = useRef(true),
    idRef = useRef(""),
    working = useRef(false),
    foreground = useRef<Task[]>([]),
    samples = useRef(new Map<string, Task>()),
    leaseFlight = useRef<Promise<ShowEnvelope | null> | null>(null),
    snapshotFlight = useRef<Promise<ShowEnvelope | null> | null>(null),
    reconciliation = useRef<Promise<ShowEnvelope | null> | null>(null),
    kick = useRef<() => void>(() => undefined);
  const receive = useCallback((next: ShowEnvelope) => {
    if (!mounted.current) return;
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
    setServerOffset(next.serverNow - Date.now());
    latest.current = next;
    setEnvelope(next);
  }, []);
  const refresh = useCallback((): Promise<ShowEnvelope | null> => {
    if (snapshotFlight.current) return snapshotFlight.current;
    const task = getShow(showId)
      .then((next) => {
        receive(next);
        return next;
      })
      .catch((e: unknown) => {
        if (mounted.current)
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
    const id = crypto.randomUUID();
    idRef.current = id;
    setRendererId(id);
    let active = true;
    let timer: number;
    async function poll() {
      await refresh();
      if (active)
        timer = window.setTimeout(poll, document.hidden ? 5000 : 1500);
    }
    void poll();
    return () => {
      mounted.current = false;
      active = false;
      clearTimeout(timer);
      foreground.current.splice(0).forEach((task) => task.resolve(null));
      samples.current.forEach((task) => task.resolve(null));
      samples.current.clear();
    };
  }, [refresh]);
  const sendPresence = useCallback(
    async (action: PresenceAction) => {
      const current = latest.current;
      if (!current || !mounted.current) return null;
      try {
        const next = await act(showId, action, {
          expectedVersion: current.show.umbrella.version,
          epoch: current.show.epoch,
          rendererId: idRef.current,
        });
        receive(next);
        return next;
      } catch {
        // Presence failure must not hold the semantic queue or lease renewal.
        void refresh();
        return null;
      }
    },
    [showId, receive, refresh],
  );
  const presenceLane = useMemo(
    () => new PresenceLane<ShowEnvelope>(sendPresence),
    [sendPresence],
  );
  useEffect(() => () => presenceLane.clearPending(), [presenceLane]);
  const execute = useCallback(
    async (task: Task) => {
      const current = latest.current;
      if (!current || !mounted.current) {
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
        });
        receive(next);
        task.resolve(next);
      } catch (e) {
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
    [showId, receive, refresh],
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
        if (!latest.current || !mounted.current) {
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
    [execute, drain, presenceLane],
  );
  const claimLease = useCallback(
    (takeover = false): Promise<ShowEnvelope | null> => {
      if (leaseFlight.current) return leaseFlight.current;
      if (!idRef.current || !mounted.current) return Promise.resolve(null);
      const task = api<ShowEnvelope>(
        `/api/shows/${encodeURIComponent(showId)}/lease`,
        {
          method: "POST",
          body: JSON.stringify({
            clientId: idRef.current,
            takeover,
            epoch: latest.current?.show.epoch,
          }),
        },
      )
        .then((next) => {
          receive(next);
          if (mounted.current) setLeaseError("");
          return next;
        })
        .catch((e: unknown) => {
          if (mounted.current)
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
    [showId, receive],
  );
  const role = envelope?.role,
    ended = envelope?.show.phase === "ended";
  useEffect(() => {
    if (options.lease === false || role !== "director" || ended) return;
    let active = true;
    let timer: number;
    async function renew() {
      await claimLease();
      if (active) timer = window.setTimeout(renew, 4000);
    }
    void renew();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [role, ended, claimLease, options.lease]);
  return {
    envelope,
    error,
    setError,
    busy,
    run,
    receive,
    refresh,
    rendererId,
    serverOffset,
    leaseError,
    claimLease,
  };
}
