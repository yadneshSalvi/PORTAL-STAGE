"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { createShow, getSession } from "@/lib/client";
import type { ShowMode } from "@/lib/contracts";

export function NewShowButton({
  mode = "rehearsal",
  children,
  className = "button button-ink",
}: {
  mode?: ShowMode;
  children?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function enter() {
    setBusy(true);
    setError("");
    try {
      await getSession();
      const { show } = await createShow(mode);
      router.push(`/studio?show=${encodeURIComponent(show.id)}`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The stage is taking a moment. Please try again.",
      );
      setBusy(false);
    }
  }
  return (
    <span className="new-show-action">
      <button className={className} onClick={enter} disabled={busy}>
        {busy ? (
          <LoaderCircle className="spin" size={18} aria-hidden="true" />
        ) : null}
        {busy ? "Opening your theater…" : children || "Step into rehearsal"}
        {busy ? null : <ArrowUpRight size={18} aria-hidden="true" />}
      </button>
      {error ? (
        <span className="inline-error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
