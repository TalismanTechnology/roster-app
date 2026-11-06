"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";

import { failed, formValues, str, type FormValues } from "./shared";

/**
 * A coach's answer to a verification request. No account required: the
 * token in the link is the authority, and the repository refuses the
 * athlete's own session, a used link, and an expired one.
 */

export type VerifyFormState = {
  ok: boolean;
  error: string | null;
  outcome?: "verified" | "disputed";
  /** The coach's name, role, and note, put back after a failure. */
  values?: FormValues;
};

const schema = z.object({
  token: z.string().min(10),
  outcome: z.enum(["verified", "disputed"]),
  name: z.string().trim().min(2, "Enter your name.").max(80),
  role: z
    .string()
    .trim()
    .max(80)
    .transform((v) => (v === "" ? null : v)),
  note: z
    .string()
    .trim()
    .max(500, "Keep the note under 500 characters.")
    .transform((v) => (v === "" ? null : v)),
});

export async function respondVerification(_prev: VerifyFormState, formData: FormData): Promise<VerifyFormState> {
  const parsed = schema.safeParse({
    token: str(formData, "token"),
    outcome: str(formData, "outcome"),
    name: str(formData, "name"),
    role: str(formData, "role"),
    note: str(formData, "note"),
  });

  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, values: formValues(formData) };

  const [repo, user] = await Promise.all([getRepository(), getCurrentUser()]);
  const { token, outcome, name, role, note } = parsed.data;

  try {
    const { handle } = await repo.respondToVerification(token, outcome, note, { name, role }, user?.id ?? null);

    // The athlete's surfaces update now: the editor and the public resume
    // whose badge just changed. The coach's page re-renders too, as
    // "answered" — VerifyForm keeps this action's result across that
    // refresh, so the thank-you comes from what happened, not a clock.
    revalidatePath("/resume");
    revalidatePath(`/${handle}`);
  } catch (error) {
    return failed(error, "Could not record your answer. Try again.", formValues(formData));
  }

  return { ok: true, error: null, outcome };
}
