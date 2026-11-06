import "server-only";

import { randomUUID } from "node:crypto";

import { env } from "@/lib/env";

import { appendOutbox } from "./outbox";

/**
 * Transactional mail. With `RESEND_API_KEY` set it goes through Resend's
 * HTTP API — one fetch, no SDK. Without it nothing leaves the machine: the
 * message is logged and appended to the local outbox (outbox.ts).
 */

export const DEFAULT_EMAIL_FROM = "Roster <noreply@myroster.us>";
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 8_000;

export type Email = {
  to: string;
  subject: string;
  text: string;
  html: string;
  tag: string;
};

export type SendResult = { via: "resend" | "outbox"; id: string };

export async function sendEmail(email: Email): Promise<SendResult> {
  const { RESEND_API_KEY: key, EMAIL_FROM } = env();
  const from = EMAIL_FROM ?? DEFAULT_EMAIL_FROM;

  if (!key) {
    const id = randomUUID();
    await appendOutbox({ id, from, ...email, created_at: new Date().toISOString() });
    console.info(`[email] outbox (no RESEND_API_KEY): ${email.tag} → ${email.to}`);
    return { via: "outbox", id };
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
      tags: [{ name: "kind", value: email.tag }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    // The body names the problem (unverified domain, bad key) without echoing the key.
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend refused the message (${response.status}): ${detail.slice(0, 200)}`);
  }
  const { id } = (await response.json()) as { id: string };
  return { via: "resend", id };
}
