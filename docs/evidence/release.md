# Release verification — 31 October 2026

The production deployment is **Ready** at [portal-stage-eight.vercel.app](https://portal-stage-eight.vercel.app). The public rehearsal, production Twitch sign-in, and EventSub listening passed in the main Codex conversation. Browser media through LiveKit Cloud and real audience ballots remain pending.

| Release identity                               | Value                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Source commit                                  | [`12df783729263a051264ddeef88a29b7aa8ccae7`](https://github.com/yadneshSalvi/PORTAL-STAGE/commit/12df783729263a051264ddeef88a29b7aa8ccae7) |
| Vercel deployment                              | `dpl_BQ2GG9TznHmoqatAx8YoBzT9nhTQ`                                                                                                         |
| Main development and verification conversation | `01a190da-3cee-7a10-b7c1-e0cdbb379510`                                                                                                     |
| Structured evidence snapshot                   | [release-manifest.json](release-manifest.json)                                                                                             |

## Verified release behavior

The complete production story, OAuth/EventSub, mobile, asset, and cache checks below were captured on the initial source `bf5cf4df746dff48c700e8548516b0cfdc2dbc66`, deployment `dpl_2SJnnjbvEHn5XhCbWtwPBXruvDnv`. The final deployment above adds camera-request feedback; its focused production check is recorded separately.

The signed-out production rehearsal completed a labeled wild test ballot, rain, both offered/accepted crossings, hatch, and shared shelter. Show `ps_626f0fa0ece57a9b` reached shelter with the same coral-patched umbrella owned by A, at version 6 and 52% wetness. The [captured trace](browser/production-rehearsal-trace.json) contains 15 events through shelter; it is a recent-window browser export, not an immutable audit or a human performance recording. See the [production stage screenshot](browser/production-rehearsal-shelter.jpg) and [landing screenshot](browser/production-landing.jpg).

Production Twitch OAuth completed and the approved host created a live show. EventSub connected and displayed Listening for !gentle and !wild in Twitch chat; no actual PORTAL ballots have yet been counted. The dedicated LiveKit Cloud project has recording disabled, production/preview credentials configured, and a passed server RoomService authentication check. Those checks do not establish a completed browser media session.

The production landing passed the 390×844 overflow check. Hosted worker/model/SIMD WASM assets returned HTTP 200 and matched the bundled local files byte for byte. The session response was private and uncached. See the [production browser record](browser/2026-10-31-production.md) for these observed checks.

On the final deployment, an explicit production reload and lease reacquisition passed. Enabling the camera showed the waiting instruction, disabled duplicate Enable clicks, and exposed Cancel; there were zero private video elements while the browser grant remained pending. The [production screenshot](browser/production-camera-permission.jpg) records that state. A local browser check separately confirmed that Cancel clears the waiting controls and re-enables Enable. These checks accessed no physical media.

Earlier optimized local checks used independent cookies on two origins, a real Neon database, and a real local LiveKit server with visibly synthetic moving sources. The complete story, receiver-owned acceptance, separate Program room, emergency hold, disconnect/reconnect, fresh admission, resume, and end passed. A subsequent fresh run passed first-picture, preview open/close, and guest decoder replacement checks without a preview workaround. The actual hand model processed generated frames and reported active tracking with no selected hand. Conditions and historical failures remain in the [browser record](browser/2026-10-31-local.md).

The final full automated run passed **183 tests**, with three opt-in database tests skipped. Whole-tree typecheck, authored-file formatting, and the optimized production build passed. The **three actual-Neon integration tests passed separately**. [Implementation checks](checks.md) preserve the observed conditions and the earlier focused checks.

## Pending verification

- Physical camera/microphone behavior and browser-to-LiveKit-Cloud transport.
- Actual PORTAL `!gentle` / `!wild` commands counted in a live round.
- Two consenting humans on separate networks, physical gesture accuracy, and measured control/media delay.
- Audible echo/synchronization, the OBS capture route, and a public broadcast.

Update this record and the structured manifest only after observing those checks. The manifest hashes the existing evidence files; recompute a hash if an artifact is intentionally replaced. It contains no credentials, invitation codes, raw camera recording, or private consent receipt.
