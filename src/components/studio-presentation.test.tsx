import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRecord } from "@/server/core";
import type { ShowEnvelope, ShowState } from "@/lib/contracts";
import { drawProgramText } from "@/stage/scene-art";
import { StudioClient } from "./studio-client";

const fixture = vi.hoisted(() => ({
  envelope: null as ShowEnvelope | null,
  leaseStatus: "active",
}));
vi.mock("./use-show-controller", () => ({
  useNow: () => 2000,
  useShowController: () => ({
    envelope: fixture.envelope,
    leaseStatus: fixture.leaseStatus,
    rendererId: "fixture-renderer",
    serverOffset: 0,
    busy: false,
    error: "",
    leaseError: "",
    leaseRecovery: "",
    run: vi.fn(),
    refresh: vi.fn(),
    setError: vi.fn(),
    claimLease: vi.fn(),
  }),
}));
vi.mock("@/media/use-media-room", () => ({
  useMediaRoom: () => ({
    status: "disconnected",
    programStatus: "idle",
    videos: {},
    anchors: {},
    connected: false,
    localPreview: null,
  }),
}));
vi.mock("@/media/use-local-rehearsal-camera", () => ({
  useLocalRehearsalCamera: () => ({ enabled: false, preview: null }),
}));
vi.mock("@/vision/use-gesture-input", () => ({
  useGestureInput: () => ({
    enabled: false,
    status: "idle",
    error: null,
    dwellProgress: 0,
  }),
}));
vi.mock("./ui", async (original) => ({
  ...(await original<typeof import("./ui")>()),
  Modal: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? children : null,
}));
vi.mock("next/dynamic", () => ({
  default: () =>
    function CanvasPicture({ show }: { show: ShowState }) {
      const labels: string[] = [];
      const context = new Proxy(
        {
          fillText: (value: string) => labels.push(value),
          createLinearGradient: () => ({ addColorStop: vi.fn() }),
        } as unknown as CanvasRenderingContext2D,
        {
          get: (target, key) =>
            key in target ? Reflect.get(target, key) : vi.fn(),
          set: (target, key, value) => Reflect.set(target, key, value),
        },
      );
      drawProgramText(context, show, 2000);
      return (
        <div aria-label="Program picture">
          {labels.map((label, index) => (
            <span key={index}>{label}</span>
          ))}
        </div>
      );
    },
}));

function render(mode: "rehearsal" | "live") {
  const show = createRecord("ps_whole_studio", "director", mode, 1000).state;
  show.phase = "live";
  show.renderLease = {
    ...show.renderLease,
    clientId: "fixture-renderer",
    epoch: show.epoch,
    expiresAt: 60000,
  };
  show.round = {
    id: "fixture-round",
    kind: "weather",
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
  fixture.envelope = { show, role: "director", slot: "A", serverNow: 2000 };
  return renderToStaticMarkup(<StudioClient showId={show.id} />);
}
beforeEach(() => {
  fixture.leaseStatus = "active";
});

describe("whole Studio presentation", () => {
  it("shows exactly one Rehearsal label across the header and canonical picture, with fixture ballots labeled", () => {
    const html = render("rehearsal");
    expect(html.match(/>Rehearsal</g)).toHaveLength(1);
    // The picture and its interactive choice card each identify fixture votes.
    expect(html.match(/>Test vote</g)).toHaveLength(2);
    expect(html).not.toContain("SYNTHETIC REHEARSAL");
    expect(html).toContain("!gentle");
  });
  it("keeps live Studio free of rehearsal labels and wraps the camera consent action label", () => {
    const html = render("live");
    expect(html).not.toMatch(/>Rehearsal</);
    expect(html).not.toMatch(/>Test vote</);
    const cameraButton = [
      ...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g),
    ]
      .map(([button]) => button)
      .find((button) => button.includes("Your camera &amp; consent"));
    expect(cameraButton).toContain("<span>Your camera &amp; consent</span>");
  });
  it("disables live chat connection when this browser has no director lease", () => {
    fixture.leaseStatus = "lost";
    const html = render("live");
    const chatButton = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
      .map(([button]) => button)
      .find((button) => button.includes("<span>Connect Twitch</span>"));
    expect(chatButton).toMatch(/^<button[^>]*disabled=""/);
  });
});
