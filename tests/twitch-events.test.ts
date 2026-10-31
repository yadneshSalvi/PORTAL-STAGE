import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const records = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/server/store", () => ({
  getStore: () => ({
    get: async (id: string) => structuredClone(records.get(id) ?? null),
    create: async (id: string, value: unknown) => {
      if (records.has(id)) return false;
      records.set(id, structuredClone(value));
      return true;
    },
    update: async (id: string, change: (value: any) => unknown) => {
      const value = structuredClone(records.get(id));
      const result = change(value);
      records.set(id, value);
      return result;
    },
  }),
}));
import { acquireLease, createRecord } from "@/server/core";
import { ingestChat } from "@/server/twitch";
import { sign } from "@/server/security";
import type { ShowRecord } from "@/server/records";
const showId = "ps_1111222233334444",
  owner = "123e4567-e89b-12d3-a456-426614174000",
  guest = "123e4567-e89b-12d3-a456-426614174001";
const now = Date.parse("2026-10-31T12:00:00.000Z");
function show() {
  return records.get("show:" + showId) as ShowRecord;
}
function request(id = owner) {
  return new Request("http://localhost:3200/api", {
    headers: {
      Cookie: "portal_session=" + sign({ id, expiresAt: now + 60_000 }),
    },
  });
}
function event(text = "!gentle", user = "123", messageId = "message-1") {
  return {
    rendererId: "test-renderer",
    epoch: 1,
    envelope: {
      metadata: {
        message_type: "notification",
        subscription_type: "channel.chat.message",
        message_id: "notification-" + messageId,
        message_timestamp: new Date(now).toISOString(),
      },
      payload: {
        subscription: {
          id: "subscription-1",
          type: "channel.chat.message",
          version: "1",
          condition: { broadcaster_user_id: "100", user_id: "100" },
        },
        event: {
          broadcaster_user_id: "100",
          chatter_user_id: user,
          message_id: messageId,
          message: { text },
        },
      },
    },
  };
}
beforeEach(() => {
  records.clear();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv(
    "SESSION_SECRET",
    "fixture-only-session-key-at-least-32-characters",
  );
  const record = createRecord(
    showId,
    owner,
    "live",
    now - 1000,
    "fixture-host",
  );
  acquireLease(record, "test-renderer", false, now);
  record.channelId = "100";
  record.participantSessions.B = guest;
  record.state.phase = "live";
  record.state.twitch.connected = true;
  record.state.twitch.subscriptionId = "subscription-1";
  record.state.round = {
    id: "round-1",
    openedAt: now - 1000,
    closesAt: now + 20_000,
    status: "open",
    closedAt: null,
    tallies: { gentle: 0, wild: 0 },
    uniqueVoters: 0,
    result: null,
    source: null,
    lastMessageAt: null,
  };
  records.set("show:" + showId, record);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Twitch notification boundary", () => {
  it("replaces one user's ballot and deduplicates message identity across notification IDs", async () => {
    await ingestChat(showId, request(), event());
    const duplicate = event();
    duplicate.envelope.metadata.message_id = "redelivery-notification";
    await ingestChat(showId, request(), duplicate);
    expect(show().state.round).toMatchObject({
      uniqueVoters: 1,
      tallies: { gentle: 1, wild: 0 },
    });
    expect(
      show().state.events.filter((item) => item.type === "round.vote"),
    ).toHaveLength(1);
    await ingestChat(showId, request(), event("!wild", "123", "message-2"));
    expect(show().state.round).toMatchObject({
      uniqueVoters: 1,
      tallies: { gentle: 0, wild: 1 },
    });
    expect(Object.keys(show().ballots)[0]).not.toBe("123");
    expect(show().messageIds).not.toContain("message-1");
  });
  it("does not retain or count unrelated text and extra command arguments", async () => {
    expect(
      await ingestChat(showId, request(), event("private unrelated text")),
    ).toEqual({ counted: false, reason: "unrelated" });
    expect(await ingestChat(showId, request(), event("!wild extra"))).toEqual({
      counted: false,
      reason: "unrelated",
    });
    expect(show().state.round?.uniqueVoters).toBe(0);
    expect(JSON.stringify(show())).not.toContain("private unrelated text");
  });
  it("rejects guest forwarding and a stale renderer epoch before changing ballots", async () => {
    await expect(
      ingestChat(showId, request(guest), event()),
    ).rejects.toMatchObject({ status: 403, code: "director_required" });
    await expect(
      ingestChat(showId, request(), { ...event(), epoch: 0 }),
    ).rejects.toMatchObject({ status: 409, code: "renderer_fenced" });
    expect(show().state.round?.uniqueVoters).toBe(0);
  });
  it("rejects another channel or subscription and malformed identities", async () => {
    const channel = event();
    channel.envelope.payload.event.broadcaster_user_id = "999";
    await expect(ingestChat(showId, request(), channel)).rejects.toMatchObject({
      code: "twitch_channel",
    });
    const subscription = event();
    subscription.envelope.payload.subscription.id = "another-subscription";
    await expect(
      ingestChat(showId, request(), subscription),
    ).rejects.toMatchObject({ code: "twitch_subscription" });
    await expect(
      ingestChat(showId, request(), event("!wild", "not-a-user-id")),
    ).rejects.toMatchObject({ code: "twitch_identity" });
    expect(show().state.round?.uniqueVoters).toBe(0);
  });
  it("rejects stale/future notifications and commands outside the actual round", async () => {
    for (const timestamp of [now - 60_001, now + 5001]) {
      const stale = event();
      stale.envelope.metadata.message_timestamp = new Date(
        timestamp,
      ).toISOString();
      await expect(ingestChat(showId, request(), stale)).rejects.toMatchObject({
        code: "twitch_timestamp",
      });
    }
    const beforeRound = event();
    beforeRound.envelope.metadata.message_timestamp = new Date(
      now - 2000,
    ).toISOString();
    await expect(
      ingestChat(showId, request(), beforeRound),
    ).rejects.toMatchObject({ code: "vote_window" });
    show().state.round!.status = "closed";
    await expect(ingestChat(showId, request(), event())).rejects.toMatchObject({
      code: "vote_window",
    });
    expect(show().state.round?.uniqueVoters).toBe(0);
  });
  it("rejects events after a connection gap or while the stage is held", async () => {
    show().state.twitch.connected = false;
    await expect(ingestChat(showId, request(), event())).rejects.toMatchObject({
      code: "twitch_gap",
    });
    show().state.twitch.connected = true;
    show().state.phase = "hold";
    await expect(ingestChat(showId, request(), event())).rejects.toMatchObject({
      code: "stage_held",
    });
    expect(show().state.round?.uniqueVoters).toBe(0);
  });
});
