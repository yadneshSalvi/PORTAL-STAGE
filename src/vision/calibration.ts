import type { Point, Slot } from "../lib/contracts";

export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type GestureCalibration = {
  version: 1;
  mirrored: boolean;
  handedness: "left" | "right";
  /** Regions use camera coordinates after the declared mirror transform. */
  cameraRegion: NormalizedRect;
  stageRegion: NormalizedRect;
  offerRegion: NormalizedRect;
  acceptRegion: NormalizedRect;
  /** A changed intrinsic aspect needs a fresh confirmation; resolution alone may change. */
  sourceAspect?: number;
};
export type VideoDimensions = { videoWidth: number; videoHeight: number };
export const APERTURE_SIZE = { width: 650, height: 562 } as const;
export const APERTURE_SAFE_REGION = {
  x: 0.16,
  y: 0.3,
  width: 0.68,
  height: 0.42,
} as const;
const EPSILON = 1e-9;

function sourceAspect(dimensions: VideoDimensions): number | null {
  const { videoWidth, videoHeight } = dimensions;
  if (
    !Number.isFinite(videoWidth) ||
    !Number.isFinite(videoHeight) ||
    videoWidth <= 0 ||
    videoHeight <= 0
  )
    return null;
  const aspect = videoWidth / videoHeight;
  return Number.isFinite(aspect) && aspect > 0 ? aspect : null;
}
/** Exact centered object-fit:cover crop in intrinsic, unmirrored camera coordinates. */
export function apertureCoverCrop(
  dimensions: VideoDimensions,
): NormalizedRect | null {
  const aspect = sourceAspect(dimensions);
  if (aspect === null) return null;
  const target = APERTURE_SIZE.width / APERTURE_SIZE.height;
  const width = aspect >= target ? target / aspect : 1;
  const height = aspect >= target ? 1 : aspect / target;
  const crop = { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
  return validRect(crop) ? crop : null;
}
const unitPoint = (point: Point) =>
  Number.isFinite(point.x) &&
  Number.isFinite(point.y) &&
  point.x >= -EPSILON &&
  point.x <= 1 + EPSILON &&
  point.y >= -EPSILON &&
  point.y <= 1 + EPSILON;
const floatingEdge = (value: number) =>
  value < 0 && value > -EPSILON
    ? 0
    : value > 1 && value < 1 + EPSILON
      ? 1
      : value;

/** Raw camera -> visible aperture. Pixels hidden by cover are rejected. */
export function rawToAperture(
  point: Point,
  dimensions: VideoDimensions,
): Point | null {
  const crop = apertureCoverCrop(dimensions);
  if (!crop || !unitPoint(point) || !containsPoint(crop, point)) return null;
  return {
    x: floatingEdge((point.x - crop.x) / crop.width),
    y: floatingEdge((point.y - crop.y) / crop.height),
  };
}
export function apertureToRaw(
  point: Point,
  dimensions: VideoDimensions,
): Point | null {
  const crop = apertureCoverCrop(dimensions);
  if (!crop || !unitPoint(point)) return null;
  return {
    x: crop.x + floatingEdge(point.x) * crop.width,
    y: crop.y + floatingEdge(point.y) * crop.height,
  };
}
export function rawToMirroredAperture(
  point: Point,
  dimensions: VideoDimensions,
): Point | null {
  const mapped = rawToAperture(point, dimensions);
  return mapped ? { x: 1 - mapped.x, y: mapped.y } : null;
}
export function rawRectToAperture(
  region: NormalizedRect,
  dimensions: VideoDimensions,
): NormalizedRect | null {
  if (!validRect(region)) return null;
  const start = rawToAperture(region, dimensions);
  const end = rawToAperture(
    { x: region.x + region.width, y: region.y + region.height },
    dimensions,
  );
  return start && end
    ? {
        x: start.x,
        y: start.y,
        width: end.x - start.x,
        height: end.y - start.y,
      }
    : null;
}
export function rawRectToMirroredAperture(
  region: NormalizedRect,
  dimensions: VideoDimensions,
): NormalizedRect | null {
  const mapped = rawRectToAperture(region, dimensions);
  return mapped ? { ...mapped, x: 1 - mapped.x - mapped.width } : null;
}
function apertureRectToRaw(
  region: NormalizedRect,
  dimensions: VideoDimensions,
): NormalizedRect | null {
  if (!validRect(region)) return null;
  const start = apertureToRaw(region, dimensions);
  const end = apertureToRaw(
    { x: region.x + region.width, y: region.y + region.height },
    dimensions,
  );
  return start && end
    ? {
        x: start.x,
        y: start.y,
        width: end.x - start.x,
        height: end.y - start.y,
      }
    : null;
}
/** Safe subsection -> the SAME visible safe subsection, so there is no second stretch. */
export function apertureCalibration({
  slot = "A",
  handedness = "right",
  ...dimensions
}: VideoDimensions & {
  slot?: Slot;
  handedness?: "left" | "right";
}): GestureCalibration | null {
  const aspect = sourceAspect(dimensions);
  const cameraRegion = apertureRectToRaw(APERTURE_SAFE_REGION, dimensions);
  const interaction = apertureRectToRaw(
    { x: slot === "A" ? 0.66 : 0.18, y: 0.32, width: 0.16, height: 0.38 },
    dimensions,
  );
  if (aspect === null || !cameraRegion || !interaction) return null;
  const calibration: GestureCalibration = {
    version: 1,
    mirrored: false,
    handedness,
    cameraRegion,
    stageRegion: { ...APERTURE_SAFE_REGION },
    offerRegion: { ...interaction },
    acceptRegion: { ...interaction },
    sourceAspect: aspect,
  };
  return validCalibration(calibration) ? calibration : null;
}
export function calibrationMatchesVideo(
  calibration: GestureCalibration,
  dimensions: VideoDimensions,
): boolean {
  const aspect = sourceAspect(dimensions);
  return (
    validCalibration(calibration) &&
    aspect !== null &&
    (calibration.sourceAspect === undefined ||
      Math.abs(aspect - calibration.sourceAspect) <=
        calibration.sourceAspect * 1e-6)
  );
}
export function defaultCalibration({
  slot = "A",
  mirrored = true,
  handedness = "right",
}: {
  slot?: Slot;
  mirrored?: boolean;
  handedness?: "left" | "right";
} = {}): GestureCalibration {
  const interaction = {
    x: slot === "A" ? 0.66 : 0.1,
    y: 0.22,
    width: 0.24,
    height: 0.56,
  };
  return {
    version: 1,
    mirrored,
    handedness,
    cameraRegion: { x: 0.08, y: 0.08, width: 0.84, height: 0.84 },
    stageRegion: { x: 0.1, y: 0.12, width: 0.8, height: 0.76 },
    offerRegion: { ...interaction },
    acceptRegion: { ...interaction },
  };
}
export function containsPoint(
  rect: NormalizedRect,
  point: Point,
  inset = 0,
): boolean {
  return (
    point.x >= rect.x + inset - EPSILON &&
    point.x <= rect.x + rect.width - inset + EPSILON &&
    point.y >= rect.y + inset - EPSILON &&
    point.y <= rect.y + rect.height - inset + EPSILON
  );
}
function validRect(rect: NormalizedRect) {
  return (
    !!rect &&
    [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x + rect.width > rect.x &&
    rect.y + rect.height > rect.y &&
    rect.x + rect.width <= 1.00001 &&
    rect.y + rect.height <= 1.00001
  );
}
export function validCalibration(
  value: GestureCalibration | null,
): value is GestureCalibration {
  if (
    !value ||
    value.version !== 1 ||
    typeof value.mirrored !== "boolean" ||
    !["left", "right"].includes(value.handedness)
  )
    return false;
  if (
    value.sourceAspect !== undefined &&
    (!Number.isFinite(value.sourceAspect) || value.sourceAspect <= 0)
  )
    return false;
  if (
    ![
      value.cameraRegion,
      value.stageRegion,
      value.offerRegion,
      value.acceptRegion,
    ].every(validRect)
  )
    return false;
  return [value.offerRegion, value.acceptRegion].every(
    (region) =>
      containsPoint(value.cameraRegion, region) &&
      containsPoint(value.cameraRegion, {
        x: region.x + region.width,
        y: region.y + region.height,
      }),
  );
}
export function previewPoint(rawPoint: Point, mirrored: boolean): Point {
  return { x: mirrored ? 1 - rawPoint.x : rawPoint.x, y: rawPoint.y };
}
/** Map once, preserve aspect/crop in the renderer, and reject points outside calibration. */
export function cameraToStage(
  rawPoint: Point,
  calibration: GestureCalibration,
): Point | null {
  if (
    !validCalibration(calibration) ||
    !Number.isFinite(rawPoint.x) ||
    !Number.isFinite(rawPoint.y)
  )
    return null;
  const point = previewPoint(rawPoint, calibration.mirrored);
  if (!containsPoint(calibration.cameraRegion, point)) return null;
  const camera = calibration.cameraRegion;
  const stage = calibration.stageRegion;
  return {
    x: stage.x + ((point.x - camera.x) / camera.width) * stage.width,
    y: stage.y + ((point.y - camera.y) / camera.height) * stage.height,
  };
}
/** Cue gates and drift use the same visible coordinates as the rendered grip. */
export function interactionRegionToStage(
  region: NormalizedRect,
  calibration: GestureCalibration,
): NormalizedRect | null {
  if (
    !validCalibration(calibration) ||
    !validRect(region) ||
    !containsPoint(calibration.cameraRegion, region) ||
    !containsPoint(calibration.cameraRegion, {
      x: region.x + region.width,
      y: region.y + region.height,
    })
  )
    return null;
  const camera = calibration.cameraRegion,
    stage = calibration.stageRegion;
  return {
    x: stage.x + ((region.x - camera.x) / camera.width) * stage.width,
    y: stage.y + ((region.y - camera.y) / camera.height) * stage.height,
    width: (region.width / camera.width) * stage.width,
    height: (region.height / camera.height) * stage.height,
  };
}
export function stableAnchor(
  previous: Point | null,
  next: Point,
  deadZone = 0.018,
): Point {
  if (!previous) return next;
  if (Math.hypot(next.x - previous.x, next.y - previous.y) < deadZone)
    return previous;
  return {
    x: previous.x + (next.x - previous.x) * 0.35,
    y: previous.y + (next.y - previous.y) * 0.35,
  };
}
