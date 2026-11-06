import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { homePathFor } from "@/lib/accounts";
import { getRepository } from "@/lib/data";
import { getCurrentProfile, getCurrentUser } from "@/lib/data/auth";
import { isRecruiterKind } from "@/lib/data/rules";
import { DataError } from "@/lib/data/types";

/**
 * Helpers every Server Action file was carrying its own copy of. Not a
 * `"use server"` module on purpose: these are plain functions, and exporting
 * them from one would turn each into a publicly callable endpoint.
 */

/**
 * A field as a string, "" when absent. A form that omits an optional column
 * — or a direct POST that omits anything — must read as "empty", not as a
 * type error; the schemas then turn "" into null where that matters.
 */
export function str(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** What the user typed, keyed by field name — sent back with a validation error. */
export type FormValues = Record<string, string>;

/** Never echoed: secrets, and fields the form re-renders itself. */
const NOT_ECHOED = /password|^current$|^next$|^confirm$|^token$|^\$ACTION/i;

/**
 * The submitted fields, so a form that failed validation can put them back.
 * React 19 resets a form after its action settles; without this a typo in
 * one field wipes every other field the athlete just filled in. Passwords
 * are never sent back down the wire.
 */
export function formValues(formData: FormData): FormValues {
  const values: FormValues = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value === "string" && !NOT_ECHOED.test(name)) values[name] = value;
  }
  return values;
}

/** Maps a thrown DataError to the form; anything else is a generic retry. */
export function failed(
  error: unknown,
  fallback: string,
  values?: FormValues,
): { ok: false; error: string; values?: FormValues } {
  const message = error instanceof DataError ? error.message : fallback;
  return values ? { ok: false, error: message, values } : { ok: false, error: message };
}

/** The session and the data layer, or a redirect to sign-in that comes back here. */
export async function requireUser(signIn = "/sign-in?next=/resume") {
  const user = await getCurrentUser();
  if (!user) redirect(signIn);
  return { repo: await getRepository(), user };
}

/**
 * `requireUser`, and the account must be a recruiter or coach (any
 * non-athlete kind) — lists and saved searches are theirs (#86). An athlete
 * is sent back to the editor; an account mid-onboarding to finish it. RLS
 * would let an athlete own a list, so this is the gate, not the database.
 */
export async function requireRecruiter(signIn: string) {
  const session = await requireUser(signIn);
  const profile = await getCurrentProfile();
  if (!profile) redirect("/onboarding");
  if (!isRecruiterKind(profile.account_kind)) redirect(homePathFor(profile.account_kind));
  return { ...session, profile };
}

/**
 * The caller's address as the proxy in front of us reports it, for the rate
 * limiter (lib/rate-limit.ts): the first hop of X-Forwarded-For, then
 * X-Real-IP. "unknown" when neither is present — a bare local `next start` —
 * which puts every such caller in one shared budget. Only as trustworthy as
 * the proxy: Vercel overwrites X-Forwarded-For, but a server exposed directly
 * would let a client pick its own key, which turns the limit advisory.
 */
export async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || "unknown";
}
