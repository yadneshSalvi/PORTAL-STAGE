import type {
  LocalAudioTrack,
  LocalVideoTrack,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
} from "livekit-client";
import type { MediaToken, Point, Slot } from "../lib/contracts";
import { rendererMediaIdentity } from "../lib/media-identity";
import { api } from "../lib/client";
import { ProgramAudioMixer } from "./audio-mix";
import {
  hasRenderAuthority,
  mayMixSlot,
  mayPlayProgramAudio,
  mayReceiveRendererMedia,
  mediaCapabilities,
  mediaIssue,
  MEDIA_TRACKS,
  participantSlot,
  soloMediaClosed,
} from "./safety";
import { createSyntheticCamera } from "./synthetic-camera";
import type {
  MediaIssue,
  MediaPresence,
  MediaQuality,
  MediaRoomOptions,
  MediaSnapshot,
} from "./types";
import { PresenceReporter } from "./presence-reporter";
import { initializeMutedVideo } from "./video-presentation";
import { ownCanonicalPlayback } from "./video-decoder";
import {
  activeAnchorSlot,
  ANCHOR_LIMITS,
  ANCHOR_TOPIC,
  encodeAnchor,
  TransientAnchorReceiver,
  validAnchor,
} from "./anchor-protocol";

type SDK = typeof import("livekit-client");
type RemoteBinding = {
  track: RemoteTrack;
  publication: RemoteTrackPublication;
  participant: RemoteParticipant;
  slot: Slot | null;
  video?: HTMLVideoElement;
  audio?: HTMLAudioElement;
  audioAttached?: boolean;
  serverPaused?: boolean;
  stalled?: boolean;
  lastVideoTime?: number;
  lastFrameAt?: number;
};
export type MediaRuntime = {
  loadSDK: () => Promise<SDK>;
  requestToken: (
    options: MediaRoomOptions,
    purpose: MediaToken["purpose"],
  ) => Promise<MediaToken>;
  now: () => number;
  makeMixer: () => ProgramAudioMixer;
};
const defaultRuntime: MediaRuntime = {
  loadSDK: () => import("livekit-client"),
  requestToken: (options, purpose) =>
    api<MediaToken>(
      `/api/shows/${encodeURIComponent(options.show.id)}/media/token`,
      {
        method: "POST",
        body: JSON.stringify({
          purpose,
          rendererId: options.rendererId,
          incarnationId: options.rendererIncarnationId,
          incarnationSequence: options.rendererIncarnationSequence,
          epoch: options.epoch,
        }),
      },
    ),
  now: () => Date.now(),
  makeMixer: () => new ProgramAudioMixer(),
};

export function initialMediaSnapshot(): MediaSnapshot {
  return {
    anchors: { A: { x: 0.65, y: 0.48 }, B: { x: 0.35, y: 0.48 } },
    transientAnchors: { A: null, B: null },
    videos: { A: null, B: null },
    localPreview: null,
    programVideo: null,
    connected: false,
    status: "idle",
    cameraEnabled: false,
    cameraRequestPending: false,
    microphoneEnabled: false,
    cameraPublished: false,
    microphonePublished: false,
    syntheticCamera: false,
    programPublishing: false,
    programStatus: "idle",
    devices: [],
    selectedDevices: {},
    permissions: { camera: "unknown", microphone: "unknown" },
    error: null,
    quality: "unknown",
    audioBlocked: false,
    videoBlocked: false,
    audioLevels: { A: 0, B: 0, program: 0 },
    capabilities: {
      secureContext: false,
      webRTC: false,
      devices: false,
      canvasCapture: false,
      audioMix: false,
      outputSelection: false,
    },
  };
}

/** Imperative lifecycle so React renders never ask for devices or create rooms. */
export class MediaRoomController {
  private options: MediaRoomOptions;
  private runtime: MediaRuntime;
  private snapshot = initialMediaSnapshot();
  private subscribers = new Set<() => void>();
  private sdkPromise: Promise<SDK> | null = null;
  private room: Room | null = null;
  private outputRoom: Room | null = null;
  private camera: LocalVideoTrack | null = null;
  private cameraPlayback: ReturnType<typeof ownCanonicalPlayback> | null = null;
  private microphone: LocalAudioTrack | null = null;
  private remote = new Map<string, RemoteBinding>();
  private mixer: ProgramAudioMixer | null = null;
  private returnTrack: LocalVideoTrack | null = null;
  private programTrack: LocalVideoTrack | null = null;
  private programAudio: LocalAudioTrack | null = null;
  private captureStream: MediaStream | null = null;
  private programCanvas: HTMLCanvasElement | null = null;
  private syntheticStop: (() => void) | null = null;
  private connectTask: Promise<void> | null = null;
  private programTask: Promise<void> | null = null;
  private generation = 0;
  private programGeneration = 0;
  private cameraGeneration = 0;
  private microphoneGeneration = 0;
  private serverOffset = 0;
  private lastServerSample: number | undefined;
  private mounted = false;
  private soloClosed = false;
  private tick: ReturnType<typeof setInterval> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private permissionCleanups: Array<() => void> = [];
  private presenceReporter: PresenceReporter;
  private anchorReceiver = new TransientAnchorReceiver();
  private anchorPending: {
    point: Point;
    epoch: number;
    capturedAt: number;
    localAt: number;
  } | null = null;
  private anchorFlight: Promise<void> | null = null;
  private anchorFlightRoom: Room | null = null;
  private anchorTimer: ReturnType<typeof setTimeout> | null = null;
  private anchorLastSentAt = -Infinity;
  private anchorSequence = 0;
  private anchorGeneration = 0;

  constructor(options: MediaRoomOptions, runtime: Partial<MediaRuntime> = {}) {
    this.options = options;
    this.runtime = { ...defaultRuntime, ...runtime };
    this.presenceReporter = new PresenceReporter(
      (sample) => this.options.onPresence?.(sample),
      this.runtime.now,
      () =>
        this.hint(
          "The control service did not acknowledge device presence. Check the show connection before going on air.",
        ),
    );
    this.updateClock(options.serverNow);
    this.updateAnchors();
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  };
  private patch(patch: Partial<MediaSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.subscribers.forEach((listener) => listener());
  }
  private sdk() {
    return (this.sdkPromise ??= this.runtime.loadSDK());
  }
  private hint(message: string) {
    this.options.onStateHint?.(message);
  }
  private updateClock(serverNow?: number) {
    if (serverNow !== undefined && serverNow !== this.lastServerSample) {
      this.serverOffset = serverNow - this.runtime.now();
      this.lastServerSample = serverNow;
    }
  }
  private now() {
    return this.runtime.now() + this.serverOffset;
  }
  private authority() {
    return hasRenderAuthority(this.options, this.now());
  }
  private enforceSoloWindow() {
    if (!this.soloClosed && !soloMediaClosed(this.options.show, this.now()))
      return false;
    if (!this.soloClosed) {
      this.soloClosed = true;
      void this.disconnect();
      this.issue({
        code: "authorization",
        recoverable: false,
        message:
          "This solo media session has closed. Camera, microphone and Program are off; start a new session or use the local rehearsal.",
      });
    }
    return true;
  }
  private fail(error: unknown, device?: "camera" | "microphone") {
    const issue = mediaIssue(error, device);
    this.patch({ error: issue });
    this.hint(issue.message);
    return issue;
  }
  private issue(issue: MediaIssue) {
    this.patch({ error: issue });
    this.hint(issue.message);
  }

  mount = () => {
    if (this.mounted) return;
    this.mounted = true;
    this.patch({ capabilities: mediaCapabilities() });
    navigator.mediaDevices?.addEventListener?.(
      "devicechange",
      this.onDeviceChange,
    );
    window.addEventListener("pagehide", this.onPageHide);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    void this.refreshDevices();
    void this.observePermission("camera");
    void this.observePermission("microphone");
    this.tick = setInterval(() => {
      if (this.enforceSoloWindow()) return;
      if ((this.outputRoom || this.programTask) && !this.authority()) {
        void this.stopProgram();
        this.hint(
          "Program publication stopped because this renderer's authority expired. Renew the lease before publishing again.",
        );
      }
      if (this.mixer) this.patch({ audioLevels: this.mixer.levels() });
      this.revalidateRemote();
      this.checkVideoLiveness();
      this.updateAnchors();
      this.syncRemoteAudioGates();
    }, 250);
    this.heartbeat = setInterval(() => {
      if (this.snapshot.connected) this.notifyPresence();
    }, 8000);
  };
  updateOptions = (options: MediaRoomOptions) => {
    const previous = this.options;
    const previousPhase = previous.show.phase;
    const scopeChanged =
      previous.show.epoch !== options.show.epoch ||
      previous.show.renderLease.incarnationId !==
        options.show.renderLease.incarnationId ||
      previous.show.renderLease.incarnationSequence !==
        options.show.renderLease.incarnationSequence;
    const localIdentityChanged =
      previous.rendererId !== options.rendererId ||
      previous.rendererIncarnationId !== options.rendererIncarnationId ||
      previous.rendererIncarnationSequence !==
        options.rendererIncarnationSequence;
    this.options = options;
    this.updateClock(options.serverNow);
    if (this.enforceSoloWindow()) return;
    if (scopeChanged) this.clearAnchors();
    if (
      options.role === "director" &&
      (scopeChanged || localIdentityChanged) &&
      (this.room || this.connectTask || this.outputRoom || this.programTask)
    )
      void this.disconnect();
    this.revalidateRemote();
    this.room?.remoteParticipants.forEach((participant) =>
      this.subscribeParticipant(participant),
    );
    this.updateAnchors();
    this.syncRemoteAudioGates();
    this.syncAudioMix();
    if ((this.outputRoom || this.programTask) && !this.authority())
      void this.stopProgram();
    if (
      options.show.phase === "ended" &&
      (previousPhase !== "ended" ||
        this.room ||
        this.connectTask ||
        this.programTask ||
        this.camera ||
        this.microphone ||
        this.snapshot.cameraRequestPending)
    )
      void this.disconnect();
  };
  private onDeviceChange = () => {
    void this.refreshDevices();
  };
  private onPageHide = () => {
    void this.disconnect();
  };
  private onVisibilityChange = () => {
    if (this.enforceSoloWindow()) return;
    if ((this.outputRoom || this.programTask) && !this.authority()) {
      void this.stopProgram();
      this.hint(
        "Program is held because the director’s authority is no longer current.",
      );
    }
    this.revalidateRemote();
    this.syncRemoteAudioGates();
    this.checkVideoLiveness();
  };
  private async observePermission(name: "camera" | "microphone") {
    try {
      if (!navigator.permissions?.query) return;
      const permission = await navigator.permissions.query({
        name: name as PermissionName,
      });
      if (!this.mounted) return;
      const change = () => {
        this.patch({
          permissions: {
            ...this.snapshot.permissions,
            [name]: permission.state,
          },
        });
        if (permission.state === "denied")
          void (name === "camera"
            ? this.disableCamera()
            : this.disableMicrophone());
      };
      change();
      permission.addEventListener("change", change);
      this.permissionCleanups.push(() =>
        permission.removeEventListener("change", change),
      );
    } catch {
      /* Safari may not implement these permission names. Enable remains explicit. */
    }
  }
  refreshDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      this.patch({ devices: await navigator.mediaDevices.enumerateDevices() });
    } catch {
      /* Device labels may stay hidden until the corresponding explicit permission. */
    }
  };

  private activeShow() {
    return (
      this.mounted &&
      this.options.show.phase !== "ended" &&
      !this.soloClosed &&
      !soloMediaClosed(this.options.show, this.now())
    );
  }
  private ensureCaptureAllowed() {
    const caps = mediaCapabilities();
    if (!this.activeShow()) {
      this.issue({
        code: "authorization",
        recoverable: false,
        message:
          this.options.show.mode === "solo" &&
          (this.soloClosed || soloMediaClosed(this.options.show, this.now()))
            ? "This solo media session has closed. Open a new session or use local camera rehearsal."
            : "This show has ended. Start a new show before enabling a device.",
      });
      return false;
    }
    if (this.options.role === "program") {
      this.issue({
        code: "authorization",
        recoverable: false,
        message:
          "Program is a read-only media receiver and cannot enable devices.",
      });
      return false;
    }
    if (
      this.options.show.mode === "solo" &&
      (this.options.role !== "director" || this.options.slot !== "A")
    ) {
      this.issue({
        code: "authorization",
        recoverable: false,
        message:
          "The Audience Room is illustrated software. Only the consenting streamer in room A can enable devices in a solo show.",
      });
      return false;
    }
    if (!caps.secureContext) {
      this.issue({
        code: "insecure-context",
        recoverable: false,
        message:
          "Camera and microphone need HTTPS or localhost. Open the secure show link to prepare devices.",
      });
      return false;
    }
    if (!caps.devices || !caps.webRTC) {
      this.issue({
        code: "unsupported",
        recoverable: false,
        message:
          "This browser does not provide the media APIs needed for live performance. Use a current desktop browser.",
      });
      return false;
    }
    return true;
  }

  enableCamera = async () => {
    if (this.enforceSoloWindow()) return;
    if (
      this.camera ||
      this.snapshot.cameraRequestPending ||
      !this.ensureCaptureAllowed()
    )
      return;
    const generation = ++this.cameraGeneration;
    this.patch({ cameraRequestPending: true, error: null });
    try {
      const sdk = await this.sdk();
      if (generation !== this.cameraGeneration || !this.activeShow()) {
        this.enforceSoloWindow();
        return;
      }
      const deviceId = this.snapshot.selectedDevices.videoinput;
      const track = await sdk.createLocalVideoTrack({
        resolution: { width: 1280, height: 720, frameRate: 30 },
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: "user",
      });
      if (generation !== this.cameraGeneration || !this.activeShow()) {
        track.stop();
        this.enforceSoloWindow();
        return;
      }
      this.installCamera(track, false);
      this.patch({
        permissions: { ...this.snapshot.permissions, camera: "granted" },
        error: null,
      });
      if (this.snapshot.connected) await this.publishCamera(track);
      await this.refreshDevices();
      this.notifyPresence();
    } catch (error) {
      if (generation !== this.cameraGeneration) return;
      const issue = this.fail(error, "camera");
      if (issue.code === "permission-denied")
        this.patch({
          permissions: { ...this.snapshot.permissions, camera: "denied" },
        });
    } finally {
      if (
        generation === this.cameraGeneration &&
        this.snapshot.cameraRequestPending
      )
        this.patch({ cameraRequestPending: false });
    }
  };
  enableTestCamera = async () => {
    if (
      !this.options.allowSyntheticMedia ||
      !this.activeShow() ||
      this.options.show.mode !== "rehearsal" ||
      !this.options.slot ||
      this.options.role === "program"
    ) {
      this.issue({
        code: "authorization",
        recoverable: false,
        message:
          "Synthetic transport media is available only in an explicitly enabled local rehearsal.",
      });
      return;
    }
    await this.disableCamera();
    const generation = ++this.cameraGeneration;
    try {
      const sdk = await this.sdk();
      if (generation !== this.cameraGeneration || !this.activeShow()) return;
      const pattern = createSyntheticCamera(this.options.slot);
      this.syntheticStop = pattern.stop;
      const track = new sdk.LocalVideoTrack(
        pattern.stream.getVideoTracks()[0],
        undefined,
        true,
      );
      this.installCamera(track, true);
      if (this.snapshot.connected) await this.publishCamera(track);
      this.notifyPresence();
      this.hint(
        "Synthetic transport test is enabled. This moving test plate is not a human camera or remote-performance evidence.",
      );
    } catch (error) {
      this.fail(error, "camera");
    }
  };
  private installCamera(track: LocalVideoTrack, synthetic: boolean) {
    this.camera = track;
    const video = this.makeVideo();
    this.cameraPlayback = ownCanonicalPlayback(
      video,
      () => this.camera === track,
      (videoBlocked) => this.patch({ videoBlocked }),
    );
    track.attach(video);
    void this.cameraPlayback.start();
    track.once("ended", () => {
      if (this.camera !== track) return;
      void this.disableCamera();
      this.issue({
        code: "device-ended",
        device: "camera",
        recoverable: true,
        message:
          "The camera stopped or was unplugged. It is now off. Select a device and enable it again.",
      });
    });
    this.patch({
      localPreview: video,
      cameraEnabled: true,
      cameraRequestPending: false,
      syntheticCamera: synthetic,
    });
    this.rebuildVideos();
  }
  private async publishCamera(track: LocalVideoTrack) {
    const room = this.room;
    if (
      !room ||
      !this.snapshot.connected ||
      this.camera !== track ||
      !this.activeShow()
    ) {
      this.enforceSoloWindow();
      return;
    }
    const sdk = await this.sdk();
    if (!this.activeShow() || room !== this.room || this.camera !== track) {
      this.enforceSoloWindow();
      return;
    }
    await room.localParticipant.publishTrack(track, {
      name: MEDIA_TRACKS.camera,
      source: sdk.Track.Source.Camera,
      simulcast: true,
      videoEncoding: { maxBitrate: 1_800_000, maxFramerate: 30 },
    });
    if (
      room === this.room &&
      this.camera === track &&
      this.snapshot.connected &&
      this.activeShow()
    )
      this.patch({ cameraPublished: true });
    else {
      track.stop();
      await room.localParticipant
        .unpublishTrack(track, true)
        .catch(() => undefined);
    }
  }
  disableCamera = async () => {
    ++this.cameraGeneration;
    const track = this.camera;
    this.camera = null;
    this.cameraPlayback?.dispose();
    this.cameraPlayback = null;
    this.syntheticStop?.();
    this.syntheticStop = null;
    track?.stop();
    track?.detach().forEach((element) => {
      element.pause();
      element.srcObject = null;
      element.remove();
    });
    this.patch({
      localPreview: null,
      cameraEnabled: false,
      cameraRequestPending: false,
      cameraPublished: false,
      syntheticCamera: false,
    });
    if (this.options.slot) this.clearAnchors(this.options.slot);
    this.rebuildVideos();
    this.notifyPresence();
    if (track && this.room)
      await this.room.localParticipant
        .unpublishTrack(track, true)
        .catch(() => undefined);
  };

  enableMicrophone = async () => {
    if (this.enforceSoloWindow()) return;
    if (this.microphone || !this.ensureCaptureAllowed()) return;
    const generation = ++this.microphoneGeneration;
    try {
      const sdk = await this.sdk();
      if (generation !== this.microphoneGeneration || !this.activeShow()) {
        this.enforceSoloWindow();
        return;
      }
      const deviceId = this.snapshot.selectedDevices.audioinput;
      const track = await sdk.createLocalAudioTrack({
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      if (generation !== this.microphoneGeneration || !this.activeShow()) {
        track.stop();
        this.enforceSoloWindow();
        return;
      }
      this.microphone = track;
      track.once("ended", () => {
        if (this.microphone !== track) return;
        void this.disableMicrophone();
        this.issue({
          code: "device-ended",
          device: "microphone",
          recoverable: true,
          message:
            "The microphone stopped or was unplugged. It is now muted. Select a device and enable it again.",
        });
      });
      this.patch({
        microphoneEnabled: true,
        permissions: { ...this.snapshot.permissions, microphone: "granted" },
        error: null,
      });
      if (this.snapshot.capabilities.audioMix) {
        this.ensureMixer();
        this.syncAudioMix();
        this.resumeMixer();
      }
      const room = this.room;
      if (room && this.snapshot.connected) {
        await room.localParticipant.publishTrack(track, {
          name: MEDIA_TRACKS.microphone,
          source: sdk.Track.Source.Microphone,
        });
        if (
          this.microphone === track &&
          this.snapshot.connected &&
          this.room === room &&
          this.activeShow()
        )
          this.patch({ microphonePublished: true });
        else {
          track.stop();
          await room.localParticipant
            .unpublishTrack(track, true)
            .catch(() => undefined);
        }
      }
      await this.refreshDevices();
      this.notifyPresence();
    } catch (error) {
      if (generation !== this.microphoneGeneration) return;
      const issue = this.fail(error, "microphone");
      if (issue.code === "permission-denied")
        this.patch({
          permissions: { ...this.snapshot.permissions, microphone: "denied" },
        });
    }
  };
  disableMicrophone = async () => {
    ++this.microphoneGeneration;
    const track = this.microphone;
    this.microphone = null;
    track?.stop();
    if (this.options.slot) this.mixer?.removeInput(this.options.slot);
    this.patch({ microphoneEnabled: false, microphonePublished: false });
    this.notifyPresence();
    if (track && this.room)
      await this.room.localParticipant
        .unpublishTrack(track, true)
        .catch(() => undefined);
  };

  selectDevice = async (kind: MediaDeviceKind, deviceId: string) => {
    if (this.enforceSoloWindow()) return;
    this.patch({
      selectedDevices: { ...this.snapshot.selectedDevices, [kind]: deviceId },
    });
    try {
      if (
        kind === "videoinput" &&
        this.camera &&
        !this.snapshot.syntheticCamera
      ) {
        await this.camera.setDeviceId(deviceId ? { exact: deviceId } : "");
        this.hint(
          "Camera changed. Verify your crop and calibration before marking ready.",
        );
      }
      if (kind === "audioinput" && this.microphone) {
        await this.microphone.setDeviceId(deviceId ? { exact: deviceId } : "");
        this.syncAudioMix();
      }
      if (kind === "audiooutput") {
        const results = await Promise.allSettled([
          this.room?.switchActiveDevice(kind, deviceId),
          ...Array.from(this.remote.values()).map(({ audio }) =>
            audio?.setSinkId?.(deviceId),
          ),
        ]);
        if (results.some((result) => result.status === "rejected"))
          throw new Error("Audio output selection failed.");
      }
      this.patch({ error: null });
    } catch (error) {
      this.fail(
        error,
        kind === "videoinput"
          ? "camera"
          : kind === "audioinput"
            ? "microphone"
            : undefined,
      );
    }
  };

  connect = (): Promise<void> => {
    if (this.enforceSoloWindow()) return Promise.resolve();
    if (this.snapshot.connected) return Promise.resolve();
    if (this.connectTask) {
      if (this.snapshot.status === "connecting") return this.connectTask;
      return this.connectTask.then(() => this.connect());
    }
    if (this.room) return this.disconnect().then(() => this.connect());
    this.connectTask = this.doConnect().finally(() => {
      this.connectTask = null;
    });
    return this.connectTask;
  };
  private async doConnect() {
    if (this.enforceSoloWindow()) return;
    if (!this.activeShow()) return;
    if (
      this.options.show.mode === "solo" &&
      this.options.role !== "program" &&
      (this.options.role !== "director" || this.options.slot !== "A")
    ) {
      this.issue({
        code: "authorization",
        recoverable: false,
        message:
          "Solo media belongs to the consenting streamer in room A. The Audience Room does not join a media call.",
      });
      return;
    }
    if (
      this.options.show.mode === "rehearsal" &&
      !this.options.allowSyntheticMedia
    ) {
      this.issue({
        code: "authorization",
        recoverable: true,
        message:
          "This is a synthetic control rehearsal. Start a live show to connect real performers, or explicitly enable the local transport test.",
      });
      return;
    }
    const generation = ++this.generation;
    this.patch({ status: "connecting", error: null });
    // A new join always begins muted, even after a private microphone check.
    const hadMic = !!this.microphone;
    await this.disableMicrophone();
    if (hadMic)
      this.hint(
        "Joined with microphone muted. Enable it again when you are ready to be heard backstage.",
      );
    try {
      const purpose =
        this.options.role === "program" ? "output-view" : this.options.role;
      const [sdk, grant] = await Promise.all([
        this.sdk(),
        this.runtime.requestToken(this.options, purpose),
      ]);
      if (generation !== this.generation || !this.activeShow()) {
        this.enforceSoloWindow();
        return;
      }
      const room = new sdk.Room({
        adaptiveStream: false,
        dynacast: true,
        stopLocalTrackOnUnpublish: false,
        disconnectOnPageLeave: true,
        publishDefaults: { videoCodec: "vp8" },
      });
      this.room = room;
      this.bindRoom(room, sdk);
      await room.connect(grant.url, grant.token, { autoSubscribe: false });
      if (!this.activeShow()) {
        this.enforceSoloWindow();
        return;
      }
      if (generation !== this.generation || room !== this.room) {
        room.removeAllListeners();
        await room.disconnect(true);
        return;
      }
      this.patch({
        status: "connected",
        connected: true,
        audioBlocked: !room.canPlaybackAudio,
        error: null,
      });
      room.remoteParticipants.forEach((participant) =>
        this.subscribeParticipant(participant),
      );
      if (this.camera) await this.publishCamera(this.camera);
      this.notifyPresence();
    } catch (error) {
      if (generation !== this.generation) return;
      const room = this.room;
      this.room = null;
      room?.removeAllListeners();
      await room?.disconnect(false).catch(() => undefined);
      this.clearRemote();
      this.patch({
        connected: false,
        status: "error",
        cameraPublished: false,
        microphonePublished: false,
      });
      this.notifyPresence();
      this.fail(error);
    }
  }
  private bindRoom(room: Room, sdk: SDK) {
    room.on(sdk.RoomEvent.DataReceived, (bytes, participant, kind, topic) => {
      if (
        room !== this.room ||
        this.options.role === "program" ||
        !this.snapshot.connected ||
        topic !== ANCHOR_TOPIC ||
        kind !== sdk.DataPacket_Kind.LOSSY ||
        !participant ||
        room.remoteParticipants.get(participant.identity) !== participant
      )
        return;
      if (
        this.anchorReceiver.receive(
          bytes,
          participant,
          this.options.show,
          this.now(),
          this.runtime.now(),
        )
      )
        this.updateAnchors();
    });
    room.on(sdk.RoomEvent.TrackPublished, (publication, participant) =>
      this.subscribePublication(publication, participant),
    );
    room.on(sdk.RoomEvent.ParticipantConnected, (participant) =>
      this.subscribeParticipant(participant),
    );
    room.on(
      sdk.RoomEvent.ParticipantMetadataChanged,
      (_metadata, participant) => {
        if (participant !== room.localParticipant)
          this.subscribeParticipant(participant as RemoteParticipant);
      },
    );
    room.on(sdk.RoomEvent.TrackSubscribed, (track, publication, participant) =>
      this.attachRemote(track, publication, participant),
    );
    room.on(sdk.RoomEvent.TrackUnsubscribed, (_track, publication) =>
      this.removeRemote(publication.trackSid),
    );
    room.on(sdk.RoomEvent.ParticipantDisconnected, (participant) => {
      const slot = participantSlot(participant.metadata);
      if (slot) this.clearAnchors(slot);
      for (const [id, binding] of this.remote)
        if (binding.participant.identity === participant.identity)
          this.removeRemote(id);
      this.hint(
        "A performer left the media room. Their camera and audio have been removed; readmit them after they return.",
      );
    });
    room.on(sdk.RoomEvent.TrackMuted, () => {
      this.rebuildVideos();
      this.syncAudioMix();
    });
    room.on(sdk.RoomEvent.TrackUnmuted, () => {
      this.rebuildVideos();
      this.syncAudioMix();
    });
    room.on(sdk.RoomEvent.TrackSubscriptionFailed, () =>
      this.hint(
        "A media track could not be received. Check the connection and published track permissions.",
      ),
    );
    room.on(sdk.RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      if (participant === room.localParticipant)
        this.patch({ quality: quality as MediaQuality });
    });
    room.on(
      sdk.RoomEvent.TrackStreamStateChanged,
      (publication, streamState) => {
        const binding = this.remote.get(publication.trackSid);
        if (binding) {
          binding.serverPaused = streamState === sdk.Track.StreamState.Paused;
          this.rebuildVideos();
        }
        if (streamState === sdk.Track.StreamState.Paused)
          this.hint(
            "A feed is temporarily paused by the media server because bandwidth is constrained.",
          );
      },
    );
    room.on(sdk.RoomEvent.AudioPlaybackStatusChanged, (playing) =>
      this.patch({ audioBlocked: !playing }),
    );
    room.on(sdk.RoomEvent.VideoPlaybackStatusChanged, (playing) =>
      this.patch({ videoBlocked: !playing }),
    );
    room.on(sdk.RoomEvent.MediaDevicesError, (error, kind) =>
      this.fail(error, kind === "audioinput" ? "microphone" : "camera"),
    );
    const reconnecting = () => {
      if (this.room !== room) return;
      this.patch({ connected: false, status: "reconnecting", quality: "lost" });
      this.clearAnchors();
      this.syncRemoteAudioGates();
      // Stop synchronously, before any asynchronous unpublish or SDK track republish.
      void this.disableCamera();
      void this.disableMicrophone();
      this.clearRemote();
      void this.stopProgram();
      this.notifyPresence();
      this.hint(
        "Media is reconnecting. Camera and microphone are off; return backstage and explicitly enable them when the connection recovers.",
      );
    };
    room.on(sdk.RoomEvent.Reconnecting, reconnecting);
    room.on(sdk.RoomEvent.SignalReconnecting, reconnecting);
    room.on(sdk.RoomEvent.Reconnected, () => {
      if (this.room !== room) return;
      this.patch({ connected: true, status: "connected", quality: "unknown" });
      room.remoteParticipants.forEach((participant) => {
        this.subscribeParticipant(participant);
        participant.trackPublications.forEach((publication) => {
          if (publication.track)
            this.attachRemote(publication.track, publication, participant);
        });
      });
      this.notifyPresence();
      this.hint(
        "Media reconnected backstage. Enable devices, confirm Ready, and wait for director admission.",
      );
    });
    room.on(sdk.RoomEvent.Disconnected, () => {
      if (this.room !== room) return;
      this.room = null;
      room.removeAllListeners();
      this.patch({ connected: false, status: "disconnected", quality: "lost" });
      this.clearAnchors();
      this.syncRemoteAudioGates();
      void this.disableCamera();
      void this.disableMicrophone();
      this.clearRemote();
      void this.stopProgram();
      this.notifyPresence();
      this.hint(
        "The media room disconnected. Reconnect from backstage; devices will remain off until you enable them.",
      );
    });
  }

  private subscribeParticipant(participant: RemoteParticipant) {
    participant.trackPublications.forEach((publication) =>
      this.subscribePublication(publication, participant),
    );
  }
  private allowedPublication(
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ) {
    const slot = participantSlot(participant.metadata);
    if (this.options.show.mode === "solo" && slot === "B") return false;
    let allowed = false;
    if (this.options.role === "program")
      allowed =
        mayReceiveRendererMedia(
          this.options.show,
          participant,
          "output-publisher",
          this.now(),
        ) &&
        ((publication.trackName === MEDIA_TRACKS.programVideo &&
          publication.kind === "video" &&
          publication.source === "screen_share") ||
          (publication.trackName === MEDIA_TRACKS.programAudio &&
            publication.kind === "audio" &&
            publication.source === "screen_share_audio"));
    else if (publication.trackName === MEDIA_TRACKS.returnVideo)
      allowed =
        this.options.role === "performer" &&
        slot === "A" &&
        mayReceiveRendererMedia(
          this.options.show,
          participant,
          "director",
          this.now(),
        ) &&
        publication.kind === "video" &&
        publication.source === "screen_share";
    else if (
      slot &&
      slot !== this.options.slot &&
      (slot !== "A" ||
        mayReceiveRendererMedia(
          this.options.show,
          participant,
          "director",
          this.now(),
        ))
    ) {
      allowed =
        (publication.source === "camera" && this.options.role === "director") ||
        publication.source === "microphone";
    }
    return allowed;
  }
  private subscribePublication(
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ) {
    const allowed = this.allowedPublication(publication, participant);
    publication.setSubscribed(allowed);
    if (!allowed) this.removeRemote(publication.trackSid);
    else if (publication.track && publication.isSubscribed)
      this.attachRemote(publication.track, publication, participant);
  }
  private revalidateRemote() {
    for (const [id, binding] of this.remote) {
      if (this.allowedPublication(binding.publication, binding.participant))
        continue;
      binding.publication.setSubscribed(false);
      this.removeRemote(id);
    }
  }
  private makeVideo() {
    const video = document.createElement("video");
    initializeMutedVideo(video);
    video.dataset.portalDecoder = "true";
    return video;
  }
  private attachRemote(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ) {
    if (this.remote.has(publication.trackSid)) return;
    if (!this.allowedPublication(publication, participant)) {
      publication.setSubscribed(false);
      return;
    }
    const binding: RemoteBinding = {
      track,
      publication,
      participant,
      slot: participantSlot(participant.metadata),
    };
    if (track.kind === "video") {
      binding.video = this.makeVideo();
      binding.lastVideoTime = binding.video.currentTime;
      binding.lastFrameAt = this.runtime.now();
      track.attach(binding.video);
      void binding.video.play().catch(() => this.patch({ videoBlocked: true }));
    } else if (track.kind === "audio") {
      binding.audio = document.createElement("audio");
      binding.audio.autoplay = true;
      binding.audio.muted = true;
      binding.audio.style.display = "none";
      binding.audio.dataset.portalAudio =
        this.options.role === "program" ? "program-mix" : "direct-call";
      document.body.appendChild(binding.audio);
      const sink = this.snapshot.selectedDevices.audiooutput;
      if (sink)
        void binding.audio
          .setSinkId?.(sink)
          .catch(() =>
            this.hint(
              "Audio output selection could not be applied to the new track.",
            ),
          );
    }
    this.remote.set(publication.trackSid, binding);
    this.syncRemoteAudioGates();
    this.rebuildVideos();
    this.syncAudioMix();
  }
  private removeRemote(id: string) {
    const binding = this.remote.get(id);
    if (!binding) return;
    if (binding.slot) this.mixer?.removeInput(binding.slot);
    binding.track.detach().forEach((element) => {
      element.pause();
      element.srcObject = null;
      element.remove();
    });
    if (binding.audio) {
      binding.audio.muted = true;
      binding.audio.pause();
      binding.audio.srcObject = null;
      binding.audio.remove();
    }
    this.remote.delete(id);
    this.rebuildVideos();
    this.syncAudioMix();
  }
  private clearRemote() {
    for (const id of Array.from(this.remote.keys())) this.removeRemote(id);
  }
  private checkVideoLiveness() {
    let changed = false;
    const now = this.runtime.now();
    for (const binding of this.remote.values()) {
      if (!binding.video) continue;
      if (binding.video.currentTime !== binding.lastVideoTime) {
        binding.lastVideoTime = binding.video.currentTime;
        binding.lastFrameAt = now;
        if (binding.stalled) {
          binding.stalled = false;
          changed = true;
        }
      } else if (
        !binding.stalled &&
        now - (binding.lastFrameAt ?? now) > 4000
      ) {
        binding.stalled = true;
        changed = true;
        this.hint(
          "A video feed stopped delivering frames. Its aperture is hidden until live frames return.",
        );
      }
    }
    if (changed) this.rebuildVideos();
  }
  private rebuildVideos() {
    const videos: Record<Slot, HTMLVideoElement | null> = { A: null, B: null };
    let programVideo: HTMLVideoElement | null = null;
    if (
      this.options.slot &&
      this.camera &&
      (this.options.show.mode !== "solo" ||
        (this.options.role === "director" && this.options.slot === "A"))
    )
      videos[this.options.slot] = this.snapshot.localPreview;
    for (const {
      video,
      publication,
      participant,
      track,
      slot,
      serverPaused,
      stalled,
    } of this.remote.values()) {
      if (
        !video ||
        track.isMuted ||
        publication.isMuted ||
        serverPaused ||
        stalled ||
        !this.allowedPublication(publication, participant)
      )
        continue;
      if (
        publication.trackName === MEDIA_TRACKS.returnVideo ||
        publication.trackName === MEDIA_TRACKS.programVideo
      )
        programVideo = video;
      else if (publication.source === "camera" && slot) videos[slot] = video;
    }
    this.patch({ videos, programVideo });
  }
  private ensureMixer() {
    return (this.mixer ??= this.runtime.makeMixer());
  }
  private resumeMixer() {
    const mixer = this.mixer;
    if (!mixer) return;
    // resume() may remain pending until a later user gesture. Never block track publication.
    void mixer
      .resume()
      .then(() => {
        if (mixer === this.mixer)
          this.patch({
            audioBlocked:
              !!this.room &&
              (!this.room.canPlaybackAudio ||
                mixer.context.state === "suspended"),
          });
      })
      .catch(() => this.patch({ audioBlocked: true }));
    if (mixer.context.state === "suspended") this.patch({ audioBlocked: true });
  }
  private syncAudioMix() {
    if (!this.mixer) return;
    for (const slot of ["A", "B"] as const) {
      const remoteMic = Array.from(this.remote.values()).find(
        (binding) =>
          binding.slot === slot &&
          binding.publication.source === "microphone" &&
          !binding.track.isMuted &&
          !binding.publication.isMuted,
      );
      const track =
        slot === this.options.slot
          ? this.microphone?.mediaStreamTrack
          : remoteMic?.track.mediaStreamTrack;
      this.mixer.setInput(slot, track ?? null);
      this.mixer.setAdmitted(
        slot,
        this.options.role === "director" &&
          this.authority() &&
          this.snapshot.connected &&
          mayMixSlot(this.options.show, slot),
      );
    }
  }
  private canSendAnchor() {
    const slot = this.options.slot;
    return (
      !!slot &&
      this.options.role !== "program" &&
      this.snapshot.connected &&
      this.snapshot.cameraPublished &&
      activeAnchorSlot(this.options.show, slot, this.now()) &&
      (this.options.role !== "director" || this.authority())
    );
  }
  /** Immediate local presentation plus one bounded, lossy private-room sample. */
  sendAnchor = (point: Point): void => {
    if (!validAnchor(point) || !this.canSendAnchor() || !this.options.slot)
      return;
    this.anchorReceiver.local(
      this.options.slot,
      point,
      this.options.show,
      this.now(),
      this.runtime.now(),
    );
    this.updateAnchors();
    if (this.options.show.mode === "solo") return;
    this.anchorPending = {
      point: { ...point },
      epoch: this.options.show.epoch,
      capturedAt: Math.round(this.now()),
      localAt: this.runtime.now(),
    };
    this.scheduleAnchor();
  };
  private scheduleAnchor() {
    if (this.anchorFlight && this.anchorFlightRoom !== this.room) {
      this.anchorFlight = null;
      this.anchorFlightRoom = null;
    }
    if (this.anchorFlight || this.anchorTimer || !this.anchorPending) return;
    const wait =
      ANCHOR_LIMITS.sendIntervalMs -
      (this.runtime.now() - this.anchorLastSentAt);
    if (wait > 0)
      this.anchorTimer = setTimeout(() => {
        this.anchorTimer = null;
        this.flushAnchor();
      }, wait);
    else this.flushAnchor();
  }
  private flushAnchor() {
    if (
      this.anchorFlight ||
      !this.anchorPending ||
      !this.canSendAnchor() ||
      !this.room ||
      !this.options.slot
    )
      return;
    const sample = this.anchorPending;
    this.anchorPending = null;
    const generation = this.anchorGeneration,
      room = this.room,
      slot = this.options.slot;
    const task = (async () => {
      await this.sdk();
      if (
        generation !== this.anchorGeneration ||
        room !== this.room ||
        sample.epoch !== this.options.show.epoch ||
        this.runtime.now() - sample.localAt > ANCHOR_LIMITS.maxAgeMs ||
        !this.canSendAnchor()
      )
        return;
      const bytes = encodeAnchor({
        v: 1,
        showId: this.options.show.id,
        epoch: sample.epoch,
        seq: ++this.anchorSequence,
        sentAt: sample.capturedAt,
        slot,
        point: sample.point,
      });
      if (!bytes) return;
      this.anchorLastSentAt = this.runtime.now();
      const destinationIdentities = [
        slot === "B"
          ? rendererMediaIdentity(
              this.options.show.id,
              sample.epoch,
              "director",
              this.options.show.renderLease.incarnationId,
            )
          : `performer-${this.options.show.id}-B`,
      ];
      try {
        await room.localParticipant.publishData(bytes, {
          reliable: false,
          topic: ANCHOR_TOPIC,
          destinationIdentities,
        });
      } catch {
        /* Expendable coordinates never block a cue or retry as durable state. */
      }
    })().finally(() => {
      if (this.anchorFlight === task) {
        this.anchorFlight = null;
        this.anchorFlightRoom = null;
        this.scheduleAnchor();
      }
    });
    this.anchorFlight = task;
    this.anchorFlightRoom = room;
  }
  private clearAnchors(slot?: Slot) {
    this.anchorReceiver.clear(slot);
    if (!slot || slot === this.options.slot) {
      ++this.anchorGeneration;
      this.anchorPending = null;
      this.anchorLastSentAt = -Infinity;
      if (this.anchorTimer) clearTimeout(this.anchorTimer);
      this.anchorTimer = null;
    }
    this.updateAnchors();
  }
  private updateAnchors() {
    const transient = this.anchorReceiver.current(
      this.options.show,
      this.now(),
      this.runtime.now(),
    );
    const anchors = {
      A: transient.A ??
        this.options.show.participants.A.anchor ?? { x: 0.65, y: 0.48 },
      B: transient.B ??
        this.options.show.participants.B.anchor ?? { x: 0.35, y: 0.48 },
    };
    const samePoint = (a: Point | null, b: Point | null) =>
      a === b || (!!a && !!b && a.x === b.x && a.y === b.y);
    if (
      !["A", "B"].every((key) => {
        const slot = key as Slot;
        return (
          samePoint(this.snapshot.anchors[slot], anchors[slot]) &&
          samePoint(this.snapshot.transientAnchors[slot], transient[slot])
        );
      })
    )
      this.patch({ anchors, transientAnchors: transient });
  }
  private syncRemoteAudioGates() {
    for (const binding of this.remote.values()) {
      if (!binding.audio) continue;
      const allowed =
        this.snapshot.connected &&
        (this.options.role === "program"
          ? binding.publication.trackName === MEDIA_TRACKS.programAudio &&
            mayPlayProgramAudio(
              this.options.show,
              binding.participant,
              this.now(),
            )
          : this.allowedPublication(binding.publication, binding.participant));
      if (allowed && !binding.audioAttached) {
        binding.audio.muted = false;
        binding.track.attach(binding.audio);
        binding.audioAttached = true;
      } else if (!allowed) {
        binding.audio.muted = true;
        if (binding.audioAttached) binding.track.detach(binding.audio);
        binding.audioAttached = false;
        binding.audio.pause();
        binding.audio.srcObject = null;
      }
    }
  }
  private notifyPresence() {
    if (
      this.options.role === "program" ||
      !this.options.slot ||
      !this.options.onPresence
    )
      return;
    const presence: MediaPresence = {
      connected: this.snapshot.connected,
      camera: this.snapshot.connected && this.snapshot.cameraPublished,
      microphone: this.snapshot.connected && this.snapshot.microphonePublished,
    };
    this.presenceReporter.report(presence);
  }

  startAudio = async () => {
    if (this.enforceSoloWindow()) return;
    this.syncRemoteAudioGates();
    try {
      const [, , localPlayback] = await Promise.all([
        this.room?.startAudio(),
        this.room?.startVideo(),
        this.cameraPlayback?.resume(),
        this.mixer?.resume(),
      ]);
      this.patch({
        audioBlocked: this.room
          ? !this.room.canPlaybackAudio ||
            this.mixer?.context.state === "suspended"
          : false,
        videoBlocked: localPlayback === false && this.snapshot.videoBlocked,
      });
      this.syncRemoteAudioGates();
    } catch {
      this.patch({ audioBlocked: true });
      this.hint(
        "Audio is blocked by the browser. Select Start audio again while this tab is active.",
      );
    }
  };

  publishProgram = (canvas: HTMLCanvasElement): Promise<void> => {
    if (this.enforceSoloWindow()) return Promise.resolve();
    if (
      this.programCanvas === canvas &&
      (this.programTask || this.snapshot.programPublishing)
    )
      return this.programTask ?? Promise.resolve();
    if (this.programTask)
      return this.programTask.then(() => this.publishProgram(canvas));
    const task = this.doPublishProgram(canvas).finally(() => {
      if (this.programTask === task) this.programTask = null;
    });
    this.programTask = task;
    return task;
  };
  private async doPublishProgram(canvas: HTMLCanvasElement) {
    if (
      !this.authority() ||
      !this.snapshot.connected ||
      this.options.role !== "director"
    ) {
      this.issue({
        code: "stale-renderer",
        recoverable: true,
        message:
          "Program needs the active director lease and backstage connection before it can publish.",
      });
      return;
    }
    if (!canvas.captureStream || !this.snapshot.capabilities.audioMix) {
      this.issue({
        code: "unsupported",
        recoverable: false,
        message:
          "This browser cannot capture the stage canvas and mix audio. Use a current desktop browser for the director.",
      });
      return;
    }
    await this.stopProgram();
    const generation = this.programGeneration;
    this.programCanvas = canvas;
    this.patch({ programStatus: "connecting", error: null });
    try {
      const [sdk, grant] = await Promise.all([
        this.sdk(),
        this.runtime.requestToken(this.options, "output-publish"),
      ]);
      if (generation !== this.programGeneration || !this.authority()) {
        this.enforceSoloWindow();
        return;
      }
      const output = new sdk.Room({
        adaptiveStream: false,
        stopLocalTrackOnUnpublish: false,
        disconnectOnPageLeave: true,
      });
      this.outputRoom = output;
      output.on(sdk.RoomEvent.Reconnecting, () => {
        if (this.outputRoom === output) {
          void this.stopProgram();
          this.patch({ programStatus: "error" });
          this.hint(
            "Program transport was interrupted. Verify the stage and publish again after recovery.",
          );
        }
      });
      output.on(sdk.RoomEvent.Disconnected, () => {
        if (this.outputRoom === output) {
          void this.stopProgram();
          this.patch({ programStatus: "error" });
        }
      });
      await output.connect(grant.url, grant.token, { autoSubscribe: false });
      if (
        generation !== this.programGeneration ||
        !this.authority() ||
        !this.room ||
        !this.snapshot.connected
      ) {
        await this.stopProgram();
        return;
      }
      this.captureStream = canvas.captureStream(30);
      const captured = this.captureStream.getVideoTracks()[0];
      if (!captured)
        throw new Error("The canvas did not produce a video track.");
      captured.contentHint = "motion";
      this.returnTrack = new sdk.LocalVideoTrack(captured, undefined, true);
      this.programTrack = new sdk.LocalVideoTrack(
        captured.clone(),
        undefined,
        true,
      );
      const mixer = this.ensureMixer();
      this.syncAudioMix();
      this.resumeMixer();
      this.programAudio = new sdk.LocalAudioTrack(
        mixer.destination.stream.getAudioTracks()[0].clone(),
        undefined,
        true,
      );
      await this.room.localParticipant.publishTrack(this.returnTrack, {
        name: MEDIA_TRACKS.returnVideo,
        source: sdk.Track.Source.ScreenShare,
        videoCodec: "vp8",
        simulcast: false,
        videoEncoding: { maxBitrate: 2_500_000, maxFramerate: 30 },
      });
      if (generation !== this.programGeneration || !this.authority()) {
        await this.stopProgram();
        return;
      }
      await output.localParticipant.publishTrack(this.programTrack, {
        name: MEDIA_TRACKS.programVideo,
        source: sdk.Track.Source.ScreenShare,
        videoCodec: "vp8",
        simulcast: false,
        videoEncoding: { maxBitrate: 6_000_000, maxFramerate: 30 },
      });
      if (generation !== this.programGeneration || !this.authority()) {
        await this.stopProgram();
        return;
      }
      await output.localParticipant.publishTrack(this.programAudio, {
        name: MEDIA_TRACKS.programAudio,
        source: sdk.Track.Source.ScreenShareAudio,
      });
      if (generation !== this.programGeneration || !this.authority()) {
        await this.stopProgram();
        return;
      }
      this.patch({ programPublishing: true, programStatus: "publishing" });
    } catch (error) {
      if (generation !== this.programGeneration) return;
      await this.stopProgram();
      this.patch({ programStatus: "error" });
      this.fail(error);
    }
  }
  stopProgram = async () => {
    ++this.programGeneration;
    this.programCanvas = null;
    const output = this.outputRoom;
    this.outputRoom = null;
    output?.removeAllListeners();
    const returnTrack = this.returnTrack;
    const programTrack = this.programTrack;
    const programAudio = this.programAudio;
    this.returnTrack = null;
    this.programTrack = null;
    this.programAudio = null;
    returnTrack?.stop();
    programTrack?.stop();
    programAudio?.stop();
    this.captureStream?.getTracks().forEach((track) => track.stop());
    this.captureStream = null;
    this.mixer?.setAdmitted("A", false);
    this.mixer?.setAdmitted("B", false);
    this.patch({ programPublishing: false, programStatus: "idle" });
    await Promise.allSettled([
      returnTrack && this.room
        ? this.room.localParticipant.unpublishTrack(returnTrack, true)
        : undefined,
      programTrack && output
        ? output.localParticipant.unpublishTrack(programTrack, true)
        : undefined,
      programAudio && output
        ? output.localParticipant.unpublishTrack(programAudio, true)
        : undefined,
    ]);
    await output?.disconnect(true).catch(() => undefined);
  };
  disconnect = async () => {
    ++this.generation;
    this.patch({ connected: false, status: "disconnected" });
    this.clearAnchors();
    this.syncRemoteAudioGates();
    this.notifyPresence();
    const room = this.room;
    room?.removeAllListeners();
    // These methods stop capture synchronously before awaiting provider cleanup.
    const cameraOff = this.disableCamera();
    const microphoneOff = this.disableMicrophone();
    const outputOff = this.stopProgram();
    this.room = null;
    this.clearRemote();
    const mixer = this.mixer;
    this.mixer = null;
    await Promise.allSettled([cameraOff, microphoneOff, outputOff]);
    await room?.disconnect(true).catch(() => undefined);
    await mixer?.close().catch(() => undefined);
    this.patch({
      audioLevels: { A: 0, B: 0, program: 0 },
      audioBlocked: false,
      videoBlocked: false,
      quality: "unknown",
    });
  };
  destroy = async () => {
    this.mounted = false;
    navigator.mediaDevices?.removeEventListener?.(
      "devicechange",
      this.onDeviceChange,
    );
    window.removeEventListener("pagehide", this.onPageHide);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.permissionCleanups.splice(0).forEach((cleanup) => cleanup());
    if (this.tick) clearInterval(this.tick);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.tick = null;
    this.heartbeat = null;
    await this.disconnect();
  };
}
