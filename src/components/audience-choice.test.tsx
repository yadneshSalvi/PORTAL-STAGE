import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createRecord } from "@/server/core";
import { ROUND_DEFINITIONS } from "@/lib/show-grammar";
import type { RoundKind } from "@/lib/contracts";
import { AudienceChoice } from "./audience-choice";
function showWithRound(
  kind: RoundKind,
  status: "open" | "closed" | "cancelled" = "open",
) {
  const show = createRecord(
    "ps_choice_ui",
    "director",
    kind === "accept" || kind === "giveback" ? "solo" : "rehearsal",
    1000,
    null,
    kind === "contents" || kind === "parcel-ending"
      ? "midnight-parcel"
      : "borrowed-weather",
  ).state;
  show.phase = "live";
  show.round = {
    id: "ui-round",
    kind,
    status,
    openedAt: 1000,
    closesAt: 31000,
    closedAt: status === "closed" ? 2000 : null,
    tallies: {},
    uniqueVoters: 0,
    result: null,
    source: null,
    lastMessageAt: null,
    contributors: [],
    needsDirectorChoice: status === "closed",
  };
  return show;
}
describe("authored audience choice cards", () => {
  it("labels a cancelled ballot without presenting its unapplied result as chosen", () => {
    const show = showWithRound("accept", "cancelled");
    Object.assign(show.round!, {
      result: "accept",
      source: "audience",
      contributors: ["TestVoice"],
      uniqueVoters: 1,
      tallies: { accept: 1, wait: 0 },
    });
    const html = renderToStaticMarkup(
      <AudienceChoice
        show={show}
        busy={false}
        run={vi.fn()}
        serverOffset={0}
      />,
    );
    expect(html).toContain("Cancelled");
    expect(html).toContain("Choice cancelled");
    expect(html).toContain("Ask again with the next cue");
    expect(html).not.toContain('class="choice-result"');
    expect(html).not.toContain("Chosen result");
    expect(html).not.toContain("TestVoice");
  });
  it.each([
    "weather",
    "name",
    "mood",
    "ending",
    "contents",
    "parcel-ending",
  ] as const)("offers labeled rehearsal ballots for %s", (kind) => {
    const html = renderToStaticMarkup(
      <AudienceChoice
        show={showWithRound(kind)}
        busy={false}
        run={vi.fn()}
        serverOffset={0}
      />,
    );
    for (const option of ROUND_DEFINITIONS[kind].options)
      expect(html).toContain(option.command);
    expect(html.match(/>Test vote</g)).toHaveLength(1);
    expect(html).not.toContain("They are not audience input");
    expect(html).not.toContain("NaN");
  });
  it("keeps an empty solo acceptance visibly unresolved", () => {
    const html = renderToStaticMarkup(
      <AudienceChoice
        show={showWithRound("accept", "closed")}
        busy={false}
        run={vi.fn()}
        serverOffset={0}
      />,
    );
    expect(html).toContain("No ballots arrived");
    expect(html).toContain("Accept it");
    expect(html).toContain("Wait a moment");
    expect(html).toContain("Director’s choice");
    expect(html).not.toContain("Audience choice:");
    expect(html).not.toContain("Test !accept");
  });
});
