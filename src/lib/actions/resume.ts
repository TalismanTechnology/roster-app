"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getRepository } from "@/lib/data";
import type { AthleteLevel, ProfileVisibility } from "@/lib/database.types";
import { LEVEL_OPTIONS } from "@/lib/format";
import { isReservedHandle, HANDLE_PATTERN } from "@/lib/handles";
import { toStateCode } from "@/lib/regions";

import { achievementSchema, httpUrl, idSchema, optionalNumber, optionalText } from "./schemas";
import { failed, formValues, requireUser, str, type FormValues } from "./shared";

/**
 * Every write behind the resume editor.
 *
 * Authorization is layered: each action requires a session before touching
 * anything, and the repository re-checks ownership row by row underneath —
 * RLS in Supabase mode, the same rules in TypeScript in local mode. A stale
 * form therefore fails loudly with "not found" instead of silently writing
 * nothing.
 */

export type FormState = {
  ok: boolean;
  error: string | null;
  /** On failure, what was submitted — the form puts it back. */
  values?: FormValues;
};

const IDLE: FormState = { ok: true, error: null };

/** A validation failure, carrying the submitted fields back to the form. */
function invalid(error: z.ZodError, formData: FormData): FormState {
  return { ok: false, error: error.issues[0].message, values: formValues(formData) };
}

// ---------------------------------------------------------------------------
// Onboarding — the one insert into profiles
// ---------------------------------------------------------------------------

// The label maps in format.ts are the single source for both enums.
const LEVELS = LEVEL_OPTIONS.map(([value]) => value);

const onboardingSchema = z.object({
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(HANDLE_PATTERN, "Handles are 3–30 characters: lowercase letters, numbers, underscores.")
    .refine((handle) => !isReservedHandle(handle), "That handle is reserved."),
  display_name: z.string().trim().min(2, "Enter your name.").max(80),
  level: z.enum(LEVELS as [AthleteLevel, ...AthleteLevel[]]),
  primary_sport: optionalText,
  grad_year: optionalNumber(z.number().int().min(1950).max(2100)),
  visibility: z.enum(["private", "unlisted", "public"] satisfies ProfileVisibility[]).default("public"),
});

export async function completeOnboarding(_prev: FormState, formData: FormData): Promise<FormState> {
  const { repo, user } = await requireUser();

  const parsed = onboardingSchema.safeParse({
    handle: str(formData, "handle"),
    display_name: str(formData, "display_name"),
    level: str(formData, "level"),
    primary_sport: str(formData, "primary_sport"),
    grad_year: str(formData, "grad_year"),
    visibility: str(formData, "visibility") || "public",
  });

  if (!parsed.success) return invalid(parsed.error, formData);

  try {
    await repo.createProfile({ id: user.id, ...parsed.data });
  } catch (error) {
    return failed(error, "Could not create your resume. Try again.", formValues(formData));
  }

  redirect("/resume");
}

/** Live availability for the onboarding form. Read-only; safe to call freely. */
export async function checkHandle(handle: string): Promise<"available" | "taken" | "invalid"> {
  const h = handle.trim().toLowerCase();
  if (!HANDLE_PATTERN.test(h) || isReservedHandle(h)) return "invalid";
  const repo = await getRepository();
  return (await repo.isHandleAvailable(h)) ? "available" : "taken";
}

// ---------------------------------------------------------------------------
// Profile details
// ---------------------------------------------------------------------------

const identitySchema = z.object({
  display_name: z.string().trim().min(2, "Enter your name.").max(80),
  bio: optionalText.pipe(z.string().max(500).nullable()),
  location: optionalText,
  region: optionalText.pipe(
    z
      .string()
      .transform((code, ctx) => {
        const state = toStateCode(code);
        if (!state) ctx.addIssue({ code: "custom", message: "Pick a state from the list." });
        return state ?? z.NEVER;
      })
      .nullable(),
  ),
  school: optionalText.pipe(z.string().max(120).nullable()),
  primary_sport: optionalText,
  grad_year: optionalNumber(z.number().int().min(1950).max(2100)),
  level: z.enum(LEVELS as [AthleteLevel, ...AthleteLevel[]]),
  positions: z
    .string()
    .transform((raw) =>
      raw
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 6),
    ),
  jersey: optionalText.pipe(z.string().max(4).nullable()),
  height_cm: optionalNumber(z.number().int().min(90).max(260)),
  weight_kg: optionalNumber(z.number().min(25).max(300)),
});

export async function updateIdentity(_prev: FormState, formData: FormData): Promise<FormState> {
  const { repo, user } = await requireUser();

  const parsed = identitySchema.safeParse({
    display_name: str(formData, "display_name"),
    bio: str(formData, "bio"),
    location: str(formData, "location"),
    region: str(formData, "region"),
    school: str(formData, "school"),
    primary_sport: str(formData, "primary_sport"),
    grad_year: str(formData, "grad_year"),
    level: str(formData, "level"),
    positions: str(formData, "positions") ?? "",
    jersey: str(formData, "jersey"),
    height_cm: str(formData, "height_cm"),
    weight_kg: str(formData, "weight_kg"),
  });

  if (!parsed.success) return invalid(parsed.error, formData);

  try {
    await repo.updateProfile(user.id, parsed.data);
  } catch (error) {
    return failed(error, "Could not save. Try again.", formValues(formData));
  }

  revalidatePath("/resume");
  return IDLE;
}

const academicsSchema = z.object({
  gpa: optionalNumber(z.number().min(0).max(5)),
  sat_score: optionalNumber(z.number().int().min(400).max(1600)),
  act_score: optionalNumber(z.number().int().min(1).max(36)),
  ncaa_id: optionalText.pipe(z.string().max(20).nullable()),
});

export async function updateAcademics(_prev: FormState, formData: FormData): Promise<FormState> {
  const { repo, user } = await requireUser();

  const parsed = academicsSchema.safeParse({
    gpa: str(formData, "gpa"),
    sat_score: str(formData, "sat_score"),
    act_score: str(formData, "act_score"),
    ncaa_id: str(formData, "ncaa_id"),
  });

  if (!parsed.success) return invalid(parsed.error, formData);

  try {
    await repo.updateProfile(user.id, parsed.data);
  } catch (error) {
    return failed(error, "Could not save. Try again.", formValues(formData));
  }

  revalidatePath("/resume");
  return IDLE;
}

const contactSchema = z.object({
  contact_email: optionalText.pipe(z.string().email("Enter a valid email.").nullable()),
  phone: optionalText.pipe(z.string().max(25).nullable()),
  instagram: optionalText.pipe(z.string().max(60).nullable()),
  x_handle: optionalText.pipe(z.string().max(60).nullable()),
  hudl_url: optionalText.pipe(httpUrl.nullable()),
  results_url: optionalText.pipe(httpUrl.nullable()),
});

export async function updateContact(_prev: FormState, formData: FormData): Promise<FormState> {
  const { repo, user } = await requireUser();

  const parsed = contactSchema.safeParse({
    contact_email: str(formData, "contact_email"),
    phone: str(formData, "phone"),
    instagram: str(formData, "instagram"),
    x_handle: str(formData, "x_handle"),
    hudl_url: str(formData, "hudl_url"),
    results_url: str(formData, "results_url"),
  });

  if (!parsed.success) return invalid(parsed.error, formData);

  try {
    await repo.updateProfile(user.id, parsed.data);
  } catch (error) {
    return failed(error, "Could not save. Try again.", formValues(formData));
  }

  revalidatePath("/resume");
  return IDLE;
}

const visibilitySchema = z.object({
  visibility: z.enum(["private", "unlisted", "public"] satisfies ProfileVisibility[]),
  is_recruitable: z.boolean(),
});

export async function updateVisibility(_prev: FormState, formData: FormData): Promise<FormState> {
  const { repo, user } = await requireUser();

  const parsed = visibilitySchema.safeParse({
    visibility: str(formData, "visibility"),
    is_recruitable: str(formData, "is_recruitable") === "on",
  });

  if (!parsed.success) return invalid(parsed.error, formData);

  try {
    await repo.updateProfile(user.id, parsed.data);
  } catch (error) {
    return failed(error, "Could not save. Try again.", formValues(formData));
  }

  revalidatePath("/resume");
  return IDLE;
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

// The schema (with its date ≤ today and placement ≤ field rules) lives in
// ./schemas so the unit tests run exactly what this enforces.
function readAchievement(formData: FormData) {
  return achievementSchema.safeParse({
    kind: str(formData, "kind"),
    title: str(formData, "title"),
    detail: str(formData, "detail"),
    value_display: str(formData, "value_display"),
    competition: str(formData, "competition"),
    location: str(formData, "location"),
    placement: str(formData, "placement"),
    field_size: str(formData, "field_size"),
    achieved_on: str(formData, "achieved_on"),
  });
}

export async function addAchievement(_prev: FormState, formData: FormData): Promise<FormState> {
  const { repo, user } = await requireUser();
  const parsed = readAchievement(formData);
  if (!parsed.success) return invalid(parsed.error, formData);

  try {
    await repo.addEntry(user.id, parsed.data);
  } catch (error) {
    return failed(error, "Could not add the entry. Try again.", formValues(formData));
  }

  revalidatePath("/resume");
  return IDLE;
}

export async function updateAchievement(_prev: FormState, formData: FormData): Promise<FormState> {
  const { repo, user } = await requireUser();
  const id = idSchema.safeParse(str(formData, "id"));
  const parsed = readAchievement(formData);
  if (!id.success) return { ok: false, error: "That entry was not found." };
  if (!parsed.success) return invalid(parsed.error, formData);

  try {
    // Changing the mark, date, or any other claim clears a verified badge
    // and expires pending links — the repository enforces it.
    await repo.updateEntry(user.id, id.data, parsed.data);
  } catch (error) {
    return failed(error, "Could not save the entry. Try again.", formValues(formData));
  }

  revalidatePath("/resume");
  return IDLE;
}

export async function deleteAchievement(formData: FormData): Promise<void> {
  const { repo, user } = await requireUser();
  const id = idSchema.safeParse(str(formData, "id"));
  if (!id.success) return;

  try {
    await repo.deleteEntry(user.id, id.data);
  } catch {
    // A stale form pointing at a deleted row: nothing to do.
  }

  revalidatePath("/resume");
}

export async function togglePinned(formData: FormData): Promise<void> {
  const { repo, user } = await requireUser();
  const id = idSchema.safeParse(str(formData, "id"));
  if (!id.success) return;

  const entry = (await repo.listEntries(user.id)).find((e) => e.id === id.data);
  if (!entry) return;

  try {
    await repo.setPinned(user.id, id.data, !entry.is_pinned);
  } catch {
    // Over the pin cap (the editor hides Pin at the cap, so only a stale
    // page or a direct POST lands here) or a row deleted meanwhile. A row
    // button has nowhere to show an error; the refreshed page shows the truth.
  }
  revalidatePath("/resume");
}

// ---------------------------------------------------------------------------
// Verification requests
// ---------------------------------------------------------------------------

export type RequestState = FormState & { token?: string };

export async function requestVerification(_prev: RequestState, formData: FormData): Promise<RequestState> {
  const { repo, user } = await requireUser();
  const entryId = idSchema.safeParse(str(formData, "entry_id"));
  const coachId = idSchema.safeParse(str(formData, "coach_id"));
  if (!entryId.success || !coachId.success) {
    return { ok: false, error: "Pick the entry and the coach who saw it." };
  }

  try {
    const request = await repo.requestVerification(user.id, entryId.data, coachId.data);
    revalidatePath("/resume");
    return { ok: true, error: null, token: request.token };
  } catch (error) {
    return failed(error, "Could not create the request. Try again.");
  }
}

// ---------------------------------------------------------------------------
// Film
// ---------------------------------------------------------------------------

const filmSchema = z.object({
  title: z.string().trim().min(3, "Give the clip a title.").max(120),
  url: z.string().trim().pipe(httpUrl),
  season: optionalText.pipe(z.string().max(40).nullable()),
});

export async function addFilm(_prev: FormState, formData: FormData): Promise<FormState> {
  const { repo, user } = await requireUser();

  const parsed = filmSchema.safeParse({
    title: str(formData, "title"),
    url: str(formData, "url"),
    season: str(formData, "season"),
  });

  if (!parsed.success) return invalid(parsed.error, formData);

  try {
    await repo.addFilm(user.id, parsed.data);
  } catch (error) {
    return failed(error, "Could not add the clip. Try again.", formValues(formData));
  }

  revalidatePath("/resume");
  return IDLE;
}

export async function deleteFilm(formData: FormData): Promise<void> {
  const { repo, user } = await requireUser();
  const id = idSchema.safeParse(str(formData, "id"));
  if (!id.success) return;

  try {
    await repo.deleteFilm(user.id, id.data);
  } catch {
    // Stale form; nothing to do.
  }

  revalidatePath("/resume");
}

export async function featureFilm(formData: FormData): Promise<void> {
  const { repo, user } = await requireUser();
  const id = idSchema.safeParse(str(formData, "id"));
  if (!id.success) return;

  try {
    await repo.featureFilm(user.id, id.data);
  } catch {
    // Stale form; nothing to do.
  }

  revalidatePath("/resume");
}

// ---------------------------------------------------------------------------
// Coach contacts
// ---------------------------------------------------------------------------

const coachSchema = z
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

export async function addCoach(_prev: FormState, formData: FormData): Promise<FormState> {
  const { repo, user } = await requireUser();

  const parsed = coachSchema.safeParse({
    name: str(formData, "name"),
    role: str(formData, "role"),
    org_name: str(formData, "org_name"),
    email: str(formData, "email"),
    phone: str(formData, "phone"),
  });

  if (!parsed.success) return invalid(parsed.error, formData);

  try {
    await repo.addCoach(user.id, parsed.data);
  } catch (error) {
    return failed(error, "Could not add the reference. Try again.", formValues(formData));
  }

  revalidatePath("/resume");
  return IDLE;
}

export async function deleteCoach(formData: FormData): Promise<void> {
  const { repo, user } = await requireUser();
  const id = idSchema.safeParse(str(formData, "id"));
  if (!id.success) return;

  try {
    await repo.deleteCoach(user.id, id.data);
  } catch {
    // Stale form; nothing to do.
  }

  revalidatePath("/resume");
}
