import Link from "next/link";
import { ArrowDown, Hand, MessageCircle, Umbrella } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/brand";
import { LandingStage } from "@/components/landing-stage";
import { NewShowButton } from "@/components/new-show-button";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="public-home">
        <section className="hero">
          <h1>
            Different rooms.
            <br />
            One <em>impossible</em> stage.
          </h1>
          <div className="hero-actions">
            <NewShowButton>Step into rehearsal</NewShowButton>
            <Link className="button button-text" href="#the-show">
              Meet the show <ArrowDown size={17} />
            </Link>
          </div>
        </section>
        <section
          className="hero-stage-section"
          aria-label="An illustrated preview of Borrowed Weather"
        >
          <LandingStage />
        </section>
        <section
          className="public-features section-container"
          id="the-show"
          aria-label="The show"
        >
          <div className="steps-grid" id="how-it-works">
            <article>
              <div
                className="step-illustration step-portals"
                aria-hidden="true"
              >
                <div className="mini-arch mini-arch-gold">
                  <Hand size={40} strokeWidth={1} />
                </div>
                <span className="mini-path">··· ✦ ···</span>
                <div className="mini-arch mini-arch-teal">
                  <Hand size={40} strokeWidth={1} />
                </div>
              </div>
              <h2>Two rooms</h2>
              <p>Perform with a friend or let chat hold the other portal.</p>
            </article>
            <article>
              <div
                className="step-illustration step-audience"
                aria-hidden="true"
              >
                <div className="mini-vote">
                  <MessageCircle size={32} />
                  <div>
                    <span>!gentle</span>
                    <span>!wild</span>
                  </div>
                </div>
              </div>
              <h2>Chat decides</h2>
              <p>
                Your community chooses the weather, the mood, and the ending.
              </p>
            </article>
            <article>
              <div className="step-illustration public-prop" aria-hidden="true">
                <Umbrella size={80} strokeWidth={1} />
              </div>
              <h2>A prop that remembers</h2>
              <p>
                Pass a patched umbrella or a tagged parcel that keeps its story.
              </p>
            </article>
          </div>
        </section>
        <section className="public-closing">
          <NewShowButton>Step into rehearsal</NewShowButton>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
