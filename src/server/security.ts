import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { assert, HttpError } from "./errors";
import { localMediaTestingEnabled } from "./environment";
export const SESSION_COOKIE = "portal_session";
export type BrowserSession = { id: string; expiresAt: number };
export type ProgramSession = {
  showId: string;
  expiresAt: number;
  grantId: string;
};
function secret() {
  const value = process.env.SESSION_SECRET;
  assert(
    value && value.length >= 32,
    503,
    "session_unconfigured",
    "Session signing must be configured before opening the theater.",
  );
  return value;
}
export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  const object = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + canonicalJson(object[key]))
      .join(",") +
    "}"
  );
}
export function hashData(value: unknown) {
  return digest(canonicalJson(value));
}
export function privateActor(id: string) {
  return createHmac("sha256", secret())
    .update("portal:" + id)
    .digest("hex");
}
export function sign(value: unknown) {
  const data = Buffer.from(JSON.stringify(value)).toString("base64url");
  return (
    data + "." + createHmac("sha256", secret()).update(data).digest("base64url")
  );
}
export function unsign<T>(value: string | undefined): T | null {
  if (!value || value.length > 4096) return null;
  const [data, signature, ...extra] = value.split(".");
  if (!signature || extra.length) return null;
  const expected = createHmac("sha256", secret())
    .update(data)
    .digest("base64url");
  const signatureBytes = Buffer.from(signature),
    expectedBytes = Buffer.from(expected);
  if (
    signatureBytes.length !== expectedBytes.length ||
    !timingSafeEqual(signatureBytes, expectedBytes)
  )
    return null;
  try {
    return JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
export function cookieValue(request: Request, name = SESSION_COOKIE) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(name + "="))
    ?.slice(name.length + 1);
}
export function readSession(request: Request): BrowserSession | null {
  const value = unsign<BrowserSession>(cookieValue(request));
  return value &&
    typeof value.id === "string" &&
    /^[a-f0-9-]{36}$/.test(value.id) &&
    value.expiresAt > Date.now()
    ? value
    : null;
}
export function session(request: Request): BrowserSession {
  const value = readSession(request);
  assert(
    value,
    401,
    "session_required",
    "Open the theater first to establish your private session.",
  );
  return value;
}
export function newSession(): BrowserSession {
  return { id: randomUUID(), expiresAt: Date.now() + 7 * 24 * 3600_000 };
}
export function signedCookie(
  name: string,
  value: unknown,
  maxAge = 7 * 24 * 3600,
) {
  const secure =
    process.env.NODE_ENV === "production" && !localMediaTestingEnabled();
  return `${name}=${sign(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
export function sessionCookie(value: BrowserSession) {
  return signedCookie(SESSION_COOKIE, value);
}
export function appOrigin(request?: Request) {
  const base =
    process.env.APP_BASE_URL ||
    (process.env.NODE_ENV !== "production"
      ? request?.url || "http://localhost:3200"
      : undefined);
  assert(
    base,
    503,
    "origin_unconfigured",
    "The application origin has not been configured.",
  );
  return new URL(base).origin;
}
export function requireSameOrigin(request: Request) {
  assert(
    request.headers.get("origin") === appOrigin(request) &&
      request.headers.get("sec-fetch-site") !== "cross-site",
    403,
    "origin",
    "This command must come from the theater's own page.",
  );
}
export async function jsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  assert(
    Number(request.headers.get("content-length") || 0) <= 65_536,
    413,
    "body_too_large",
    "The request is too large.",
  );
  const reader = request.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader)
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65_536) {
        await reader.cancel();
        throw new HttpError(413, "body_too_large", "The request is too large.");
      }
      chunks.push(value);
    }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    assert(
      value && typeof value === "object" && !Array.isArray(value),
      400,
      "invalid_body",
      "Expected a JSON object.",
    );
    return value;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      400,
      "invalid_json",
      "The request does not contain valid JSON.",
    );
  }
}
function encryptionKey() {
  const value = process.env.TOKEN_ENCRYPTION_KEY || "";
  assert(
    /^[a-fA-F0-9]{64}$/.test(value),
    503,
    "encryption_unconfigured",
    "Token encryption must be configured.",
  );
  return Buffer.from(value, "hex");
}
export function encryptToken(value: unknown) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
export function decryptToken<T>(value: string): T {
  const data = Buffer.from(value, "base64url");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    data.subarray(0, 12),
  );
  decipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      decipher.update(data.subarray(28)),
      decipher.final(),
    ]).toString("utf8"),
  ) as T;
}
export function jsonResponse(
  value: unknown,
  status = 200,
  extraHeaders: HeadersInit = {},
) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store, private", ...extraHeaders },
  });
}
export function jsonError(error: unknown) {
  if (error instanceof HttpError)
    return jsonResponse(
      { error: error.message, code: error.code },
      error.status,
    );
  console.error(
    "PORTAL request failed",
    error instanceof Error ? error.name : "unknown",
  );
  return jsonResponse(
    {
      error:
        "The theater is temporarily unavailable. Your committed scene is preserved; please retry.",
      code: "unavailable",
    },
    503,
  );
}
