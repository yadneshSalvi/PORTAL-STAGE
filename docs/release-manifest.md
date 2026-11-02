# Current release manifest

PORTAL STAGE is deployed at [portal-stage-eight.vercel.app](https://portal-stage-eight.vercel.app) from runtime commit `ec2af18a34b6059c7980ef606e3f6ef207d44ac2`, Vercel deployment `dpl_EVyyLCkyGdPtY2ocTwz2z8FYwUBS` (Ready, 3 November 2026). Later documentation commits leave that runtime unchanged.

The revision-009 hand-presentation release passed **528 ordinary tests**, with seven opt-in Neon integration checks skipped, plus typecheck, repository formatting and the optimized build. No existing behavior assertion was weakened; new cases cover local sample freshness, loss grace, smoothing/recovery, palm targeting, handedness/defaults, cue feedback and clean capture ordering. The rehearsal component fixture gained the new gesture-state fields.

Local browser checks covered a rehearsal weather vote, button-driven offer/accept and a completed crossing, and the Left hand default with the camera off. A separate signed-out Chrome session completed the deployed Borrowed Weather rehearsal through the first test vote and applied rain. Fresh requests without cookies or authentication returned HTTP 200 for `/`, `/studio` and `/guide`. The deployment-specific initial error scan returned zero rows. These are limited smoke checks, not physical gesture validation.

Physical left-hand recognition, ten-second still-hand hold, handoff/catch accuracy and concurrent camera/capture load remain unmeasured until the owner's dry run. Solo allowance remains three starts per account per UTC day; no capacity settings changed. [Implemented behavior and pending checks](gestures.md).

Earlier round 4 passed 486 ordinary tests and the seven opt-in Neon checks last passed in round 3. The 80-observation UI audit with no overflow also belongs to round 3. The prior round-4 deployment `dpl_CAwjf3ExGDdwryRJBjPLZa54ED3K` remains the rollback target.

[Release details and remaining acceptance](evidence/release.md) · [Round-3 machine-readable manifest and artifact hashes](evidence/release-manifest.json) · [Production browser report](evidence/review-round3-2026-11-01/production-browser.md) · [Before/after UI evidence](evidence/ui-pass-2026-11-01/README.md).
