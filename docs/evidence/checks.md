# Implementation checks — 31 October 2026

These are observed tool results, not a performance recording.

| Check                                | Observed result                                                                                | Conditions                                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `npm test -- --reporter=dot`         | 176 tests passed; 3 opt-in database tests skipped. 20 test files passed; 1 skipped.            | Local source after canonical decoder stream-reset recovery and diagnostics; Vitest 5.0.5; 8.59 seconds reported by the runner |
| `npm run typecheck`                  | Exit 0                                                                                         | Whole application, routes, media/vision modules, and tests                                                                    |
| `npm run format:check`               | All matched files passed                                                                       | Raw browser-export JSON and vendor assets remain byte-preserved                                                               |
| Actual Postgres lease integration    | 3 tests passed; 1 file passed                                                                  | Explicit private Neon test configuration; random fixture rows created and deleted; 11.99 seconds reported by the runner       |
| Optimized production build           | Passed; 16 pages generated                                                                     | Main Codex conversation built after stopping both development servers                                                         |
| Local configuration setup            | Private keys generated; second run preserved values; file mode 0600                            | Main Codex conversation tested an isolated copy; actual configuration was untouched                                           |
| First-use decoder browser regression | A+B visible on first curtain; preview open/close and guest reconnect preserve advancing frames | Optimized local servers, separate browser origins, explicitly synthetic video; see the browser record                         |
| Final no-hand status regression      | 35 targeted vision tests passed; whole-tree typecheck and touched formatting passed            | After the full run above; no model, inference threshold, or cue-gate changes                                                  |

The Postgres checks verify that atomic lease renewal and a concurrent state mutation both survive, that wrong owner/client/epoch and expired/ended authority cannot renew, and that persisted rate caps and no-op writes behave correctly. They do not establish reliable end-to-end media under arbitrary host or network load.

The ordinary suite covers server ownership and consent roles, 100 transfers, duplicate/stale actions, invite replacement/redemption races, single-current-ballot behavior, malformed Twitch input, expiry/recovery, cross-process file persistence, bounded presence scheduling, private data-message authentication, Program audio gating, late permission cancellation, local-only production test guards, camera crop/mirror math, rotated grip position, gesture intent gates, and vendor asset integrity.

An installed-LiveKit regression reproduces asynchronous local-stream replacement with a simulated media element and verifies bounded playback recovery, explicit policy unlock, and disabled-camera fencing. It does not substitute for the rebuilt browser regression.

See [browser evidence](browser/2026-10-31-local.md) for actual UI observations. The optimized browser walkthrough and production deployment are separate release gates; the browser record preserves first-use workarounds and their regression status. Type checks, mocked media tests, and exact geometry do not prove physical camera behavior, real hand accuracy, or remote-human performance.
