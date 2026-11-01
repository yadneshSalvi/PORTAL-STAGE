import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/brand";
import styles from "./how-built.module.css";
export const metadata: Metadata = { title: "How it's built" };
const repository = "https://github.com/yadneshSalvi/PORTAL-STAGE/blob/main/";
const contributions = [
  [
    "Committed prop ownership",
    "Codex helped build the offer-and-accept protocol: the server commits the owner before a crossing animates.",
    "src/server/core.ts",
  ],
  [
    "One composed stage",
    "The director renders admitted cameras and original scenery into a single Program view.",
    "src/stage/renderer.ts",
  ],
  [
    "Separate media permissions",
    "Private backstage, broadcast consent, readiness and director admission have distinct gates.",
    "src/media/room-controller.ts",
  ],
  [
    "Audience choices",
    "Typed Twitch commands become replaceable ballots that drive the authored story.",
    "src/lib/show-grammar.ts",
  ],
  [
    "Local camera and hand cues",
    "Optional local capture and landmark processing keep buttons available for every handoff.",
    "src/media/local-rehearsal-camera.ts",
  ],
];
export default function HowBuiltPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className={styles.page}>
        <h1>How it&apos;s built</h1>
        <div className={styles.architecture} aria-label="Architecture">
          <span>Twitch chat</span>
          <span aria-hidden="true">→</span>
          <span>Show state</span>
          <span aria-hidden="true">→</span>
          <span>Director canvas</span>
          <span aria-hidden="true">→</span>
          <span>Program</span>
        </div>
        <section className={styles.stories} aria-label="Codex contributions">
          {contributions.map(([title, body, code]) => (
            <article key={code}>
              <h2>
                <a
                  href={`${repository}${code}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {title} ↗
                </a>
              </h2>
              <p>{body}</p>
            </article>
          ))}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
