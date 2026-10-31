import { z } from "zod";
import type { ActionEnvelope } from "@/lib/contracts";
import { HttpError } from "./errors";
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
    "open-round",
    "hatch",
    "shelter",
  ].map(simple),
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
      fallback: z.enum(["gentle", "wild"]).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("apply-weather"),
      weather: z.enum(["gentle", "wild"]).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("rehearsal-vote"),
      choice: z.enum(["gentle", "wild"]),
      voter: z.string().regex(/^[\w-]{1,64}$/),
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
