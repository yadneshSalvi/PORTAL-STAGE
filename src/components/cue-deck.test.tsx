import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createRecord } from "@/server/core";
import { CueDeck } from "./cue-deck";

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
});
