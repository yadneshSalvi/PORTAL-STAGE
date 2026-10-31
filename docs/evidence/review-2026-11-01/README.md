# Review acceptance — 1 November 2026

This directory is owned by the root browser/release reviewer. Implementation and deterministic tests are tracked separately by the project lead. Baseline observations are from the older deployed source `a9fd9242ef69a9b6b5052168c9564e4d5e5e63be`; they must not be presented as results of the review implementation.

No second human, remote network, microphone, recording, broadcast or real hand recognition is inferred from an account login, synthetic fixture, screenshot or same-computer test. Private footage, invite codes, credentials and consent receipts remain outside Git.

[Baseline production browser observations](baseline-browser.md) retain the actual delayed reload hold, the offer-timeout confound, and the end/reset behavior that did not reproduce the reported permanent spinner in this in-app session.

[Reliability acceptance](p0-browser.md) records the fixed-source reload, ended-show exits, landing overlap, four real Postgres integration tests, and synthetic guest replacement with an independently paired Program browser. Each observation identifies its source/build and actual conditions. [Structured results](p0-reliability-results.json) preserve the measurements.

[Native Chrome tab lifecycle](p0-tab-lifecycle.md) records actual Duplicate Tab fencing and a successful cue after the stale tab closes. It also explains why the background-tab observation does not establish hidden-page throttling or Program frame continuity. The guest-ended correction subsequently passed the [independent-browser exit check](final-guest-ended.json).

[Actual LiveKit Cloud revocation](cloud-revocation.md) records control-API and cached-token replay checks with a synthetic receive-only client. No camera or microphone was used. These independent provider checks do not replace deployed application Workflow-expiry acceptance.

[Authored stories and local camera](feature-browser.md) records two complete UI-driven rehearsal episodes, actual local camera/worker lifecycle, mobile layout, the native-visibility limitation, seven real Neon tests and a labeled 100-ballot HTTP burst. It preserves exact source/build boundaries and the two wording fixes found during the walkthrough.

[Production verification](production-verification.md) records actual host-account Twitch solo handoffs, the real opaque-ID relay failure and correction, safe recovery from a LiveKit ping timeout, the signed-out Midnight Parcel story, and physical Chrome local-camera initialization and cleanup. [Final gate counts](feature-gates.json) include the 370-test release and the unchanged source hashes for the seven separately passing Neon cases.
