# Round 2 implementation checkpoint — 1 November 2026

This record covers the implementation work requested in `projects_review2.md`, starting from clean `main` at `025ee67bf42d2d25d81303284323d7b7f13bcec0` on `review/round-2`. It records code and automated checks. The release coordinator separately owns actual browser, Twitch, database, deployment and physical-media observations.

## Baseline before edits

Port 3200 had no listening server. The complete baseline passed before source changes:

| Gate                   | Observed result                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run typecheck`    | Passed                                                                                             |
| `npm test`             | 370 passed, 7 opt-in database tests skipped; 35 files passed, 2 skipped; 1.54 s reported by Vitest |
| `npm run format:check` | Passed                                                                                             |
| `npm run build`        | Passed; 18 pages generated, 18 Workflow steps and 1 workflow; build ID `THpDLVBTIIJ9ygc7-nv0Q`     |

The build did not change `next-env.d.ts`.

## Final local validation

The independent recheck passed with no remaining actionable findings in the audited refund, token, recovery, provider-error and closure boundaries. Its final four targeted regressions passed. Source was then frozen, with no server listening on port 3200, before the complete validation command:

```sh
npm run typecheck && npm test && npm run format:check && npm run build
```

| Gate                   | Observed result                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run typecheck`    | Passed                                                                                             |
| `npm test`             | 435 passed, 7 opt-in database tests skipped; 36 files passed, 2 skipped; 1.68 s reported by Vitest |
| `npm run format:check` | Passed                                                                                             |
| `npm run build`        | Passed; 18 pages generated, 18 Workflow steps and 1 workflow; build ID `0k8g9WxFnyEzPBuKJxMcI`     |
| Working diff           | `git diff --check` passed; no `next-env.d.ts` drift                                                |

The separately authorized database run uses `PORTAL_TEST_DATABASE_URL` and `npx vitest run tests/postgres-lease.test.ts tests/postgres-audience-solo.test.ts`. Its results and exact source hashes belong to the release coordinator's actual-provider evidence. The seven skips above are not reported as passed tests. Only this documentation received the final gate results after source freeze.

## Audience handling — PS-1 and PS-2

Presence effects now retain a separate ring of the latest 500 message IDs. Vote delivery IDs reset when a new choice window opens; the current round retains its 5,000-delivery and 2,000-voter limits. Legacy records hydrate the effect ring from the old tail, while timestamp, monotonic order, cooldown and global presentation limits remain in force.

Each envelope is parsed within its own error boundary inside the durable batch mutation. Recognized invalid/stale/old-subscription messages, vote/round capacity errors and the per-event rate limit count as ignored. Valid items remain ordered by Twitch's fractional timestamp. Origin, session, director, exact renderer incarnation, lease, subscription-change and connection-health failures reject the whole request. Single-event calls retain strict errors.

Regression coverage includes:

- 6,000 labeled fixture effects at the allowed cadence, followed by a counted vote; the effect ring stays at 500.
- A full prior vote budget resets at the next round; old timestamps and redelivered effects stay rejected.
- The actual POST handler receives one stale envelope plus 19 valid votes and returns HTTP 200 with `{ counted: 19, ignored: 1 }`; redelivery adds no votes.
- An old subscription, malformed envelope, invalid identity or wrong channel cannot discard a valid neighbor.
- A new voter rejected at round capacity cannot discard an existing voter's replacement. A full vote-delivery budget does not block a presence effect.
- At 2,999 accepted events, a two-item batch keeps its final allowed vote and ignores the excess event. A single excess event still receives HTTP 429.
- Request authority and load-to-commit lease/subscription/connection races remain fatal for the complete batch.

These are synthetic fixtures, including the 6,000-effect run. They do not establish observed Twitch traffic volume or end-to-end performance.

## Solo lifecycle — PS-3, PS-4 and PS-7

The quota document now arbitrates first media claims and failed-start refunds in addition to admission. A refund fences late scheduling and token claims, checks the current show, then removes its reservation and decrements the original UTC day's account/global counters in one mutation. Repeating the refund cannot charge another day or subtract twice. A media claim that wins first retains its charge. Normal manual End, including an unissued show, is not a failed start and remains charged. A shared quota module keeps these boundaries free of a policy/closure import cycle.

Start and allowance requests recover unconfirmed abandoned starts after sixty seconds and confirmed reservations at least two minutes past expiry. Recovery invokes the same closure used by End and the Workflow. Each lazy pass selects at most two candidates, uses a shared thirty-second cooldown, and prioritizes the least recently attempted. Provider work has a ten-second budget and two-second request timeouts; an in-flight batch and database operations are still awaited. A deferred or failed issued-media cleanup keeps capacity reserved. The lobby distinguishes a pending closure from a healthy active reservation.

Closure logs participant removal, room deletion, quota release and final state, including issued identity, room, attempt and outcome where relevant. Logs exclude raw provider messages and tokens. Each failed operation gets one retry after 200 ms. Missing-resource errors are accepted for both removal and deletion; explicit authentication/configuration failures remain errors. Other failures preserve a sanitized step on the show. Quota release precedes publishing the closed state, so a failed release leaves the Retry action available. The End API returns the refreshed closure result.

The Workflow makes at most five cleanup passes with four thirty-second waits; its implicit step retries are disabled. A stale reservation/generation reports stale rather than claiming it closed a replacement. Application grants refuse at the deadline. Revoking established provider-managed refreshes still depends on successful participant removal.

The independent Sol audit reproduced four additional cases with actual source and in-memory/provider mocks: an overlapping failed closer overwriting successful closure; an explicit authentication error misclassified through its message text; an ended unconfirmed orphan retaining capacity; and a maximum 128-identity ledger restarting each limited recovery pass without finishing. The repairs add a successful closure receipt, give explicit error codes/status precedence over message text, route ended unconfirmed shows through charged normal closure, and persist monotonic cleanup progress after successful batches. A later bounded pass resumes the immutable issued ledger without repeating all earlier work. These are deterministic failure fixtures, not observations from LiveKit or a live audience.

The revised focused suite passed 63 tests: 59 reservation cases and four Workflow cases. In its maximum-ledger regression, one-second provider waves leave the first bounded pass at post-deletion identity 16. The next pass handles only the remaining 112 identities, completing 256 total removals and two room deletions before releasing capacity. Separate cases exercise an older failed closer after a successful receipt, a legacy closed record whose quota release fails, and overlapping progress updates while quota release is unavailable. The independent recheck also reproduced a sequential duplicate that reopened completed closure after a redundant quota update failed. Its regression now requires idempotent success from the existing receipt, with no renewed provider work or Retry state.

Fault-injection and race coverage includes original-day/idempotent refunds, setup failure before show creation, failure after quota confirmation, late scheduler receipts, both winners of the refund/media-claim race, manual End racing a refund, shared refund fences, a legacy issued ledger under a refund fence, missed confirmed expiry followed by a new start, legacy confirmed records, post-deadline application grants, provider missing-resource shapes, retry/backoff, provider failure retaining capacity, quota-release failure, deferred cleanup, recovery fairness, and the bounded Workflow. None of these fixtures contacts LiveKit or establishes its physical disconnect timing.

## Studio controls — PS-4 and PS-5

The local rehearsal camera button now says **Try camera & hand cues**, allows its label to wrap, and keeps its fixed-size icon inside the button. The in-app guide and setup/gesture documentation use the same label. The existing local consent, no-upload path and Offer/Accept button fallback are unchanged.

The ended solo card renders the server's sanitized failed closure step. During an explicit retry it disables the retry control and announces that cleanup is running; a closed reservation no longer shows the error or Retry action. The component regression exercises all three states. The focused studio/local-camera suite passed 11 tests, followed by typecheck.

Actual button/span/icon bounds at 1280, 1440, 1920 pixels and mobile belong to the release coordinator's browser checks. Static markup tests do not establish pixel layout.

## Source paths and acceptance limits

All ten repository targets on `/how-built` exist locally: its four source/test pairs and the development/release evidence links. This check does not establish signed-out GitHub access; publication, licensing and remote link checks are separate release actions.

The integration work uses mocked provider failures and deterministic race hooks. Application grant refusal after a deadline is distinct from LiveKit-managed connected-client refresh. Real early closure, refreshed-token revocation, hidden-window Program output, physical hand cues, two people on separate networks and an OBS broadcast require their own observed evidence. No synthetic camera or test ballot is presented as a real performer or Twitch audience.
