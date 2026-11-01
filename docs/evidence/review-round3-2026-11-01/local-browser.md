# Round-three optimized local browser checks

Observed 1 November 2026 in the Codex in-app browser at `http://localhost:3200`, from frozen UI checkpoint `c59a5bb5e65e4cccf8414c0af479facdbf9e5d43` (optimized build `ZqtqeiEkiYH7__e9mTEaP`). The local browser retained an existing account session; these checks are not labeled signed-out. Final production checks are recorded separately after the subsequent presentation fixes.

Both runs used ordinary illustrated rehearsal and explicitly labeled test ballots. No camera, microphone, LiveKit media session, new model request, or Twitch message was used.

| Story            | Show                  | Choices                            | Result                                                                                                                                |
| ---------------- | --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Borrowed Weather | `ps_d8603a46bbab7f12` | wild, pip2 (Sprig), curious, share | Curtain, all four choices, rain, accepted outward and return transfers, shared shelter, Take a bow, Show ended                        |
| Midnight Parcel  | `ps_0a5ac06ad28d04b3` | stars, deliver                     | Curtain, both choices, stamping, accepted outward and return transfers, opening stars, delivery, Close the sorting office, Show ended |

The Weather export reached sequence 28: umbrella owner A, version 6, two accepted transfers, coral repair patch and 52% wetness. The Parcel export reached sequence 21: the same tagged parcel returned to A, version 7, two accepted transfers, 48% handling marks, stars left in room B. Each export includes the final `action.end` event. Exports were downloaded through the Inspect drawer, not manufactured from a test fixture: [Weather](local-weather-record.json), [Parcel](local-parcel-record.json).

Camera consent, Scene preview, Inspect, Customize and End dialogs were opened. Camera consent remained unchecked; End was initially cancelled, then each story was ended through its final cue. The separate canvas-only Program scene preview displayed the canonical state. Public landing, picker, guide, How-built, guest entry and 404 were inspected. Console warning/error logs were empty during both story runs and after the final export.

The [local layout observations](../ui-pass-2026-11-01/local-layout.json) cover 19 states at 1280, 1440, 1920 and 390 px: 76 native DOM observations, zero overflow findings. Most screens use at most three visible DOM text sizes. The guest entry had an additional 13 px paragraph at 390 px; that finding was passed to the lead and fixed before the final release. Visual inspection also caught duplicated room names inside and beneath the illustrated art; the inner labels were removed, with a composed-layer regression test. The final production audit checks both fixes.

Native DOM metrics were collected with browser CDP `Runtime.evaluate`, using the review’s `offsetParent`/scroll-width/right-edge predicate. Canvas-only Program is recorded as a render surface rather than a zero-element audit failure. Nineteen local PNGs were visually inspected as a contact sheet; production before/after captures and their hashes are the release comparison evidence.
