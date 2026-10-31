# Codex development record

Main user-facing development conversation: **01a190da-3cee-7a10-b7c1-e0cdbb379510**.

Implementation lead thread: **01a191d6-551a-7cd2-9cd8-30611a7ee60b**. Media/vision worker thread: **01a191d8-9625-7591-b3e8-fe8d59aa141f**. Stage/UI worker thread: **01a191d8-4e49-75f0-8195-0f1ba662d149**. The main conversation owns provisioning, browser validation, deployment, and user approvals; the implementation lead owns integration, server protocol, authorization, tests, and operating evidence. Workers implement the stage/UI and media/gesture modules under that review. These are actual environment-reported thread IDs, not fabricated transcripts.

Concrete development contributions in this build:

- Authored a persistent offer/accept protocol that commits one new owner before presentation. Tests exercise 100 complete transfers, duplicated acceptance, stale owner/version/epoch, expiry, decline, and dropout before/after commit.
- Found that early-return anchor/presence commands bypassed idempotency eviction. Centralized bounded recording, preserved ordering across JSONB, and verified more than 2,200 quiet commands without flooding semantic events.
- Added a state revision independent of the event sequence after review found that delayed quiet snapshots could overwrite newer liveness/lease state.
- Browser QA exposed an idle media hook marking a synthetic plate disconnected. Explicit fixture/LiveKit transport state now separates solo readiness from actual-media admission, including recovery without resetting the umbrella or creature.
- Review identified a visual timing flaw: polling could consume most of a crossing measured from server commit time. The canonical renderer now uses its local presentation start only after observing an authoritative acceptance; durable ownership remains committed first.
- Implemented separate private/public media rooms, on-air audio gates, local emergency picture/audio gating, immutable slot metadata, and reconnection with stopped devices. Unit and SDK-mocked lifecycle tests cover the boundaries; browser media proof is recorded separately.
- Diagnosed a first-picture failure after browser QA found local cameras black while remote video played. An installed-LiveKit regression reproduced its asynchronous constructor stream reset after the initial play request. Bounded decoder replay and independently owned previews passed the subsequent actual-browser first-use, preview open/close, and reconnect checks.

No runtime LLM controls the performance. Codex assisted development of the application, tests, documentation, original geometry, and interaction design. Human decisions and browser review remain part of the main conversation.

Shared infrastructure is disclosed: the atomic document-store and Twitch grant-maintenance baseline were adapted from this user's LIVEFORGE project. PORTAL STAGE has separate storage names, authorization configuration, UI, original assets, media architecture, show protocol, and demo story. It does not reuse LIVEFORGE's generated games or present shared scaffolding as the novel mechanism.

For a submission excerpt, capture the real main conversation, one relevant diff, and its actual passing check. Keep the surrounding source/trace available. This document is an index to genuine work, not a substitute conversation or a claim that a planning-only session built the app.
