# Release verification — 31 October 2026

The production deployment is **Ready** at [portal-stage-eight.vercel.app](https://portal-stage-eight.vercel.app). The public rehearsal and final-deployment physical-camera Cloud story passed, including actual Twitch ballot replacement, both handoffs, emergency recovery, and shutdown. The cloud test used two independent sessions on one computer/network; microphones stayed disabled.

| Release identity                               | Value                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Source commit                                  | [`12df783729263a051264ddeef88a29b7aa8ccae7`](https://github.com/yadneshSalvi/PORTAL-STAGE/commit/12df783729263a051264ddeef88a29b7aa8ccae7) |
| Vercel deployment                              | `dpl_BQ2GG9TznHmoqatAx8YoBzT9nhTQ`                                                                                                         |
| Main development and verification conversation | `01a190da-3cee-7a10-b7c1-e0cdbb379510`                                                                                                     |
| Structured evidence snapshot                   | [release-manifest.json](release-manifest.json)                                                                                             |

## Verified release behavior

The public synthetic rehearsal, initial OAuth/EventSub, mobile, asset, and cache checks below were captured on initial source `bf5cf4df746dff48c700e8548516b0cfdc2dbc66`, deployment `dpl_2SJnnjbvEHn5XhCbWtwPBXruvDnv`. The physical-camera Cloud walkthrough, real Twitch commands, recovery, and shutdown were then verified on the final deployment above.

The signed-out production rehearsal completed a labeled wild test ballot, rain, both offered/accepted crossings, hatch, and shared shelter. Show `ps_626f0fa0ece57a9b` reached shelter with the same coral-patched umbrella owned by A, at version 6 and 52% wetness. The [captured trace](browser/production-rehearsal-trace.json) contains 15 events through shelter; it is a recent-window browser export, not an immutable audit or a human performance recording. See the [production stage screenshot](browser/production-rehearsal-shelter.jpg) and [landing screenshot](browser/production-landing.jpg).

Production Twitch OAuth completed and EventSub listened in live show `ps_fb3398cc6bde0434`. The authorized host account posted `!gentle`, then `!wild`; the second replaced the first, leaving one unique voter and audience-source wild weather. These were actual chat commands, not synthetic ballots. The dedicated LiveKit Cloud project carried both 1280×720 camera tracks, the 1920×1080 composed Program, and B’s video-only return. Room inspection verified separate backstage/Program rooms and a receive-only Program viewer. The host ran in production; B used an isolated local development origin with the same source and cloud services. Both sessions used one physical camera/computer/network, so this does not establish two remote performers or independent audience engagement.

The production landing passed the 390×844 overflow check. Hosted worker/model/SIMD WASM assets returned HTTP 200 and matched the bundled local files byte for byte. The session response was private and uncached. See the [production browser record](browser/2026-10-31-production.md) for these observed checks.

On the final deployment, an explicit production reload and lease reacquisition passed. Enabling the camera showed the waiting instruction, disabled duplicate Enable clicks, and exposed Cancel; there were zero private video elements while the browser grant remained pending. The [production screenshot](browser/production-camera-permission.jpg) records that state. A local browser check separately confirmed that Cancel clears the waiting controls and re-enables Enable. Those initial pending-state checks accessed no physical media. After the user allowed both origins, the physical-camera walkthrough completed. Actual receiver acceptance committed B at sequence 27/version 4 and A at 31/version 6 before their arrival acknowledgments. Shelter completed at 33 with the same coral patch and 52% wetness. Panic 34, camera withdrawal/re-enable 35–36, fresh readiness/admission 37–40, and resume 41 preserved that state. End 42 removed all media elements and cloud rooms. [Sanitized final trace](browser/production-cloud-ended-trace.json) and [room inspection](browser/production-cloud-shutdown.json) record the result; private consent events are omitted and original exports stay outside Git. Intentional shutdown emitted SDK teardown warnings, retained in the browser evidence, without leaving live tracks or rooms.

Earlier optimized local checks used independent cookies on two origins, a real Neon database, and a real local LiveKit server with visibly synthetic moving sources. The complete story, receiver-owned acceptance, separate Program room, emergency hold, disconnect/reconnect, fresh admission, resume, and end passed. A subsequent fresh run passed first-picture, preview open/close, and guest decoder replacement checks without a preview workaround. The actual hand model processed generated frames and reported active tracking with no selected hand. Conditions and historical failures remain in the [browser record](browser/2026-10-31-local.md).

The final full automated run passed **183 tests**, with three opt-in database tests skipped. Whole-tree typecheck, authored-file formatting, and the optimized production build passed. The **three actual-Neon integration tests passed separately**. [Implementation checks](checks.md) preserve the observed conditions and the earlier focused checks.

## Pending verification

- Two consenting humans on separate devices/networks, physical gesture accuracy, and measured control/media delay.
- Physical microphone behavior, audible echo/synchronization, the OBS capture route, and a public broadcast.

Update this record and the structured manifest only after observing those checks. The manifest hashes the existing evidence files; recompute a hash if an artifact is intentionally replaced. It contains no credentials, invitation codes, raw camera recording, or private consent receipt.
