"use client";
import { useState } from "react";
import {
  Camera,
  CameraOff,
  Hand,
  Headphones,
  Mic,
  MicOff,
  Move,
  PlugZap,
  ShieldCheck,
  Video,
} from "lucide-react";
import type {
  Point,
  ShowAction,
  ShowEnvelope,
  ShowState,
  Slot,
} from "@/lib/contracts";
import { useMediaRoom } from "@/media/use-media-room";
import { VideoSurface } from "@/media/video-surface";
import {
  apertureCalibration,
  rawRectToMirroredAperture,
  type GestureCalibration,
} from "@/vision/calibration";
import { StatusPill } from "./ui";
export type MediaRoom = ReturnType<typeof useMediaRoom>;
export function DeviceSetup({
  show,
  slot,
  media,
  run,
  busy,
  onCalibrated,
  cueCalibration,
}: {
  show: ShowState;
  slot: Slot;
  media: MediaRoom;
  run: (action: ShowAction) => Promise<ShowEnvelope | null>;
  busy: boolean;
  onCalibrated?: (value: GestureCalibration | null) => void;
  cueCalibration?: GestureCalibration | null;
}) {
  const participant = show.participants[slot];
  const onAir = participant.admitted && show.phase === "live";
  const dimensions = {
    videoWidth: media.localPreview?.videoWidth || 0,
    videoHeight: media.localPreview?.videoHeight || 0,
  };
  const cueRegion = cueCalibration
    ? rawRectToMirroredAperture(cueCalibration.offerRegion, dimensions)
    : null;
  const [broadcast, setBroadcast] = useState(participant.consentBroadcast),
    [recording, setRecording] = useState(participant.consentRecording),
    [handedness, setHandedness] = useState(participant.handedness),
    [point, setPoint] = useState<Point>({
      x: Math.max(0.16, Math.min(0.84, 1 - participant.anchor.x)),
      y: Math.max(0.3, Math.min(0.72, participant.anchor.y)),
    }),
    [confirmed, setConfirmed] = useState(false);
  async function confirm() {
    const consent = await run({ type: "consent", broadcast, recording, slot });
    if (!consent) return;
    const framed = await run({
      type: "calibrate",
      anchor: { x: 1 - point.x, y: point.y },
      handedness,
      slot,
    });
    if (framed) {
      setConfirmed(true);
      const calibrated = apertureCalibration({
        slot,
        handedness,
        videoWidth: media.localPreview?.videoWidth || 0,
        videoHeight: media.localPreview?.videoHeight || 0,
      });
      if (calibrated) onCalibrated?.(calibrated);
    }
  }
  function movePoint(e: React.PointerEvent<HTMLButtonElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const rect = e.currentTarget.parentElement!.getBoundingClientRect();
    setPoint({
      x: Math.max(0.16, Math.min(0.84, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0.3, Math.min(0.72, (e.clientY - rect.top) / rect.height)),
    });
    setConfirmed(false);
    onCalibrated?.(null);
  }
  return (
    <div className="device-setup">
      <div className="private-preview-label">
        <span>
          <ShieldCheck size={15} /> YOUR PRIVATE PREVIEW
        </span>
        <StatusPill tone={onAir && broadcast ? "coral" : "muted"}>
          {onAir && broadcast ? "On air" : "Backstage"}
        </StatusPill>
      </div>
      <div className="calibration-preview">
        {media.localPreview ? (
          <VideoSurface
            video={media.localPreview}
            mirrored
            label="Your private mirrored camera preview"
          />
        ) : (
          <div className="camera-placeholder">
            <Video size={31} strokeWidth={1} />
            <span>Your camera starts with you.</span>
            <small>Enable it below to see your private framing.</small>
          </div>
        )}
        <div className="calibration-safe-area" aria-hidden="true" />
        {cueRegion ? (
          <div
            className="hand-cue-region"
            style={{
              left: `${cueRegion.x * 100}%`,
              top: `${cueRegion.y * 100}%`,
              width: `${cueRegion.width * 100}%`,
              height: `${cueRegion.height * 100}%`,
            }}
          >
            <Hand size={22} />
            <span>CUE HERE</span>
          </div>
        ) : null}
        <button
          className="anchor-marker"
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
          aria-label="Umbrella anchor. Drag or use arrow keys to position."
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            movePoint(e);
          }}
          onPointerMove={movePoint}
          onKeyDown={(e) => {
            const directions: Record<string, Point> = {
              ArrowLeft: { x: -0.04, y: 0 },
              ArrowRight: { x: 0.04, y: 0 },
              ArrowUp: { x: 0, y: -0.04 },
              ArrowDown: { x: 0, y: 0.04 },
            };
            const d = directions[e.key];
            if (!d) return;
            e.preventDefault();
            setPoint((p) => ({
              x: Math.max(0.16, Math.min(0.84, p.x + d.x)),
              y: Math.max(0.3, Math.min(0.72, p.y + d.y)),
            }));
            setConfirmed(false);
            onCalibrated?.(null);
          }}
        >
          <Move size={19} />
        </button>
        <span className="preview-mirror-label">
          MIRRORED PREVIEW · PROGRAM IS NOT MIRRORED
        </span>
      </div>
      <div className="device-buttons">
        <button
          className={`button button-dark ${media.cameraEnabled ? "device-on" : ""}`}
          onClick={() => {
            void (
              media.cameraEnabled ? media.disableCamera() : media.enableCamera()
            ).catch(() => undefined);
          }}
        >
          {media.cameraEnabled ? <CameraOff size={17} /> : <Camera size={17} />}{" "}
          {media.cameraEnabled ? "Turn camera off" : "Enable camera"}
        </button>
        <button
          className={`button button-dark ${media.microphoneEnabled ? "device-on" : ""}`}
          onClick={() => {
            void (
              media.microphoneEnabled
                ? media.disableMicrophone()
                : media.enableMicrophone()
            ).catch(() => undefined);
          }}
        >
          {media.microphoneEnabled ? <MicOff size={17} /> : <Mic size={17} />}{" "}
          {media.microphoneEnabled ? "Mute microphone" : "Enable microphone"}
        </button>
      </div>
      {media.devices.length ? (
        <div className="field-two-columns device-selectors">
          <label className="field-label">
            Camera
            <select
              value={media.selectedDevices.videoinput || ""}
              onChange={(e) => {
                void media
                  .selectDevice("videoinput", e.target.value)
                  .catch(() => undefined);
              }}
            >
              <option value="">Default camera</option>
              {media.devices
                .filter((d) => d.kind === "videoinput")
                .map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || "Camera"}
                  </option>
                ))}
            </select>
          </label>
          <label className="field-label">
            Microphone
            <select
              value={media.selectedDevices.audioinput || ""}
              onChange={(e) => {
                void media
                  .selectDevice("audioinput", e.target.value)
                  .catch(() => undefined);
              }}
            >
              <option value="">Default microphone</option>
              {media.devices
                .filter((d) => d.kind === "audioinput")
                .map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || "Microphone"}
                  </option>
                ))}
            </select>
          </label>
        </div>
      ) : null}
      <div className="calibration-instruction">
        <Hand size={20} />
        <p>
          Frame your shoulders in the arch. Place your hand at the marker, or
          move it with the arrow keys. Buttons work from any seated position.
        </p>
      </div>
      <label className="field-label">
        Your cue hand
        <select
          value={handedness}
          onChange={(e) => {
            setHandedness(e.target.value as "left" | "right");
            setConfirmed(false);
            onCalibrated?.(null);
          }}
        >
          <option value="right">Right hand</option>
          <option value="left">Left hand</option>
        </select>
      </label>
      <div className="consent-block">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={broadcast}
            onChange={(e) => {
              const checked = e.target.checked;
              setBroadcast(checked);
              setConfirmed(false);
              if (!checked) {
                void media.disableCamera().catch(() => undefined);
                void media.disableMicrophone().catch(() => undefined);
                void run({
                  type: "consent",
                  broadcast: false,
                  recording,
                  slot,
                });
              }
            }}
          />
          <span>
            I allow the host to show my camera and voice{" "}
            {show.channel ? (
              <>
                on <strong>twitch.tv/{show.channel}</strong>
              </>
            ) : (
              "in this show’s Program"
            )}
            . I enter backstage first.
          </span>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={recording}
            onChange={(e) => {
              const checked = e.target.checked;
              setRecording(checked);
              setConfirmed(false);
              void run({
                type: "consent",
                broadcast: participant.consentBroadcast && broadcast,
                recording: checked,
                slot,
              });
            }}
          />
          <span>
            Separately, I allow my performance to appear in the project’s demo
            recording.{" "}
            <small>Optional. This app does not start a recording.</small>
          </span>
        </label>
      </div>
      <button
        className="button button-teal full-width"
        disabled={busy || !broadcast}
        onClick={() => void confirm()}
      >
        <ShieldCheck size={17} />
        {confirmed
          ? "Framing & consent confirmed"
          : "Confirm framing & consent"}
      </button>
      <div className="join-room-step">
        <p>
          <Headphones size={15} /> Headphones help keep your voices clear.
        </p>
        <button
          className="button button-dark full-width"
          disabled={
            media.status === "connecting" ||
            !participant.consentBroadcast ||
            !participant.calibrated
          }
          onClick={() => {
            void (media.connected ? media.disconnect() : media.connect()).catch(
              () => undefined,
            );
          }}
        >
          <PlugZap size={17} />
          {media.connected
            ? "Disconnect media room"
            : media.status === "connecting"
              ? "Joining the media room…"
              : "Join the media room"}
        </button>
        <span className="field-help">
          {media.connected
            ? "Your microphone is held muted on connection. Enable it explicitly when you are ready."
            : "Confirmed framing and broadcast permission are required to connect."}
        </span>
      </div>
      {media.error ? (
        <p className="panel-error" role="alert">
          {media.error.message}
        </p>
      ) : null}
    </div>
  );
}
