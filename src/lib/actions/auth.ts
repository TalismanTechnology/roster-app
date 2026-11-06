"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { homePathFor } from "@/lib/accounts";
import { getRepository } from "@/lib/data";
import { getCurrentUser, signInWithPassword, signOutEverywhere, signUpWithPassword } from "@/lib/data/auth";
import { safeNext } from "@/lib/safe-next";

/** Where a fresh session lands: athletes in the editor, everyone else at their lists. */
async function homeFor(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) return "/resume";
  const profile = await (await getRepository()).getProfileById(user.id);
  return homePathFor(profile?.account_kind);
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
  /** The email, put back after a failed attempt. Never the password. */
  email?: string;
  /** Sign-up sets this when the project requires email confirmation. */
  confirmEmail?: boolean;
};

const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  const email = typeof formData.get("email") === "string" ? String(formData.get("email")) : "";
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, email };
  }

  const result = await signInWithPassword(parsed.data.email, parsed.data.password);
  if (result.error) return { error: result.error, email };

  redirect(safeNext(formData.get("next"), await homeFor()));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  const email = typeof formData.get("email") === "string" ? String(formData.get("email")) : "";
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, email };
  }

  const result = await signUpWithPassword(parsed.data.email, parsed.data.password);
  if (result.error) return { error: result.error, email };
  if (result.confirmEmail) return { error: null, confirmEmail: true };

  // A new account has no resume yet, so onboarding comes first unless the
  // visitor arrived with somewhere specific to go (a list, a resume).
  redirect(safeNext(formData.get("next"), "/onboarding"));
}

export async function signOut(): Promise<void> {
  await signOutEverywhere();
  redirect("/");
}
