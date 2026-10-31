# Setup and a complete performance

Use Node.js 22.x, a current Chromium browser with WebGL/WebRTC, and headphones for live performers. Run `npm ci`, `npm run setup`, then `npm run dev`. Open localhost:3200. Setup generates random local session/encryption keys without printing them and preserves configured values. The free solo rehearsal needs no provider account or camera permission.

## Configuration

| Variable                                               | Purpose                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `APP_BASE_URL`                                         | Exact origin used for cookies, same-origin mutation checks, and invitations |
| `SESSION_SECRET`                                       | At least 32 random characters; signs HttpOnly browser/output sessions       |
| `TOKEN_ENCRYPTION_KEY`                                 | Exactly 64 hex characters; AES-256-GCM encryption of Twitch grants          |
| `DATABASE_URL`                                         | PostgreSQL/Neon connection; required in production                          |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`             | Twitch application credentials kept server-side                             |
| `TWITCH_REDIRECT_URI`                                  | Exact registered `/auth/twitch/callback` URL on this origin                 |
| `TWITCH_ALLOWED_HOSTS`                                 | Comma-separated invited Twitch login names or user IDs                      |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Private media transport credentials; secure WSS in production               |

Register `http://localhost:3200/auth/twitch/callback` for development and the exact deployed callback for production. OAuth asks only for `user:read:chat`. A fresh authorization-code grant is encrypted in the database. Copied bootstrap credentials are never silently refreshed or used as a deployed host identity.

Vercel runs the bounded control API. LiveKit runs the media transport; the director browser renders the show. Redis, Blob storage, and model-provider credentials are not required. Production refuses ephemeral storage. Set the Vercel Node runtime to **22.x**. Keep `.env*`, `.local/`, `.vercel/`, recordings, and `plans/` out of deployment/source uploads.

## Solo rehearsal

Choose **Start a rehearsal**, then follow the next cue: open the curtain, open the weather choice, cast an explicitly labeled test ballot, close/apply the weather, offer, accept, hatch, return the umbrella, and shelter. A later choice from the same fixture replaces its earlier ballot. Empty rounds visibly use Director's choice. Save a variation, load it, and start a new episode to see its configured rules.

The stage uses original generated test plates and test votes. Neither is presented as remote people or actual Twitch participation. A prompt same-tab reload preserves its cue and offers still within their original expiry. Genuine lease expiry shows recovery under a holding curtain. Ended shows offer New rehearsal and New show, even after the old lease expires.

## Two consenting performers

1. Connect the invited host's Twitch account and create a live show. Keep this director tab open; it owns a renewable renderer lease.
2. Send a private invitation to the second performer. Invitations expire after 15 minutes and exchange for a signed browser session. Use a separate browser/profile for the guest.
3. Enable camera/microphone only through explicit buttons. Preview is local before connecting. Broadcast consent and optional recording permission are separate. Camera-only performance is supported.
4. Calibrate the shelter, connect backstage, mark Ready, and let the director admit each performer. Reconnection requires readiness/admission again; microphones return muted.
5. Raise the curtain. Connect chat and open a generous weather window. Viewers send `!gentle` or `!wild`; later choices replace earlier ones until close. A host override is explicitly labeled Director's choice.
6. The holder offers the umbrella; the actual receiver accepts. Acceptance commits the new owner before the full crossing begins. Hatch Pip, improvise, transfer again, and shelter.
7. End the show to unpublish media, revoke invitations/output pairing, and close the round. Saving a preset does not record media.

## Output and audio

Keep the director renderer open and visible on the performance computer. Browsers may throttle hidden or minimized canvases; verify actual output before broadcasting. A guest or Program page does not take over rendering. Program subscribes to a separate output room carrying only composed video and the on-air audio mix. Pair another browser/OBS view using a one-time output code; it expires after 5 minutes and yields a read-only two-hour cookie. Host credentials and media tokens never go in the Program URL.

Use a dedicated, uncovered Chrome window for the director. A hidden-document warning accompanies a requested 8-frame-per-second drawing cadence; that is a bound requested by the app, not protection against browser or operating-system suspension. Visibility changes wake lease renewal. Chrome documents suspended animation frames and throttled timers in its [timer policy](https://developer.chrome.com/blog/timer-throttling-in-chrome-88). The optional controlled-test launch flag `--disable-backgrounding-occluded-windows` is defined in [Chromium source](https://chromium.googlesource.com/chromium/src/+/HEAD/content/public/common/content_switches.cc). It is a testing switch, not a replacement for checking the actual browser, OS, and capture route. Scheduler tests do not establish covered-window or OBS reliability.

If a guest loses their browser session, use **Replace guest and re-invite**. The former guest loses access, a fresh invitation is created, and Program remains paired. **Unpair all Program outputs** is a separate explicit control. Rejected Program grants stop media and request a new pairing code; stale or released renderer authority shows a holding state.

Guests receive composed video without Program audio and hear direct-call audio separately. Use headphones; do not also monitor delayed OBS/Twitch audio in the call. The exact OBS Browser Source runtime needs compatibility verification. If it cannot run this WebRTC path, use Window Capture of the Program browser. See [media checks](media.md). Preparing Program does not start a Twitch broadcast.

## Local transport test without camera permission

Run an official local LiveKit server bound to 127.0.0.1 and configure its development endpoint/credentials in ignored `.env.local`. A labeled rehearsal exposes local transport controls only on localhost/127.0.0.1. Publishing its synthetic moving plate never calls camera permission; its provenance label is baked into the video.

For a second isolated guest origin using the same database/signing key:

```sh
PORTAL_DIST_DIR=.next-guest APP_BASE_URL=http://127.0.0.1:3201 npm exec next dev -- --hostname 127.0.0.1 --port 3201
```

In Studio: enable local transport testing, enable the test camera, connect the test room, mark ready, and admit A. Create B's invitation and open it on the guest origin with its code unchanged. The guest enables local synthetic testing, enables the test camera, confirms broadcast consent and framing, joins the media room, and marks ready. The director admits B and opens/resumes the curtain. Each actual session controls its own offers/acceptances.

Open `/program?show=SHOW_ID&transport=1` locally to receive the actual output stream. Returning explicitly to solo rehearsal closes media, restores labeled plates under a holding curtain, and preserves the scene. Production rehearsal never obtains media grants.

This test exercises separate browser sessions and the real SFU. It does not establish actual cameras, remote humans, geographic separation, audio synchronization, or a public Twitch broadcast.

## Optimized local transport rehearsal

When development compilation or reloads interfere with media, build an isolated copy and use its production server. Keep its `.next` cache separate from active dev servers. Start both origins with `PORTAL_LOCAL_MEDIA_TEST=1`, the same private signing/database environment, and the appropriate `APP_BASE_URL`. Both app and LiveKit URLs must use literal localhost/127.0.0.1/::1. Vercel and cloud media endpoints never receive this exception.

```sh
PORTAL_LOCAL_MEDIA_TEST=1 PORTAL_TIMING_LOG=1 APP_BASE_URL=http://localhost:3200 npm exec next start -- --hostname 127.0.0.1 --port 3200
PORTAL_LOCAL_MEDIA_TEST=1 PORTAL_TIMING_LOG=1 APP_BASE_URL=http://127.0.0.1:3201 npm exec next start -- --hostname 127.0.0.1 --port 3201
```

The explicit local exception permits HttpOnly/SameSite cookies over loopback HTTP; deployed production cookies retain Secure. Existing sessions continue if their origin, signing key, and database remain unchanged. The browser still requires visible synthetic-testing opt-in. These flags are test configuration, not deployment settings.

Optional timing logs contain query category, elapsed time, event-loop lag, row count, and timeout/failure flags. They exclude SQL, parameters, identities, provider messages, and credentials. Use those observations to distinguish storage waits, retries, and host scheduling; slow requests alone do not prove their cause.
