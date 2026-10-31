import type { MediaPresence } from "./types";

export const PRESENCE_HEARTBEAT_MS = 8000;
const OFF: MediaPresence = {
  connected: false,
  camera: false,
  microphone: false,
};
const same = (a: MediaPresence | null, b: MediaPresence) =>
  !!a &&
  a.connected === b.connected &&
  a.camera === b.camera &&
  a.microphone === b.microphone;

/** One callback in flight, one latest sample, and a disconnect barrier; never a FIFO. */
export class PresenceReporter {
  private latest: MediaPresence | null = null;
  private lastSent: MediaPresence | null = null;
  private lastSentAt = -Infinity;
  private inFlight = false;
  private disconnectRequired = false;

  constructor(
    private callback: (sample: MediaPresence) => void | Promise<unknown>,
    private now: () => number,
    private onError: () => void,
  ) {}

  report(sample: MediaPresence) {
    this.latest = { ...sample };
    // A quick reconnect must not erase the off signal that resets server admission.
    // This is one bit, not another queued callback or a retained stale true sample.
    if (!sample.connected && this.lastSent?.connected)
      this.disconnectRequired = true;
    this.drain();
  }

  private drain() {
    if (this.inFlight || !this.latest) return;
    const sample = this.disconnectRequired ? OFF : this.latest;
    if (
      !this.disconnectRequired &&
      same(this.lastSent, sample) &&
      this.now() - this.lastSentAt < PRESENCE_HEARTBEAT_MS
    ) {
      this.latest = null;
      return;
    }
    if (!this.disconnectRequired || !this.latest.connected) this.latest = null;
    this.disconnectRequired = false;
    this.lastSent = { ...sample };
    this.lastSentAt = this.now();
    this.inFlight = true;
    void Promise.resolve()
      .then(() => this.callback({ ...sample }))
      .catch(this.onError)
      .finally(() => {
        this.inFlight = false;
        this.drain();
      });
  }
}
