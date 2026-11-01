# Round 3 implementation — 1 November 2026

This record covers source changes from `a2ac861` on `codex/round3-ui-fixes`. The release coordinator owns browser observations, screenshots, production acceptance and deployment identity. Automated fixture tests below do not establish actual Twitch traffic, physical media behavior or production closure timing.

## Baseline

Port 3200 had no listening server. Before source edits, `npm run typecheck && npm test && npm run format:check && npm run build` passed: **435 tests passed, seven opt-in database tests skipped** (36 files passed, two skipped), with an optimized 18-page build. Build ID: `3bwi_LxTAt6EMRS03ahzz`. The build did not change `next-env.d.ts`.

## Functional checkpoint — R3-P1, R3-P2 and R3-P3

All narrow studio side-panel buttons now allow wrapped labels and keep icons from shrinking. The camera/consent, Ready and Twitch buttons use label spans. Pixel bounds and the requested four-width overflow audit remain browser acceptance work.

Anonymous session reads no longer invoke reservation recovery or the LiveKit closer. Authenticated allowance requests and solo starts retain the existing recovery path. A regression calls the actual signed-out session GET handler with an overdue issued-media reservation and verifies that no provider removals or room deletions occur; the next-start closure regression continues to pass.

Batch chat intake returns separate `counted`, `ignored` and `rateLimited` counts. A mixed batch fixture keeps one valid message, ignores one malformed message and separately reports one rate-limited message. Single-envelope rate-limit errors and whole-request authority checks remain unchanged. The connector preserves a dropped-command warning after a successful response and across the next welcome event. The studio shows one compact **Commands dropped** chip, with the full warning in its accessible label and tooltip.

The complete gate command passed after these source changes: **439 tests passed, seven opt-in database tests skipped** (37 files passed, two skipped; 1.77 seconds reported by Vitest), typecheck, formatting and the optimized 18-page build. Build ID: `E9KwGlL_Jf2rEUIuyvELp`. There was no `next-env.d.ts` drift.

## UI checkpoint

The presentation pass and its final validation are pending. No production or browser result is claimed by this source checkpoint.
