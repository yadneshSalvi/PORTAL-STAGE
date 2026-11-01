import Link from "next/link";
import type { EpisodeId } from "@/lib/contracts";
import { ArrowRight } from "lucide-react";
import { Wordmark } from "./brand";
import { NewShowButton } from "./new-show-button";

export function GuestEnded({ episode }: { episode: EpisodeId }) {
  return (
    <div className="studio-shell guest-shell">
      <header className="studio-header">
        <Wordmark light />
      </header>
      <main id="main-content" className="guest-ended">
        <h1>Show ended</h1>
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
