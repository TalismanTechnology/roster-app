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

/** Maps a thrown DataError to the form; anything else is a generic retry. */
export function failed(error: unknown, fallback: string): { ok: false; error: string } {
  if (error instanceof DataError) return { ok: false, error: error.message };
  return { ok: false, error: fallback };
}

/** The session and the data layer, or a redirect to sign-in. */
export async function requireUser(signIn = "/sign-in") {
  const user = await getCurrentUser();
  if (!user) redirect(signIn);
  return { repo: await getRepository(), user };
}
