"use client";
import { Check, CloudDrizzle, CloudLightning, Sparkles } from "lucide-react";
import type {
  AudienceChoice as Choice,
  PresenceEffect,
  ShowAction,
  ShowState,
} from "@/lib/contracts";
import { ROUND_DEFINITIONS } from "@/lib/show-grammar";
import { StatusPill } from "./ui";
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
      <h3>{definition.question}</h3>
      <div className="choice-status-row">
        {show.mode === "rehearsal" ? (
          <StatusPill tone="gold">Test vote</StatusPill>
        ) : null}
        {round ? (
          <StatusPill>
            {round.status === "open"
              ? `${seconds}s`
              : round.status === "closing"
                ? `Counting · ${seconds}s`
                : cancelled
                  ? "Cancelled"
                  : round.status === "applied"
                    ? "On stage"
                    : "Closed"}
          </StatusPill>
        ) : null}
      </div>
      {cancelled ? (
        <p role="status">Choice cancelled. Ask again with the next cue.</p>
      ) : null}
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
      {show.mode === "rehearsal" && round?.status === "open" ? (
        <div className="test-vote-actions">
          {definition.options.map((option) => (
            <button
              key={option.value}
              disabled={busy || locked}
              onClick={() => void testVote(option.value)}
            >
              {option.command}
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
          <span className="choice-credit">Director’s choice</span>
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
                ? "Choice"
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
        <div
          className="effect-chips"
          aria-label={
            show.mode === "rehearsal" ? "Test effects" : "Audience effects"
          }
        >
          {effects.map((effect) =>
            show.mode === "rehearsal" ? (
              <button
                key={effect}
                className="chip"
                aria-label={`Test !${effect}`}
                disabled={busy || locked || show.phase !== "live"}
                onClick={() => void run({ type: "rehearsal-effect", effect })}
              >
                !{effect}
              </button>
            ) : (
              <span className="chip" key={effect}>
                !{effect}
              </span>
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}
