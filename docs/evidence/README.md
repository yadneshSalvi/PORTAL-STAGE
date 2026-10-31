# Verification ledger

This ledger separates implemented behavior, observed checks, and evidence still to collect. A labeled rehearsal reproduces the protocol; it does not establish remote-human performance.

**Release status: deployed; public rehearsal, production OAuth, and EventSub listening verified.** The canonical URL is [portal-stage-eight.vercel.app](https://portal-stage-eight.vercel.app). Deployment `dpl_2SJnnjbvEHn5XhCbWtwPBXruvDnv` is Ready for source commit `bf5cf4df746dff48c700e8548516b0cfdc2dbc66`. A dedicated LiveKit Cloud project has recording disabled and configured credentials; server RoomService authentication passed. Browser cloud media and actual PORTAL ballots remain pending. See the [release record and artifact hashes](release.md).

The latest full automated run passed **183 tests** across 20 files, with three opt-in database tests skipped. That run includes the final no-hand status and camera request pending/cancellation regressions; whole-tree typecheck also passed. The **three actual Neon integration tests passed in a separate configured run**. Formatting passed; the optimized build generated 16 pages. See the [check record](checks.md) for exact conditions.

| Claim                                       | Current evidence                                                                                                                                                                    | Limit                                                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Persistent umbrella and committed ownership | Tests exercise 100 transfers, repeated acceptance, stale versions/epochs, expiry, recall, and dropout; the [browser run](browser/2026-10-31-local.md) follows a complete round trip | Browser story used labeled synthetic plates                                                                            |
| Saved authored variation                    | Browser saved, reloaded, and reset Moonlit Mischief with changed creature/weather/ending settings                                                                                   | A second complete performed variation remains to record                                                                |
| Durable, fenced controls                    | Cross-process tests and actual Neon checks for concurrent lease/state writes, owner/client/epoch/expiry fencing, and rate/no-op behavior                                            | Production verification is tracked separately                                                                          |
| Twitch integration                          | Actual read-chat OAuth and healthy EventSub listening in local and production browser checks                                                                                        | PORTAL public command-to-ballot verification remains pending                                                           |
| Two private media sessions                  | A six-minute optimized local walkthrough completed both handoffs, shelter, emergency hold, reconnect, explicit re-admission/resume, and end; real SFU rooms/Program inspected       | Synthetic video on one machine; the original preview workaround and later successful decoder regression are documented |
| First-use local video                       | Fresh optimized browser: A+B visible on first curtain; advancing canonical frames without preview; preview open/close and guest reconnect preserve playback                         | Synthetic sources; physical cameras and cloud transport still need verification                                        |
| Gesture controls                            | Local landmark runtime, calibrated cue state machine, loss safeguards, and button/keyboard equivalents have tests; successful synthetic frames return no eligible hand              | Physical alignment, real hands, and latency are unmeasured                                                             |
| Consent and isolation                       | Restricted grants, separate rooms, synthetic emergency/reconnect walkthrough, and audio/privacy lifecycle tests                                                                     | Physical camera/microphone withdrawal, audible echo, and OBS still need their own checks                               |
| Visual usability                            | Browser checked desktop and 390px layouts with no horizontal overflow                                                                                                               | Not an independent accessibility certification                                                                         |

Read [automated and database checks](checks.md) and [browser evidence](browser/2026-10-31-local.md) for observed steps, screenshots, and the real exported trace. The [Codex record](codex.md) identifies the main build conversation and concrete implementation work.

## Reproduce the checks

```sh
npm run typecheck
npm test
npm run build
```

Run the build with development servers stopped or in an isolated copy/cache. `tests/postgres-lease.test.ts` is skipped unless `PORTAL_TEST_DATABASE_URL` is supplied. It creates random fixture rows and deletes only those rows afterward; prefer a dedicated test database. Ordinary tests require no provider credentials.

The signed-out production walkthrough completed the test ballot, rain, both crossings, hatch, and shared shelter in show `ps_626f0fa0ece57a9b`. Its umbrella returned to A at version 6 and 52% wetness. The [release manifest](release-manifest.json) records this observation and the checks still pending.

## Remaining performance evidence

Capture an uncut session with two consenting performers on separate devices/networks, genuine Twitch choice input, accepted crossing, hatching/following, return transfer, and interruption/recovery. Measure input-to-director, local composition, and delivered stream delay separately. Verify audio without feedback, recording permissions, and the actual OBS Browser Source or documented Window Capture fallback.

Use the [175-second recording plan](../demo.md) only after those captures exist. Keep original takes, private consent receipts, and secrets outside Git. Synthetic plates, two local tabs, edited timing, and a reconnect title card do not establish those missing claims.
