import { describe, expect, it } from "vitest";
import type { ShowState } from "../src/lib/contracts";
import {
  hasRenderAuthority,
  mayMixSlot,
  mediaIssue,
  participantSlot,
} from "../src/media/safety";
import type { MediaRoomOptions } from "../src/media/types";

function show(): ShowState {
  return {
    mode: "live",
    phase: "live",
    epoch: 4,
    renderLease: { clientId: "director-tab", epoch: 4, expiresAt: 20_000 },
    participants: {
      A: {
        connected: true,
        admitted: true,
        consentBroadcast: true,
        microphone: true,
      },
      B: {
        connected: true,
        admitted: false,
        consentBroadcast: true,
        microphone: true,
      },
    },
  } as ShowState;
}
function options(): MediaRoomOptions {
  return {
    show: show(),
    role: "director",
    slot: "A",
    rendererId: "director-tab",
    epoch: 4,
  };
}

describe("media privacy and renderer authority", () => {
  it("maps only signed role/slot combinations, never an identity or display name", () => {
    expect(participantSlot('{"role":"director","slot":"A"}')).toBe("A");
    expect(participantSlot('{"role":"performer","slot":"B"}')).toBe("B");
    for (const metadata of [
      undefined,
      "not JSON",
      '{"role":"program","slot":"A"}',
      '{"role":"performer","slot":"A"}',
      '{"name":"Director A"}',
      "null",
      "[]",
    ])
      expect(participantSlot(metadata)).toBeNull();
  });
  it("requires matching lease client, show epoch, lease epoch, and future expiry", () => {
    expect(hasRenderAuthority(options(), 10_000)).toBe(true);
    const variations: MediaRoomOptions[] = [
      { ...options(), rendererId: "old-tab" },
      { ...options(), epoch: 3 },
      { ...options(), role: "performer" },
      { ...options(), show: { ...show(), epoch: 5 } },
      {
        ...options(),
        show: { ...show(), renderLease: { ...show().renderLease, epoch: 3 } },
      },
      { ...options(), show: { ...show(), phase: "ended" } },
    ];
    for (const option of variations)
      expect(hasRenderAuthority(option, 10_000)).toBe(false);
    expect(hasRenderAuthority(options(), 20_000)).toBe(false);
  });
  it("permits an explicit local synthetic test, but ordinary rehearsal has no media authority", () => {
    const rehearsal = {
      ...options(),
      show: { ...show(), mode: "rehearsal" as const },
    };
    expect(hasRenderAuthority(rehearsal, 10_000)).toBe(false);
    expect(
      hasRenderAuthority({ ...rehearsal, allowSyntheticMedia: true }, 10_000),
    ).toBe(true);
  });
  it("excludes backstage, muted, disconnected, unconsented, held, and ended voices", () => {
    expect(mayMixSlot(show(), "A")).toBe(true);
    expect(mayMixSlot(show(), "B")).toBe(false);
    for (const field of [
      "admitted",
      "connected",
      "consentBroadcast",
      "microphone",
    ] as const) {
      const state = show();
      state.participants.A[field] = false;
      expect(mayMixSlot(state, "A")).toBe(false);
    }
    for (const phase of ["backstage", "hold", "ended"] as const)
      expect(mayMixSlot({ ...show(), phase }, "A")).toBe(false);
  });
  it("reports actionable permission, missing-device, busy-device, and authorization failures without secret messages", () => {
    expect(
      mediaIssue(
        new DOMException("secret media details", "NotAllowedError"),
        "camera",
      ).code,
    ).toBe("permission-denied");
    expect(
      mediaIssue(new DOMException("", "NotFoundError"), "microphone").code,
    ).toBe("device-missing");
    expect(
      mediaIssue(new DOMException("", "NotReadableError"), "camera").code,
    ).toBe("device-busy");
    expect(
      mediaIssue(new DOMException("", "OverconstrainedError"), "camera").code,
    ).toBe("device-constraints");
    expect(mediaIssue({ status: 403, token: "private-token" }).code).toBe(
      "authorization",
    );
    expect(
      JSON.stringify(mediaIssue(new Error("private-token"))),
    ).not.toContain("private-token");
    expect(
      mediaIssue({ status: 503, code: "media_unconfigured" }).message,
    ).toContain("not configured");
    expect(mediaIssue({ status: 503, code: "media_url" }).message).toContain(
      "not configured",
    );
    for (const error of [
      { status: 503, code: "database_timeout" },
      { status: 503 },
    ]) {
      expect(mediaIssue(error).message).toContain("temporarily unavailable");
      expect(mediaIssue(error).message).not.toContain("not configured");
    }
  });
});
