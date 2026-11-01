# Current release manifest

PORTAL STAGE is deployed at [portal-stage-eight.vercel.app](https://portal-stage-eight.vercel.app) from runtime commit `5f93e82a61081fc47b6abe48e0b83efd21c56d97`, Vercel deployment `dpl_CAwjf3ExGDdwryRJBjPLZa54ED3K` (Ready, 2 November 2026). Later documentation commits leave that runtime unchanged.

Round 4: 486 ordinary tests, typecheck, formatting and the optimized build passed; the seven opt-in Neon integration checks were skipped this round (they last passed in round 3). Local development visual checks covered the mode cards, camera label, idle caption, cue card and hidden-window warning. A signed-out production check after deployment covered the studio picker and a Borrowed Weather rehearsal through the first audience vote; Vercel reported no runtime errors in the first hour. The 80-observation UI audit with no overflow is from round 3, before the round-4 layout tweaks.

[Release details and remaining acceptance](evidence/release.md) · [Round-3 machine-readable manifest and artifact hashes](evidence/release-manifest.json) · [Production browser report](evidence/review-round3-2026-11-01/production-browser.md) · [Before/after UI evidence](evidence/ui-pass-2026-11-01/README.md).
