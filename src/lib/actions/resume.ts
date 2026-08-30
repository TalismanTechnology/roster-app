"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { AchievementKind, AthleteLevel, ProfileVisibility } from "@/lib/database.types";
import { isReservedHandle, HANDLE_PATTERN } from "@/lib/handles";
import { createClient } from "@/lib/supabase/server";

/**
 * Every write behind the resume editor.
 *
 * Authorization is layered: each action requires a session before touching
 * anything, and RLS re-checks ownership row-by-row underneath. The
 * `.eq("profile_id", user.id)` filters are therefore not the security
 * boundary — they exist so a stale form fails loudly with zero rows updated
 * instead of silently writing nothing.
 */

export type FormState = {
  ok: boolean;
  error: string | null;
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  return { supabase, user };
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0].message;
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

// ---------------------------------------------------------------------------
// Onboarding — the one insert into profiles
// ---------------------------------------------------------------------------

const LEVELS: AthleteLevel[] = [
  "high_school", "club", "juco", "ncaa_d3", "ncaa_d2", "ncaa_d1",
  "naia", "semi_pro", "professional", "national_team", "olympic",
];

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
});

export async function completeOnboarding(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();

  const parsed = onboardingSchema.safeParse({
    handle: formData.get("handle"),
    display_name: formData.get("display_name"),
    level: formData.get("level"),
    primary_sport: formData.get("primary_sport"),
    grad_year: formData.get("grad_year"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    ...parsed.data,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "That handle is taken." };
    }
    return { ok: false, error: "Could not create your resume. Try again." };
  }

  redirect("/resume");
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

export async function updateIdentity(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();

  const parsed = identitySchema.safeParse({
    display_name: formData.get("display_name"),
    bio: formData.get("bio"),
    location: formData.get("location"),
    region: formData.get("region"),
    school: formData.get("school"),
    primary_sport: formData.get("primary_sport"),
    grad_year: formData.get("grad_year"),
    level: formData.get("level"),
    positions: formData.get("positions") ?? "",
    jersey: formData.get("jersey"),
    height_cm: formData.get("height_cm"),
    weight_kg: formData.get("weight_kg"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);

  if (error) {
    return { ok: false, error: "Could not save. Try again." };
  }

  revalidatePath("/resume");
  return { ok: true, error: null };
}

const academicsSchema = z.object({
  gpa: optionalNumber(z.number().min(0).max(5)),
  sat_score: optionalNumber(z.number().int().min(400).max(1600)),
  act_score: optionalNumber(z.number().int().min(1).max(36)),
  ncaa_id: optionalText.pipe(z.string().max(20).nullable()),
});

const contactSchema = z.object({
  contact_email: optionalText.pipe(z.string().email("Enter a valid email.").nullable()),
  phone: optionalText.pipe(z.string().max(25).nullable()),
  instagram: optionalText,
  x_handle: optionalText,
  hudl_url: optionalText.pipe(z.string().url("Enter a full URL.").nullable()),
  results_url: optionalText.pipe(z.string().url("Enter a full URL.").nullable()),
});

export async function updateAcademics(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();

  const parsed = academicsSchema.safeParse({
    gpa: formData.get("gpa"),
    sat_score: formData.get("sat_score"),
    act_score: formData.get("act_score"),
    ncaa_id: formData.get("ncaa_id"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);

  if (error) return { ok: false, error: "Could not save. Try again." };

  revalidatePath("/resume");
  return { ok: true, error: null };
}

export async function updateContact(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();

  const parsed = contactSchema.safeParse({
    contact_email: formData.get("contact_email"),
    phone: formData.get("phone"),
    instagram: formData.get("instagram"),
    x_handle: formData.get("x_handle"),
    hudl_url: formData.get("hudl_url"),
    results_url: formData.get("results_url"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);

  if (error) return { ok: false, error: "Could not save. Try again." };

  revalidatePath("/resume");
  return { ok: true, error: null };
}

const visibilitySchema = z.object({
  visibility: z.enum(["private", "unlisted", "public"] satisfies ProfileVisibility[]),
  is_recruitable: z.coerce.boolean(),
});

export async function updateVisibility(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();

  const parsed = visibilitySchema.safeParse({
    visibility: formData.get("visibility"),
    is_recruitable: formData.get("is_recruitable") === "on",
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);

  if (error) return { ok: false, error: "Could not save. Try again." };

  revalidatePath("/resume");
  return { ok: true, error: null };
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

export async function addAchievement(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();

  const parsed = achievementSchema.safeParse({
    kind: formData.get("kind"),
    title: formData.get("title"),
    detail: formData.get("detail"),
    value_display: formData.get("value_display"),
    competition: formData.get("competition"),
    location: formData.get("location"),
    placement: formData.get("placement"),
    field_size: formData.get("field_size"),
    achieved_on: formData.get("achieved_on"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const { error } = await supabase.from("achievements").insert({
    profile_id: user.id,
    ...parsed.data,
  });

  if (error) {
    if (error.code === "23514") {
      return { ok: false, error: "Check the date and placement — one of them is out of range." };
    }
    return { ok: false, error: "Could not add the entry. Try again." };
  }

  revalidatePath("/resume");
  return { ok: true, error: null };
}

export async function deleteAchievement(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const id = z.string().uuid().safeParse(formData.get("id"));

  if (!id.success) return;

  await supabase.from("achievements").delete().eq("id", id.data).eq("profile_id", user.id);

  revalidatePath("/resume");
}

export async function togglePinned(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const id = z.string().uuid().safeParse(formData.get("id"));

  if (!id.success) return;

  const { data: entry } = await supabase
    .from("achievements")
    .select("is_pinned")
    .eq("id", id.data)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!entry) return;

  await supabase
    .from("achievements")
    .update({ is_pinned: !entry.is_pinned })
    .eq("id", id.data)
    .eq("profile_id", user.id);

  revalidatePath("/resume");
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
  const { supabase, user } = await requireUser();

  const parsed = filmSchema.safeParse({
    title: formData.get("title"),
    url: formData.get("url"),
    season: formData.get("season"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const { error } = await supabase.from("film_clips").insert({
    profile_id: user.id,
    ...parsed.data,
  });

  if (error) return { ok: false, error: "Could not add the clip. Try again." };

  revalidatePath("/resume");
  return { ok: true, error: null };
}

export async function deleteFilm(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const id = z.string().uuid().safeParse(formData.get("id"));

  if (!id.success) return;

  await supabase.from("film_clips").delete().eq("id", id.data).eq("profile_id", user.id);

  revalidatePath("/resume");
}

export async function featureFilm(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const id = z.string().uuid().safeParse(formData.get("id"));

  if (!id.success) return;

  // Unset-then-set. The partial unique index in 0004 guarantees at most one
  // featured clip survives even if two of these race.
  await supabase
    .from("film_clips")
    .update({ is_featured: false })
    .eq("profile_id", user.id)
    .eq("is_featured", true);

  await supabase
    .from("film_clips")
    .update({ is_featured: true })
    .eq("id", id.data)
    .eq("profile_id", user.id);

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
  const { supabase, user } = await requireUser();

  const parsed = coachSchema.safeParse({
    name: formData.get("name"),
    role: formData.get("role"),
    org_name: formData.get("org_name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const { error } = await supabase.from("coach_contacts").insert({
    profile_id: user.id,
    ...parsed.data,
  });

  if (error) return { ok: false, error: "Could not add the reference. Try again." };

  revalidatePath("/resume");
  return { ok: true, error: null };
}

export async function deleteCoach(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const id = z.string().uuid().safeParse(formData.get("id"));

  if (!id.success) return;

  await supabase.from("coach_contacts").delete().eq("id", id.data).eq("profile_id", user.id);

  revalidatePath("/resume");
}
