import type { MediaIssue } from "./types";
import { mediaIssue } from "./safety";
import { ownCanonicalPlayback } from "./video-decoder";
import { initializeMutedVideo } from "./video-presentation";

export type LocalRehearsalCameraOptions = {
  showId: string;
  available: boolean;
  ended: boolean;
  consented: boolean;
};
export type LocalRehearsalCameraSnapshot = {
  preview: HTMLVideoElement | null;
  enabled: boolean;
  pending: boolean;
  error: MediaIssue | null;
  videoBlocked: boolean;
};

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Continue stopping the remaining owned tracks after a device disappears.
    }
  }
}

/** Native video capture for this browser only; it has no transport or token path. */
export class LocalRehearsalCameraController {
  private options: LocalRehearsalCameraOptions;
  private snapshot: LocalRehearsalCameraSnapshot = {
    preview: null,
    enabled: false,
    pending: false,
    error: null,
    videoBlocked: false,
  };
  private subscribers = new Set<() => void>();
  private mounted = false;
  private generation = 0;
  private stream: MediaStream | null = null;
  private playback: ReturnType<typeof ownCanonicalPlayback> | null = null;
  private request: Promise<void> | null = null;
  private trackCleanup: (() => void) | null = null;

  constructor(options: LocalRehearsalCameraOptions) {
    this.options = options;
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  };
  private patch(patch: Partial<LocalRehearsalCameraSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.subscribers.forEach((listener) => listener());
  }
  private eligible() {
    return (
      this.mounted &&
      this.options.available &&
      this.options.consented &&
      !this.options.ended
    );
  }
  private current(generation: number) {
    return generation === this.generation && this.eligible();
  }
  mount = () => {
    if (this.mounted) return;
    this.mounted = true;
    window.addEventListener("pagehide", this.disable);
  };
  updateOptions = (options: LocalRehearsalCameraOptions) => {
    const changedShow = options.showId !== this.options.showId;
    this.options = options;
    if (
      (changedShow || !this.eligible()) &&
      (this.stream || this.snapshot.pending || this.snapshot.enabled)
    )
      this.disable();
  };
  enable = (): Promise<void> => {
    if (!this.eligible()) {
      this.patch({
        error: {
          code: "authorization",
          device: "camera",
          recoverable: true,
          message: this.options.ended
            ? "This rehearsal has ended. Open a new rehearsal before enabling a camera."
            : !this.options.available
              ? "Local camera practice is available in the illustrated rehearsal."
              : "Confirm the local camera consent before enabling your camera.",
        },
      });
      return Promise.resolve();
    }
    if (this.stream) return Promise.resolve();
    if (this.snapshot.pending) return this.request ?? Promise.resolve();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.patch({
        error: {
          code: !window.isSecureContext ? "insecure-context" : "unsupported",
          device: "camera",
          recoverable: false,
          message: !window.isSecureContext
            ? "The local camera needs HTTPS or localhost."
            : "This browser cannot open a local camera. Offer and Accept buttons remain available.",
        },
      });
      return Promise.resolve();
    }
    const generation = ++this.generation;
    this.patch({ pending: true, error: null });
    const task = this.capture(generation).finally(() => {
      if (this.request === task) this.request = null;
      if (generation === this.generation && this.snapshot.pending)
        this.patch({ pending: false });
    });
    this.request = task;
    return task;
  };
  private async capture(generation: number) {
    let granted: MediaStream | null = null;
    try {
      granted = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: "user",
        },
      });
      if (!this.current(generation)) {
        stopStream(granted);
        return;
      }
      const videoTrack = granted
        .getVideoTracks()
        .find((track) => track.readyState === "live");
      if (!videoTrack) {
        stopStream(granted);
        this.patch({
          error: {
            code: "device-missing",
            device: "camera",
            recoverable: true,
            message:
              "The camera did not provide a live video track. Try another camera or use the buttons.",
          },
        });
        return;
      }
      // A conforming capture has no audio. Do not retain unexpected microphone tracks.
      for (const track of granted.getAudioTracks()) {
        track.stop();
        granted.removeTrack(track);
      }
      const stream = granted;
      const video = document.createElement("video");
      initializeMutedVideo(video);
      video.dataset.portalDecoder = "true";
      video.dataset.portalLocalCamera = "true";
      this.stream = stream;
      video.srcObject = stream;
      const playback = ownCanonicalPlayback(
        video,
        () => this.stream === stream && this.current(generation),
        (videoBlocked) => this.patch({ videoBlocked }),
      );
      this.playback = playback;
      const ended = () => {
        if (this.stream !== stream) return;
        this.disable();
        this.patch({
          error: {
            code: "device-ended",
            device: "camera",
            recoverable: true,
            message:
              "The local camera stopped. Enable it again or continue with the buttons.",
          },
        });
      };
      videoTrack.addEventListener("ended", ended);
      this.trackCleanup = () => videoTrack.removeEventListener("ended", ended);
      this.patch({
        preview: video,
        enabled: true,
        pending: false,
        error: null,
        videoBlocked: false,
      });
      void playback.start();
    } catch (error) {
      if (granted && granted !== this.stream) stopStream(granted);
      if (!this.current(generation)) return;
      this.disable();
      this.patch({ error: mediaIssue(error, "camera") });
    }
  }
  disable = () => {
    ++this.generation;
    this.request = null;
    const stream = this.stream;
    const video = this.snapshot.preview;
    this.stream = null;
    this.playback?.dispose();
    this.playback = null;
    this.trackCleanup?.();
    this.trackCleanup = null;
    if (stream) stopStream(stream);
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    this.patch({
      preview: null,
      enabled: false,
      pending: false,
      error: null,
      videoBlocked: false,
    });
  };
  resume = (): Promise<boolean> =>
    this.eligible() && this.playback
      ? this.playback.resume()
      : Promise.resolve(false);
  destroy = () => {
    this.mounted = false;
    window.removeEventListener("pagehide", this.disable);
    this.disable();
  };
}
