"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { finalizeDeletedLocalNetworkAccount } from "@/lib/network/local";
import { getNetworkRepository } from "@/lib/network";
import { removeLocalAccountMedia } from "@/lib/media";
import { deleteAccountInOrder } from "@/lib/data/account-cleanup";
import { getRepository, isLocalMode } from "@/lib/data";
import { getCurrentUser, signOutEverywhere } from "@/lib/data/auth";
import { DataError } from "@/lib/data/types";

/**
 * Account settings: the sign-in email, the password, and deletion. Each
 * re-validates on the server and checks the session; the repository does
 * the rest (uniqueness, current-password check, the cascade on delete).
 */

export type AccountFormState = { ok: boolean; error: string | null };

const IDLE: AccountFormState = { ok: true, error: null };

function str(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function failed(error: unknown, fallback: string): AccountFormState {
  if (error instanceof DataError) return { ok: false, error: error.message };
  return { ok: false, error: fallback };
}

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/settings");
  return { repo: await getRepository(), user };
}

export async function updateEmail(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const { repo, user } = await requireUser();
  const parsed = z.string().trim().email("Enter a valid email address.").safeParse(str(formData, "email"));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await repo.updateEmail(user.id, parsed.data);
  } catch (error) {
    return failed(error, "Could not update your email.");
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
  return IDLE;
}

/** Deletion asks for the handle (or email, for accounts without one) typed back. */
export async function deleteAccount(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const { repo, user } = await requireUser();
  const profile = await repo.getProfileById(user.id);
  const expected = profile?.handle ?? user.email;
  const typed = str(formData, "confirm_handle").trim().toLowerCase();

  if (typed !== expected.toLowerCase()) {
    return { ok: false, error: `Type ${expected} to confirm.` };
  }

  try {
    const network = await getNetworkRepository();
    await deleteAccountInOrder({
      removeNetwork: () => network.deleteAccountData(),
      removeMedia: async () => { if (isLocalMode()) await removeLocalAccountMedia(user.id); },
      removeAccount: async () => {
        await repo.deleteAccount(user.id);
        if (isLocalMode()) await finalizeDeletedLocalNetworkAccount(user.id);
      },
    });
  } catch (error) {
    return failed(error, "Could not delete the account.");
  }

  await signOutEverywhere();
  redirect("/");
}
