# Round-3 functional deployment

Source `6a263042818db10e35ce0e8aadb114bd566ccefc`, Vercel `dpl_2vMBLb6TgK2v8hQDcWUe1FaSborK`, confirmed Ready at https://portal-stage-eight.vercel.app. Deployed from an exact source archive while UI work continued separately. Typecheck, 439 ordinary tests, formatting and an 18-page build passed; seven database tests were skipped in that ordinary run.

A signed-out Chrome visit reached the episode/mode picker with Twitch sign-in offered. The actual page’s resource timing recorded `/api/session` at 251 ms (responseEnd 1392 ms from navigation). This single observation is not a latency guarantee; the regression test separately establishes that the anonymous session request does not call the cleanup closer. No new rehearsal, real media session, camera, microphone, Twitch message or broadcast was started in this smoke check. [Picker capture](../ui-pass-2026-11-01/p0-picker.png).

Final UI acceptance and current runtime identity are recorded separately after the UI release.
