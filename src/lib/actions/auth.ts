"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

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

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // The generic message is deliberate: "no such account" versus "wrong
    // password" tells an attacker which emails have accounts.
    return { error: "That email and password combination did not work." };
  }

  redirect(safeNext(formData.get("next"), "/resume"));
}

export async function signUp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);

  if (error) {
    return { error: error.message };
  }

  // With email confirmation on, signUp returns a user but no session; the
  // session arrives via /auth/callback when they click the link.
  if (!data.session) {
    return { error: null, confirmEmail: true };
  }

  redirect("/onboarding");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  redirect("/");
}
