import { z } from "zod";

import type { AchievementKind } from "@/lib/database.types";
import { latestToday } from "@/lib/dates";
import { KIND_OPTIONS } from "@/lib/format";

/**
 * Input schemas the Server Actions share. A plain module, not `"use
 * server"`: those may only export async functions, and keeping the schemas
 * here lets the unit tests exercise exactly what the actions enforce.
 */

/** Row ids. Every table keys on a UUID; anything else is a forged or stale form. */
export const idSchema = z.uuid();

/** "" → null, so an emptied optional field clears the column instead of
 *  writing an empty string that renders as a blank line forever after. */
export const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value));

export const optionalNumber = (schema: z.ZodNumber) =>
  z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : Number(value)))
    .pipe(schema.nullable());

/** A web link: http(s) only, so a `javascript:` URL can never become an href. */
export const httpUrl = z
  .string()
  .url("Enter a full URL.")
  .refine((url) => /^https?:\/\//i.test(url), "Links must start with http:// or https://.");

const KINDS = KIND_OPTIONS.map(([value]) => value);

export const achievementSchema = z
  .object({
    kind: z.enum(KINDS as [AchievementKind, ...AchievementKind[]]),
    title: z.string().trim().min(3, "Give the entry a title.").max(120),
    detail: optionalText.pipe(z.string().max(500).nullable()),
    value_display: optionalText.pipe(z.string().max(20).nullable()),
    competition: optionalText.pipe(z.string().max(120).nullable()),
    location: optionalText.pipe(z.string().max(120).nullable()),
    placement: optionalNumber(z.number().int().min(1).max(10000)),
    field_size: optionalNumber(z.number().int().min(1).max(100000)),
    achieved_on: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date it happened.")
      .refine((date) => !Number.isNaN(Date.parse(date)), "Pick the date it happened.")
      // Evaluated per parse, not at import: "today" moves.
      .refine((date) => date <= latestToday(), "The date can't be in the future."),
  })
  .refine((entry) => entry.placement === null || entry.field_size === null || entry.placement <= entry.field_size, {
    message: "Placement can't be larger than the field size.",
    path: ["placement"],
  });
