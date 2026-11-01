# Round-two production browser verification

Canonical site: `https://portal-stage-eight.vercel.app`. Deployment `dpl_8oGMFeUjC8J4rtAtpRopgUUGasv2`, source `3c2b310198b4b3cf405d333f3c356837aeb39041`, runtime `36d31829b5f3b2e368ec96b6c54ab548884b776f`. Observed 1 November 2026. [Deployment metadata](deployment.json).

## Real Twitch solo, private LiveKit media

Show `ps_0a8c9535725b10ad` was created at 06:35:15 UTC with the fixed deadline 06:55:15 UTC. Host: `yadneshsalvi96`; real chat sender: `yadneshujwal`. One operator controlled both owned accounts. This is low-volume integration evidence, not independent audience engagement or a two-person performance.

The physical MacBook camera initialized at 1280×720. Microphone and optional recording permission stayed off. There was no Twitch broadcast or video recording. Camera readiness and director admission preceded opening the curtain. A separate receive-only Program tab played at 1920×1080. Four saved observations show increasing playback time from 11.258456 to 316.787884 seconds; decoded-frame counts were unavailable. These samples establish playback, not measured latency, uninterrupted delivery or OBS behavior. [Playback samples](production-program-playback.json).

All six actual Twitch choice windows counted the second account:

| Choice        | Command     | Applied result                                              |
| ------------- | ----------- | ----------------------------------------------------------- |
| Weather       | `!wild`     | Wild rain; umbrella 52% wet                                 |
| Receive offer | `!accept`   | Audience Room accepted; owner B committed                   |
| Name          | `!pip2`     | Sprig                                                       |
| Mood          | `!curious`  | Curious                                                     |
| Return offer  | `!giveback` | Audience Room offered back; performer A explicitly accepted |
| Ending        | `!share`    | Shared shelter                                              |

Each closed window recorded one unique voter, audience source and the real account credit. Tally bars and the final ending tally were observed on the separate Program output. Both receiver acceptances completed; final owner A/version 6 retained the same umbrella ID, coral patch and 52% wetness. The synthetic naming/mood/ending controls were not used in this live show.

Actual `!rain`, `!thunder` and `!cheer` commands were also accepted, with non-synthetic presence events at sequences 15, 48 and 51. The cheering stars were visible around the finale on Program. Rain/thunder were not isolated visually from the authored storm, so their individual visual acceptance remains partial. [Nine sent messages](production-twitch-messages.json) and [actual story export](production-story-record.json). The export omits private consent, camera-presence and media-grant events; formatting may differ from the original download. The original remains private. No raw camera frames or pairing codes are published.

## Early End: first-attempt closure

The End-show confirmation was submitted at approximately 06:41:47 UTC, over thirteen minutes before the fixed deadline. No manual retry was used. The server recorded closure at 06:41:49.398 UTC, and read-only provider/state inspection at 06:41:52.696 found:

- show phase `ended`, solo/reservation status `closed`;
- concurrent quota `active: false` after three issued media identities;
- neither of this show's LiveKit Cloud rooms remained;
- the studio showed camera/chat disconnected and Program not publishing;
- the separate Program page said media had closed.

The actual Vercel POST returned 200. Configuration, both room deletions, identity cleanup before/after deletion, progress persistence, quota release and final closure receipt all completed using attempt 1. Initial already-absent participants were correctly treated as idempotent success. Identities are replaced with role names in the public logs. [Closure state](production-solo-closure.json) · [step logs](production-closure-steps.json) · [ended studio](production-solo-closed.jpg) · [closed Program](production-program-closed.jpg). Studio and Program warning/error logs were empty. Ordinary early End remains a charged daily session; this observation does not claim a failed-start refund.

## Signed-out judge paths

A fresh Chrome tab showed **Sign in with Twitch for solo**, confirming no Twitch login was used. Both paths ran on the canonical production deployment without camera or provider credentials. Test ballots and illustrated plates remained labeled.

- **Borrowed Weather** `ps_893ab9b1080d2a87`: wild → outward accepted crossing → Moth → shy → accepted return → chase. Final export sequence 27: owner A/version 6, coral patch, 52% wetness. End reached sequence 28. [Record](signed-out-weather-record.json), [finale](signed-out-weather-chase.jpg), [ended](signed-out-weather-ended.jpg).
- **Midnight Parcel** `ps_7fb2b599196311b7`: garden → stamp → outward acceptance → unpack in B → accepted return → keep → complete delivery. Final export sequence 20: same tag `MP-196311B7`, owner A/version 7, 48% handling, garden in room A. End reached sequence 21. [Record](signed-out-parcel-record.json), [garden finale](signed-out-parcel-garden.jpg), [ended](signed-out-parcel-ended.jpg).

Chrome warning/error logs were empty after both episodes. The export button saved actual JSON files; the Chrome automation download-event waiter timed out on Weather, so the already-downloaded file was recovered from Downloads. That tool failure did not interrupt the show or require an app change. Short locator mismatches were corrected from the visible controls; no app state was injected. Exports are semantically preserved and formatted for the repository.

## Public access and remaining scope

Both project repositories are now public and MIT licensed. Ten links on `/how-built` opened successfully in the in-app browser. Anonymous requests independently confirmed the README and source targets return 200. [Clicked links](how-built-links.json), [anonymous access](public-links.json), [credential/history scan](source-access-scan.json). The new production global solo limits are 100 daily and 10 concurrent; the account cap and twenty-minute deadline remain unchanged.

Actual OBS capture/broadcast, separate-network humans with microphones, guest replacement during OBS, physical hand-cue success rate and a genuinely hidden/minimized director remain unverified. Both browser backends reported visible documents during background attempts; no hidden-state or visibility event was fabricated. The current release's early closure passed; the earlier release's real twenty-minute expiry result remains historical evidence, not a new current-source run.
