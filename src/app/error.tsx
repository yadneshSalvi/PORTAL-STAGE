"use client";
import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { PortalMark } from "@/components/brand";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="empty-room" id="main-content">
      <Link href="/" className="text-link">
        <ArrowLeft size={16} /> Back to the theater
      </Link>
      <div className="empty-room-card">
        <span className="empty-room-star">
          <PortalMark />
        </span>
        <h1>A moment in the wings.</h1>
        <p>
          This room couldn’t finish opening. Try the view again, or return to
          the studio to reconnect with your show.
        </p>
        <div className="error-page-actions">
          <button className="button button-gold" onClick={reset}>
            <RotateCcw size={17} /> Try this view again
          </button>
          <Link href="/studio" className="button button-dark">
            Return to the studio
          </Link>
        </div>
      </div>
    </main>
  );
}
