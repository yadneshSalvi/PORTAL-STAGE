# PORTAL STAGE

**Different rooms. One live stage. Your community directs the impossible.**

PORTAL STAGE is a small, authored theater for two consenting remote performers. In _Borrowed Weather_, Twitch viewers choose `!gentle` or `!wild`. A coral-patched virtual umbrella passes between the performers through an offer/accept handshake. Its runoff hatches Pip, an original creature whose behavior follows the chosen weather—and the same moving shelter.

The software provides the stagecraft. The people provide the performance. There is no runtime LLM on the handoff path.

## Try it

The landing page and **Start a rehearsal** require no Twitch account, camera, microphone, or paid account. Rehearsal uses clearly labeled synthetic plates and test ballots. It demonstrates the real saved show protocol and authored effects; it is not evidence of two remote humans or genuine Twitch participation.

**Live at [portal-stage-eight.vercel.app](https://portal-stage-eight.vercel.app).** The complete public rehearsal, production Twitch sign-in, and EventSub connection are verified. Cloud browser media and physical devices remain to be checked. The [release record](docs/evidence/release.md) identifies the deployed source and remaining verification.

For a live show, an invited host connects Twitch, creates a show, invites a second performer backstage, and acquires the canonical renderer. Device preview, broadcast consent, recording consent, readiness, and director admission are separate steps. Viewers remain on Twitch. They do not join the private media room.

## Run locally

Use **Node.js 22.x**. The app bundles its fonts, original art, and local hand-landmark runtime; no model key is needed.

```sh
npm ci
npm run setup
# For live media/Twitch, add the values described in docs/setup.md.
npm run dev
```

Open [localhost:3200](http://localhost:3200). A real `DATABASE_URL` uses PostgreSQL. Without one, development uses an atomic file store in ignored `.local/store/`; production refuses to fall back to process memory or local files. Session signing is required in both environments.

```sh
npm run typecheck
npm test
npm run build
```

Stop the dev server before a production build, or build an isolated copy with its own `.next` directory. [Setup and role walkthrough](docs/setup.md) explains Neon, Twitch callbacks, LiveKit, local synthetic transport tests, and output pairing.

## What is implemented

- One director-owned Three.js/WebGL stage, two camera apertures, an original umbrella/iris/creature scene, and a receive-only Program view.
- Persistent umbrella identity, repair patch, wetness, owner/version, explicit offer/accept/decline/expiry, idempotent commands, and explicit recall.
- Creator-only LiveKit transport, a video-only backstage return, direct call audio, and a separate composed-output room with an on-air audio mix.
- Twitch OAuth and EventSub chat intake, one current ballot per account per round, duplicate/late rejection, and visible Director's choice fallback. The app does not send chat messages.
- Saved authored variations, cue deck, button/keyboard parity, calibrated local hand landmarks, emergency curtain, and reconnect/admission controls.

See [architecture](docs/architecture.md), [media](docs/media.md), [gestures](docs/gestures.md), [privacy and consent](docs/privacy.md), and [asset rights](docs/rights.md). Automated checks and labeled transport rehearsal do not establish real remote-human performance, measured latency, gesture accuracy, or OBS compatibility; the [evidence ledger](docs/evidence/README.md) distinguishes those claims.

## Verified so far

- 183 automated tests pass, including camera request cancellation and the final no-hand status. Three opt-in Neon integration tests passed separately. Typecheck, authored-file formatting, and the optimized production build pass.
- An actual two-session local LiveKit walkthrough completed both accepted transfers, hatching, shelter, emergency hold, disconnect/reconnect, fresh admission, resume, and end. Its moving video plates are explicitly synthetic.
- A fresh optimized browser regression showed both cameras on the first curtain without opening a preview. Decoder playback survived preview open/close and guest reconnect; the source-reset failure is covered by an installed-SDK regression.
- The production rehearsal completed a labeled wild test ballot, both crossings, hatch, and shelter with the same umbrella at version 6 and 52% wetness. Production Twitch OAuth and EventSub listening also passed.
- PORTAL's public command-to-ballot check, browser-to-cloud media, physical camera/microphone checks, remote-human performance, and OBS capture remain pending.

The [check record](docs/evidence/checks.md) and [browser record](docs/evidence/browser/2026-10-31-local.md) give the conditions and evidence behind these results.

## Codex and source

The main development conversation is **01a190da-3cee-7a10-b7c1-e0cdbb379510**. The [Codex evidence record](docs/evidence/codex.md) identifies the implementation lead and worker contributions, concrete failure/fix stories, and real check output. This product's media theater and authored performance protocol are distinct from LIVEFORGE; shared infrastructure is disclosed there.

Private planning documents, credentials, device recordings, and personal consent receipts are intentionally excluded from Git. A fresh clone has the tracked operating documentation and permitted assets; it does not need the ignored planning folder.
