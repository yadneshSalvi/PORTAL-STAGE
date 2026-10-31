import { observeDecoderEvents, playCanonicalVideo } from "./video-diagnostics";

type PlayReason = Parameters<typeof playCanonicalVideo>[1];

/**
 * LocalTrack construction/restart can asynchronously empty and restore srcObject
 * after attach() has already called play(). Own replay after that source reset;
 * do not rely on an unrelated presentation element to wake this decoder.
 */
export function ownCanonicalPlayback(
  video: HTMLVideoElement,
  isCurrent: () => boolean,
  onBlocked: (blocked: boolean) => void,
) {
  let active = true;
  let lastStream = video.srcObject;
  let attempts = 0;
  let flight: Promise<boolean> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  const stopObserving = observeDecoderEvents(video);
  const current = () => active && isCurrent();
  const hasSource = () => {
    const stream = video.srcObject;
    return !!(
      stream &&
      "getVideoTracks" in stream &&
      stream.getVideoTracks().some((track) => track.readyState === "live")
    );
  };
  const updateSource = () => {
    if (video.srcObject && video.srcObject !== lastStream) {
      lastStream = video.srcObject;
      attempts = 0;
    }
  };
  const schedule = () => {
    if (!current()) return;
    updateSource();
    if (flight || retry || attempts >= 3 || !hasSource() || !video.paused)
      return;
    // Coalesce metadata/pause events and allow the SDK's async reattach to settle.
    retry = setTimeout(
      () => {
        retry = null;
        if (current() && hasSource() && video.paused)
          void request("source-ready");
      },
      attempts === 0 ? 0 : 100,
    );
  };
  const request = (reason: PlayReason): Promise<boolean> => {
    if (!current() || !hasSource()) return Promise.resolve(false);
    if (flight) return flight;
    updateSource();
    if (reason === "user-resume" || reason === "playback-unlock") attempts = 0;
    if (attempts >= 3) return Promise.resolve(false);
    ++attempts;
    const source = video.srcObject;
    const task = playCanonicalVideo(video, reason);
    flight = task;
    void task.then((played) => {
      if (flight === task) flight = null;
      if (!current()) return;
      // A different source may have replaced a successfully played stream.
      if (played && video.srcObject === source && !video.paused)
        onBlocked(false);
      else if (video.dataset.portalPlayError === "NotAllowedError") {
        onBlocked(true);
        // A policy rejection needs an explicit user action, not a retry loop.
        if (video.srcObject === source) attempts = 3;
      } else if (!played && video.srcObject === source && attempts >= 3)
        onBlocked(true);
      schedule();
    });
    return task;
  };
  const onReady = () => schedule();
  const onVisibility = () => {
    if (document.visibilityState === "visible") schedule();
  };
  const events = [
    "loadstart",
    "loadedmetadata",
    "loadeddata",
    "canplay",
    "pause",
  ] as const;
  events.forEach((event) => video.addEventListener(event, onReady));
  document.addEventListener("visibilitychange", onVisibility);
  return {
    start: () => request("initial"),
    resume: () => request("playback-unlock"),
    dispose: () => {
      active = false;
      if (retry) clearTimeout(retry);
      retry = null;
      events.forEach((event) => video.removeEventListener(event, onReady));
      document.removeEventListener("visibilitychange", onVisibility);
      stopObserving();
    },
  };
}
