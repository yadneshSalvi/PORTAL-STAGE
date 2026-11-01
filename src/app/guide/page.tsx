import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/brand";
import { NewShowButton } from "@/components/new-show-button";
export const metadata: Metadata = { title: "Guide" };
const sections = [
  ["rehearsal", "Rehearsal"],
  ["local-camera", "Local camera"],
  ["solo", "Solo with chat"],
  ["entrance", "Guest entrance"],
  ["controls", "Controls"],
  ["twitch", "Twitch choices"],
  ["program", "Program & OBS"],
  ["recovery", "Recovery"],
  ["permission", "Permission & privacy"],
];
export default function GuidePage() {
  return (
    <>
      <SiteHeader active="guide" />
      <main id="main-content" className="public-guide">
        <section className="guide-hero">
          <h1>Guide</h1>
        </section>
        <div className="guide-content">
          <nav className="guide-toc" aria-label="Guide sections">
            {sections.map(([id, title]) => (
              <a href={`#${id}`} key={id}>
                {title}
              </a>
            ))}
          </nav>
          <article className="guide-article">
            <section id="rehearsal">
              <h2>Rehearsal</h2>
              <ol>
                <li>
                  Select Borrowed Weather or Midnight Parcel, then Rehearse.
                </li>
                <li>
                  Follow the cue. Open a choice, add Test votes, and close the
                  choice.
                </li>
                <li>
                  Resolve a tie or empty result with Director’s choice, then
                  apply it.
                </li>
                <li>
                  Offer and accept the prop as the two illustrated performers.
                  Continue to the final cue, then End show.
                </li>
              </ol>
              <p>
                Borrowed Weather follows a patched umbrella through rain and a
                small visitor’s story. Midnight Parcel carries chosen contents,
                a stamp and handling marks into a transformed room.
              </p>
            </section>
            <section id="local-camera">
              <h2>Local camera</h2>
              <ol>
                <li>
                  Choose Camera &amp; hand cues, allow local preview, then
                  Enable local camera.
                </li>
                <li>
                  Move the anchor with a pointer or arrow keys and confirm
                  framing.
                </li>
                <li>
                  Optionally enable hand cues, arm them, lower your hand, then
                  hold an open palm in the marked region.
                </li>
              </ol>
              <p>
                Local camera rehearsal requests no microphone and joins no media
                room. Camera frames and hand landmarks stay in your browser;
                only show commands reach the server. Turning the camera off,
                leaving, or ending stops capture. A cancelled late camera grant
                is stopped.
              </p>
            </section>
            <section id="solo">
              <h2>Solo with chat</h2>
              <ol>
                <li>
                  Sign in with Twitch, choose Solo with chat, and check the
                  available starts and session limit.
                </li>
                <li>
                  Preview your camera, grant broadcast permission, confirm
                  framing, then join media.
                </li>
                <li>
                  Connect chat and open the curtain. The illustrated Audience
                  Room takes the second role.
                </li>
                <li>
                  Use !accept / !wait for a received offer, and !giveback /
                  !keep for the return. You accept the prop back as performer A.
                </li>
              </ol>
              <p>
                The timer limits media access. Keep the director window open and
                End show to close early. A new show does not extend an existing
                media grant.
              </p>
            </section>
            <section id="entrance">
              <h2>Guest entrance</h2>
              <ol>
                <li>Open the private invitation and enter your name.</li>
                <li>
                  Preview devices, choose broadcast and optional demo-recording
                  permission, then confirm framing.
                </li>
                <li>
                  Join the media room and choose Ready. The director admits you
                  separately; the On air light confirms Program participation.
                </li>
              </ol>
              <p>
                Joining backstage does not put you on air. Guests control their
                own camera, microphone and consent; they cannot admit themselves
                or control another performer.
              </p>
            </section>
            <section id="controls">
              <h2>Controls</h2>
              <table>
                <tbody>
                  <tr>
                    <td>
                      <kbd>Space</kbd>
                    </td>
                    <td>Advance the available director cue</td>
                  </tr>
                  <tr>
                    <td>
                      <kbd>O</kbd>
                    </td>
                    <td>Offer the prop</td>
                  </tr>
                  <tr>
                    <td>
                      <kbd>A</kbd>
                    </td>
                    <td>Accept an offer</td>
                  </tr>
                  <tr>
                    <td>
                      <kbd>Esc</kbd>
                    </td>
                    <td>
                      Director: close curtain. Guest: cancel your offer or
                      leave.
                    </td>
                  </tr>
                </tbody>
              </table>
              <p>
                Buttons remain available for every handoff. Hand cues require
                deliberate arming and confirmed framing.
              </p>
            </section>
            <section id="twitch">
              <h2>Twitch choices</h2>
              <p>
                Connect your channel, open a choice window, and show its
                commands. Each account has one replaceable choice. Empty or tied
                results need an explicit Director’s choice. Apply the result to
                change the scene.
              </p>
              <p>
                Effects use !rain, !thunder and !cheer. If intake reports
                dropped commands, check the connection before continuing; missed
                messages cannot be reconstructed.
              </p>
            </section>
            <section id="program">
              <h2>Program &amp; OBS</h2>
              <ol>
                <li>
                  Open Program output and pair the viewer using its private
                  code.
                </li>
                <li>
                  Use the Program window as your OBS capture source and check
                  picture, audio and framing before broadcasting.
                </li>
                <li>
                  Use headphones for the direct call. Program carries the
                  composed stage; the guest return is video only.
                </li>
              </ol>
              <p>
                Program viewers receive the picture and audio without joining
                backstage or controlling the show. Rehearsal Scene preview stays
                illustrated and does not receive your private local camera.
              </p>
            </section>
            <section id="recovery">
              <h2>Recovery</h2>
              <p>
                Hold pauses the performance; Return recalls the prop to A. A
                hidden or disconnected performer must confirm readiness and be
                admitted again. Reconnect stops local media and returns muted
                backstage.
              </p>
              <p>
                End show closes participation. Retry media closure remains
                available if provider cleanup fails. Save a version to preserve
                authored choices separately from media recordings.
              </p>
            </section>
            <section id="permission">
              <h2>Permission &amp; privacy</h2>
              <p>
                Private preview, broadcast consent, readiness, admission and
                recording permission are separate. You can turn off your camera,
                mute, withdraw broadcast permission or leave at any time.
              </p>
              <p>
                This app does not start a recording. Ask every participant
                before capturing Program in OBS or using footage in a demo. Hand
                processing runs on your device; bounded cue and anchor updates
                may travel through the private media room.
              </p>
              <p>
                Share invitations privately. They expire, and replacing one
                invalidates the unused earlier code. Camera and voice travel
                through the configured media service only when you explicitly
                join.
              </p>
            </section>
            <div className="guide-action">
              <NewShowButton />
            </div>
          </article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
