# Review implementation checkpoints

This record covers the PORTAL STAGE changes requested in `projects_review.md`. Browser and real-service observations belong to the release owner in `review-2026-11-01/`. Automated fixtures do not establish two remote human performers, microphone quality, or an OBS broadcast.

## Baseline

- Clean `main` at `2994fc6`; work branch `review/portal-improvements`.
- `npm run typecheck`: passed.
- `npm test -- --reporter=dot`: 184 passed, 3 opt-in PostgreSQL tests skipped; 20 files passed, 1 skipped; runner duration 1.54 seconds.
- `npm run format:check`: passed.
- `npm run build`: passed, 16 pages generated; no development server was active.
- Existing production observations remain tied to their recorded source/deployment.

## Reliability checkpoint

Implemented session-storage renderer identity with per-mount fencing, ended-show exits, independent guest/output access, explicit Program rejection/authority states, hidden-page warnings and bounded drawing cadence, and landing label overlap. The mount fence covers cues, renewal/unload, token grants, connected Program/return tracks, and disposable hand anchors. Safety withdrawal and unready controls remain usable after authority loss. Guest replacement preserves a valid Program pairing; explicit output revocation removes it.

Automated checkpoint, before later audience/solo work:

- `npm run typecheck`: passed.
- `npm test -- --reporter=dot`: 220 passed, 4 opt-in PostgreSQL tests skipped; 24 files passed, 1 skipped; runner duration 1.64 seconds.
- `npm run format:check` and `git diff --check`: passed.
- `npm run build`: passed, 16 pages generated, with no active development server.
- Browser, actual PostgreSQL renewal, and real-service revocation acceptance for this checkpoint are pending the release owner's separate observations. Local self-hosted media cannot establish LiveKit Cloud token revocation behavior.

The visibility fallback requests eight frames per second while hidden; browser or operating-system suspension can still pause a client compositor. It is not a guaranteed background renderer.

## External acceptance

Two consenting remote humans on separate networks, real microphones and echo checks, and an authorized OBS broadcast remain physical acceptance tasks. A second Twitch account alone is not a second human or network. Private camera tests, genuine chat events, local-only rehearsal capture, synthetic burst tests, and browser tests must each retain their actual conditions.
