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
  StudioMediaHint,
  StudioVisibilityNotice,
  chatToggleAction,
  mediaHintLabel,
} from "./studio-notices";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("studio reliability states", () => {
  it("keeps dropped chat commands visible as one compact warning", () => {
    const message =
      "Chat is connected, but some commands may not have reached the stage. 2 messages were rate limited.";
    const html = renderToStaticMarkup(
      <StudioChatWarning state="connected" message={message} />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain(`title="${message}"`);
    expect(html).toContain("Commands dropped</span>");
    expect(html).not.toContain(`<p>${message}</p>`);
    expect(
      renderToStaticMarkup(
        <StudioChatWarning state="connected" message="Listening" />,
      ),
    ).toBe("");
  });
  it.each([
    [
      "gap",
      "Chat connection interrupted. Messages sent during the gap cannot be recovered.",
      "Chat gap — messages may be missed",
    ],
    [
      "revoked",
      "Twitch chat permission was revoked. Connect Twitch again to resume.",
      "Twitch access revoked",
    ],
    [
      "failed",
      "Twitch authorization expired or was revoked. Reconnect your Twitch channel.",
      "Chat subscription failed",
    ],
  ] as const)(
    "shows a visible %s chat failure chip, a warning dot and a truthful chat action",
    (state, message, label) => {
      const html = renderToStaticMarkup(
        <StudioChatWarning state={state} message={message} />,
      );
      expect(html).toContain('role="status"');
      expect(html).toContain("status-gold");
      expect(html).toContain(`${label}</span>`);
      expect(html).toContain(`title="${message}"`);
      const show = createRecord(
        "ps_chat_failure",
        "director",
        "solo",
        1000,
      ).state;
      show.phase = "live";
      const status = renderToStaticMarkup(
        <StudioChatStatus show={show} connection={state} enabled leaseValid />,
      );
      expect(status).toContain(`Twitch chat: ${label}`);
      expect(status).toContain('class="connection-indicator warning"');
      expect(chatToggleAction(true, state)).toBe(
        state === "gap" ? "disconnect" : "reconnect",
      );
    },
  );
  it("keeps the chat action truthful outside failures", () => {
    expect(chatToggleAction(false, "failed")).toBe("connect");
    expect(chatToggleAction(true, "connecting")).toBe("disconnect");
    expect(chatToggleAction(true, "connected")).toBe("disconnect");
    expect(
      renderToStaticMarkup(
        <StudioChatWarning
          state="disconnected"
          message="Audience choices paused."
        />,
      ),
    ).toBe("");
  });
  it.each([
    [
      "Program transport was interrupted. Verify the stage and publish again after recovery.",
      "Program interrupted",
    ],
    [
      "The media room disconnected. Reconnect from backstage; devices will remain off until you enable them.",
      "Media room disconnected",
    ],
    [
      "A performer left the media room. Their camera and audio have been removed; readmit them after they return.",
      "Performer left",
    ],
    [
      "The camera could not start. Check the device and browser permission, then try again.",
      "Camera unavailable",
    ],
    [
      "Access to the microphone was blocked. Allow it in this site's browser settings, then select Enable microphone again.",
      "Microphone blocked",
    ],
    [
      "Media is reconnecting. Camera and microphone are off; return backstage and explicitly enable them when the connection recovers.",
      "Media reconnecting",
    ],
  ])("labels the media hint %# with a short visible phrase", (hint, label) => {
    expect(mediaHintLabel(hint)).toBe(label);
    const html = renderToStaticMarkup(<StudioMediaHint hint={hint} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("status-gold");
    expect(html).toContain(`${label}</span>`);
    expect(html).toContain(`title="${hint.replace(/'/g, "&#x27;")}"`);
    expect(html).not.toContain("Media update");
  });
  it("falls back to a short truncated media hint and renders nothing without one", () => {
    const label = mediaHintLabel(
      "An unfamiliar transport condition happened somewhere. Check it.",
    );
    expect(label).toBe("An unfamiliar transport…");
    expect(label.length).toBeLessThanOrEqual(33);
    expect(mediaHintLabel("Short notice.")).toBe("Short notice");
    expect(renderToStaticMarkup(<StudioMediaHint hint="" />)).toBe("");
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
    expect(html).toContain("Media closure pending");
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
    expect(html).toContain("Program may freeze while this window is hidden");
    expect(html).not.toMatch(/keeps? (running|rendering)|continues? normally/i);
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
