import type { AppliedDecision, RoundKind, ShowState } from "@/lib/contracts";
import { propLabel, ROUND_DEFINITIONS } from "@/lib/show-grammar";

function line(
  ctx: CanvasRenderingContext2D,
  value: string,
  y: number,
  size = 36,
  color = "#f3ebdc",
  family = "Fraunces",
) {
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  ctx.font = `${size}px ${family}, ${family === "Fraunces" ? "Georgia" : "Arial"}`;
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
  if (decision.source === "rehearsal") return label;
  if (decision.source === "director") return `DIRECTOR’S CHOICE · ${label}`;
  const names = decision.contributors.slice(0, 3).join(" · ");
  return `${decision.voters} ${decision.voters === 1 ? "voice chose" : "voices chose"} ${label.toLowerCase()}${names ? ` · ${names}` : ""}`;
}
/** Story captions carry an actual beat; before any beat there is no caption. */
export function stageStoryCaption(show: ShowState): {
  title: string;
  sub: string;
} | null {
  const prop = propLabel(show),
    transfer = show.umbrella.transfer;
  if (transfer?.status === "offered")
    return {
      title: `${transfer.to === "B" && show.mode === "solo" ? "Audience Room" : show.mode === "rehearsal" ? `Room ${transfer.to}` : show.participants[transfer.to].name || `Performer ${transfer.to}`}, could you hold this?`,
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
    if (!show.parcel.stamped) return null;
    return {
      title: "A little parcel. An impossible delivery.",
      sub: `TAG ${show.parcel.tag} · STAMPED · HANDLING MARKS TRAVEL WITH IT`,
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
  return null;
}
export function drawStageCaption(
  ctx: CanvasRenderingContext2D,
  show: ShowState,
  now: number,
) {
  const round = show.round;
  const active = round && ["open", "closing", "closed"].includes(round.status);
  const box = (height: number) => {
    ctx.fillStyle = "#111827ed";
    ctx.beginPath();
    ctx.roundRect(310, 905, 1300, height, 10);
    ctx.fill();
  };
  if (active && round) {
    box(151);
    const kind = round.kind ?? "weather",
      definition = ROUND_DEFINITIONS[kind];
    line(ctx, definition.question, 944, 36);
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
      ctx.font = "24px Inter, Arial";
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
    const footer = round.needsDirectorChoice
      ? "Director’s choice required"
      : round.status === "closing"
        ? "Counting"
        : round.status === "open"
          ? `${seconds}s`
          : "Choice closed";
    line(ctx, footer, 1035, 24, "#cbbda9", "Inter");
    return;
  }
  const caption = stageStoryCaption(show);
  const decision = (
    Object.entries(show.decisions || {}) as [RoundKind, AppliedDecision][]
  ).sort((a, b) => b[1].at - a[1].at)[0];
  const credit =
    decision && now >= decision[1].at && now - decision[1].at < 10_000
      ? { value: decisionCredit(decision[0], decision[1]), color: "#aee0c8" }
      : show.mode !== "rehearsal" && show.twitch.connected
        ? { value: "!rain · !thunder · !cheer", color: "#a9bdb8" }
        : null;
  // The box fits its lines; with nothing to say, no box is drawn.
  if (caption && credit) {
    box(151);
    line(ctx, caption.title, 952, 36);
    line(ctx, credit.value, 1031, 24, credit.color, "Inter");
  } else if (caption) {
    box(76);
    line(ctx, caption.title, 952, 36);
  } else if (credit) {
    box(60);
    line(ctx, credit.value, 943, 24, credit.color, "Inter");
  }
}
