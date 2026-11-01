import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/brand";
import { NewShowButton } from "@/components/new-show-button";
export const metadata: Metadata = {
  title: "A performer’s field guide",
  description:
    "Public rehearsal, local camera and hand cues, solo Audience Room shows, both episodes, Twitch choices, and Program setup.",
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
            Start with your own rehearsal. Bring your community to a solo show,
            or invite a friend for a duet.
          </p>
        </section>
        <div className="guide-content">
          <nav className="guide-toc" aria-label="Guide sections">
            <a href="#rehearsal">Your first rehearsal</a>
            <a href="#local-camera">A local camera rehearsal</a>
            <a href="#solo">Solo with your community</a>
            <a href="#cast">Who’s on the stage?</a>
            <a href="#entrance">A guest’s entrance</a>
            <a href="#story">Borrowed Weather</a>
            <a href="#parcel">The Midnight Parcel</a>
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
                  Open the studio, select either episode, and choose{" "}
                  <strong>Start a rehearsal</strong>.
                </li>
                <li>
                  Follow <strong>Your next cue</strong>. Open a choice and add
                  labeled test ballots.
                </li>
                <li>
                  Close the choice. A tie or empty result asks you to select an
                  explicit <strong>Director’s choice</strong>, then apply it.
                </li>
                <li>
                  Offer and accept as the two illustrated parts. The same prop
                  keeps its traits across the crossing.
                </li>
                <li>
                  Follow the remaining choices and consequences, then end.{" "}
                  <strong>New rehearsal</strong> and <strong>New show</strong>{" "}
                  remain available after the curtain closes.
                </li>
              </ol>
              <div className="guide-callout">
                Rehearsal demonstrates controls and prop continuity. Real remote
                cameras, Twitch input, and observed media latency need a live
                run.
              </div>
            </section>
            <section id="local-camera">
              <h2>Put yourself in the rehearsal.</h2>
              <p>
                In a public rehearsal, choose{" "}
                <strong>Try camera &amp; hand cues</strong>. Check the local
                preview permission, then select{" "}
                <strong>Enable local camera</strong>. No microphone is requested
                and no media room is joined.
              </p>
              <p>
                Camera frames and hand landmarks stay in this browser. The hand
                model downloads from this site only when you enable tracking.
                Offer and Accept commands still go to the show server; local
                framing and hand positions do not.
              </p>
              <ol>
                <li>
                  Move the anchor with a pointer or arrow keys and confirm
                  camera framing.
                </li>
                <li>
                  Optionally enable local hand cues, then explicitly arm them.
                </li>
                <li>
                  Lower the hand once, then deliberately hold an open palm in
                  the marked region. Use the buttons whenever tracking is
                  unavailable.
                </li>
              </ol>
              <p>
                You can cancel a pending camera request. The browser may leave
                its own permission dialog open; any late grant is stopped.
                Turning the camera off, leaving the page, or ending the show
                closes this local capture. A rehearsal scene preview in another
                window uses illustrations and does not receive your private
                camera.
              </p>
            </section>
            <section id="solo">
              <h2>Let chat hold the other portal.</h2>
              <p>
                A solo Twitch show has one consenting streamer in room A and an
                original illustrated Audience Room in B. It needs no guest
                invitation. The studio shows the server’s available starts and
                media-session limit before creation.
              </p>
              <ol>
                <li>
                  Sign in with Twitch and create a solo show for either episode.
                </li>
                <li>
                  Open your camera and consent setup, connect the media room,
                  confirm your framing and broadcast consent, mark yourself
                  ready, and admit A.
                </li>
                <li>
                  Connect Twitch chat and open the curtain. Your browser relays
                  EventSub commands to the server.
                </li>
                <li>
                  Offer the prop. The Audience Room chooses{" "}
                  <strong>!accept</strong> or <strong>!wait</strong>. With no
                  unique winner, you must make an explicit Director’s choice.
                </li>
                <li>
                  When the room holds it, <strong>!giveback</strong> or{" "}
                  <strong>!keep</strong> decides the return offer. You still
                  accept the prop back as A.
                </li>
              </ol>
              <div className="guide-callout">
                Solo sessions reserve bounded shared media capacity. The studio
                displays the deadline. New live access stops after it. Keep the
                director window open, and use End show to close sooner. A new
                show cannot extend an old media grant. Public local-camera
                rehearsal remains available separately.
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
                      Watches on Twitch, chooses the story during each open
                      window, and adds bounded presence effects. In solo mode it
                      also receives and offers the prop through the illustrated
                      Audience Room.
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
                A duet show needs two consenting performers with cameras,
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
                A drip becomes a small original creature. The room chooses its
                safe name, then its curious or shy mood. Pass the umbrella back
                and it follows. A final choice creates a shared shelter or a
                visibly playful chase.
              </p>
              <div className="guide-callout">
                The umbrella is virtual. No physical umbrella is required. The
                scene does not recognize or teleport physical objects.
              </div>
            </section>
            <section id="parcel">
              <h2>The Midnight Parcel.</h2>
              <p>
                A moonlit sorting office receives a gift for the other side.
                Choose <strong>!stars</strong> or <strong>!garden</strong>,
                stamp the parcel, and offer it across the portal. Its tag and
                handling marks persist.
              </p>
              <p>
                Opening it in B creates a constellation or a luminous garden in
                that room. Return the same marked parcel, then choose{" "}
                <strong>!deliver</strong> to leave the gift in B or{" "}
                <strong>!keep</strong> to bring its magic home to A. The room
                visibly changes with that ending.
              </p>
              <p>
                Its eight story stages are opening, contents, stamp, crossing,
                unpacking, return, the gift’s home, and curtain. Choose it in
                the studio for rehearsal or solo.
              </p>
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
                    <td>Offer the virtual prop you currently hold.</td>
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
                Sign-in and an active chat connection are separate steps. The
                host connects Twitch chat in the studio; EventSub notifications
                are relayed through that host’s browser. A live choice requires
                a healthy connection.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>CHOICE WINDOW</th>
                    <th>COMMANDS</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Weather</td>
                    <td>!gentle · !wild</td>
                  </tr>
                  <tr>
                    <td>Creature’s name</td>
                    <td>!pip1 (Pip) · !pip2 (Sprig) · !pip3 (Moth)</td>
                  </tr>
                  <tr>
                    <td>Mood</td>
                    <td>!curious · !shy</td>
                  </tr>
                  <tr>
                    <td>Weather ending</td>
                    <td>!share · !chase</td>
                  </tr>
                  <tr>
                    <td>Audience Room handoff</td>
                    <td>!accept · !wait, then !giveback · !keep</td>
                  </tr>
                  <tr>
                    <td>Parcel contents and ending</td>
                    <td>!stars · !garden, then !deliver · !keep</td>
                  </tr>
                </tbody>
              </table>
              <p>
                Only commands for the current window count. One account has one
                replaceable ballot. Duplicate delivery adds no votes. Messages
                sent inside the window have a brief delivery grace period after
                close. Empty or tied results wait for your deliberate{" "}
                <strong>Director’s choice</strong>; they never silently accept
                an offer.
              </p>
              <p>
                Between choices, <strong>!rain</strong>,{" "}
                <strong>!thunder</strong>, and <strong>!cheer</strong> add
                gentle visual presence. Effects have per-account cooldowns and
                shared bounds. Reduced motion keeps their quieter presentation.
                The stage shows live tally bars and brief credits using
                sanitized display names.
              </p>
              <p>
                Rehearsal ballots and effects are labeled tests. They are never
                credited as real audience participation.
              </p>
            </section>
            <section id="program">
              <h2>One clean Program.</h2>
              <p>
                The director’s studio combines admitted cameras, the virtual
                prop, and original scenery into one 1920 × 1080 composition. In
                solo, B is the illustrated Audience Room. Keep that studio open
                in a dedicated, uncovered Chrome window. Only one director holds
                its publishing lease. Hidden or covered windows can pause
                frames; after returning, check the Program picture before
                acknowledging the warning.
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
                Ordinary rehearsal Program is a labeled illustrated scene
                preview. Its optional local camera stays private to the director
                window. A full two-human performance on separate networks with
                microphones and an OBS broadcast remains a separate physical
                acceptance task. Verify your own capture and audio route before
                broadcasting.
              </div>
            </section>
            <section id="recovery">
              <h2>The story can wait.</h2>
              <p>
                <strong>Hold stage</strong> closes the scene while preserving
                committed prop ownership. <strong>Return prop</strong>{" "}
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
            <p>
              <Link className="underlined-link" href="/how-built">
                How this was built: code, tests, and the Codex development
                record ↗
              </Link>
            </p>
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
