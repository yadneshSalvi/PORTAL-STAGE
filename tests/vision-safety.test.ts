import { describe, expect, it } from "vitest";
import {
  cameraToStage,
  defaultCalibration,
  stableAnchor,
  validCalibration,
} from "../src/vision/calibration";
import {
  GestureIntentEngine,
  observationFromLandmarks,
} from "../src/vision/gesture-engine";
import type {
  GestureContext,
  HandObservation,
  HandDetection,
} from "../src/vision/gesture-engine";

const calibration = defaultCalibration({ slot: "A", mirrored: false });
const context: GestureContext = {
  armed: true,
  calibration,
  slot: "A",
  owner: "A",
  expectedReceiver: null,
  offerId: null,
  canOffer: true,
};
const palm: HandObservation = {
  point: { x: 0.78, y: 0.45 },
  confidence: 0.96,
  handedness: "right",
  openPalm: true,
};
function dwell(
  engine: GestureIntentEngine,
  state = context,
  from = 100,
  until = 1200,
) {
  let reading = engine.sample(palm, state, from);
  for (let at = from + 100; at <= until; at += 100)
    reading = engine.sample(palm, state, at);
  return reading;
}

describe("calibration and safe local gesture intent", () => {
  it("treats successful empty inference as no selected hand, never a runtime failure or cue", () => {
    const engine = new GestureIntentEngine();
    const observation = observationFromLandmarks(
      { landmarks: [], handedness: [] },
      "right",
    );
    expect(observation).toBeNull();
    for (let at = 0; at <= 5000; at += 100) {
      const reading = engine.sample(observation, context, at);
      expect(reading).toMatchObject({
        status:
          "Tracking active — no selected hand detected. Offer / Accept buttons remain available.",
        intent: null,
        confidence: 0,
        dwellProgress: 0,
        anchor: null,
      });
    }
  });
  it("distinguishes weak signal and the wrong calibrated hand while cancelling cue dwell", () => {
    for (const confidence of [0.4, NaN, Infinity]) {
      const engine = new GestureIntentEngine();
      engine.sample(null, context, 0);
      dwell(engine, context, 100, 700);
      expect(
        engine.sample({ ...palm, confidence }, context, 800),
      ).toMatchObject({
        status:
          "Hand signal is too weak. Improve lighting or framing; use Offer / Accept buttons.",
        intent: null,
        dwellProgress: 0,
      });
    }
    const engine = new GestureIntentEngine();
    engine.sample(null, context, 0);
    dwell(engine, context, 100, 700);
    expect(
      engine.sample({ ...palm, handedness: "left" }, context, 800),
    ).toMatchObject({
      status:
        "Show your calibrated right hand, or confirm hand selection again. Use Offer / Accept buttons.",
      intent: null,
      dwellProgress: 0,
    });
  });
  it("mirrors raw camera coordinates exactly once and rejects points outside the calibrated crop", () => {
    const normal = cameraToStage({ x: 0.25, y: 0.5 }, calibration)!;
    const mirrored = cameraToStage(
      { x: 0.75, y: 0.5 },
      { ...calibration, mirrored: true },
    )!;
    expect(mirrored.x).toBeCloseTo(normal.x);
    expect(mirrored.y).toBeCloseTo(normal.y);
    expect(cameraToStage({ x: 0.01, y: 0.5 }, calibration)).toBeNull();
    expect(cameraToStage({ x: NaN, y: 0.5 }, calibration)).toBeNull();
    expect(
      validCalibration({
        ...calibration,
        offerRegion: { x: 0.9, y: 0.2, width: 0.2, height: 0.4 },
      }),
    ).toBe(false);
  });
  it("keeps the anchor stable in the dead zone and smooths larger movement", () => {
    const previous = { x: 0.5, y: 0.5 };
    expect(stableAnchor(previous, { x: 0.505, y: 0.503 })).toBe(previous);
    expect(stableAnchor(previous, { x: 0.7, y: 0.5 }).x).toBeCloseTo(0.57);
  });
  it("never fires without explicit arming, valid calibration, or an eligible owner", () => {
    for (const state of [
      { ...context, armed: false },
      { ...context, calibration: null },
      { ...context, owner: "B" as const },
      { ...context, canOffer: false },
    ]) {
      const engine = new GestureIntentEngine();
      engine.sample(null, state, 0);
      expect(dwell(engine, state).intent).toBeNull();
    }
  });
  it("requires release after arming, a continuous dwell, and fires only one offer while held", () => {
    const engine = new GestureIntentEngine();
    expect(dwell(engine).intent).toBeNull();
    engine.sample({ ...palm, openPalm: false }, context, 1300);
    expect(dwell(engine, context, 1400, 2200).intent).toBeNull();
    expect(engine.sample(palm, context, 2300).intent).toBe("offer");
    for (let at = 2400; at < 6000; at += 100)
      expect(engine.sample(palm, context, at).intent).toBeNull();
  });
  it("cancels dwell on low confidence, handedness mismatch, and missing hand", () => {
    for (const invalid of [
      { ...palm, confidence: 0.4 },
      { ...palm, handedness: "left" as const },
      null,
    ]) {
      const engine = new GestureIntentEngine();
      engine.sample(null, context, 0);
      dwell(engine, context, 100, 700);
      expect(engine.sample(invalid, context, 800).dwellProgress).toBe(0);
      expect(dwell(engine, context, 900, 1500).intent).toBeNull();
    }
  });
  it("does not accumulate a dwell over a stalled or backgrounded inference gap", () => {
    const engine = new GestureIntentEngine();
    engine.sample(null, context, 0);
    dwell(engine, context, 100, 800);
    expect(engine.sample(palm, context, 1800).dwellProgress).toBe(0);
    expect(dwell(engine, context, 1900, 2500).intent).toBeNull();
  });
  it("requires the explicitly armed expected receiver and a current offer ID before acceptance", () => {
    const receive: GestureContext = {
      ...context,
      owner: "B",
      expectedReceiver: "A",
      offerId: "offer-1",
    };
    for (const state of [
      { ...receive, armed: false },
      { ...receive, expectedReceiver: "B" as const },
      { ...receive, offerId: null },
    ]) {
      const engine = new GestureIntentEngine();
      engine.sample(null, state, 0);
      expect(dwell(engine, state).intent).toBeNull();
    }
    const engine = new GestureIntentEngine();
    engine.sample(null, receive, 0);
    expect(dwell(engine, receive).intent).toBe("accept");
  });
  it("never carries a pending acceptance into a replacement offer", () => {
    const receive: GestureContext = {
      ...context,
      owner: "B",
      expectedReceiver: "A",
      offerId: "offer-1",
    };
    const engine = new GestureIntentEngine();
    engine.sample(null, receive, 0);
    dwell(engine, receive, 100, 900);
    const replacement = { ...receive, offerId: "offer-2" };
    for (let at = 1000; at < 3500; at += 100)
      expect(engine.sample(palm, replacement, at).intent).toBeNull();
    engine.sample({ ...palm, openPalm: false }, replacement, 3500);
    expect(dwell(engine, replacement, 3600, 4700).intent).toBe("accept");
  });
  it("uses the mirrored cue region, including in a portrait camera coordinate frame", () => {
    const mirrored = {
      ...context,
      calibration: { ...calibration, mirrored: true },
    };
    const engine = new GestureIntentEngine();
    engine.sample(null, mirrored, 0);
    for (let at = 100; at < 1000; at += 100)
      expect(
        engine.sample({ ...palm, point: { x: 0.22, y: 0.45 } }, mirrored, at)
          .intent,
      ).toBeNull();
    expect(
      engine.sample({ ...palm, point: { x: 0.22, y: 0.45 } }, mirrored, 1000)
        .intent,
    ).toBe("offer");
  });
  it("holds the last stable anchor when confidence is lost", () => {
    const engine = new GestureIntentEngine();
    engine.sample(null, context, 0);
    const tracked = engine.sample(palm, context, 100);
    expect(tracked.anchor).not.toBeNull();
    expect(engine.sample(null, context, 200).anchor).toEqual(tracked.anchor);
  });
  it("rejects malformed, offscreen, tiny, and ambiguous hands", () => {
    const landmarks = Array.from({ length: 21 }, (_, i) => ({
      x: 0.3 + i * 0.01,
      y: 0.3 + i * 0.005,
    }));
    const detection: HandDetection = {
      landmarks: [landmarks],
      handedness: [[{ categoryName: "Right", score: 0.95 }]],
    };
    expect(observationFromLandmarks(detection, "right")).not.toBeNull();
    expect(
      observationFromLandmarks(
        {
          landmarks: [landmarks, landmarks],
          handedness: [...detection.handedness, ...detection.handedness],
        },
        "right",
      ),
    ).toBeNull();
    expect(
      observationFromLandmarks(
        { ...detection, landmarks: [landmarks.slice(0, 20)] },
        "right",
      ),
    ).toBeNull();
    expect(
      observationFromLandmarks(
        {
          ...detection,
          landmarks: [landmarks.map((point) => ({ ...point, x: -1 }))],
        },
        "right",
      ),
    ).toBeNull();
    expect(observationFromLandmarks(detection, "left")).toBeNull();
  });
});
