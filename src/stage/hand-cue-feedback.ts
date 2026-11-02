import * as THREE from "three";
import type { HandCueFeedback } from "@/vision/local-hand-presentation";
import { canvasTexture, GOLD, plane } from "./scene-art";
import { stagePointForAperture } from "./coordinates";

const WIDTH = 320;
const HEIGHT = 160;
const CENTER = { x: WIDTH / 2, y: 45 };
const RADIUS = 27;

export function drawHandCueFeedback(
  ctx: CanvasRenderingContext2D,
  feedback: HandCueFeedback,
) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.save();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  if (feedback.ring) {
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(CENTER.x, CENTER.y, RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.85 + feedback.flash * 0.15;
    ctx.lineWidth = 2 + feedback.flash * 2;
    ctx.beginPath();
    // Canvas y points down, so a positive arc from noon fills clockwise.
    ctx.arc(
      CENTER.x,
      CENTER.y,
      RADIUS,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * Math.min(1, Math.max(0, feedback.progress)),
    );
    ctx.stroke();
  }
  if (feedback.lowerHand) {
    ctx.globalAlpha = 0.9;
    ctx.font = "15px Inter, Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = GOLD;
    ctx.shadowColor = "#111827";
    ctx.shadowBlur = 5;
    ctx.fillText("Lower your hand", CENTER.x, 89);
    ctx.fillText("before the next cue", CENTER.x, 109);
  }
  ctx.restore();
}

export function makeHandCueFeedback() {
  const art = canvasTexture(WIDTH, HEIGHT);
  const scene = new THREE.Scene();
  const mesh = plane(art.texture, 190, WIDTH, HEIGHT);
  mesh.material.depthTest = false;
  scene.add(mesh);
  let lastKey = "";
  return {
    scene,
    update(feedback: HandCueFeedback | null): boolean {
      if (!feedback) return false;
      const position = stagePointForAperture(feedback.slot, feedback.point);
      mesh.position.set(position.x, position.y + CENTER.y - HEIGHT / 2, 190);
      const key = `${feedback.ring}:${feedback.progress}:${feedback.flash}:${feedback.lowerHand}`;
      if (lastKey !== key) {
        drawHandCueFeedback(art.ctx, feedback);
        art.texture.needsUpdate = true;
        lastKey = key;
      }
      return true;
    },
    invalidate() {
      lastKey = "";
    },
    dispose() {
      mesh.geometry.dispose();
      mesh.material.dispose();
      art.texture.dispose();
    },
  };
}
