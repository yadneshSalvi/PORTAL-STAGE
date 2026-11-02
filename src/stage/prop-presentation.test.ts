import { describe, expect, it } from "vitest";
import { HeldPropMotion, crossingPoint } from "./prop-presentation";

const live = { epoch: 1, phase: "live" as const };
const origin = { x: 250, y: 480 };
const target = { x: 650, y: 650 };

describe("held prop motion and authored crossings", () => {
  it("converges exponentially with the same result at 30, 60, and 144 fps", () => {
    const results = [30, 60, 144].map((fps) => {
      const motion = new HeldPropMotion();
      motion.update(origin, 0, live);
      let point = origin;
      for (let frame = 1; frame <= fps; frame++)
        point = motion.update(target, (frame * 1000) / fps, live);
      return point;
    });
    for (const point of results) {
      expect(point.x).toBeCloseTo(
        target.x + (origin.x - target.x) * Math.exp(-10),
        10,
      );
      expect(point.y).toBeCloseTo(results[0].y, 10);
      expect(Math.hypot(point.x - target.x, point.y - target.y)).toBeLessThan(
        0.03,
      );
    }
  });

  it("uses elapsed time under irregular frames rather than a per-frame fraction", () => {
    const motion = new HeldPropMotion();
    motion.update(origin, 0, live);
    for (const time of [7, 31, 112, 120, 287, 500])
      motion.update(target, time, live);
    const point = motion.update(target, 700, live);
    expect(point.x).toBeCloseTo(
      target.x + (origin.x - target.x) * Math.exp(-7),
      10,
    );
    expect(motion.update(target, 700, live)).toEqual(point);
  });

  it("snaps on first mount and epoch changes instead of animating recovery", () => {
    const motion = new HeldPropMotion();
    expect(motion.update(origin, 0, live)).toEqual(origin);
    expect(motion.update(target, 30, live)).not.toEqual(target);
    expect(motion.update(target, 40, { ...live, epoch: 2 })).toEqual(target);
  });

  it.each([
    { phase: "hold" as const },
    { forceCurtain: true },
    { phase: "ended" as const },
  ])("snaps during %j and on the first resumed frame", (closed) => {
    const motion = new HeldPropMotion();
    motion.update(origin, 0, live);
    expect(motion.update(target, 30, { ...live, ...closed })).toEqual(target);
    expect(motion.update(origin, 40, live)).toEqual(origin);
  });

  it("never smooths a crossing or shelter, and the crossing starts at the last drawn held point", () => {
    const motion = new HeldPropMotion();
    motion.update(origin, 0, live);
    const held = motion.update(target, 30, live);
    expect(crossingPoint(held, target, 0, 170)).toEqual(held);
    const crossing = crossingPoint(held, target, 0.5, 170);
    expect(motion.update(crossing, 40, { ...live, crossing: true })).toEqual(
      crossing,
    );
    expect(
      motion.update(crossingPoint(held, target, 1, 170), 1200, {
        ...live,
        crossing: true,
      }),
    ).toEqual(target);
    expect(motion.update(target, 1233, live)).toEqual(target);
    const shelter = { x: 960, y: 585 };
    expect(motion.update(shelter, 1266, { ...live, shelter: true })).toEqual(
      shelter,
    );
  });

  it("uses the current hand position without interpolated motion when reduced motion is selected", () => {
    const motion = new HeldPropMotion();
    motion.update(origin, 0, live);
    expect(motion.update(target, 16, { ...live, reducedMotion: true })).toEqual(
      target,
    );
  });
});
