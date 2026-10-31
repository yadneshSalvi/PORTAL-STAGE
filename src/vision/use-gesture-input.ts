"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Point } from "../lib/contracts";
import {
  GestureIntentEngine,
  observationFromLandmarks,
} from "./gesture-engine";
import type {
  GestureContext,
  GestureReading,
  HandDetection,
} from "./gesture-engine";
import {
  calibrationMatchesVideo,
  type GestureCalibration,
} from "./calibration";

export type { GestureCalibration } from "./calibration";
export type GestureInputOptions = GestureContext & {
  onOffer: () => void | Promise<unknown>;
  onAccept: () => void | Promise<unknown>;
  onAnchor?: (point: Point) => void | Promise<unknown>;
  /** Must match calibration; mirroring is applied once to raw video coordinates. */
  mirrored?: boolean;
};
type WorkerResult =
  | { type: "ready" }
  | { type: "error"; message: string }
  | {
      type: "result";
      timestamp: number;
      inferenceMs: number;
      detection: HandDetection;
    };
type GestureState = Omit<GestureReading, "intent"> & {
  enabled: boolean;
  error: string | null;
  inferenceMs: number | null;
  processing: "worker" | "unavailable";
};
const initial: GestureState = {
  enabled: false,
  status: "Gestures are off. Offer / Accept buttons are always available.",
  confidence: 0,
  dwellProgress: 0,
  anchor: null,
  error: null,
  inferenceMs: null,
  processing: "unavailable",
};

export function useGestureInput(
  video: HTMLVideoElement | null,
  options: GestureInputOptions,
) {
  const videoRef = useRef(video);
  const optionsRef = useRef(options);
  videoRef.current = video;
  optionsRef.current = options;
  const engine = useRef(new GestureIntentEngine());
  const workerRef = useRef<Worker | null>(null);
  const generationRef = useRef(0);
  const enabledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishInit = useRef<(() => void) | null>(null);
  const lastAnchor = useRef<{ at: number; point: Point } | null>(null);
  const [state, setState] = useState<GestureState>(initial);

  const stop = useCallback(() => {
    ++generationRef.current;
    enabledRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (initTimer.current) clearTimeout(initTimer.current);
    timerRef.current = null;
    initTimer.current = null;
    finishInit.current?.();
    finishInit.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
    engine.current.reset();
    lastAnchor.current = null;
  }, []);
  const disable = useCallback(() => {
    stop();
    setState({
      ...initial,
      status:
        "Gestures are off. Your last stable anchor is held; use buttons to continue.",
    });
  }, [stop]);
  useEffect(() => () => stop(), [stop]);

  const enable = useCallback(async () => {
    if (enabledRef.current) return;
    stop();
    if (!videoRef.current) {
      setState({
        ...initial,
        error:
          "Enable a private camera preview first. This action never starts a camera for you.",
        status: "A camera preview is needed for local hand tracking.",
      });
      return;
    }
    if (
      typeof Worker === "undefined" ||
      typeof OffscreenCanvas === "undefined" ||
      typeof createImageBitmap === "undefined"
    ) {
      setState({
        ...initial,
        error:
          "This browser does not support the isolated on-device vision worker. Use Offer / Accept buttons.",
        status: "On-device gestures are unavailable in this browser.",
      });
      return;
    }
    const generation = generationRef.current;
    enabledRef.current = true;
    setState({
      ...initial,
      enabled: true,
      processing: "worker",
      status: "Loading local hand landmarks…",
    });
    let worker: Worker;
    try {
      worker = new Worker("/vision/hand-worker.js", {
        name: "portal-local-hand-landmarks",
      });
    } catch {
      stop();
      setState({
        ...initial,
        error:
          "The browser blocked the isolated vision worker. Use Offer / Accept buttons.",
        status: "On-device gestures are unavailable.",
      });
      return;
    }
    workerRef.current = worker;
    let inFlight = false;
    let lastVideoTime = -1;
    const active = () =>
      generationRef.current === generation &&
      enabledRef.current &&
      workerRef.current === worker;
    const failure = (message: string) => {
      if (!active()) return;
      stop();
      setState({
        ...initial,
        error: message,
        status: "Tracking paused — use buttons.",
      });
    };
    const schedule = () => {
      if (active())
        timerRef.current = setTimeout(() => {
          void pump();
        }, 100);
    };
    const pump = async () => {
      if (!active()) return;
      const source = videoRef.current;
      if (
        document.visibilityState === "hidden" ||
        !source ||
        source.readyState < 2 ||
        source.paused ||
        source.videoWidth === 0
      ) {
        engine.current.reset();
        setState((previous) => ({
          ...previous,
          dwellProgress: 0,
          confidence: 0,
          status: "Tracking paused — keep the preview active, or use buttons.",
        }));
        schedule();
        return;
      }
      if (inFlight || source.currentTime === lastVideoTime) {
        schedule();
        return;
      }
      lastVideoTime = source.currentTime;
      inFlight = true;
      let bitmap: ImageBitmap | null = null;
      try {
        const scale = Math.min(
          1,
          640 / Math.max(source.videoWidth, source.videoHeight),
        );
        bitmap = await createImageBitmap(source, {
          resizeWidth: Math.max(1, Math.round(source.videoWidth * scale)),
          resizeHeight: Math.max(1, Math.round(source.videoHeight * scale)),
        });
        if (!active()) {
          bitmap.close();
          return;
        }
        worker.postMessage(
          { type: "frame", bitmap, timestamp: performance.now() },
          [bitmap],
        );
        bitmap = null; // The worker now owns and closes it.
      } catch {
        bitmap?.close();
        inFlight = false;
        failure(
          "The local video frame could not be read. Re-enable the camera preview, then try gestures again. Buttons remain available.",
        );
      }
    };
    const ready = new Promise<void>((resolve) => {
      finishInit.current = resolve;
    });
    worker.onmessage = ({ data }: MessageEvent<WorkerResult>) => {
      if (!active()) return;
      if (data.type === "ready") {
        if (initTimer.current) clearTimeout(initTimer.current);
        initTimer.current = null;
        finishInit.current?.();
        finishInit.current = null;
        setState((previous) => ({
          ...previous,
          status:
            "On-device tracking ready. Confirm calibration and explicitly arm cues.",
        }));
        schedule();
        return;
      }
      if (data.type === "error") {
        failure(data.message);
        return;
      }
      inFlight = false;
      const current = optionsRef.current;
      const calibration: GestureCalibration | null =
        current.calibration && current.mirrored !== undefined
          ? { ...current.calibration, mirrored: current.mirrored }
          : current.calibration;
      const currentVideo = videoRef.current;
      if (
        calibration &&
        (!currentVideo ||
          !calibrationMatchesVideo(calibration, {
            videoWidth: currentVideo.videoWidth,
            videoHeight: currentVideo.videoHeight,
          }))
      ) {
        engine.current.reset();
        setState((previous) => ({
          ...previous,
          confidence: 0,
          dwellProgress: 0,
          status:
            "Camera framing changed. Confirm calibration again; buttons remain available.",
        }));
        schedule();
        return;
      }
      if (performance.now() - data.timestamp > 400) {
        engine.current.reset();
        setState((previous) => ({
          ...previous,
          confidence: 0,
          dwellProgress: 0,
          inferenceMs: data.inferenceMs,
          status: "Tracking is too slow for a safe cue. Use buttons.",
        }));
        schedule();
        return;
      }
      const observation = observationFromLandmarks(
        data.detection,
        calibration?.handedness ?? "right",
      );
      const reading = engine.current.sample(
        observation,
        { ...current, calibration },
        performance.now(),
      );
      setState({
        enabled: true,
        error: null,
        processing: "worker",
        confidence: reading.confidence,
        dwellProgress: reading.dwellProgress,
        anchor: reading.anchor,
        status: reading.status,
        inferenceMs: data.inferenceMs,
      });
      if (reading.intent) {
        const callback =
          reading.intent === "offer" ? current.onOffer : current.onAccept;
        void Promise.resolve()
          .then(callback)
          .catch(() => {
            if (active())
              setState((previous) => ({
                ...previous,
                error:
                  "The cue was not committed. Check stage status and use the matching button to retry.",
              }));
          });
      }
      if (
        reading.anchor &&
        observation &&
        current.armed &&
        current.owner === current.slot &&
        current.onAnchor
      ) {
        const previous = lastAnchor.current;
        const now = performance.now();
        if (
          !previous ||
          (now - previous.at >= 250 &&
            Math.hypot(
              previous.point.x - reading.anchor.x,
              previous.point.y - reading.anchor.y,
            ) >= 0.018)
        ) {
          lastAnchor.current = { at: now, point: reading.anchor };
          const anchor = reading.anchor;
          void Promise.resolve()
            .then(() => current.onAnchor?.(anchor))
            .catch(() => undefined);
        }
      }
      schedule();
    };
    worker.onerror = (event) => {
      event.preventDefault();
      failure(
        "The isolated vision worker could not start. Offer / Accept buttons remain available.",
      );
    };
    initTimer.current = setTimeout(
      () =>
        failure(
          "Local vision assets took too long to load. Check the deployment assets and use buttons.",
        ),
      20000,
    );
    worker.postMessage({ type: "init" });
    await ready;
  }, [stop]);

  return { ...state, enable, disable };
}
