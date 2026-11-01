import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import HowBuiltPage from "@/app/how-built/page";
import { SiteFooter, SiteHeader } from "./brand";
import { DeviceSetup, type MediaRoom } from "./device-setup";
import { createRecord } from "@/server/core";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("public UI and guest permission presentation", () => {
  it("keeps the landing compact without art disclaimers or decorative labels", () => {
    const html = renderToStaticMarkup(<Home />);
    for (const title of [
      "Different rooms.",
      "Two rooms",
      "Chat decides",
      "A prop that remembers",
      "Step into rehearsal",
      "Meet the show",
    ])
      expect(html).toContain(title);
    expect(html).not.toMatch(
      /class="eyebrow|theater-ticket|poster-rehearsal-label|stage-footnote|better with a friend/,
    );
    expect(html.match(/class="step-illustration/g)).toHaveLength(3);
  });
  it("links the build page only from the footer and gives five source contributions", () => {
    expect(renderToStaticMarkup(<SiteHeader />)).not.toContain("/how-built");
    expect(renderToStaticMarkup(<SiteFooter />)).toContain('href="/how-built"');
    const html = renderToStaticMarkup(<HowBuiltPage />);
    expect(
      html.match(/github.com\/yadneshSalvi\/PORTAL-STAGE\/blob\/main\//g),
    ).toHaveLength(5);
    expect(html).not.toMatch(
      /No runtime language|Built with Codex|Directed by people/,
    );
    for (const match of html.matchAll(/blob\/main\/([^"]+)/g))
      expect(
        readFileSync(new URL(`../../${match[1]}`, import.meta.url), "utf8")
          .length,
      ).toBeGreaterThan(0);
  });
  it("retains separate broadcast and recording consent and connection gates", () => {
    const show = createRecord("ps_guest_ui", "director", "live", 1000).state;
    show.channel = "consentinghost";
    const media = {
      localPreview: null,
      cameraEnabled: false,
      microphoneEnabled: false,
      cameraRequestPending: false,
      devices: [],
      selectedDevices: {},
      status: "disconnected",
      connected: false,
      error: null,
    } as unknown as MediaRoom;
    const html = renderToStaticMarkup(
      <DeviceSetup
        show={show}
        slot="B"
        media={media}
        run={async () => null}
        busy={false}
      />,
    );
    expect(html).toContain("1 Preview");
    expect(html).toContain("2 Consent");
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html).toContain("I allow the host to show my camera and voice");
    expect(html).toContain("twitch.tv/consentinghost");
    expect(html).toContain("Separately, I allow my performance");
    expect(html).toContain("This app does not start a recording");
    expect(html).toMatch(/disabled=""[^>]*>[^]*?Confirm framing &amp; consent/);
    expect(html).toContain(
      "Confirmed framing and broadcast permission are required to connect.",
    );
  });
});
