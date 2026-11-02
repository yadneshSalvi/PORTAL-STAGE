import { describe, expect, it } from "vitest";
import { createRecord } from "@/server/core";
import { defaultCalibration } from "@/vision/calibration";
import {
  GestureIntentEngine,
  observationFromLandmarks,
  type GestureContext,
  type HandDetection,
} from "@/vision/gesture-engine";
import {
  handPresentationScope,
  localHandPoint,
  updateLocalHandSample,
  type LocalHandSample,
} from "@/vision/local-hand-presentation";

// Synthetic geometry with the shipped Tasks adapter's real output shape:
// its xyz-only hand model leaves visibility unset, and the JS converter emits 0.
function detection(openPalm = false, score = 0.97): HandDetection {
  const points = [
    [0.76, 0.65],
    [0.73, 0.6],
    [0.71, 0.57],
    [0.7, 0.53],
    [0.71, 0.51],
    [0.71, 0.5],
    [0.72, 0.46],
    [0.735, 0.48],
    [0.735, openPalm ? 0.28 : 0.52],
    [0.75, 0.49],
    [0.76, 0.45],
    [0.765, 0.49],
    [0.76, openPalm ? 0.24 : 0.535],
    [0.79, 0.5],
    [0.8, 0.46],
    [0.8, 0.5],
    [0.79, openPalm ? 0.25 : 0.55],
    [0.82, 0.52],
    [0.83, 0.49],
    [0.825, 0.54],
    [0.81, openPalm ? 0.32 : 0.57],
  ];
  return {
    landmarks: [points.map(([x, y]) => ({ x, y, z: 0, visibility: 0 }))],
    handedness: [[{ categoryName: "Left", score }]],
  };
}
const context: GestureContext = {
  armed: true,
  calibration: defaultCalibration({
    slot: "A",
    handedness: "left",
    mirrored: false,
  }),
  slot: "A",
  owner: "A",
  expectedReceiver: null,
  offerId: null,
  canOffer: true,
};

describe("shipped HandLandmarker result semantics", () => {
  it("tracks a closed fist for ten seconds with absent-model visibility encoded as zero, without firing a cue", () => {
    const observation = observationFromLandmarks(detection(), "left");
    expect(observation).toMatchObject({
      confidence: 0.97,
      openPalm: false,
      handedness: "left",
    });
    const engine = new GestureIntentEngine();
    const show = createRecord(
      "ps_hand_result",
      "director",
      "rehearsal",
      1000,
    ).state;
    show.phase = "live";
    let sample: LocalHandSample | null = null;
    for (let time = 0; time <= 10_000; time += 100) {
      const reading = engine.sample(observation, context, time);
      expect(reading.tracked).toBe(true);
      expect(reading.intent).toBeNull();
      expect(reading.dwellProgress).toBe(0);
      sample = updateLocalHandSample(
        sample,
        reading,
        context,
        handPresentationScope(show),
        time,
      );
      expect(sample?.seenAt).toBe(time);
      expect(
        localHandPoint(
          {
            sample,
            armed: true,
            tracked: reading.tracked,
            dwellProgress: 0,
            feedback: reading.feedback,
            firedAt: null,
          },
          show,
          time,
        ),
      ).not.toBeNull();
    }
  });

  it.each([
    ["offer", context, 900],
    [
      "accept",
      {
        ...context,
        owner: "B" as const,
        expectedReceiver: "A" as const,
        offerId: "current-return",
      },
      1100,
    ],
  ] as const)(
    "still requires release and the full %s dwell with SDK-shaped points",
    (intent, state, dwell) => {
      const open = observationFromLandmarks(detection(true), "left");
      expect(open?.openPalm).toBe(true);
      const engine = new GestureIntentEngine();
      for (let time = 0; time <= 1500; time += 100)
        expect(engine.sample(open, state, time).intent).toBeNull();
      engine.sample(observationFromLandmarks(detection(), "left"), state, 1600);
      for (let time = 1700; time < 1700 + dwell; time += 100)
        expect(engine.sample(open, state, time).intent).toBeNull();
      expect(engine.sample(open, state, 1700 + dwell).intent).toBe(intent);
      expect(engine.sample(open, state, 1800 + dwell).intent).toBeNull();
    },
  );

  it("keeps the 0.8 handedness threshold, and does not mistake it for an intent probability", () => {
    for (const score of [0, 0.4, 0.79]) {
      const observation = observationFromLandmarks(
        detection(false, score),
        "left",
      );
      expect(observation?.confidence).toBe(score);
      expect(
        new GestureIntentEngine().sample(observation, context, 0),
      ).toMatchObject({ tracked: false, intent: null });
    }
    for (const score of [0.8, 0.97, 1])
      expect(
        new GestureIntentEngine().sample(
          observationFromLandmarks(detection(false, score), "left"),
          context,
          0,
        ),
      ).toMatchObject({ tracked: true, intent: null, confidence: score });
  });

  it.each([-1, 1.01, NaN, Infinity])(
    "rejects a malformed handedness score %s",
    (score) => {
      expect(
        observationFromLandmarks(detection(false, score), "left"),
      ).toBeNull();
    },
  );

  it("keeps hand selection, bounds, point-count and ambiguity gates for zero-visibility output", () => {
    const hand = detection();
    expect(observationFromLandmarks(hand, "right")).toBeNull();
    expect(
      observationFromLandmarks(
        { ...hand, landmarks: [hand.landmarks[0].slice(0, 20)] },
        "left",
      ),
    ).toBeNull();
    expect(
      observationFromLandmarks(
        {
          ...hand,
          landmarks: [hand.landmarks[0].map((point) => ({ ...point, x: -1 }))],
        },
        "left",
      ),
    ).toBeNull();
    expect(
      observationFromLandmarks(
        {
          landmarks: [...hand.landmarks, ...hand.landmarks],
          handedness: [...hand.handedness, ...hand.handedness],
        },
        "left",
      ),
    ).toBeNull();
  });
});
