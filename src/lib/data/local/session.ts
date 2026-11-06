import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { env, sessionSecret } from "@/lib/env";

import { dataDir } from "./paths";

/**
 * Local-mode sessions: a signed cookie, no server-side state.
 *
 * `roster_session=<userId>.<version>.<issuedAt>.<hmac>`. The proxy verifies
 * the signature on every gated request with no I/O beyond reading the secret
 * once, which is the property that matters — a session check must never be
 * the slow part of a page. The secret comes from the environment or, failing
 * that, a file generated on first use so a fresh clone works with zero
 * setup. Production requires the environment variable — see `sessionSecret`.
 *
 * `version` is the user's `session_version` at sign-in. Changing the
 * password bumps it, and `getCurrentUser` refuses a cookie whose version is
 * behind, so every other device holding the old cookie is signed out.
 * `issuedAt` (seconds) caps a stolen cookie's life at the cookie max-age
 * even if the browser was told to keep it longer.
 */

export const SESSION_COOKIE = "roster_session";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30;

let cachedSecret: string | null = null;

function secret(): string {
  if (cachedSecret) return cachedSecret;

  const fromEnv = sessionSecret();
  if (fromEnv) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  const file = path.join(dataDir(), "secret");
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
  }

  cachedSecret = fs.readFileSync(file, "utf8").trim();
  return cachedSecret;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export type SessionClaims = { userId: string; version: number; issuedAt: number };

export function signSession(userId: string, version = 0, issuedAt = Math.floor(Date.now() / 1000)): string {
  const payload = `${userId}.${version}.${issuedAt}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * What the cookie vouches for, or null if it is missing, forged, malformed,
 * or older than the session max-age. Signature and age only — whether the
 * version is still current is a data question for `getCurrentUser`.
 */
export function verifySession(value: string | undefined | null, nowS = Math.floor(Date.now() / 1000)): SessionClaims | null {
  if (!value) return null;

  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [userId, rawVersion, rawIssuedAt, mac] = parts;
  if (!userId || !/^\d{1,9}$/.test(rawVersion) || !/^\d{1,12}$/.test(rawIssuedAt)) return null;

  const given = Buffer.from(mac);
  const expected = Buffer.from(sign(`${userId}.${rawVersion}.${rawIssuedAt}`));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const issuedAt = Number(rawIssuedAt);
  // A little slack for clock skew between instances, none for the future beyond it.
  if (issuedAt > nowS + 300 || nowS - issuedAt > SESSION_MAX_AGE_S) return null;

  return { userId, version: Number(rawVersion), issuedAt };
}

/** Cookie attributes shared by the set and clear paths. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env().NODE_ENV === "production",
    path: "/",
  };
}
