import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  apertureCalibration,
  apertureToRaw,
  cameraToStage,
  rawToMirroredAperture,
} from "@/vision/calibration";
import { ROOMS, STAGE_HEIGHT } from "./scene-art";
import { stagePointForAperture } from "./coordinates";
import { makeUmbrella, UMBRELLA_GRIP } from "./props";

describe("camera crop, private marker, and umbrella grip share one spatial contract", () => {
  for (const [videoWidth, videoHeight] of [
    [1920, 1080],
    [640, 480],
    [1080, 1920],
    [2560, 1080],
    [1000, 1000],
  ]) {
    it(`keeps the visible hand and grip coincident for ${videoWidth}×${videoHeight}`, () => {
      const dimensions = { videoWidth, videoHeight };
      const umbrella = makeUmbrella();
      for (const slot of ["A", "B"] as const) {
        const calibration = apertureCalibration({ ...dimensions, slot });
        expect(calibration).not.toBeNull();
        for (const point of [
          { x: 0.2, y: 0.35 },
          { x: 0.5, y: 0.5 },
          { x: 0.8, y: 0.68 },
        ]) {
          const raw = apertureToRaw(point, dimensions)!;
          const mapped = cameraToStage(raw, calibration!)!;
          expect(mapped.x).toBeCloseTo(point.x, 10);
          expect(mapped.y).toBeCloseTo(point.y, 10);
          const marker = rawToMirroredAperture(raw, dimensions)!;
          expect(1 - marker.x).toBeCloseTo(mapped.x, 10);
          expect(marker.y).toBeCloseTo(mapped.y, 10);
          const stage = stagePointForAperture(slot, mapped),
            room = ROOMS[slot];
          const expected = new THREE.Vector3(
            room.x + point.x * room.w,
            STAGE_HEIGHT - room.y - point.y * room.h,
            90,
          );
          for (const angle of [-0.6, -0.15, 0, 0.3, 0.9]) {
            umbrella.group.position.set(stage.x, stage.y, 90);
            umbrella.group.rotation.z = angle;
            umbrella.group.updateMatrixWorld(true);
            const grip = umbrella.body.localToWorld(
              new THREE.Vector3(
                UMBRELLA_GRIP.x,
                UMBRELLA_GRIP.y,
                UMBRELLA_GRIP.z,
              ),
            );
            expect(grip.distanceTo(expected)).toBeLessThan(1e-8);
          }
        }
      }
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>();
      umbrella.group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) geometries.add(mesh.geometry);
        if (mesh.material)
          (Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]
          ).forEach((material) => materials.add(material));
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    });
  }
  it("does not silently apply another inset to valid Program coordinates", () => {
    for (const point of [
      { x: 0, y: 0 },
      { x: 0.1, y: 0.9 },
      { x: 1, y: 1 },
    ]) {
      const actual = stagePointForAperture("B", point),
        room = ROOMS.B;
      expect(actual.x).toBe(room.x + point.x * room.w);
      expect(actual.y).toBe(STAGE_HEIGHT - room.y - point.y * room.h);
    }
  });
});
