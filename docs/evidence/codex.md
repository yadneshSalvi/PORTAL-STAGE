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

The subsequent improvement review used the user-requested GPT-6 Astra lead and two GPT-6.1 Sol workers with disjoint media and theater ownership. P0 commits `2de2871` and `8406045` address exact-page renderer recovery and independent Program pairing. The [review checkpoint](review-implementation.md) records the next integrated source boundary. Concrete review contributions include:

- [Typed choice grammar](../../src/lib/show-grammar.ts) and [server audience tests](../../tests/audience-authorship.test.ts): explicit empty/tied outcomes, timestamp-ordered replacement, a server-only solo audience actor, and distinct parcel consequences.
- [Bounded batch relay](../../src/lib/twitch-batch.ts) and [failure/redelivery tests](../../tests/twitch-batch.test.ts): same-identity retry after an uncertain response, one flight, cancellation, and visible intake failure.
- [Local camera lifecycle](../../src/media/local-rehearsal-camera.ts) and [late-grant tests](../../tests/media-local-rehearsal-camera.test.ts): no room/token path, video-only capture, explicit cancellation, and stop on End/departure.
- [Solo reservation](../../src/server/solo-policy.ts), [durable expiry workflow](../../src/workflows/solo-expiry.ts), and [fault-injection tests](../../tests/solo-reservations.test.ts): quota/receipt ordering, unissued-orphan recovery, issuance-versus-closure fencing, explicit cached-token revocation, and retry without extending a reservation.
- [Authored cue regression](../../src/components/cue-flow.test.ts): both complete episodes through actual server actions, plus durable progress after chat evicts acceptance from the public event tail.

The root independently owns browser observations, actual Neon tests, Cloud revocation probes, and deployment. Those results are recorded under [review evidence](review-2026-11-01/) with their own conditions; test doubles and authored artwork do not stand in for viewers or performers.

Shared infrastructure is disclosed: the atomic document-store and Twitch grant-maintenance baseline were adapted from this user's LIVEFORGE project. PORTAL STAGE has separate storage names, authorization configuration, UI, original assets, media architecture, show protocol, and demo story. It does not reuse LIVEFORGE's generated games or present shared scaffolding as the novel mechanism.

For a submission excerpt, capture the real main conversation, one relevant diff, and its actual passing check. Keep the surrounding source/trace available. This document is an index to genuine work, not a substitute conversation or a claim that a planning-only session built the app.
