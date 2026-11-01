"use client";
import Link from "next/link";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
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
      <div className="panel-eyebrow">
        <span>YOUR NEXT CUE</span>
        <span className="cue-number">{cue.number}</span>
      </div>
      <span className="cue-spark" aria-hidden="true">
        ✦
      </span>
      <h2 id="next-cue-title">{cue.title}</h2>
      <p>{cue.description}</p>
      {show.phase === "ended" ? (
        <div className="ended-show-actions">
          <p className="ended-show-status">
            <Check size={16} aria-hidden="true" /> Show ended
          </p>
          {show.mode === "solo" && show.solo?.status === "closing" ? (
            <>
              <p className="field-help" role="status" aria-busy={busy}>
                {busy
                  ? "Closing the media rooms…"
                  : "The show has ended. Media-service closure is still pending."}{" "}
                {!busy && show.solo.closureError
                  ? `${show.solo.closureError} `
                  : ""}
                {!busy ? "Retry to finish closing its rooms." : ""}
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
          <Link href="/studio" className="button button-dark">
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
          <Link href="/studio" className="button button-dark">
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
            {cue.label}
            {!busy && !cue.waiting && cue.act ? (
              <ArrowRight size={16} aria-hidden="true" />
            ) : null}
          </button>
          <span className="cue-key-hint">
            {cue.waiting ? (
              "The stage will update as the story moves."
            ) : cue.act ? (
              <>
                Keyboard: <kbd>Space</kbd> for this cue
              </>
            ) : (
              "Choose deliberately in the choice card."
            )}
          </span>
        </>
      )}
    </section>
  );
}
export { AudienceChoice } from "./audience-choice";
