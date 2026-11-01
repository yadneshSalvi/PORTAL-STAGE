# Review implementation checkpoint — 1 November 2026

This record covers the review implementation after baseline `2994fc6`, now released from `96fea878`. Root completed the frozen-build and production checks described in [production verification](review-2026-11-01/production-verification.md), including both authored stories, physical local camera initialization, actual host-account Twitch solo handoffs, and the deployed 20-minute expiry. No remote-human, gesture-accuracy, OBS, or independent audience-engagement result is inferred from these observations.

## Implemented boundaries

- **S1–S4/S12:** stable per-show renderer identity, exact page-incarnation fencing, safe pagehide release, independent guest/output generations, ended exits, persistent visibility warning, requested reduced hidden cadence, and landing provenance-label separation. P0 checkpoints are `2de2871` and `8406045`. Root's [review observations](review-2026-11-01/) own actual reload, replacement, output, copied-tab and layout evidence.
- **S5/S13:** separate weather, name, mood and ending windows, explicit tie/empty resolution, on-stage bars, sanitized display-name credits, bounded presence effects, ordered twenty-event batches, one transient retry with unchanged identities, and a three-second delivery grace for timestamps inside the voting window. Only recognized command fields are relayed; badges/fragments/unrelated chat are dropped. Durable acceptance count keeps cue progress independent of the fifty-event public history window.
- Delayed round intents are bound at click/queue time to the displayed round (or previous round for opening). The exact old-resolution/old-apply replay against a replacement solo offer is rejected. A legacy snapshot whose prop inception has already fallen out of its full retained history reports unknown progress and manual recovery, rather than inventing zero crossings.
- **S6/S14:** ordinary authenticated Twitch hosts can reserve a capped solo session. The software Audience Room is not a second human or a consented camera. Only the server may act for B, from a current resolved choice bound to epoch, prop version, and transfer. An ineligible OAuth result is discarded before grant storage.
- **S7:** native browser camera capture in ordinary rehearsal, local framing/hand cues, no LiveKit connection or microphone request, explicit consent and cancellation, and late-grant/end/leave fencing. Local anchors are presentation-only; deliberate Offer/Accept still use the durable API.
- **S9:** Midnight Parcel has eight authored stages, its own sorting-office art and tagged/stamped/damaged prop, stars/garden contents, receiving-room transformation, return, and a choice about where the gift remains. It reuses ownership semantics, not the weather/creature story.
- **S10/S11/S15/S16:** How built source/test links, clearer verification limits, a short judge path, and focused behavioral tests. The existing large controller/state-machine files remain known maintenance limits; this change does not attempt a broad refactor.

## Solo reservation and closure

The default durable limits are three starts/account/UTC day, thirty starts globally/day, five concurrent reservations, and twenty minutes per reservation. The reservation's expiry and generation are immutable. A confirmed Workflow run receipt and active quota reservation are required before any media JWT is returned. A failed or uncertain scheduling outcome cannot mint media and retains its daily/account charge. After sixty seconds, only an unconfirmed reservation with no issued identities and no recorded run can be reclaimed; quota is fenced first so a late receipt cannot revive it.

Every solo identity is recorded before token return, with a bounded issuance ledger. Signed initial grants last at most 120 seconds and never beyond the reservation deadline. Solo uses signed `RoomConfiguration`; the grant API does not perform a late room-creation RPC that could race after closure. API and client eligibility stop at expiry. The durable Workflow sleeps until that deadline, then fences issuance, revokes all issued identities including absent ones, deletes both rooms, and repeats revocation with a fresh cutoff to cover connected-client refreshes. It retries incomplete provider cleanup after thirty seconds and retains concurrent capacity until cleanup succeeds. A stale reservation/generation cannot close a later session. End is repeatable by the director to retry early cleanup.

This is not a hard real-time disconnect guarantee. A scheduler, database, network, or provider outage can delay physical removal. Browser countdowns explain the reservation; they are not its authority. Root separately owns actual deployed timer and cached-token replay observations. Local self-hosted media cannot prove LiveKit Cloud revocation behavior.

## Gates and dependencies

The final release is `96fea8781dd86bf23a95126247b1e703b8babde9`, with runtime source from `16b1100`. It passed 370 tests, seven opt-in skips, whole-tree typecheck, formatting, diff checks, and an 18-page optimized build. The seven separately passing actual-Neon tests retain identical recorded source hashes. The final additions correct opaque Twitch notification IDs, reflect the current browser's connector status, and distinguish initial JWT lifetime from session expiry. [Exact final gates](review-2026-11-01/feature-gates.json).

The integrated runtime is committed at **`b8e06733bd5ffc5230c0005543e20f9b9dc2737b`**. Its coherent source checkpoints are `dbb84cf` (local-camera lifecycle), `387dd37` (bound audience choices, capped solo reservation/closure and choice controls), and `b8e0673` (authored episodes, media/UI and local hand cues).

| Gate                   | Observed result at that runtime boundary                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm test`             | 359 passed; 7 opt-in PostgreSQL tests skipped. 35 test files passed; 2 skipped. Vitest reported 1.60 seconds.        |
| `npm run typecheck`    | Passed                                                                                                               |
| `npm run format:check` | All matched files passed                                                                                             |
| `git diff --check`     | Passed                                                                                                               |
| `npm run build`        | Passed; 18 pages generated; Workflow compilation reported 18 steps and 1 workflow. Build ID `W6_oT5b8feu2ZKjBJE2Sb`. |

Root separately reported **seven passing actual Neon tests**, with zero failures/skips and identical captured backend hashes before/after its final run. Its sanitized observations belong to [review evidence](review-2026-11-01/). Ordinary tests use synthetic fixtures and SDK mocks. The PostgreSQL tests require `PORTAL_TEST_DATABASE_URL` and clean their random fixture rows. Added cases cover global/account reservation races and a labeled hundred-event batch with redelivery. Query duration is not end-to-end media latency.

Workflow is pinned to 5.2.3. Compatible overrides patch the installed Zod and Undici advisories and the newer named-API minimatch consumers. The remaining dependency audit finding is the moderate minimatch advisory in Workflow CLI's legacy `@oclif/core → ejs → jake → filelist → minimatch` chain. This app does not invoke that CLI or pass audience input to its glob parser. A major incompatible override of filelist's callable minimatch API was not applied. This is a scoped outstanding dependency finding, not a clean audit claim.

## Acceptance boundaries after release

Both complete authored episodes, explicit empty-ballot attribution, physical Chrome camera initialization/end cleanup, actual host-account solo issuance, and actual deployed expiry with refreshed-token rejection are now recorded. The expiry browser remained open; it is not an isolated browser-absent observation. Solo Parcel's initial early closure was incomplete and succeeded after one visible Retry; its cause was not identified.

Fresh production OAuth as `yadneshsalvi96` also passed ordinary-account solo creation, Twitch subscription setup, and early End: 3 of 3 starts became 2 of 3, one daily start remained charged, and active quota released with zero media grants. The configured local host allowlist excluded the account; production corroborated this through **Invited duet host sign-in**, not a captured `/api/session` response. The existing application browser session switched Twitch identity. No camera, microphone, public message or live scene was used. [Second-account evidence](review-2026-11-01/second-account-acceptance.md).

Worker-inclusive traffic capture, physical hand accuracy, and genuine second-account Twitch choices/effects remain separate checks. A second account controlled by the same user is not a second remote performer.

S8 still requires two consenting humans on separate networks, microphones/echo checks, and an authorized actual OBS broadcast. Preserve that gap explicitly. No private footage, consent receipts, raw tokens, or fabricated observations belong in tracked evidence.

## Earlier checkpoints retained for provenance

Baseline was clean `main` at `2994fc6`, before creating `review/portal-improvements`. Typecheck, format and the 16-page optimized build passed. Vitest reported 184 passed, 3 opt-in PostgreSQL tests skipped; 20 files passed, 1 skipped; 1.54 seconds. No development server shared that build cache.

The reliability checkpoint before later audience/solo changes passed 220 tests, with 4 opt-in PostgreSQL tests skipped; 24 files passed, 1 skipped; 1.64 seconds. Typecheck, format, diff and a 16-page optimized build passed. The source checkpoints were `2de2871` and the explicit-local-transport Program-pairing follow-up `8406045`. Root subsequently recorded actual reload/offer preservation, ended exits, independent guest/output replacement, copied-tab fencing, and four actual PostgreSQL cases under their own frozen source boundaries.

The hidden-page fallback requests eight frames per second when the browser allows it. Browser or operating-system suspension can still pause the compositor. Native background-tab observations do not establish hidden-document throttling or OBS capture unless those conditions were actually verified.
