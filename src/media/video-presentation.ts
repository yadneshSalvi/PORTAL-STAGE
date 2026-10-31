import { decoderBrowserFamily } from "./video-diagnostics";

/** Explicit muted inline playback for independently owned video decoders. */
export function initializeMutedVideo(video: HTMLVideoElement) {
  // LiveKit deliberately omits Safari autoplay to avoid its low-power overlay.
  // Both canonical and presentation owners explicitly request muted playback.
  const autoplay = decoderBrowserFamily() !== "Safari";
  video.autoplay = autoplay;
  video.playsInline = true;
  video.defaultMuted = true;
  video.muted = true;
  video.controls = false;
  if (autoplay) video.setAttribute("autoplay", "");
  else video.removeAttribute("autoplay");
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
}

/**
 * A surface owns its presentation decoder, not the SDK/stage/vision decoder.
 * Both consume the same MediaStream; no track or stream is cloned or stopped.
 */
export function bindVideoPresentation(
  source: HTMLVideoElement,
  presentation: HTMLVideoElement,
): () => void {
  if (source === presentation)
    throw new Error("Video presentation must have its own element.");
  initializeMutedVideo(presentation);
  presentation.dataset.portalPresentation = "true";
  let active = true;
  const synchronize = () => {
    if (!active) return;
    const stream = source.srcObject;
    const changed = presentation.srcObject !== stream;
    if (changed) presentation.srcObject = stream;
    if (!stream) presentation.pause();
    else if (changed || presentation.paused)
      void presentation.play().catch(() => undefined);
  };
  const events = [
    "loadstart",
    "loadedmetadata",
    "loadeddata",
    "emptied",
    "playing",
  ] as const;
  events.forEach((event) => source.addEventListener(event, synchronize));
  synchronize();
  return () => {
    if (!active) return;
    active = false;
    events.forEach((event) => source.removeEventListener(event, synchronize));
    presentation.pause();
    presentation.srcObject = null;
  };
}
