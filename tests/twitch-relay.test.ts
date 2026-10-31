import { describe, expect, it } from "vitest";
import { compactChatEnvelope } from "@/lib/twitch-relay";

function notification() {
  return {
    metadata: {
      message_type: "notification",
      subscription_type: "channel.chat.message",
      message_id: "notification-fixture",
      message_timestamp: "2026-11-01T12:00:00.123456789Z",
    },
    payload: {
      subscription: {
        id: "subscription-fixture",
        type: "channel.chat.message",
        version: "1",
        condition: { broadcaster_user_id: "100", user_id: "100" },
      },
      event: {
        broadcaster_user_id: "100",
        chatter_user_id: "200",
        chatter_user_name: "Fixture_Name",
        message_id: "chat-fixture",
        message: {
          text: "!wild",
          fragments: [{ text: "unused provider metadata".repeat(2000) }],
        },
        badges: [{ info: "unused badge metadata".repeat(1000) }],
      },
    },
  };
}
describe("minimal bounded Twitch relay", () => {
  it.each([
    "BTPLNWL9eUwyraAOcqg4S1F70EKKx1j2JPOfvz2IAgg=",
    "Axj/xO9m6nhD1qgz9jQZ/K31IQMz+WlnAXHQWpSGpRA=",
  ])("preserves an opaque provider notification ID: %s", (messageId) => {
    const incoming = notification();
    incoming.metadata.message_id = messageId;
    expect(compactChatEnvelope(incoming)?.metadata.message_id).toBe(messageId);
  });
  it.each(["", "x".repeat(129), 123, null])(
    "rejects an unbounded or non-string opaque identifier: %s",
    (invalid) => {
      for (const field of ["notification", "subscription", "chat"] as const) {
        const incoming = notification();
        if (field === "notification")
          Object.assign(incoming.metadata, { message_id: invalid });
        else if (field === "subscription")
          Object.assign(incoming.payload.subscription, { id: invalid });
        else Object.assign(incoming.payload.event, { message_id: invalid });
        expect(compactChatEnvelope(incoming)).toBeNull();
      }
    },
  );
  it("preserves authorization, identity and precise timing while stripping unrelated provider fields", () => {
    const relay = compactChatEnvelope(notification());
    expect(relay).toMatchObject({
      metadata: {
        message_id: "notification-fixture",
        message_timestamp: "2026-11-01T12:00:00.123456789Z",
      },
      payload: {
        subscription: {
          id: "subscription-fixture",
          condition: { broadcaster_user_id: "100", user_id: "100" },
        },
        event: {
          chatter_user_id: "200",
          message_id: "chat-fixture",
          message: { text: "!wild" },
        },
      },
    });
    const body = JSON.stringify({ envelopes: Array(20).fill(relay) });
    expect(new TextEncoder().encode(body).byteLength).toBeLessThan(65_000);
    expect(body).not.toContain("fragments");
    expect(body).not.toContain("badges");
    expect(body).not.toContain("unused");
  });
  it("never forwards unrelated chat or malformed notification identity", () => {
    const unrelated = notification();
    unrelated.payload.event.message.text = "Private unrelated conversation";
    expect(compactChatEnvelope(unrelated)).toBeNull();
    const malformed = notification();
    malformed.payload.event.chatter_user_id = "not-an-account";
    expect(compactChatEnvelope(malformed)).toBeNull();
    expect(compactChatEnvelope(null)).toBeNull();
  });
});
