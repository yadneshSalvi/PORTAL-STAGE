import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShowState } from "../src/lib/contracts";
import { MediaRoomController } from "../src/media/room-controller";
import type { MediaRuntime } from "../src/media/room-controller";
import type { MediaRoomOptions } from "../src/media/types";
import type { ProgramAudioMixer } from "../src/media/audio-mix";
import {
  ANCHOR_LIMITS,
  ANCHOR_TOPIC,
  decodeAnchor,
  encodeAnchor,
} from "../src/media/anchor-protocol";

class Events {
  listeners = new Map<string, Array<(...args: any[]) => void>>();
  on(name: string, callback: (...args: any[]) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), callback]);
    return this;
  }
  once(name: string, callback: (...args: any[]) => void) {
    return this.on(name, callback);
  }
  emit(name: string, ...args: any[]) {
    this.listeners.get(name)?.forEach((callback) => callback(...args));
  }
  removeAllListeners() {
    this.listeners.clear();
  }
}
class TestMediaTrack {
  readyState = "live";
  enabled = true;
  contentHint = "";
  constructor(readonly kind = "video") {}
  stop = vi.fn(() => {
    this.readyState = "ended";
    this.enabled = false;
  });
  clone = vi.fn(() => new TestMediaTrack(this.kind));
}
class TestStream {
  constructor(private tracks: TestMediaTrack[] = []) {}
  getTracks = () => this.tracks;
  getVideoTracks = () => this.tracks.filter((track) => track.kind === "video");
  getAudioTracks = () => this.tracks.filter((track) => track.kind === "audio");
}
class TestElement extends EventTarget {
  currentTime = 0;
  autoplay = false;
  playsInline = false;
  muted = false;
  paused = false;
  srcObject: unknown = null;
  style: Record<string, string> = {};
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
  remove = vi.fn();
  setSinkId = vi.fn(async () => undefined);
}
class TestTrack extends Events {
  attached: TestElement[] = [];
  isMuted = false;
  constructor(readonly mediaStreamTrack = new TestMediaTrack()) {
    super();
  }
  get kind() {
    return this.mediaStreamTrack.kind;
  }
  attach = vi.fn((element: TestElement) => {
    this.attached.push(element);
    element.srcObject = new TestStream([this.mediaStreamTrack]);
    return element;
  });
  detach = vi.fn(() => this.attached.splice(0));
  stop = vi.fn(() => this.mediaStreamTrack.stop());
  setDeviceId = vi.fn(async () => true);
}
class TestRoom extends Events {
  remoteParticipants = new Map<string, any>();
  canPlaybackAudio = true;
  localParticipant = {
    publishData: vi.fn(
      async (_bytes: Uint8Array, _options: unknown): Promise<void> => undefined,
    ),
    publishTrack: vi.fn(async (_track: unknown, _options: unknown) => ({
      trackSid: "local-track",
    })),
    unpublishTrack: vi.fn(async (_track: unknown, _stop: boolean) => undefined),
  };
  connect = vi.fn(
    async (_url: string, _token: string, _options: unknown) => undefined,
  );
  disconnect = vi.fn(async (_stop: boolean) => this.emit("disconnected"));
  startAudio = vi.fn(async () => undefined);
  startVideo = vi.fn(async () => undefined);
  switchActiveDevice = vi.fn(async (_kind: string, _device: string) => true);
  constructor(readonly options?: unknown) {
    super();
    rooms.push(this);
  }
}
const rooms: TestRoom[] = [];
const controllers: MediaRoomController[] = [];
const cameras: TestTrack[] = [];
const microphones: TestTrack[] = [];
const createVideo = vi.fn(async (_options: unknown) => {
  const track = new TestTrack();
  cameras.push(track);
  return track;
});
const createAudio = vi.fn(async (_options: unknown) => {
  const track = new TestTrack(new TestMediaTrack("audio"));
  microphones.push(track);
  return track;
});
const sdk = {
  DataPacket_Kind: { LOSSY: 1, RELIABLE: 0 },
  Room: TestRoom,
  LocalVideoTrack: TestTrack,
  LocalAudioTrack: TestTrack,
  createLocalVideoTrack: createVideo,
  createLocalAudioTrack: createAudio,
  Track: {
    Source: {
      Camera: "camera",
      Microphone: "microphone",
      ScreenShare: "screen_share",
      ScreenShareAudio: "screen_share_audio",
    },
    StreamState: { Paused: "paused" },
  },
  RoomEvent: Object.fromEntries(
    [
      "TrackPublished",
      "DataReceived",
      "ParticipantConnected",
      "ParticipantMetadataChanged",
      "TrackSubscribed",
      "TrackUnsubscribed",
      "ParticipantDisconnected",
      "TrackMuted",
      "TrackUnmuted",
      "TrackSubscriptionFailed",
      "ConnectionQualityChanged",
      "TrackStreamStateChanged",
      "AudioPlaybackStatusChanged",
      "VideoPlaybackStatusChanged",
      "MediaDevicesError",
      "Reconnecting",
      "SignalReconnecting",
      "Reconnected",
      "Disconnected",
    ].map((name) => [name, name === "Disconnected" ? "disconnected" : name]),
  ),
};
const mixer = {
  context: { state: "running" },
  destination: { stream: new TestStream([new TestMediaTrack("audio")]) },
  setInput: vi.fn(),
  setAdmitted: vi.fn(),
  removeInput: vi.fn(),
  levels: vi.fn(() => ({ A: 0, B: 0, program: 0 })),
  resume: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
};
const loadSDK = vi.fn(
  async () => sdk as unknown as Awaited<ReturnType<MediaRuntime["loadSDK"]>>,
);
const requestToken = vi.fn(
  async (_options: MediaRoomOptions, purpose: string) => ({
    url: "ws://localhost:7880",
    token: "private-test-token",
    room:
      purpose === "output-view" || purpose === "output-publish"
        ? "output"
        : "backstage",
    identity: "opaque-identity",
    expiresAt: Date.now() + 60_000,
    slot: null,
    purpose: purpose as "director",
  }),
);
function options(overrides: Partial<MediaRoomOptions> = {}): MediaRoomOptions {
  const participant = {
    connected: true,
    camera: true,
    ready: true,
    calibrated: true,
    admitted: true,
    consentBroadcast: true,
    microphone: true,
  };
  const show = {
    id: "ps_media_test",
    mode: "live",
    transport: "livekit",
    phase: "live",
    epoch: 3,
    renderLease: {
      clientId: "director-test-tab",
      epoch: 3,
      expiresAt: Date.now() + 60_000,
    },
    umbrella: { owner: "A" },
    participants: {
      A: { ...participant, anchor: { x: 0.65, y: 0.48 } },
      B: { ...participant, anchor: { x: 0.35, y: 0.48 } },
    },
  } as ShowState;
  return {
    show,
    role: "director",
    slot: "A",
    rendererId: "director-test-tab",
    epoch: 3,
    onPresence: vi.fn(async () => undefined),
    ...overrides,
  };
}
function controller(
  overrides: Partial<MediaRoomOptions> = {},
  runtime: Partial<MediaRuntime> = {},
) {
  const instance = new MediaRoomController(options(overrides), {
    loadSDK,
    requestToken,
    makeMixer: () => mixer as unknown as ProgramAudioMixer,
    ...runtime,
  });
  controllers.push(instance);
  instance.mount();
  return instance;
}
function publication(
  trackName: string,
  source: string,
  track = new TestTrack(),
  metadata = '{"role":"performer","slot":"B"}',
) {
  const participant = {
    identity: "signed-user",
    metadata,
    trackPublications: new Map(),
  };
  const value = {
    trackName,
    source,
    kind: track.kind,
    trackSid: `${trackName}-${source}`,
    isMuted: false,
    isSubscribed: true,
    track,
    setSubscribed: vi.fn(),
  };
  participant.trackPublications.set(value.trackSid, value);
  return { value, participant, track };
}
async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-31T10:00:00Z"));
  vi.clearAllMocks();
  rooms.length = 0;
  cameras.length = 0;
  microphones.length = 0;
  vi.stubGlobal("window", {
    isSecureContext: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi.fn(),
      enumerateDevices: vi.fn(async () => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
  vi.stubGlobal("document", {
    createElement: vi.fn(() => new TestElement()),
    body: { appendChild: vi.fn() },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("RTCPeerConnection", class {});
  vi.stubGlobal("AudioContext", class {});
  vi.stubGlobal(
    "HTMLCanvasElement",
    class {
      captureStream() {}
    },
  );
  vi.stubGlobal("HTMLMediaElement", TestElement);
  vi.stubGlobal("MediaStream", TestStream);
  mixer.context.state = "running";
  mixer.destination.stream = new TestStream([new TestMediaTrack("audio")]);
});
afterEach(async () => {
  await Promise.all(
    controllers.splice(0).map((instance) => instance.destroy()),
  );
  await flush();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("LiveKit browser lifecycle", () => {
  it("initializes and starts its canonical decoder without mounting a presentation surface", async () => {
    const media = controller();
    await media.enableCamera();
    const decoder = media.getSnapshot().localPreview!;
    expect(media.getSnapshot().videos.A).toBe(decoder);
    expect(decoder).toMatchObject({
      autoplay: true,
      defaultMuted: true,
      muted: true,
      playsInline: true,
    });
    expect(decoder.play).toHaveBeenCalled();
    expect(decoder.dataset.portalDecoder).toBe("true");
    expect(document.body.appendChild).not.toHaveBeenCalled();
  });
  it("replays only the current canonical source after an SDK stream reset", async () => {
    const media = controller();
    await media.enableCamera();
    const decoder = media.getSnapshot().localPreview!;
    decoder.pause();
    decoder.srcObject = new TestStream([
      cameras[0].mediaStreamTrack,
    ]) as unknown as MediaStream;
    decoder.dispatchEvent(new Event("loadedmetadata"));
    await vi.advanceTimersByTimeAsync(150);
    expect(decoder.paused).toBe(false);
    expect(decoder.play).toHaveBeenCalledTimes(2);
    expect(media.getSnapshot().videos.A).toBe(decoder);
    expect(decoder.dataset.portalPlayReason).toBe("source-ready");
    expect(document.body.appendChild).not.toHaveBeenCalled();
  });
  it("playback unlock retries the active local decoder and preserves an actual policy refusal", async () => {
    const media = controller();
    await media.enableCamera();
    const decoder = media.getSnapshot().localPreview!;
    decoder.pause();
    vi.mocked(decoder.play).mockRejectedValueOnce(
      new DOMException("test rejection", "NotAllowedError"),
    );
    await media.startAudio();
    expect(media.getSnapshot().videoBlocked).toBe(true);
    await media.startAudio();
    expect(media.getSnapshot().videoBlocked).toBe(false);
    expect(decoder.paused).toBe(false);
    const calls = vi.mocked(decoder.play).mock.calls.length;
    await media.disableCamera();
    await media.startAudio();
    await vi.advanceTimersByTimeAsync(500);
    expect(decoder.play).toHaveBeenCalledTimes(calls);
    expect(media.getSnapshot().localPreview).toBeNull();
  });
  it("disabling capture cancels queued source replay before stopping its track", async () => {
    const media = controller();
    await media.enableCamera();
    const decoder = media.getSnapshot().localPreview!;
    decoder.pause();
    decoder.dispatchEvent(new Event("loadeddata"));
    const calls = vi.mocked(decoder.play).mock.calls.length;
    await media.disableCamera();
    await vi.advanceTimersByTimeAsync(500);
    decoder.dispatchEvent(new Event("loadedmetadata"));
    expect(decoder.play).toHaveBeenCalledTimes(calls);
    expect(cameras[0].stop).toHaveBeenCalled();
    expect(decoder.srcObject).toBeNull();
  });
  it("does not load the SDK, request devices, or join a room merely by mounting", async () => {
    const media = controller();
    await flush();
    expect(loadSDK).not.toHaveBeenCalled();
    expect(createVideo).not.toHaveBeenCalled();
    expect(createAudio).not.toHaveBeenCalled();
    expect(requestToken).not.toHaveBeenCalled();
    expect(rooms).toHaveLength(0);
    expect(media.getSnapshot().status).toBe("idle");
    expect(media.getSnapshot().cameraRequestPending).toBe(false);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });
  it("reports an active camera request and prevents duplicate capture while permission is outstanding", async () => {
    let resolve!: (track: TestTrack) => void;
    createVideo.mockImplementationOnce(
      () =>
        new Promise<TestTrack>((done) => {
          resolve = done;
        }),
    );
    const media = controller();
    const enabling = media.enableCamera();
    expect(media.getSnapshot().cameraRequestPending).toBe(true);
    await media.enableCamera();
    await flush();
    expect(createVideo).toHaveBeenCalledTimes(1);
    expect(media.getSnapshot()).toMatchObject({
      cameraRequestPending: true,
      cameraEnabled: false,
      localPreview: null,
    });
    const track = new TestTrack();
    resolve(track);
    await enabling;
    expect(media.getSnapshot()).toMatchObject({
      cameraRequestPending: false,
      cameraEnabled: true,
    });
    expect(track.attach).toHaveBeenCalledTimes(1);
  });
  it("clears pending camera feedback when capture succeeds even if publication is still waiting", async () => {
    const media = controller();
    await media.connect();
    let publish!: () => void;
    rooms[0].localParticipant.publishTrack.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          publish = () => resolve({ trackSid: "local-track" });
        }),
    );
    const enabling = media.enableCamera();
    await flush();
    expect(media.getSnapshot()).toMatchObject({
      cameraRequestPending: false,
      cameraEnabled: true,
      cameraPublished: false,
    });
    publish();
    await enabling;
    expect(media.getSnapshot().cameraPublished).toBe(true);
  });
  it("clears a rejected camera request and allows an explicit retry", async () => {
    createVideo.mockRejectedValueOnce(
      new DOMException("camera denied", "NotAllowedError"),
    );
    const media = controller();
    await media.enableCamera();
    expect(media.getSnapshot()).toMatchObject({
      cameraRequestPending: false,
      cameraEnabled: false,
      permissions: { camera: "denied" },
      error: { code: "permission-denied" },
    });
    await media.enableCamera();
    expect(createVideo).toHaveBeenCalledTimes(2);
    expect(media.getSnapshot()).toMatchObject({
      cameraRequestPending: false,
      cameraEnabled: true,
      error: null,
    });
  });
  it("previews only after explicit camera enable and publishes only after explicit connect", async () => {
    const media = controller();
    await media.enableCamera();
    expect(media.getSnapshot().localPreview).not.toBeNull();
    expect(media.getSnapshot().cameraPublished).toBe(false);
    expect(rooms).toHaveLength(0);
    await media.connect();
    expect(requestToken).toHaveBeenCalledWith(
      expect.objectContaining({ role: "director" }),
      "director",
    );
    expect(rooms[0].connect).toHaveBeenCalledWith(
      "ws://localhost:7880",
      "private-test-token",
      { autoSubscribe: false },
    );
    expect(rooms[0].localParticipant.publishTrack).toHaveBeenCalledWith(
      cameras[0],
      expect.objectContaining({ source: "camera", name: "portal-camera" }),
    );
    expect(media.getSnapshot().cameraPublished).toBe(true);
    expect(JSON.stringify(media.getSnapshot())).not.toContain(
      "private-test-token",
    );
    expect(microphones).toHaveLength(0);
  });
  it("holds the microphone muted on joining after a private microphone test", async () => {
    const media = controller();
    await media.enableMicrophone();
    const privateMic = microphones[0];
    expect(media.getSnapshot().microphoneEnabled).toBe(true);
    await media.connect();
    expect(privateMic.stop).toHaveBeenCalled();
    expect(media.getSnapshot().microphoneEnabled).toBe(false);
    expect(rooms[0].localParticipant.publishTrack).not.toHaveBeenCalled();
    await media.enableMicrophone();
    expect(rooms[0].localParticipant.publishTrack).toHaveBeenCalledWith(
      microphones[1],
      { name: "portal-microphone", source: "microphone" },
    );
    expect(media.getSnapshot().microphonePublished).toBe(true);
  });
  it("stops a camera granted after the user has already disabled it", async () => {
    let resolve!: (track: TestTrack) => void;
    createVideo.mockImplementationOnce(
      () =>
        new Promise<TestTrack>((done) => {
          resolve = done;
        }),
    );
    const media = controller();
    const enabling = media.enableCamera();
    await flush();
    expect(media.getSnapshot().cameraRequestPending).toBe(true);
    await media.disableCamera();
    expect(media.getSnapshot().cameraRequestPending).toBe(false);
    const lateTrack = new TestTrack();
    resolve(lateTrack);
    await enabling;
    expect(lateTrack.stop).toHaveBeenCalled();
    expect(lateTrack.attach).not.toHaveBeenCalled();
    expect(media.getSnapshot().cameraEnabled).toBe(false);
    expect(media.getSnapshot().cameraRequestPending).toBe(false);
  });
  it("does not let a cancelled capture resolution clear a newer request's pending state", async () => {
    const resolutions: Array<(track: TestTrack) => void> = [];
    for (let i = 0; i < 2; i++)
      createVideo.mockImplementationOnce(
        () =>
          new Promise<TestTrack>((resolve) => {
            resolutions.push(resolve);
          }),
      );
    const media = controller();
    const cancelled = media.enableCamera();
    await flush();
    await media.disableCamera();
    const current = media.enableCamera();
    await flush();
    const staleTrack = new TestTrack();
    resolutions[0](staleTrack);
    await cancelled;
    expect(staleTrack.stop).toHaveBeenCalled();
    expect(staleTrack.attach).not.toHaveBeenCalled();
    expect(media.getSnapshot().cameraRequestPending).toBe(true);
    const currentTrack = new TestTrack();
    resolutions[1](currentTrack);
    await current;
    expect(media.getSnapshot()).toMatchObject({
      cameraRequestPending: false,
      cameraEnabled: true,
    });
    expect(currentTrack.stop).not.toHaveBeenCalled();
    expect(currentTrack.attach).toHaveBeenCalledTimes(1);
  });
  it("disconnect immediately cancels capture intent and stops a track granted afterwards", async () => {
    let resolve!: (track: TestTrack) => void;
    createVideo.mockImplementationOnce(
      () =>
        new Promise<TestTrack>((done) => {
          resolve = done;
        }),
    );
    const media = controller();
    await media.connect();
    const enabling = media.enableCamera();
    await flush();
    expect(media.getSnapshot().cameraRequestPending).toBe(true);
    const disconnecting = media.disconnect();
    expect(media.getSnapshot().cameraRequestPending).toBe(false);
    const lateTrack = new TestTrack();
    resolve(lateTrack);
    await Promise.all([enabling, disconnecting]);
    expect(lateTrack.stop).toHaveBeenCalled();
    expect(lateTrack.attach).not.toHaveBeenCalled();
    expect(rooms[0].localParticipant.publishTrack).not.toHaveBeenCalled();
    expect(media.getSnapshot()).toMatchObject({
      cameraRequestPending: false,
      cameraEnabled: false,
      localPreview: null,
    });
  });
  it("ending an unjoined show cancels pending capture and stops a late permission grant", async () => {
    let resolve!: (track: TestTrack) => void;
    createVideo.mockImplementationOnce(
      () =>
        new Promise<TestTrack>((done) => {
          resolve = done;
        }),
    );
    const initial = options();
    const media = controller(initial);
    const enabling = media.enableCamera();
    await flush();
    expect(rooms).toHaveLength(0);
    expect(media.getSnapshot().cameraRequestPending).toBe(true);
    media.updateOptions({
      ...initial,
      show: { ...initial.show, phase: "ended" },
    });
    expect(media.getSnapshot().cameraRequestPending).toBe(false);
    const lateTrack = new TestTrack();
    resolve(lateTrack);
    await enabling;
    await flush();
    expect(lateTrack.stop).toHaveBeenCalledTimes(1);
    expect(lateTrack.attach).not.toHaveBeenCalled();
    expect(requestToken).not.toHaveBeenCalled();
    expect(rooms).toHaveLength(0);
    expect(media.getSnapshot()).toMatchObject({
      status: "disconnected",
      connected: false,
      cameraRequestPending: false,
      cameraEnabled: false,
      cameraPublished: false,
      localPreview: null,
      videos: { A: null, B: null },
      permissions: { camera: "unknown" },
      error: null,
    });
  });
  it("switches only an already enabled input and leaves disabled inputs private", async () => {
    const media = controller();
    await media.selectDevice("videoinput", "camera-2");
    expect(createVideo).not.toHaveBeenCalled();
    await media.enableCamera();
    expect(createVideo).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: { exact: "camera-2" } }),
    );
    await media.selectDevice("videoinput", "camera-3");
    expect(cameras[0].setDeviceId).toHaveBeenCalledWith({ exact: "camera-3" });
    await media.selectDevice("audioinput", "mic-2");
    expect(createAudio).not.toHaveBeenCalled();
  });
  it("stops capture synchronously on reconnect and never silently republishes either device", async () => {
    const media = controller();
    await media.enableCamera();
    await media.connect();
    await media.enableMicrophone();
    const room = rooms[0];
    const published = room.localParticipant.publishTrack.mock.calls.length;
    room.emit("Reconnecting");
    expect(cameras[0].stop).toHaveBeenCalled();
    expect(microphones[0].stop).toHaveBeenCalled();
    expect(media.getSnapshot()).toMatchObject({
      connected: false,
      status: "reconnecting",
      cameraEnabled: false,
      microphoneEnabled: false,
    });
    room.emit("Reconnected");
    await flush();
    expect(media.getSnapshot()).toMatchObject({
      connected: true,
      cameraPublished: false,
      microphonePublished: false,
    });
    expect(room.localParticipant.publishTrack).toHaveBeenCalledTimes(published);
    expect(createVideo).toHaveBeenCalledTimes(1);
    expect(createAudio).toHaveBeenCalledTimes(1);
  });
  it("reports regular presence heartbeats, and reports disconnection immediately", async () => {
    const presence = vi.fn(async () => undefined);
    const media = controller({ onPresence: presence });
    await media.connect();
    await flush();
    const before = presence.mock.calls.length;
    await vi.advanceTimersByTimeAsync(8000);
    expect(presence.mock.calls.length).toBeGreaterThan(before);
    rooms[0].emit("disconnected");
    await flush();
    expect(presence).toHaveBeenLastCalledWith({
      connected: false,
      camera: false,
      microphone: false,
    });
  });
  it("keeps program viewers in the output room and rejects raw cameras and direct-call audio", async () => {
    const media = controller({ role: "program", slot: null });
    await media.connect();
    expect(requestToken).toHaveBeenCalledWith(expect.anything(), "output-view");
    const raw = publication("portal-camera", "camera");
    rooms[0].emit("TrackSubscribed", raw.track, raw.value, raw.participant);
    const mic = publication(
      "portal-microphone",
      "microphone",
      new TestTrack(new TestMediaTrack("audio")),
    );
    rooms[0].emit("TrackSubscribed", mic.track, mic.value, mic.participant);
    expect(raw.value.setSubscribed).toHaveBeenCalledWith(false);
    expect(mic.value.setSubscribed).toHaveBeenCalledWith(false);
    expect(raw.track.attach).not.toHaveBeenCalled();
    expect(mic.track.attach).not.toHaveBeenCalled();
    const program = publication(
      "portal-program",
      "screen_share",
      new TestTrack(),
      '{"role":"output-publish"}',
    );
    rooms[0].emit(
      "TrackSubscribed",
      program.track,
      program.value,
      program.participant,
    );
    expect(media.getSnapshot().programVideo).not.toBeNull();
    expect(media.getSnapshot().videos).toEqual({ A: null, B: null });
    expect(createVideo).not.toHaveBeenCalled();
    expect(createAudio).not.toHaveBeenCalled();
  });
  it("subscribes guests only to direct host audio and the video-only return", async () => {
    const media = controller({ role: "performer", slot: "B" });
    await media.connect();
    const host = '{"role":"director","slot":"A"}';
    const camera = publication(
      "portal-camera",
      "camera",
      new TestTrack(),
      host,
    );
    const audio = publication(
      "portal-microphone",
      "microphone",
      new TestTrack(new TestMediaTrack("audio")),
      host,
    );
    const returned = publication(
      "portal-return",
      "screen_share",
      new TestTrack(),
      host,
    );
    for (const item of [camera, audio, returned])
      rooms[0].emit("TrackPublished", item.value, item.participant);
    expect(camera.value.setSubscribed).toHaveBeenLastCalledWith(false);
    expect(audio.value.setSubscribed).toHaveBeenLastCalledWith(true);
    expect(returned.value.setSubscribed).toHaveBeenLastCalledWith(true);
    const forged = publication(
      "portal-camera",
      "camera",
      new TestTrack(),
      '{"name":"Director A"}',
    );
    rooms[0].emit("TrackPublished", forged.value, forged.participant);
    expect(forged.value.setSubscribed).toHaveBeenLastCalledWith(false);
  });
  it("publishes only composed video and gated mixed audio in the separate output room, then fences both outputs", async () => {
    const media = controller();
    await media.connect();
    const captured = new TestMediaTrack();
    const canvas = {
      captureStream: vi.fn(() => new TestStream([captured])),
    } as unknown as HTMLCanvasElement;
    await media.publishProgram(canvas);
    expect(rooms).toHaveLength(2);
    expect(requestToken).toHaveBeenLastCalledWith(
      expect.anything(),
      "output-publish",
    );
    expect(rooms[0].localParticipant.publishTrack).toHaveBeenCalledTimes(1);
    expect(
      rooms[0].localParticipant.publishTrack.mock.calls[0][1],
    ).toMatchObject({ name: "portal-return", source: "screen_share" });
    expect(
      rooms[1].localParticipant.publishTrack.mock.calls.map((call) => call[1]),
    ).toEqual([
      expect.objectContaining({
        name: "portal-program",
        source: "screen_share",
      }),
      { name: "portal-program-audio", source: "screen_share_audio" },
    ]);
    expect(media.getSnapshot().programPublishing).toBe(true);
    const expired = options();
    expired.show.renderLease.expiresAt = Date.now();
    media.updateOptions(expired);
    expect(captured.stop).toHaveBeenCalled();
    expect(media.getSnapshot().programPublishing).toBe(false);
    await flush();
    expect(rooms[1].disconnect).toHaveBeenCalledWith(true);
    expect(mixer.setAdmitted).toHaveBeenCalledWith("B", false);
  });
  it("refuses stale canvas authority before fetching an output token", async () => {
    const media = controller({ rendererId: "old-director-tab" });
    await media.connect();
    const requests = requestToken.mock.calls.length;
    await media.publishProgram({
      captureStream: vi.fn(),
    } as unknown as HTMLCanvasElement);
    expect(requestToken).toHaveBeenCalledTimes(requests);
    expect(media.getSnapshot().error?.code).toBe("stale-renderer");
  });
  it("stops and detaches every local and remote track on leave", async () => {
    const media = controller();
    await media.enableCamera();
    await media.connect();
    await media.enableMicrophone();
    const peer = publication("portal-camera", "camera");
    rooms[0].emit("TrackSubscribed", peer.track, peer.value, peer.participant);
    const localVideo = media.getSnapshot()
      .localPreview as unknown as TestElement;
    expect(media.getSnapshot().videos.B).not.toBeNull();
    await media.disconnect();
    expect(cameras[0].stop).toHaveBeenCalled();
    expect(microphones[0].stop).toHaveBeenCalled();
    expect(localVideo.srcObject).toBeNull();
    expect(peer.track.detach).toHaveBeenCalled();
    expect(media.getSnapshot()).toMatchObject({
      localPreview: null,
      programVideo: null,
      videos: { A: null, B: null },
      connected: false,
    });
    expect(mixer.close).toHaveBeenCalled();
    expect(rooms[0].disconnect).toHaveBeenCalledWith(true);
  });
  it("hides stalled and server-paused camera frames, and restores only after live video returns", async () => {
    const media = controller();
    await media.connect();
    const peer = publication("portal-camera", "camera");
    rooms[0].emit("TrackSubscribed", peer.track, peer.value, peer.participant);
    const video = media.getSnapshot().videos.B as unknown as TestElement;
    expect(video).not.toBeNull();
    rooms[0].emit("TrackStreamStateChanged", peer.value, "paused");
    expect(media.getSnapshot().videos.B).toBeNull();
    rooms[0].emit("TrackStreamStateChanged", peer.value, "active");
    expect(media.getSnapshot().videos.B).toBe(video);
    await vi.advanceTimersByTimeAsync(4500);
    expect(media.getSnapshot().videos.B).toBeNull();
    video.currentTime += 0.25;
    await vi.advanceTimersByTimeAsync(250);
    expect(media.getSnapshot().videos.B).toBe(video);
  });
  it("presents local anchors immediately and sends only the latest bounded lossy sample", async () => {
    const media = controller();
    await media.enableCamera();
    await media.connect();
    const room = rooms[0];
    let release!: () => void;
    room.localParticipant.publishData.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    media.sendAnchor({ x: 0.2, y: 0.4 });
    await flush();
    for (let i = 0; i < 100; i++) media.sendAnchor({ x: i / 100, y: 0.4 });
    expect(media.getSnapshot().anchors.A).toEqual({ x: 0.99, y: 0.4 });
    expect(room.localParticipant.publishData).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(300);
    release();
    await flush();
    expect(room.localParticipant.publishData).toHaveBeenCalledTimes(2);
    const [payload, publishOptions] =
      room.localParticipant.publishData.mock.calls[1];
    expect(decodeAnchor(payload)?.point).toEqual({ x: 0.99, y: 0.4 });
    expect(publishOptions).toEqual({
      reliable: false,
      topic: ANCHOR_TOPIC,
      destinationIdentities: ["performer-ps_media_test-B"],
    });
    expect(requestToken).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(ANCHOR_LIMITS.ttlMs);
    expect(media.getSnapshot().anchors.A).toEqual({ x: 0.65, y: 0.48 });
  });
  it("drops a sample that aged behind data-channel backpressure instead of stamping it as fresh", async () => {
    const media = controller();
    await media.enableCamera();
    await media.connect();
    let release!: () => void;
    rooms[0].localParticipant.publishData.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    media.sendAnchor({ x: 0.2, y: 0.4 });
    await flush();
    media.sendAnchor({ x: 0.9, y: 0.4 });
    await vi.advanceTimersByTimeAsync(ANCHOR_LIMITS.maxAgeMs + 10);
    release();
    await flush();
    expect(rooms[0].localParticipant.publishData).toHaveBeenCalledTimes(1);
  });
  it("keeps sequence monotonic when the camera is toggled within one private room", async () => {
    const media = controller();
    await media.enableCamera();
    await media.connect();
    media.sendAnchor({ x: 0.2, y: 0.4 });
    await flush();
    await media.disableCamera();
    await media.enableCamera();
    media.sendAnchor({ x: 0.3, y: 0.4 });
    await flush();
    const calls = rooms[0].localParticipant.publishData.mock.calls;
    expect(calls).toHaveLength(2);
    expect(decodeAnchor(calls[1][0])!.seq).toBeGreaterThan(
      decodeAnchor(calls[0][0])!.seq,
    );
  });
  it("receives anchors only from the current SDK peer over the private lossy topic and clears them on epoch/disconnect", async () => {
    const initial = options();
    initial.show.umbrella.owner = "B";
    const media = controller({ show: initial.show });
    await media.connect();
    const room = rooms[0];
    const peer = publication("portal-camera", "camera");
    peer.participant.identity = "performer-ps_media_test-B";
    peer.participant.metadata = JSON.stringify({
      role: "performer",
      slot: "B",
      showId: initial.show.id,
      epoch: 2,
    });
    room.remoteParticipants.set(peer.participant.identity, peer.participant);
    const packet = (epoch = 3) =>
      encodeAnchor({
        v: 1,
        showId: initial.show.id,
        epoch,
        seq: 1,
        sentAt: Date.now(),
        slot: "B",
        point: { x: 0.2, y: 0.3 },
      })!;
    room.emit("DataReceived", packet(), peer.participant, 0, ANCHOR_TOPIC);
    room.emit("DataReceived", packet(), peer.participant, 1, "other-topic");
    room.emit(
      "DataReceived",
      packet(),
      { ...peer.participant },
      1,
      ANCHOR_TOPIC,
    );
    expect(media.getSnapshot().transientAnchors.B).toBeNull();
    room.emit("DataReceived", packet(), peer.participant, 1, ANCHOR_TOPIC);
    expect(media.getSnapshot().anchors.B).toEqual({ x: 0.2, y: 0.3 });
    expect(initial.show.participants.B.anchor).toEqual({ x: 0.35, y: 0.48 });
    const next = {
      ...initial.show,
      epoch: 4,
      renderLease: { ...initial.show.renderLease, epoch: 4 },
    };
    media.updateOptions({ ...initial, show: next, epoch: 4 });
    expect(media.getSnapshot().transientAnchors.B).toBeNull();
    room.emit("DataReceived", packet(4), peer.participant, 1, ANCHOR_TOPIC);
    expect(media.getSnapshot().transientAnchors.B).not.toBeNull();
    room.emit("Reconnecting");
    expect(media.getSnapshot().transientAnchors.B).toBeNull();
    expect(media.getSnapshot().anchors.B).toEqual({ x: 0.35, y: 0.48 });
  });
  it("independently detaches Program audio during Hold or lease expiry, including Start audio while held", async () => {
    const initial = options({ role: "program", slot: null });
    const media = controller(initial);
    await media.connect();
    const audio = publication(
      "portal-program-audio",
      "screen_share_audio",
      new TestTrack(new TestMediaTrack("audio")),
    );
    audio.participant.identity = "renderer-ps_media_test-3";
    audio.participant.metadata = JSON.stringify({
      role: "output-publisher",
      showId: "ps_media_test",
      epoch: 3,
      slot: null,
    });
    rooms[0].emit(
      "TrackSubscribed",
      audio.track,
      audio.value,
      audio.participant,
    );
    expect(audio.track.attached).toHaveLength(1);
    const element = audio.track.attached[0];
    media.updateOptions({
      ...initial,
      show: { ...initial.show, phase: "hold" },
    });
    expect(audio.track.attached).toHaveLength(0);
    expect(element.muted).toBe(true);
    expect(element.srcObject).toBeNull();
    await media.startAudio();
    expect(audio.track.attached).toHaveLength(0);
    media.updateOptions(initial);
    expect(audio.track.attached).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60_250);
    expect(audio.track.attached).toHaveLength(0);
    expect(element.muted).toBe(true);
  });
  it("rejects stale Program publishers without changing private direct-call monitoring policy", async () => {
    const program = controller({ role: "program", slot: null });
    await program.connect();
    const stale = publication(
      "portal-program-audio",
      "screen_share_audio",
      new TestTrack(new TestMediaTrack("audio")),
      '{"role":"output-publisher","showId":"ps_media_test","epoch":2}',
    );
    stale.participant.identity = "renderer-ps_media_test-2";
    rooms[0].emit(
      "TrackSubscribed",
      stale.track,
      stale.value,
      stale.participant,
    );
    expect(stale.track.attach).not.toHaveBeenCalled();
    const directorOptions = options();
    const director = controller(directorOptions);
    await director.connect();
    const call = publication(
      "portal-microphone",
      "microphone",
      new TestTrack(new TestMediaTrack("audio")),
    );
    rooms[1].emit("TrackSubscribed", call.track, call.value, call.participant);
    const element = call.track.attached[0];
    expect(element.muted).toBe(false);
    director.updateOptions({
      ...directorOptions,
      show: { ...directorOptions.show, phase: "hold" },
    });
    expect(call.track.attached).toHaveLength(1);
    expect(element.srcObject).not.toBeNull();
  });
});
