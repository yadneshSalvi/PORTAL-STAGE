# Round-three release — 1 November 2026

The review’s functional fixes and UI pass are live at [portal-stage-eight.vercel.app](https://portal-stage-eight.vercel.app). Anonymous session loads no longer invoke solo cleanup; authenticated solo starts retain recovery. Rate-limited chat has its own count and a compact Commands dropped warning. Narrow-panel controls wrap safely. The Studio, scenes, picker and public pages use simpler copy and consistent typography while preserving consent and rehearsal/test labels.

| Identity                             | Value                                                              |
| ------------------------------------ | ------------------------------------------------------------------ |
| Deployed runtime/source              | `fece42381d569bd70b9ce81055c71b664000e9a1`                         |
| Vercel deployment                    | `dpl_91FUymt469TFNoo3iRnHSu3S41R9` — Ready                         |
| Local optimized build                | `f1DrX0vL5US-p6LTr5BWa`                                            |
| Project Codex implementation session | `01a191d6-551a-7cd2-9cd8-30611a7ee60b`                             |
| Coordinating conversation            | `01a190da-3cee-7a10-b7c1-e0cdbb379510`                             |
| Source access                        | Public GitHub repository, MIT license                              |
| Production solo limits               | 100 globally per UTC day; 10 concurrent; 3 per account; 20 minutes |

Later documentation/evidence commits do not change this deployed runtime. [Deployment](review-round3-2026-11-01/deployment.json) · [Structured manifest](release-manifest.json) · [Implementation](round-3-implementation.md).

## Verified

- **455 ordinary tests passed**, seven opt-in database tests skipped in that run. Typecheck, formatting, diff check and optimized build passed; 18 static pages were generated and `next-env.d.ts` did not drift. [Gates](review-round3-2026-11-01/gates.json).
- **Seven actual Neon checks passed separately**, zero skipped, with all twelve recorded backend/test hashes matching the final deployed source. Random labeled fixture rows were cleaned up. [Database record](review-round3-2026-11-01/neon-checks.json).
- Both stories completed against the optimized local UI checkpoint, then again on the final signed-out production build. Production Weather used gentle/Moth/shy/chase; the umbrella returned with its coral patch and 29% displayed wetness. Parcel used garden/keep, returning the same tag and 48% handling marks with the gift in room A. Both ended cleanly. [Local report](review-round3-2026-11-01/local-browser.md) · [Production report and exports](review-round3-2026-11-01/production-browser.md).
- Twenty production states were checked at 1280, 1440, 1920 and 390 px: **80 observations, zero overflow, at most three visible DOM text sizes per state**. Sixteen deployed before/after pairs and six additional final/mobile captures were visually inspected and hashed. The canonical room names appear once; renderer regressions cover the composition of both artwork layers. [UI evidence](ui-pass-2026-11-01/README.md).
- The final browser flow inspected camera consent without enabling media, Scene preview, Inspect, Customize and End dialogs. Studio and Program warning/error logs were empty. An existing ended solo show verified the longer camera control without opening a new media session.

## Evidence boundaries

This round used illustrated rehearsals with labeled test ballots and no fresh Twitch messages, camera/microphone sessions, broadcasts or model requests. The prior [round-two release](round-2-release.md) and [manifest](round-2-release-manifest.json) retain the real two-account solo run, physical camera and successful manual early End. That result is not automatic timed-expiry evidence. The anonymous P0 picker resource observation was 251 ms for `/api/session`; it is one observation, not a latency guarantee.

The optional human checks remain open: two consenting performers on separate networks with microphones and actual OBS broadcast, guest replacement while OBS continues, genuine hidden/minimized director behavior, and physical hand-cue accuracy. Isolated visual presence-effect checks and current-release real timed expiry/provider-outage acceptance also remain distinct. Automated coverage and historical prior-release expiry do not establish those field results.
