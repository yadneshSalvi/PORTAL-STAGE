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

The presentation pass removes decorative taglines, eyebrows and repeated helper paragraphs from the landing, picker, director desk, cue and choice cards, Program, guest setup, dialogs, guide and recovery pages. The picker separates illustrated episode cards from the three mode actions. The director desk keeps the stage, compact performer rows, one next-cue primary action, and grouped prop and safety controls. Connection icons carry full tooltips. Solo media time is a chip; its warning appears only during the final two minutes.

One shared DOM status chip handles rehearsal/test and delivery statuses. The canonical picture paints exactly one **Rehearsal** chip in every rehearsal curtain state and none in live Program. Active fixture ballots have one **Test vote** chip in the picture and one in their separate choice-card context. The studio does not add a duplicate header rehearsal chip, and Program does not add a duplicate overlay. Room names replace plate disclaimers. Technical resolution/frame data and development transport controls move into Inspect. Camera, broadcast and recording permission text remains at its permission step; the authenticated actions and public/private projections are unchanged.

The interface uses a 14/20/32-pixel studio scale, a 14/20/48-pixel picker scale, and matching dialog typography; the canonical canvas uses 24/36/64-pixel text. Spacing follows four/eight-pixel steps. Public pages and guest controls have their own three-size scales. Buttons wrap, icons do not shrink, focus stays visible, and reduced-motion rules remain active. The build page contains five concise contributions linked to existing source and is reachable only through the site footer.

Regressions exercise the actual Studio component with controlled external hooks and real canvas-label drawing: one rehearsal marker across the desk and picture, separate test-ballot contexts, no rehearsal/test label in live mode, a wrapped camera-consent label and disabled chat connection without renderer authority. Additional tests retain distinct Director attribution, cancelled-result filtering, local-camera naming, all rehearsal curtain states, clean live Program labels, consent gates and five valid build-page code links.

The full source gate command passed after the UI freeze: **451 tests passed, seven opt-in database tests skipped** (40 files passed, two skipped; 1.55 seconds reported by Vitest), typecheck, formatting and the optimized 18-page build. Build ID: `ZqtqeiEkiYH7__e9mTEaP`. Port 3200 was clear, `git diff --check` passed and `next-env.d.ts` was unchanged. Only this evidence paragraph was added after the source gate.

Browser pixel bounds, both complete story runs and deployed screenshots belong to the release coordinator; this implementation record makes no production/media claim. The separate opt-in database run and exact source hash comparison are recorded by that coordinator rather than counted among the ordinary suite passes.
