# Verification ledger

This ledger separates implemented behavior, observed checks, and evidence still to collect. A labeled rehearsal reproduces the protocol; it does not establish remote-human performance.

**Current round-three release:** runtime `fece423`, **455 ordinary tests plus seven separately passing actual-Neon checks**. Both stories completed locally and on the signed-out final production build. All 80 production layout observations across 20 states and four widths returned no overflow; visible DOM text uses at most three sizes per state. Deployed before/after screenshots were visually inspected and hashed.

[Current release identity](release.md) · [Structured manifest](release-manifest.json) · [Round-three implementation](round-3-implementation.md) · [Local browser checks](review-round3-2026-11-01/local-browser.md) · [Production checks](review-round3-2026-11-01/production-browser.md) · [UI comparison](ui-pass-2026-11-01/README.md).

This round used illustrated rehearsals and labeled test ballots. It did not repeat the historical real-camera/Twitch acceptance. The repository remains public under MIT; production solo limits remain 100 daily and 10 concurrent globally, three per account and twenty minutes per session. Actual OBS broadcast, separate-network humans/audio, physical gesture accuracy and genuine minimized-window behavior remain unverified.

## Historical round-two release

Source `3c2b310`, runtime `36d3182`, passed 435 ordinary tests and seven actual-Neon checks. Both stories completed locally and in signed-out production Chrome. A private solo show used a physical camera, LiveKit Cloud and two owned Twitch accounts: all six choices counted, both accepted crossings completed, and **manual early End** closed the media rooms and released capacity without manual retry. One operator with two accounts is not evidence of two independent performers or audience engagement. [Historical release](round-2-release.md) · [Historical manifest](round-2-release-manifest.json).

## Historical round-one release

Source `96fea878` passed 370 ordinary tests and seven separately configured Neon checks. Its [release](round-1-release.md), [manifest](round-1-release-manifest.json), and [production observations](review-2026-11-01/production-verification.md) remain historical evidence. The early-End retry observed then is superseded by the first-attempt round-two production result.

## Earlier deployed release

**Release status: deployed; public rehearsal, physical-camera Cloud story, real Twitch ballot replacement, emergency recovery, and shutdown verified.** The canonical URL is [portal-stage-eight.vercel.app](https://portal-stage-eight.vercel.app). Deployment `dpl_44zp8zqCqQFPLgxxP4Gofn8NdP6z` is Ready for source commit `a9fd9242ef69a9b6b5052168c9564e4d5e5e63be`. A dedicated LiveKit Cloud project has recording disabled and configured credentials; server RoomService authentication passed. The cloud run used two independent sessions sharing one physical camera/computer/network, with microphones disabled; separate remote-human performance remains to be verified. See the [historical release record](pre-review-release.md) and [historical artifact hashes](pre-review-release-manifest.json).

That earlier full automated run passed **184 tests** across 20 files, with three opt-in database tests skipped. That run includes the final no-hand status, camera request pending/cancellation, and late-grant-after-end regressions; whole-tree typecheck also passed. The **three actual Neon integration tests passed in a separate configured run**. Formatting passed; the optimized build generated 16 pages. See the [check record](checks.md) for exact conditions.

| Claim                                       | Historical evidence                                                                                                                                                                                         | Limit                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Persistent umbrella and committed ownership | Tests exercise 100 transfers and failure cases; the physical-camera Cloud story completed both actual receiver acceptances, shelter, and recovery with the same coral patch, 52% wetness, owner A/version 6 | One computer/network, not two remote humans                                          |
| Saved authored variation                    | Browser saved, reloaded, and reset Moonlit Mischief with changed creature/weather/ending settings                                                                                                           | A second complete performed variation remains to record                              |
| Durable, fenced controls                    | Cross-process and actual Neon checks cover concurrent lease/state writes, owner/client/epoch/expiry fencing, and rate/no-op behavior; cloud recovery preserved committed state                              | No measured load/latency claim                                                       |
| Twitch integration                          | Production OAuth/EventSub and actual `!gentle` then `!wild` commands produced one replaceable vote and audience-source wild weather                                                                         | One authorized host account; no independent engagement claim                         |
| Two private media sessions                  | Physical 1280×720 cameras traversed LiveKit Cloud in independent sessions; 1920×1080 Program/return advanced; raw cameras stayed backstage and Program viewer was receive-only                              | Shared physical device/computer/network; microphones disabled                        |
| First-use local video                       | Fresh optimized browser showed both synthetic cameras on first curtain; preview open/close and guest reconnect preserved playback                                                                           | Physical cloud guest used a development origin, not a second deployed browser/device |
| Gesture controls                            | Landmark runtime, calibrated cue state machine, loss safeguards, and button/keyboard equivalents have tests; synthetic frames returned no eligible hand                                                     | Physical alignment, real hands, and latency are unmeasured                           |
| Consent and isolation                       | Cloud curtain, camera withdrawal, fresh readiness/admission, resume, end, zero remaining rooms/media elements; restricted grants and audio/privacy tests                                                    | Voice/echo/OBS still require checks; private consent receipts excluded from Git      |
| Visual usability                            | Browser checked desktop and 390px layouts with no horizontal overflow                                                                                                                                       | Not an independent accessibility certification                                       |

Read [automated and database checks](checks.md) and [browser evidence](browser/2026-10-31-local.md) for observed steps, screenshots, and the real exported trace. The [Codex record](codex.md) identifies the main build conversation and concrete implementation work.

## Reproduce the checks

```sh
npm run typecheck
npm test
npm run build
```

Run the build with development servers stopped or in an isolated copy/cache. `tests/postgres-lease.test.ts` is skipped unless `PORTAL_TEST_DATABASE_URL` is supplied. It creates random fixture rows and deletes only those rows afterward; prefer a dedicated test database. Ordinary tests require no provider credentials.

The signed-out production walkthrough on initial source `bf5cf4d` completed the test ballot, rain, both crossings, hatch, and shared shelter in show `ps_626f0fa0ece57a9b`. Its umbrella returned to A at version 6 and 52% wetness. The preceding camera-feedback deployment (`12df783`) completed live show `ps_fb3398cc6bde0434` with actual Twitch votes, physical-camera Cloud transport, receiver-owned handoffs, shelter, emergency camera recovery, and end at sequence 42; no cloud rooms remained afterward. Final source `a9fd924` then passed a landing reload and ended-Program check with zero video elements; its added pending-grant cancellation is covered by the full suite. The [historical release manifest](pre-review-release-manifest.json) records those original verification scopes. The [current manifest](release-manifest.json) describes the current round-three deployment.

## Remaining performance evidence

Capture an uncut session with two consenting performers on separate devices/networks, genuine Twitch choice input, accepted crossing, hatching/following, return transfer, and interruption/recovery. Measure input-to-director, local composition, and delivered stream delay separately. Verify audio without feedback, recording permissions, and the actual OBS Browser Source or documented Window Capture fallback.

Use the [175-second recording plan](../demo.md) only after those captures exist. Keep original takes, private consent receipts, and secrets outside Git. Synthetic plates, two local tabs, edited timing, and a reconnect title card do not establish those missing claims.
