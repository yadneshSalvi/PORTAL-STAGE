import { ApiError } from "./client";
/** Bounded, single-flight intake. One transient retry preserves the original event IDs. */
export class TwitchEventBatcher<T> {
  private pending: T[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flight = false;
  private stopped = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryWake: ((continueSending: boolean) => void) | null = null;
  constructor(
    private send: (items: T[]) => Promise<unknown>,
    private failed: (error: unknown) => void,
    private flushed: () => void,
  ) {}
  push(value: T) {
    if (this.stopped) return false;
    if (this.pending.length >= 200) {
      this.failed(
        new Error(
          "Audience intake is full. Some new commands were not forwarded; the current tally contains only received choices.",
        ),
      );
      return false;
    }
    this.pending.push(value);
    this.schedule(this.pending.length >= 20 ? 0 : 250);
    return true;
  }
  private schedule(delay: number) {
    if (this.timer || this.flight || this.stopped) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }
  private async flush() {
    if (this.stopped || this.flight || !this.pending.length) return;
    this.flight = true;
    const batch = this.pending.splice(0, 20);
    try {
      for (let attempt = 0; attempt < 2 && !this.stopped; attempt++) {
        try {
          await this.send(batch);
          if (!this.stopped) this.flushed();
          break;
        } catch (error) {
          if (this.stopped) break;
          const transient =
            error instanceof ApiError &&
            (error.status === 0 || error.status >= 500);
          if (attempt === 0 && transient) {
            const retry = await new Promise<boolean>((resolve) => {
              this.retryWake = resolve;
              this.retryTimer = setTimeout(() => {
                this.retryTimer = null;
                this.retryWake = null;
                resolve(true);
              }, 250);
            });
            if (retry) continue;
            break;
          }
          this.failed(error);
          this.flushed();
          break;
        }
      }
    } finally {
      this.flight = false;
      if (this.pending.length) this.schedule(0);
    }
  }
  stop() {
    this.stopped = true;
    this.pending = [];
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retryWake?.(false);
    this.retryWake = null;
  }
}
