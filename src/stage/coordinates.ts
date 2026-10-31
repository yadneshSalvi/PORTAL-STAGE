import type { Point, Slot } from "@/lib/contracts";
import { ROOMS, STAGE_HEIGHT } from "./scene-art";

/** The compositor projects validated aperture coordinates once, without another crop or inset. */
export function stagePointForAperture(slot: Slot, point: Point): Point {
  const room = ROOMS[slot];
  return {
    x: room.x + point.x * room.w,
    y: STAGE_HEIGHT - room.y - point.y * room.h,
  };
}
