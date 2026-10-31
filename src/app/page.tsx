import Link from "next/link";
import {
  ArrowDown,
  ArrowUpRight,
  AudioLines,
  Hand,
  MoveUpRight,
  Radio,
  ShieldCheck,
  Sparkles,
  Umbrella,
  Video,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/brand";
import { LandingStage } from "@/components/landing-stage";
import { NewShowButton } from "@/components/new-show-button";
import { ParcelPoster } from "@/components/parcel-poster";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <section className="hero">
          <p className="eyebrow hero-eyebrow">
            <span aria-hidden="true">✦</span> A NEW WAY TO BE TOGETHER, LIVE{" "}
            <span aria-hidden="true">✦</span>
          </p>
          <h1>
            Different rooms.
            <br />
            One <em>impossible</em> stage.
          </h1>
          <p className="hero-description">
            Perform with a friend, or let chat hold the other portal.
            <br className="desktop-break" /> Let your community help write what
            happens next.
          </p>
          <div className="hero-actions">
            <NewShowButton />
            <Link className="button button-text" href="#the-show">
              Meet the first show <ArrowDown size={17} />
            </Link>
          </div>
          <p className="hero-note">
            No camera needed to explore. A little curiosity will do.
          </p>
          <div className="hero-doodle" aria-hidden="true">
            <svg width="75" height="52" viewBox="0 0 75 52" fill="none">
              <path
                d="M69 4C54 3 36 15 31 27c-6 16 14 23 19 12C54 28 24 25 5 40m0 0 12-1M5 40l5-11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <span>
              better with
              <br />a friend.
            </span>
          </div>
        </section>
        <section
          className="hero-stage-section"
          aria-label="An illustrated preview of Borrowed Weather"
        >
          <LandingStage />
        </section>
        <section className="intro-section section-container" id="the-show">
          <div className="intro-heading">
            <p className="eyebrow">
              <span aria-hidden="true">01 /</span> THE FIRST SHOW
            </p>
            <h2>
              Some things are
              <br />
              better <em>borrowed.</em>
            </h2>
          </div>
          <div className="intro-copy">
            <p className="lead-copy">
              An umbrella. A passing storm.
              <br />A stranger who turns out to be a friend.
            </p>
            <p>
              In <em>Borrowed Weather</em>, your community chooses the rain,
              names a small visitor, sets its mood, and writes the ending. Offer
              a virtual umbrella through the portal to a consenting partner, or
              let the illustrated Audience Room take the other side.
            </p>
            <p>
              The umbrella keeps its coral patch, its droplets, and its story.
              The next scene belongs to you.
            </p>
            <Link className="underlined-link" href="/guide">
              Read the performer’s field guide <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="show-detail-strip">
            <span>
              <Umbrella size={19} /> ONE PERSISTENT PROP
            </span>
            <span>
              <Video size={19} /> A HOST & COMMUNITY, OR A DUET
            </span>
            <span>
              <Sparkles size={19} /> ONE CURIOUS COMMUNITY
            </span>
          </div>
        </section>
        <section
          className="parcel-feature section-container"
          aria-label="The second episode"
        >
          <div className="parcel-feature-art">
            <ParcelPoster />
            <span>Original illustrated preview · no live cameras</span>
          </div>
          <div>
            <p className="eyebrow">THE SECOND SHOW · THE MIDNIGHT PARCEL</p>
            <h2>
              A gift for
              <br />
              <em>the other side.</em>
            </h2>
            <p>
              One tagged parcel. A pocket of stars, or a midnight garden. Send
              it through the portal and let your community change the room it
              reaches. Its stamp and handling marks stay with it when it comes
              home.
            </p>
            <NewShowButton
              episode="midnight-parcel"
              className="button button-ink"
            >
              Try the parcel rehearsal
            </NewShowButton>
          </div>
        </section>
        <section className="how-section" id="how-it-works">
          <div className="section-container">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">02 / THE ART OF SHOWING UP</p>
                <h2>
                  A small setup.
                  <br />
                  <em>An open-ended story.</em>
                </h2>
              </div>
              <p>
                You bring the chemistry.
                <br />
                We bring the stagecraft.
              </p>
            </div>
            <div className="steps-grid">
              <article>
                <div className="step-illustration step-invite">
                  <span className="mini-invitation">
                    <span className="mini-star">✦</span>
                    <span>YOU’RE INVITED</span>
                    <strong>
                      Something
                      <br />
                      wonderful awaits.
                    </strong>
                    <span>ADMIT ONE ↗</span>
                  </span>
                  <span className="step-orbit" aria-hidden="true" />
                </div>
                <span className="step-number">ACT I</span>
                <h3>Choose the other side of the portal.</h3>
                <p>
                  Let chat run the illustrated Audience Room, or invite a second
                  performer privately. Preview your own camera and choose your
                  permissions before the curtain opens.
                </p>
              </article>
              <article>
                <div className="step-illustration step-portals">
                  <div className="mini-arch mini-arch-gold">
                    <Hand size={40} strokeWidth={1} />
                  </div>
                  <span className="mini-path" aria-hidden="true">
                    ··· ✦ ···
                  </span>
                  <div className="mini-arch mini-arch-teal">
                    <Hand size={40} strokeWidth={1} />
                  </div>
                </div>
                <span className="step-number">ACT II</span>
                <h3>Make the impossible happen.</h3>
                <p>
                  Offer. Accept. Pass the same virtual prop between your rooms.
                  Use buttons or supported hand cues, and leave room for a
                  little improvisation.
                </p>
              </article>
              <article>
                <div className="step-illustration step-audience">
                  <div className="mini-vote">
                    <span>WHAT’S THE WEATHER?</span>
                    <div>
                      <span>!gentle</span>
                      <span>!wild</span>
                    </div>
                    <span className="mini-vote-star">✦</span>
                  </div>
                </div>
                <span className="step-number">ACT III</span>
                <h3>Let your community in.</h3>
                <p>
                  Open a Twitch choice, then bring its result into the scene. A
                  gentle shower or a mischievous storm changes what happens
                  next.
                </p>
              </article>
            </div>
          </div>
        </section>
        <section className="craft-section section-container">
          <div className="craft-note">
            <span className="craft-asterisk" aria-hidden="true">
              ✳
            </span>
            <p>
              Built for the people
              <br />
              <em>inside the magic.</em>
            </p>
          </div>
          <div className="craft-grid">
            <article>
              <ShieldCheck size={25} strokeWidth={1.5} />
              <h3>Your entrance. Your choice.</h3>
              <p>
                Private preview, separate broadcast consent, and a clear on-air
                light. Joining backstage never puts you on the stage.
              </p>
            </article>
            <article>
              <Radio size={25} strokeWidth={1.5} />
              <h3>One beautifully shared view.</h3>
              <p>
                A director composes admitted cameras and original stagecraft
                into one 16:9 Program for a capture setup you verify before
                broadcasting.
              </p>
            </article>
            <article>
              <AudioLines size={25} strokeWidth={1.5} />
              <h3>Room to be human.</h3>
              <p>
                Take a breath, hold the stage, or close the curtain. Every
                handoff has an explicit acceptance and a button equivalent.
              </p>
            </article>
            <article>
              <MoveUpRight size={25} strokeWidth={1.5} />
              <h3>Make it your own.</h3>
              <p>
                Change the rain, Pip’s curiosity, or the ending. Save your
                version and bring the theater back for another show.
              </p>
            </article>
          </div>
        </section>
        <section className="invitation-section">
          <div className="invitation-border">
            <span className="invitation-spark" aria-hidden="true">
              ✦
            </span>
            <p className="eyebrow">THE CURTAIN IS YOURS</p>
            <h2>
              The internet could use
              <br />a little <em>more wonder.</em>
            </h2>
            <p>Start with a rehearsal. See where the story goes.</p>
            <NewShowButton className="button button-gold" />
            <span className="invitation-small">
              An illustrated rehearsal with optional local camera. Real media
              and Twitch connect separately.
            </span>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
