import * as THREE from "three";
import type { ShowState, Slot } from "@/lib/contracts";
import { drawStageCaption } from "./program-caption";

export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;
export const ROOMS = {
  A: { x: 138, y: 232, w: 650, h: 562 },
  B: { x: 1132, y: 232, w: 650, h: 562 },
};
export const INK = "#111827",
  PAPER = "#F3EBDC",
  GOLD = "#F2BC62",
  TEAL = "#64D8C8",
  CORAL = "#F17E78";
/** Titles stay between the curtains, clear of both side drapes. */
export const TITLE_MAX_WIDTH = 1440;
export function canvasTexture(width = STAGE_WIDTH, height = STAGE_HEIGHT) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("A canvas context could not be opened.");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return { canvas, ctx, texture };
}
export function plane(
  texture: THREE.Texture,
  z: number,
  width = STAGE_WIDTH,
  height = STAGE_HEIGHT,
) {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.set(width / 2, STAGE_HEIGHT - height / 2, z);
  return mesh;
}
export function archPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}
function text(
  ctx: CanvasRenderingContext2D,
  content: string,
  x: number,
  y: number,
  size: number,
  color: string,
  family = "Inter",
  align: CanvasTextAlign = "center",
  maxWidth?: number,
) {
  ctx.font = `${size}px ${family}, ${family === "Fraunces" ? "Georgia" : "Arial"}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  if (maxWidth === undefined) ctx.fillText(content, x, y);
  else ctx.fillText(content, x, y, maxWidth);
}
export function makeScenery() {
  const art = canvasTexture();
  const { ctx } = art;
  const bg = ctx.createLinearGradient(0, 0, 0, 1080);
  bg.addColorStop(0, "#161D2B");
  bg.addColorStop(1, "#30243A");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1920, 1080);
  const glow = ctx.createRadialGradient(960, 480, 30, 960, 480, 520);
  glow.addColorStop(0, "#F2BC6224");
  glow.addColorStop(0.48, "#64D8C80C");
  glow.addColorStop(1, "#64D8C800");
  ctx.fillStyle = glow;
  ctx.fillRect(350, 100, 1220, 880);
  ctx.fillStyle = "#F3EBDC55";
  for (let i = 0; i < 66; i++) {
    ctx.beginPath();
    ctx.arc(
      105 + ((i * 173) % 1710),
      120 + ((i * 79) % 640),
      i % 7 === 0 ? 2.3 : 1.1,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  for (const slot of ["A", "B"] as Slot[]) {
    const { x, y, w, h } = ROOMS[slot];
    ctx.save();
    archPath(ctx, x, y, w, h);
    ctx.clip();
    const room = ctx.createLinearGradient(x, y, x, y + h);
    room.addColorStop(0, slot === "A" ? "#28535B" : "#705260");
    room.addColorStop(1, slot === "A" ? "#132C39" : "#30243A");
    ctx.fillStyle = room;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = slot === "A" ? "#E5E6C6" : "#E3B780";
    ctx.beginPath();
    ctx.arc(x + (slot === "A" ? 210 : 445), y + 135, 67, 0, Math.PI * 2);
    ctx.fill();
    if (slot === "A") {
      ctx.fillStyle = "#28535B";
      ctx.beginPath();
      ctx.arc(x + 232, y + 113, 59, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = slot === "A" ? "#3B6265" : "#98728255";
    ctx.beginPath();
    ctx.moveTo(x - 5, y + h);
    ctx.lineTo(x - 5, y + 365);
    ctx.lineTo(x + 160, y + 270);
    ctx.lineTo(x + 310, y + 410);
    ctx.lineTo(x + 460, y + 315);
    ctx.lineTo(x + 670, y + 420);
    ctx.lineTo(x + 670, y + h);
    ctx.fill();
    ctx.fillStyle = slot === "A" ? "#1B3E48" : "#463745";
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + 475);
    ctx.lineTo(x + 225, y + 390);
    ctx.lineTo(x + 410, y + 490);
    ctx.lineTo(x + 600, y + 420);
    ctx.lineTo(x + 660, y + h);
    ctx.fill();
    ctx.strokeStyle = slot === "A" ? "#9EC2A766" : "#CDAAA166";
    ctx.lineWidth = 4;
    if (slot === "B") {
      ctx.beginPath();
      ctx.moveTo(x, y + 420);
      ctx.lineTo(x + w, y + 420);
      ctx.moveTo(x, y + 446);
      ctx.lineTo(x + w, y + 446);
      for (let i = 0; i < 15; i++) {
        ctx.moveTo(x + i * 48, y + 420);
        ctx.lineTo(x + i * 48, y + h);
      }
      ctx.stroke();
    }
    for (let side = 0; side < 2; side++) {
      const px = x + (side ? 570 : 70);
      ctx.strokeStyle = "#8BAD9A99";
      ctx.beginPath();
      ctx.moveTo(px, y + h);
      ctx.quadraticCurveTo(
        px + (side ? 24 : -18),
        y + h - 95,
        px - 13,
        y + h - 160,
      );
      ctx.moveTo(px + 1, y + h - 53);
      ctx.lineTo(px - 28, y + h - 78);
      ctx.moveTo(px + 3, y + h - 78);
      ctx.lineTo(px + 30, y + h - 110);
      ctx.moveTo(px, y + h - 115);
      ctx.lineTo(px - 24, y + h - 129);
      ctx.stroke();
    }
    ctx.restore();
    for (const pad of [0, 12, 24]) {
      archPath(ctx, x - pad, y - pad, w + pad * 2, h + pad);
      ctx.strokeStyle = pad === 0 ? "#E6BD79B5" : "#E6BD793A";
      ctx.lineWidth = pad === 0 ? 3 : 1;
      ctx.stroke();
    }
  }
  const floor = ctx.createLinearGradient(0, 790, 0, 1080);
  floor.addColorStop(0, "#8C6456");
  floor.addColorStop(0.07, "#4D3940");
  floor.addColorStop(1, "#171D2B");
  ctx.fillStyle = floor;
  ctx.fillRect(0, 794, 1920, 286);
  ctx.strokeStyle = "#BD926132";
  ctx.lineWidth = 1;
  for (const fy of [813, 859, 925, 1018]) {
    ctx.beginPath();
    ctx.moveTo(0, fy);
    ctx.lineTo(1920, fy);
    ctx.stroke();
  }
  ctx.strokeStyle = "#11182780";
  ctx.lineWidth = 2;
  for (let x = -200; x < 2200; x += 235) {
    ctx.beginPath();
    ctx.moveTo(960 + (x - 960) * 0.65, 794);
    ctx.lineTo(x, 1080);
    ctx.stroke();
  }
  for (const slot of ["A", "B"] as Slot[]) {
    const { x, w } = ROOMS[slot];
    ctx.fillStyle = "#B88C6E";
    ctx.fillRect(x - 25, 790, w + 50, 16);
    ctx.fillStyle = "#322B35";
    ctx.fillRect(x - 25, 806, w + 50, 12);
  }
  const curtain = ctx.createLinearGradient(0, 0, 130, 0);
  curtain.addColorStop(0, "#1A1929");
  curtain.addColorStop(0.5, "#503149");
  curtain.addColorStop(1, "#201B2E");
  ctx.fillStyle = curtain;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(120, 0);
  ctx.quadraticCurveTo(112, 230, 50, 788);
  ctx.lineTo(0, 835);
  ctx.fill();
  ctx.save();
  ctx.translate(1920, 0);
  ctx.scale(-1, 1);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(120, 0);
  ctx.quadraticCurveTo(112, 230, 50, 788);
  ctx.lineTo(0, 835);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#3B293F";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(1920, 0);
  ctx.lineTo(1920, 50);
  for (let i = 0; i < 4; i++) {
    const x = 1920 - i * 480;
    ctx.quadraticCurveTo(x - 240, 142, x - 480, 50);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#E6BD7955";
  ctx.lineWidth = 1;
  ctx.stroke();
  return art;
}
export function drawProgramText(
  ctx: CanvasRenderingContext2D,
  show: ShowState,
  now: number,
  available: Record<Slot, boolean> = { A: true, B: true },
  options: { localCameraA?: boolean } = {},
) {
  ctx.clearRect(0, 0, 1920, 1080);
  text(
    ctx,
    show.preset.episodeTitle,
    960,
    151,
    64,
    PAPER,
    "Fraunces",
    "center",
    TITLE_MAX_WIDTH,
  );
  for (const slot of ["A", "B"] as Slot[]) {
    const p = show.participants[slot],
      room = ROOMS[slot];
    const rehearsalRoom =
      show.episode === "midnight-parcel"
        ? slot === "A"
          ? "Midnight Post"
          : "Receiving Room"
        : slot === "A"
          ? "Moon Garden"
          : "Rooftop at Dusk";
    text(
      ctx,
      show.mode === "rehearsal"
        ? options.localCameraA && slot === "A"
          ? "You"
          : rehearsalRoom
        : show.mode === "solo" && slot === "B"
          ? "Audience Room"
          : p.name,
      room.x + room.w / 2,
      855,
      24,
      show.umbrella.owner === slot ? GOLD : "#D5D0CC",
    );
    if (
      show.mode !== "rehearsal" &&
      !(show.mode === "solo" && slot === "B") &&
      (!p.admitted ||
        !p.connected ||
        !p.camera ||
        !p.consentBroadcast ||
        !available[slot])
    ) {
      ctx.save();
      archPath(ctx, room.x, room.y, room.w, room.h);
      ctx.clip();
      const g = ctx.createLinearGradient(room.x, 0, room.x + room.w, 0);
      g.addColorStop(0, "#281F34");
      g.addColorStop(0.45, "#493047");
      g.addColorStop(1, "#281F34");
      ctx.fillStyle = g;
      ctx.fillRect(room.x, room.y, room.w, room.h);
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#11182722" : "#FFFFFF03";
        ctx.fillRect(room.x + i * 55, room.y, 28, room.h);
      }
      text(ctx, "✦", room.x + room.w / 2, 505, 64, GOLD);
      text(
        ctx,
        p.admitted ? "Back shortly" : "Waiting in the wings",
        room.x + room.w / 2,
        563,
        36,
        PAPER,
        "Fraunces",
      );
      ctx.restore();
    }
  }
  drawStageCaption(ctx, show, now);
  if (show.phase !== "live") {
    const title =
      show.phase === "ended"
        ? "Show ended"
        : show.phase === "hold"
          ? "On hold"
          : "Ready when you are";
    ctx.fillStyle = "#1C1929F2";
    ctx.fillRect(0, 0, 1920, 1080);
    const g = ctx.createLinearGradient(0, 0, 1920, 0);
    g.addColorStop(0, "#30243A");
    g.addColorStop(0.5, "#493047");
    g.addColorStop(1, "#30243A");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1920, 1080);
    for (let i = 0; i < 28; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#11182722" : "#FFFFFF03";
      ctx.fillRect(i * 70, 0, 35, 1080);
    }
    text(ctx, "✦", 960, 392, 64, GOLD);
    text(ctx, title, 960, 521, 64, PAPER, "Fraunces");
    text(
      ctx,
      show.preset.episodeTitle,
      960,
      588,
      36,
      "#CEB59A",
      "Inter",
      "center",
      TITLE_MAX_WIDTH,
    );
  }
  if (show.mode === "rehearsal") {
    ctx.fillStyle = "#111827ed";
    ctx.beginPath();
    ctx.roundRect(70, 52, 176, 44, 22);
    ctx.fill();
    text(ctx, "Rehearsal", 158, 82, 24, GOLD);
    const fixtureDecision = Object.values(show.decisions || {}).some(
      (decision) =>
        decision.source === "rehearsal" &&
        now >= decision.at &&
        now - decision.at < 10_000,
    );
    if (
      show.phase === "live" &&
      ((show.round &&
        ["open", "closing", "closed"].includes(show.round.status)) ||
        fixtureDecision)
    ) {
      ctx.fillStyle = "#111827ed";
      ctx.beginPath();
      ctx.roundRect(258, 52, 164, 44, 22);
      ctx.fill();
      text(ctx, "Test vote", 340, 82, 24, GOLD);
    }
  }
}
