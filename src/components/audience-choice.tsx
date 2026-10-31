"use client";
import {
  Check,
  CloudDrizzle,
  CloudLightning,
  Heart,
  Sparkles,
} from "lucide-react";
import type {
  AudienceChoice as Choice,
  PresenceEffect,
  ShowAction,
  ShowState,
} from "@/lib/contracts";
import { ROUND_DEFINITIONS } from "@/lib/show-grammar";
import { useNow } from "./use-show-controller";

export function AudienceChoice({
  show,
  busy,
  run,
  serverOffset,
  locked = false,
}: {
  show: ShowState;
  busy: boolean;
  run: (action: ShowAction) => Promise<unknown>;
  serverOffset: number;
  locked?: boolean;
}) {
  const now = useNow();
  const round = show.round;
  const roundId = round?.id;
  const cancelled = round?.status === "cancelled";
  const selectedChoice = cancelled ? null : round?.result;
  const kind =
    round?.kind ??
    (show.episode === "midnight-parcel" ? "contents" : "weather");
  const definition = ROUND_DEFINITIONS[kind];
  const total = definition.options.reduce(
    (sum, option) => sum + (round?.tallies[option.value] || 0),
    0,
  );
  const until =
    round?.status === "closing" ? round.graceEndsAt : round?.closesAt;
  const seconds =
    until && now
      ? Math.max(0, Math.ceil((until - now - serverOffset) / 1000))
      : show.preset.roundSeconds;
  const result = definition.options.find(
    (option) => option.value === selectedChoice,
  );
  async function testVote(choice: Choice) {
    if (!roundId) return;
    await run({
      type: "rehearsal-vote",
      roundId,
      choice,
      voter: `rehearsal-${crypto.randomUUID()}`,
    });
  }
  const effects = ["rain", "thunder", "cheer"] as PresenceEffect[];
  return (
    <section
      className="audience-panel"
      aria-label={
        show.mode === "rehearsal"
          ? "Labeled rehearsal choices"
          : "Audience choices"
      }
    >
      <div className="panel-eyebrow">
        <span>
          {show.mode === "rehearsal" ? "REHEARSAL CHOICE" : "AUDIENCE CHOICE"}
        </span>
        <span className="round-clock">
          {round?.status === "open"
            ? `${seconds}s`
            : round?.status === "closing"
              ? "COUNTING"
              : round?.status === "applied"
                ? "ON STAGE"
                : round?.status === "closed"
                  ? "CLOSED"
                  : cancelled
                    ? "CANCELLED"
                    : "UP NEXT"}
        </span>
      </div>
      <h3>{definition.question}</h3>
      <p role={cancelled ? "status" : undefined}>
        {cancelled
          ? "This choice was cancelled. Follow the next cue to ask again."
          : show.mode === "rehearsal"
            ? "Labeled test ballots demonstrate this choice. They are not audience input."
            : "One replaceable choice per Twitch account in this window. A later valid command replaces it."}
      </p>
      <div className="audience-options">
        {definition.options.map((option) => {
          const count = round?.tallies[option.value] || 0;
          return (
            <div
              className={`audience-option tally-option ${selectedChoice === option.value ? "chosen" : ""}`}
              key={option.value}
            >
              <span className="option-symbol" aria-hidden="true">
                {kind === "weather" ? (
                  option.value === "gentle" ? (
                    <CloudDrizzle size={19} />
                  ) : (
                    <CloudLightning size={19} />
                  )
                ) : (
                  <Sparkles size={18} />
                )}
              </span>
              <div>
                <span>{option.command}</span>
                <small>{option.label}</small>
              </div>
              <strong>{count}</strong>
              {selectedChoice === option.value ? (
                <Check size={14} aria-label="Chosen result" />
              ) : null}
              <span className="tally-track" aria-hidden="true">
                <i style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
              </span>
            </div>
          );
        })}
      </div>
      {round?.status === "closing" ? (
        <p className="choice-status" role="status">
          Counting in-window messages for up to {seconds}s. New votes are
          closed.
        </p>
      ) : null}
      {show.mode === "rehearsal" && round?.status === "open" ? (
        <div className="test-vote-actions">
          {definition.options.map((option) => (
            <button
              key={option.value}
              disabled={busy || locked}
              onClick={() => void testVote(option.value)}
            >
              Test {option.command}
            </button>
          ))}
        </div>
      ) : null}
      {round?.status === "closed" && round.needsDirectorChoice ? (
        <div className="director-choice">
          <strong>
            {total ? "This choice tied." : "No ballots arrived."} Director,
            choose:
          </strong>
          <p>This will be credited as Director’s choice.</p>
          <div>
            {definition.options.map((option) => (
              <button
                key={option.value}
                className="button button-dark button-small"
                disabled={busy || locked}
                onClick={() =>
                  roundId
                    ? void run({
                        type: "resolve-round",
                        choice: option.value,
                        roundId,
                      })
                    : undefined
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {result ? (
        <div className="choice-result" role="status">
          <Sparkles size={14} aria-hidden="true" />
          <span>
            {round?.source === "audience"
              ? "Audience choice"
              : round?.source === "rehearsal"
                ? "Rehearsal test choice"
                : "Director’s choice"}
            : {result.label}
          </span>
        </div>
      ) : null}
      {!cancelled &&
      round?.contributors?.length &&
      round.source === "audience" ? (
        <p className="choice-credit">
          {round.uniqueVoters} {round.uniqueVoters === 1 ? "voice" : "voices"} ·{" "}
          {round.contributors.slice(0, 3).join(" · ")}
        </p>
      ) : null}
      {show.phase !== "ended" ? (
        <div className="presence-cues">
          <div>
            <Heart size={14} aria-hidden="true" />
            <strong>A little presence between choices.</strong>
          </div>
          {show.mode === "rehearsal" ? (
            <>
              <p>Labeled test effects. No viewers are simulated.</p>
              <div className="test-vote-actions">
                {effects.map((effect) => (
                  <button
                    key={effect}
                    disabled={busy || locked || show.phase !== "live"}
                    onClick={() =>
                      void run({ type: "rehearsal-effect", effect })
                    }
                  >
                    Test !{effect}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p>
              !rain · !thunder · !cheer
              <br />
              Gentle effects on stage, bounded per account.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
