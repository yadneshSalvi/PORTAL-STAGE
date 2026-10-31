import { describe, expect, it } from "vitest";
import {
  APERTURE_SAFE_REGION,
  APERTURE_SIZE,
  apertureCalibration,
  apertureCoverCrop,
  apertureToRaw,
  calibrationMatchesVideo,
  cameraToStage,
  interactionRegionToStage,
  rawRectToAperture,
  rawRectToMirroredAperture,
  rawToAperture,
  rawToMirroredAperture,
  validCalibration,
} from "../src/vision/calibration";
import type { VideoDimensions } from "../src/vision/calibration";
import { GestureIntentEngine } from "../src/vision/gesture-engine";

const cases: VideoDimensions[] = [
  { videoWidth: 1280, videoHeight: 720 },
  { videoWidth: 1920, videoHeight: 1080 },
  { videoWidth: 720, videoHeight: 1280 },
  { videoWidth: 1080, videoHeight: 1920 },
  { videoWidth: 320, videoHeight: 1080 },
  { videoWidth: 1920, videoHeight: 600 },
  { videoWidth: 720, videoHeight: 720 },
  { videoWidth: 650, videoHeight: 562 },
];
const label = (dimensions: VideoDimensions) =>
  `${dimensions.videoWidth}×${dimensions.videoHeight}`;

describe("one intrinsic-camera / aperture / mirrored-preview transform", () => {
  for (const dimensions of cases) {
    it(`matches centered CSS cover and preserves the same safe coordinates for ${label(dimensions)}`, () => {
      const calibration = apertureCalibration({ ...dimensions, slot: "A" })!;
      expect(validCalibration(calibration)).toBe(true);
      expect(calibration.mirrored).toBe(false);
      expect(calibration.stageRegion).toEqual(APERTURE_SAFE_REGION);
      // Independent pixel-space object-fit:cover reference, not just inverse helpers.
      const scale = Math.max(
        APERTURE_SIZE.width / dimensions.videoWidth,
        APERTURE_SIZE.height / dimensions.videoHeight,
      );
      for (const raw of [
        { x: 0.5, y: 0.5 },
        { x: 0.53, y: 0.53 },
        { x: 0.47, y: 0.47 },
      ]) {
        const expected = {
          x:
            (raw.x * dimensions.videoWidth * scale -
              (dimensions.videoWidth * scale - APERTURE_SIZE.width) / 2) /
            APERTURE_SIZE.width,
          y:
            (raw.y * dimensions.videoHeight * scale -
              (dimensions.videoHeight * scale - APERTURE_SIZE.height) / 2) /
            APERTURE_SIZE.height,
        };
        const mapped = cameraToStage(raw, calibration)!;
        expect(mapped.x).toBeCloseTo(expected.x, 12);
        expect(mapped.y).toBeCloseTo(expected.y, 12);
      }
      for (const visible of [
        { x: 0.16, y: 0.3 },
        { x: 0.84, y: 0.3 },
        { x: 0.16, y: 0.72 },
        { x: 0.84, y: 0.72 },
      ]) {
        const raw = apertureToRaw(visible, dimensions)!;
        const mapped = cameraToStage(raw, calibration)!;
        expect(mapped.x).toBeCloseTo(visible.x, 12);
        expect(mapped.y).toBeCloseTo(visible.y, 12);
      }
      const visibleOutsideSafe = apertureToRaw({ x: 0.1, y: 0.5 }, dimensions)!;
      expect(rawToAperture(visibleOutsideSafe, dimensions)).not.toBeNull();
      expect(cameraToStage(visibleOutsideSafe, calibration)).toBeNull();
    });
    it(`uses the same mirrored overlay and cue threshold for ${label(dimensions)}`, () => {
      for (const slot of ["A", "B"] as const) {
        const calibration = apertureCalibration({
          ...dimensions,
          slot,
          handedness: "left",
        })!;
        const visibleX = slot === "A" ? 0.66 : 0.18;
        const region = rawRectToAperture(calibration.offerRegion, dimensions)!;
        expect(region.x).toBeCloseTo(visibleX, 12);
        expect(region.y).toBeCloseTo(0.32, 12);
        expect(region.width).toBeCloseTo(0.16, 12);
        expect(region.height).toBeCloseTo(0.38, 12);
        const mirrored = rawRectToMirroredAperture(
          calibration.offerRegion,
          dimensions,
        )!;
        expect(mirrored.x).toBeCloseTo(1 - visibleX - 0.16, 12);
        expect(mirrored.y).toBeCloseTo(region.y, 12);
        const stageRegion = interactionRegionToStage(
          calibration.offerRegion,
          calibration,
        )!;
        expect(stageRegion.x).toBeCloseTo(region.x, 12);
        expect(stageRegion.width).toBeCloseTo(region.width, 12);
        const visible = { x: visibleX + 0.08, y: 0.5 };
        const raw = apertureToRaw(visible, dimensions)!;
        const context = {
          armed: true,
          calibration,
          slot,
          owner: slot,
          expectedReceiver: null,
          canOffer: true,
        };
        const hand = {
          point: raw,
          handedness: "left" as const,
          confidence: 0.99,
          openPalm: true,
        };
        const engine = new GestureIntentEngine();
        engine.sample(null, context, 0);
        for (let at = 100; at < 1000; at += 100)
          expect(engine.sample(hand, context, at).intent).toBeNull();
        expect(engine.sample(hand, context, 1000).intent).toBe("offer");
      }
    });
  }
  it("crops the horizontal axis of a wide source and the vertical axis of a portrait source", () => {
    const wide = { videoWidth: 1280, videoHeight: 720 },
      portrait = { videoWidth: 720, videoHeight: 1280 };
    const wideCrop = apertureCoverCrop(wide)!,
      portraitCrop = apertureCoverCrop(portrait)!;
    expect(wideCrop.height).toBe(1);
    expect(wideCrop.width).toBeCloseTo(650 / 562 / (1280 / 720));
    expect(portraitCrop.width).toBe(1);
    expect(portraitCrop.height).toBeCloseTo(720 / 1280 / (650 / 562));
    expect(rawToAperture({ x: 0, y: 0.5 }, wide)).toBeNull();
    expect(rawToAperture({ x: 1, y: 0.5 }, wide)).toBeNull();
    expect(rawToAperture({ x: 0.5, y: 0 }, portrait)).toBeNull();
    expect(rawToAperture({ x: 0.5, y: 1 }, portrait)).toBeNull();
  });
  it("round-trips raw hand, mirrored marker and unmirrored Program at narrow and full preview widths", () => {
    for (const dimensions of [cases[0], cases[2], cases[4]]) {
      for (const width of [195, 280, 650]) {
        const height = (width * APERTURE_SIZE.height) / APERTURE_SIZE.width;
        const raw = { x: 0.53, y: 0.53 };
        const preview = rawToMirroredAperture(raw, dimensions)!;
        const markerPixels = { x: preview.x * width, y: preview.y * height };
        const manualProgram = {
          x: 1 - markerPixels.x / width,
          y: markerPixels.y / height,
        };
        const detectedProgram = cameraToStage(
          raw,
          apertureCalibration(dimensions)!,
        )!;
        expect(manualProgram.x).toBeCloseTo(detectedProgram.x, 12);
        expect(manualProgram.y).toBeCloseTo(detectedProgram.y, 12);
      }
    }
  });
  it("rejects unknown, nonfinite or nonpositive video dimensions and invalid points/regions", () => {
    for (const dimensions of [
      { videoWidth: 0, videoHeight: 720 },
      { videoWidth: 1280, videoHeight: 0 },
      { videoWidth: -1, videoHeight: 720 },
      { videoWidth: Infinity, videoHeight: 720 },
      { videoWidth: 1280, videoHeight: NaN },
    ]) {
      expect(apertureCoverCrop(dimensions)).toBeNull();
      expect(apertureCalibration(dimensions)).toBeNull();
      expect(apertureToRaw({ x: 0.5, y: 0.5 }, dimensions)).toBeNull();
    }
    expect(rawToAperture({ x: NaN, y: 0.5 }, cases[0])).toBeNull();
    expect(apertureToRaw({ x: 1.1, y: 0.5 }, cases[0])).toBeNull();
    expect(
      rawRectToAperture({ x: 0, y: 0, width: 0, height: 1 }, cases[0]),
    ).toBeNull();
    expect(
      rawRectToAperture({ x: 0, y: 0, width: 1, height: 1 }, cases[0]),
    ).toBeNull();
  });
  it("keeps same-aspect adaptation valid and requires confirmation after an aspect change", () => {
    const calibration = apertureCalibration(cases[0])!;
    expect(
      calibrationMatchesVideo(calibration, {
        videoWidth: 640,
        videoHeight: 360,
      }),
    ).toBe(true);
    expect(
      calibrationMatchesVideo(calibration, {
        videoWidth: 720,
        videoHeight: 1280,
      }),
    ).toBe(false);
    expect(
      calibrationMatchesVideo(calibration, { videoWidth: 0, videoHeight: 0 }),
    ).toBe(false);
  });
});
