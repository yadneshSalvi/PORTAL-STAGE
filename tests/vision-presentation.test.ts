import { describe, expect, it, vi } from "vitest";
import { createRecord } from "@/server/core";
import { apertureCalibration, apertureToRaw } from "@/vision/calibration";
import {
  GestureIntentEngine,
  observationFromLandmarks,
  type GestureContext,
  type HandObservation,
} from "@/vision/gesture-engine";
import {
  directorHandFeedback,
  handPresentationScope,
  localHandPoint,
  updateLocalHandSample,
  type DirectorHandPresentation,
  type LocalHandSample,
} from "@/vision/local-hand-presentation";
import {
  HeldPropMotion,
  crossingPoint,
  propAnchor,
} from "@/stage/prop-presentation";
import { drawHandCueFeedback } from "@/stage/hand-cue-feedback";
import { stagePointForAperture } from "@/stage/coordinates";
import { activeAnchorSlot, ANCHOR_LIMITS } from "@/media/anchor-protocol";

const dimensions = { videoWidth: 1280, videoHeight: 720 };
const calibration = apertureCalibration({
  ...dimensions,
  slot: "A",
  handedness: "left",
})!;
const context: GestureContext = {
  armed: true,
  calibration,
  slot: "A",
  owner: "A",
  expectedReceiver: null,
  offerId: null,
};
const point = { x: 0.76, y: 0.55 };
const hand: HandObservation = {
  point: apertureToRaw(point, dimensions)!,
  confidence: 0.99,
  handedness: "left",
  openPalm: false,
};
function liveShow() {
  const show = createRecord(
    "ps_hand_presentation",
    "director",
    "solo",
    1000,
  ).state;
  show.phase = "live";
  return show;
}
function presentation(
  sample: LocalHandSample | null,
  changes: Partial<DirectorHandPresentation> = {},
): DirectorHandPresentation {
  return {
    sample,
    armed: true,
    tracked: true,
    dwellProgress: 0,
    feedback: "idle",
    firedAt: null,
    ...changes,
  };
}

describe("private per-inference hand presentation", () => {
  it("keeps a still, tracked hand for ten seconds without changing the remote TTL", () => {
    const show = liveShow();
    const engine = new GestureIntentEngine();
    let sample: LocalHandSample | null = null;
    let firstPoint = null;
    for (let time = 0; time <= 10_000; time += 100) {
      const reading = engine.sample(hand, context, time);
      sample = updateLocalHandSample(
        sample,
        reading,
        context,
        handPresentationScope(show),
        time,
      );
      firstPoint ??= sample!.point;
      expect(sample!.point).toBe(firstPoint);
      expect(sample!.seenAt).toBe(time);
      const actual = propAnchor(
        show,
        "A",
        undefined,
        presentation(sample),
        time,
      );
      const expected = stagePointForAperture("A", point);
      expect(actual.x).toBeCloseTo(expected.x, 10);
      expect(actual.y).toBeCloseTo(expected.y, 10);
    }
    expect(ANCHOR_LIMITS.ttlMs).toBe(1500);
  });

  it("holds through tracking loss grace, then glides back to the durable marker", () => {
    const show = liveShow();
    const engine = new GestureIntentEngine();
    const tracked = engine.sample(hand, context, 1000);
    const sample = updateLocalHandSample(
      null,
      tracked,
      context,
      handPresentationScope(show),
      1000,
    );
    const lost = engine.sample(null, context, 1100);
    expect(lost.anchor).toEqual(tracked.anchor);
    expect(lost.tracked).toBe(false);
    const retained = updateLocalHandSample(
      sample,
      lost,
      context,
      handPresentationScope(show),
      1100,
    );
    expect(retained?.seenAt).toBe(1000);
    const input = presentation(retained, { tracked: false });
    const palm = propAnchor(show, "A", undefined, input, 2499);
    const marker = propAnchor(show, "A");
    expect(palm).not.toEqual(marker);
    expect(localHandPoint(input, show, 2499)).not.toBeNull();
    expect(localHandPoint(input, show, 2500)).toBeNull();
    const motion = new HeldPropMotion();
    motion.update(palm, 2400, show);
    const gliding = motion.update(
      propAnchor(show, "A", undefined, input, 2500),
      2500,
      show,
    );
    expect(Math.hypot(gliding.x - marker.x, gliding.y - marker.y)).toBeLessThan(
      Math.hypot(palm.x - marker.x, palm.y - marker.y),
    );
    expect(gliding).not.toEqual(marker);
    const settled = motion.update(marker, 3000, show);
    expect(Math.hypot(settled.x - marker.x, settled.y - marker.y)).toBeLessThan(
      1,
    );
  });

  it("does not refresh a retained point for weak, wrong-hand, or cropped-out observations", () => {
    const show = liveShow();
    for (const invalid of [
      null,
      { ...hand, confidence: 0.4 },
      { ...hand, handedness: "right" as const },
      { ...hand, point: { x: 0, y: 0 } },
    ]) {
      const engine = new GestureIntentEngine();
      const reading = engine.sample(hand, context, 0);
      const sample = updateLocalHandSample(
        null,
        reading,
        context,
        handPresentationScope(show),
        0,
      );
      const lost = engine.sample(invalid, context, 100);
      expect(lost.tracked).toBe(false);
      const next = updateLocalHandSample(
        sample,
        lost,
        context,
        handPresentationScope(show),
        100,
      );
      expect(next).toBe(sample);
      expect(localHandPoint(presentation(next), show, 1500)).toBeNull();
    }
  });

  it("tracks a pending receiver locally and lands exactly at its latest palm without publishing permission", () => {
    const show = liveShow();
    show.umbrella.owner = "B";
    const receive = {
      ...context,
      owner: "B" as const,
      expectedReceiver: "A" as const,
      offerId: "return-offer",
    };
    const engine = new GestureIntentEngine();
    let sample = updateLocalHandSample(
      null,
      engine.sample(hand, receive, 0),
      receive,
      handPresentationScope(show),
      0,
    );
    const from = propAnchor(show, "B");
    for (let time = 100; time <= 1200; time += 100) {
      const moving = {
        ...hand,
        point: apertureToRaw({ x: 0.76, y: 0.55 - time / 12000 }, dimensions)!,
      };
      sample = updateLocalHandSample(
        sample,
        engine.sample(moving, receive, time),
        receive,
        handPresentationScope(show),
        time,
      );
    }
    const target = propAnchor(show, "A", undefined, presentation(sample), 1200);
    const expected = stagePointForAperture("A", sample!.point);
    expect(target).toEqual(expected);
    expect(crossingPoint(from, target, 1, 170)).toEqual(expected);
    expect(activeAnchorSlot(show, "A", 1200)).toBe(false);
    show.umbrella.owner = "A";
    expect(
      propAnchor(show, "A", undefined, presentation(sample), 1200),
    ).toEqual(expected);
    expect(propAnchor(show, "A", undefined, presentation(null), 1200)).toEqual(
      propAnchor(show, "A"),
    );
  });

  it("rejects stale show/epoch samples and clears local output when disarmed or ineligible", () => {
    const show = liveShow();
    const reading = new GestureIntentEngine().sample(hand, context, 0);
    const sample = updateLocalHandSample(
      null,
      reading,
      context,
      handPresentationScope(show),
      0,
    );
    expect(
      localHandPoint(
        presentation(sample),
        { ...show, epoch: show.epoch + 1 },
        100,
      ),
    ).toBeNull();
    expect(
      localHandPoint(presentation(sample), { ...show, id: "other-show" }, 100),
    ).toBeNull();
    for (const next of [
      { ...context, armed: false },
      { ...context, calibration: null },
      { ...context, owner: "B" as const },
      {
        ...context,
        owner: "B" as const,
        expectedReceiver: "A" as const,
        offerId: null,
      },
    ])
      expect(
        updateLocalHandSample(
          sample,
          reading,
          next,
          handPresentationScope(show),
          100,
        ),
      ).toBeNull();
  });

  it("normalizes handedness at observation selection without mirroring its pixel coordinates", () => {
    const landmarks = Array.from({ length: 21 }, (_, i) => ({
      x: 0.3 + i * 0.01,
      y: 0.3 + i * 0.005,
    }));
    const detection = {
      landmarks: [landmarks],
      handedness: [[{ categoryName: "Left", score: 0.99 }]],
    };
    const raw = observationFromLandmarks(detection, "left", false);
    const mirroredInput = observationFromLandmarks(detection, "right", true);
    expect(raw?.handedness).toBe("left");
    expect(mirroredInput?.handedness).toBe("right");
    expect(mirroredInput?.point).toEqual(raw?.point);
    expect(observationFromLandmarks(detection, "left", true)).toBeNull();
  });
});

describe("director-only hand cue feedback", () => {
  function input(changes: Partial<DirectorHandPresentation> = {}) {
    const show = liveShow();
    return {
      show,
      input: presentation(
        { scope: handPresentationScope(show), slot: "A", point, seenAt: 1000 },
        { feedback: "dwelling", dwellProgress: 0.5, ...changes },
      ),
    };
  }

  it("shows a ring only for armed, current tracked dwell, including its initial zero-progress frame", () => {
    const { show, input: hand } = input();
    expect(directorHandFeedback(hand, show, 1100, false)).toMatchObject({
      ring: true,
      progress: 0.5,
      flash: 0,
      lowerHand: false,
    });
    expect(
      directorHandFeedback({ ...hand, dwellProgress: 0 }, show, 1100, false)
        ?.ring,
    ).toBe(true);
    for (const changes of [
      { armed: false },
      { tracked: false },
      { feedback: "idle" as const },
      { sample: null },
    ])
      expect(
        directorHandFeedback({ ...hand, ...changes }, show, 1100, false),
      ).toBeNull();
    expect(
      directorHandFeedback(hand, { ...show, phase: "hold" }, 1100, false),
    ).toBeNull();
    expect(directorHandFeedback(hand, show, 2500, false)).toBeNull();
    expect(directorHandFeedback(undefined, show, 1100, false)).toBeNull();
  });

  it("hides stale dwell feedback after a frame gap while retaining the prop loss grace", () => {
    const { show, input: hand } = input();
    expect(directorHandFeedback(hand, show, 1241, false)).toBeNull();
    expect(localHandPoint(hand, show, 1241)).not.toBeNull();
  });

  it("shows the release hint without a dwell ring and flashes briefly only after firing", () => {
    const { show, input: hand } = input({ feedback: "release" });
    expect(directorHandFeedback(hand, show, 1100, false)).toMatchObject({
      ring: false,
      lowerHand: true,
    });
    const fired = { ...hand, feedback: "fired" as const, firedAt: 1000 };
    expect(directorHandFeedback(fired, show, 1000, false)).toMatchObject({
      ring: true,
      progress: 1,
      flash: 1,
    });
    expect(directorHandFeedback(fired, show, 1240, false)).toBeNull();
  });

  it("uses a static full ring with no flash for reduced motion", () => {
    const { show, input: hand } = input();
    expect(directorHandFeedback(hand, show, 1100, true)).toMatchObject({
      ring: true,
      progress: 1,
      flash: 0,
    });
    expect(
      directorHandFeedback({ ...hand, dwellProgress: 0.9 }, show, 1200, true),
    ).toMatchObject({ ring: true, progress: 1, flash: 0 });
    expect(
      directorHandFeedback(
        { ...hand, feedback: "fired", firedAt: 1100 },
        show,
        1100,
        true,
      ),
    ).toBeNull();
  });

  it("draws a thin clockwise arc from noon and a quiet lower-hand hint", () => {
    const context = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
    };
    const { show, input: hand } = input();
    drawHandCueFeedback(
      context as unknown as CanvasRenderingContext2D,
      directorHandFeedback(hand, show, 1100, false)!,
    );
    expect(context.arc.mock.calls[1]).toEqual([
      160,
      45,
      27,
      -Math.PI / 2,
      Math.PI / 2,
    ]);
    expect((context as unknown as CanvasRenderingContext2D).lineWidth).toBe(2);
    drawHandCueFeedback(
      context as unknown as CanvasRenderingContext2D,
      directorHandFeedback(
        { ...hand, feedback: "release" },
        show,
        1100,
        false,
      )!,
    );
    expect(context.fillText).toHaveBeenCalledWith("Lower your hand", 160, 89);
  });
});
