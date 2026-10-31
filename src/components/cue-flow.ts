import type { RoundKind, ShowAction, ShowState } from "@/lib/contracts";
import { propLabel, ROUND_DEFINITIONS } from "@/lib/show-grammar";

export type Cue = {
  title: string;
  description: string;
  label: string;
  act: ShowAction | null;
  number: string;
  waiting?: boolean;
};
const cue = (
  number: string,
  title: string,
  description: string,
  label: string,
  act: ShowAction | null,
  waiting = false,
): Cue => ({ number, title, description, label, act, waiting });
function choice(
  show: Pick<ShowState, "round">,
  kind: RoundKind,
  number: string,
  title: string,
): Cue {
  return cue(
    number,
    title,
    ROUND_DEFINITIONS[kind].question,
    "Open this choice",
    { type: "open-round", kind, previousRoundId: show.round?.id ?? null },
  );
}
function returnCue(show: ShowState): Cue {
  const prop = propLabel(show);
  if (show.mode === "solo" && show.umbrella.owner === "B")
    return choice(
      show,
      "giveback",
      "06",
      "Audience Room, shall we send it home?",
    );
  const fixture = show.mode === "rehearsal" && show.transport !== "livekit";
  const guestOffer = !fixture && show.umbrella.owner === "B";
  return cue(
    "06",
    "It remembers the way home.",
    `Offer the same ${prop} back. Its marks and its story travel with it.`,
    guestOffer ? "Waiting for your guest’s offer" : `Offer the ${prop} back`,
    guestOffer ? null : { type: "offer", from: show.umbrella.owner },
    guestOffer,
  );
}
export function nextCue(show: ShowState): Cue {
  const prop = propLabel(show);
  const parcel = show.episode === "midnight-parcel";
  const fixture = show.mode === "rehearsal" && show.transport !== "livekit";
  const crossings = show.umbrella.acceptedTransfers;
  const transfer = show.umbrella.transfer;
  if (show.phase === "ended")
    return cue(
      "FIN",
      "A lovely place to leave it.",
      "The show has ended and the curtain is closed. Your saved version and stage record stay with this show.",
      "Show ended",
      null,
    );
  if (crossings === null)
    return cue(
      "?",
      "Earlier scene history is incomplete.",
      "The current prop is intact. Continue using manual controls, or hold and reset the scene, or start a new episode.",
      "Manual controls are available",
      null,
    );
  if (show.phase === "hold")
    return cue(
      "Ⅱ",
      "Take your time.",
      `The curtain is safely closed. The same ${prop} and its committed story are waiting here.`,
      "Resume the scene",
      { type: "resume" },
    );
  if (show.phase === "backstage")
    return cue(
      "01",
      parcel ? "The midnight post is open." : "Let the story begin.",
      fixture
        ? "Your illustrated rooms are ready. Try the story with labeled test ballots, with an optional local camera."
        : show.mode === "solo"
          ? "Prepare your camera and consent, then admit yourself. The illustrated Audience Room needs no guest invitation."
          : "Both performers must be ready and admitted before you open the curtain.",
      parcel ? "Open the sorting office" : "Open the curtain",
      { type: "start" },
    );
  const round = show.round;
  if (round && ["open", "closing", "closed"].includes(round.status)) {
    const kind = round.kind ?? "weather";
    const definition = ROUND_DEFINITIONS[kind];
    if (round.status === "open")
      return cue(
        "✦",
        definition.question,
        "Let the room have its say. Tied or empty choices wait for your deliberate decision.",
        "Close this choice",
        { type: "close-round", roundId: round.id },
      );
    if (round.status === "closing")
      return cue(
        "✦",
        "The last voices are finding their seats.",
        "Voting is closed. Messages sent inside the window have a brief delivery grace period before the result is final.",
        "Counting final ballots…",
        null,
        true,
      );
    if (round.needsDirectorChoice || !round.result)
      return cue(
        "✦",
        "The next word is yours.",
        "There is no unique audience winner. Choose deliberately in the choice card, then bring the result onto the stage.",
        "Director choice needed",
        null,
      );
    const selected = definition.options.find(
      (option) => option.value === round.result,
    );
    return cue(
      "✦",
      selected?.label || "A choice is ready.",
      selected?.description || definition.question,
      kind === "weather"
        ? "Let it rain"
        : `Bring ${selected?.label.toLowerCase() || "this choice"} on stage`,
      kind === "weather"
        ? { type: "apply-weather", roundId: round.id }
        : { type: "apply-choice", roundId: round.id },
    );
  }
  if (transfer?.status === "accepted")
    return cue(
      crossings > 1 ? "06" : "04",
      "Coming your way.",
      `The receiver accepted. The same ${prop} is now crossing between rooms.`,
      `${parcel ? "Parcel" : "Umbrella"} crossing…`,
      null,
      true,
    );
  if (transfer?.status === "offered") {
    if (show.mode === "solo" && transfer.to === "B")
      return cue(
        "04",
        "Audience Room, this one is for you.",
        "Open a fresh audience choice for this offer. Accept and Wait are real choices; a tie never accepts on your behalf.",
        "Ask the Audience Room",
        {
          type: "open-round",
          kind: "accept",
          previousRoundId: show.round?.id ?? null,
        },
      );
    const canAccept = fixture || transfer.to === "A";
    return cue(
      crossings ? "06" : "04",
      "An invitation, not a race.",
      fixture
        ? `Play the receiving illustrated part ${transfer.to}, or use your own hand cue when the prop comes home to A.`
        : transfer.to === "A"
          ? `The ${prop} is offered to you. Accept when you are ready.`
          : "Your guest accepts from their own backstage controls.",
      canAccept
        ? `Accept as ${transfer.to === "A" ? "performer A" : "illustrated part B"}`
        : "Waiting for the receiver",
      canAccept
        ? { type: "accept", transferId: transfer.id, slot: transfer.to }
        : null,
      !canAccept,
    );
  }
  if (parcel) {
    if (!show.parcel?.contents)
      return choice(
        show,
        "contents",
        "02",
        "Something impossible is packed inside.",
      );
    if (!show.parcel.stamped)
      return cue(
        "03",
        "Give it a mark to remember.",
        "Stamp the parcel in the sender’s room. Its tag and handling marks stay with it through both crossings.",
        "Stamp the parcel",
        { type: "stamp-parcel" },
      );
    if (crossings < 1)
      return cue(
        "04",
        "A delivery between worlds.",
        "Offer the stamped parcel. Its contents change the receiving room when opened.",
        "Offer the parcel",
        { type: "offer", from: "A" },
      );
    if (!show.parcel.opened)
      return cue(
        "05",
        "Open a little midnight.",
        show.parcel.contents === "stars"
          ? "Unpack a pocket of stars. The receiving room becomes a constellation."
          : "Unpack a midnight garden. Luminous stems grow in the receiving room.",
        "Open the parcel",
        { type: "open-parcel" },
      );
    if (crossings < 2) return returnCue(show);
    if (!show.parcel.ending)
      return choice(
        show,
        "parcel-ending",
        "07",
        "Where should this gift belong?",
      );
    if (show.beat !== "delivery")
      return cue(
        "07",
        "A room keeps the impossible.",
        show.parcel.ending === "deliver"
          ? "Leave the stars or garden in the receiving room. The marked parcel comes home."
          : "Bring the magic home. The sender’s room now keeps the stars or garden.",
        "Complete the delivery",
        { type: "finish-parcel" },
      );
    return cue(
      "08",
      "The last post of the evening.",
      "The parcel came home with the same tag and a few more handling marks. Let the room enjoy what it chose.",
      "Close the sorting office",
      { type: "end" },
    );
  }
  if (!show.weather)
    return choice(show, "weather", "02", "Ask for a little weather.");
  if (crossings < 1)
    return cue(
      "04",
      "Could you hold this?",
      "Offer the patched umbrella. Your partner, or the Audience Room, decides whether to take it.",
      "Offer the umbrella",
      { type: "offer", from: "A" },
    );
  if (!show.decisions?.name)
    return choice(show, "name", "05", "A visitor needs a name.");
  if (!show.decisions?.mood)
    return choice(
      show,
      "mood",
      "05",
      "A small creature, a little personality.",
    );
  if (!show.creature.hatched)
    return cue(
      "05",
      "Something in the runoff.",
      `Meet ${show.preset.creatureName}. The chosen mood decides whether it ventures out or stays near shelter.`,
      `Meet ${show.preset.creatureName}`,
      { type: "hatch" },
    );
  if (crossings < 2) return returnCue(show);
  if (!show.decisions?.ending)
    return choice(show, "ending", "07", "Let the room write the last scene.");
  if (show.beat !== "shelter")
    return cue(
      "07",
      show.preset.ending === "playful-chase"
        ? "One last bit of mischief."
        : "Room for one more.",
      show.preset.ending === "playful-chase"
        ? "The umbrella leads one last playful chase across the stage."
        : "Bring the umbrella to center stage. The little visitor finds a shared shelter.",
      show.preset.ending === "playful-chase"
        ? "Cue the playful chase"
        : "Share the shelter",
      { type: "shelter" },
    );
  return cue(
    "08",
    "The rest is yours.",
    "Stay in the moment. When this scene has found its ending, close the curtain.",
    "Take a bow",
    { type: "end" },
  );
}
