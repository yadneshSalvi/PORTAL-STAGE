# Authored stories and local camera — frozen browser checks

Root drove the in-app browser against optimized local source `b8e06733bd5ffc5230c0005543e20f9b9dc2737b`, build `W6_oT5b8feu2ZKjBJE2Sb`. Subsequent source `de2ef19913d75c39bf64ef8b80b64357859cfbb5` changes only the choice button wording and episode-specific rehearsal plate labels. Its final build is `vuSxqpwVRsV4ruwwbePHd`.

## Completed story paths

- **Borrowed Weather**, `ps_d06a0879fa2874df`: open, wild weather test ballot, apply, offer A/accept illustrated B, name Sprig, shy mood, reveal creature, offer B/accept A, shared-shelter ending, take a bow. Every window closed explicitly and each result was applied separately. Both transfers completed; the same umbrella retained its coral patch and 52% wetness. The show ended at sequence 31 with a usable New rehearsal/New show exit. Test rain, thunder and cheer commands were accepted; these were labeled rehearsal effects, not real Twitch commands. This walkthrough does not measure transient effect animation timing.
- **Midnight Parcel**, `ps_9f33f03ae1f78998`: garden contents, stamp, offer A/accept illustrated B, open, offer B/accept A, keep ending, finish delivery, close sorting office. The garden visibly appeared in room B and moved to room A at the ending. Tag `MP-E1F78998`, stamp and handling marks persisted; the completed parcel had damage 0.48, two accepted transfers and owner A. The show ended with the normal exit. No audience viewers were simulated.

[Structured story states](feature-story-state.json) retain the actual decisions and event sequence. Screenshots: [weather finale](feature-weather-shared-shelter.jpg), [garden in B](feature-parcel-garden-in-b.jpg), [garden brought home](feature-parcel-garden-home.jpg).

The walkthrough caught an awkward “Bring bring the magic home on stage” label and weather-specific captions beneath parcel art. The final polish commit corrects both and adds focused caption regressions. These screenshots intentionally preserve the earlier observed state; final production checks will be recorded separately.

## Local camera and layout

The approved physical Mac camera produced 1280×720 decoded frames at readyState 4. Local framing confirmation enabled the hand worker; it reported tracking active with no selected hand detected. Turning camera off removed all video elements. Restarting it and ending the show removed the local-camera stage label immediately and left zero video elements after End. No camera images were retained.

Tab-scoped CDP observation saw same-origin show/lease requests and the local worker script, with no media-token request or WebSocket creation. Worker-internal traffic was not captured. [Camera observations](feature-local-camera.json) state this scope; no production Chrome, actual hand recognition, or remote media claim follows from this local test.

The landing page was checked at a 390×844 emulated mobile viewport: document and body width both equaled 390, with visual viewport scale 1. [Mobile screenshot](feature-mobile-landing.jpg). The How built page visibly links ownership, media, episode and camera implementations to their tests and explicitly distinguishes rehearsal from remote-human/OBS acceptance.

Native Chrome selected a new tab and then returned to a running rehearsal. No persistent visibility warning appeared in this controlled environment; earlier read-only browser inspection also reported visible while deselected. [Recorded limitation](feature-native-visibility.json). No hidden-page throttling or Program continuity claim is made. The isolated show was ended and its tabs closed.

## Independent service checks

[Frozen gates](feature-gates.json): 359 initial ordinary tests, then 361 after the two polish regressions; seven actual Neon tests passed separately. The server/database files used for the Neon run match the final source hashes. Typecheck, formatting and optimized build passed. The known-secret scan found no configured secret value in tracked files or client static bundles and no tracked private configuration.

[Synthetic HTTP burst](feature-http-burst.json): 100 unique fixture ballots in five batches took 7,837 ms in one local HTTP/Neon observation. Redelivery was ignored, newer votes replaced older ones, invalid batches/timestamps were rejected, five stale-round commands returned 409, the three-second delivery-grace case matched, and an expired renderer was fenced. Fixture rows were deleted. These results are not Twitch throughput, real viewers, media latency or a benchmark distribution.

Production solo, natural Workflow expiry, alternate endings, stars, final deployed camera/guest exits and actual second-account Twitch remain separate acceptance items. Two remote humans/networks, microphones and OBS remain a physical acceptance task.
