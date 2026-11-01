import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createRecord } from "@/server/core";
import { CueDeck, nextCue } from "./cue-deck";
import { canIssueDirectorAction } from "./studio-controls";
import { GuestEnded } from "./guest-ended";
import {
  StudioAuthorityNotice,
  StudioChatStatus,
  StudioChatWarning,
  StudioVisibilityNotice,
} from "./studio-notices";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("studio reliability states", () => {
  it("keeps dropped chat commands visible as one compact warning", () => {
    const message =
      "Chat is connected, but some commands may not have reached the stage. 2 messages were rate limited.";
    const html = renderToStaticMarkup(<StudioChatWarning message={message} />);
    expect(html).toContain('role="status"');
    expect(html).toContain(`title="${message}"`);
    expect(html).toContain("Commands dropped</span>");
    expect(html).not.toContain(`<p>${message}</p>`);
    expect(
      renderToStaticMarkup(<StudioChatWarning message="Listening" />),
    ).toBe("");
  });
  it("requires this browser's subscribed connector before showing Twitch Listening after reload", () => {
    const show = createRecord("ps_chat_reload", "director", "solo", 1000).state;
    show.phase = "live";
    show.twitch.connected = true;
    const render = (
      connection: "disconnected" | "connecting" | "connected",
      enabled = true,
      leaseValid = true,
    ) =>
      renderToStaticMarkup(
        <StudioChatStatus
          show={show}
          connection={connection}
          enabled={enabled}
          leaseValid={leaseValid}
        />,
      );
    const reloaded = render("disconnected", false);
    expect(reloaded).toContain("Reconnect required");
    expect(reloaded).not.toContain("Listening");
    expect(reloaded).not.toContain('class="connection-indicator connected"');
    expect(render("connecting")).toContain("Connecting…");
    expect(render("connecting")).not.toContain("Listening");
    expect(render("connected")).toContain("Listening");
    expect(render("connected")).toContain(
      'class="connection-indicator connected"',
    );
    expect(render("connected", false)).not.toContain("Listening");
    expect(render("connected", true, false)).not.toContain("Listening");
    show.phase = "ended";
    expect(render("connected")).toContain("Not connected");
    expect(render("connected")).not.toContain("Listening");
    show.mode = "rehearsal";
    expect(render("connected")).toContain("Test ballots");
    expect(render("connected")).not.toContain("Listening");
  });
  it("shows manual legacy recovery without automatically moving or resetting the prop", () => {
    const show = createRecord(
      "ps_unknown_progress_ui",
      "director",
      "rehearsal",
      1000,
    ).state;
    show.phase = "live";
    show.umbrella.acceptedTransfers = null;
    show.umbrella.owner = "B";
    const run = vi.fn();
    const html = renderToStaticMarkup(
      <CueDeck show={show} busy={false} run={run} locked />,
    );
    expect(html).toContain("Earlier scene history is incomplete");
    expect(html).toContain("current prop is intact");
    expect(html).toContain("Hold stage before reset");
    expect(html).toContain("Start a new episode");
    expect(html).not.toContain("Offer the umbrella");
    expect(run).not.toHaveBeenCalled();
    expect(show.umbrella.owner).toBe("B");
    show.phase = "hold";
    expect(
      renderToStaticMarkup(<CueDeck show={show} busy={false} run={run} />),
    ).toContain("Reset this held scene");
    expect(run).not.toHaveBeenCalled();
  });
  it("lets an ended solo director retry pending media closure without a render lease", () => {
    const show = createRecord(
      "ps_retry_closure",
      "director",
      "solo",
      1000,
    ).state;
    show.phase = "ended";
    show.solo = { endsAt: 1000, status: "closing" };
    show.renderLease.expiresAt = 0;
    const html = renderToStaticMarkup(
      <CueDeck show={show} busy={false} run={vi.fn()} locked />,
    );
    expect(html).toContain("Retry media closure");
    expect(html).toContain("Media-service closure is still pending");
    expect(html).not.toContain('disabled=""');
    show.solo.status = "closed";
    expect(
      renderToStaticMarkup(
        <CueDeck show={show} busy={false} run={vi.fn()} locked />,
      ),
    ).not.toContain("Retry media closure");
  });
  it("shows the failed solo closure step and disables retry while cleanup is running", () => {
    const show = createRecord(
      "ps_closure_feedback",
      "director",
      "solo",
      1000,
    ).state;
    show.phase = "ended";
    show.solo = {
      endsAt: 1000,
      status: "closing",
      closureError: "Deleting the Program room failed after two attempts.",
    };
    const render = (busy = false) =>
      renderToStaticMarkup(
        <CueDeck show={show} busy={busy} run={vi.fn()} locked />,
      );
    const failed = render();
    expect(failed).toContain(show.solo.closureError);
    expect(failed).toContain("Retry media closure");
    expect(failed).not.toContain('disabled=""');
    const retrying = render(true);
    expect(retrying).toContain('aria-busy="true"');
    expect(retrying).toMatch(/<button[^>]*disabled=""[^>]*>/);
    expect(retrying).toContain("Closing media…");
    expect(retrying).not.toContain(show.solo.closureError);
    show.solo.status = "closed";
    const closed = render();
    expect(closed).not.toContain(show.solo.closureError);
    expect(closed).not.toContain("Retry media closure");
  });
  it("replaces ended guest setup with exits and an ending explanation", () => {
    const html = renderToStaticMarkup(<GuestEnded episode="midnight-parcel" />);
    expect(html).toContain("Show ended");
    expect(html).toContain("New rehearsal");
    expect(html).toContain("Return to the theater");
    expect(html).not.toContain("Enable camera");
    expect(html).not.toContain("Join media room");
    expect(html).not.toContain("Find your place in the frame");
  });
  it("fences ordinary rehearsal cues after lease loss while keeping safety actions available", () => {
    for (const action of [
      { type: "start" },
      { type: "open-round", previousRoundId: null },
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
    const returned = renderToStaticMarkup(
      <StudioVisibilityNotice
        hidden={false}
        wasHidden
        phase="live"
        onAcknowledge={vi.fn()}
      />,
    );
    expect(returned).toContain("Check the picture after returning");
    expect(returned).toContain("I checked the picture");
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
