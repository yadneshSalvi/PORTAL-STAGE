import type { Point, Slot } from "../lib/contracts";
import {
  cameraToStage,
  containsPoint,
  interactionRegionToStage,
  stableAnchor,
  validCalibration,
} from "./calibration";
import type { GestureCalibration } from "./calibration";
import { subjectHandedness } from "./handedness";

export type HandObservation = {
  point: Point;
  openPalm: boolean;
  confidence: number;
  handedness: "left" | "right";
};
export type GestureContext = {
  armed: boolean;
  calibration: GestureCalibration | null;
  slot: Slot;
  owner: Slot;
  expectedReceiver: Slot | null;
  offerId?: string | null;
  canOffer?: boolean;
};
export type GestureReading = {
  confidence: number;
  dwellProgress: number;
  anchor: Point | null;
  status: string;
  intent: "offer" | "accept" | null;
  /** True only for a selected, calibrated hand in this inference, never a retained anchor. */
  tracked: boolean;
  feedback: "idle" | "dwelling" | "release" | "fired";
};
export const GESTURE_LIMITS = {
  minConfidence: 0.8,
  offerDwellMs: 900,
  acceptDwellMs: 1100,
  cooldownMs: 1800,
  maxFrameGapMs: 240,
  driftRadius: 0.1,
  boundaryInset: 0.012,
} as const;

/** Dwell is continuous, explicitly armed, local, and only proposes the same server command as a button. */
export class GestureIntentEngine {
  private lastSampleAt: number | null = null;
  private contextKey = "";
  private since: number | null = null;
  private origin: Point | null = null;
  private anchor: Point | null = null;
  private cooldownUntil = 0;
  private releaseRequired = true;
  private fired = false;

  reset() {
    this.lastSampleAt = null;
    this.contextKey = "";
    this.since = null;
    this.origin = null;
    this.releaseRequired = true;
    this.fired = false;
  }
  sample(
    observation: HandObservation | null,
    context: GestureContext,
    now: number,
  ): GestureReading {
    let tracked = false;
    const result = (
      status: string,
      dwellProgress = 0,
      intent: GestureReading["intent"] = null,
      feedback: GestureReading["feedback"] = "idle",
    ): GestureReading => ({
      status,
      confidence: observation?.confidence ?? 0,
      anchor: this.anchor,
      dwellProgress,
      intent,
      tracked,
      feedback,
    });
    const key = JSON.stringify([
      context.armed,
      context.slot,
      context.owner,
      context.expectedReceiver,
      context.offerId,
      context.canOffer,
      context.calibration,
    ]);
    if (key !== this.contextKey) {
      this.contextKey = key;
      this.since = null;
      this.origin = null;
      this.releaseRequired = true;
      this.fired = false;
    }
    if (
      this.lastSampleAt !== null &&
      (now <= this.lastSampleAt ||
        now - this.lastSampleAt > GESTURE_LIMITS.maxFrameGapMs)
    ) {
      this.since = null;
      this.origin = null;
    }
    this.lastSampleAt = now;
    const calibration = context.calibration;
    if (!validCalibration(calibration)) {
      this.since = null;
      return result("Confirm calibration before using gestures.");
    }
    if (
      !observation ||
      !Number.isFinite(observation.confidence) ||
      observation.confidence < GESTURE_LIMITS.minConfidence ||
      observation.handedness !== calibration.handedness
    ) {
      this.since = null;
      this.origin = null;
      // Absence/low quality cancels dwell but does not count as a deliberate release.
      if (!observation) this.releaseRequired = false;
      return result(
        !observation
          ? "Tracking active — no selected hand detected. Offer / Accept buttons remain available."
          : observation.handedness !== calibration.handedness
            ? `Show your calibrated ${calibration.handedness} hand, or confirm hand selection again. Use Offer / Accept buttons.`
            : "Hand signal is too weak. Improve lighting or framing; use Offer / Accept buttons.",
      );
    }
    const mapped = cameraToStage(observation.point, calibration);
    if (!mapped) {
      this.since = null;
      this.releaseRequired = false;
      return result("Move your hand inside the calibrated region.");
    }
    this.anchor = stableAnchor(this.anchor, mapped);
    tracked = true;
    if (!context.armed) {
      this.since = null;
      this.releaseRequired = false;
      return result("Gestures are disarmed. Buttons remain available.");
    }
    const intent =
      context.expectedReceiver === context.slot &&
      !!context.offerId &&
      context.owner !== context.slot
        ? "accept"
        : context.owner === context.slot &&
            !context.offerId &&
            context.canOffer !== false
          ? "offer"
          : null;
    if (!intent) {
      this.since = null;
      return result("Waiting for an eligible offer or your turn to offer.");
    }
    const cameraRegion =
      intent === "offer" ? calibration.offerRegion : calibration.acceptRegion;
    const region = interactionRegionToStage(cameraRegion, calibration);
    if (
      !observation.openPalm ||
      !region ||
      !containsPoint(region, mapped, GESTURE_LIMITS.boundaryInset)
    ) {
      this.since = null;
      this.origin = null;
      this.releaseRequired = false;
      return result("Raise an open palm in the marked cue region when ready.");
    }
    if (this.releaseRequired || this.fired)
      return result(
        "Lower your hand before arming the next cue.",
        0,
        null,
        "release",
      );
    if (now < this.cooldownUntil) {
      this.since = null;
      return result("Cue cooldown — keep using buttons if needed.");
    }
    if (
      this.origin &&
      Math.hypot(mapped.x - this.origin.x, mapped.y - this.origin.y) >
        GESTURE_LIMITS.driftRadius
    ) {
      this.since = null;
      this.origin = null;
      return result("Hold your open palm still to confirm the cue.");
    }
    this.since ??= now;
    this.origin ??= mapped;
    const dwell =
      intent === "offer"
        ? GESTURE_LIMITS.offerDwellMs
        : GESTURE_LIMITS.acceptDwellMs;
    const progress = Math.min(1, (now - this.since) / dwell);
    if (progress < 1)
      return result(`Hold to ${intent}…`, progress, null, "dwelling");
    this.fired = true;
    this.releaseRequired = true;
    this.since = null;
    this.cooldownUntil = now + GESTURE_LIMITS.cooldownMs;
    return result(
      `${intent === "offer" ? "Offer" : "Accept"} requested. Waiting for the server.`,
      1,
      intent,
      "fired",
    );
  }
}

export type Landmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};
export type HandDetection = {
  landmarks: Landmark[][];
  handedness: Array<Array<{ categoryName: string; score: number }>>;
};
const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);

/** Handedness score + geometric validity is a signal gate, not an intent probability. */
export function observationFromLandmarks(
  detection: HandDetection,
  wanted: "left" | "right",
  inputMirrored = false,
): HandObservation | null {
  const candidates: HandObservation[] = [];
  for (let i = 0; i < detection.landmarks.length; i++) {
    const landmarks = detection.landmarks[i];
    const category = detection.handedness[i]?.[0];
    const handedness = subjectHandedness(
      category?.categoryName ?? "",
      inputMirrored,
    );
    if (
      landmarks.length !== 21 ||
      handedness !== wanted ||
      !category ||
      !Number.isFinite(category.score)
    )
      continue;
    if (
      landmarks.some(
        (point) =>
          !Number.isFinite(point.x) ||
          !Number.isFinite(point.y) ||
          point.x < 0 ||
          point.x > 1 ||
          point.y < 0 ||
          point.y > 1,
      )
    )
      continue;
    const palm = distance(landmarks[5], landmarks[17]);
    if (palm < 0.035 || palm > 0.65) continue;
    const fingers = [
      [8, 6],
      [12, 10],
      [16, 14],
      [20, 18],
    ];
    const extended = fingers.filter(
      ([tip, pip]) =>
        distance(landmarks[tip], landmarks[0]) >
        distance(landmarks[pip], landmarks[0]) * 1.13,
    ).length;
    const point = {
      x:
        (landmarks[0].x + landmarks[5].x + landmarks[9].x + landmarks[17].x) /
        4,
      y:
        (landmarks[0].y + landmarks[5].y + landmarks[9].y + landmarks[17].y) /
        4,
    };
    candidates.push({
      point,
      openPalm: extended === 4,
      confidence: Math.min(
        category.score,
        ...landmarks.map((landmark) => landmark.visibility ?? 1),
      ),
      handedness: wanted,
    });
  }
  // Two matching hands are ambiguous: never choose one opportunistically for acceptance.
  return candidates.length === 1 ? candidates[0] : null;
}
