import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Wordmark } from "@/components/brand";
export default function NotFound() {
  return (
    <main className="empty-room public-error" id="main-content">
      <Wordmark light />
      <div className="empty-room-card">
        <h1>Page not found.</h1>
        <Link href="/" className="button button-gold">
          <ArrowLeft size={17} />
          Return home
        </Link>
      </div>
    </main>
  );
}
