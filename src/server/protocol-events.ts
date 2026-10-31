import type { Slot } from "@/lib/contracts";
import type { RateBucket, ShowRecord } from "./records";
import { assert } from "./errors";

export function recordEvent(
  record: ShowRecord,
  type: string,
  actor: "director" | Slot | "twitch" | "system" | "audience",
  summary: string,
  now: number,
  detail?: Record<string, string | number | boolean | null>,
) {
  const s = record.state;
  s.sequence += 1;
  s.updatedAt = now;
  s.events.push({
    id: `${s.id}:${s.sequence}`,
    sequence: s.sequence,
    at: now,
    type,
    actor,
    summary,
    propId: s.umbrella.id,
    propVersion: s.umbrella.version,
    owner: s.umbrella.owner,
    ...(detail ? { detail } : {}),
  });
  if (s.events.length > 2000) s.events.splice(0, s.events.length - 2000);
}
export function rate(
  buckets: Record<string, RateBucket>,
  key: string,
  max: number,
  windowMs: number,
  now = Date.now(),
) {
  let bucket = buckets[key];
  if (!bucket || now - bucket.at >= windowMs)
    bucket = buckets[key] = { at: now, count: 0 };
  assert(
    bucket.count < max,
    429,
    "rate_limit",
    "This control is moving too quickly. Wait a moment and retry.",
  );
  bucket.count += 1;
  if (Object.keys(buckets).length > 200)
    for (const [id, value] of Object.entries(buckets))
      if (now - value.at > 3600_000) delete buckets[id];
}
