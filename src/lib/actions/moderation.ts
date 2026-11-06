"use server";

import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";
import { DataError } from "@/lib/data/types";
import { logger } from "@/lib/logger";
import { limitAll } from "@/lib/rate-limit";
import { revalidateProfile } from "@/lib/revalidate";

import { fieldErrorsOf, idSchema, reportSchema } from "./schemas";
import { clientKey, formValues, requireUser, str, type FormValues } from "./shared";

/**
 * Moderation (#50): anyone files a report; staff suspend.
 *
 * Reporting needs no account — a recruiter who spots an impersonation
 * should not have to sign up to say so — so it is rate-limited per address
 * and per address-and-resume, on top of the repository's own per-account
 * daily cap. A hidden `website` field catches the form-filling bots that
 * find every textarea on the web; they get the same thank-you as everyone.
 *
 * Suspension is staff-only and has no screen yet: it is this action, the
 * `set_profile_suspension()` SQL function, or `npm run moderate` in local
 * mode — see docs/LAUNCH-CHECKLIST.md § Moderation.
 */

export type ReportState = {
  ok: boolean;
  error: string | null;
  values?: FormValues;
  fieldErrors?: Record<string, string[]>;
};

const REPORTS_PER_CLIENT_PER_HOUR = 6;
const REPORTS_PER_CLIENT_PER_PROFILE_PER_DAY = 2;

export async function reportProfile(_prev: ReportState, formData: FormData): Promise<ReportState> {
  // The honeypot: invisible to people, irresistible to scripts.
  if (str(formData, "website").trim() !== "") return { ok: true, error: null };

  const parsed = reportSchema.safeParse({
    profile_id: str(formData, "profile_id"),
    reason: str(formData, "reason"),
    detail: str(formData, "detail"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message, values: formValues(formData), fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const client = await clientKey();
  const withinBudget = limitAll([
    { scope: "report:client", key: client, limit: REPORTS_PER_CLIENT_PER_HOUR, windowMs: 60 * 60_000 },
    {
      scope: "report:client-profile",
      key: `${client}:${parsed.data.profile_id}`,
      limit: REPORTS_PER_CLIENT_PER_PROFILE_PER_DAY,
      windowMs: 24 * 60 * 60_000,
    },
  ]);
  if (!withinBudget) {
    logger.warn("moderation.report.rate_limited", { profileId: parsed.data.profile_id });
    return { ok: false, error: "Too many reports from here. Try again later.", values: formValues(formData) };
  }

  const [repo, user] = await Promise.all([getRepository(), getCurrentUser()]);
  try {
    await repo.reportProfile(parsed.data.profile_id, user?.id ?? null, { reason: parsed.data.reason, detail: parsed.data.detail });
  } catch (error) {
    if (error instanceof DataError && (error.code === "not_found" || error.code === "rate_limited")) {
      return { ok: false, error: error.message, values: formValues(formData) };
    }
    logger.error("moderation.report.failed", { error, profileId: parsed.data.profile_id });
    return { ok: false, error: "Could not send the report. Try again.", values: formValues(formData) };
  }

  logger.info("moderation.report.filed", {
    profileId: parsed.data.profile_id,
    reason: parsed.data.reason,
    signedIn: Boolean(user),
  });
  return { ok: true, error: null };
}

export type SuspensionState = { ok: boolean; error: string | null; suspended?: boolean };

/**
 * Staff only: suspend (`suspend=on`) or reinstate a profile by id. The
 * repository refuses anyone else with `forbidden` — RLS and the definer
 * function in Supabase mode, `isStaff` in local mode.
 */
export async function setProfileSuspension(_prev: SuspensionState, formData: FormData): Promise<SuspensionState> {
  const { repo, user } = await requireUser("/sign-in");
  const id = idSchema.safeParse(str(formData, "profile_id"));
  if (!id.success) return { ok: false, error: "Which profile?" };
  const suspend = str(formData, "suspend") === "on";

  try {
    const profile = await repo.setProfileSuspended(user.id, id.data, suspend);
    logger.info(suspend ? "moderation.profile.suspended" : "moderation.profile.reinstated", { profileId: id.data, actorId: user.id });
    revalidateProfile(profile.handle);
    return { ok: true, error: null, suspended: profile.suspended_at !== null };
  } catch (error) {
    if (error instanceof DataError) return { ok: false, error: error.message };
    logger.error("moderation.suspension.failed", { error, profileId: id.data });
    return { ok: false, error: "Could not change the suspension. Try again." };
  }
}
