# Actual LiveKit Cloud control and token replay checks

These independent provider probes ran on 31 October 2026 UTC using the configured Cloud project. They do not establish that the application’s durable expiry workflow ran. That requires its own deployed acceptance.

## Conditions

- Official `livekit-server-sdk` 2.19.2 and `@livekit/rtc-node` 1.2.1.
- Random, disposable QA room names. Only those rooms were modified and cleaned up.
- One synthetic receive-only participant. No camera, microphone, published media, recording, real viewer or Twitch broadcast.
- JWTs stayed in process memory. Credentials, raw logs and tokens are not included in this evidence.

## Observed results

1. An explicit `revokeTokenTs` cutoff succeeded for an absent identity in an existing empty room and after the room had been deleted.
2. Deleting an already absent room returned `not_found`/404. The application treats this idempotent cleanup result as expected.
3. Joining with a signed `RoomConfiguration` worked. The SDK reported empty timeout 60 seconds, departure timeout 30 seconds and recording false.
4. Explicit revocation followed by room deletion disconnected the synthetic participant.
5. Replaying its still-unexpired JWT was rejected with an authentication error. A second JWT issued for an identity that never joined was also rejected.
6. Listing the exact QA room afterward returned zero rooms; a stale JWT did not recreate it.

The replay attempts returned in 328 ms and 315 ms in this one run. These are individual SDK request observations, not media latency or a performance guarantee. The deployed application’s timer remains a separate acceptance scenario.

Provider behavior matches the [LiveKit RoomService documentation](https://docs.livekit.io/reference/other/roomservice-api/#removeparticipant). Raw sanitized observations: [control API](cloud-revoke-probe.json), [token replay](cloud-token-replay-probe.json).

## Actual SDK-refreshed token

A separate receive-only Cloud probe observed the official SDK’s `TokenRefreshed` event immediately after connection. The cached token changed; its decoded expiry was later than the original token’s expiry. After explicit cutoff revocation and room deletion, replaying this actual refreshed JWT was rejected with an authentication error. Listing the exact room returned zero. No raw JWT was saved in this evidence. This validates refreshed-token revocation for the observed Cloud event; it is not a long-running media-performance test. [Sanitized refresh observations](cloud-refresh-replay-probe.json).
