# PORTAL STAGE

**Your room. An impossible visitor. A story your Twitch community helps write.**

PORTAL STAGE is a small live theater: people improvise, chat makes authored choices, and the same virtual prop travels between rooms. Play with a consenting guest, or perform solo opposite an illustrated **Audience Room**. The software handles stagecraft; no runtime language model controls the performance.

![Borrowed Weather in the simplified director’s studio](docs/evidence/ui-pass-2026-11-01/after-weather-studio.png)

_Current deployed illustrated rehearsal. Rehearsal and test-vote chips identify the source of the scene; no live camera or real audience is shown._

**[Open the live site](https://portal-stage-eight.vercel.app)** · [How it works](docs/architecture.md) · [Verification record](docs/evidence/README.md)

Revision 009 (3 November) is deployed from runtime `cda6c18`, with smooth local hand-follow and a corrected hand-model confidence adapter. **537 ordinary tests passed**, with seven opt-in Neon checks skipped, plus typecheck, formatting and the optimized build. The owner's recorded physical checks are summarized below. [Current release](docs/release-manifest.md).

The earlier round-3 release simplified the Studio, scenes and public pages; round 4 (2 November) made media and chat failures visible, removed idle caption text and marked Duet as invite-only. Round 4 passed 486 ordinary tests; the seven opt-in Neon checks last passed in round 3. Round 3 completed both stories in signed-out production with 80 layout observations and no overflow; round 4 was checked in signed-out production through the first rehearsal vote. [Implementation](docs/evidence/round-3-implementation.md) · [Browser evidence](docs/evidence/review-round3-2026-11-01/production-browser.md) · [Before/after UI](docs/evidence/ui-pass-2026-11-01/README.md).

The earlier round-2 private solo run used two owned Twitch accounts, exercised all six choice windows, and a **manual early End** closed its media on the first attempt. That real-camera evidence remains [historical](docs/evidence/round-2-release.md); the current single-owner recordings leave broader human-performance checks open.

## Try it in 60 seconds

1. Open Studio, choose **Borrowed Weather**, and **Start rehearsal**. No account or camera is required.
2. Open the curtain and weather choice. Cast a clearly labeled test ballot, close the choice, and let it rain.
3. Offer the patched umbrella, then select **Accept** to receive it as illustrated part B. Its new owner is committed before it crosses the portal.
4. Continue with the cue card: name the visitor, choose its mood, bring the umbrella home, and choose a shared shelter or playful chase.

Try **Midnight Parcel** for a different story: choose a pocket of stars or a midnight garden, stamp a tagged parcel, send it across, and change the receiving room. Its tag and handling marks survive the return; the final choice decides which room keeps the gift.

![Midnight Parcel in the current director’s studio](docs/evidence/ui-pass-2026-11-01/after-parcel-studio.png)

_Illustrated Midnight Parcel rehearsal; the full out-and-back prop journey and its final choice are recorded separately in the round-3 browser evidence._

**Camera & hand cues** is optional inside ordinary rehearsal. Give local preview consent, enable the camera, confirm framing, enable hand cues, and arm them. Your camera and landmarks stay in that browser; rehearsal requests no microphone or media room. Offer/Accept buttons remain available. Framing and dwell have automated tests, with limited single-owner physical observations described below.

The revision-009 release adds smooth local hand-follow, a 1.5-second tracking-loss grace, a return crossing that targets the receiving palm, and a quiet gold dwell ring in the director's stage. A defaults to **Left hand**, toward the portal; the selector remains available. Modern MediaPipe Tasks uses the subject's handedness for unmirrored pixels, so the implementation preserves those labels. The owner's 3 November recordings show closed-fist follow, a ten-second still-hand hold, three physical hand offers and two return catches across rehearsal and live solo. The final live catch lands in the palm and follows the subsequent lift. These observations use one owner's camera; broader accuracy trials remain pending. [Hand-cue behavior and verification](docs/gestures.md) preserves the initial failed attempts, observed outcomes and remaining checks.

## With real Twitch chat

Sign in with Twitch and create a **solo Twitch show**, subject to the displayed shared allowance. You prepare, consent, and admit your own camera. The illustrated Audience Room needs no guest invitation: chat's `!accept`/`!wait` choice receives the prop, and `!giveback`/`!keep` decides its return. You explicitly accept it back.

![The episode and mode picker, including Solo with chat](docs/evidence/ui-pass-2026-11-01/after-picker.png)

_Current signed-out mode picker. The earlier private solo acceptance used two real accounts controlled by one test operator; it remains separate from this illustrated UI check and is not independent audience or two-person performance evidence._

Both modes offer weather (`!gentle`/`!wild`), a fixed visitor name (`!pip1`/`!pip2`/`!pip3`), mood (`!curious`/`!shy`), and ending (`!share`/`!chase`) choices. Parcel uses `!stars`/`!garden` and `!deliver`/`!keep`. Bounded `!rain`, `!thunder`, and `!cheer` effects let chat stay present. Each account has one replaceable ballot per window. Empty or tied results wait for an explicit, labeled Director's choice.

The host browser relays Twitch EventSub messages in bounded batches; Twitch credentials stay on the server. This is an authenticated browser relay, not a signed webhook provenance claim. Public viewers stay on Twitch and receive no LiveKit token. The app does not post chat messages or start a broadcast.

Invited hosts can also create a two-performer show. Camera preview, broadcast consent, recording consent, readiness, and admission are separate. A receive-only Program view is intended for a separately verified OBS capture setup. Two humans on separate networks, microphones/echo, physical gesture alignment across people and devices, and actual OBS capture remain distinct checks. A minimized/covered director window and guest replacement while OBS keeps playing also remain unverified. The single-owner recordings establish no general gesture success rate. Real Twitch presence commands were ingested; the brief thunder/rain animations still need a dedicated visual check separate from the story’s weather.

## Run locally

Use **Node.js 22.x**. Fonts, original stage art, and the hand-landmark runtime are bundled; no model API key is needed.

```sh
npm ci
npm run setup
npm run dev
```

Open [localhost:3200](http://localhost:3200). Rehearsal works with the local atomic file store. Real solo requires PostgreSQL, Twitch, LiveKit, and a confirmed durable expiry workflow. Default solo limits are three starts per account per UTC day, thirty globally, five concurrent reservations, and twenty minutes per session. A failed start returns its daily allowance when no media access has been claimed. Once media access has been claimed, the reservation closes through the media service; an ordinary early End still counts as a used session. Local camera rehearsal does not consume a solo media allowance. The current judging deployment raises the global limits to **100 daily and 10 concurrent**, while retaining three per account and the twenty-minute deadline.

```sh
npm run typecheck
npm test
npm run format:check
npm run build
```

Stop the dev server before building, or use an isolated copy with its own `.next`. [Setup](docs/setup.md) covers providers, Workflow, limits, private guest invitations, output pairing, and labeled local transport QA. [Media](docs/media.md), [gestures](docs/gestures.md), [privacy](docs/privacy.md), and [rights](docs/rights.md) describe the boundaries.

## Built with Codex

Codex helped implement and review the ownership protocol, exact-page fencing, private media routing, first-frame recovery, local camera cancellation, audience grammar, and durable solo closure. The [development record](docs/evidence/codex.md) links concrete source and tests. Project implementation session: **01a191d6-551a-7cd2-9cd8-30611a7ee60b**. The Codex app thread reader confirmed this real implementation history on 1 November 2026. The coordinating conversation **01a190da-3cee-7a10-b7c1-e0cdbb379510** is recorded separately.

The [evidence ledger](docs/evidence/README.md) preserves source, conditions, actual counts, and pending checks. Private plans, credentials, consent receipts, and camera recordings stay out of Git. The repository contains the operating documentation and permitted assets needed for a fresh clone.

[MIT license](LICENSE) · [Asset and dependency rights](docs/rights.md)
