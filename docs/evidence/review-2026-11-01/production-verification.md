# Production review verification

The review release is deployed at `https://portal-stage-eight.vercel.app` from source `96fea8781dd86bf23a95126247b1e703b8babde9`, runtime `16b11003dd066424f30e93dc2c04dfaccb3e072e`, deployment `dpl_mUKo1r1j3ojraoWWmKWgToPeGCp5`. The final deployment changes current-browser Twitch connection status and adds expiry regressions; the story, camera, media, and server state-machine code matches the immediately preceding release tested below.

## Actual Twitch and solo story

Show `ps_c39a971c7d948d0e` ran in the in-app browser with one physical 1280×720 camera, microphone off, and recording consent unchecked. The other portal was the explicitly illustrated Audience Room. LiveKit Cloud carried the backstage camera and canonical Program. There was no Twitch broadcast, recording, second human, or separate network.

Initial real `!gentle` and `!rain` commands exposed a client bug: Twitch EventSub notification IDs are opaque strings and can contain `=`. The overly narrow client pattern discarded them before forwarding. Commit `5bf1112` corrects that projection, with six regression cases. The failure is retained in [production-twitch-discovery.json](production-twitch-discovery.json).

After deployment and reconnection, actual `!rain`, `!thunder`, and `!cheer` commands reached ordered server presence events. Their brief canvas animation timing was not separately measured. Real `!accept` and `!giveback` ballots each recorded one voter, the authorized host `yadneshujwal`. The accepted umbrella crossed A→Audience Room; chat then offered it back and the host explicitly accepted A. The same coral patch and 29% wetness remained. Weather, name (Sprig), personality (Curious), and ending (One last chase) used deliberately empty ballots followed by **Director’s choice**, never fabricated audience votes. The final scene reached sequence 69 with owner A. See [production-solo-state.json](production-solo-state.json).

One initial acceptance was cancelled safely during a real LiveKit signal interruption. Browser logs show ping timeouts at 21:42:34/38 UTC, then signal/peer-connection retries, followed by recovery at 21:43:03. A separate receive-only SDK participant stayed connected. The application stopped camera/microphone, withdrew readiness/admission, and cancelled the offer. Camera enable, Ready, and explicit admission restored the performer before the successful new acceptance. The Program can continue publishing a safe curtain with devices off. There is no evidence that the 120-second initial join JWT caused this interruption. [Sanitized reconnect logs](production-reconnect-logs.json) preserve the actual failure; regression tests independently distinguish join-token expiry from the 20-minute solo deadline.

Eight public commands were sent during this review, plus four previously authorized test commands: the 12-message authorization budget is exhausted. All commands were sent by the existing host account, so this proves actual Twitch transport and single-account decisions, not independent audience engagement or a second-account test.

## Signed-out production and local camera

Chrome, signed out of the application, completed Midnight Parcel with labeled test choices: Stars → stamp → receiver acceptance in B → open the constellation → offer and accept back in A → Leave the gift. The tag, stamp, and handling marks persisted; the stars remained in the receiving room. The episode reached cue 08 and was explicitly ended at sequence 21. [State](production-parcel-state.json) and [stage image](production-parcel-stars-gift.jpg) record that run.

On the same production rehearsal, explicit camera consent and Chrome’s one-time permission produced actual 1280×720 muted frames (`readyState=4`). Framing confirmation and enabling the local hand worker produced “Tracking active — no selected hand detected.” No gesture recognition success is claimed. The observed tab network contained only same-origin show/lease requests and `/vision/hand-worker.js`; no media-token request or WebSocket appeared. Worker-internal network requests were not captured. Confirming End removed every video element and showed **Show ended**, **New rehearsal**, and **New show**. [Camera observation](production-chrome-camera.json) contains no frames or consent receipt.

The final deployment’s signed-out landing loaded the two episode entrances and updated copy successfully. [Final landing image](final-production-landing.jpg).

## Real deployed solo expiry

The first solo reservation kept its original 20-minute deadline, `2026-10-31T21:52:25.012Z`. No End click, deadline edit, database mutation, or direct provider cleanup was used to close it. The browser remained open with physical camera frames until shortly before the deadline; its automatic safeguards stopped the camera and displayed the ended screen with zero video elements at 21:52:28.376Z. The brief pending-closure notice disappeared when server closure completed.

An independent receive-only Node SDK client obtained its grant through the application's normal Program pairing and token endpoints. It published no tracks and made no recording. It received four real SDK token refreshes; the latest JWT expired at 21:58:02Z, beyond the reservation deadline. At21:52:28.271Z the provider removed that connected participant. New app token issuance returned 403 with no token. The reservation reached `closed`, its active quota entry disappeared, and both named rooms were absent. Reusing the actual refreshed JWT at 21:52:38 was rejected as authentication failure while it remained valid, and no new identity was issued.

Root independently inspected Workflow run `wrun_41M69Y1JK10GGK1YJ6BK5DTED2`: `completed` at 21:52:30.992Z, on its original deployment `dpl_Tty6pbCz4qB7t724hxvRNuUkRKzZ`. The final release's server and Workflow trees are unchanged from that checkpoint. The browser's deadline safeguards and deployed Workflow were both active; this does not claim an isolated browser-absent test. [Sanitized app expiry and Workflow evidence](app-solo-expiry.json).

## Final-source solo Midnight Parcel

Show `ps_fd9d44159b7b4ffb` ran on final source `96fea878` with the same explicitly consented physical camera, microphone off, and no recording or broadcast. The Twitch status correctly moved from Not connected → Connecting → Listening only after this browser's subscription was established. No further public messages were sent. Every ballot in this run was empty and deliberately resolved as **Director’s choice**.

The complete path was Garden → stamp → offer → Wait → fresh offer → Accept → crossing to the Audience Room → open → Giveback → explicit human acceptance → Keep → complete delivery. Wait preserved A's ownership and returned the cue to a fresh offer. At sequence 46, the parcel was back with A, its same tag `MP-9B7B4FFB` and moon stamp retained, damage 0.48, opened garden contents, and transformed room A. These solo consequences were checked through UI state and independent durable state; the visual garden render had already been inspected in the separate illustrated rehearsal.

**Close the sorting office** ended the show at sequence 47 well before its deadline and stopped all browser video. The initial closure was incomplete: both rooms were absent, but the reservation remained `closing` and still held quota. The app displayed **Retry media closure**. One click completed closure; the pending notice disappeared, the reservation became `closed`, quota released, and both rooms remained absent. There is no per-stage diagnostic proving which provider operation failed initially, so this is retained as an unexplained incomplete cleanup with successful explicit recovery—not a first-attempt shutdown pass. [Final-source state and cleanup evidence](production-solo-parcel.json) and [ended screen](production-parcel-ended.jpg).

## Remaining boundaries

Two consenting humans on separate devices/networks, physical microphone/echo behavior, real gesture accuracy, and an actual OBS broadcast remain unverified. Native tab switching in this automation environment did not expose a reliable hidden-page transition; hidden-window rendering and warning behavior are therefore not reported as an observed browser pass. Server, state-machine, and synthetic tests do not replace those physical checks.
