const VISIBLE_FRAME_MS = 1000 / 30;
export const HIDDEN_FRAME_MS = 1000 / 8;

type FrameEnvironment = {
  hidden: () => boolean;
  now: () => number;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (id: number) => void;
  setTimer: (callback: () => void, delay: number) => number;
  clearTimer: (id: number) => void;
  listen: (callback: () => void) => () => void;
};

function browserEnvironment(): FrameEnvironment {
  return {
    hidden: () => document.hidden,
    now: () => performance.now(),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (id) => cancelAnimationFrame(id),
    setTimer: (callback, delay) => window.setTimeout(callback, delay),
    clearTimer: (id) => window.clearTimeout(id),
    listen: (callback) => {
      document.addEventListener("visibilitychange", callback);
      return () => document.removeEventListener("visibilitychange", callback);
    },
  };
}

/** A hidden browser may suspend both timers and frames; this is a bounded fallback. */
export function startStageFrameLoop(
  draw: (time: number) => void,
  environment: FrameEnvironment = browserEnvironment(),
) {
  let frame: number | null = null;
  let timer: number | null = null;
  let stopped = false;
  let generation = 0;
  let lastDraw = -Infinity;

  function cancelPending() {
    generation += 1;
    if (frame !== null) environment.cancelFrame(frame);
    if (timer !== null) environment.clearTimer(timer);
    frame = null;
    timer = null;
  }
  function schedule() {
    if (stopped) return;
    const scheduledGeneration = generation;
    if (environment.hidden())
      timer = environment.setTimer(() => {
        if (scheduledGeneration === generation) tick(environment.now());
      }, HIDDEN_FRAME_MS);
    else
      frame = environment.requestFrame((time) => {
        if (scheduledGeneration === generation) tick(time);
      });
  }
  function tick(time: number) {
    frame = null;
    timer = null;
    if (stopped) return;
    const interval = environment.hidden() ? HIDDEN_FRAME_MS : VISIBLE_FRAME_MS;
    if (time - lastDraw >= interval - 2) {
      lastDraw = time;
      draw(time);
    }
    schedule();
  }
  const unlisten = environment.listen(() => {
    cancelPending();
    lastDraw = -Infinity;
    tick(environment.now());
  });
  schedule();
  return () => {
    stopped = true;
    cancelPending();
    unlisten();
  };
}
