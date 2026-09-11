"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getRepository } from "@/lib/data";
import { getCurrentUser, signInWithPassword, signOutEverywhere, signUpWithPassword } from "@/lib/data/auth";

/** Where a fresh session lands: athletes in the editor, recruiters at their lists. */
async function homeFor(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) return "/resume";
  const profile = await (await getRepository()).getProfileById(user.id);
  return profile?.account_kind === "recruiter" ? "/lists" : "/resume";
}

/**
 * Auth actions. Sign-up is open — the invite gate went out with the pivot to
 * public resumes — so these are deliberately plain: email, password, done.
 *
 * Every action re-validates on the server. The forms validate too, but a
 * Server Function is reachable by direct POST and must not trust its caller.
 */

export type AuthFormState = {
  error: string | null;
  /** Sign-up sets this when the project requires email confirmation. */
  confirmEmail?: boolean;
};

const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

/** Where to land after auth. Relative paths only, or an attacker's sign-in
 *  link could bounce a fresh session to their own domain. */
function safeNext(raw: FormDataEntryValue | null, fallback: string): string {
  const next = typeof raw === "string" ? raw : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const result = await signInWithPassword(parsed.data.email, parsed.data.password);
  if (result.error) return { error: result.error };

  redirect(safeNext(formData.get("next"), await homeFor()));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const result = await signUpWithPassword(parsed.data.email, parsed.data.password);
  if (result.error) return { error: result.error };
  if (result.confirmEmail) return { error: null, confirmEmail: true };

  redirect("/onboarding");
}

export async function signOut(): Promise<void> {
  await signOutEverywhere();
  redirect("/");
}
