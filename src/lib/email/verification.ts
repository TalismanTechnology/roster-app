import "server-only";

import { absoluteUrl, verifyUrl } from "@/lib/site";

import { sendEmail, type SendResult } from "./send";
import { verificationAnsweredEmail, verificationRequestEmail } from "./templates";

/**
 * The verification flow's two notifications. Mail is a courtesy on top of a
 * write that already happened, so neither ever throws: a provider outage
 * must not turn a recorded answer into an error screen. They report whether
 * a message went out so the UI can say "emailed" honestly.
 */

async function deliver(send: () => Promise<SendResult>, what: string): Promise<boolean> {
  try {
    await send();
    return true;
  } catch (error) {
    console.error(`[email] ${what} failed:`, error instanceof Error ? error.message : error);
    return false;
  }
}

/** #75 — the coach gets their link. False when there is no address or sending failed. */
export async function emailCoachRequest(input: {
  coachEmail: string | null;
  coachName: string;
  athleteName: string;
  entryTitle: string;
  token: string;
  expiresAt: string;
}): Promise<boolean> {
  if (!input.coachEmail) return false;
  const message = verificationRequestEmail({ ...input, url: verifyUrl(input.token) });
  return deliver(() => sendEmail({ to: input.coachEmail!, tag: "verification_request", ...message }), "coach request");
}

/** #80 — the athlete hears the answer. */
export async function emailAthleteAnswer(input: {
  athleteEmail: string | null;
  athleteName: string;
  coachName: string;
  entryTitle: string;
  outcome: "verified" | "disputed";
  flaggedUnknownAthlete: boolean;
  note: string | null;
}): Promise<boolean> {
  if (!input.athleteEmail) return false;
  const message = verificationAnsweredEmail({ ...input, editorUrl: absoluteUrl("/resume?section=requests") });
  return deliver(() => sendEmail({ to: input.athleteEmail!, tag: "verification_answered", ...message }), "athlete answer");
}
