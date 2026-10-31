import Link from "next/link";
import type { EpisodeId } from "@/lib/contracts";
import { ArrowRight, Check } from "lucide-react";
import { Wordmark } from "./brand";
import { NewShowButton } from "./new-show-button";

export function GuestEnded({ episode }: { episode: EpisodeId }) {
  return (
    <div className="studio-shell guest-shell">
      <header className="studio-header">
        <Wordmark light />
        <span className="status-pill status-muted">
          <Check size={15} />
          Show ended
        </span>
      </header>
      <main id="main-content" className="guest-ended">
        <span className="cue-spark" aria-hidden="true">
          ✦
        </span>
        <p className="eyebrow">THANK YOU FOR SHARING THE STAGE</p>
        <h1>The curtain is closed.</h1>
        <p>
          This show has ended. Its camera, microphone, framing, and readiness
          controls are closed. Your part in the story stays with this show.
        </p>
        <div>
          <NewShowButton episode={episode} className="button button-gold">
            New rehearsal
          </NewShowButton>
          <Link href="/" className="button button-dark">
            Return to the theater <ArrowRight size={16} />
          </Link>
        </div>
      </main>
    </div>
  );
}
