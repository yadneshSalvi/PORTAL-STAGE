import Link from "next/link";

export function PortalMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="32"
      height="36"
      viewBox="0 0 32 36"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 32V15C4 8.373 9.373 3 16 3s12 5.373 12 12v17"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M10 32V16a6 6 0 0 1 12 0v16M1 32h30"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="m16 11 1.2 3.8L21 16l-3.8 1.2L16 21l-1.2-3.8L11 16l3.8-1.2L16 11Z"
        fill="currentColor"
      />
    </svg>
  );
}
export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <Link
      className={`wordmark ${light ? "wordmark-light" : ""}`}
      href="/"
      aria-label="Portal Stage home"
    >
      <PortalMark />
      <span>
        PORTAL<span className="wordmark-stage">STAGE</span>
      </span>
    </Link>
  );
}
export function SiteHeader({ active }: { active?: "guide" | "studio" }) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Wordmark />
        <nav aria-label="Main navigation">
          <Link href="/#the-show">The show</Link>
          <Link href="/#how-it-works">How it works</Link>
          <Link
            href="/guide"
            aria-current={active === "guide" ? "page" : undefined}
          >
            Field guide
          </Link>
        </nav>
        <Link className="button button-ink header-cta" href="/studio">
          Enter the studio <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </header>
  );
}
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <Wordmark />
        <p>A little stage. A little weather. A lot of possibility.</p>
      </div>
      <div className="footer-links">
        <Link href="/guide">Performer’s field guide</Link>
        <Link href="/how-built">How this was built</Link>
        <Link href="/studio">Open the studio ↗</Link>
        <span>Made for a more playful internet.</span>
      </div>
      <div className="footer-bottom">
        <span>© 2026 PORTAL STAGE</span>
        <span>Original stagecraft. Room for human reactions.</span>
      </div>
    </footer>
  );
}
