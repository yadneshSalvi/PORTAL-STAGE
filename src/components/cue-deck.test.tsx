import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RoundKind } from "@/lib/contracts";
import { ROUND_DEFINITIONS } from "@/lib/show-grammar";
import { createRecord } from "@/server/core";
import { CueDeck } from "./cue-deck";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const step = (html: string) =>
  html.match(/aria-label="Story step">([^<]*)</)?.[1];

describe("compact story cue", () => {
  it.each(["borrowed-weather", "midnight-parcel"] as const)(
    "shows the %s step and shortcut without helper prose",
    (episode) => {
      const show = createRecord(
        "ps_compact_cue",
        "director",
        "rehearsal",
        1000,
        null,
        episode,
      ).state;
      const html = renderToStaticMarkup(
        <CueDeck show={show} busy={false} run={vi.fn()} />,
      );
      expect(html).toContain("1/8");
      expect(html).toContain('aria-label="Space">␣</kbd>');
      expect(html).not.toContain("YOUR NEXT CUE");
      expect(html).not.toContain("Keyboard:");
      expect(html).not.toContain("<p>");
    },
  );
  it.each([
    ["weather", "2/8"],
    ["contents", "2/8"],
    ["accept", "4/8"],
    ["name", "5/8"],
    ["mood", "5/8"],
    ["giveback", "6/8"],
    ["ending", "7/8"],
    ["parcel-ending", "7/8"],
  ] as [RoundKind, string][])(
    "keeps the %s choice at its story step without repeating the question",
    (kind, expected) => {
      const show = createRecord(
        "ps_choice_cue",
        "director",
        "rehearsal",
        1000,
      ).state;
      show.phase = "live";
      show.round = {
        id: "test-choice",
        kind,
        status: "open",
        openedAt: 1000,
        closesAt: 31000,
        closedAt: null,
        tallies: {},
        uniqueVoters: 0,
        result: null,
        source: null,
        lastMessageAt: null,
      };
      const html = renderToStaticMarkup(
        <CueDeck show={show} busy={false} run={vi.fn()} />,
      );
      expect(step(html)).toBe(expected);
      expect(html).toContain(">Voting open</h2>");
      expect(html).toContain("<span>Close this choice</span>");
      expect(html.match(/<button/g)).toHaveLength(1);
      expect(html).not.toContain(ROUND_DEFINITIONS[kind].question);
      show.round.status = "closing";
      expect(
        step(
          renderToStaticMarkup(
            <CueDeck show={show} busy={false} run={vi.fn()} />,
          ),
        ),
      ).toBe(expected);
    },
  );
  it("uses consistent step labels while held and after the show ends", () => {
    const show = createRecord(
      "ps_step_labels",
      "director",
      "rehearsal",
      1000,
    ).state;
    show.phase = "hold";
    show.weather = "gentle";
    const render = () =>
      renderToStaticMarkup(<CueDeck show={show} busy={false} run={vi.fn()} />);
    const held = render();
    expect(step(held)).toBe("4/8");
    show.phase = "ended";
    const ended = render();
    expect(step(ended)).toBe("Done");
    for (const html of [held, ended]) expect(html).not.toMatch(/FIN|Ⅱ|✦/);
  });
});
