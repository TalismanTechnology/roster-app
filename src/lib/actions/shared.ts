import "server-only";

import { redirect } from "next/navigation";

import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";
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
