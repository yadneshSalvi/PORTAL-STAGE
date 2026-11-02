import type * as THREE from "three";

/** A pixel copy of the one canonical render, not another renderer or show clock. */
export function createProgramFrame(
  source: HTMLCanvasElement,
  createCanvas = () => document.createElement("canvas"),
) {
  const canvas = createCanvas();
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context)
    throw new Error("The clean Program capture could not be opened.");
  return {
    canvas,
    copy() {
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
    },
    dispose() {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

/** Capture before the local overlay, synchronously in the same frame. */
export function presentCanonicalFrame(
  renderer: Pick<THREE.WebGLRenderer, "autoClear" | "render" | "clearDepth">,
  scene: THREE.Scene,
  camera: THREE.Camera,
  program: ReturnType<typeof createProgramFrame> | null,
  directorFeedback: THREE.Scene | null,
) {
  renderer.autoClear = true;
  renderer.render(scene, camera);
  program?.copy();
  if (directorFeedback) {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(directorFeedback, camera);
    renderer.autoClear = true;
  }
}
