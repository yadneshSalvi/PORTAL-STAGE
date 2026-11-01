import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRecord } from "@/server/core";
import type { SessionInfo, ShowEnvelope, ShowState } from "@/lib/contracts";
import { drawProgramText } from "@/stage/scene-art";
import { DuetModeCard, StudioClient } from "./studio-client";
import { ProgramPairing } from "./studio-panels";

const fixture = vi.hoisted(() => ({
  envelope: null as ShowEnvelope | null,
  leaseStatus: "active",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
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

function render(mode: "rehearsal" | "live" | "solo", withRound = true) {
  const show = createRecord("ps_whole_studio", "director", mode, 1000).state;
  show.phase = "live";
  show.renderLease = {
    ...show.renderLease,
    clientId: "fixture-renderer",
    epoch: show.epoch,
    expiresAt: 60000,
  };
  if (withRound)
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
  it("names the solo phase in one header chip", () => {
    const html = render("solo", false);
    expect(html).toContain(">Solo · Live</span>");
    expect(html).not.toMatch(/>Solo<\/span>/);
  });
  it("gives rehearsal's camera button a short visible label and a descriptive name", () => {
    const html = render("rehearsal");
    const cameraButton = [
      ...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g),
    ]
      .map(([button]) => button)
      .find((button) => button.includes("Camera &amp; hand cues"));
    expect(cameraButton).toContain("<span>Camera &amp; hand cues</span>");
    expect(cameraButton).toContain(
      'aria-label="Try camera &amp; hand cues in this browser"',
    );
    expect(html).not.toContain("<span>Try camera &amp; hand cues</span>");
    expect(html).toMatch(/class="cast-avatar avatar-a" role="img"/);
  });
  it("marks Duet as invite-only and disables it for uninvited signed-in hosts", () => {
    const session = (hostAllowed: boolean): SessionInfo => ({
      authenticated: true,
      hostAllowed,
      displayName: "TestHost",
      login: "test_host",
      twitchConnected: true,
      currentShowId: null,
      services: {
        database: "local",
        mediaConfigured: true,
        twitchConfigured: true,
      },
    });
    const card = (value: SessionInfo | null) =>
      renderToStaticMarkup(
        <DuetModeCard session={value} episode="borrowed-weather" />,
      );
    const signedOut = card(null);
    expect(signedOut).toContain("Invite only");
    expect(signedOut).toContain("Sign in with Twitch");
    const uninvited = card(session(false));
    expect(uninvited).toContain("Invite only");
    expect(uninvited).toMatch(/<button[^>]*disabled=""[^>]*>Start duet show/);
    expect(uninvited).not.toContain("Sign in with Twitch");
    expect(uninvited).not.toMatch(/<p[\s>]/);
    const invited = card(session(true));
    expect(invited).not.toContain("Invite only");
    expect(invited).toContain("Start duet show");
    expect(invited).not.toMatch(/<button[^>]*disabled=""/);
  });
  it("offers a new Program pairing code without implying existing outputs are unpaired", () => {
    const html = renderToStaticMarkup(
      <ProgramPairing
        showId="ps_pairing_fixture"
        grant={{ code: "ABCDE12345", expiresAt: 300000 }}
        busy={false}
        onPrepare={vi.fn()}
      />,
    );
    expect(html).toContain("New pairing code");
    expect(html).toContain('title="Existing outputs stay paired"');
    expect(html).not.toContain("Replace pairing code");
  });
});
