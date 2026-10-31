"use client";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CloudDrizzle,
  CloudLightning,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import type { ShowAction, ShowState, Weather } from "@/lib/contracts";
import { useNow } from "./use-show-controller";
import { NewShowButton } from "./new-show-button";

export type Cue = {
  title: string;
  description: string;
  label: string;
  act: ShowAction | null;
  number: string;
  waiting?: boolean;
};
export function nextCue(show: ShowState): Cue {
  const solo = show.mode === "rehearsal" && show.transport !== "livekit";
  const transfer = show.umbrella.transfer,
    crossings = show.events.filter(
      (e) => e.type === "action.accept" && e.propId === show.umbrella.id,
    ).length;
  if (show.phase === "ended")
    return {
      number: "FIN",
      title: "A lovely place to leave it.",
      description:
        "The show has ended and the curtain is closed. Your saved version and stage record stay with this show.",
      label: "Show ended",
      act: null,
    };
  if (show.phase === "hold")
    return {
      number: "Ⅱ",
      title: "Take your time.",
      description:
        "The curtain is safely closed. Your umbrella, weather, and story are waiting right here.",
      label: "Resume the scene",
      act: { type: "resume" },
    };
  if (show.phase === "backstage")
    return {
      number: "01",
      title: "Let the story begin.",
      description:
        show.mode === "rehearsal"
          ? "Your illustrated test plates are ready. Open the curtain and try the full show, one cue at a time."
          : "Both performers need to be ready and admitted before you open the curtain.",
      label: "Open the curtain",
      act: { type: "start" },
    };
  if (transfer?.status === "offered")
    return {
      number: crossings ? "07" : "05",
      title: "An invitation, not a race.",
      description: solo
        ? `Perform both sides of the handoff. Accept as test performer ${transfer.to}, then watch the same umbrella cross.`
        : transfer.to === "A"
          ? "Your scene partner has offered the umbrella. Accept when you are ready to catch it."
          : `Waiting for ${show.participants[transfer.to].name} to accept from their own backstage controls.`,
      label: solo
        ? `Accept as performer ${transfer.to}`
        : transfer.to === "A"
          ? "Accept the umbrella"
          : "Waiting for the receiver",
      act:
        solo || transfer.to === "A"
          ? { type: "accept", transferId: transfer.id, slot: transfer.to }
          : null,
      waiting: !solo && transfer.to !== "A",
    };
  if (transfer?.status === "accepted")
    return {
      number: crossings > 1 ? "07" : "05",
      title: "Coming your way.",
      description:
        "The same patched umbrella is crossing. Get ready to catch it.",
      label: "Umbrella crossing…",
      act: null,
      waiting: true,
    };
  if (!show.round || show.round.status === "cancelled")
    return {
      number: "02",
      title: "Ask for a little weather.",
      description:
        show.mode === "rehearsal"
          ? "Open a test choice. Add labeled rehearsal ballots, or let the director choose the rain."
          : "Invite your Twitch community to choose the storm with !gentle or !wild.",
      label: "Open the weather choice",
      act: { type: "open-round" },
    };
  if (show.round.status === "open")
    return {
      number: "03",
      title: "Give the room a moment.",
      description:
        "Close the choice when you are ready. With no ballots, your selected fallback becomes Director’s choice.",
      label: "Close the weather choice",
      act: { type: "close-round", fallback: show.preset.defaultWeather },
    };
  if (!show.weather)
    return {
      number: "04",
      title: "Bring in the weather.",
      description: `The choice is ${show.round.result || show.preset.defaultWeather}. Cue the rain, then give your performers a beat to react.`,
      label: "Let it rain",
      act: { type: "apply-weather" },
    };
  if (crossings < 1)
    return {
      number: "05",
      title: "Could you hold this?",
      description: `Performer ${show.umbrella.owner} offers the patched umbrella. The receiver decides when to accept.`,
      label:
        !solo && show.umbrella.owner === "B"
          ? "Waiting for your guest’s offer"
          : "Offer the umbrella",
      act:
        !solo && show.umbrella.owner === "B"
          ? null
          : { type: "offer", from: show.umbrella.owner },
      waiting: !solo && show.umbrella.owner === "B",
    };
  if (!show.creature.hatched)
    return {
      number: "06",
      title: "Something in the runoff.",
      description: `Wake ${show.preset.creatureName}. ${show.weather === "wild" ? "This storm brings a curious, bouncing little mischief-maker." : "A gentle shower brings a shy little shelter-seeker."}`,
      label: `Meet ${show.preset.creatureName}`,
      act: { type: "hatch" },
    };
  if (crossings < 2)
    return {
      number: "07",
      title: "It knows where home is.",
      description: `${show.preset.creatureName} follows the very same umbrella. Offer it back and see what happens.`,
      label:
        !solo && show.umbrella.owner === "B"
          ? "Waiting for your guest’s offer"
          : "Offer the umbrella back",
      act:
        !solo && show.umbrella.owner === "B"
          ? null
          : { type: "offer", from: show.umbrella.owner },
      waiting: !solo && show.umbrella.owner === "B",
    };
  if (show.beat !== "shelter")
    return {
      number: "08",
      title: "Room for one more.",
      description:
        show.preset.ending === "playful-chase"
          ? "Bring the umbrella to center stage for one last playful chase."
          : "Bring the umbrella to center stage. A little shared shelter makes a good ending.",
      label:
        show.preset.ending === "playful-chase"
          ? "Cue the playful ending"
          : "Share the shelter",
      act: { type: "shelter" },
    };
  return {
    number: "FIN",
    title: "The rest is yours.",
    description:
      "Stay in the moment. When the scene has found its ending, close the curtain.",
    label: "Take a bow",
    act: { type: "end" },
  };
}
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
          <NewShowButton className="button button-gold">
            New rehearsal
          </NewShowButton>
          <Link href="/studio" className="button button-dark">
            New show <ArrowRight size={16} aria-hidden="true" />
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
            {!busy && !cue.waiting ? (
              <ArrowRight size={16} aria-hidden="true" />
            ) : null}
          </button>
          <span className="cue-key-hint">
            {cue.waiting ? (
              "The stage will update as the story moves."
            ) : (
              <>
                Keyboard: <kbd>Space</kbd> for this cue
              </>
            )}
          </span>
        </>
      )}
    </section>
  );
}
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
  const seconds =
    round && now
      ? Math.max(0, Math.ceil((round.closesAt - now - serverOffset) / 1000))
      : show.preset.roundSeconds;
  async function testVote(choice: Weather) {
    await run({
      type: "rehearsal-vote",
      choice,
      voter: `rehearsal-${crypto.randomUUID()}`,
    });
  }
  return (
    <section className="audience-panel">
      <div className="panel-eyebrow">
        <span>
          {show.mode === "rehearsal" ? "REHEARSAL CHOICE" : "AUDIENCE CHOICE"}
        </span>
        {round?.status === "open" ? (
          <span className="round-clock">{seconds}s</span>
        ) : (
          <span>
            {round?.status === "applied"
              ? "ON STAGE"
              : round?.status === "closed"
                ? "CLOSED"
                : "UP NEXT"}
          </span>
        )}
      </div>
      <h3>Set the storm.</h3>
      <p>
        {show.mode === "rehearsal"
          ? "Test ballots demonstrate the choice. They are not real audience input."
          : round?.status === "open"
            ? "One choice per viewer. A later valid command replaces it."
            : "Open a choice to invite !gentle or !wild from your channel."}
      </p>
      <div className="audience-options">
        {(["gentle", "wild"] as Weather[]).map((choice) => (
          <div
            className={`audience-option ${round?.result === choice ? "chosen" : ""}`}
            key={choice}
          >
            {choice === "gentle" ? (
              <CloudDrizzle size={19} />
            ) : (
              <CloudLightning size={19} />
            )}
            <div>
              <span>!{choice}</span>
              <small>
                {choice === "gentle"
                  ? "A shy little friend"
                  : "A little mischief"}
              </small>
            </div>
            <strong>{round?.tallies[choice] || 0}</strong>
            {round?.result === choice ? <Check size={13} /> : null}
          </div>
        ))}
      </div>
      {show.mode === "rehearsal" && round?.status === "open" ? (
        <div className="test-vote-actions">
          <button
            disabled={busy || locked}
            onClick={() => void testVote("gentle")}
          >
            Test !gentle
          </button>
          <button
            disabled={busy || locked}
            onClick={() => void testVote("wild")}
          >
            Test !wild
          </button>
        </div>
      ) : null}
      {round?.result ? (
        <div className="choice-result">
          <Sparkles size={14} />
          {round.source === "audience"
            ? "Audience choice"
            : round.source === "rehearsal"
              ? "Rehearsal test choice"
              : "Director’s choice"}
          : {round.result}
        </div>
      ) : null}
    </section>
  );
}
