"use client";
import { RotateCcw } from "lucide-react";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="empty-room public-error" id="main-content">
      <div className="empty-room-card">
        <h1>This room could not load.</h1>
        <button className="button button-gold" onClick={reset}>
          <RotateCcw size={17} />
          Try again
        </button>
      </div>
    </main>
  );
}
