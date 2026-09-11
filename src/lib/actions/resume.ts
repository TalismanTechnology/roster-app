"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { eligibleAge } from "@/lib/age";
import { safeAuthReturn } from "@/lib/auth-return";
import { getNetworkRepository } from "@/lib/network";
import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";
import { DataError } from "@/lib/data/types";
import type { AchievementKind, AthleteLevel, ProfileVisibility } from "@/lib/database.types";
import { isReservedHandle, HANDLE_PATTERN } from "@/lib/handles";

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
};

const IDLE: FormState = { ok: true, error: null };

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return { repo: await getRepository(), user };
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0].message;
}

/**
 * A field as a string, "" when absent. A form that omits an optional column
 * — or a direct POST that omits anything — must read as "empty", not as a
 * type error; the schemas' `optionalText` then turns "" into null.
 */
function str(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Maps a thrown DataError to the form; anything else is a generic retry. */
function failed(error: unknown, fallback: string): FormState {
  if (error instanceof DataError) return { ok: false, error: error.message };
  return { ok: false, error: fallback };
}

/** "" → null, so an emptied optional field clears the column instead of
 *  writing an empty string that renders as a blank line forever after. */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value));

const optionalNumber = (schema: z.ZodNumber) =>
  z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : Number(value)))
    .pipe(schema.nullable());

const uuidField = z.string().min(1);

// ---------------------------------------------------------------------------
// Onboarding — the one insert into profiles
// ---------------------------------------------------------------------------

const LEVELS: AthleteLevel[] = [
  "high_school", "club", "juco", "ncaa_d3", "ncaa_d2", "ncaa_d1",
  "naia", "semi_pro", "professional", "national_team", "olympic",
];

const onboardingSchema = z.object({
  account_kind: z.enum(["athlete", "coach", "recruiter"]),
  school: optionalText,
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(HANDLE_PATTERN, "Handles are 3–30 characters: lowercase letters, numbers, underscores.")
    .refine((handle) => !isReservedHandle(handle), "That handle is reserved."),
  display_name: z.string().trim().min(2, "Enter your name.").max(80),
  level: z.enum(LEVELS as [AthleteLevel, ...AthleteLevel[]]).nullable(),
  primary_sport: optionalText,
  grad_year: optionalNumber(z.number().int().min(1950).max(2100)),
  visibility: z.enum(["private", "unlisted", "public"] satisfies ProfileVisibility[]).default("public"),
});

export async function completeOnboarding(_prev: FormState, formData: FormData): Promise<FormState> {
  const { repo, user } = await requireUser();

  const parsed = onboardingSchema.safeParse({
    account_kind: str(formData,"account_kind") || "athlete",
    school: str(formData,"school"),
    handle: str(formData, "handle"),
    display_name: str(formData, "display_name"),
    level: str(formData,"account_kind") === "athlete" ? str(formData,"level") : null,
    primary_sport: str(formData,"account_kind") === "athlete" ? str(formData,"primary_sport") : "",
    grad_year: str(formData,"account_kind") === "athlete" ? str(formData,"grad_year") : "",
    visibility: str(formData, "visibility") || "public",
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  if (parsed.data.account_kind === "athlete" && (!parsed.data.level || !parsed.data.primary_sport)) return {ok:false,error:"Choose your sport and level."};
  if (parsed.data.account_kind !== "athlete" && !parsed.data.school) return {ok:false,error:"Enter your school or organization."};
  if (str(formData,"accept_network") !== "on" || !eligibleAge(str(formData,"date_of_birth"))) return {ok:false,error:"Enter an eligible date of birth (13 or older) and accept the network rules."};
  try {
    const {school,...profile} = parsed.data;
    if (!(await repo.getProfileById(user.id))) await repo.createProfile({ id: user.id, ...profile });
    if (school) await repo.updateProfile(user.id,{school});
    await (await getNetworkRepository()).joinNetwork(str(formData,"date_of_birth"));
  } catch (error) {
    return failed(error, "Could not create your profile. Try again.");
  }

  redirect(safeAuthReturn(formData.get("next")));
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
    z.string().length(2, "State is the two-letter code, e.g. MI.").toUpperCase().nullable(),
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

  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    await repo.updateProfile(user.id, parsed.data);
  } catch (error) {
    return failed(error, "Could not save. Try again.");
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

  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    await repo.updateProfile(user.id, parsed.data);
  } catch (error) {
    return failed(error, "Could not save. Try again.");
  }

  revalidatePath("/resume");
  return IDLE;
}

const contactSchema = z.object({
  contact_email: optionalText.pipe(z.string().email("Enter a valid email.").nullable()),
  phone: optionalText.pipe(z.string().max(25).nullable()),
  instagram: optionalText,
  x_handle: optionalText,
  hudl_url: optionalText.pipe(z.string().url("Enter a full URL.").nullable()),
  results_url: optionalText.pipe(z.string().url("Enter a full URL.").nullable()),
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

  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    await repo.updateProfile(user.id, parsed.data);
  } catch (error) {
    return failed(error, "Could not save. Try again.");
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

  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    await repo.updateProfile(user.id, parsed.data);
  } catch (error) {
    return failed(error, "Could not save. Try again.");
  }

  revalidatePath("/resume");
  return IDLE;
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

const KINDS: AchievementKind[] = [
  "personal_record", "result", "award", "record",
  "captaincy", "commitment", "selection", "milestone",
];

const achievementSchema = z.object({
  kind: z.enum(KINDS as [AchievementKind, ...AchievementKind[]]),
  title: z.string().trim().min(3, "Give the entry a title.").max(120),
  detail: optionalText.pipe(z.string().max(500).nullable()),
  value_display: optionalText.pipe(z.string().max(20).nullable()),
  competition: optionalText.pipe(z.string().max(120).nullable()),
  location: optionalText.pipe(z.string().max(120).nullable()),
  placement: optionalNumber(z.number().int().min(1).max(10000)),
  field_size: optionalNumber(z.number().int().min(1).max(100000)),
  achieved_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date it happened."),
});

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
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    await repo.addEntry(user.id, parsed.data);
  } catch (error) {
    return failed(error, "Could not add the entry. Try again.");
  }

  revalidatePath("/resume");
  return IDLE;
}

export async function updateAchievement(_prev: FormState, formData: FormData): Promise<FormState> {
  const { repo, user } = await requireUser();
  const id = uuidField.safeParse(str(formData, "id"));
  const parsed = readAchievement(formData);
  if (!id.success) return { ok: false, error: "That entry was not found." };
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    await repo.updateEntry(user.id, id.data, parsed.data);
  } catch (error) {
    return failed(error, "Could not save the entry. Try again.");
  }

  revalidatePath("/resume");
  return IDLE;
}

export async function deleteAchievement(formData: FormData): Promise<void> {
  const { repo, user } = await requireUser();
  const id = uuidField.safeParse(str(formData, "id"));
  if (!id.success) return;

  try {
    await repo.deleteEntry(user.id, id.data);
  } catch (error) {
    if (!(error instanceof DataError && error.code === "not_found")) throw error;
  }

  revalidatePath("/resume");
}

export async function togglePinned(formData: FormData): Promise<void> {
  const { repo, user } = await requireUser();
  const id = uuidField.safeParse(str(formData, "id"));
  if (!id.success) return;

  const entry = (await repo.listEntries(user.id)).find((e) => e.id === id.data);
  if (!entry) return;

  await repo.setPinned(user.id, id.data, !entry.is_pinned);
  revalidatePath("/resume");
}

// ---------------------------------------------------------------------------
// Verification requests
// ---------------------------------------------------------------------------

export type RequestState = FormState & { token?: string };

export async function requestVerification(_prev: RequestState, formData: FormData): Promise<RequestState> {
  const { repo, user } = await requireUser();
  const entryId = uuidField.safeParse(str(formData, "entry_id"));
  const coachId = uuidField.safeParse(str(formData, "coach_id"));
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
  url: z
    .string()
    .trim()
    .url("Enter a full URL.")
    .refine((url) => /^https?:\/\//i.test(url), "Film links must be web URLs."),
  season: optionalText.pipe(z.string().max(40).nullable()),
});

export async function addFilm(_prev: FormState, formData: FormData): Promise<FormState> {
  const { repo, user } = await requireUser();

  const parsed = filmSchema.safeParse({
    title: str(formData, "title"),
    url: str(formData, "url"),
    season: str(formData, "season"),
  });

  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    await repo.addFilm(user.id, parsed.data);
  } catch (error) {
    return failed(error, "Could not add the clip. Try again.");
  }

  revalidatePath("/resume");
  return IDLE;
}

export async function deleteFilm(formData: FormData): Promise<void> {
  const { repo, user } = await requireUser();
  const id = uuidField.safeParse(str(formData, "id"));
  if (!id.success) return;

  try {
    await repo.deleteFilm(user.id, id.data);
  } catch (error) {
    if (!(error instanceof DataError && error.code === "not_found")) throw error;
  }

  revalidatePath("/resume");
}

export async function featureFilm(formData: FormData): Promise<void> {
  const { repo, user } = await requireUser();
  const id = uuidField.safeParse(str(formData, "id"));
  if (!id.success) return;

  try {
    await repo.featureFilm(user.id, id.data);
  } catch (error) {
    if (!(error instanceof DataError && error.code === "not_found")) throw error;
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

  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    await repo.addCoach(user.id, parsed.data);
  } catch (error) {
    return failed(error, "Could not add the reference. Try again.");
  }

  revalidatePath("/resume");
  return IDLE;
}

export async function deleteCoach(formData: FormData): Promise<void> {
  const { repo, user } = await requireUser();
  const id = uuidField.safeParse(str(formData, "id"));
  if (!id.success) return;

  try {
    await repo.deleteCoach(user.id, id.data);
  } catch (error) {
    if (!(error instanceof DataError && error.code === "not_found")) throw error;
  }

  revalidatePath("/resume");
}

export async function editFilm(_prev: FormState, formData: FormData): Promise<FormState> {
  const {repo,user} = await requireUser();
  const id = str(formData,"id");
  const parsed = filmSchema.safeParse({title:str(formData,"title"), url:str(formData,"url"), season:str(formData,"season")});
  if (!id || !parsed.success) return {ok:false,error:!parsed.success ? firstIssue(parsed.error) : "Item not found."};
  try { await repo.updateFilm(user.id,id,parsed.data); } catch(error) {return failed(error,"Could not save.");}
  revalidatePath("/resume"); revalidatePath("/app/resume"); return IDLE;
}

export async function editCoach(_prev: FormState, formData: FormData): Promise<FormState> {
  const {repo,user} = await requireUser();
  const id = str(formData,"id");
  const parsed = coachSchema.safeParse({name:str(formData,"name"), role:str(formData,"role"), org_name:str(formData,"org_name"), email:str(formData,"email"), phone:str(formData,"phone")});
  if (!id || !parsed.success) return {ok:false,error:!parsed.success ? firstIssue(parsed.error) : "Item not found."};
  try { await repo.updateCoach(user.id,id,parsed.data); } catch(error) {return failed(error,"Could not save.");}
  revalidatePath("/resume"); revalidatePath("/app/resume"); return IDLE;
}
