import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Slot } from "@/lib/contracts";
import { createRecord } from "@/server/core";
import { DeviceSetup, type MediaRoom } from "./device-setup";

const media = {
  localPreview: null,
  cameraEnabled: false,
  microphoneEnabled: false,
  cameraRequestPending: false,
  devices: [],
  selectedDevices: {},
  status: "disconnected",
  connected: false,
  error: null,
} as unknown as MediaRoom;

function renderSetup(slot: Slot, savedHand?: "left" | "right") {
  const show = createRecord("ps_cue_defaults", "director", "live", 1000).state;
  if (savedHand) {
    show.participants[slot].calibrated = true;
    show.participants[slot].handedness = savedHand;
  }
  return renderToStaticMarkup(
    <DeviceSetup
      show={show}
      slot={slot}
      media={media}
      run={async () => null}
      busy={false}
    />,
  );
}

describe("device setup cue hand", () => {
  it.each([
    ["A", "left", "Left", "right", "Right"],
    ["B", "right", "Right", "left", "Left"],
  ] as const)(
    "defaults uncalibrated %s to %s and keeps the other hand selectable",
    (slot, hand, label, otherHand, otherLabel) => {
      const html = renderSetup(slot);
      expect(html).toContain(
        `<option value="${hand}" selected="">${label} hand</option>`,
      );
      expect(html).toContain(
        `<option value="${otherHand}">${otherLabel} hand</option>`,
      );
    },
  );

  it.each([
    ["A", "right", "Right"],
    ["B", "left", "Left"],
  ] as const)("preserves %s's calibrated %s hand", (slot, hand, label) => {
    expect(renderSetup(slot, hand)).toContain(
      `<option value="${hand}" selected="">${label} hand</option>`,
    );
  });
});
