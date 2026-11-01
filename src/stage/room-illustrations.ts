import type { ShowState, Slot } from "@/lib/contracts";
import {
  archPath,
  canvasTexture,
  GOLD,
  PAPER,
  plane,
  ROOMS,
  TEAL,
} from "./scene-art";

function star(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color = GOLD,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const r = i % 2 ? radius * 0.3 : radius;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
}
function illustratedRoom(
  ctx: CanvasRenderingContext2D,
  show: ShowState,
  slot: Slot,
  time: number,
  calm: boolean,
) {
  const r = ROOMS[slot];
  const parcel = show.episode === "midnight-parcel";
  ctx.save();
  archPath(ctx, r.x, r.y, r.w, r.h);
  ctx.clip();
  const bg = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
  bg.addColorStop(0, parcel ? "#354153" : "#65505e");
  bg.addColorStop(1, "#272638");
  ctx.fillStyle = bg;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = "#f3ebdc09";
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.moveTo(r.x + i * 90, r.y);
    ctx.lineTo(r.x + i * 90, r.y + r.h);
    ctx.stroke();
  }
  const cx = r.x + r.w * 0.58,
    cy = r.y + 160;
  ctx.fillStyle = "#1c2a3a";
  ctx.beginPath();
  ctx.arc(cx, cy, 82, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#c9976a";
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.fillStyle = "#e9dcc0";
  ctx.beginPath();
  ctx.arc(cx + 20, cy - 15, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1c2a3a";
  ctx.beginPath();
  ctx.arc(cx + 31, cy - 23, 22, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 9; i++)
    star(
      ctx,
      cx - 55 + ((i * 43) % 110),
      cy - 55 + ((i * 29) % 110),
      2.5,
      "#f3ebdc99",
    );
  ctx.fillStyle = "#362f3c";
  ctx.fillRect(r.x, r.y + r.h - 100, r.w, 100);
  ctx.fillStyle = "#a97857";
  ctx.fillRect(r.x + 44, r.y + 250, 145, 12);
  ctx.fillRect(r.x + 44, r.y + 340, 145, 12);
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = ["#719a8e", "#d3a06d", "#aa7381", "#a8b6a5"][i % 4];
      ctx.fillRect(
        r.x + 55 + i * 20,
        r.y + 205 + row * 90 - (i % 3) * 5,
        14,
        43 + (i % 3) * 5,
      );
    }
  ctx.fillStyle = "#a57557";
  ctx.beginPath();
  ctx.roundRect(r.x + 230, r.y + 405, 310, 22, 7);
  ctx.fill();
  ctx.fillStyle = "#67473e";
  ctx.fillRect(r.x + 250, r.y + 425, 16, 100);
  ctx.fillRect(r.x + 505, r.y + 425, 16, 100);
  if (parcel) {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = ["#b77e55", "#d3a677", "#936b62"][i];
      ctx.fillRect(r.x + 260 + i * 68, r.y + 370 - i * 12, 58, 35 + i * 12);
      ctx.strokeStyle = "#f3ebdc66";
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 282 + i * 68, r.y + 370 - i * 12, 12, 35 + i * 12);
    }
  } else {
    ctx.fillStyle = "#5a8e83";
    ctx.beginPath();
    ctx.roundRect(r.x + 63, r.y + 397, 130, 110, 26);
    ctx.fill();
    ctx.fillStyle = "#7fa69a";
    ctx.beginPath();
    ctx.roundRect(r.x + 63, r.y + 465, 130, 35, 14);
    ctx.fill();
    ctx.fillStyle = "#d3b077";
    ctx.fillRect(r.x + 79, r.y + 500, 10, 35);
    ctx.fillRect(r.x + 167, r.y + 500, 10, 35);
    ctx.fillStyle = "#e5d6b6";
    ctx.beginPath();
    ctx.moveTo(r.x + 330, r.y + 400);
    ctx.lineTo(r.x + 377, r.y + 365 + (calm ? 0 : Math.sin(time * 0.8) * 5));
    ctx.lineTo(r.x + 398, r.y + 399);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
function roomMagic(
  ctx: CanvasRenderingContext2D,
  show: ShowState,
  slot: Slot,
  now: number,
  time: number,
  calm: boolean,
) {
  const r = ROOMS[slot];
  const reveal = calm
    ? 1
    : Math.min(1, Math.max(0, (now - (show.parcel?.openedAt ?? now)) / 1500));
  ctx.save();
  archPath(ctx, r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.globalAlpha = reveal;
  if (show.parcel?.contents === "stars") {
    ctx.fillStyle = "#2b386d45";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    const points = Array.from({ length: 16 }, (_, i) => ({
      x: r.x + 55 + ((i * 137) % (r.w - 110)),
      y: r.y + 60 + ((i * 79) % (r.h - 120)),
    }));
    ctx.strokeStyle = "#dfd7ad5c";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    points.slice(0, 7).forEach((p, i) => {
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    ctx.stroke();
    points.forEach((p, i) =>
      star(
        ctx,
        p.x,
        p.y + (calm ? 0 : Math.sin(time * 0.5 + i) * 5),
        5 + (i % 3) * 3,
        i % 2 ? PAPER : GOLD,
      ),
    );
    ctx.strokeStyle = "#f2bc6250";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(r.x + r.w / 2, r.y + 270, 220, 70, -0.3, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#315b4830";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    for (let i = 0; i < 13; i++) {
      const x = r.x + 15 + i * 50,
        height = (110 + ((i * 73) % 240)) * reveal,
        sway = calm ? 0 : Math.sin(time * 0.6 + i) * 8;
      ctx.strokeStyle = i % 2 ? "#9bd5ab" : "#5faba0";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, r.y + r.h);
      ctx.quadraticCurveTo(
        x - 35 + sway,
        r.y + r.h - height * 0.6,
        x + sway,
        r.y + r.h - height,
      );
      ctx.stroke();
      for (let leaf = 1; leaf < 4; leaf++) {
        ctx.fillStyle = leaf % 2 ? "#75bd9dcc" : "#b4d998bb";
        ctx.beginPath();
        ctx.ellipse(
          x + sway + (leaf % 2 ? 14 : -16),
          r.y + r.h - (height * leaf) / 4,
          22,
          8,
          leaf % 2 ? -0.5 : 0.5,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      star(ctx, x + sway, r.y + r.h - height, 8, i % 2 ? "#f0b5a4" : "#f2d99b");
    }
  }
  ctx.restore();
}

export function makeRoomIllustrations() {
  const scenery = canvasTexture(),
    magic = canvasTexture();
  const sceneryMesh = plane(scenery.texture, -40),
    magicMesh = plane(magic.texture, 120);
  let lastPaint = -Infinity;
  let lastRevision = -1;
  return {
    sceneryMesh,
    magicMesh,
    update(show: ShowState, now: number, time: number, calm: boolean) {
      if (time - lastPaint < 125 && show.revision === lastRevision) return;
      lastPaint = time;
      lastRevision = show.revision;
      const seconds = time / 1000;
      scenery.ctx.clearRect(0, 0, 1920, 1080);
      for (const slot of ["A", "B"] as Slot[])
        if (
          (show.mode === "solo" && slot === "B") ||
          show.episode === "midnight-parcel"
        )
          illustratedRoom(scenery.ctx, show, slot, seconds, calm);
      scenery.texture.needsUpdate = true;
      magic.ctx.clearRect(0, 0, 1920, 1080);
      if (show.parcel?.opened && show.parcel.transformedRoom)
        roomMagic(
          magic.ctx,
          show,
          show.parcel.transformedRoom,
          now,
          seconds,
          calm,
        );
      const effects = (show.presenceEffects || []).filter(
        (effect) => now >= effect.at && now - effect.at < 3000,
      );
      for (const effect of effects.filter(
        (effect, index, all) =>
          index ===
          all.findLastIndex((other) => other.effect === effect.effect),
      )) {
        const age = (now - effect.at) / 3000;
        if (effect.effect === "thunder") {
          if (calm) {
            magic.ctx.strokeStyle = "#f2bc6266";
            magic.ctx.lineWidth = 4;
            magic.ctx.strokeRect(125, 220, 1670, 590);
          } else {
            magic.ctx.fillStyle = `rgba(242,188,98,${Math.sin(age * Math.PI) * 0.035})`;
            magic.ctx.fillRect(125, 220, 1670, 590);
          }
        }
        if (effect.effect === "rain")
          for (let i = 0; i < 18; i++) {
            const x = 180 + i * 90,
              y = 300 + (calm ? (i * 23) % 350 : (seconds * 85 + i * 31) % 420);
            magic.ctx.strokeStyle = "#9bdad399";
            magic.ctx.lineWidth = 2;
            magic.ctx.beginPath();
            magic.ctx.moveTo(x, y);
            magic.ctx.lineTo(x - 3, y + 13);
            magic.ctx.stroke();
          }
        if (effect.effect === "cheer")
          for (let i = 0; i < 7; i++)
            star(
              magic.ctx,
              780 + i * 60,
              700 -
                (calm
                  ? (i % 2) * 16
                  : Math.sin(age * Math.PI) * (35 + (i % 3) * 10)),
              4 + (i % 3),
              i % 2 ? TEAL : GOLD,
            );
      }
      magic.texture.needsUpdate = true;
    },
  };
}
