# Reliability browser acceptance

This is observed evidence, not the implementation plan. The original production observations are retained in [baseline-browser.md](baseline-browser.md).

## Frozen version and conditions

- Source: `2de2871c5c18ba55680742ca9778270189db65c9`.
- Optimized Next build: `GsihmIdXNrYGGY2ZmNMnZ`; source, build and dependencies copied before subsequent feature changes.
- Director: Codex in-app browser, `http://127.0.0.1:3201`.
- Actual configured Neon Postgres. No fake successful database responses.
- Initial checks use labeled illustrated rehearsal, with no cameras, microphone, media rooms, Twitch messages or broadcast.
- Implementation gates: 220 tests passed, four optional Postgres tests skipped; typecheck, formatting, diff check and optimized build passed.
- Root independently enabled the optional Postgres suite: **four passed, zero failed**, 16.52 seconds total runner duration. Tests create and clean up randomly named fixture rows. This includes atomic renewal against concurrent state changes and rejection of old/released renderer mounts.

Machine-readable observations: [p0-reliability-results.json](p0-reliability-results.json).

## Reload during a pending offer — passed

Rehearsal `ps_400c69367856642c` began at epoch 1. The director opened the curtain, offered the umbrella A → B, promptly reloaded the same tab, and accepted as the synthetic B performer.

- The original transfer `ps_400c69367856642c-transfer-4` was offered at `2026-10-31T20:34:12.169Z`, committed at `20:34:18.505Z`, then arrived at `20:34:20.316Z`.
- The owner became B; epoch remained 1 and the page incarnation advanced from 1 to 2.
- The retained event sequence is creation → renderer acquisition → start → offer → accept → arrival. No hold, cancellation or second renderer acquisition occurred during the reload.
- Offer-to-commit was 6.336 seconds, within the original 20-second offer lifetime. This single test is not a latency benchmark.
- The first observation, 572 ms after reload began, briefly showed an authority-recovery notice with the offer intact. That measured initial DOM visibility, **not** control readiness. The button subsequently became usable and the acceptance completed without takeover or developer intervention. The brief misleading “does not control the stage” wording was reported for a later UI improvement.

[Initial post-reload observation](p0-offer-after-reload.jpg) · [Accepted handoff](p0-offer-accepted-after-reload.jpg).

## Ended-show recovery — passed

The same rehearsal ended normally. The studio showed “Show ended”, “New rehearsal”, and “New show” immediately and **74.176 seconds after the ended UI was first observed**, beyond the old renderer lease duration. There was no reservation spinner. Clicking New rehearsal created `ps_279d1dd64d8c977a`; its curtain control became enabled normally.

At a 390-pixel viewport, document width and scroll width were both 390 pixels and New rehearsal remained enabled. The temporary viewport override was cleared.

[Immediate end](p0-ended-immediate.jpg) · [After lease expiry](p0-ended-after-lease.jpg) · [390-pixel layout](p0-ended-mobile.jpg).

## Landing overlap — passed

The 1440 × 757 viewport screenshot no longer shows the illustrated-rehearsal label behind the weather question. The synthetic label remains visible at the top of the preview. The viewport override was cleared. [Full page](p0-landing.jpg).

## Guest replacement and independent Program — passed locally

The next rehearsal uses an actual local LiveKit SFU with signaling bound to `127.0.0.1:7880` and media UDP bound to `127.0.0.1:7882`; media TCP fallback is disabled. Credentials are generated privately and are not in evidence. A separate guest hostname and separate Chrome Program profile isolate browser sessions. All transmitted pixels are explicitly labeled synthetic; no camera or microphone is enabled.

The independent Program pairing check found that the local synthetic transport panel hid the pairing controls. The two-condition UI correction is commit `840604568ae50da47e1f383508e51e21ba83d32b`, built separately as `d2HUFhgM40AwI_gW3ucds`. Root reran all four gates on this copy: 220 tests passed, four optional database cases skipped, typecheck, formatting and optimized build passed. Public illustrated rehearsal remains preview-only.

After explicitly stopping the earlier synthetic tracks, both local servers switched to that optimized build and the browser pages reloaded. Director and guest explicitly enabled synthetic tracks again and completed readiness/admission. The independent Chrome Program browser redeemed the UI's one-time pairing code; it had no director session for this show.

In rehearsal `ps_279d1dd64d8c977a`:

1. Both synthetic camera tracks were visible in the composed Program stream.
2. The original guest's in-app-browser window closed.
3. The director used **Replace guest and re-invite**.
4. A different Chrome browser session redeemed the fresh invitation and completed fresh consent, framing, connection, readiness and admission.
5. The existing Program browser remained paired throughout. Its one 1920 × 1080 video decoder advanced from 47.730210 to 167.896724 seconds across five observations spanning 120.167 seconds. Every sample was unpaused with readyState 4. These discrete observations do not establish zero dropped frames or a latency guarantee.
6. The server's guest-session fingerprint changed, invitation generation advanced 1 → 2, while output generation stayed 1, issued Program viewer count stayed 1, and show epoch stayed 1. The fingerprint itself is not included in public evidence.
7. Reopening the original guest session showed **The stage door is closed**, without a media preview.

No Program refresh, new pairing code or reconnection was performed during guest replacement. [Before replacement](p0-program-before-replacement.jpg), [during replacement](p0-program-during-replacement.jpg), [replacement admitted](p0-program-after-replacement.jpg), [old guest rejected](p0-old-guest-rejected.jpg).

## Explicit output unpair — passed locally

The director then selected **Unpair all Program outputs**. The actual SFU lost only its Program viewer; the director, replacement guest, and separate Program publisher remained connected. Output generation advanced to 2 while invitation generation stayed 2. The Program browser removed its video element and showed a clear instruction to obtain a new code. This was observed 7.388 seconds after the button action, not continuously timed as a response-latency measurement. [Unpaired view](p0-program-explicitly-unpaired.jpg).

The SFU has a composed audio track, but no real microphone was enabled. This is not an audio quality, echo, or microphone-routing acceptance claim. The synthetic show was ended after these checks; director and guest decoders were removed and tracks stopped. A further UX issue was reported: the guest's ended page still offered device/join controls, although the controller correctly refused an ended show, and a disconnect hint suggested reconnecting. That correction is pending and must not be confused with a capture leak.

Hidden-window and duplicated-director browser checks remain pending in this document.

This local setup does not prove LiveKit Cloud token revocation, two human performers, separate networks, microphone quality, or OBS/Twitch broadcast compatibility.
