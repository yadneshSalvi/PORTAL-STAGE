# Round-2 optimized local browser checks

Observed on 1 November 2026 in the in-app browser at `http://localhost:3200`. Runtime source `1c8cdd44630b39e3e34ac68766d088cee9807e87` passed 435 ordinary tests (7 optional database cases skipped), typecheck, formatting and an 18-page optimized build (`0k8g9WxFnyEzPBuKJxMcI`). All 7 actual Neon cases passed separately, with 12 relevant source/test hashes unchanged during that run; see [database evidence](neon-checks.json).

## Complete illustrated stories

These are labeled synthetic rehearsals, with no real camera, audience or media-room claim.

- **Borrowed Weather**, show `ps_e3e037dcac8089cd`: wild weather → both receiver-accepted umbrella crossings → Sprig → curious mood → shared shelter. The exported record at sequence 27 has owner A, prop version 6, the same coral patch and 52% wetness. The browser then ended the show at sequence 28. [Actual exported state](local-weather-record.json), [on-stage tally](local-weather-tally.jpg), [shared shelter](local-weather-shelter.jpg).
- **Midnight Parcel**, show `ps_2a2437e2fd310026`: stars → stamp → accepted outbound crossing → constellation in room B → return → Leave the gift → completed delivery. During an operator pause, the first return offer expired without changing ownership; the app refused the stale accept and a fresh offer/accept succeeded. The final record at sequence 22 has the same tag `MP-FD310026`, 48% handling marks, owner A/version 9 and stars remaining in room B. The browser then ended the show at sequence 23. [Actual exported state](local-parcel-record.json), [constellation reveal](local-parcel-stars.jpg), [completed delivery](local-parcel-delivered.jpg).

Both endings exposed fresh-show navigation, closed their controls, and reported media/chat closed. Browser warning/error collection was empty. The expired invitation is preserved in the parcel event record, not removed from the walkthrough.

## Responsive controls and follow-up correction

For both episodes, widths 1280, 1440, 1920 and 390 had document width equal to viewport width. The camera button's scroll width equaled its client width, and its label and icon remained inside its bounds: [Weather measurements](responsive-widths.json), [Parcel measurements](responsive-parcel.json), [mobile screenshot](local-mobile.jpg).

Visual inspection additionally found the final desktop story-progress label clipped because its flex basis resolved to zero. A single CSS correction reserves its natural width while preserving the existing equal-width mobile override. Final runtime source `36d3182` again passed 435 tests (7 optional skips), typecheck, formatting, diff check and an 18-page optimized build (`-iU6lkbQ7bzzuyamjWIuN`). There was no Next environment declaration drift. [Parcel measurements](final-progress-layout.json) and [Weather measurements](final-weather-progress-layout.json) show no story-progress or camera-button overflow at all four widths. Backend code and the captured Neon hashes are unchanged by this CSS-only follow-up.

The README stage images are explicitly cropped from the full rehearsal screenshots to focus on the illustrated stage. They contain no camera recordings or real-audience claim. Full originals and actual state exports remain linked above.

## Scope

These checks do not establish physical hand recognition, two remote humans/microphones, actual OBS capture or a genuinely hidden director window. Production real-account and media-closure acceptance is recorded separately after deployment.
