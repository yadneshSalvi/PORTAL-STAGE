# Review acceptance — 1 November 2026

This directory is owned by the root browser/release reviewer. Implementation and deterministic tests are tracked separately by the project lead. Baseline observations are from the older deployed source `a9fd9242ef69a9b6b5052168c9564e4d5e5e63be`; they must not be presented as results of the review implementation.

No second human, remote network, microphone, recording, broadcast or real hand recognition is inferred from an account login, synthetic fixture, screenshot or same-computer test. Private footage, invite codes, credentials and consent receipts remain outside Git.

[Baseline production browser observations](baseline-browser.md) retain the actual delayed reload hold, the offer-timeout confound, and the end/reset behavior that did not reproduce the reported permanent spinner in this in-app session.

[Reliability acceptance](p0-browser.md) records the fixed-source reload, ended-show exits, landing overlap, four real Postgres integration tests, and synthetic guest replacement with an independently paired Program browser. Each observation identifies its source/build and actual conditions. [Structured results](p0-reliability-results.json) preserve the measurements. Hidden/duplicated-director checks and the newly discovered guest-ended UI correction remain pending there.
