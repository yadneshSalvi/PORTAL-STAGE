import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const records = vi.hoisted(() => new Map<string, unknown>());
const writes = vi.hoisted(() => ({ count: 0 }));
const hooks = vi.hoisted(() => ({ beforeUpdate: null as (() => void) | null }));
vi.mock("@/server/store", () => ({
  getStore: () => ({
    get: async (id: string) => structuredClone(records.get(id) ?? null),
    create: async (id: string, value: unknown) => {
      if (records.has(id)) return false;
      records.set(id, structuredClone(value));
      return true;
    },
    update: async (id: string, change: (value: any) => unknown) => {
      writes.count += 1;
      hooks.beforeUpdate?.();
      const value = structuredClone(records.get(id));
      const result = change(value);
      records.set(id, value);
      return result;
    },
  }),
}));
import { acquireLease, createRecord } from "@/server/core";
import { POST } from "@/app/api/shows/[showId]/[...action]/route";
import { ingestChat } from "@/server/twitch";
import { privateActor, sign } from "@/server/security";
import type { ShowRecord } from "@/server/records";
const showId = "ps_1111222233334444",
  owner = "123e4567-e89b-12d3-a456-426614174000",
  guest = "123e4567-e89b-12d3-a456-426614174001";
const now = Date.parse("2026-10-31T12:00:00.000Z");
function show() {
  return records.get("show:" + showId) as ShowRecord;
}
function request(id = owner, body?: Record<string, unknown>) {
  return new Request(
    `http://localhost:3200/api/shows/${showId}/twitch/events`,
    {
      method: "POST",
      headers: {
        Origin: "http://localhost:3200",
        "Content-Type": "application/json",
        Cookie: "portal_session=" + sign({ id, expiresAt: now + 60_000 }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
}
function post(body: Record<string, unknown>, who = owner) {
  return POST(request(who, body), {
    params: Promise.resolve({ showId, action: ["twitch", "events"] }),
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
  writes.count = 0;
  hooks.beforeUpdate = null;
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv(
    "SESSION_SECRET",
    "fixture-only-session-key-at-least-32-characters",
  );
  vi.stubEnv("APP_BASE_URL", "http://localhost:3200");
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
  it("commits a labeled synthetic hundred-event burst in five bounded database mutations", async () => {
    for (let batch = 0; batch < 5; batch++) {
      const envelopes = Array.from(
        { length: 20 },
        (_, index) =>
          event(
            index % 2 ? "!wild" : "!gentle",
            String(batch * 20 + index + 1000),
            `burst-${batch}-${index}`,
          ).envelope,
      );
      expect(
        await ingestChat(showId, request(), {
          rendererId: "test-renderer",
          epoch: 1,
          envelopes,
        }),
      ).toEqual({ counted: 20, ignored: 0 });
    }
    expect(writes.count).toBe(5);
    expect(show().state.round).toMatchObject({
      uniqueVoters: 100,
      tallies: { gentle: 50, wild: 50 },
    });
    expect(
      show().state.events.filter((item) => item.type === "round.vote"),
    ).toHaveLength(100);
  });
  it("ignores another channel's envelope without discarding a valid vote", async () => {
    const wrong = event("!wild", "999");
    wrong.envelope.payload.event.broadcaster_user_id = "888";
    const response = await post({
      rendererId: "test-renderer",
      epoch: 1,
      envelopes: [event().envelope, wrong.envelope],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ counted: 1, ignored: 1 });
    expect(writes.count).toBe(1);
    expect(show().state.round?.uniqueVoters).toBe(1);
  });
  it("rejects empty, oversized or non-array batches before any durable mutation", async () => {
    for (const envelopes of [[], Array(21).fill(event().envelope), "invalid"])
      await expect(
        ingestChat(showId, request(), {
          rendererId: "test-renderer",
          epoch: 1,
          envelopes,
        }),
      ).rejects.toMatchObject({ code: "twitch_batch" });
    expect(writes.count).toBe(0);
    expect(show().state.round?.uniqueVoters).toBe(0);
  });
  it("returns 200 for one stale envelope and 19 valid votes, then deduplicates redelivery", async () => {
    const stale = event("!wild", "999", "stale-message").envelope;
    stale.metadata.message_timestamp = new Date(now - 60_001).toISOString();
    const body = {
      rendererId: "test-renderer",
      epoch: 1,
      envelopes: [
        stale,
        ...Array.from(
          { length: 19 },
          (_, index) =>
            event("!gentle", String(1000 + index), `valid-${index}`).envelope,
        ),
      ],
    };
    const response = await post(body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ counted: 19, ignored: 1 });
    expect(writes.count).toBe(1);
    expect(show().state.round).toMatchObject({
      uniqueVoters: 19,
      tallies: { gentle: 19, wild: 0 },
    });
    const replay = await post(body);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ counted: 0, ignored: 20 });
    expect(
      show().state.events.filter((item) => item.type === "round.vote"),
    ).toHaveLength(19);
  });
  it("skips a notification from the replaced subscription and keeps the current subscription's vote", async () => {
    const old = event("!wild", "999", "old-subscription").envelope;
    old.payload.subscription.id = "subscription-before-reconnect";
    const response = await post({
      rendererId: "test-renderer",
      epoch: 1,
      envelopes: [old, event().envelope],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ counted: 1, ignored: 1 });
    expect(show().state.round).toMatchObject({
      uniqueVoters: 1,
      tallies: { gentle: 1, wild: 0 },
    });
  });
  it("isolates malformed envelopes, invalid identities and oversized messages within a batch", async () => {
    const invalidIdentity = event("!wild", "invalid-user").envelope;
    const oversized = event("x".repeat(501), "999", "oversized").envelope;
    const response = await post({
      rendererId: "test-renderer",
      epoch: 1,
      envelopes: [
        null,
        "invalid-envelope",
        [],
        {},
        invalidIdentity,
        oversized,
        event().envelope,
      ],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ counted: 1, ignored: 6 });
    expect(show().state.round?.uniqueVoters).toBe(1);
  });
  it("keeps fractional Twitch timestamp ordering after ignoring an invalid envelope", async () => {
    const newer = event("!wild", "123", "newer").envelope;
    newer.metadata.message_timestamp = "2026-10-31T12:00:00.000999999Z";
    const older = event("!gentle", "123", "older").envelope;
    older.metadata.message_timestamp = "2026-10-31T12:00:00.000123456Z";
    const response = await post({
      rendererId: "test-renderer",
      epoch: 1,
      envelopes: [newer, null, older],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ counted: 2, ignored: 1 });
    expect(show().state.round).toMatchObject({
      uniqueVoters: 1,
      tallies: { gentle: 0, wild: 1 },
    });
  });
  it("ignores a full vote-message budget while accepting a presence effect in the same batch", async () => {
    show().messageIds = Array.from(
      { length: 5000 },
      (_, index) => `fixture-vote-capacity-${index}`,
    );
    const response = await post({
      rendererId: "test-renderer",
      epoch: 1,
      envelopes: [
        event("!wild", "123", "full-budget-vote").envelope,
        event("!cheer", "124", "independent-effect").envelope,
      ],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ counted: 1, ignored: 1 });
    expect(show().state.round?.uniqueVoters).toBe(0);
    expect(show().state.presenceEffects).toHaveLength(1);
    expect(show().messageIds).toHaveLength(5000);
  });
  it("ignores a new voter at round capacity and still replaces an existing voter's legacy ballot", async () => {
    show().ballots = Object.fromEntries(
      Array.from({ length: 2000 }, (_, index) => [
        privateActor(`${showId}:${index + 1000}`),
        "gentle" as const,
      ]),
    );
    Object.assign(show().state.round!, {
      uniqueVoters: 2000,
      tallies: { gentle: 2000, wild: 0 },
    });
    const response = await post({
      rendererId: "test-renderer",
      epoch: 1,
      envelopes: [
        event("!wild", "999", "capacity-new-voter").envelope,
        event("!wild", "1000", "capacity-existing-voter").envelope,
      ],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ counted: 1, ignored: 1 });
    expect(show().state.round).toMatchObject({
      uniqueVoters: 2000,
      tallies: { gentle: 1999, wild: 1 },
    });
    expect(Object.keys(show().ballots)).toHaveLength(2000);
    expect(show().messageIds).toHaveLength(1);
  });
  it("deduplicates the same committed batch when its HTTP response was lost", async () => {
    const body = {
      rendererId: "test-renderer",
      epoch: 1,
      envelopes: [
        event("!gentle", "123", "lost-response-1").envelope,
        event("!wild", "124", "lost-response-2").envelope,
      ],
    };
    await ingestChat(showId, request(), body); // The simulated caller never receives this successful response.
    expect(await ingestChat(showId, request(), body)).toEqual({
      counted: 0,
      ignored: 2,
    });
    expect(show().state.round).toMatchObject({
      uniqueVoters: 2,
      tallies: { gentle: 1, wild: 1 },
    });
    expect(
      show().state.events.filter((item) => item.type === "round.vote"),
    ).toHaveLength(2);
  });
  it("accepts only in-window delivery during closing grace and ignores unrelated choices in a mixed batch", async () => {
    Object.assign(show().state.round!, {
      openedAt: now - 5000,
      closesAt: now - 1000,
      status: "closing",
      graceEndsAt: now + 2000,
    });
    const late = event("!wild", "124", "in-window");
    late.envelope.metadata.message_timestamp = new Date(
      now - 1100,
    ).toISOString();
    const outside = event("!gentle", "125", "after-close");
    expect(
      await ingestChat(showId, request(), {
        rendererId: "test-renderer",
        epoch: 1,
        envelopes: [outside.envelope, late.envelope, event("!share").envelope],
      }),
    ).toEqual({ counted: 1, ignored: 2 });
    expect(show().state.round).toMatchObject({
      uniqueVoters: 1,
      tallies: { wild: 1 },
    });
  });
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
  it("keeps origin, session and director checks on the whole request even when every envelope is invalid", async () => {
    const body = {
      rendererId: "test-renderer",
      epoch: 1,
      envelopes: [null],
    };
    const unsigned = request(owner, body);
    unsigned.headers.delete("Cookie");
    const foreignOrigin = request(owner, body);
    foreignOrigin.headers.set("Origin", "https://other.example");
    for (const [forwarded, code] of [
      [request(guest, body), "director_required"],
      [unsigned, "show_access"],
      [foreignOrigin, "origin"],
    ] as const) {
      const response = await POST(forwarded, {
        params: Promise.resolve({ showId, action: ["twitch", "events"] }),
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code });
    }
    expect(writes.count).toBe(0);
    expect(show().state.round?.uniqueVoters).toBe(0);
  });
  it("keeps renderer, epoch, exact incarnation and lease expiry checks outside per-envelope handling", async () => {
    const body = {
      rendererId: "test-renderer",
      epoch: 1,
      envelopes: [null, event().envelope],
    };
    const assertFenced = async (forwarded: Record<string, unknown>) => {
      const response = await post(forwarded);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: "renderer_fenced" });
    };
    await assertFenced({ ...body, rendererId: "replaced-renderer" });
    await assertFenced({ ...body, epoch: 0 });
    Object.assign(show().state.renderLease, {
      incarnationId: "current-page",
      incarnationSequence: 2,
    });
    await assertFenced({
      ...body,
      incarnationId: "old-page",
      incarnationSequence: 1,
    });
    show().state.renderLease.expiresAt = now;
    await assertFenced({
      ...body,
      incarnationId: "current-page",
      incarnationSequence: 2,
    });
    expect(writes.count).toBe(0);
    expect(show().state.round?.uniqueVoters).toBe(0);
  });
  it.each(["subscription", "connection", "lease"] as const)(
    "rejects the entire request when its %s changes before the durable mutation",
    async (changed) => {
      hooks.beforeUpdate = () => {
        if (changed === "subscription")
          show().state.twitch.subscriptionId = "replacement-subscription";
        else if (changed === "connection")
          show().state.twitch.connected = false;
        else show().state.renderLease.expiresAt = now;
      };
      const response = await post({
        rendererId: "test-renderer",
        epoch: 1,
        envelopes: [null, event().envelope],
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: changed === "lease" ? "renderer_fenced" : "twitch_gap",
      });
      expect(writes.count).toBe(1);
      expect(show().state.round?.uniqueVoters).toBe(0);
      expect(show().messageIds).toEqual([]);
    },
  );
  it("enforces subscription health even when a batch has only unrelated or malformed envelopes", async () => {
    show().state.twitch.connected = false;
    const response = await post({
      rendererId: "test-renderer",
      epoch: 1,
      envelopes: [null, event("unrelated fixture text").envelope],
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "twitch_gap" });
    expect(show().state.round?.uniqueVoters).toBe(0);
  });
  it("counts the last rate-allowed item without losing it to the next item, while keeping single-event rate errors strict", async () => {
    show().rates["chat-events"] = { at: now, count: 2999 };
    const response = await post({
      rendererId: "test-renderer",
      epoch: 1,
      envelopes: [
        event("!gentle", "123", "rate-first").envelope,
        event("!wild", "124", "rate-second").envelope,
      ],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ counted: 1, ignored: 1 });
    expect(show().state.round).toMatchObject({
      uniqueVoters: 1,
      tallies: { gentle: 1, wild: 0 },
    });
    expect(show().rates["chat-events"].count).toBe(3000);
    expect(show().messageIds).toHaveLength(1);
    const strict = await post({
      ...event("!wild", "124", "strict-rate-limit"),
    });
    expect(strict.status).toBe(429);
    expect(await strict.json()).toMatchObject({ code: "rate_limit" });
    expect(show().state.round?.uniqueVoters).toBe(1);
    expect(show().messageIds).toHaveLength(1);
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
