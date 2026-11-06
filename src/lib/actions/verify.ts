"use server";

import { z } from "zod";

import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";
import { emailAthleteAnswer } from "@/lib/email/verification";
import { revalidateProfile } from "@/lib/revalidate";

import { fieldErrorsOf } from "./schemas";
import { failed, formValues, str, type FormValues } from "./shared";

/**
 * A coach's answer to a verification request. No account required: the
 * token in the link is the authority, and the repository refuses the
 * athlete's own session, a used link, and an expired one.
 *
 * Three answers: verify (only with the attestation ticked, #78), dispute,
 * or "I don't coach or know this athlete" (#83) — a dispute carrying a flag,
 * so the athlete learns the link reached the wrong person rather than that
 * their claim is wrong. `request_id` answers one of the coach's other
 * pending entries from the same athlete with this link (#81).
 */

export type VerifyFormState = {
  ok: boolean;
  error: string | null;
  outcome?: "verified" | "disputed";
  /** The answer was "I don't know this athlete". */
  flagged?: boolean;
  /** Which request was answered — the link's own, or a sibling's. */
  requestId?: string;
  /** The coach's name, role, and note, put back after a failure. */
  values?: FormValues;
  /** On a validation failure, each field's messages. */
  fieldErrors?: Record<string, string[]>;
};

const schema = z.object({
  token: z.string().min(10).max(200),
  outcome: z.enum(["verified", "disputed", "unknown"]),
  attest: z.boolean(),
  request_id: z
    .string()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(z.uuid().optional()),
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
    attest: str(formData, "attest") === "on",
    request_id: str(formData, "request_id"),
    name: str(formData, "name"),
    role: str(formData, "role"),
    note: str(formData, "note"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0].message,
      values: formValues(formData),
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const { token, outcome, attest, request_id: requestId, name, role, note } = parsed.data;
  // A verification is a statement of fact with a name on it; it has to be
  // made deliberately. Disputes and "don't know" need no attestation.
  if (outcome === "verified" && !attest) {
    return {
      ok: false,
      error: "Confirm you coached or saw this athlete before verifying.",
      values: formValues(formData),
      fieldErrors: { attest: ["Tick this to verify."] },
    };
  }

  const [repo, user] = await Promise.all([getRepository(), getCurrentUser()]);
  const flagUnknownAthlete = outcome === "unknown";

  let result;
  try {
    result = await repo.respondToVerification(
      token,
      flagUnknownAthlete ? "disputed" : outcome,
      note,
      { name, role },
      user?.id ?? null,
      { flagUnknownAthlete, requestId },
    );
    const { handle } = result;

    // The athlete's surfaces update now: the editor, the public resume
    // whose badge just changed, and the verified count in search. The
    // coach's page re-renders too, as
    // "answered" — VerifyForm keeps this action's result across that
    // refresh, so the thank-you comes from what happened, not a clock.
    revalidateProfile(handle);
  } catch (error) {
    return failed(error, "Could not record your answer. Try again.", formValues(formData));
  }

  // #80: tell the athlete. Never fails the answer — see email/verification.ts.
  await emailAthleteAnswer({
    athleteEmail: result.athleteEmail,
    athleteName: result.athleteName,
    coachName: name,
    entryTitle: result.entryTitle,
    outcome: result.outcome,
    flaggedUnknownAthlete: result.flaggedUnknownAthlete,
    note,
  });

  return { ok: true, error: null, outcome: result.outcome, flagged: result.flaggedUnknownAthlete, requestId: result.requestId };
}
