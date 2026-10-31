import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LocalRehearsalCameraController,
  type LocalRehearsalCameraOptions,
} from "../src/media/local-rehearsal-camera";
import { bindVideoPresentation } from "../src/media/video-presentation";

const sdkLoads = vi.hoisted(() => vi.fn());
vi.mock("livekit-client", () => {
  sdkLoads();
  throw new Error(
    "The native local-camera path must not load the transport SDK.",
  );
});

class Track extends EventTarget {
  readyState = "live";
  enabled = true;
  constructor(readonly kind = "video") {
    super();
  }
  stop = vi.fn(() => {
    this.readyState = "ended";
    this.enabled = false;
  });
}
class Stream {
  constructor(private tracks: Track[] = [new Track()]) {}
  getTracks = () => this.tracks;
  getVideoTracks = () => this.tracks.filter((track) => track.kind === "video");
  getAudioTracks = () => this.tracks.filter((track) => track.kind === "audio");
  removeTrack = (track: Track) => {
    this.tracks = this.tracks.filter((value) => value !== track);
  };
  media() {
    return this as unknown as MediaStream;
  }
}
class Video extends EventTarget {
  srcObject: MediaStream | null = null;
  autoplay = false;
  playsInline = false;
  defaultMuted = false;
  muted = false;
  controls = true;
  paused = true;
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  setAttribute = (name: string, value: string) =>
    this.attributes.set(name, value);
  removeAttribute = (name: string) => this.attributes.delete(name);
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  element() {
    return this as unknown as HTMLVideoElement;
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush() {
  for (let i = 0; i < 12; ++i) await Promise.resolve();
}
const initial = (): LocalRehearsalCameraOptions => ({
  showId: "ps_local_camera",
  available: true,
  ended: false,
  consented: true,
});
const instances: LocalRehearsalCameraController[] = [];
const streams: Stream[] = [];
let windowSurface: EventTarget & { isSecureContext: boolean };
let documentSurface: EventTarget & {
  visibilityState: string;
  createElement: ReturnType<typeof vi.fn>;
  body: { appendChild: ReturnType<typeof vi.fn> };
};
const capture = vi.fn(
  async (_constraints: MediaStreamConstraints): Promise<MediaStream> => {
    const stream = new Stream();
    streams.push(stream);
    return stream.media();
  },
);
const network = vi.fn();
const peers = vi.fn();
function camera(options: LocalRehearsalCameraOptions = initial()) {
  const controller = new LocalRehearsalCameraController(options);
  instances.push(controller);
  controller.mount();
  return controller;
}
const exits = [
  "disable",
  "end",
  "withdraw",
  "unavailable",
  "new-show",
  "unmount",
  "pagehide",
] as const;
function leave(
  kind: (typeof exits)[number],
  controller: LocalRehearsalCameraController,
) {
  if (kind === "disable") controller.disable();
  else if (kind === "unmount") controller.destroy();
  else if (kind === "pagehide")
    windowSurface.dispatchEvent(new Event("pagehide"));
  else
    controller.updateOptions({
      ...initial(),
      ...(kind === "end"
        ? { ended: true }
        : kind === "withdraw"
          ? { consented: false }
          : kind === "unavailable"
            ? { available: false }
            : { showId: "ps_other_rehearsal" }),
    });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  streams.length = 0;
  windowSurface = Object.assign(new EventTarget(), { isSecureContext: true });
  documentSurface = Object.assign(new EventTarget(), {
    visibilityState: "visible",
    createElement: vi.fn(() => new Video()),
    body: { appendChild: vi.fn() },
  });
  vi.stubGlobal("window", windowSurface);
  vi.stubGlobal("document", documentSurface);
  vi.stubGlobal("navigator", {
    userAgent: "Chromium",
    mediaDevices: { getUserMedia: capture },
  });
  vi.stubGlobal("fetch", network);
  vi.stubGlobal("RTCPeerConnection", peers);
});
afterEach(async () => {
  instances.splice(0).forEach((controller) => controller.destroy());
  await flush();
  expect(network).not.toHaveBeenCalled();
  expect(peers).not.toHaveBeenCalled();
  expect(sdkLoads).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("native local rehearsal camera", () => {
  it("does not acquire a device, load the transport SDK, request an API or create a peer merely by mounting", () => {
    const controller = camera();
    expect(controller.getSnapshot()).toMatchObject({
      enabled: false,
      pending: false,
      preview: null,
    });
    expect(capture).not.toHaveBeenCalled();
    expect(documentSurface.createElement).not.toHaveBeenCalled();
  });

  it.each([{ consented: false }, { available: false }, { ended: true }])(
    "requires an available unfinished rehearsal and explicit local consent: %o",
    async (change) => {
      const controller = camera({ ...initial(), ...change });
      await controller.enable();
      expect(capture).not.toHaveBeenCalled();
      expect(controller.getSnapshot()).toMatchObject({
        enabled: false,
        pending: false,
        error: { code: "authorization" },
      });
    },
  );

  it("requires a secure capture API without asking for a microphone or WebRTC support", async () => {
    windowSurface.isSecureContext = false;
    const controller = camera();
    await controller.enable();
    expect(controller.getSnapshot().error?.code).toBe("insecure-context");
    expect(capture).not.toHaveBeenCalled();
    windowSurface.isSecureContext = true;
    vi.stubGlobal("navigator", {});
    await controller.enable();
    expect(controller.getSnapshot().error?.code).toBe("unsupported");
  });

  it("captures video only into an off-DOM canonical decoder and keeps presentation cleanup independent", async () => {
    const controller = camera();
    await controller.enable();
    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({ audio: false, video: expect.any(Object) }),
    );
    const preview = controller.getSnapshot().preview!;
    expect(preview).toMatchObject({
      muted: true,
      defaultMuted: true,
      playsInline: true,
      controls: false,
      srcObject: streams[0],
    });
    expect(preview.play).toHaveBeenCalled();
    expect(documentSurface.body.appendChild).not.toHaveBeenCalled();
    const presentation = new Video();
    const cleanup = bindVideoPresentation(preview, presentation.element());
    cleanup();
    expect(preview.paused).toBe(false);
    expect(preview.srcObject).toBe(streams[0]);
    expect(streams[0].getVideoTracks()[0].stop).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({
      enabled: true,
      pending: false,
    });
  });

  it("coalesces duplicate enables while permission is pending", async () => {
    const gate = deferred<MediaStream>();
    capture.mockReturnValueOnce(gate.promise);
    const controller = camera();
    const first = controller.enable();
    expect(controller.getSnapshot().pending).toBe(true);
    const duplicate = controller.enable();
    expect(duplicate).toBe(first);
    expect(capture).toHaveBeenCalledOnce();
    const stream = new Stream();
    gate.resolve(stream.media());
    await Promise.all([first, duplicate]);
    expect(controller.getSnapshot()).toMatchObject({
      pending: false,
      enabled: true,
    });
  });

  it.each(exits)(
    "fences a pending permission grant on %s before attaching any stream",
    async (kind) => {
      const gate = deferred<MediaStream>();
      capture.mockReturnValueOnce(gate.promise);
      const controller = camera();
      const enabling = controller.enable();
      leave(kind, controller);
      expect(controller.getSnapshot()).toMatchObject({
        pending: false,
        enabled: false,
        preview: null,
      });
      const stream = new Stream();
      const track = stream.getVideoTracks()[0];
      gate.resolve(stream.media());
      await enabling;
      expect(track.stop).toHaveBeenCalledOnce();
      expect(documentSurface.createElement).not.toHaveBeenCalled();
      expect(controller.getSnapshot()).toMatchObject({
        pending: false,
        enabled: false,
        preview: null,
      });
      if (
        kind === "end" ||
        kind === "withdraw" ||
        kind === "unavailable" ||
        kind === "unmount"
      ) {
        await controller.enable();
        expect(capture).toHaveBeenCalledOnce();
      }
    },
  );

  it.each(exits)(
    "stops active capture synchronously on %s and cancels decoder retries",
    async (kind) => {
      const controller = camera();
      await controller.enable();
      const preview = controller.getSnapshot().preview!;
      const track = streams[0].getVideoTracks()[0];
      preview.pause();
      preview.dispatchEvent(new Event("loadedmetadata"));
      const plays = vi.mocked(preview.play).mock.calls.length;
      leave(kind, controller);
      expect(track.stop).toHaveBeenCalledOnce();
      expect(preview.srcObject).toBeNull();
      expect(controller.getSnapshot()).toMatchObject({
        pending: false,
        enabled: false,
        preview: null,
      });
      await vi.advanceTimersByTimeAsync(500);
      preview.dispatchEvent(new Event("loadedmetadata"));
      expect(preview.play).toHaveBeenCalledTimes(plays);
    },
  );

  it.each(["old-first", "new-first"])(
    "cannot let a cancelled request overwrite a newer request: %s",
    async (order) => {
      const old = deferred<MediaStream>();
      const next = deferred<MediaStream>();
      capture
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(next.promise);
      const controller = camera();
      const first = controller.enable();
      controller.disable();
      const second = controller.enable();
      const oldStream = new Stream();
      const nextStream = new Stream();
      if (order === "old-first") {
        old.resolve(oldStream.media());
        await first;
        expect(controller.getSnapshot().pending).toBe(true);
        next.resolve(nextStream.media());
      } else {
        next.resolve(nextStream.media());
        await second;
        old.resolve(oldStream.media());
      }
      await Promise.all([first, second]);
      expect(oldStream.getVideoTracks()[0].stop).toHaveBeenCalledOnce();
      expect(nextStream.getVideoTracks()[0].stop).not.toHaveBeenCalled();
      expect(controller.getSnapshot()).toMatchObject({
        pending: false,
        enabled: true,
        preview: { srcObject: nextStream },
      });
    },
  );

  it("ignores a cancelled request’s later denial while a newer camera is active", async () => {
    const old = deferred<MediaStream>();
    capture.mockReturnValueOnce(old.promise);
    const controller = camera();
    const first = controller.enable();
    controller.disable();
    await controller.enable();
    const preview = controller.getSnapshot().preview;
    old.reject(new DOMException("private native details", "NotAllowedError"));
    await first;
    expect(controller.getSnapshot()).toMatchObject({
      enabled: true,
      preview,
      error: null,
    });
  });

  it("reports sanitized permission failure and allows a new explicit attempt", async () => {
    capture.mockRejectedValueOnce(
      new DOMException("private native details", "NotAllowedError"),
    );
    const controller = camera();
    await controller.enable();
    expect(controller.getSnapshot()).toMatchObject({
      enabled: false,
      pending: false,
      error: { code: "permission-denied" },
    });
    expect(JSON.stringify(controller.getSnapshot().error)).not.toContain(
      "private native details",
    );
    await controller.enable();
    expect(capture).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toMatchObject({
      enabled: true,
      error: null,
    });
  });

  it("exposes playback refusal separately and resumes only an existing decoder", async () => {
    documentSurface.createElement.mockImplementationOnce(() => {
      const video = new Video();
      video.play.mockRejectedValueOnce(
        new DOMException("blocked", "NotAllowedError"),
      );
      return video;
    });
    const controller = camera();
    await controller.enable();
    await flush();
    expect(controller.getSnapshot().videoBlocked).toBe(true);
    expect(await controller.resume()).toBe(true);
    expect(controller.getSnapshot().videoBlocked).toBe(false);
    expect(capture).toHaveBeenCalledOnce();
    controller.disable();
    expect(await controller.resume()).toBe(false);
    expect(capture).toHaveBeenCalledOnce();
  });

  it("keeps local capture through ordinary hidden visibility and stops on pagehide", async () => {
    const controller = camera();
    await controller.enable();
    documentSurface.visibilityState = "hidden";
    documentSurface.dispatchEvent(new Event("visibilitychange"));
    expect(controller.getSnapshot().enabled).toBe(true);
    expect(streams[0].getVideoTracks()[0].stop).not.toHaveBeenCalled();
    windowSurface.dispatchEvent(new Event("pagehide"));
    expect(streams[0].getVideoTracks()[0].stop).toHaveBeenCalledOnce();
  });

  it("stops unexpected audio tracks and never retains a microphone in the preview", async () => {
    const video = new Track();
    const audio = new Track("audio");
    const stream = new Stream([video, audio]);
    capture.mockResolvedValueOnce(stream.media());
    const controller = camera();
    await controller.enable();
    expect(audio.stop).toHaveBeenCalledOnce();
    expect(stream.getAudioTracks()).toEqual([]);
    expect(video.stop).not.toHaveBeenCalled();
  });

  it("removes an ended camera without silently acquiring another device", async () => {
    const controller = camera();
    await controller.enable();
    streams[0].getVideoTracks()[0].dispatchEvent(new Event("ended"));
    expect(controller.getSnapshot()).toMatchObject({
      enabled: false,
      preview: null,
      error: { code: "device-ended" },
    });
    expect(capture).toHaveBeenCalledOnce();
  });

  it("does not resurrect preview or pending state when playback settles after end", async () => {
    const play = deferred<void>();
    documentSurface.createElement.mockImplementationOnce(() => {
      const video = new Video();
      video.play.mockImplementationOnce(() => play.promise);
      return video;
    });
    const controller = camera();
    await controller.enable();
    controller.updateOptions({ ...initial(), ended: true });
    play.resolve();
    await flush();
    expect(controller.getSnapshot()).toMatchObject({
      enabled: false,
      preview: null,
      pending: false,
      videoBlocked: false,
    });
  });
  it("honors synchronous cancellation from a preview subscriber without playing an obsolete decoder", async () => {
    const controller = camera();
    controller.subscribe(() => {
      if (controller.getSnapshot().enabled) controller.disable();
    });
    await controller.enable();
    const preview = documentSurface.createElement.mock.results[0]
      .value as Video;
    expect(streams[0].getVideoTracks()[0].stop).toHaveBeenCalledOnce();
    expect(preview.play).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({
      enabled: false,
      pending: false,
      preview: null,
    });
  });
});
