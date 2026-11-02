import type { Point, ShowState, Slot } from "@/lib/contracts";
import { stagePointForAperture } from "./coordinates";
import {
  localHandPoint,
  type DirectorHandPresentation,
} from "@/vision/local-hand-presentation";

export const HELD_PROP_TIME_CONSTANT_MS = 100;

export function propAnchor(
  show: ShowState,
  slot: Slot,
  anchors?: Partial<Record<Slot, Point>>,
  directorHand?: DirectorHandPresentation | null,
  time = 0,
): Point {
  const hand = localHandPoint(directorHand, show, time);
  const point =
    show.mode === "solo" && slot === "B"
      ? { x: 0.58, y: 0.72 }
      : hand?.slot === slot
        ? hand.point
        : anchors?.[slot] || show.participants[slot].anchor;
  return stagePointForAperture(slot, point);
}

export function crossingPoint(
  from: Point,
  to: Point,
  progress: number,
  lift: number,
): Point {
  if (progress >= 1) return { ...to };
  if (progress <= 0) return { ...from };
  const eased = progress * progress * (3 - 2 * progress);
  return {
    x: from.x + (to.x - from.x) * eased,
    y: from.y + (to.y - from.y) * eased + Math.sin(progress * Math.PI) * lift,
  };
}

/** One render-clock filter for both props. Recovery and authored crossings never ease. */
export class HeldPropMotion {
  private previous: {
    point: Point;
    time: number;
    epoch: number;
    held: boolean;
  } | null = null;

  update(
    target: Point,
    time: number,
    state: {
      epoch: number;
      phase: ShowState["phase"];
      forceCurtain?: boolean;
      crossing?: boolean;
      shelter?: boolean;
      reducedMotion?: boolean;
    },
  ): Point {
    const { epoch } = state;
    const held =
      state.phase === "live" &&
      !state.forceCurtain &&
      !state.crossing &&
      !state.shelter &&
      !state.reducedMotion;
    const previous = this.previous;
    let point = { ...target };
    if (previous && previous.epoch === epoch && previous.held && held) {
      const alpha = -Math.expm1(
        -Math.max(0, time - previous.time) / HELD_PROP_TIME_CONSTANT_MS,
      );
      point = {
        x: previous.point.x + (target.x - previous.point.x) * alpha,
        y: previous.point.y + (target.y - previous.point.y) * alpha,
      };
    }
    this.previous = { point, time, epoch, held };
    return point;
  }
}
