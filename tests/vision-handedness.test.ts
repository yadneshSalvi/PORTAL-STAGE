import { describe, expect, it } from "vitest";
import { subjectHandedness } from "@/vision/handedness";

describe("Tasks Vision subject handedness", () => {
  it.each([
    ["Left", "left"],
    ["Right", "right"],
    ["left", "left"],
    ["right", "right"],
    ["LEFT", "left"],
    ["RIGHT", "right"],
  ] as const)("preserves %s for unmirrored camera pixels", (label, hand) => {
    expect(subjectHandedness(label)).toBe(hand);
    expect(subjectHandedness(label, false)).toBe(hand);
  });

  it.each([
    ["Left", "right"],
    ["Right", "left"],
    ["left", "right"],
    ["right", "left"],
  ] as const)("swaps %s when the input pixels are mirrored", (label, hand) => {
    expect(subjectHandedness(label, true)).toBe(hand);
  });

  it.each(["", "Unknown", "Both", "Left hand", " Left ", "0"])(
    "rejects unknown category %j for either input orientation",
    (label) => {
      expect(subjectHandedness(label)).toBeNull();
      expect(subjectHandedness(label, true)).toBeNull();
    },
  );
});
