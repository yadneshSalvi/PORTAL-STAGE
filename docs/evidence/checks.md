# Implementation checks — review release

Source `96fea8781dd86bf23a95126247b1e703b8babde9` passed **370 tests**, with seven opt-in tests skipped (35 files passed, two skipped), whole-tree typecheck, formatting, diff check, and the optimized 18-page build. Build ID: `jKHgKbotO8fc4sJHSBn3c`. The integration lead ran these gates before freezing source. Vercel separately passed the optimized build and deployed `dpl_mUKo1r1j3ojraoWWmKWgToPeGCp5`.

Root separately ran all **seven actual-Neon integration tests** successfully. Their six recorded server/test files remain byte-identical in the final source. A labeled synthetic HTTP test accepted 100 unique ballots in five batches, verified replacement, deduplication, grace, and stale-round rejection. It is one test observation, not a Twitch performance claim. [Exact checkpoints and hashes](review-2026-11-01/feature-gates.json) and [HTTP result](review-2026-11-01/feature-http-burst.json).

Actual production Twitch commands found and verified the fix for opaque notification IDs. Camera and media observations, including a real ping-timeout recovery, are in [production verification](review-2026-11-01/production-verification.md). These checks do not establish remote-human microphones, gesture accuracy, or OBS broadcast reliability.

## Earlier release — 31 October 2026

These are observed tool results, not a performance recording.

| Check                                | Observed result                                                                                | Conditions                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm test -- --reporter=dot`         | 184 tests passed; 3 opt-in database tests skipped. 20 test files passed; 1 skipped.            | Final source a9fd924 after pending-camera-on-end guard; Vitest 5.0.5; 1.69 seconds reported by the runner               |
| `npm run typecheck`                  | Exit 0                                                                                         | Whole application, routes, media/vision modules, and tests                                                              |
| `npm run format:check`               | All matched files passed                                                                       | Captured JSON and vendor assets excluded from formatting; private-consent redactions documented                         |
| Actual Postgres lease integration    | 3 tests passed; 1 file passed                                                                  | Explicit private Neon test configuration; random fixture rows created and deleted; 11.99 seconds reported by the runner |
| Optimized production build           | Passed; 16 pages generated                                                                     | Main Codex conversation built after stopping both development servers                                                   |
| Local configuration setup            | Private keys generated; second run preserved values; file mode 0600                            | Main Codex conversation tested an isolated copy; actual configuration was untouched                                     |
| First-use decoder browser regression | A+B visible on first curtain; preview open/close and guest reconnect preserve advancing frames | Optimized local servers, separate browser origins, explicitly synthetic video; see the browser record                   |
| Final no-hand status regression      | 35 targeted vision tests passed; whole-tree typecheck and touched formatting passed            | Before the latest full run; no model, inference threshold, or cue-gate changes                                          |

The Postgres checks verify that atomic lease renewal and a concurrent state mutation both survive, that wrong owner/client/epoch and expired/ended authority cannot renew, and that persisted rate caps and no-op writes behave correctly. They do not establish reliable end-to-end media under arbitrary host or network load.

The ordinary suite covers server ownership and consent roles, 100 transfers, duplicate/stale actions, invite replacement/redemption races, single-current-ballot behavior, malformed Twitch input, expiry/recovery, cross-process file persistence, bounded presence scheduling, private data-message authentication, Program audio gating, late permission cancellation including an unjoined show ending before a camera grant, local-only production test guards, camera crop/mirror math, rotated grip position, gesture intent gates, and vendor asset integrity.

An installed-LiveKit regression reproduces asynchronous local-stream replacement with a simulated media element and verifies bounded playback recovery, explicit policy unlock, and disabled-camera fencing. It does not substitute for the rebuilt browser regression.

See [browser evidence](browser/2026-10-31-local.md) for actual UI observations. The optimized browser walkthrough and production deployment are separate release gates; the browser record preserves first-use workarounds and their regression status. Type checks, mocked media tests, and exact geometry do not prove physical camera behavior, real hand accuracy, or remote-human performance.

The final pending-camera-on-end patch passed 42 focused lifecycle tests before the full run. Its regression verifies immediate pending-state cancellation and that a late granted track stops without attachment, a media token request, a room, or a resurrected preview. The actual Cloud story was observed on preceding runtime source `12df783`; the final production `a9fd924` deployment separately passed landing reload and ended-Program/zero-video checks.
