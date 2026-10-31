"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { createShow, getSession } from "@/lib/client";
import type { EpisodeId, ShowMode } from "@/lib/contracts";

type ShowCreationResult =
  | { ok: true; showId: string }
  | { ok: false; error: string; reservedShowId: string | null };
const creationMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The stage is taking a moment. Please try again.";

/** A failed solo reservation may already belong to this session; never create it twice. */
export async function createShowWithRecovery(
  mode: ShowMode,
  episode: EpisodeId,
): Promise<ShowCreationResult> {
  let previousShowId: string | null = null;
  let creationAttempted = false;
  try {
    previousShowId = (await getSession()).currentShowId;
    creationAttempted = true;
    const { show } = await createShow(mode, episode);
    return { ok: true, showId: show.id };
  } catch (error) {
    const message = creationMessage(error);
    let reservedShowId: string | null = null;
    if (mode === "solo" && creationAttempted) {
      try {
        const current = await getSession();
        if (current.currentShowId && current.currentShowId !== previousShowId)
          reservedShowId = current.currentShowId;
      } catch {
        // Recovery lookup failure must not replace the original creation error.
      }
    }
    return { ok: false, error: message, reservedShowId };
  }
}

export function NewShowButton({
  mode = "rehearsal",
  episode = "borrowed-weather",
  children,
  className = "button button-ink",
}: {
  mode?: ShowMode;
  episode?: EpisodeId;
  children?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reservedShowId, setReservedShowId] = useState<string | null>(null);
  async function enter() {
    setBusy(true);
    setError("");
    setReservedShowId(null);
    const result = await createShowWithRecovery(mode, episode);
    if (!result.ok) {
      setError(result.error);
      setReservedShowId(result.reservedShowId);
      setBusy(false);
      return;
    }
    try {
      router.push(`/studio?show=${encodeURIComponent(result.showId)}`);
    } catch (e) {
      setError(creationMessage(e));
      if (mode === "solo") setReservedShowId(result.showId);
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
      {reservedShowId ? (
        <Link
          className="text-link"
          href={`/studio?show=${encodeURIComponent(reservedShowId)}`}
        >
          Open reserved solo show <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      ) : null}
    </span>
  );
}
