import { parseAudienceCommand } from "./show-grammar";

export type ChatRelayEnvelope = {
  metadata: {
    message_type: "notification";
    subscription_type: "channel.chat.message";
    message_id: string;
    message_timestamp: string;
  };
  payload: {
    subscription: {
      id: string;
      type: "channel.chat.message";
      version: "1";
      condition: { broadcaster_user_id: string; user_id: string };
    };
    event: {
      broadcaster_user_id: string;
      chatter_user_id: string;
      chatter_user_name?: string;
      chatter_user_login?: string;
      message_id: string;
      message: { text: string };
    };
  };
};
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const identifier = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const account = (value: unknown): value is string =>
  typeof value === "string" && /^\d{1,30}$/.test(value);
const display = (value: unknown) =>
  typeof value === "string" ? value.slice(0, 50) : undefined;

/** Keep only fields the server validates; badges, fragments and unrelated chat never leave this browser. */
export function compactChatEnvelope(input: unknown): ChatRelayEnvelope | null {
  const envelope = object(input),
    metadata = object(envelope.metadata),
    payload = object(envelope.payload);
  const subscription = object(payload.subscription),
    condition = object(subscription.condition),
    event = object(payload.event),
    message = object(event.message);
  if (
    metadata.message_type !== "notification" ||
    metadata.subscription_type !== "channel.chat.message" ||
    subscription.type !== "channel.chat.message" ||
    subscription.version !== "1" ||
    !identifier(metadata.message_id) ||
    !identifier(subscription.id) ||
    !identifier(event.message_id) ||
    !account(condition.broadcaster_user_id) ||
    !account(condition.user_id) ||
    !account(event.broadcaster_user_id) ||
    !account(event.chatter_user_id) ||
    typeof metadata.message_timestamp !== "string" ||
    metadata.message_timestamp.length > 64 ||
    !/^[\dTZ:+.\-]+$/.test(metadata.message_timestamp) ||
    typeof message.text !== "string" ||
    message.text.length > 500 ||
    !parseAudienceCommand(message.text)
  )
    return null;
  return {
    metadata: {
      message_type: "notification",
      subscription_type: "channel.chat.message",
      message_id: metadata.message_id,
      message_timestamp: metadata.message_timestamp,
    },
    payload: {
      subscription: {
        id: subscription.id,
        type: "channel.chat.message",
        version: "1",
        condition: {
          broadcaster_user_id: condition.broadcaster_user_id,
          user_id: condition.user_id,
        },
      },
      event: {
        broadcaster_user_id: event.broadcaster_user_id,
        chatter_user_id: event.chatter_user_id,
        chatter_user_name: display(event.chatter_user_name),
        chatter_user_login: display(event.chatter_user_login),
        message_id: event.message_id,
        message: { text: message.text },
      },
    },
  };
}
