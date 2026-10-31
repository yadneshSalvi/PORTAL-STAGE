import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  Camera,
  CodeXml,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/brand";
import styles from "./how-built.module.css";

export const metadata: Metadata = {
  title: "How this was built",
  description:
    "The concrete engineering, original stagecraft, tests, and Codex development contributions behind PORTAL STAGE.",
};
const repository = "https://github.com/yadneshSalvi/PORTAL-STAGE/blob/main/";
const stories = [
  {
    icon: ShieldCheck,
    title: "The prop has one owner before it moves.",
    body: "Codex helped author and review the offer-and-accept protocol. The server commits the receiving owner before the director animates a crossing. Duplicate accepts, expired offers, stale pages, and failed arrivals cannot create a second owner.",
    code: "src/server/core.ts",
    test: "tests/stage-core.test.ts",
    testLabel: "Ownership and transfer tests",
  },
  {
    icon: Camera,
    title: "One picture, with separate permission gates.",
    body: "The director composes the stage once. Private backstage cameras stay separate from the receive-only Program room. Broadcast consent, readiness, admission, and audio gates have distinct jobs. Codex-assisted browser diagnosis also led to bounded decoder replay after an SDK initialization race.",
    code: "src/media/room-controller.ts",
    test: "tests/media-decoder.test.ts",
    testLabel: "Installed-SDK decoder regression",
  },
  {
    icon: Sparkles,
    title: "The room helps write the story.",
    body: "Typed choice windows turn bounded Twitch commands into replaceable ballots. Empty or tied results ask the director explicitly. The same protocol supports an illustrated Audience Room and a tagged parcel whose contents change the receiving room. The episode tests follow the actual cue actions through the server.",
    code: "src/lib/show-grammar.ts",
    test: "src/components/cue-flow.test.ts",
    testLabel: "Complete authored cue paths",
  },
  {
    icon: CodeXml,
    title: "Hand cues stay optional and local.",
    body: "A private rehearsal camera uses native browser capture without joining a media room. Hand landmarks run in a same-origin worker. Permission cancellation fences late camera grants, and every handoff retains a button. Automated lifecycle tests cover those boundaries; they do not establish gesture accuracy for every person or device.",
    code: "src/media/local-rehearsal-camera.ts",
    test: "tests/media-local-rehearsal-camera.test.ts",
    testLabel: "Local camera lifecycle tests",
  },
];
export default function HowBuiltPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className={styles.page}>
        <section className={styles.hero}>
          <p className="eyebrow">A LOOK BEHIND THE CURTAIN</p>
          <h1>
            Built with Codex.
            <br />
            <em>Directed by people.</em>
          </h1>
          <p>
            Codex assisted the application engineering, original geometry and
            illustrations, interaction design, tests, and review. Human
            performers and their community make the show. No runtime language
            model controls the performance.
          </p>
          <a
            className="underlined-link"
            href={`${repository}docs/evidence/codex.md`}
          >
            Read the development record <ArrowUpRight size={17} />
          </a>
        </section>
        <section
          className={styles.architecture}
          aria-label="How the show reaches the audience"
        >
          <p className="eyebrow">ONE CONTINUOUS STAGE</p>
          <ol>
            <li>
              <strong>Twitch chat</strong>
              <span>Commands reach the host’s EventSub WebSocket.</span>
            </li>
            <li>
              <strong>Durable show state</strong>
              <span>Bounded ballots, ownership, consent, and epochs.</span>
            </li>
            <li>
              <strong>Director’s canvas</strong>
              <span>One composition of admitted media and original art.</span>
            </li>
            <li>
              <strong>Program</strong>
              <span>A receive-only stream for a verified capture setup.</span>
            </li>
          </ol>
          <p>
            The host browser relays EventSub messages. This is an authenticated
            browser relay, not a signed webhook provenance audit. Raw media is
            not stored by this app.
          </p>
        </section>
        <div className={styles.stories}>
          {stories.map((story) => (
            <article key={story.code}>
              <story.icon size={27} strokeWidth={1.4} />
              <div>
                <h2>{story.title}</h2>
                <p>{story.body}</p>
                <div className={styles.proofs}>
                  <a href={`${repository}${story.code}`}>
                    Source <ArrowUpRight size={15} />
                  </a>
                  <a href={`${repository}${story.test}`}>
                    {story.testLabel} <ArrowUpRight size={15} />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
        <section className={styles.evidence}>
          <p className="eyebrow">EVIDENCE HAS CONDITIONS</p>
          <h2>A rehearsal is a beginning.</h2>
          <p>
            The public rehearsal labels its illustrated rooms and test ballots.
            A local camera trial is separate from a remote media run. SDK mocks,
            synthetic transport plates, and behavior tests each prove a narrower
            part of the system.
          </p>
          <p>
            A complete performance with two consenting humans on separate
            networks, microphone and echo checks, and an authorized OBS
            broadcast remains a distinct physical acceptance task. The
            verification record preserves the dates and conditions of
            observations.
          </p>
          <a
            className="underlined-link"
            href={`${repository}docs/evidence/release.md`}
          >
            Recorded verification <ArrowUpRight size={17} />
          </a>
          <Link className="button button-ink" href="/studio">
            Try your own rehearsal <ArrowUpRight size={17} />
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
