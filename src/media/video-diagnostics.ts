const decoderEvents = [
  "loadstart",
  "emptied",
  "loadedmetadata",
  "loadeddata",
  "canplay",
  "play",
  "playing",
  "pause",
  "waiting",
  "stalled",
  "ended",
  "error",
] as const;

const playErrors = new Set([
  "AbortError",
  "NotAllowedError",
  "NotSupportedError",
  "InvalidStateError",
  "NotReadableError",
  "SecurityError",
]);

/** Match the SDK's coarse family detection without retaining the user agent. */
export function decoderBrowserFamily():
  "Firefox" | "Chromium" | "Safari" | "unknown" {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent || "";
  if (/firefox|iceweasel|fxios/i.test(ua)) return "Firefox";
  if (/chrom|crios|crmo/i.test(ua)) return "Chromium";
  if (/safari|applewebkit/i.test(ua)) return "Safari";
  return "unknown";
}

/** Only fixed event/error names and counters; never track IDs, labels or URLs. */
export function observeDecoderEvents(video: HTMLVideoElement): () => void {
  const onEvent = (event: Event) => {
    video.dataset.portalDecoderEvent = event.type;
    video.dataset.portalDecoderEventAt = String(Date.now());
    const count = Number(video.dataset.portalDecoderEventCount || 0) + 1;
    video.dataset.portalDecoderEventCount = String(count);
    video.dataset.portalDecoderEvents = [
      ...(video.dataset.portalDecoderEvents?.split(",") ?? []),
      event.type,
    ]
      .slice(-8)
      .join(",");
  };
  decoderEvents.forEach((name) => video.addEventListener(name, onEvent));
  return () =>
    decoderEvents.forEach((name) => video.removeEventListener(name, onEvent));
}

/** Record the outcome of our explicit play request, including SDK-reset aborts. */
export async function playCanonicalVideo(
  video: HTMLVideoElement,
  reason: "initial" | "source-ready" | "user-resume" | "playback-unlock",
): Promise<boolean> {
  const count = Number(video.dataset.portalPlayCount || 0) + 1;
  video.dataset.portalPlayCount = String(count);
  video.dataset.portalPlayReason = reason;
  video.dataset.portalPlayAt = String(Date.now());
  video.dataset.portalPlayResult = "pending";
  video.dataset.portalPlayError = "none";
  try {
    await video.play();
    if (Number(video.dataset.portalPlayCount) === count) {
      video.dataset.portalPlayResult = "resolved";
      video.dataset.portalPlayAt = String(Date.now());
    }
    return true;
  } catch (error) {
    if (Number(video.dataset.portalPlayCount) === count) {
      const name = error instanceof Error ? error.name : "Error";
      video.dataset.portalPlayResult = "rejected";
      video.dataset.portalPlayError = playErrors.has(name) ? name : "Error";
      video.dataset.portalPlayAt = String(Date.now());
      video.dataset.portalPlayLastRejection = video.dataset.portalPlayError;
      video.dataset.portalPlayRejectedAt = String(Date.now());
      video.dataset.portalPlayRejectionCount = String(
        Number(video.dataset.portalPlayRejectionCount || 0) + 1,
      );
    }
    return false;
  }
}

export function decoderDiagnostics(video: HTMLVideoElement | null) {
  const stream = video?.srcObject;
  const tracks =
    stream && "getVideoTracks" in stream ? stream.getVideoTracks() : [];
  return {
    present: !!video,
    browser: decoderBrowserFamily(),
    visibility:
      typeof document === "undefined"
        ? "unavailable"
        : document.visibilityState,
    connectedToDOM: video?.isConnected ?? false,
    paused: video?.paused ?? null,
    readyState: video?.readyState ?? null,
    currentTime: video?.currentTime ?? null,
    width: video?.videoWidth ?? 0,
    height: video?.videoHeight ?? 0,
    muted: video?.muted ?? null,
    stream: !!stream,
    streamActive: stream && "active" in stream ? Boolean(stream.active) : null,
    tracks: tracks.map((track) => ({
      readyState: track.readyState,
      enabled: track.enabled,
      muted: track.muted,
    })),
    playCount: Number(video?.dataset.portalPlayCount || 0),
    playReason: video?.dataset.portalPlayReason ?? "none",
    playResult: video?.dataset.portalPlayResult ?? "none",
    playError: video?.dataset.portalPlayError ?? "none",
    playAt: Number(video?.dataset.portalPlayAt || 0),
    lastPlayRejection: video?.dataset.portalPlayLastRejection ?? "none",
    playRejectedAt: Number(video?.dataset.portalPlayRejectedAt || 0),
    playRejectionCount: Number(video?.dataset.portalPlayRejectionCount || 0),
    eventCount: Number(video?.dataset.portalDecoderEventCount || 0),
    lastEvent: video?.dataset.portalDecoderEvent ?? "none",
    eventAt: Number(video?.dataset.portalDecoderEventAt || 0),
    recentEvents: video?.dataset.portalDecoderEvents ?? "none",
  };
}
