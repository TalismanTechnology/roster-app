"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";
import { DataError } from "@/lib/data/types";

/**
 * A coach's answer to a verification request. No account required: the
 * token in the link is the authority, and the repository refuses the
 * athlete's own session, a used link, and an expired one.
 */

export type VerifyFormState = { ok: boolean; error: string | null; outcome?: "verified" | "disputed" };

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

function str(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function respondVerification(_prev: VerifyFormState, formData: FormData): Promise<VerifyFormState> {
  const parsed = schema.safeParse({
    token: str(formData, "token"),
    outcome: str(formData, "outcome"),
    name: str(formData, "name"),
    role: str(formData, "role"),
    note: str(formData, "note"),
  });

  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const [repo, user] = await Promise.all([getRepository(), getCurrentUser()]);
  const { token, outcome, name, role, note } = parsed.data;

  try {
    const request = await repo.getVerificationRequest(token);
    await repo.respondToVerification(token, outcome, note, { name, role }, user?.id ?? null);

    // The athlete's surfaces update now. The coach's own page is deliberately
    // not revalidated: doing so re-renders it as "already answered" and
    // unmounts the form before the thank-you shows. A fresh visit still sees
    // the answered state.
    revalidatePath("/resume");
    if (request) revalidatePath(`/${request.athlete.handle}`);
  } catch (error) {
    if (error instanceof DataError) return { ok: false, error: error.message };
    return { ok: false, error: "Could not record your answer. Try again." };
  }

  return { ok: true, error: null, outcome };
}
