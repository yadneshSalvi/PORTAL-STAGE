import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalVideoTrack } from "livekit-client";
import { ownCanonicalPlayback } from "../src/media/video-decoder";
import { initializeMutedVideo } from "../src/media/video-presentation";
import {
  decoderDiagnostics,
  playCanonicalVideo,
} from "../src/media/video-diagnostics";

class CaptureTrack extends EventTarget {
  kind = "video";
  id = "test-capture";
  enabled = true;
  muted = false;
  readyState: MediaStreamTrackState = "live";
  getConstraints = () => ({});
  getSettings = () => ({ width: 1280, height: 720, frameRate: 30 });
  stop = vi.fn(() => {
    this.readyState = "ended";
  });
}
class Stream {
  active = true;
  constructor(private tracks: CaptureTrack[] = []) {}
  getTracks = () => [...this.tracks];
  getVideoTracks = () => this.tracks.filter((track) => track.kind === "video");
  getAudioTracks = () => [];
  addTrack = (track: CaptureTrack) => this.tracks.push(track);
  removeTrack = (track: CaptureTrack) => {
    this.tracks = this.tracks.filter((item) => item !== track);
  };
}

/** Model off-DOM source reset: autoplay does not replace an explicit play(). */
class Decoder extends EventTarget {
  private stream: unknown = null;
  assignments: unknown[] = [];
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  autoplay = false;
  playsInline = false;
  defaultMuted = false;
  muted = false;
  controls = true;
  paused = true;
  readyState = 0;
  currentTime = 0;
  videoWidth = 0;
  videoHeight = 0;
  isConnected = false;
  get srcObject() {
    return this.stream;
  }
  set srcObject(value: unknown) {
    this.stream = value;
    this.assignments.push(value);
    this.paused = true;
    this.readyState = value ? 2 : 0;
    this.videoWidth = value ? 1280 : 0;
    this.videoHeight = value ? 720 : 0;
    queueMicrotask(() => {
      this.dispatchEvent(new Event(value ? "loadedmetadata" : "emptied"));
    });
  }
  setAttribute = (name: string, value: string) =>
    this.attributes.set(name, value);
  removeAttribute = (name: string) => this.attributes.delete(name);
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  });
  element() {
    return this as unknown as HTMLVideoElement;
  }
}
const cleanups: Array<() => void> = [];
const sdkTracks: LocalVideoTrack[] = [];

async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
function camera() {
  const source = new CaptureTrack();
  const track = new LocalVideoTrack(source as unknown as MediaStreamTrack);
  sdkTracks.push(track);
  return { source, track };
}
function managed(decoder = new Decoder(), current = () => true) {
  initializeMutedVideo(decoder.element());
  const blocked = vi.fn();
  const playback = ownCanonicalPlayback(decoder.element(), current, blocked);
  cleanups.push(playback.dispose);
  return { decoder, blocked, playback };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(new Date("2026-10-31T14:00:00Z"));
  vi.stubGlobal("navigator", {
    userAgent: "Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36",
  });
  const document = new EventTarget();
  Object.assign(document, { visibilityState: "visible" });
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.stubGlobal("HTMLVideoElement", Decoder);
  vi.stubGlobal("HTMLAudioElement", class {});
  vi.stubGlobal("MediaStream", Stream);
});
afterEach(async () => {
  cleanups.splice(0).forEach((dispose) => dispose());
  sdkTracks.splice(0).forEach((track) => {
    track.detach();
    track.stop();
  });
  await settle();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("canonical local decoder lifecycle with installed LiveKit", () => {
  it("demonstrates that real LocalVideoTrack construction clears and restores the stream after attach has played it", async () => {
    const { track } = camera();
    const decoder = new Decoder();
    initializeMutedVideo(decoder.element());
    track.attach(decoder.element());
    expect(decoder.play).toHaveBeenCalledTimes(1);
    expect(decoder.paused).toBe(false);
    const initiallyAttached = decoder.srcObject;
    await settle();
    expect(decoder.assignments).toHaveLength(3);
    expect(decoder.assignments[1]).toBeNull();
    expect(decoder.assignments[2]).not.toBe(initiallyAttached);
    expect(decoder.play).toHaveBeenCalledTimes(1);
    expect(decoder.paused).toBe(true);
    expect(decoder.isConnected).toBe(false);
  });

  it("replays the canonical decoder after that SDK reset without mounting a preview", async () => {
    const { track } = camera();
    const { decoder, playback, blocked } = managed();
    track.attach(decoder.element());
    void playback.start();
    await settle();
    await vi.advanceTimersByTimeAsync(150);
    expect(decoder.assignments).toHaveLength(3);
    expect(decoder.paused).toBe(false);
    expect(decoder.isConnected).toBe(false);
    expect(decoderDiagnostics(decoder.element())).toMatchObject({
      playResult: "resolved",
      playReason: "source-ready",
      browser: "Chromium",
      tracks: [{ enabled: true, readyState: "live" }],
    });
    expect(blocked).toHaveBeenLastCalledWith(false);
  });

  it("does not auto-loop policy rejections and permits an explicit playback unlock", async () => {
    const { decoder, playback, blocked } = managed();
    decoder.srcObject = new Stream([new CaptureTrack()]);
    decoder.play.mockRejectedValueOnce(
      new DOMException("secret message", "NotAllowedError"),
    );
    await playback.start();
    await settle();
    for (let i = 0; i < 20; i++) decoder.dispatchEvent(new Event("loadeddata"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(decoder.play).toHaveBeenCalledTimes(1);
    expect(blocked).toHaveBeenLastCalledWith(true);
    expect(decoderDiagnostics(decoder.element()).playError).toBe(
      "NotAllowedError",
    );
    await playback.resume();
    expect(decoder.play).toHaveBeenCalledTimes(2);
    expect(decoder.paused).toBe(false);
    expect(blocked).toHaveBeenLastCalledWith(false);
  });

  it("bounds aborted playback retries on one source and coalesces readiness events", async () => {
    const { decoder, playback } = managed();
    decoder.srcObject = new Stream([new CaptureTrack()]);
    decoder.play.mockRejectedValue(
      new DOMException("stream reset", "AbortError"),
    );
    await playback.start();
    await settle();
    for (let i = 0; i < 30; i++)
      decoder.dispatchEvent(new Event("loadedmetadata"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(decoder.play).toHaveBeenCalledTimes(3);
  });

  it("cannot resume a stopped or replaced camera after a queued reset or late play completion", async () => {
    let current = true;
    const { decoder, playback, blocked } = managed(
      new Decoder(),
      () => current,
    );
    decoder.srcObject = new Stream([new CaptureTrack()]);
    let reject!: (error: unknown) => void;
    decoder.play.mockImplementationOnce(
      () =>
        new Promise((_resolve, failure) => {
          reject = failure;
        }),
    );
    void playback.start();
    await settle();
    current = false;
    playback.dispose();
    decoder.pause();
    reject(new DOMException("late", "AbortError"));
    decoder.srcObject = new Stream([new CaptureTrack()]);
    await settle();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(decoder.play).toHaveBeenCalledTimes(1);
    expect(blocked).not.toHaveBeenCalled();
    expect(decoder.paused).toBe(true);
  });

  it("keeps Safari autoplay absent while explicitly playing the muted decoder", async () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15",
    });
    const { decoder, playback } = managed();
    decoder.srcObject = new Stream([new CaptureTrack()]);
    expect(decoder.autoplay).toBe(false);
    expect(decoder.attributes.has("autoplay")).toBe(false);
    expect(decoder.muted).toBe(true);
    expect(decoder.playsInline).toBe(true);
    await playback.start();
    expect(decoder.paused).toBe(false);
    expect(decoderDiagnostics(decoder.element()).browser).toBe("Safari");
  });

  it("diagnostics contain fixed names/state only and a bounded event trail", async () => {
    const { decoder } = managed();
    decoder.srcObject = new Stream([new CaptureTrack()]);
    decoder.play.mockRejectedValueOnce(
      Object.assign(new Error("private URL/token"), { name: "private-name" }),
    );
    await playCanonicalVideo(decoder.element(), "user-resume");
    for (let i = 0; i < 100; i++) decoder.dispatchEvent(new Event("waiting"));
    const snapshot = decoderDiagnostics(decoder.element());
    expect(snapshot.playError).toBe("Error");
    expect(snapshot.eventCount).toBeGreaterThanOrEqual(100);
    expect(snapshot.recentEvents.split(",")).toHaveLength(8);
    expect(JSON.stringify(snapshot)).not.toContain("private");
    expect(JSON.stringify(snapshot)).not.toContain("test-capture");
    expect(snapshot.visibility).toBe("visible");
  });
});
