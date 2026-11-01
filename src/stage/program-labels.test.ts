import { describe, expect, it, vi } from "vitest";
import { createRecord } from "@/server/core";
import { drawProgramText, makeScenery } from "./scene-art";
import { makeRoomIllustrations } from "./room-illustrations";
import { decisionCredit, stageStoryCaption } from "./program-caption";

function canvas() {
  const labels: string[] = [];
  const fontSizes = new Set<number>();
  const texts: { value: string; x: number; maxWidth?: number }[] = [];
  const boxes: number[][] = [];
  const context = new Proxy(
    {
      fillText: (value: string, x: number, _y: number, maxWidth?: number) => {
        labels.push(value);
        texts.push({ value, x, maxWidth });
      },
      roundRect: (...box: number[]) => boxes.push(box),
      measureText: (value: string) => ({ width: value.length * 12 }),
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
      createRadialGradient: () => ({ addColorStop: vi.fn() }),
    } as unknown as CanvasRenderingContext2D,
    {
      get(target, key) {
        return key in target ? Reflect.get(target, key) : vi.fn();
      },
      set(target, key, value) {
        if (key === "font") fontSizes.add(Number.parseInt(String(value), 10));
        Reflect.set(target, key, value);
        return true;
      },
    },
  );
  return { context, labels, fontSizes, texts, boxes };
}

describe("truthful stage camera labels", () => {
  it.each([
    {
      mode: "rehearsal",
      episode: "borrowed-weather",
      names: ["Moon Garden", "Rooftop at Dusk"],
    },
    {
      mode: "rehearsal",
      episode: "midnight-parcel",
      names: ["Midnight Post", "Receiving Room"],
    },
    { mode: "solo", episode: "borrowed-weather", names: ["Audience Room"] },
    { mode: "solo", episode: "midnight-parcel", names: ["Audience Room"] },
  ] as const)(
    "uses only the canonical room labels across all $mode $episode artwork layers",
    ({ mode, episode, names }) => {
      const show = createRecord(
        "ps_composed_room_labels",
        "director",
        mode,
        1000,
        null,
        episode,
      ).state;
      show.phase = "live";
      const picture = canvas();
      vi.stubGlobal("document", {
        createElement: () => ({ getContext: () => picture.context }),
      });
      try {
        makeScenery();
        makeRoomIllustrations().update(show, 1100, 1000, true);
        drawProgramText(picture.context, show, 1100);
        expect(
          picture.labels.filter((label) =>
            /^(?:the )?(?:moon garden|rooftop at dusk|midnight post|receiving room|audience room)/i.test(
              label,
            ),
          ),
        ).toEqual(names);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
  it.each([
    {
      episode: "borrowed-weather",
      roomA: "Moon Garden",
      roomB: "Rooftop at Dusk",
    },
    {
      episode: "midnight-parcel",
      roomA: "Midnight Post",
      roomB: "Receiving Room",
    },
  ] as const)(
    "labels the $episode rehearsal scenery without mislabeling local cameras or the audience room",
    ({ episode, roomA, roomB }) => {
      const show = createRecord(
        "ps_episode_labels",
        "director",
        "rehearsal",
        1000,
        null,
        episode,
      ).state;
      show.phase = "live";
      const illustrated = canvas();
      drawProgramText(illustrated.context, show, 1100);
      expect(illustrated.labels).toContain(roomA);
      expect(illustrated.labels).toContain(roomB);

      const camera = canvas();
      drawProgramText(
        camera.context,
        show,
        1100,
        { A: true, B: false },
        { localCameraA: true },
      );
      expect(camera.labels).toContain("You");
      expect(camera.labels).not.toContain(roomA);
      expect(camera.labels).toContain(roomB);

      show.mode = "solo";
      const solo = canvas();
      drawProgramText(solo.context, show, 1100);
      expect(solo.labels).toContain(show.participants.A.name);
      expect(solo.labels).toContain("Audience Room");
      expect(solo.labels.some((label) => label.startsWith("TEST PLATE"))).toBe(
        false,
      );
    },
  );
  it.each(["backstage", "live", "hold", "ended"] as const)(
    "keeps exactly one rehearsal chip through the %s curtain state and none for live Program",
    (phase) => {
      const show = createRecord(
        "ps_phase_labels",
        "director",
        "rehearsal",
        1000,
      ).state;
      show.phase = phase;
      const rehearsal = canvas();
      drawProgramText(rehearsal.context, show, 1100);
      expect(
        rehearsal.labels.filter((label) => label === "Rehearsal"),
      ).toHaveLength(1);
      expect(rehearsal.labels.join(" ")).not.toContain("TEST PLATE");
      expect(
        [...rehearsal.fontSizes].every((size) => [24, 36, 64].includes(size)),
      ).toBe(true);
      expect(rehearsal.fontSizes.size).toBeLessThanOrEqual(3);
      show.mode = "live";
      const live = canvas();
      drawProgramText(live.context, show, 1100);
      expect(live.labels).not.toContain("Rehearsal");
      expect(live.labels).not.toContain("Test vote");
      expect(live.labels).not.toContain("LIVE PERFORMANCE");
    },
  );
  it("puts the current safe options and actual tallies inside the Program picture", () => {
    const show = createRecord(
      "ps_tallies",
      "director",
      "rehearsal",
      1000,
    ).state;
    show.phase = "live";
    show.round = {
      id: "test-name-round",
      kind: "name",
      status: "open",
      openedAt: 1000,
      closesAt: 31000,
      closedAt: null,
      tallies: { pip1: 2, pip2: 1, pip3: 0 },
      uniqueVoters: 3,
      result: null,
      source: null,
      lastMessageAt: null,
    };
    const picture = canvas();
    drawProgramText(picture.context, show, 2000);
    expect(picture.labels.join(" ")).toContain("!pip1 · Pip");
    expect(picture.labels.join(" ")).toContain("!pip2 · Sprig");
    expect(picture.labels).toContain("2");
    expect(picture.labels).toContain("1");
    expect(
      picture.labels.filter((label) => label === "Test vote"),
    ).toHaveLength(1);
    expect(picture.labels).toContain("29s");
  });
  it("keeps Director and rehearsal credits distinct from audience authors", () => {
    const decision = {
      choice: "share" as const,
      source: "director" as const,
      voters: 3,
      contributors: ["TestAlpha"],
      at: 1000,
      roundId: "test-round",
    };
    expect(decisionCredit("ending", decision)).toBe(
      "DIRECTOR’S CHOICE · Share the shelter",
    );
    expect(
      decisionCredit("ending", { ...decision, source: "rehearsal" }),
    ).not.toContain("TestAlpha");
    expect(
      decisionCredit("ending", { ...decision, source: "audience" }),
    ).toContain("3 voices chose share the shelter · TestAlpha");
  });
  it("describes the parcel's actual room consequence and distinct ending", () => {
    const show = createRecord(
      "ps_parcel_caption",
      "director",
      "rehearsal",
      1000,
      null,
      "midnight-parcel",
    ).state;
    Object.assign(show.parcel!, {
      opened: true,
      contents: "stars",
      transformedRoom: "B",
    });
    expect(stageStoryCaption(show)?.title).toContain("stars for room B");
    Object.assign(show.parcel!, {
      contents: "garden",
      transformedRoom: "A",
      ending: "keep",
    });
    expect(stageStoryCaption(show)?.title).toContain("garden in room A");
  });
  it.each(["backstage", "live", "hold"] as const)(
    "keeps a 60-character custom title inside the frame margins in the %s picture",
    (phase) => {
      const show = createRecord(
        "ps_long_title",
        "director",
        "live",
        1000,
      ).state;
      show.phase = phase;
      show.preset.episodeTitle = "W".repeat(60);
      const picture = canvas();
      drawProgramText(picture.context, show, 1100);
      const titles = picture.texts.filter(
        (text) => text.value === show.preset.episodeTitle,
      );
      expect(titles.length).toBeGreaterThan(0);
      for (const title of titles) {
        expect(title.maxWidth).toBeDefined();
        expect(title.x - title.maxWidth! / 2).toBeGreaterThanOrEqual(200);
        expect(title.x + title.maxWidth! / 2).toBeLessThanOrEqual(1720);
      }
    },
  );
  it.each(["borrowed-weather", "midnight-parcel"] as const)(
    "draws no %s opening caption box or tagline before a story beat",
    (episode) => {
      const show = createRecord(
        "ps_opening_caption",
        "director",
        "rehearsal",
        1000,
        null,
        episode,
      ).state;
      show.phase = "live";
      expect(stageStoryCaption(show)).toBeNull();
      const picture = canvas();
      drawProgramText(picture.context, show, 1100);
      expect(picture.labels.join(" ")).not.toMatch(
        /A little weather|Something is waiting/,
      );
      // Only the Rehearsal chip remains; there is no bottom caption box.
      expect(picture.boxes.filter(([, y]) => y >= 900)).toEqual([]);
    },
  );
  it("sizes single-line captions to one line and keeps two-line and vote boxes", () => {
    const show = createRecord("ps_caption_box", "director", "live", 1000).state;
    show.phase = "live";
    show.weather = "gentle";
    const caption = (now = 1100) => {
      const picture = canvas();
      drawProgramText(picture.context, show, now);
      return picture;
    };
    const single = caption();
    expect(single.labels).toContain("A gentler kind of rain.");
    expect(single.boxes.filter(([, y]) => y >= 900)).toEqual([
      [310, 905, 1300, 76, 10],
    ]);
    show.twitch.connected = true;
    const double = caption();
    expect(double.labels).toContain("!rain · !thunder · !cheer");
    expect(double.boxes.filter(([, y]) => y >= 900)).toEqual([
      [310, 905, 1300, 151, 10],
    ]);
    show.weather = null;
    const commandsOnly = caption();
    expect(commandsOnly.labels).toContain("!rain · !thunder · !cheer");
    expect(commandsOnly.boxes.filter(([, y]) => y >= 900)).toEqual([
      [310, 905, 1300, 60, 10],
    ]);
    show.round = {
      id: "test-box-round",
      kind: "weather",
      status: "open",
      openedAt: 1000,
      closesAt: 31000,
      closedAt: null,
      tallies: { gentle: 1 },
      uniqueVoters: 1,
      result: null,
      source: null,
      lastMessageAt: null,
    };
    const vote = caption(2000);
    expect(vote.labels).toContain("29s");
    expect(vote.boxes.filter(([, y]) => y >= 900)).toEqual([
      [310, 905, 1300, 151, 10],
    ]);
  });
  it("distinguishes a local human camera from synthetic rehearsal plates", () => {
    const show = createRecord("ps_labels", "director", "rehearsal", 1000).state;
    show.phase = "live";
    const local = canvas();
    drawProgramText(
      local.context,
      show,
      1100,
      { A: true, B: false },
      { localCameraA: true },
    );
    expect(local.labels.join(" ")).toContain("You");
    expect(local.labels.filter((label) => label === "Rehearsal")).toHaveLength(
      1,
    );
    expect(local.labels.join(" ")).not.toContain("NO LIVE CAMERAS");
    const synthetic = canvas();
    drawProgramText(synthetic.context, show, 1100);
    expect(
      synthetic.labels.filter((label) => label === "Rehearsal"),
    ).toHaveLength(1);
    expect(synthetic.labels.join(" ")).not.toContain(
      "NO LIVE CAMERAS OR AUDIENCE",
    );
  });
});
