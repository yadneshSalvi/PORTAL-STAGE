import { describe, expect, it } from "vitest";
import type { ShowState } from "../src/lib/contracts";
import {
  programAuthorityIssue,
  rejectedProgramGrant,
} from "../src/media/program-status";
import { mayPlayProgramAudio } from "../src/media/safety";

function show(): ShowState {
  return {
    id: "ps_program",
    phase: "live",
    epoch: 3,
    renderLease: { clientId: "renderer-tab", epoch: 3, expiresAt: 45_000 },
  } as ShowState;
}
const sender = {
  identity: "renderer-ps_program-3",
  metadata: JSON.stringify({
    role: "output-publisher",
    showId: "ps_program",
    epoch: 3,
  }),
};

describe("Program authority and access failure", () => {
  it("treats rejected or expired output access separately from a temporary service interruption", () => {
    for (const status of [401, 403, 404, 410])
      expect(rejectedProgramGrant({ status })).toBe(true);
    for (const error of [
      null,
      new Error("network interrupted"),
      { status: 503 },
      { status: 0 },
    ])
      expect(rejectedProgramGrant(error)).toBe(false);
  });

  it("holds the picture and independently gates audio when a mount releases its renderer", () => {
    const state = show();
    expect(programAuthorityIssue(state, 1000)).toBeNull();
    expect(mayPlayProgramAudio(state, sender, 1000)).toBe(true);
    state.renderLease.releasedAt = 1000;
    expect(programAuthorityIssue(state, 1001)).toContain(
      "picture and audio are held",
    );
    expect(mayPlayProgramAudio(state, sender, 1001)).toBe(false);
  });

  it("makes stale epochs and elapsed leases explicit while preserving the ended screen", () => {
    const state = show();
    expect(programAuthorityIssue(state, 45_000)).toContain("expired");
    expect(mayPlayProgramAudio(state, sender, 45_000)).toBe(false);
    state.renderLease.epoch = 2;
    expect(programAuthorityIssue(state, 1000)).toContain("expired");
    state.phase = "ended";
    expect(programAuthorityIssue(state, 90_000)).toBeNull();
    expect(mayPlayProgramAudio(state, sender, 90_000)).toBe(false);
  });
  it("independently closes a solo output when its media window ends before the renderer lease", () => {
    const state = show();
    state.mode = "solo";
    state.solo = { endsAt: 1000, status: "scheduled" };
    expect(programAuthorityIssue(state, 999)).toBeNull();
    expect(mayPlayProgramAudio(state, sender, 999)).toBe(true);
    expect(programAuthorityIssue(state, 1000)).toContain(
      "solo media session has closed",
    );
    expect(mayPlayProgramAudio(state, sender, 1000)).toBe(false);
  });
});
