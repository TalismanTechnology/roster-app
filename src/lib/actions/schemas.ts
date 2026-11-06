import { z } from "zod";

import type { AchievementKind } from "@/lib/database.types";
import { latestToday } from "@/lib/dates";
import { KIND_OPTIONS } from "@/lib/format";
import { normalizeSocialHandle, type SocialKind } from "@/lib/links";
import { SPORTS } from "@/lib/sports";

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

/**
 * Per-field messages from a failed parse, keyed by field name, for the
 * form to show beside each input. Refinements without a path (a reference
 * needs an email *or* a phone) belong to no field and stay out of this; the
 * form's top-line error still carries them.
 */
export function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const { fieldErrors } = z.flattenError(error);
  const out: Record<string, string[]> = {};
  for (const [name, messages] of Object.entries(fieldErrors as Record<string, string[] | undefined>)) {
    if (messages && messages.length > 0) out[name] = messages;
  }
  return out;
}

/**
 * A social account as the bare handle, whatever was pasted — `@ava`, a
 * profile URL, a URL without its scheme. "" → null; anything that isn't a
 * handle on that site is refused rather than stored and silently dropped
 * from the resume later.
 */
export const socialHandleField = (kind: SocialKind, message: string) =>
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === "") return null;
      const handle = normalizeSocialHandle(value, kind);
      if (handle === null) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return handle;
    });

const SPORT_KEYS = new Set(SPORTS.map(([value]) => value));

/** A sport from the list, chosen on purpose: there is no default to fall into. */
export const requiredSport = z
  .string()
  .trim()
  .refine((value) => SPORT_KEYS.has(value), "Pick a sport.");

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

/** A reference the athlete lists. Reachable or it isn't worth listing: email or phone, at least one. */
export const coachSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the coach's name.").max(80),
    role: optionalText.pipe(z.string().max(80).nullable()),
    org_name: optionalText.pipe(z.string().max(120).nullable()),
    email: optionalText.pipe(z.string().email("Enter a valid email.").nullable()),
    phone: optionalText.pipe(z.string().max(25).nullable()),
  })
  .refine((coach) => coach.email !== null || coach.phone !== null, {
    message: "A reference needs an email or a phone number.",
  });
