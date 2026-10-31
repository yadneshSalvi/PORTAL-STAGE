import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
const filename = path.resolve(".env.local");
let source = existsSync(filename)
  ? readFileSync(filename, "utf8")
  : readFileSync(path.resolve(".env.example"), "utf8");
const defaults = {
  APP_BASE_URL: "http://localhost:3200",
  SESSION_SECRET: randomBytes(32).toString("base64url"),
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  TWITCH_REDIRECT_URI: "http://localhost:3200/auth/twitch/callback",
};
for (const [name, value] of Object.entries(defaults)) {
  const line = new RegExp(`^${name}=(.*)$`, "m"),
    match = source.match(line);
  if (match?.[1]?.trim()) continue;
  source = match
    ? source.replace(line, `${name}=${value}`)
    : `${source}\n${name}=${value}\n`;
}
writeFileSync(filename, source, { mode: 0o600 });
chmodSync(filename, 0o600);
console.log(
  "Private local configuration ready. Existing values preserved; no secrets printed. Run npm run dev for the labeled solo rehearsal.",
);
