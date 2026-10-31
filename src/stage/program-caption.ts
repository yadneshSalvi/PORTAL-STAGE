import type { AppliedDecision, RoundKind, ShowState } from "@/lib/contracts";
import { propLabel, ROUND_DEFINITIONS } from "@/lib/show-grammar";

function line(
  ctx: CanvasRenderingContext2D,
  value: string,
  y: number,
  size = 27,
  color = "#f3ebdc",
  family = "Fraunces",
) {
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  let fontSize = size;
  ctx.font = `${fontSize}px ${family}, ${family === "Fraunces" ? "Georgia" : "Arial"}`;
  while (ctx.measureText(value).width > 1180 && fontSize > 18) {
    fontSize -= 1;
    ctx.font = `${fontSize}px ${family}, Arial`;
  }
  ctx.fillText(value, 960, y, 1180);
}
export function decisionCredit(
  kind: RoundKind,
  decision: AppliedDecision,
): string {
  const label =
    ROUND_DEFINITIONS[kind].options.find(
      (option) => option.value === decision.choice,
    )?.label || decision.choice;
  if (decision.source === "rehearsal")
    return `REHEARSAL TEST CHOICE · ${label}`;
  if (decision.source === "director") return `DIRECTOR’S CHOICE · ${label}`;
  const names = decision.contributors.slice(0, 3).join(" · ");
  return `${decision.voters} ${decision.voters === 1 ? "voice chose" : "voices chose"} ${label.toLowerCase()}${names ? ` · ${names}` : ""}`;
}
export function stageStoryCaption(show: ShowState): {
  title: string;
  sub: string;
} {
  const prop = propLabel(show),
    transfer = show.umbrella.transfer;
  if (transfer?.status === "offered")
    return {
      title: `${transfer.to === "B" && show.mode === "solo" ? "Audience Room" : show.mode === "rehearsal" ? `Illustrated part ${transfer.to}` : show.participants[transfer.to].name || `Performer ${transfer.to}`}, could you hold this?`,
      sub: "AN OFFER IS WAITING · THE RECEIVER CHOOSES WHEN TO ACCEPT",
    };
  if (transfer?.status === "accepted")
    return {
      title: "Coming your way.",
      sub: `THE SAME ${prop.toUpperCase()}. A NEW ROOM.`,
    };
  if (show.parcel) {
    const destination =
      show.parcel.transformedRoom === "B" && show.mode === "solo"
        ? "the Audience Room"
        : `room ${show.parcel.transformedRoom || "B"}`;
    if (show.parcel.opened)
      return {
        title:
          show.parcel.contents === "stars"
            ? `A pocket of stars for ${destination}.`
            : `A midnight garden in ${destination}.`,
        sub: `${show.beat === "delivery" ? "THE GIFT HAS FOUND ITS HOME" : "THE RECEIVING ROOM HAS CHANGED"} · TAG ${show.parcel.tag} KEPT`,
      };
    return {
      title: show.parcel.stamped
        ? "A little parcel. An impossible delivery."
        : "Something is waiting for the midnight post.",
      sub: `TAG ${show.parcel.tag} · ${show.parcel.stamped ? "STAMPED · HANDLING MARKS TRAVEL WITH IT" : "A GIFT WAITING TO BE CHOSEN"}`,
    };
  }
  if (show.beat === "shelter")
    return {
      title:
        show.preset.ending === "playful-chase"
          ? "One last chase. A little more mischief."
          : "There’s room for one more.",
      sub:
        show.preset.ending === "playful-chase"
          ? `${show.preset.creatureName.toUpperCase()} FOLLOWS THE UMBRELLA INTO A PLAYFUL FAREWELL`
          : `${show.preset.creatureName.toUpperCase()} FOUND A SHARED SHELTER`,
    };
  if (show.creature.hatched)
    return {
      title: `Meet ${show.preset.creatureName}. ${show.creature.mood === "wild" ? "Curious about everything." : "A little shy. A little brave."}`,
      sub: "BORN FROM THE RUNOFF · FOLLOWING THE SAME UMBRELLA",
    };
  if (show.weather)
    return {
      title:
        show.weather === "wild"
          ? "A wonderfully wild storm."
          : "A gentler kind of rain.",
      sub: "WATCH WHAT THE WEATHER WAKES UP",
    };
  return {
    title: "A little weather. A little wonder.",
    sub: "TWO ROOMS. ONE IMPOSSIBLE STAGE.",
  };
}
export function drawStageCaption(
  ctx: CanvasRenderingContext2D,
  show: ShowState,
  now: number,
) {
  const round = show.round;
  const active = round && ["open", "closing", "closed"].includes(round.status);
  ctx.fillStyle = "#111827ed";
  ctx.beginPath();
  ctx.roundRect(310, 905, 1300, 151, 10);
  ctx.fill();
  if (active && round) {
    const kind = round.kind ?? "weather",
      definition = ROUND_DEFINITIONS[kind];
    line(ctx, definition.question, 944, 30);
    const total = definition.options.reduce(
      (sum, option) => sum + (round.tallies[option.value] || 0),
      0,
    );
    const column = 1120 / definition.options.length;
    definition.options.forEach((option, i) => {
      const x = 400 + column * i,
        width = column - 28,
        count = round.tallies[option.value] || 0;
      ctx.textAlign = "left";
      ctx.font = "18px Inter, Arial";
      ctx.fillStyle = round.result === option.value ? "#f2bc62" : "#d8d8cd";
      ctx.fillText(`${option.command} · ${option.label}`, x, 982, width - 30);
      ctx.textAlign = "right";
      ctx.fillText(String(count), x + width, 982);
      ctx.fillStyle = "#f3ebdc20";
      ctx.fillRect(x, 996, width, 7);
      ctx.fillStyle = round.result === option.value ? "#f2bc62" : "#64d8c8";
      ctx.fillRect(x, 996, total ? (width * count) / total : 0, 7);
    });
    const seconds = Math.max(0, Math.ceil((round.closesAt - now) / 1000));
    let footer = round.needsDirectorChoice
      ? "NO UNIQUE WINNER · EXPLICIT DIRECTOR CHOICE REQUIRED"
      : round.status === "closing"
        ? "COUNTING BALLOTS SENT INSIDE THE WINDOW"
        : round.status === "open"
          ? `${seconds}s · ONE REPLACEABLE CHOICE PER ACCOUNT`
          : "CHOICE CLOSED · THE DIRECTOR WILL BRING IT ON STAGE";
    if (show.mode === "rehearsal") footer = `LABELED TEST BALLOTS · ${footer}`;
    line(ctx, footer, 1035, 14, "#cbbda9", "Inter");
    return;
  }
  const caption = stageStoryCaption(show);
  line(ctx, caption.title, 952, 34);
  line(ctx, caption.sub, 990, 15, "#cbbda9", "Inter");
  const decision = (
    Object.entries(show.decisions || {}) as [RoundKind, AppliedDecision][]
  ).sort((a, b) => b[1].at - a[1].at)[0];
  if (decision && now >= decision[1].at && now - decision[1].at < 10_000)
    line(
      ctx,
      decisionCredit(decision[0], decision[1]),
      1031,
      16,
      "#aee0c8",
      "Inter",
    );
  else if (show.mode !== "rehearsal" && show.twitch.connected)
    line(
      ctx,
      "A LITTLE PRESENCE: !rain · !thunder · !cheer",
      1031,
      14,
      "#a9bdb8",
      "Inter",
    );
}
