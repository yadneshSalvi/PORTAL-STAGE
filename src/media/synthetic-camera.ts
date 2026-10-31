import type { Slot } from "../lib/contracts";

/** Original test pattern. Its provenance is burned into the transmitted pixels. */
export function createSyntheticCamera(slot: Slot): {
  stream: MediaStream;
  stop: () => void;
} {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context || !canvas.captureStream)
    throw new Error("Canvas video capture is unavailable.");
  const started = performance.now();
  let frame = 0;
  let stopped = false;
  const draw = () => {
    if (stopped) return;
    const elapsed = performance.now() - started;
    context.fillStyle = slot === "A" ? "#30243a" : "#112d39";
    context.fillRect(0, 0, 1280, 720);
    context.strokeStyle = "#566071";
    context.lineWidth = 2;
    for (let x = 0; x < 1280; x += 80) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, 720);
      context.stroke();
    }
    for (let y = 0; y < 720; y += 80) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(1280, y);
      context.stroke();
    }
    context.fillStyle = slot === "A" ? "#f2bc62" : "#64d8c8";
    context.beginPath();
    context.arc(
      640 + Math.sin(elapsed / 700) * 330,
      350 + Math.cos(elapsed / 1100) * 120,
      85,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.fillStyle = "#111827";
    context.fillRect(24, 24, 1232, 126);
    context.fillRect(24, 584, 1232, 112);
    context.fillStyle = "#f3ebdc";
    context.font = "bold 40px sans-serif";
    context.fillText(`SYNTHETIC MEDIA / TRANSPORT TEST — SLOT ${slot}`, 46, 80);
    context.font = "26px monospace";
    context.fillText(
      "Original animated test pattern • no human camera",
      46,
      124,
    );
    context.fillText(
      `${(elapsed / 1000).toFixed(2)} seconds • not a remote-performance claim`,
      46,
      632,
    );
    context.fillText("PORTAL STAGE / LOCAL DEVELOPMENT", 46, 674);
    frame = requestAnimationFrame(draw);
  };
  draw();
  const stream = canvas.captureStream(30);
  return {
    stream,
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}
