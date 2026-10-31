import type { Point, ShowState, Slot } from "../lib/contracts";
import { rendererParticipantMatches, soloMediaClosed } from "./safety";

export const ANCHOR_TOPIC = "portal-anchor/v1";
export const ANCHOR_LIMITS = {
  maxBytes: 256,
  maxAgeMs: 1000,
  futureSkewMs: 250,
  ttlMs: 1500,
  sendIntervalMs: 100,
  receivePerSecond: 20,
} as const;
export type AnchorPacket = {
  v: 1;
  showId: string;
  epoch: number;
  seq: number;
  sentAt: number;
  slot: Slot;
  point: Point;
};
export type AnchorSender = { identity: string; metadata?: string };
type Entry = { point: Point; expiresAt: number; epoch: number };
type History = { seq: number; sentAt: number };
type Bucket = { at: number; count: number };
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function validAnchor(point: unknown): point is Point {
  if (!point || typeof point !== "object" || Array.isArray(point)) return false;
  const value = point as Record<string, unknown>;
  return (
    Object.keys(value).length === 2 &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    value.x >= 0 &&
    value.x <= 1 &&
    value.y >= 0 &&
    value.y <= 1
  );
}
export function activeAnchorSlot(
  show: ShowState,
  slot: Slot,
  serverNow: number,
): boolean {
  const person = show.participants[slot];
  return (
    (show.mode === "live" ||
      show.mode === "solo" ||
      show.transport === "livekit") &&
    (show.mode !== "solo" || slot === "A") &&
    !soloMediaClosed(show, serverNow) &&
    show.phase === "live" &&
    show.umbrella.owner === slot &&
    !!show.renderLease.clientId &&
    !show.renderLease.releasedAt &&
    show.renderLease.epoch === show.epoch &&
    show.renderLease.expiresAt > serverNow &&
    person.connected &&
    person.camera &&
    person.ready &&
    person.admitted &&
    person.consentBroadcast &&
    person.calibrated
  );
}
export function anchorSenderSlot(
  sender: AnchorSender,
  show: ShowState,
): Slot | null {
  if (!sender.metadata || sender.metadata.length > 512) return null;
  try {
    const value: unknown = JSON.parse(sender.metadata);
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const data = value as Record<string, unknown>;
    if (
      data.showId !== show.id ||
      !Number.isSafeInteger(data.epoch) ||
      Number(data.epoch) < 1 ||
      Number(data.epoch) > show.epoch
    )
      return null;
    if (
      data.role === "director" &&
      data.slot === "A" &&
      rendererParticipantMatches(show, sender, "director")
    )
      return "A";
    // A connected guest's immutable grant survives a director epoch change. The
    // packet still needs the current epoch and fresh server admission below.
    if (
      data.role === "performer" &&
      show.mode !== "solo" &&
      data.slot === "B" &&
      sender.identity === `performer-${show.id}-B`
    )
      return "B";
  } catch {
    /* Unknown or mutable-looking senders cannot drive presentation. */
  }
  return null;
}
export function encodeAnchor(
  packet: AnchorPacket,
): Uint8Array<ArrayBuffer> | null {
  if (!validAnchor(packet.point)) return null;
  const bytes = encoder.encode(JSON.stringify(packet));
  return bytes.byteLength <= ANCHOR_LIMITS.maxBytes ? bytes : null;
}
export function decodeAnchor(bytes: Uint8Array): AnchorPacket | null {
  if (bytes.byteLength === 0 || bytes.byteLength > ANCHOR_LIMITS.maxBytes)
    return null;
  try {
    const value: unknown = JSON.parse(decoder.decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const packet = value as Record<string, unknown>;
    if (
      Object.keys(packet).length !== 7 ||
      packet.v !== 1 ||
      typeof packet.showId !== "string" ||
      packet.showId.length > 80 ||
      !Number.isSafeInteger(packet.epoch) ||
      Number(packet.epoch) < 1 ||
      !Number.isSafeInteger(packet.seq) ||
      Number(packet.seq) < 1 ||
      !Number.isSafeInteger(packet.sentAt) ||
      Number(packet.sentAt) < 1 ||
      !["A", "B"].includes(String(packet.slot)) ||
      !validAnchor(packet.point)
    )
      return null;
    return packet as AnchorPacket;
  } catch {
    return null;
  }
}

/** Two bounded slots. Values are disposable presentation, never authoritative show state. */
export class TransientAnchorReceiver {
  private scope = "";
  private entries: Partial<Record<Slot, Entry>> = {};
  private history: Partial<Record<Slot, History>> = {};
  private buckets: Partial<Record<Slot, Bucket>> = {};

  private syncScope(show: ShowState) {
    const next = `${show.id}:${show.epoch}:${show.renderLease.incarnationId || "legacy"}:${show.renderLease.incarnationSequence || 0}`;
    if (next === this.scope) return;
    this.clear();
    this.scope = next;
  }

  receive(
    bytes: Uint8Array,
    sender: AnchorSender,
    show: ShowState,
    serverNow: number,
    localNow: number,
  ): boolean {
    this.syncScope(show);
    const slot = anchorSenderSlot(sender, show);
    if (
      !slot ||
      !activeAnchorSlot(show, slot, serverNow) ||
      bytes.byteLength > ANCHOR_LIMITS.maxBytes
    )
      return false;
    let bucket = this.buckets[slot];
    if (!bucket || localNow - bucket.at >= 1000 || localNow < bucket.at)
      bucket = this.buckets[slot] = { at: localNow, count: 0 };
    if (++bucket.count > ANCHOR_LIMITS.receivePerSecond) return false;
    const packet = decodeAnchor(bytes);
    if (
      !packet ||
      packet.slot !== slot ||
      packet.showId !== show.id ||
      packet.epoch !== show.epoch
    )
      return false;
    const age = serverNow - packet.sentAt;
    const previous = this.history[slot];
    if (
      age > ANCHOR_LIMITS.maxAgeMs ||
      age < -ANCHOR_LIMITS.futureSkewMs ||
      (previous &&
        (packet.seq <= previous.seq || packet.sentAt < previous.sentAt))
    )
      return false;
    this.history[slot] = { seq: packet.seq, sentAt: packet.sentAt };
    this.entries[slot] = {
      point: { ...packet.point },
      epoch: packet.epoch,
      expiresAt: localNow + ANCHOR_LIMITS.ttlMs - Math.max(0, age),
    };
    return true;
  }
  local(
    slot: Slot,
    point: Point,
    show: ShowState,
    serverNow: number,
    localNow: number,
  ): boolean {
    this.syncScope(show);
    if (!validAnchor(point) || !activeAnchorSlot(show, slot, serverNow))
      return false;
    this.entries[slot] = {
      point: { ...point },
      epoch: show.epoch,
      expiresAt: localNow + ANCHOR_LIMITS.ttlMs,
    };
    return true;
  }
  current(
    show: ShowState,
    serverNow: number,
    localNow: number,
  ): Record<Slot, Point | null> {
    this.syncScope(show);
    const result: Record<Slot, Point | null> = { A: null, B: null };
    for (const slot of ["A", "B"] as const) {
      const entry = this.entries[slot];
      if (!entry) continue;
      if (
        entry.epoch !== show.epoch ||
        entry.expiresAt <= localNow ||
        !activeAnchorSlot(show, slot, serverNow)
      )
        delete this.entries[slot];
      else result[slot] = entry.point;
    }
    return result;
  }
  clear(slot?: Slot) {
    if (slot) {
      delete this.entries[slot];
      delete this.history[slot];
      delete this.buckets[slot];
    } else {
      this.scope = "";
      this.entries = {};
      this.history = {};
      this.buckets = {};
    }
  }
}
