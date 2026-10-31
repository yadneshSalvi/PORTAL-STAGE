import type { ShowAction } from "@/lib/contracts";

export type PresenceAction = Extract<ShowAction, { type: "presence" }>;
type Pending<T> = {
  action: PresenceAction;
  resolve: Array<(value: T | null) => void>;
};
type SlotLane<T> = {
  running: boolean;
  latest: Pending<T> | null;
  off: Pending<T> | null;
};

/** Presence has its own HTTP lane: one flight, one latest ON, and an OFF barrier per slot. */
export class PresenceLane<T> {
  private lanes = new Map<string, SlotLane<T>>();
  constructor(private send: (action: PresenceAction) => Promise<T | null>) {}

  submit(action: PresenceAction): Promise<T | null> {
    const key = action.slot || "self";
    let lane = this.lanes.get(key);
    if (!lane) {
      lane = { running: false, latest: null, off: null };
      this.lanes.set(key, lane);
    }
    const current = lane;
    return new Promise((resolve) => {
      if (!action.connected) {
        const waiters = [
          ...(current.off?.resolve || []),
          ...(current.latest?.resolve || []),
          resolve,
        ];
        current.off = {
          action: { ...action, camera: false, microphone: false },
          resolve: waiters,
        };
        current.latest = null;
      } else {
        current.latest = {
          action,
          resolve: [...(current.latest?.resolve || []), resolve],
        };
      }
      this.drain(current);
    });
  }

  clearPending() {
    for (const lane of this.lanes.values()) {
      for (const pending of [lane.off, lane.latest])
        pending?.resolve.forEach((resolve) => resolve(null));
      lane.off = null;
      lane.latest = null;
    }
  }

  private drain(lane: SlotLane<T>) {
    if (lane.running) return;
    const pending = lane.off || lane.latest;
    if (!pending) return;
    if (lane.off) lane.off = null;
    else lane.latest = null;
    lane.running = true;
    void Promise.resolve()
      .then(() => this.send(pending.action))
      .catch(() => null)
      .then((value) => {
        pending.resolve.forEach((resolve) => resolve(value));
      })
      .finally(() => {
        lane.running = false;
        this.drain(lane);
      });
  }
}
