import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isLoopbackUrl,
  localMediaTestingEnabled,
} from "../src/server/environment";
import { signedCookie } from "../src/server/security";
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("PORTAL_LOCAL_MEDIA_TEST", "");
  vi.stubEnv("APP_BASE_URL", "http://localhost:3200");
  vi.stubEnv("LIVEKIT_URL", "ws://127.0.0.1:7880");
  vi.stubEnv(
    "SESSION_SECRET",
    "fixture-only-session-secret-at-least-32-characters",
  );
});
afterEach(() => vi.unstubAllEnvs());
describe("optimized local transport isolation", () => {
  it("requires an explicit production-mode opt-in and preserves production cookie security by default", () => {
    expect(localMediaTestingEnabled()).toBe(false);
    expect(signedCookie("portal_session", { fixture: true })).toContain(
      "; Secure",
    );
    vi.stubEnv("PORTAL_LOCAL_MEDIA_TEST", "1");
    expect(localMediaTestingEnabled()).toBe(true);
    const cookie = signedCookie("portal_session", { fixture: true });
    expect(cookie).toContain("HttpOnly; SameSite=Lax");
    expect(cookie).not.toContain("; Secure");
  });
  it("denies the exception in Vercel or with any non-loopback application/media origin", () => {
    vi.stubEnv("PORTAL_LOCAL_MEDIA_TEST", "1");
    vi.stubEnv("VERCEL", "1");
    expect(localMediaTestingEnabled()).toBe(false);
    expect(signedCookie("portal_session", {})).toContain("; Secure");
    vi.stubEnv("VERCEL", "");
    for (const origin of [
      "https://portal-stage-eight.vercel.app",
      "http://localhost.evil.example",
      "http://192.168.1.2:3200",
    ]) {
      vi.stubEnv("APP_BASE_URL", origin);
      expect(localMediaTestingEnabled()).toBe(false);
      expect(signedCookie("portal_session", {})).toContain("; Secure");
    }
    vi.stubEnv("APP_BASE_URL", "http://127.0.0.1:3201");
    vi.stubEnv("LIVEKIT_URL", "wss://project.livekit.cloud");
    expect(localMediaTestingEnabled()).toBe(false);
  });
  it("accepts explicit IPv4/IPv6 loopback URLs with constrained protocols", () => {
    expect(isLoopbackUrl("http://[::1]:3200", ["http:"])).toBe(true);
    expect(isLoopbackUrl("http://127.0.0.1:3201", ["http:"])).toBe(true);
    expect(isLoopbackUrl("file:///tmp/test", ["http:"])).toBe(false);
    expect(isLoopbackUrl("invalid", ["http:"])).toBe(false);
  });
});
