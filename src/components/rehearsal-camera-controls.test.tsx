import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RehearsalCameraControls } from "./rehearsal-camera-controls";

function props() {
  return {
    camera: {
      preview: null,
      enabled: false,
      pending: false,
      error: null,
      videoBlocked: false,
      enable: vi.fn(async () => {}),
      disable: vi.fn(),
      resume: vi.fn(async () => true),
    },
    consented: false,
    onConsent: vi.fn(),
    anchor: { x: 0.65, y: 0.6 },
    onAnchor: vi.fn(),
    calibration: null,
    onCalibrated: vi.fn(),
    gesture: {
      enabled: false,
      error: null,
      status: "Gestures are off. Buttons remain available.",
      confidence: 0,
      dwellProgress: 0,
      anchor: null,
      inferenceMs: null,
      processing: "unavailable" as const,
      enable: vi.fn(async () => {}),
      disable: vi.fn(),
    },
    armed: false,
    onArmed: vi.fn(),
    locked: false,
    canOffer: false,
    canAccept: false,
    onOffer: vi.fn(),
    onAccept: vi.fn(),
  };
}

describe("local rehearsal camera controls", () => {
  it("requires consent before enabling capture and explains the control-message boundary", () => {
    const state = props();
    const html = renderToStaticMarkup(<RehearsalCameraControls {...state} />);
    expect(html).toContain("Camera frames and hand landmarks are not uploaded");
    expect(html).toContain(
      "Offer and Accept cues still update the show server",
    );
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>[\s\S]*?Enable local camera/,
    );
    expect(html).not.toContain("Join camera room");
    expect(state.camera.enable).not.toHaveBeenCalled();
  });

  it("keeps a cancellation action visible while native permission is pending", () => {
    const state = props();
    state.camera.pending = true;
    state.consented = true;
    const html = renderToStaticMarkup(<RehearsalCameraControls {...state} />);
    expect(html).toContain("Cancel camera request");
    expect(html).toContain("A late permission grant will be stopped");
    expect(state.camera.enable).not.toHaveBeenCalled();
  });
});
