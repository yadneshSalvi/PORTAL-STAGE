# Round-two release — 1 November 2026

The review fixes are live at [portal-stage-eight.vercel.app](https://portal-stage-eight.vercel.app). Busy effects no longer exhaust voting capacity, malformed messages do not discard valid batch neighbors, and solo media cleanup can recover after an interrupted workflow. Failed starts before media access return their daily allowance. The camera control and final progress label fit the tested layouts.

| Identity                             | Value                                                              |
| ------------------------------------ | ------------------------------------------------------------------ |
| Deployed source                      | `3c2b310198b4b3cf405d333f3c356837aeb39041`                         |
| Latest runtime change                | `36d31829b5f3b2e368ec96b6c54ab548884b776f`                         |
| Vercel deployment                    | `dpl_8oGMFeUjC8J4rtAtpRopgUUGasv2` — Ready                         |
| Local optimized build                | `-iU6lkbQ7bzzuyamjWIuN`                                            |
| Project Codex implementation session | `01a191d6-551a-7cd2-9cd8-30611a7ee60b`                             |
| Coordinating conversation            | `01a190da-3cee-7a10-b7c1-e0cdbb379510`                             |
| Source access                        | Public GitHub repository, MIT license                              |
| Production solo limits               | 100 globally per UTC day; 10 concurrent; 3 per account; 20 minutes |

Subsequent documentation and evidence commits do not change the application. [Deployment metadata](review-round2-2026-11-01/deployment.json), [structured manifest](release-manifest.json), and [implementation details](round-2-implementation.md) preserve the boundaries. The preceding [round-one release](round-1-release.md) and [manifest](round-1-release-manifest.json) remain available separately.

## Verified on this release

- **435 ordinary tests passed**, seven opt-in database cases skipped in that run. Whole-tree typecheck, formatting, diff check, and optimized build passed. All **seven actual-Neon cases passed separately**, with twelve recorded source/test hashes matching the final runtime. Vercel independently completed the production build. [Gates](review-round2-2026-11-01/gates.json).
- Both episodes completed against the optimized local build. Camera-control and progress layout checks covered 1280, 1440, 1920 and 390 px widths. [Local observations](review-round2-2026-11-01/local-browser.md).
- Signed-out production Chrome completed Borrowed Weather with wild rain, Moth, shy mood and the chase ending; Midnight Parcel completed garden/keep. Both preserved prop identity through accepted outward and return transfers, and both ended cleanly. These were labeled illustrated rehearsals with test ballots.
- A private production solo show used a physical 1280×720 camera, microphones off, and a separate receive-only 1920×1080 Program stream. The second real Twitch account voted in weather, accept, name, mood, give-back and ending windows. All six decisions recorded one real voter. The umbrella returned to A at version 6 with its coral patch and 52% wetness. Rain, thunder and cheer events were ingested. This was one operator using two owned accounts, not an independent audience or remote-human performance.
- Early **End show** succeeded without manual retry. The closed reservation, inactive quota slot, zero remaining LiveKit Cloud rooms, ended studio and closed Program page agreed. Every recorded closure step used server attempt 1. [Production record and limits](review-round2-2026-11-01/production-browser.md).
- The ten How-built links opened correctly. Anonymous requests to the README/source targets confirmed public access; credential/history scans found no matching private environment values. The README now includes current Weather, Parcel and solo views.

## Still unverified

The human-performance checks remain explicit: two consenting performers on separate networks with microphones, a full real Twitch broadcast through OBS, guest replacement while OBS continues, and physical hand offer/accept accuracy. Browser automation did not produce a genuine hidden/minimized director state, so the 8 fps hidden-window path and warning remain unobserved in a real hidden window. Program playback observations do not establish latency or continuous zero-frame-loss delivery. Short-lived rain/thunder effects were ingested but not isolated visually from the story's own weather; cheering stars were observed on Program.

The previous release's real twenty-minute expiry observation is retained historically. This release directly verifies early End; missed-workflow recovery, post-deadline grants, failed-start refunds and cleanup races have regression coverage, without claiming provider-outage or long-duration field validation.
