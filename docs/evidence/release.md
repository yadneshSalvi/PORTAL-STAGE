# Release verification — 31 October 2026

The production deployment is **Ready** at [portal-stage-eight.vercel.app](https://portal-stage-eight.vercel.app). The public rehearsal, production Twitch sign-in, and EventSub listening passed in the main Codex conversation. Browser media through LiveKit Cloud and real audience ballots remain pending.

| Release identity                               | Value                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Source commit                                  | [`bf5cf4df746dff48c700e8548516b0cfdc2dbc66`](https://github.com/yadneshSalvi/PORTAL-STAGE/commit/bf5cf4df746dff48c700e8548516b0cfdc2dbc66) |
| Vercel deployment                              | `dpl_2SJnnjbvEHn5XhCbWtwPBXruvDnv`                                                                                                         |
| Main development and verification conversation | `01a190da-3cee-7a10-b7c1-e0cdbb379510`                                                                                                     |
| Structured evidence snapshot                   | [release-manifest.json](release-manifest.json)                                                                                             |

## Verified release behavior

The signed-out production rehearsal completed a labeled wild test ballot, rain, both offered/accepted crossings, hatch, and shared shelter. Show `ps_626f0fa0ece57a9b` reached shelter with the same coral-patched umbrella owned by A, at version 6 and 52% wetness. The [captured trace](browser/production-rehearsal-trace.json) contains 15 events through shelter; it is a recent-window browser export, not an immutable audit or a human performance recording. See the [production stage screenshot](browser/production-rehearsal-shelter.jpg) and [landing screenshot](browser/production-landing.jpg).

Production Twitch OAuth completed and the approved host created a live show. EventSub connected and displayed Listening for !gentle and !wild in Twitch chat; no actual PORTAL ballots have yet been counted. The dedicated LiveKit Cloud project has recording disabled, production/preview credentials configured, and a passed server RoomService authentication check. Those checks do not establish a completed browser media session.

The production landing passed the 390×844 overflow check. Hosted worker/model/SIMD WASM assets returned HTTP 200 and matched the bundled local files byte for byte. The session response was private and uncached. See the [production browser record](browser/2026-10-31-production.md) for these observed checks.

Earlier optimized local checks used independent cookies on two origins, a real Neon database, and a real local LiveKit server with visibly synthetic moving sources. The complete story, receiver-owned acceptance, separate Program room, emergency hold, disconnect/reconnect, fresh admission, resume, and end passed. A subsequent fresh run passed first-picture, preview open/close, and guest decoder replacement checks without a preview workaround. The actual hand model processed generated frames and reported active tracking with no selected hand. Conditions and historical failures remain in the [browser record](browser/2026-10-31-local.md).

The last full automated run passed 176 tests, with three opt-in database tests skipped. The final no-hand status change then passed 35 targeted vision tests and whole-tree typecheck. The three actual-Neon integration tests passed separately. Formatting and the optimized production build passed. [Implementation checks](checks.md) preserve those scopes instead of combining them into an invented single run.

## Pending verification

- Physical camera/microphone behavior and browser-to-LiveKit-Cloud transport.
- Actual PORTAL `!gentle` / `!wild` commands counted in a live round.
- Two consenting humans on separate networks, physical gesture accuracy, and measured control/media delay.
- Audible echo/synchronization, the OBS capture route, and a public broadcast.

Update this record and the structured manifest only after observing those checks. The manifest hashes the existing evidence files; recompute a hash if an artifact is intentionally replaced. It contains no credentials, invitation codes, raw camera recording, or private consent receipt.
