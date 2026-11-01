import { randomBytes, randomUUID } from "node:crypto";
import { rate, recordEvent, requireDirector, requireLease } from "./core";
import { assert, HttpError } from "./errors";
import {
  castVote,
  eventOrder,
  presenceEffect,
  safeContributor,
} from "./audience";
import {
  parseAudienceCommand,
  PRESENCE_EFFECTS,
  type AudienceChoice,
  type PresenceEffect,
} from "@/lib/show-grammar";
import type { SessionRecord, ShowRecord } from "./records";
import { appOrigin, digest, encryptToken, privateActor } from "./security";
import {
  actorFor,
  hostAllowed,
  invitedLogin,
  loadRecord,
  sessionKey,
  sessionRecord,
  showKey,
} from "./shows";
import { getStore } from "./store";
import { publicSoloConfigured, requireSoloAccess } from "./solo-policy";
import {
  ensureOAuthGrant,
  twitchAppId,
  validateTwitchToken,
  type Credential,
  type TokenGrant,
} from "./twitch-grants";
export function redirectUri() {
  const configured =
    process.env.TWITCH_REDIRECT_URI ||
    new URL("/auth/twitch/callback", appOrigin()).toString();
  assert(
    new URL(configured).origin === appOrigin() &&
      new URL(configured).pathname === "/auth/twitch/callback",
    503,
    "twitch_redirect",
    "Configure this app's exact Twitch callback before signing in.",
  );
  return configured;
}
export async function startOAuth(sessionId: string) {
  await sessionRecord(sessionId);
  const state = randomBytes(32).toString("base64url");
  await getStore().update<SessionRecord, void>(
    sessionKey(sessionId),
    (value) => {
      rate(value.rates, "oauth", 8, 600_000);
      value.oauth = { hash: digest(state), expiresAt: Date.now() + 600_000 };
    },
  );
  const url = new URL("https://id.twitch.tv/oauth2/authorize");
  url.search = new URLSearchParams({
    client_id: twitchAppId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "user:read:chat",
    state,
    force_verify: "true",
  }).toString();
  return url.toString();
}
export async function finishOAuth(
  sessionId: string,
  state: string,
  code: string,
) {
  assert(
    state.length >= 32 &&
      state.length <= 128 &&
      code.length > 0 &&
      code.length <= 512,
    400,
    "oauth_callback",
    "This Twitch callback is incomplete.",
  );
  await getStore().update<SessionRecord, void>(
    sessionKey(sessionId),
    (value) => {
      assert(
        value.oauth &&
          value.oauth.expiresAt > Date.now() &&
          value.oauth.hash === digest(state),
        403,
        "oauth_state",
        "This Twitch authorization expired or belongs to another browser.",
      );
      delete value.oauth;
    },
  );
  assert(
    process.env.TWITCH_CLIENT_SECRET,
    503,
    "twitch_unconfigured",
    "The Twitch application secret is missing.",
  );
  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: twitchAppId(),
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  assert(
    response.ok,
    401,
    "oauth_exchange",
    "Twitch could not complete authorization. Connect your channel again.",
  );
  const result = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
  };
  assert(
    typeof result.access_token === "string" &&
      typeof result.refresh_token === "string",
    401,
    "oauth_exchange",
    "Twitch did not return a complete authorization.",
  );
  const info = await validateTwitchToken(result.access_token);
  const grant: TokenGrant = {
    clientId: twitchAppId(),
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    userId: info.user_id,
    login: info.login,
    scopes: info.scopes,
    expiresAt: Date.now() + info.expires_in * 1000,
  };
  if (!invitedLogin(info.login, info.user_id) && !publicSoloConfigured()) {
    // The returned grant is deliberately never encrypted or persisted for an ineligible account.
    await disconnectOAuth(sessionId);
    return false;
  }
  const credentialId = "credential:" + randomUUID();
  await getStore().create<Credential>(credentialId, {
    ownerId: sessionId,
    encrypted: encryptToken(grant),
    source: "oauth-code",
    clientId: twitchAppId(),
    lastValidatedAt: Date.now(),
    status: "ready",
    createdAt: new Date().toISOString(),
  });
  await getStore().update<SessionRecord, void>(
    sessionKey(sessionId),
    (value) => {
      value.credentialId = credentialId;
      value.userId = info.user_id;
      value.login = info.login;
      value.displayName = info.login;
    },
  );
  return hostAllowed(await sessionRecord(sessionId)) || publicSoloConfigured();
}
export async function disconnectOAuth(sessionId: string) {
  const auth = await sessionRecord(sessionId);
  if (auth.credentialId)
    await getStore().update<Credential, void>(auth.credentialId, (value) => {
      value.status = "revoked";
      value.revokedAt = Date.now();
      value.encrypted = "";
    });
  await getStore().update<SessionRecord, void>(
    sessionKey(sessionId),
    (value) => {
      delete value.credentialId;
      delete value.userId;
      delete value.login;
      delete value.displayName;
      delete value.oauth;
    },
  );
}
function authority(body: Record<string, unknown>) {
  return {
    rendererId:
      typeof body.rendererId === "string" ? body.rendererId : undefined,
    epoch: typeof body.epoch === "number" ? body.epoch : undefined,
    incarnationId:
      typeof body.incarnationId === "string" ? body.incarnationId : undefined,
    incarnationSequence:
      typeof body.incarnationSequence === "number"
        ? body.incarnationSequence
        : undefined,
  };
}
export async function connectChat(
  id: string,
  request: Request,
  body: Record<string, unknown>,
) {
  const record = await loadRecord(id),
    actor = await actorFor(record, request);
  requireDirector(actor);
  requireSoloAccess(record);
  const fence = authority(body);
  requireLease(
    record,
    fence.rendererId,
    fence.epoch,
    Date.now(),
    fence.incarnationId,
    fence.incarnationSequence,
  );
  assert(
    record.state.mode !== "rehearsal" && record.credentialId,
    409,
    "live_show_required",
    "Live chat is available in an authorized Twitch show.",
  );
  const sessionId = body.sessionId;
  assert(
    typeof sessionId === "string" &&
      /^[A-Za-z0-9_=:.-]{8,300}$/.test(sessionId),
    400,
    "twitch_session",
    "Twitch did not supply a valid connection identifier.",
  );
  await getStore().update<ShowRecord, void>(showKey(id), (value) =>
    rate(value.rates, "chat-connect", 12, 60_000),
  );
  if (body.reconnect === true) {
    assert(
      record.state.twitch.subscriptionId,
      409,
      "twitch_reconnect",
      "A planned reconnect needs an established subscription.",
    );
    await getStore().update<ShowRecord, void>(showKey(id), (value) => {
      requireLease(
        value,
        fence.rendererId,
        fence.epoch,
        Date.now(),
        fence.incarnationId,
        fence.incarnationSequence,
      );
      value.twitchSessionId = sessionId;
      value.state.twitch.connected = true;
      value.state.twitch.lastHeartbeatAt = Date.now();
      value.state.twitch.status =
        "Twitch chat migrated to its replacement connection.";
    });
    return;
  }
  if (
    record.twitchSessionId === sessionId &&
    record.state.twitch.subscriptionId
  )
    return;
  let grant = await ensureOAuthGrant(record.credentialId, record.ownerId, true);
  const subscribe = (token: string) =>
    fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Client-Id": twitchAppId(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "channel.chat.message",
        version: "1",
        condition: { broadcaster_user_id: grant.userId, user_id: grant.userId },
        transport: { method: "websocket", session_id: sessionId },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  let response = await subscribe(grant.accessToken);
  if (response.status === 401) {
    grant = await ensureOAuthGrant(
      record.credentialId,
      record.ownerId,
      false,
      grant.accessToken,
    );
    response = await subscribe(grant.accessToken);
  }
  if (response.status === 429)
    throw new HttpError(
      429,
      "twitch_rate_limit",
      "Twitch asked us to wait before reconnecting. Retry shortly.",
    );
  assert(
    response.status === 202,
    502,
    "twitch_subscription",
    "Twitch could not establish this chat connection. Try a fresh connection or authorize again.",
  );
  const result = (await response.json()) as { data?: { id: string }[] };
  assert(
    result.data?.[0]?.id,
    502,
    "twitch_subscription",
    "Twitch did not return a subscription identifier.",
  );
  const subscriptionId = result.data[0].id;
  await getStore().update<ShowRecord, void>(showKey(id), (value) => {
    requireLease(
      value,
      fence.rendererId,
      fence.epoch,
      Date.now(),
      fence.incarnationId,
      fence.incarnationSequence,
    );
    value.twitchSessionId = sessionId;
    value.channelId = grant.userId;
    value.state.channel = grant.login;
    value.state.twitch = {
      connected: true,
      connectedAt: Date.now(),
      lastEventAt: null,
      lastHeartbeatAt: Date.now(),
      status: "Listening for !gentle and !wild in Twitch chat.",
      subscriptionId,
    };
    recordEvent(
      value,
      "twitch.connected",
      "director",
      "Real Twitch EventSub chat connected. No chat messages are sent by this application.",
      Date.now(),
    );
  });
}
export async function chatHealth(
  id: string,
  request: Request,
  body: Record<string, unknown>,
) {
  const record = await loadRecord(id),
    actor = await actorFor(record, request);
  requireDirector(actor);
  requireSoloAccess(record);
  const fence = authority(body);
  requireLease(
    record,
    fence.rendererId,
    fence.epoch,
    Date.now(),
    fence.incarnationId,
    fence.incarnationSequence,
  );
  const status = String(body.status || "");
  assert(
    ["connected", "gap", "revoked", "disconnected"].includes(status),
    400,
    "chat_health",
    "Unknown chat connection state.",
  );
  let healthy =
    status === "connected" && Boolean(record.state.twitch.subscriptionId);
  if (healthy && record.credentialId)
    try {
      await ensureOAuthGrant(record.credentialId, record.ownerId);
    } catch {
      healthy = false;
    }
  await getStore().update<ShowRecord, void>(showKey(id), (value) => {
    requireLease(
      value,
      fence.rendererId,
      fence.epoch,
      Date.now(),
      fence.incarnationId,
      fence.incarnationSequence,
    );
    value.state.twitch.connected = healthy;
    value.state.twitch.lastHeartbeatAt = Date.now();
    value.state.twitch.status = healthy
      ? "Twitch chat is connected."
      : status === "revoked"
        ? "Twitch permission was revoked. Connect your channel again."
        : "Chat is disconnected. Messages during the gap cannot be recovered.";
    if (
      !healthy &&
      value.state.round &&
      ["open", "closing"].includes(value.state.round.status)
    ) {
      value.state.round.status = "cancelled";
      recordEvent(
        value,
        "round.cancelled",
        "system",
        "The active round was cancelled because Twitch disconnected.",
        Date.now(),
      );
    }
  });
}
export async function ingestChat(
  id: string,
  request: Request,
  body: Record<string, unknown>,
) {
  const record = await loadRecord(id),
    actor = await actorFor(record, request);
  requireDirector(actor);
  requireSoloAccess(record);
  const fence = authority(body);
  requireLease(
    record,
    fence.rendererId,
    fence.epoch,
    Date.now(),
    fence.incarnationId,
    fence.incarnationSequence,
  );
  const batched = body.envelopes !== undefined;
  const inputs = batched ? body.envelopes : [body.envelope];
  assert(
    Array.isArray(inputs) && inputs.length > 0 && inputs.length <= 20,
    400,
    "twitch_batch",
    "Send one to twenty bounded Twitch notifications per batch.",
  );
  const now = Date.now();
  const result = await getStore().update<
    ShowRecord,
    { counted: number; ignored: number; related: boolean }
  >(showKey(id), (value) => {
    requireSoloAccess(value);
    requireLease(
      value,
      fence.rendererId,
      fence.epoch,
      Date.now(),
      fence.incarnationId,
      fence.incarnationSequence,
    );
    assert(
      value.state.twitch.subscriptionId ===
        record.state.twitch.subscriptionId && value.state.twitch.connected,
      409,
      "twitch_gap",
      "The chat connection changed before these messages arrived.",
    );
    let counted = 0,
      ignored = 0;
    const parsed: NonNullable<ReturnType<typeof parseChatEvent>>[] = [];
    for (const input of inputs) {
      try {
        const item = parseChatEvent(value, id, input, now);
        if (item) parsed.push(item);
        else ignored += 1;
      } catch (error) {
        if (!batched || !ignorableChatEventError(error)) throw error;
        ignored += 1;
      }
    }
    const sorted = parsed.sort((a, b) => a.order.localeCompare(b.order));
    for (const item of sorted) {
      try {
        rate(value.rates, "chat-events", 3000, 60_000);
        const accepted = PRESENCE_EFFECTS.includes(
          item.choice as PresenceEffect,
        )
          ? presenceEffect(
              value,
              item.voter,
              item.messageId,
              item.choice as PresenceEffect,
              item.sentAt,
              Date.now(),
              false,
              item.contributor,
              item.order,
            )
          : castVote(
              value,
              item.voter,
              item.messageId,
              item.choice as AudienceChoice,
              item.sentAt,
              Date.now(),
              false,
              item.contributor,
              item.order,
            );
        if (accepted) counted += 1;
        else ignored += 1;
      } catch (error) {
        const chatRateLimited =
          error instanceof HttpError &&
          error.status === 429 &&
          error.code === "rate_limit";
        if (!batched || (!ignorableChatEventError(error) && !chatRateLimited))
          throw error;
        ignored += 1;
      }
    }
    return {
      counted,
      ignored,
      related: parsed.length > 0,
    };
  });
  return batched
    ? { counted: result.counted, ignored: result.ignored }
    : result.related
      ? { counted: result.counted > 0 }
      : { counted: false, reason: "unrelated" };
}
function ignorableChatEventError(error: unknown) {
  return (
    error instanceof HttpError &&
    [
      "twitch_event",
      "twitch_subscription",
      "twitch_channel",
      "twitch_timestamp",
      "twitch_identity",
      "twitch_message",
      "vote_window",
      "choice_inactive",
      "stage_held",
      "effect_source",
      "vote_capacity",
      "round_capacity",
    ].includes(error.code)
  );
}
function parseChatEvent(
  record: ShowRecord,
  id: string,
  unknownInput: unknown,
  now: number,
) {
  const input = unknownInput as Record<string, unknown> | undefined;
  assert(
    input && typeof input === "object",
    400,
    "twitch_event",
    "Missing Twitch event envelope.",
  );
  const metadata = input.metadata as Record<string, unknown>,
    payload = input.payload as Record<string, unknown>;
  assert(
    metadata &&
      payload &&
      metadata.message_type === "notification" &&
      metadata.subscription_type === "channel.chat.message",
    400,
    "twitch_event",
    "This envelope is not a Twitch chat notification.",
  );
  const subscription = payload.subscription as Record<string, unknown>,
    event = payload.event as Record<string, unknown>;
  assert(
    subscription &&
      event &&
      subscription.id === record.state.twitch.subscriptionId &&
      subscription.type === "channel.chat.message" &&
      subscription.version === "1",
    403,
    "twitch_subscription",
    "This event belongs to another chat subscription.",
  );
  const condition = subscription.condition as Record<string, unknown>;
  assert(
    condition?.broadcaster_user_id === record.channelId &&
      condition?.user_id === record.channelId &&
      event.broadcaster_user_id === record.channelId,
    403,
    "twitch_channel",
    "This chat event belongs to another channel.",
  );
  const timestamp = String(metadata.message_timestamp || ""),
    sentAt = Date.parse(timestamp);
  assert(
    Number.isFinite(sentAt) && sentAt <= now + 5000 && sentAt >= now - 60_000,
    400,
    "twitch_timestamp",
    "This event timestamp is stale or invalid.",
  );
  assert(
    typeof event.chatter_user_id === "string" &&
      /^\d{1,30}$/.test(event.chatter_user_id) &&
      typeof event.message_id === "string" &&
      event.message_id.length > 0 &&
      event.message_id.length <= 128 &&
      typeof metadata.message_id === "string" &&
      metadata.message_id.length > 0 &&
      metadata.message_id.length <= 128,
    400,
    "twitch_identity",
    "The Twitch event identifiers are invalid.",
  );
  const message = event.message as Record<string, unknown>;
  assert(
    typeof message?.text === "string" && message.text.length <= 500,
    400,
    "twitch_message",
    "The Twitch message is outside its allowed bounds.",
  );
  const choice = parseAudienceCommand(message.text);
  if (!choice) return null;
  return {
    choice,
    sentAt,
    order: eventOrder(timestamp, event.message_id),
    voter: privateActor(`${id}:${event.chatter_user_id}`),
    messageId: digest(`${record.channelId}:${event.message_id}`),
    contributor: safeContributor(
      event.chatter_user_name ?? event.chatter_user_login,
    ),
  };
}
