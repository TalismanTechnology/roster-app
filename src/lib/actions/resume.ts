"use server";

import { randomBytes } from "node:crypto";

import { redirect } from "next/navigation";
import { z } from "zod";

import { onboardingDestination } from "@/lib/accounts";
import { AVATAR_MAX_BYTES, sniffAvatarType } from "@/lib/avatars";
import { getRepository, type Repository } from "@/lib/data";
import { DataError, type MoveDirection } from "@/lib/data/types";
import type { AthleteLevel, ProfileVisibility } from "@/lib/database.types";
import { emailCoachRequest } from "@/lib/email/verification";
import { LEVEL_OPTIONS } from "@/lib/format";
import { handleFromName, isReservedHandle, HANDLE_PATTERN } from "@/lib/handles";
import { toStateCode } from "@/lib/regions";
import { limitAll } from "@/lib/rate-limit";
import { revalidateProfile } from "@/lib/revalidate";

import {
  achievementSchema,
  athleteOnboardingSchema,
  coachSchema,
  fieldErrorsOf,
  httpUrl,
  idSchema,
  imperialMeasurablesSchema,
  memberOnboardingSchema,
  onboardingKind,
  optionalNumber,
  optionalText,
  positionsField,
  socialHandleField,
  type OnboardingKind,
} from "./schemas";
import { clientKey, failed, formValues, requireUser, str, type FormValues } from "./shared";

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
  /** On a validation failure, each field's messages — shown beside the input. */
  fieldErrors?: Record<string, string[]>;
  /** On success, when the server saved it (epoch ms) — "Saved · 2m ago". */
  savedAt?: number;
};

function saved(): FormState {
  return { ok: true, error: null, savedAt: Date.now() };
}

/** A validation failure, carrying the submitted fields back to the form. */
function invalid(error: z.ZodError, formData: FormData): FormState {
  return { ok: false, error: error.issues[0].message, values: formValues(formData), fieldErrors: fieldErrorsOf(error) };
}

/**
 * Refreshes the editor, the public resume, and search after a write that
 * didn't hand back the profile row. A failed lookup still refreshes the
 * editor; the public page catches up on its next render.
 */
async function refreshOwner(repo: Repository, userId: string): Promise<void> {
  const profile = await repo.getProfileById(userId).catch(() => null);
  revalidateProfile(profile?.handle);
}

// ---------------------------------------------------------------------------
// Onboarding — the one insert into profiles
// ---------------------------------------------------------------------------

// The label maps in format.ts are the single source for both enums.
const LEVELS = LEVEL_OPTIONS.map(([value]) => value);

/** Tries before giving up on a generated handle; each collision draws a new suffix. */
const GENERATED_HANDLE_TRIES = 5;

export async function completeOnboarding(_prev: FormState, formData: FormData): Promise<FormState> {
  const { repo, user } = await requireUser();
  const kind = onboardingKind.parse(str(formData, "account_kind"));
  if (kind !== "athlete") return completeMemberOnboarding(repo, user.id, kind, formData);

  const parsed = athleteOnboardingSchema.safeParse({
    handle: str(formData, "handle"),
    display_name: str(formData, "display_name"),
    level: str(formData, "level"),
    primary_sport: str(formData, "primary_sport"),
    grad_year: str(formData, "grad_year"),
    visibility: str(formData, "visibility") || "public",
    age_consent: str(formData, "age_consent"),
  });

  if (!parsed.success) return invalid(parsed.error, formData);

  try {
    await repo.createProfile({ id: user.id, ...parsed.data, consent_at: new Date().toISOString() });
  } catch (error) {
    return failed(error, "Could not create your resume. Try again.", formValues(formData));
  }

  revalidateProfile(parsed.data.handle);
  redirect(onboardingDestination("athlete"));
}

/**
 * The recruiter / coach branch (#52): name, program, title. The handle is
 * generated — these accounts have no resume to share — and the profile is
 * private, like the seeded staff accounts.
 */
async function completeMemberOnboarding(
  repo: Repository,
  userId: string,
  kind: Exclude<OnboardingKind, "athlete">,
  formData: FormData,
): Promise<FormState> {
  const parsed = memberOnboardingSchema.safeParse({
    display_name: str(formData, "display_name"),
    school: str(formData, "school"),
    title: str(formData, "title"),
  });
  if (!parsed.success) return invalid(parsed.error, formData);

  let created = false;
  for (let i = 0; i < GENERATED_HANDLE_TRIES && !created; i++) {
    const handle = handleFromName(parsed.data.display_name, randomBytes(3).toString("hex"));
    try {
      await repo.createProfile({ id: userId, handle, level: null, account_kind: kind, visibility: "private", ...parsed.data });
      created = true;
    } catch (error) {
      // Only a handle collision is worth another draw.
      if (error instanceof DataError && error.code === "conflict" && /handle/i.test(error.message)) continue;
      return failed(error, "Could not set up your account. Try again.", formValues(formData));
    }
  }
  if (!created) return { ok: false, error: "Could not set up your account. Try again.", values: formValues(formData) };

  redirect(onboardingDestination(kind));
}

/**
 * The handle checker's budget per client (#40). The form debounces 350ms,
 * so even slow, deliberate typing stays far below this; a script walking
 * the namespace to learn who has an account does not.
 */
const HANDLE_CHECKS_PER_MINUTE = 60;
/** And per hour, so a patient script pacing itself under the minute budget still runs dry. */
const HANDLE_CHECKS_PER_HOUR = 600;

/**
 * Live availability for the onboarding form. Read-only, but callable by
 * anyone without an account, so it is throttled per client. The format
 * check runs first and costs nothing, so it is not counted.
 */
export async function checkHandle(handle: string): Promise<"available" | "taken" | "invalid" | "rate_limited"> {
  const h = String(handle ?? "").trim().toLowerCase();
  if (!HANDLE_PATTERN.test(h) || isReservedHandle(h)) return "invalid";
  const client = await clientKey();
  const withinBudget = limitAll([
    { scope: "check-handle", key: client, limit: HANDLE_CHECKS_PER_MINUTE, windowMs: 60_000 },
    { scope: "check-handle:hour", key: client, limit: HANDLE_CHECKS_PER_HOUR, windowMs: 60 * 60_000 },
  ]);
  if (!withinBudget) return "rate_limited";
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
  positions: positionsField,
  jersey: optionalText.pipe(z.string().max(4).nullable()),
});

export async function updateIdentity(_prev: FormState, formData: FormData): Promise<FormState> {
  const { repo, user } = await requireUser();

  const measurables = imperialMeasurablesSchema.safeParse({
    height_ft: str(formData, "height_ft"),
    height_in: str(formData, "height_in"),
    weight_lbs: str(formData, "weight_lbs"),
  });
  const parsed = identitySchema.safeParse({
    display_name: str(formData, "display_name"),
    bio: str(formData, "bio"),
    location: str(formData, "location"),
    region: str(formData, "region"),
    school: str(formData, "school"),
    primary_sport: str(formData, "primary_sport"),
    grad_year: str(formData, "grad_year"),
    level: str(formData, "level"),
    positions: str(formData, "positions"),
    jersey: str(formData, "jersey"),
  });

  if (!parsed.success) return invalid(parsed.error, formData);
  if (!measurables.success) return invalid(measurables.error, formData);

  let handle: string;
  try {
    ({ handle } = await repo.updateProfile(user.id, { ...parsed.data, ...measurables.data }));
  } catch (error) {
    return failed(error, "Could not save. Try again.", formValues(formData));
  }

  revalidateProfile(handle);
  return saved();
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

  let handle: string;
  try {
    ({ handle } = await repo.updateProfile(user.id, parsed.data));
  } catch (error) {
    return failed(error, "Could not save. Try again.", formValues(formData));
  }

  revalidateProfile(handle);
  return saved();
}

const contactSchema = z.object({
  contact_email: optionalText.pipe(z.string().email("Enter a valid email.").nullable()),
  phone: optionalText.pipe(z.string().max(25).nullable()),
  instagram: socialHandleField("instagram", "Enter an Instagram handle or profile link."),
  x_handle: socialHandleField("x", "Enter an X handle or profile link."),
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

  let handle: string;
  try {
    ({ handle } = await repo.updateProfile(user.id, parsed.data));
  } catch (error) {
    return failed(error, "Could not save. Try again.", formValues(formData));
  }

  revalidateProfile(handle);
  return saved();
}

const visibilitySchema = z.object({
  visibility: z.enum(["private", "unlisted", "public"] satisfies ProfileVisibility[]),
  is_recruitable: z.boolean(),
  viewer_summary_opt_in: z.boolean(),
});

export async function updateVisibility(_prev: FormState, formData: FormData): Promise<FormState> {
  const { repo, user } = await requireUser();

  const parsed = visibilitySchema.safeParse({
    visibility: str(formData, "visibility"),
    is_recruitable: str(formData, "is_recruitable") === "on",
    viewer_summary_opt_in: str(formData, "viewer_summary_opt_in") === "on",
  });

  if (!parsed.success) return invalid(parsed.error, formData);

  let handle: string;
  try {
    ({ handle } = await repo.updateProfile(user.id, parsed.data));
  } catch (error) {
    return failed(error, "Could not save. Try again.", formValues(formData));
  }

  revalidateProfile(handle);
  return saved();
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

/**
 * The editor crops and re-encodes in the browser (AvatarUpload) before
 * calling this, so a real upload is a small square JPEG. Everything is
 * re-checked here anyway — size, and the bytes' own signature rather than
 * the declared type — because this endpoint takes a POST from anyone with
 * a session, not just from that component.
 */
export async function updateAvatar(_prev: FormState, formData: FormData): Promise<FormState> {
  const { repo, user } = await requireUser();
  const file = formData.get("avatar");

  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo to upload." };
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, error: "That photo is too large. Try a smaller one." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffAvatarType(bytes);
  if (!type) return { ok: false, error: "Use a JPEG, PNG, or WebP photo." };

  let handle: string;
  try {
    ({ handle } = await repo.setAvatar(user.id, bytes, type));
  } catch (error) {
    return failed(error, "Could not save the photo. Try again.");
  }

  revalidateProfile(handle);
  return saved();
}

export async function removeAvatar(_prev: FormState, _formData: FormData): Promise<FormState> {
  void _formData;
  const { repo, user } = await requireUser();

  let handle: string;
  try {
    ({ handle } = await repo.removeAvatar(user.id));
  } catch (error) {
    return failed(error, "Could not remove the photo. Try again.");
  }

  revalidateProfile(handle);
  return saved();
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
    unit: str(formData, "unit"),
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

  await refreshOwner(repo, user.id);
  return saved();
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

  await refreshOwner(repo, user.id);
  return saved();
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

  await refreshOwner(repo, user.id);
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
  await refreshOwner(repo, user.id);
}

// ---------------------------------------------------------------------------
// Verification requests
// ---------------------------------------------------------------------------

export type RequestState = FormState & {
  /** The raw token, returned this once — nothing stored can rebuild the link. */
  token?: string;
  requestId?: string;
  /** The coach's address when the link was emailed to them, else null. */
  emailedTo?: string | null;
};

export async function requestVerification(_prev: RequestState, formData: FormData): Promise<RequestState> {
  const { repo, user } = await requireUser();
  const entryId = idSchema.safeParse(str(formData, "entry_id"));
  const coachId = idSchema.safeParse(str(formData, "coach_id"));
  if (!entryId.success || !coachId.success) {
    return { ok: false, error: "Pick the entry and the coach who saw it." };
  }

  let request;
  try {
    request = await repo.requestVerification(user.id, entryId.data, coachId.data);
  } catch (error) {
    return failed(error, "Could not create the request. Try again.");
  }

  // #75: the coach gets the link by email too. A failed send still leaves
  // the athlete holding a working link to forward themselves.
  const [profile, coaches, entries] = await Promise.all([
    repo.getProfileById(user.id),
    repo.listCoaches(user.id, user.id),
    repo.listEntries(user.id),
  ]);
  const coach = coaches.find((c) => c.id === coachId.data);
  const emailed = await emailCoachRequest({
    coachEmail: coach?.email ?? null,
    coachName: coach?.name ?? "Coach",
    athleteName: profile?.display_name ?? "An athlete",
    entryTitle: entries.find((e) => e.id === entryId.data)?.title ?? "an entry",
    token: request.token,
    expiresAt: request.expires_at,
  });

  revalidateProfile(profile?.handle);
  return { ok: true, error: null, token: request.token, requestId: request.id, emailedTo: emailed ? (coach?.email ?? null) : null };
}

/** #41: the athlete closes a link that is still out — sent to the wrong coach, say. */
export async function revokeVerification(formData: FormData): Promise<void> {
  const { repo, user } = await requireUser();
  const id = idSchema.safeParse(str(formData, "id"));
  if (!id.success) return;

  try {
    await repo.revokeVerificationRequest(user.id, id.data);
  } catch {
    // Answered or revoked meanwhile; the refreshed page shows which.
  }
  await refreshOwner(repo, user.id);
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

  await refreshOwner(repo, user.id);
  return saved();
}

export async function updateFilm(_prev: FormState, formData: FormData): Promise<FormState> {
  const { repo, user } = await requireUser();
  const id = idSchema.safeParse(str(formData, "id"));
  const parsed = filmSchema.safeParse({
    title: str(formData, "title"),
    url: str(formData, "url"),
    season: str(formData, "season"),
  });
  if (!id.success) return { ok: false, error: "That clip was not found." };
  if (!parsed.success) return invalid(parsed.error, formData);

  try {
    await repo.updateFilm(user.id, id.data, parsed.data);
  } catch (error) {
    return failed(error, "Could not save the clip. Try again.", formValues(formData));
  }

  await refreshOwner(repo, user.id);
  return saved();
}

const directionSchema = z.enum(["up", "down"] satisfies MoveDirection[]);

/** #56: one step up or down the athlete's film order. */
export async function moveFilm(formData: FormData): Promise<void> {
  const { repo, user } = await requireUser();
  const id = idSchema.safeParse(str(formData, "id"));
  const direction = directionSchema.safeParse(str(formData, "direction"));
  if (!id.success || !direction.success) return;

  try {
    await repo.moveFilm(user.id, id.data, direction.data);
  } catch {
    // Stale form; the refreshed page shows the real order.
  }

  await refreshOwner(repo, user.id);
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

  await refreshOwner(repo, user.id);
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

  await refreshOwner(repo, user.id);
}

// ---------------------------------------------------------------------------
// Coach contacts
// ---------------------------------------------------------------------------

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

  await refreshOwner(repo, user.id);
  return saved();
}

export async function updateCoach(_prev: FormState, formData: FormData): Promise<FormState> {
  const { repo, user } = await requireUser();
  const id = idSchema.safeParse(str(formData, "id"));
  const parsed = coachSchema.safeParse({
    name: str(formData, "name"),
    role: str(formData, "role"),
    org_name: str(formData, "org_name"),
    email: str(formData, "email"),
    phone: str(formData, "phone"),
  });
  if (!id.success) return { ok: false, error: "That reference was not found." };
  if (!parsed.success) return invalid(parsed.error, formData);

  try {
    await repo.updateCoach(user.id, id.data, parsed.data);
  } catch (error) {
    return failed(error, "Could not save the reference. Try again.", formValues(formData));
  }

  await refreshOwner(repo, user.id);
  return saved();
}

/**
 * #56: show or hide a reference on the public resume. A hidden reference
 * still receives verification requests; only recruiters stop seeing it.
 */
export async function toggleCoachVisible(formData: FormData): Promise<void> {
  const { repo, user } = await requireUser();
  const id = idSchema.safeParse(str(formData, "id"));
  if (!id.success) return;

  const coach = (await repo.listCoaches(user.id, user.id)).find((c) => c.id === id.data);
  if (!coach) return;

  try {
    await repo.updateCoach(user.id, id.data, { is_visible: !coach.is_visible });
  } catch {
    // Deleted meanwhile; the refreshed page shows the truth.
  }
  await refreshOwner(repo, user.id);
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

  await refreshOwner(repo, user.id);
}
