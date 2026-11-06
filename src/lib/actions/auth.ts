"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { homePathFor } from "@/lib/accounts";
import { getRepository } from "@/lib/data";
import { getCurrentUser, reissueSession, signInWithPassword, signOutEverywhere, signUpWithPassword } from "@/lib/data/auth";
import { DataError } from "@/lib/data/types";
import { emailPasswordReset } from "@/lib/email/account";
import { hit } from "@/lib/rate-limit";
import { safeNext } from "@/lib/safe-next";
import { absoluteUrl } from "@/lib/site";

import { fieldErrorsOf } from "./schemas";
import { clientKey, str } from "./shared";

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
  /** On a validation failure, each field's messages. */
  fieldErrors?: Record<string, string[]>;
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
    return { error: parsed.error.issues[0].message, email, fieldErrors: fieldErrorsOf(parsed.error) };
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
    return { error: parsed.error.issues[0].message, email, fieldErrors: fieldErrorsOf(parsed.error) };
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

// ---------------------------------------------------------------------------
// Forgot / reset password (#47)
// ---------------------------------------------------------------------------

export type ResetRequestState = {
  error: string | null;
  /** The request was accepted. Says nothing about whether the email has an account. */
  sent?: boolean;
  email?: string;
  fieldErrors?: Record<string, string[]>;
};

/** Per client address and per target mailbox, per 15 minutes. */
const RESET_WINDOW_MS = 15 * 60_000;
const RESETS_PER_CLIENT = 10;
const RESETS_PER_EMAIL = 3;

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address.") });

/**
 * Sends a reset link if the email has an account — and answers identically
 * if it doesn't, so the form cannot be used to learn who is registered.
 * Supabase mails its own recovery link (landing at /auth/callback, then
 * /reset-password); local mode mints a token and writes the mail to the
 * outbox for dev and the e2e run to open.
 */
export async function requestPasswordReset(_prev: ResetRequestState, formData: FormData): Promise<ResetRequestState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  const email = str(formData, "email");
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, email, fieldErrors: fieldErrorsOf(parsed.error) };
  }

  // Both budgets apply to any address, known or not, so hitting one says
  // nothing about the account — only that the form was used too often.
  const withinBudget =
    hit("reset:client", await clientKey(), RESETS_PER_CLIENT, RESET_WINDOW_MS) &&
    hit("reset:email", parsed.data.email, RESETS_PER_EMAIL, RESET_WINDOW_MS);
  if (!withinBudget) {
    return { error: "Too many reset requests. Wait a few minutes and try again.", email };
  }

  try {
    const repo = await getRepository();
    const issued = await repo.requestPasswordReset(
      parsed.data.email,
      absoluteUrl(`/auth/callback?next=${encodeURIComponent("/reset-password")}`),
    );
    if (issued) {
      await emailPasswordReset({
        to: issued.email,
        url: absoluteUrl(`/reset-password?token=${encodeURIComponent(issued.token)}`),
      });
    }
  } catch (error) {
    if (error instanceof DataError && error.code === "rate_limited") return { error: error.message, email };
    // Anything else is ours to log, not theirs to learn from.
    console.error("[auth] password reset request failed:", error instanceof Error ? error.message : error);
  }
  return { error: null, sent: true, email: parsed.data.email };
}

export type ResetPasswordState = { error: string | null; fieldErrors?: Record<string, string[]> };

const newPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirm: z.string(),
  })
  .refine((p) => p.password === p.confirm, { message: "The passwords don't match.", path: ["confirm"] });

/**
 * Completes a reset: a live local token, or a Supabase recovery session.
 * Every other session is signed out; this device continues signed in with
 * the new password.
 */
export async function resetPassword(_prev: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const parsed = newPasswordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, fieldErrors: fieldErrorsOf(parsed.error) };

  const token = str(formData, "token") || null;
  let userId: string;
  try {
    userId = (await (await getRepository()).resetPassword(token, parsed.data.password)).id;
  } catch (error) {
    if (error instanceof DataError) return { error: error.message };
    return { error: "Could not reset your password. Try again." };
  }
  // Local: the reset bumped the session version; this cookie is the new one.
  await reissueSession(userId);
  redirect("/settings?password=reset");
}
