import { z } from "zod";
import type { ActionEnvelope } from "@/lib/contracts";
import { HttpError } from "./errors";
import {
  CHOICES,
  EPISODES,
  PRESENCE_EFFECTS,
  ROUND_KINDS,
} from "@/lib/show-grammar";
const slot = z.enum(["A", "B"]);
const point = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  })
  .strict();
export const presetSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    name: z.string().trim().min(1).max(60),
    episodeTitle: z.string().trim().min(1).max(60),
    creatureName: z.string().trim().min(1).max(24),
    defaultWeather: z.enum(["gentle", "wild"]),
    crossingMs: z.number().int().min(900).max(1400),
    rainIntensity: z.number().min(0.2).max(1),
    creatureCuriosity: z.number().min(0.1).max(1),
    roundSeconds: z.number().int().min(15).max(90),
    reducedMotion: z.boolean(),
    ending: z.enum(["shared-shelter", "playful-chase"]),
    episode: z.enum(EPISODES).optional(),
    defaultContents: z.enum(["stars", "garden"]).optional(),
    parcelEnding: z.enum(["deliver", "keep"]).optional(),
  })
  .strict();
const simple = (type: string) => z.object({ type: z.literal(type) }).strict();
const actions = z.union([
  ...[
    "start",
    "hold",
    "resume",
    "end",
    "panic",
    "reset",
    "restore-rehearsal",
    "stamp-parcel",
    "open-parcel",
    "finish-parcel",
    "hatch",
    "shelter",
  ].map(simple),
  z
    .object({
      type: z.literal("open-round"),
      kind: z.enum(ROUND_KINDS).optional(),
      previousRoundId: z.string().min(1).max(128).nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal("resolve-round"),
      choice: z.enum(CHOICES),
      roundId: z.string().min(1).max(128),
    })
    .strict(),
  z
    .object({
      type: z.literal("apply-choice"),
      roundId: z.string().min(1).max(128),
    })
    .strict(),
  z
    .object({
      type: z.literal("rehearsal-effect"),
      effect: z.enum(PRESENCE_EFFECTS),
    })
    .strict(),
  ...["admit", "hide"].map((type) =>
    z.object({ type: z.literal(type), slot }).strict(),
  ),
  z
    .object({
      type: z.literal("consent"),
      broadcast: z.boolean(),
      recording: z.boolean(),
      name: z.string().trim().min(1).max(40).optional(),
      slot: slot.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("presence"),
      connected: z.boolean(),
      camera: z.boolean(),
      microphone: z.boolean(),
      slot: slot.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("ready"),
      ready: z.boolean(),
      slot: slot.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("calibrate"),
      anchor: point,
      handedness: z.enum(["left", "right"]),
      slot: slot.optional(),
    })
    .strict(),
  z
    .object({ type: z.literal("anchor"), anchor: point, slot: slot.optional() })
    .strict(),
  z.object({ type: z.literal("arm"), armed: z.boolean() }).strict(),
  z.object({ type: z.literal("offer"), from: slot.optional() }).strict(),
  ...["accept", "decline", "cancel-offer"].map((type) =>
    z
      .object({
        type: z.literal(type),
        transferId: z.string().min(1).max(128),
        slot: slot.optional(),
      })
      .strict(),
  ),
  z
    .object({
      type: z.literal("arrive"),
      transferId: z.string().min(1).max(128),
    })
    .strict(),
  z.object({ type: z.literal("recall"), to: slot }).strict(),
  z
    .object({
      type: z.literal("close-round"),
      fallback: z.enum(CHOICES).optional(),
      roundId: z.string().min(1).max(128),
    })
    .strict(),
  z
    .object({
      type: z.literal("apply-weather"),
      weather: z.enum(["gentle", "wild"]).optional(),
      roundId: z.string().min(1).max(128).nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal("rehearsal-vote"),
      choice: z.enum(CHOICES),
      voter: z.string().regex(/^[\w-]{1,64}$/),
      roundId: z.string().min(1).max(128),
    })
    .strict(),
  z.object({ type: z.literal("save-preset"), preset: presetSchema }).strict(),
  z
    .object({ type: z.literal("load-preset"), presetId: z.string().max(64) })
    .strict(),
  z.object({ type: z.literal("leave"), slot: slot.optional() }).strict(),
]);
const envelope = z
  .object({
    action: actions,
    idempotencyKey: z.string().min(8).max(128),
    expectedVersion: z.number().int().nonnegative().optional(),
    epoch: z.number().int().nonnegative().optional(),
    rendererId: z.string().min(8).max(128).optional(),
    incarnationId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{8,128}$/)
      .optional(),
    incarnationSequence: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
  })
  .strict();
export function parseAction(value: unknown): ActionEnvelope {
  const result = envelope.safeParse(value);
  if (!result.success)
    throw new HttpError(
      400,
      "invalid_action",
      "This stage action is incomplete or outside its allowed limits.",
    );
  return result.data as ActionEnvelope;
}
