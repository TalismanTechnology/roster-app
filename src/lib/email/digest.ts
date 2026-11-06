import "server-only";

import { sendEmail } from "./send";
import { digestOptInEmail } from "./templates";

/**
 * Saved-search digests (#88).
 *
 * STUB, on purpose: turning a digest on stores `saved_searches.digest` and
 * sends this one confirmation (to the local outbox without RESEND_API_KEY).
 * The weekly "new matches" send needs a scheduler — a Vercel cron or a
 * Supabase scheduled function walking `saved_searches where digest` and
 * diffing results since the last run — and is not part of Wave 8. Nothing
 * else reads the flag yet.
 *
 * Never throws: the toggle is saved whether or not the mail goes out.
 */
export async function emailDigestOptIn(input: { to: string; searchName: string; url: string }): Promise<boolean> {
  try {
    await sendEmail({ to: input.to, tag: "saved_search_digest", ...digestOptInEmail(input) });
    return true;
  } catch (error) {
    console.error("[email] digest opt-in failed:", error instanceof Error ? error.message : error);
    return false;
  }
}
