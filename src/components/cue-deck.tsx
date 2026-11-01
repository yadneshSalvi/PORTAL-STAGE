"use client";
import Link from "next/link";
import { ArrowRight, LoaderCircle } from "lucide-react";
import type { ShowAction, ShowState } from "@/lib/contracts";
import { NewShowButton } from "./new-show-button";

export { nextCue } from "./cue-flow";
export type { Cue } from "./cue-flow";
import { nextCue } from "./cue-flow";
export function CueDeck({
  show,
  busy,
  run,
  locked = false,
}: {
  show: ShowState;
  busy: boolean;
  run: (action: ShowAction) => Promise<unknown>;
  locked?: boolean;
}) {
  const cue = nextCue(show);
  return (
    <section className="cue-deck" aria-labelledby="next-cue-title">
      <span className="cue-step" aria-label="Story step">
        {/^[0-9]+$/.test(cue.number) ? `${Number(cue.number)}/8` : cue.number}
      </span>
      <h2 id="next-cue-title">
        {show.phase === "ended" ? "Show ended" : cue.title}
      </h2>
      {show.umbrella.acceptedTransfers === null ? (
        <p>The current prop is intact. Use manual controls or reset.</p>
      ) : null}
      {show.phase === "ended" ? (
        <div className="ended-show-actions">
          {show.mode === "solo" && show.solo?.status === "closing" ? (
            <>
              <p className="field-help" role="status" aria-busy={busy}>
                {busy
                  ? "Closing media…"
                  : show.solo.closureError || "Media closure pending."}
              </p>
              <button
                className="button button-dark"
                disabled={busy}
                onClick={() => void run({ type: "end" })}
              >
                {busy ? (
                  <LoaderCircle size={16} className="spin" aria-hidden="true" />
                ) : null}
                {busy ? "Closing media…" : "Retry media closure"}
              </button>
            </>
          ) : null}
          <NewShowButton episode={show.episode} className="button button-gold">
            New rehearsal
          </NewShowButton>
          <Link href="/studio" className="button button-text">
            New show <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      ) : show.umbrella.acceptedTransfers === null ? (
        <div className="ended-show-actions">
          {show.phase === "live" ? (
            <button
              className="button button-dark"
              disabled={busy}
              onClick={() => void run({ type: "hold" })}
            >
              Hold stage before reset
            </button>
          ) : show.phase === "hold" ? (
            <button
              className="button button-dark"
              disabled={busy || locked}
              onClick={() => void run({ type: "reset" })}
            >
              Reset this held scene
            </button>
          ) : null}
          <NewShowButton episode={show.episode} className="button button-gold">
            New rehearsal
          </NewShowButton>
          <Link href="/studio" className="button button-text">
            Start a new episode <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <>
          <button
            className="button button-gold cue-primary"
            disabled={busy || !cue.act || locked}
            onClick={() => {
              if (cue.act) void run(cue.act);
            }}
          >
            {busy || cue.waiting ? (
              <LoaderCircle size={17} className="spin" aria-hidden="true" />
            ) : null}
            <span>{cue.label}</span>
            {cue.act && !cue.waiting ? <kbd aria-label="Space">␣</kbd> : null}
            {!busy && !cue.waiting && cue.act ? (
              <ArrowRight size={16} aria-hidden="true" />
            ) : null}
          </button>
        </>
      )}
    </section>
  );
}
export { AudienceChoice } from "./audience-choice";
