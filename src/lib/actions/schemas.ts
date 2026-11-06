import { z } from "zod";

import { REPORT_DETAIL_MAX } from "@/lib/data/rules";
import { REPORT_REASONS } from "@/lib/data/types";
import type { AchievementKind, AgeConsent, AthleteLevel, ProfileVisibility } from "@/lib/database.types";
import { latestToday } from "@/lib/dates";
import { KIND_OPTIONS, LEVEL_OPTIONS } from "@/lib/format";
import { HANDLE_PATTERN, isReservedHandle } from "@/lib/handles";
import { normalizeSocialHandle, type SocialKind } from "@/lib/links";
import { feetInchesToCm, HEIGHT_CM_RANGE, lbsToKg, WEIGHT_KG_RANGE } from "@/lib/measurables";
import { normalizePositions } from "@/lib/positions";
import { parseMark } from "@/lib/sport-events";
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
    // Optional in the input: a form (or POST) from before units read as none.
    unit: optionalText
      .pipe(z.string().max(12).nullable())
      .optional()
      .transform((v) => v ?? null),
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
  })
  // The number behind the mark (#55), when the mark is one measurement in
  // the chosen unit: "4:12.50" sec → 252.5. Never typed, so never out of
  // step with what the resume shows.
  .transform((entry) => ({ ...entry, value_numeric: parseMark(entry.value_display, entry.unit) }));

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

// ---------------------------------------------------------------------------
// Onboarding (#52)
// ---------------------------------------------------------------------------

/** The kinds a new account may choose. Brand and staff are granted, not picked. */
export const ONBOARDING_KINDS = ["athlete", "recruiter", "coach"] as const;
export type OnboardingKind = (typeof ONBOARDING_KINDS)[number];

/** Anything else — absent, forged, "staff" — is the athlete flow, the default the old form always posted. */
export const onboardingKind = z.enum(ONBOARDING_KINDS).catch("athlete");

const LEVELS = LEVEL_OPTIONS.map(([value]) => value) as [AthleteLevel, ...AthleteLevel[]];

export const athleteOnboardingSchema = z.object({
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(HANDLE_PATTERN, "Handles are 3–30 characters: lowercase letters, numbers, underscores.")
    .refine((handle) => !isReservedHandle(handle), "That handle is reserved."),
  display_name: z.string().trim().min(2, "Enter your name.").max(80),
  level: z.enum(LEVELS),
  // No default sport: an athlete who skipped the choice would otherwise be
  // listed under football in search.
  primary_sport: requiredSport,
  grad_year: optionalNumber(z.number().int().min(1950).max(2100)),
  visibility: z.enum(["private", "unlisted", "public"] satisfies ProfileVisibility[]).default("public"),
  // #44: 18 or older, or a parent or guardian agreed. Required — many
  // athletes are minors, and the resume publishes their name and school.
  age_consent: z.enum(["adult", "guardian"] satisfies AgeConsent[], {
    error: "Confirm you're 18 or older, or that a parent or guardian agreed.",
  }),
});

/** Reasons offered by "Report this profile" (#50). */
export const reportSchema = z.object({
  profile_id: z.uuid(),
  reason: z.enum(REPORT_REASONS, { error: "Pick a reason." }),
  detail: z
    .string()
    .trim()
    .max(REPORT_DETAIL_MAX, `Keep it under ${REPORT_DETAIL_MAX} characters.`)
    .transform((v) => (v === "" ? null : v)),
});

/**
 * Recruiters and coaches: who they are and who they're with. No handle to
 * claim (one is generated — they have no public resume), no sport or level.
 * The program lands in `school`, the role in `title` (0008).
 */
export const memberOnboardingSchema = z.object({
  display_name: z.string().trim().min(2, "Enter your name.").max(80),
  school: z.string().trim().min(2, "Enter your program or organization.").max(120),
  title: optionalText.pipe(z.string().max(80).nullable()),
});

// ---------------------------------------------------------------------------
// Identity: imperial measurables (#54) and positions (#60)
// ---------------------------------------------------------------------------

/**
 * Feet, inches, and pounds from the editor, as the metric columns. Each
 * part is checked on its own (a 13-inch "inches" is a typo, not 1'1"), and
 * the converted total against the column's range.
 */
export const imperialMeasurablesSchema = z
  .object({
    height_ft: optionalNumber(z.number({ message: "Feet must be a number." }).int("Whole feet.").min(3, "Feet: 3–8.").max(8, "Feet: 3–8.")),
    height_in: optionalNumber(z.number({ message: "Inches must be a number." }).min(0, "Inches: 0–11.").max(11.99, "Inches: 0–11.")),
    weight_lbs: optionalNumber(z.number({ message: "Weight must be a number." }).min(55, "Weight: 55–660 lbs.").max(660, "Weight: 55–660 lbs.")),
  })
  .superRefine((m, ctx) => {
    if (m.height_ft === null && m.height_in !== null) {
      ctx.addIssue({ code: "custom", message: "Add feet too — 6 ft 2 in, not 74 in.", path: ["height_ft"] });
    }
    const cm = feetInchesToCm(m.height_ft, m.height_in);
    if (cm !== null && (cm < HEIGHT_CM_RANGE[0] || cm > HEIGHT_CM_RANGE[1])) {
      ctx.addIssue({ code: "custom", message: "That height is out of range.", path: ["height_ft"] });
    }
  })
  .transform((m) => {
    const kg = lbsToKg(m.weight_lbs);
    return {
      height_cm: feetInchesToCm(m.height_ft, m.height_in),
      weight_kg: kg === null ? null : Math.min(Math.max(kg, WEIGHT_KG_RANGE[0]), WEIGHT_KG_RANGE[1]),
    };
  });

/** The comma-joined chip field, as the stored array (≤ 6, deduplicated). */
export const positionsField = z.string().transform((raw) => normalizePositions(raw));
