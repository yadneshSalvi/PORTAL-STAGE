import type { ShowState, Slot } from "./contracts";

export const EPISODES = ["borrowed-weather", "midnight-parcel"] as const;
export type EpisodeId = (typeof EPISODES)[number];
export const ROUND_KINDS = [
  "weather",
  "name",
  "mood",
  "ending",
  "accept",
  "giveback",
  "contents",
  "parcel-ending",
] as const;
export type RoundKind = (typeof ROUND_KINDS)[number];
export const CHOICES = [
  "gentle",
  "wild",
  "pip1",
  "pip2",
  "pip3",
  "curious",
  "shy",
  "share",
  "chase",
  "accept",
  "wait",
  "giveback",
  "keep",
  "stars",
  "garden",
  "deliver",
] as const;
export type AudienceChoice = (typeof CHOICES)[number];
export const PRESENCE_EFFECTS = ["rain", "thunder", "cheer"] as const;
export type PresenceEffect = (typeof PRESENCE_EFFECTS)[number];
export const DELIVERY_GRACE_MS = 3000;
type Option = {
  value: AudienceChoice;
  label: string;
  command: string;
  description: string;
};
const option = (
  value: AudienceChoice,
  label: string,
  description: string,
): Option => ({ value, label, command: `!${value}`, description });
export const ROUND_DEFINITIONS: Record<
  RoundKind,
  { question: string; options: Option[] }
> = {
  weather: {
    question: "What kind of weather should arrive?",
    options: [
      option("gentle", "Gentle rain", "A soft shower and a shelter-seeker."),
      option("wild", "Wild rain", "A lively storm and a playful chase."),
    ],
  },
  name: {
    question: "What shall we call our little visitor?",
    options: [
      option("pip1", "Pip", "A small name for a curious visitor."),
      option("pip2", "Sprig", "A little green possibility."),
      option("pip3", "Moth", "A creature drawn to warm light."),
    ],
  },
  mood: {
    question: "How does the visitor greet this room?",
    options: [
      option("curious", "Curious", "It ventures out to investigate."),
      option("shy", "Shy", "It stays close to the shelter."),
    ],
  },
  ending: {
    question: "How should this weather story end?",
    options: [
      option(
        "share",
        "Share the shelter",
        "Make room beneath the same umbrella.",
      ),
      option(
        "chase",
        "One last chase",
        "Follow the umbrella into a playful farewell.",
      ),
    ],
  },
  accept: {
    question: "Audience Room, will you take this offer?",
    options: [
      option(
        "accept",
        "Accept it",
        "Receive the same prop in the Audience Room.",
      ),
      option(
        "wait",
        "Wait a moment",
        "The sender keeps it; no handoff commits.",
      ),
    ],
  },
  giveback: {
    question: "Audience Room, what happens next?",
    options: [
      option(
        "giveback",
        "Offer it back",
        "The streamer must accept your return offer.",
      ),
      option(
        "keep",
        "Keep it here",
        "Hold the prop in the Audience Room for now.",
      ),
    ],
  },
  contents: {
    question: "What is sleeping inside the parcel?",
    options: [
      option(
        "stars",
        "A pocket of stars",
        "Opening the parcel turns the receiving room into a constellation.",
      ),
      option(
        "garden",
        "A midnight garden",
        "Opening the parcel grows a luminous garden in the receiving room.",
      ),
    ],
  },
  "parcel-ending": {
    question: "Where should its impossible gift stay?",
    options: [
      option(
        "deliver",
        "Leave the gift",
        "The receiving room keeps the stars or garden.",
      ),
      option(
        "keep",
        "Bring the magic home",
        "The returned parcel lights the sender's room.",
      ),
    ],
  },
};
export const CREATURE_NAMES: Partial<Record<AudienceChoice, string>> = {
  pip1: "Pip",
  pip2: "Sprig",
  pip3: "Moth",
};
export function choicesFor(kind: RoundKind): AudienceChoice[] {
  return ROUND_DEFINITIONS[kind].options.map((item) => item.value);
}
export function isChoiceFor(kind: RoundKind, choice: AudienceChoice): boolean {
  return choicesFor(kind).includes(choice);
}
export function parseAudienceCommand(
  text: string,
): AudienceChoice | PresenceEffect | null {
  const match = /^!([a-z0-9]+)\s*$/i.exec(text.trim());
  const value = match?.[1]?.toLowerCase();
  return value &&
    [...CHOICES, ...PRESENCE_EFFECTS].includes(value as AudienceChoice)
    ? (value as AudienceChoice | PresenceEffect)
    : null;
}
export const propLabel = (show: Pick<ShowState, "episode">) =>
  show.episode === "midnight-parcel" ? "parcel" : "umbrella";
export const isAudienceRoom = (show: Pick<ShowState, "mode">, slot: Slot) =>
  show.mode === "solo" && slot === "B";
/** The software room has no human camera, readiness or consent to impersonate. */
export function isStageReady(show: ShowState, slot: Slot) {
  if (isAudienceRoom(show, slot)) return true;
  const p = show.participants[slot];
  return p.ready && p.admitted && p.consentBroadcast && p.connected && p.camera;
}
