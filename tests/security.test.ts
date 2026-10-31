import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canonicalJson,
  decryptToken,
  encryptToken,
  hashData,
  jsonBody,
  readSession,
  requireSameOrigin,
  sign,
  unsign,
} from "@/server/security";
import { parseAction } from "@/server/schema";
beforeEach(() => {
  vi.stubEnv(
    "SESSION_SECRET",
    "test-only-session-signing-secret-at-least-32-chars",
  );
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", "11".repeat(32));
  vi.stubEnv("APP_BASE_URL", "http://localhost:3200");
});
afterEach(() => vi.unstubAllEnvs());
describe("private theater authorization", () => {
  it("rejects tampered and Unicode signatures without throwing", () => {
    const token = sign({
      id: "123e4567-e89b-12d3-a456-426614174000",
      expiresAt: Date.now() + 10000,
    });
    expect(unsign(token)).toMatchObject({
      id: "123e4567-e89b-12d3-a456-426614174000",
    });
    const [payload, signature] = token.split(".");
    expect(unsign(payload + "." + "é".repeat(signature.length))).toBeNull();
    expect(unsign(token + "x")).toBeNull();
    expect(
      readSession(
        new Request("http://localhost:3200", {
          headers: {
            cookie:
              "portal_session=" +
              sign({
                id: "123e4567-e89b-12d3-a456-426614174000",
                expiresAt: 1,
              }),
          },
        }),
      ),
    ).toBeNull();
  });
  it("requires the exact origin for mutations", () => {
    expect(() =>
      requireSameOrigin(
        new Request("http://localhost:3200", {
          headers: { Origin: "https://elsewhere.invalid" },
        }),
      ),
    ).toThrow();
    expect(() =>
      requireSameOrigin(new Request("http://localhost:3200")),
    ).toThrow();
    expect(() =>
      requireSameOrigin(
        new Request("http://localhost:3200", {
          headers: {
            Origin: "http://localhost:3200",
            "Sec-Fetch-Site": "cross-site",
          },
        }),
      ),
    ).toThrow();
    expect(() =>
      requireSameOrigin(
        new Request("http://localhost:3200", {
          headers: { Origin: "http://localhost:3200" },
        }),
      ),
    ).not.toThrow();
  });
  it("encrypts credentials and detects modification", () => {
    const encrypted = encryptToken({
      accessToken: "fixture-never-a-real-token",
    });
    expect(encrypted).not.toContain("fixture");
    expect(decryptToken(encrypted)).toEqual({
      accessToken: "fixture-never-a-real-token",
    });
    const bytes = Buffer.from(encrypted, "base64url");
    bytes[bytes.length - 1] ^= 1;
    expect(() => decryptToken(bytes.toString("base64url"))).toThrow();
  });
  it("canonicalizes JSON independent of database key order", () => {
    expect(hashData({ z: { b: 2, a: 1 }, a: [3, 2] })).toBe(
      hashData({ a: [3, 2], z: { a: 1, b: 2 } }),
    );
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
  it("bounds bodies without content-length", async () => {
    const request = new Request("http://localhost:3200/api/shows", {
      method: "POST",
      body: JSON.stringify({ data: "x".repeat(70000) }),
    });
    await expect(jsonBody(request)).rejects.toMatchObject({ status: 413 });
  });
  it("rejects arbitrary actions, unknown fields, and invalid coordinates", () => {
    expect(() =>
      parseAction({
        action: { type: "execute-code", source: "anything" },
        idempotencyKey: "fixture-key",
      }),
    ).toThrow();
    expect(() =>
      parseAction({
        action: { type: "offer", from: "B", force: true },
        idempotencyKey: "fixture-key",
      }),
    ).toThrow();
    expect(() =>
      parseAction({
        action: { type: "anchor", anchor: { x: Infinity, y: -1 } },
        idempotencyKey: "fixture-key",
      }),
    ).toThrow();
    expect(
      parseAction({
        action: { type: "offer", from: "A" },
        idempotencyKey: "fixture-key",
        expectedVersion: 1,
        epoch: 1,
      }).action.type,
    ).toBe("offer");
  });
});
