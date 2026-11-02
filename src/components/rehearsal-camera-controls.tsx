"use client";

import { useId, useState } from "react";
import {
  Camera,
  CameraOff,
  Check,
  Hand,
  Move,
  ShieldCheck,
} from "lucide-react";
import type { Point } from "@/lib/contracts";
import type { MediaIssue } from "@/media/types";
import { VideoSurface } from "@/media/video-surface";
import type { useGestureInput } from "@/vision/use-gesture-input";
import {
  apertureCalibration,
  calibrationMatchesVideo,
  rawRectToMirroredAperture,
  type GestureCalibration,
} from "@/vision/calibration";
import { CameraPermissionNotice } from "./camera-permission-notice";
import { StatusPill } from "./ui";

type CameraState = {
  preview: HTMLVideoElement | null;
  enabled: boolean;
  pending: boolean;
  error: MediaIssue | null;
  videoBlocked: boolean;
  enable: () => Promise<void>;
  disable: () => void;
  resume: () => Promise<boolean>;
};

export function RehearsalCameraControls({
  camera,
  consented,
  onConsent,
  anchor,
  onAnchor,
  calibration,
  onCalibrated,
  gesture,
  armed,
  onArmed,
  locked,
  canOffer,
  canAccept,
  onOffer,
  onAccept,
  acceptLabel = "Accept the prop",
}: {
  camera: CameraState;
  consented: boolean;
  onConsent: (value: boolean) => void;
  anchor: Point;
  onAnchor: (value: Point) => void;
  calibration: GestureCalibration | null;
  onCalibrated: (value: GestureCalibration | null) => void;
  gesture: ReturnType<typeof useGestureInput>;
  armed: boolean;
  onArmed: (value: boolean) => void;
  locked: boolean;
  canOffer: boolean;
  canAccept: boolean;
  onOffer: () => void;
  onAccept: () => void;
  acceptLabel?: string;
}) {
  const consentId = useId();
  const armId = useId();
  const [handedness, setHandedness] = useState<"left" | "right">(
    calibration?.handedness ?? "left",
  );
  const [framingError, setFramingError] = useState("");
  const dimensions = {
    videoWidth: camera.preview?.videoWidth || 0,
    videoHeight: camera.preview?.videoHeight || 0,
  };
  const calibrated =
    !!calibration && calibrationMatchesVideo(calibration, dimensions);
  const cueRegion =
    calibrated && calibration
      ? rawRectToMirroredAperture(calibration.offerRegion, dimensions)
      : null;

  function stop() {
    camera.disable();
    gesture.disable();
    onArmed(false);
    onCalibrated(null);
    setFramingError("");
  }
  function move(point: Point) {
    onAnchor({
      x: Math.max(0.16, Math.min(0.84, point.x)),
      y: Math.max(0.3, Math.min(0.72, point.y)),
    });
    onCalibrated(null);
    onArmed(false);
  }
  function movePointer(event: React.PointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const rect = event.currentTarget.parentElement!.getBoundingClientRect();
    move({
      x: 1 - (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    });
  }
  function confirmFraming() {
    const next = apertureCalibration({ slot: "A", handedness, ...dimensions });
    if (!next) {
      setFramingError(
        "Wait for a camera picture, then confirm the framing again.",
      );
      return;
    }
    setFramingError("");
    onCalibrated(next);
    onArmed(false);
  }

  return (
    <div className="local-camera-controls">
      <div className="local-camera-privacy">
        <ShieldCheck size={21} aria-hidden="true" />
        <p>
          Your camera stays in this browser. This rehearsal requests no
          microphone and joins no media room. Camera frames and hand landmarks
          are not uploaded; Offer and Accept cues still update the show server.
        </p>
      </div>
      <label className="checkbox-label" htmlFor={consentId}>
        <input
          id={consentId}
          type="checkbox"
          checked={consented}
          onChange={(event) => {
            if (!event.target.checked) stop();
            onConsent(event.target.checked);
          }}
        />
        <span>
          I choose to preview my camera here and optionally use local hand cues.
        </span>
      </label>
      <div className="calibration-preview local-camera-preview">
        {camera.preview ? (
          <VideoSurface
            video={camera.preview}
            mirrored
            label="Local rehearsal camera, mirrored preview. Not uploaded."
          />
        ) : (
          <div className="camera-placeholder">
            <Camera size={32} strokeWidth={1.3} />
            <span>Camera off</span>
          </div>
        )}
        {camera.preview ? (
          <>
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
                <Hand size={22} aria-hidden="true" />
                <span>CUE HERE</span>
              </div>
            ) : null}
            <button
              className="anchor-marker"
              style={{
                left: `${(1 - anchor.x) * 100}%`,
                top: `${anchor.y * 100}%`,
              }}
              aria-label="Local prop anchor. Drag or use arrow keys to position."
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                movePointer(event);
              }}
              onPointerMove={movePointer}
              onKeyDown={(event) => {
                const delta: Record<string, Point> = {
                  ArrowLeft: { x: 0.04, y: 0 },
                  ArrowRight: { x: -0.04, y: 0 },
                  ArrowUp: { x: 0, y: -0.04 },
                  ArrowDown: { x: 0, y: 0.04 },
                };
                const change = delta[event.key];
                if (!change) return;
                event.preventDefault();
                move({ x: anchor.x + change.x, y: anchor.y + change.y });
              }}
            >
              <Move size={19} aria-hidden="true" />
            </button>
          </>
        ) : null}
        <span
          className="preview-mirror-label"
          title="Mirrored preview; the stage is not mirrored"
        >
          Mirrored
        </span>
      </div>
      <CameraPermissionNotice pending={camera.pending} onCancel={stop} />
      <div className="local-camera-actions">
        <button
          className="button button-dark"
          disabled={!camera.enabled && (!consented || camera.pending || locked)}
          onClick={() => {
            if (camera.enabled) stop();
            else void camera.enable();
          }}
        >
          {camera.enabled ? <CameraOff size={17} /> : <Camera size={17} />}
          {camera.enabled ? "Turn local camera off" : "Enable local camera"}
        </button>
        {camera.videoBlocked ? (
          <button
            className="button button-teal"
            onClick={() => void camera.resume()}
          >
            Enable camera playback
          </button>
        ) : null}
      </div>
      {camera.pending ? (
        <p className="field-help">
          Your browser may keep its permission dialog open after cancellation. A
          late permission grant will be stopped.
        </p>
      ) : null}
      {camera.error ? (
        <p className="panel-error" role="alert">
          {camera.error.message}
        </p>
      ) : null}
      <div className="local-camera-framing">
        <label className="field-label">
          Your cue hand
          <select
            value={handedness}
            onChange={(event) => {
              setHandedness(event.target.value as "left" | "right");
              onCalibrated(null);
              onArmed(false);
            }}
          >
            <option value="right">Right hand</option>
            <option value="left">Left hand</option>
          </select>
        </label>
        <button
          className="button button-dark"
          disabled={!camera.preview || locked}
          onClick={confirmFraming}
          title="Position the anchor, then confirm your framing. Use the marked palm area for hand cues."
        >
          {calibrated ? <Check size={16} /> : <Move size={16} />}
          {calibrated ? "Framing confirmed" : "Confirm camera framing"}
        </button>
      </div>
      {framingError ? (
        <p className="panel-error" role="alert">
          {framingError}
        </p>
      ) : null}
      <div className="gesture-settings">
        <button
          className="button button-dark full-width"
          disabled={
            !gesture.enabled && (!calibrated || !camera.preview || locked)
          }
          onClick={() => {
            if (gesture.enabled) {
              gesture.disable();
              onArmed(false);
            } else void gesture.enable();
          }}
        >
          <Hand size={17} />
          {gesture.enabled ? "Turn hand cues off" : "Enable local hand cues"}
        </button>
        {gesture.enabled ? (
          <>
            <label className="checkbox-label" htmlFor={armId}>
              <input
                id={armId}
                type="checkbox"
                checked={armed}
                disabled={!calibrated || locked}
                onChange={(event) => onArmed(event.target.checked)}
              />
              <span>Arm deliberate Offer and Accept hand cues.</span>
            </label>
            <div
              className="gesture-progress"
              role="progressbar"
              aria-label="Deliberate hand cue hold"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(gesture.dwellProgress * 100)}
            >
              <span style={{ width: `${gesture.dwellProgress * 100}%` }} />
            </div>
          </>
        ) : null}
        {gesture.enabled ? (
          <StatusPill live title={gesture.status} ariaLabel={gesture.status}>
            {armed ? "Armed" : "Hand cues on"}
          </StatusPill>
        ) : null}
        {gesture.error ? (
          <p className="panel-error" role="alert">
            {gesture.error}
          </p>
        ) : null}
      </div>
      <div className="local-camera-actions">
        <button
          className="button button-gold"
          disabled={!canOffer || locked}
          onClick={onOffer}
        >
          <Hand size={17} />
          Offer from A
        </button>
        <button
          className="button button-dark"
          disabled={!canAccept || locked}
          onClick={onAccept}
        >
          <Check size={17} />
          {acceptLabel}
        </button>
      </div>
    </div>
  );
}
