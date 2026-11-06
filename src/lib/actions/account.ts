"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { reissueSession, signOutEverywhere } from "@/lib/data/auth";
import { revalidateProfile } from "@/lib/revalidate";

import { failed, formValues, requireUser as requireSession, str, type FormValues } from "./shared";

/**
 * Account settings: the sign-in email, the password, and deletion. Each
 * re-validates on the server and checks the session; the repository does
 * the rest (uniqueness, current-password check, the cascade on delete).
 */

/** `values` carries non-secret fields back after a failure; passwords never return. */
export type AccountFormState = { ok: boolean; error: string | null; values?: FormValues };

const IDLE: AccountFormState = { ok: true, error: null };

const requireUser = () => requireSession("/sign-in?next=/settings");

export async function updateEmail(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const { repo, user } = await requireUser();
  const parsed = z.string().trim().email("Enter a valid email address.").safeParse(str(formData, "email"));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, values: formValues(formData) };

  try {
    await repo.updateEmail(user.id, parsed.data);
  } catch (error) {
    return failed(error, "Could not update your email.", formValues(formData));
  }
  return IDLE;
}

const passwordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    next: z.string().min(8, "New password must be at least 8 characters."),
    confirm: z.string(),
  })
  .refine((p) => p.next === p.confirm, { message: "The new passwords don't match.", path: ["confirm"] });

export async function updatePassword(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const { repo, user } = await requireUser();
  const parsed = passwordSchema.safeParse({
    current: str(formData, "current"),
    next: str(formData, "next"),
    confirm: str(formData, "confirm"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await repo.updatePassword(user.id, parsed.data.current, parsed.data.next);
  } catch (error) {
    return failed(error, "Could not update your password.");
  }
  // The change retired every session cookie, this one included; hand this
  // device a fresh one so only the others are signed out.
  await reissueSession(user.id);
  return IDLE;
}

/** Deletion asks for the handle (or email, for accounts without one) typed back. */
export async function deleteAccount(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const { repo, user } = await requireUser();
  const profile = await repo.getProfileById(user.id);
  const expected = profile?.handle ?? user.email;
  const typed = str(formData, "confirm_handle").trim().toLowerCase();

  if (typed !== expected.toLowerCase()) {
    return { ok: false, error: `Type ${expected} to confirm.`, values: formValues(formData) };
  }

  try {
    await repo.deleteAccount(user.id);
  } catch (error) {
    return failed(error, "Could not delete the account.", formValues(formData));
  }
  // The public resume and its search row go with the account.
  revalidateProfile(profile?.handle);

  await signOutEverywhere();
  redirect("/");
}
