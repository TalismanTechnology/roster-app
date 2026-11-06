import "server-only";

import { PASSWORD_RESET_TTL_MINUTES } from "@/lib/data/rules";

import { sendEmail } from "./send";
import { passwordResetEmail } from "./templates";

/**
 * Account mail the app sends itself — in local mode, where there is no
 * Supabase to send it. Like the verification mail it never throws: the
 * forgot-password form answers the same way whether or not anything went
 * out, so a failure is logged and nothing more.
 */
export async function emailPasswordReset(input: { to: string; url: string }): Promise<boolean> {
  try {
    const message = passwordResetEmail({ url: input.url, expiresInMinutes: PASSWORD_RESET_TTL_MINUTES });
    await sendEmail({ to: input.to, tag: "password_reset", ...message });
    return true;
  } catch (error) {
    console.error("[email] password reset failed:", error instanceof Error ? error.message : error);
    return false;
  }
}
