import { describe, expect, it } from "vitest";
import { createRecord } from "@/server/core";
import { rainPresentation } from "./renderer";

describe("independent stage weather and creature choices", () => {
  it("keeps a wild storm unchanged when the creature becomes shy", () => {
    const show = createRecord(
      "ps_visual_weather",
      "director",
      "rehearsal",
      1000,
    ).state;
    show.weather = "wild";
    show.creature.mood = "wild";
    show.preset.creatureCuriosity = 0.95;
    const storm = rainPresentation(show);
    show.creature.mood = "gentle";
    show.preset.creatureCuriosity = 0.2;
    expect(rainPresentation(show)).toEqual(storm);
    show.weather = "gentle";
    const gentle = rainPresentation(show);
    expect(gentle.count).toBeLessThan(storm.count);
    expect(gentle.speed).toBeLessThan(storm.speed);
    expect(gentle.slant).toBeLessThan(storm.slant);
  });
  it("keeps particle allocation bounded and leaves unchosen weather empty", () => {
    const show = createRecord(
      "ps_visual_budget",
      "director",
      "rehearsal",
      1000,
    ).state;
    expect(rainPresentation(show).count).toBe(0);
    show.weather = "wild";
    show.preset.rainIntensity = 100;
    expect(rainPresentation(show).count).toBeLessThanOrEqual(380);
    show.preset.rainIntensity = 0;
    expect(rainPresentation(show).count).toBe(0);
  });
});
