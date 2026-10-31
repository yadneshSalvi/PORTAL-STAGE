import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/brand";
import { NewShowButton } from "@/components/new-show-button";
export const metadata: Metadata = {
  title: "A performer’s field guide",
  description:
    "Your first entrance, the Borrowed Weather cues, private camera setup, Twitch choices, and a clean Program for OBS.",
};
export default function GuidePage() {
  return (
    <>
      <SiteHeader active="guide" />
      <main id="main-content">
        <section className="guide-hero">
          <p className="eyebrow">A NOTE FROM THE WINGS</p>
          <h1>
            A field guide to
            <br />
            <em>the impossible.</em>
          </h1>
          <p>
            You don’t need to be a magician. Bring a friend, headphones, and a
            willingness to see what happens.
          </p>
        </section>
        <div className="guide-content">
          <nav className="guide-toc" aria-label="Guide sections">
            <a href="#rehearsal">Your first rehearsal</a>
            <a href="#cast">Who’s on the stage?</a>
            <a href="#entrance">A guest’s entrance</a>
            <a href="#story">Borrowed Weather</a>
            <a href="#controls">Buttons & hand cues</a>
            <a href="#twitch">Your Twitch community</a>
            <a href="#program">Program & OBS</a>
            <a href="#recovery">When you need a breath</a>
            <a href="#permission">Permission & privacy</a>
          </nav>
          <article className="guide-article">
            <section id="rehearsal">
              <h2>Start with a little rehearsal.</h2>
              <p>
                The public rehearsal lets you play both performers with original
                illustrated camera plates. No camera, microphone, Twitch login,
                or media-room connection is needed. Its synthetic label stays
                inside the stage.
              </p>
              <ol>
                <li>
                  Open the studio and choose <strong>Start a rehearsal</strong>.
                </li>
                <li>
                  Follow <strong>Your next cue</strong>. Open the curtain, open
                  a weather choice, and add a labeled test ballot if you like.
                </li>
                <li>
                  Close the choice, let it rain, offer the umbrella, and accept
                  as the other performer.
                </li>
                <li>
                  Meet Pip, offer the umbrella back, then share the shelter.
                </li>
                <li>
                  Choose <strong>Make it yours</strong>, save a variation, and
                  load it onto the stage. Hold or end before resetting for a new
                  episode.
                </li>
              </ol>
              <div className="guide-callout">
                Rehearsal demonstrates controls and prop continuity. Real remote
                cameras, Twitch input, and observed media latency need a live
                run.
              </div>
            </section>
            <section id="cast">
              <h2>A small cast. Clear roles.</h2>
              <table>
                <thead>
                  <tr>
                    <th>YOUR PART</th>
                    <th>YOUR PLACE IN THE SHOW</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Director / host</td>
                    <td>
                      Creates the show, invites and admits performers, composes
                      Program, and advances the story. The host can also be
                      performer A.
                    </td>
                  </tr>
                  <tr>
                    <td>Guest / performer B</td>
                    <td>
                      Enters through a private invitation, chooses devices and
                      permissions, confirms readiness, and offers or accepts the
                      prop.
                    </td>
                  </tr>
                  <tr>
                    <td>Twitch audience</td>
                    <td>
                      Watches on Twitch and chooses the weather during an open
                      choice.
                    </td>
                  </tr>
                  <tr>
                    <td>Program viewer</td>
                    <td>
                      Receives the director’s clean composition, with no show
                      controls.
                    </td>
                  </tr>
                </tbody>
              </table>
              <p>
                A live show needs two consenting performers with cameras,
                headphones, a supported desktop browser, a configured LiveKit
                service, an approved Twitch host account, and OBS or another
                verified capture setup. Public rehearsal stays available
                separately.
              </p>
            </section>
            <section id="entrance">
              <h2>Your entrance belongs to you.</h2>
              <ol>
                <li>
                  Open the private invitation and enter your stage name. You
                  arrive backstage.
                </li>
                <li>
                  Choose <strong>Enable camera</strong> for a private preview.
                  Enable your microphone separately if you want to speak.
                  Camera-only participation works.
                </li>
                <li>
                  Frame your shoulders, choose a cue hand, and move the umbrella
                  marker to a comfortable place. Your private preview is
                  mirrored; Program is not.
                </li>
                <li>
                  Choose broadcast permission. Demo-recording permission is a
                  separate optional checkbox. Select{" "}
                  <strong>Confirm framing & consent</strong>.
                </li>
                <li>
                  Join the media room. Your microphone is held muted on
                  connection; explicitly enable it when you are ready.
                </li>
                <li>
                  Choose <strong>I’m ready backstage</strong>. The director
                  admits you separately. An <strong>On air</strong> light tells
                  you when you are in the scene.
                </li>
              </ol>
              <p>
                Your stage monitor is a video-only return. You hear your partner
                through direct call audio. Use headphones and avoid a delayed
                copy of your own broadcast.
              </p>
            </section>
            <section id="story">
              <h2>A story called Borrowed Weather.</h2>
              <p>
                Your community sets the storm: a gentle shower or a little wild
                weather. The host cues the rain. A virtual umbrella, marked with
                its coral repair patch, gathers droplets.
              </p>
              <p>
                The holder offers it through the portal. The receiver chooses
                when to accept. Only then does the same umbrella cross the
                luminous iris. Its patch, wetness, and identity stay with it.
              </p>
              <p>
                A drip becomes Pip, an original small creature with a fondness
                for shelter. Gentle rain makes a shy companion; wild weather
                makes a bouncing umbrella-chaser. Pass the umbrella back and Pip
                follows. Find a shared shelter, or save a version with a playful
                chase ending.
              </p>
              <div className="guide-callout">
                The umbrella is virtual. No physical umbrella is required. The
                scene does not recognize or teleport physical objects.
              </div>
            </section>
            <section id="controls">
              <h2>Buttons belong in the performance.</h2>
              <p>
                Every required handoff has a button. Move your anchor with its
                large drag target or the arrow keys. An offer can be held,
                declined, canceled, or allowed to expire; the receiver chooses
                whether to accept.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>KEY</th>
                    <th>WHAT IT DOES</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <kbd>Space</kbd>
                    </td>
                    <td>Director: advance the available next cue.</td>
                  </tr>
                  <tr>
                    <td>
                      <kbd>O</kbd>
                    </td>
                    <td>Offer the umbrella you currently hold.</td>
                  </tr>
                  <tr>
                    <td>
                      <kbd>A</kbd>
                    </td>
                    <td>Accept the offer addressed to you.</td>
                  </tr>
                  <tr>
                    <td>
                      <kbd>Esc</kbd>
                    </td>
                    <td>
                      Director: close the emergency curtain. Guest: cancel your
                      own offer or leave your own participation. An open dialog
                      closes first.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <kbd>←</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd>
                    </td>
                    <td>Move the focused calibration marker.</td>
                  </tr>
                </tbody>
              </table>
              <p>
                Optional hand cues load on-device landmarks only after you
                enable them. Confirm framing, enable tracking, and explicitly
                arm it. Lower your hand once, then hold an open palm in the
                marked region for about one second. Confidence and hold progress
                appear privately. If tracking pauses, use the buttons.
              </p>
              <p>
                Hand landmarks suggest a deliberate cue. They do not provide
                physical-object recognition or automatic real-world occlusion.
                You can complete the whole show with buttons.
              </p>
            </section>
            <section id="twitch">
              <h2>Let your community set the scene.</h2>
              <p>
                The approved host signs in with Twitch, then connects chat from
                the studio. Account sign-in and an active chat connection are
                separate states. A live audience choice requires a healthy chat
                connection.
              </p>
              <p>
                During an open choice, viewers type <strong>!gentle</strong> or{" "}
                <strong>!wild</strong>. One current choice counts per eligible
                viewer; a later valid selection replaces it until close.
                Repeated delivery and late messages do not add votes.
              </p>
              <p>
                The director closes the choice and activates the result. With no
                ballots, the stage uses <strong>Director’s choice</strong>.
                Rehearsal ballots are labeled as tests. Performers use the stage
                return, so ordinary Twitch playback delay stays outside the
                handoff.
              </p>
            </section>
            <section id="program">
              <h2>One clean Program.</h2>
              <p>
                The director’s studio combines both admitted camera feeds, the
                umbrella, the creature, and the scenery into one 1920 × 1080
                composition. Keep that studio open on a capable computer. Only
                one director holds its publishing lease.
              </p>
              <ol>
                <li>
                  After host camera setup, connect the media room. The studio
                  reports when Program is publishing.
                </li>
                <li>
                  Choose <strong>Program output</strong> and prepare a one-time
                  pairing code.
                </li>
                <li>
                  Open Program in the browser or OBS setup you intend to
                  capture. Enter the show identifier and pairing code if
                  requested.
                </li>
                <li>
                  Capture the clean 16:9 window, or use an OBS Browser Source
                  after verifying your exact runtime. Check framing and a single
                  audio route before broadcasting.
                </li>
              </ol>
              <p>
                Live Program receives the published stream; it does not create
                another independent stage. Output access is read-only. Pairing
                codes are exchanged for an output cookie, keeping permanent room
                credentials and host controls out of source URLs.
              </p>
              <div className="guide-callout">
                Rehearsal Program is a labeled local scene preview. Verify the
                real camera, audio, OBS, and Twitch path with the devices and
                software you will use.
              </div>
            </section>
            <section id="recovery">
              <h2>The story can wait.</h2>
              <p>
                <strong>Hold stage</strong> closes the scene while preserving
                committed prop ownership. <strong>Return umbrella</strong>{" "}
                explicitly returns it to the host. <strong>Hide guest</strong>{" "}
                closes their aperture and requires readiness and admission
                again.
              </p>
              <p>
                The director’s emergency curtain covers the local composition
                immediately. A disconnected or stalled camera gets a “Back
                shortly” aperture. Returning performers start backstage, with
                stopped devices and renewed readiness; the director admits them
                again.
              </p>
              <p>
                If the director loses publishing authority, the previous
                renderer stops publishing. Takeover is explicit. The recovering
                studio settles to the committed owner rather than replaying an
                old crossing.
              </p>
              <p>
                <strong>End show</strong> closes the curtain and ends
                publishing. Saved versions remain separate from media
                recordings. The stage record shows actual ownership, retained
                traits, and recent server events.
              </p>
            </section>
            <section id="permission">
              <h2>People first. Always.</h2>
              <p>
                Private preview, broadcast consent, readiness, admission, and
                recording permission are distinct steps. Turn off your camera,
                mute, withdraw broadcast permission, or leave without asking the
                director.
              </p>
              <p>
                This app does not start a recording. Ask every participant
                before capturing Program in OBS or using footage in a demo.
                Optional hand processing runs on your device and sends bounded
                cue and anchor updates, rather than camera frames to a model
                provider.
              </p>
              <p>
                Private invitations expire. Replacing one invalidates its
                previous unused code. Share them privately. Program pairing
                grants allow viewing only. Your camera and voice travel through
                the configured media service when you explicitly join.
              </p>
            </section>
            <div className="guide-action">
              <div>
                <h3>Your entrance is waiting.</h3>
                <p>Try the whole story, one cue at a time.</p>
              </div>
              <NewShowButton className="button button-gold" />
            </div>
          </article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
