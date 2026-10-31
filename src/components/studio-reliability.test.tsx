import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createRecord } from "@/server/core";
import { CueDeck, nextCue } from "./cue-deck";
import { canIssueDirectorAction } from "./studio-controls";
import {
  StudioAuthorityNotice,
  StudioVisibilityNotice,
} from "./studio-notices";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("studio reliability states", () => {
  it("fences ordinary rehearsal cues after lease loss while keeping safety actions available", () => {
    for (const action of [
      { type: "start" },
      { type: "open-round" },
      { type: "offer", from: "A" },
      { type: "accept", transferId: "transfer-test", slot: "B" },
      { type: "consent", broadcast: true, recording: false },
    ] as const) {
      expect(canIssueDirectorAction(action, false)).toBe(false);
      expect(canIssueDirectorAction(action, true)).toBe(true);
    }
    for (const action of [
      { type: "panic" },
      { type: "hold" },
      { type: "end" },
      { type: "hide", slot: "B" },
      { type: "consent", broadcast: false, recording: false },
    ] as const)
      expect(canIssueDirectorAction(action, false)).toBe(true);
  });
  it("keeps fresh-show exits available after an ended show's lease has expired", () => {
    const show = createRecord("ps_ui_end", "director", "rehearsal", 1000).state;
    show.phase = "ended";
    show.renderLease.expiresAt = 0;
    const html = renderToStaticMarkup(
      <CueDeck show={show} busy={false} run={vi.fn()} locked />,
    );
    expect(nextCue(show).act).toBeNull();
    expect(html).toContain("Show ended");
    expect(html).toContain("New rehearsal");
    expect(html).toContain('href="/studio"');
    expect(html).toContain("New show");
    expect(html).not.toContain("Reset the scene");
    expect(html).not.toContain("spin");
    expect(
      renderToStaticMarkup(
        <StudioAuthorityNotice
          phase="ended"
          leaseValid={false}
          status="lost"
          error="The lease expired"
          recovery=""
          onTakeover={vi.fn()}
        />,
      ),
    ).toBe("");
  });

  it("shows a busy-renderer notice in rehearsal and a truthful recovery notice", () => {
    const html = renderToStaticMarkup(
      <StudioAuthorityNotice
        phase="live"
        leaseValid={false}
        status="lost"
        error="Another director window controls this stage."
        recovery=""
        onTakeover={vi.fn()}
      />,
    );
    expect(html).toContain("does not control the stage");
    expect(html).toContain("Another director window");
    expect(html).toContain("Take over the stage");
    const recovered = renderToStaticMarkup(
      <StudioAuthorityNotice
        phase="hold"
        leaseValid
        status="active"
        error=""
        recovery="Recovered after an interruption. Resume the held scene when ready."
        onTakeover={vi.fn()}
      />,
    );
    expect(recovered).toContain("Recovered after an interruption");
    expect(recovered).not.toContain("Take over the stage");
  });

  it("warns about hidden output without claiming that timers prevent suspension", () => {
    const html = renderToStaticMarkup(
      <StudioVisibilityNotice hidden phase="live" />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Keep the director window visible");
    expect(html).toContain("while the browser allows it");
    expect(
      renderToStaticMarkup(<StudioVisibilityNotice hidden phase="ended" />),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <StudioVisibilityNotice hidden={false} phase="live" />,
      ),
    ).toBe("");
  });
});
