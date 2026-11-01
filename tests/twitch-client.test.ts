import { afterEach, describe, expect, it, vi } from "vitest";
import { TwitchConnector } from "@/lib/twitch-client";

const sockets: FixtureSocket[] = [];
class FixtureSocket {
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(_url: string) {
    sockets.push(this);
  }
  close() {}
  receive(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}
afterEach(() => {
  sockets.length = 0;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Twitch intake delivery warnings", () => {
  it.each([0, 2])(
    "reports rate-limited commands from a successful batch response (%i dropped)",
    async (rateLimited) => {
      vi.useFakeTimers();
      vi.stubGlobal("WebSocket", FixtureSocket);
      const fetch = vi.fn(async (_path: string) =>
        Response.json({ counted: 1, ignored: 0, rateLimited }),
      );
      vi.stubGlobal("fetch", fetch);
      const onState = vi.fn(),
        onEvent = vi.fn();
      const connector = new TwitchConnector(
        "fixture-show",
        onState,
        onEvent,
        () => ({ rendererId: "fixture-renderer", epoch: 1 }),
      );
      connector.start();
      const socket = sockets[0];
      const welcome = {
        metadata: { message_type: "session_welcome" },
        payload: { session: { id: "fixture-session" } },
      };
      socket.receive(welcome);
      await vi.advanceTimersByTimeAsync(0);
      onState.mockClear();
      onEvent.mockClear();
      socket.receive({
        metadata: {
          message_type: "notification",
          subscription_type: "channel.chat.message",
          message_id: "fixture-notification",
          message_timestamp: new Date().toISOString(),
        },
        payload: {
          subscription: {
            id: "fixture-subscription",
            type: "channel.chat.message",
            version: "1",
            condition: { broadcaster_user_id: "100", user_id: "100" },
          },
          event: {
            broadcaster_user_id: "100",
            chatter_user_id: "200",
            message_id: "fixture-message",
            message: { text: "!wild" },
          },
        },
      });
      await vi.advanceTimersByTimeAsync(250);
      expect(
        fetch.mock.calls.filter(([path]) => path.endsWith("/twitch/events")),
      ).toHaveLength(1);
      expect(onEvent).toHaveBeenCalledOnce();
      if (rateLimited) {
        expect(onState).toHaveBeenCalledWith(
          "connected",
          expect.stringContaining(
            "some commands may not have reached the stage",
          ),
        );
        socket.receive(welcome);
        await vi.advanceTimersByTimeAsync(0);
        expect(onState).toHaveBeenLastCalledWith(
          "connected",
          expect.stringContaining("rate limited"),
        );
      } else expect(onState).not.toHaveBeenCalled();
      connector.stop();
    },
  );
  it("reports a failed subscription as a distinct stopped state", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FixtureSocket);
    const message = "Twitch authorization expired or was revoked.";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: message }, { status: 403 })),
    );
    const onState = vi.fn();
    const connector = new TwitchConnector(
      "fixture-show",
      onState,
      vi.fn(),
      () => ({
        rendererId: "fixture-renderer",
        epoch: 1,
      }),
    );
    connector.start();
    sockets[0].receive({
      metadata: { message_type: "session_welcome" },
      payload: { session: { id: "fixture-session" } },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(onState).toHaveBeenLastCalledWith("failed", message);
    connector.stop();
  });
});
