import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * Verification link tokens.
 *
 * The raw token is a bearer credential: whoever holds the link answers as the
 * coach. So it is minted here, shown to the athlete once, emailed to the
 * coach, and otherwise never persisted — both adapters store only
 * `hashToken(token)`. The digest matches `verification_token_hash()` in
 * migration 0017 byte for byte (sha256 over UTF-8, lowercase hex), which is
 * what lets the Supabase functions hash a raw token themselves.
 */

/** 24 random bytes, base64url: 32 URL-safe characters, 192 bits. */
export function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
