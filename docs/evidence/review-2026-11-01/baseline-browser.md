# Baseline production browser observations

These observations precede the PORTAL STAGE review changes. The older production app at https://portal-stage-eight.vercel.app was deployed from `a9fd9242ef69a9b6b5052168c9564e4d5e5e63be`; the local review base is `2994fc6e94dd0b2c919694cc4bb0b9ad3eb77bac`. The root used the in-app browser on 31 October 2026 UTC / 1 November local time.

## Conditions

The disposable show was **rehearsal** `ps_a7a1bbab7ce1f016`, using illustrated synthetic plates. No camera, microphone, LiveKit room, recording or broadcast was opened. No second performer or real audience vote is claimed. The baseline tab was closed after the observations.

## Landing

At an emulated 1440 × 757 viewport, DOM width and scroll width both measured 1440. The full-page screenshot retains the faint duplicate illustration label behind the question-card area described in S12. The override was cleared. `baseline-landing.jpg` is a full-page capture (1440 × 4167), not a claim that the browser viewport was that tall.

## Reload and offer timing

The browser created the rehearsal at 19:47:32 UTC and opened its curtain. The server recorded a synthetic A→B offer at 19:48:06.430, retaining owner A and transfer identity `ps_a7a1bbab7ce1f016-transfer-4`. The root inspected and captured the pending offer, then reloaded.

At the first check 11.439 seconds after reload, the offer was absent and the epoch was still 1. The server’s event shows normal offer expiry at 19:48:27.736. Because the original offer’s roughly 20-second lifetime had elapsed during inspection/reload, **this does not demonstrate that reload itself cancelled the offer**. A new immediate-reload acceptance must run within the lifetime and compare exact transfer identity.

Later, the server recorded synthetic plates restored and a new renderer epoch 2 at 19:49:07.849, explicitly under a holding curtain. The actual UI offered **Take your time / Resume scene**. This confirms delayed reload recovery into a hold in this observed baseline.

## End and reset

The root ended the rehearsal at 19:49:39.702 UTC. The immediate ended view offered Reset the scene. At 75.625 seconds after requesting end, this particular in-app observation showed no permanent reservation spinner and Reset was still available. Clicking it eventually succeeded: sequence 11, umbrella version 1, synthetic plates ready, phase hold with Resume scene.

Thus the S3 spinner report was **not reproduced in this run**; the later reset returned a held scene. The implementation’s clear ended/new-show exits still need direct acceptance after the fix. No stronger timing or cross-browser inference is made from this check.

## Retained artifacts

`baseline-rehearsal-sequence8.json` preserves the actual pre-reset UI export. Its scope explicitly states synthetic rehearsal rather than remote media or audience evidence. It contains no tokens, private invites, session credentials, camera footage or consent receipts. Original bytes remain unchanged.

Screenshots: `baseline-pending-offer.jpg`, `baseline-after-reload-early.jpg`, `baseline-ended-after-lease.jpg`, and `baseline-reset-after-end.jpg`. The early-reload screenshot must be read with the expiry confound above. Guest replacement, Program continuity, audio and hidden rendering were not exercised in this baseline run.
