# Round-three final production browser checks

1 November 2026, final runtime `fece42381d569bd70b9ce81055c71b664000e9a1`, Vercel `dpl_91FUymt469TFNoo3iRnHSu3S41R9`, independently confirmed Ready at [portal-stage-eight.vercel.app](https://portal-stage-eight.vercel.app). The exact committed source was deployed from an isolated archive; local credentials and unfinished evidence were excluded.

## Signed-out judge path

Chrome’s final mode picker offered **Sign in with Twitch** for both Solo with chat and Duet. Ordinary rehearsal required no account or camera. After alias promotion, the pre-existing browser initially held the prior client bundle; a full reload obtained the new UI before the retained final captures and audits.

| Story            | Show                  | Test choices                    | Ended export |
| ---------------- | --------------------- | ------------------------------- | ------------ |
| Borrowed Weather | `ps_924cf2bd19142b0a` | gentle, pip3 (Moth), shy, chase | sequence 28  |
| Midnight Parcel  | `ps_345d878d804fbde2` | garden, keep                    | sequence 21  |

Weather completed the curtain, all four choices, gentle rain, accepted outward handoff, name/personality application, hatch, accepted return, playful chase and Take a bow. The same umbrella returned to A at version 6, two accepted transfers, coral patch and 0.2925 wetness (displayed 29%). [Exported record](production-weather-record.json).

Parcel completed the curtain, contents choice, stamping, accepted outward handoff, opening into a garden, accepted return, keep choice, Complete the delivery and Close the sorting office. The same tag `MP-804FBDE2` returned to A at version 7 with 48% handling marks; the garden’s final room was A. [Exported record](production-parcel-record.json).

Both studios visibly reached **Show ended**. Both downloaded records include `action.end`. Files were exported through the Inspect UI and verified on disk. The Chrome automation’s download-event wait timed out after the Weather download had already completed; the file itself existed and parsed correctly. No second ending or duplicate export was needed.

These were explicitly labeled illustrated rehearsals and test ballots. No fresh model request, Twitch message, camera, microphone, LiveKit media session or broadcast was used. They establish the judge rehearsal path, not remote-human performance.

## UI and output checks

Camera & hand cues, Scene preview, Inspect, Customize and End-show dialogs were opened. Local camera consent stayed unchecked. End was initially cancelled; final story cues ended each show. The separate Program scene preview displayed the canonical canvas with one Rehearsal chip, a Test vote chip where appropriate, and one label for each room. Program console and the studio console returned no warning/error entries during these flows.

Landing, signed-out picker, guide, How-built, guest entry and 404 were checked. How-built has five concrete code-linked contributions and is reached from the footer. The fixed mobile guest paragraph uses 14 px; the error-page wordmark now also uses 14 px.

The in-app browser reopened the already ended historical solo show `ps_0a8c9535725b10ad` solely to check its long **Your camera & consent** control and layout. It remained ended, with camera/Twitch/Program disconnected, and no rehearsal label on that solo view. This is current UI evidence over historical state, not a new real-camera acceptance run.

[The final layout audit](../ui-pass-2026-11-01/production-layout.json) covers 20 states at 1280/1440/1920/390 px (80 observations): zero overflow findings, at most three visible DOM text sizes. Program is a canvas-only view. [Before/after evidence](../ui-pass-2026-11-01/README.md) contains 16 paired screens and six additional final/mobile views; all were visually inspected. Initial stale-bundle captures were overwritten with verified final UI captures.

## Remaining field acceptance

The review’s optional two-human/separate-network OBS session, guest replacement while OBS continues, genuinely hidden director behavior and physical hand-cue accuracy remain unverified. Dedicated isolation of short-lived presence effects and current-release real timed expiry/provider-outage behavior remain separate from automated coverage. Round-two real Twitch/camera and manual early-End evidence is preserved historically, without relabeling it as a fresh round-three result.
