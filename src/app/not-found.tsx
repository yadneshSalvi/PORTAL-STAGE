import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Wordmark } from "@/components/brand";
export default function NotFound() {
  return (
    <main className="empty-room" id="main-content">
      <Wordmark light />
      <div className="empty-room-card">
        <span className="empty-room-star" aria-hidden="true">
          ✦
        </span>
        <p className="eyebrow">A WRONG TURN IN THE WINGS · 404</p>
        <h1>This door leads offstage.</h1>
        <p>
          That room isn’t here. There’s still a little wonder waiting at the
          theater.
        </p>
        <div className="error-page-actions">
          <Link href="/" className="button button-gold">
            <ArrowLeft size={17} /> Back to the theater
          </Link>
          <Link href="/studio" className="button button-dark">
            Open the studio <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </main>
  );
}
