# Ordinary second-account solo acceptance

On 1 November 2026, the root browser reviewer completed fresh PORTAL Twitch OAuth as `yadneshsalvi96` on the final production deployment. This switched the Twitch identity in an existing application browser session. It was not an independent browser, a second remote human, or a media test.

| Provenance            | Value                                      |
| --------------------- | ------------------------------------------ |
| Application           | `https://portal-stage-eight.vercel.app`    |
| Deployed source       | `96fea8781dd86bf23a95126247b1e703b8babde9` |
| Latest runtime change | `16b11003dd066424f30e93dc2c04dfaccb3e072e` |
| Deployment            | `dpl_mUKo1r1j3ojraoWWmKWgToPeGCp5`         |
| Solo show             | `ps_3f611bff54420820`                      |

## Observed flow

The production lobby showed **3 of 3** solo starts remaining and **Create a solo Twitch show**. The duet entry instead showed **Invited duet host sign-in**. The read-only observer found the owner authenticated as `yadneshsalvi96` and outside the configured local host allowlist. This is corroborated by the production duet UI; no production `/api/session` flags were captured or inferred.

One solo creation succeeded. At `2026-11-01T03:53:28.407Z`, the durable record was `solo` / `backstage`, with a confirmed Workflow receipt, active quota, one daily start charged, and **zero issued media grants**. Its immutable deadline was `2026-11-01T04:12:00.980Z`, exactly twenty minutes after creation. Camera, microphone, readiness and admission were all false. The root reviewer connected Twitch and observed **Listening**; the durable `twitch.connected` event was sequence 3. No public message was sent, and there was no round, ballot or presence effect.

The reviewer chose **End show** and confirmed once. The follow-up observation at `2026-11-01T03:53:55.102Z` showed `phase: ended`, reservation `closed`, active quota removed, and zero issued media grants. The daily count remained one; the deadline was unchanged. The lobby then showed **2 of 3** starts remaining and **Create a solo Twitch show** available again. No cleanup retry was needed for this unissued reservation.

## Evidence and limits

[Structured evidence](second-account-acceptance.json) combines the two sanitized SELECT observations with the root reviewer's UI observations. Each database read ran in a read-only transaction against the explicitly named show; it did not invoke app actions or provider cleanup. The stored allowlist result is derived from local configuration, not a separately captured production API response. The original observer outputs remain ignored; their SHA-256 hashes are included for provenance.

This verifies fresh ordinary-account OAuth, public solo entry, confirmed scheduling, one quota charge, Twitch subscription setup, and early End with capacity released. It does not establish chat-message delivery by this account, moderator behavior, independent audience participation, camera/microphone operation, a complete live scene, separate-network performers, or OBS capture. The earlier physical-camera and twenty-minute expiry observations retain their own source and conditions.

No tokens, credential records, owner/session/account IDs, invitation codes, subscription/notification IDs, consent receipts, raw chat, contributor names, private media or free-text event records are included. The requested public login and show ID are retained. This evidence-only update changes no application code or deployment.
