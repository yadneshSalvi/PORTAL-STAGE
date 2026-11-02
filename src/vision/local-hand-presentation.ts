import type { Point, ShowState, Slot } from "../lib/contracts";
import { validCalibration } from "./calibration";
import {
  GESTURE_LIMITS,
  type GestureContext,
  type GestureReading,
} from "./gesture-engine";

export const LOCAL_HAND_GRACE_MS = 1500;
export const HAND_CUE_FLASH_MS = 240;

export type LocalHandSample = {
  scope: string;
  slot: Slot;
  point: Point;
  /** Local monotonic clock. A still, tracked hand refreshes this on every inference. */
  seenAt: number;
};
export type DirectorHandPresentation = {
  sample: LocalHandSample | null;
  armed: boolean;
  tracked: boolean;
  dwellProgress: number;
  feedback: GestureReading["feedback"];
  firedAt: number | null;
};

export function handPresentationScope(show: Pick<ShowState, "id" | "epoch">) {
  return `${show.id}:${show.epoch}`;
}

/** Private presentation only: receiving a current offer does not authorize network anchors. */
export function updateLocalHandSample(
  previous: LocalHandSample | null,
  reading: Pick<GestureReading, "anchor" | "tracked">,
  context: GestureContext,
  scope: string | undefined,
  now: number,
): LocalHandSample | null {
  if (
    !scope ||
    !context.armed ||
    !validCalibration(context.calibration) ||
    (context.owner !== context.slot &&
      !(context.expectedReceiver === context.slot && context.offerId))
  )
    return null;
  if (reading.tracked && reading.anchor)
    return { scope, slot: context.slot, point: reading.anchor, seenAt: now };
  return previous?.scope === scope && previous.slot === context.slot
    ? previous
    : null;
}

export function localHandPoint(
  hand: DirectorHandPresentation | null | undefined,
  show: Pick<ShowState, "id" | "epoch" | "phase">,
  now: number,
): { slot: Slot; point: Point } | null {
  const sample = hand?.sample;
  if (
    !hand?.armed ||
    !sample ||
    show.phase !== "live" ||
    sample.scope !== handPresentationScope(show) ||
    now < sample.seenAt ||
    now - sample.seenAt >= LOCAL_HAND_GRACE_MS
  )
    return null;
  return { slot: sample.slot, point: sample.point };
}

export type HandCueFeedback = {
  slot: Slot;
  point: Point;
  ring: boolean;
  progress: number;
  flash: number;
  lowerHand: boolean;
};

/** The grace period may hold the prop, but never continues a lost hand's dwell display. */
export function directorHandFeedback(
  hand: DirectorHandPresentation | null | undefined,
  show: Pick<ShowState, "id" | "epoch" | "phase">,
  now: number,
  reducedMotion: boolean,
): HandCueFeedback | null {
  const tracked = localHandPoint(hand, show, now);
  if (
    !tracked ||
    !hand?.tracked ||
    !hand.sample ||
    now - hand.sample.seenAt > GESTURE_LIMITS.maxFrameGapMs
  )
    return null;
  const flashAge = hand.firedAt === null ? Infinity : now - hand.firedAt;
  const flash =
    !reducedMotion && flashAge >= 0 && flashAge < HAND_CUE_FLASH_MS
      ? 1 - flashAge / HAND_CUE_FLASH_MS
      : 0;
  const dwelling = hand.feedback === "dwelling";
  const lowerHand = hand.feedback === "release";
  if (!dwelling && !lowerHand && !flash) return null;
  return {
    ...tracked,
    ring: dwelling || flash > 0,
    progress: reducedMotion || flash > 0 ? 1 : hand.dwellProgress,
    flash,
    lowerHand,
  };
}
