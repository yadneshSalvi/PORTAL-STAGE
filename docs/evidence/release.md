# Review release verification — 1 November 2026

The review improvements are live at [portal-stage-eight.vercel.app](https://portal-stage-eight.vercel.app). The release adds continuous audience authorship, a public authenticated solo mode, local-only camera rehearsal, Midnight Parcel, and the reliability corrections described in the review.

| Identity                | Value                                      |
| ----------------------- | ------------------------------------------ |
| Deployed source         | `96fea8781dd86bf23a95126247b1e703b8babde9` |
| Latest runtime change   | `16b11003dd066424f30e93dc2c04dfaccb3e072e` |
| Vercel deployment       | `dpl_mUKo1r1j3ojraoWWmKWgToPeGCp5`         |
| Local optimized build   | `jKHgKbotO8fc4sJHSBn3c`                    |
| Main Codex conversation | `01a190da-3cee-7a10-b7c1-e0cdbb379510`     |

Evidence-only commits after the deployed source do not change the application. The [structured manifest](release-manifest.json) records exact source boundaries and artifact hashes. The [pre-review release](pre-review-release.md) and [its manifest](pre-review-release-manifest.json) preserve the earlier two-session Cloud walkthrough.

## What was actually verified

- **370 ordinary tests passed**, seven opt-in tests skipped; whole-tree typecheck, formatting, diff check, and optimized build passed. All **seven actual-Neon tests passed separately**; their recorded source hashes still match this release. Vercel independently passed its production build. [Gates](review-2026-11-01/feature-gates.json).
- Reload with a pending offer, copied-tab fencing, ended exits, guest replacement with independent Program pairing, and explicit Program unpairing were exercised at their recorded optimized local checkpoints. The independent Program had five advancing decoded-frame observations over 120 seconds during guest replacement; that does not claim continuous zero-frame-loss playback. [Reliability](review-2026-11-01/p0-browser.md) and [native tab lifecycle](review-2026-11-01/p0-tab-lifecycle.md).
- Both authored rehearsal stories completed. Garden contents changed room B and moved home with the Keep ending; Stars with Leave the gift completed in signed-out production Chrome. Prop identity, stamp/repair patch, and handling/wetness remained persistent. [Story evidence](review-2026-11-01/feature-browser.md) and [production run](review-2026-11-01/production-verification.md).
- Actual host-account Twitch commands drove solo acceptance and giveback, plus three ordered presence events. The walkthrough discovered and fixed dropped opaque EventSub identifiers. A separate real LiveKit ping timeout safely stopped devices/cancelled a pending offer; explicit readiness and admission recovered the show. [Production verification](review-2026-11-01/production-verification.md).
- A real 20-minute solo reservation expired without a manual End action. Its deployed Workflow completed, the existing receive-only participant was removed, quota released, rooms removed, new token issuance denied, and an actual refreshed JWT rejected while still valid. Browser deadline safeguards were also active. [Expiry evidence](review-2026-11-01/app-solo-expiry.json).
- Final-source solo Midnight Parcel completed Wait → reoffer → receiver acceptance → garden → giveback → human acceptance → Keep. Early shutdown stopped video immediately but needed one visible **Retry media closure** before quota released; its initial failure cause was not identified. [Story and recovery evidence](review-2026-11-01/production-solo-parcel.json).
- Fresh production OAuth as the ordinary account `yadneshsalvi96` opened one capped solo reservation and established Twitch Listening. The lobby changed from 3 of 3 starts to 2 of 3 after one confirmed End; the reservation closed and active quota released with zero media grants. The existing browser session changed Twitch identity; no camera, microphone, public message or live scene was used. [Second-account acceptance](review-2026-11-01/second-account-acceptance.md).
- Production Chrome captured physical 1280×720 local-only rehearsal frames, loaded the hand worker, and stopped every video element on End. No actual hand-recognition success is claimed; tab-observed network requests contained no media-token request or WebSocket. [Camera observation](review-2026-11-01/production-chrome-camera.json).
- A labeled synthetic 100-ballot HTTP/Neon burst exercised batching, replacement, deduplication, timestamp grace, malformed input, stale rounds, and expired authority. It is one synthetic observation, not measured Twitch throughput. [Result](review-2026-11-01/feature-http-burst.json).
- The final deployed signed-out landing and How-built page loaded correctly. The local 390-pixel landing had no horizontal overflow; the label overlap was corrected. [Review evidence](review-2026-11-01/).

## Explicit remaining acceptance

Two consenting humans on separate devices/networks, microphones and audible echo/synchronization, real gesture recognition/alignment, actual OBS capture/broadcast, and measured input-to-stream latency remain unverified. Native tab switching under automation did not provide a reliable hidden-document transition, so sustained hidden-window rendering is not reported as a browser pass.

Ordinary non-allowlisted OAuth and solo reservation/End are now verified for `yadneshsalvi96`. The production duet entry still required an invited host; the read-only observer's allowlist result came from local configuration, and no production `/api/session` flags were captured. Current delivered-message evidence uses the original authorized host account and does not establish independent viewers, second-account message delivery or moderator behavior. The earlier public-message tests used their twelve-message authorization; this additional account check sent no messages. A second account controlled in the same browser is not a second remote performer.

The repository remains private and has no project-level LICENSE; organizer source access/licensing remains an owner decision. The previously recorded moderate Workflow CLI dependency advisory is not relabeled as a clean audit. No private media, credential, invitation code, or consent receipt belongs in the evidence directory.
