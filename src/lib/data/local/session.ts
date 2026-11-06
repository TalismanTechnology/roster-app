import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { env, sessionSecret } from "@/lib/env";

import { dataDir } from "./paths";

/**
 * Local-mode sessions: a signed cookie, no server-side state.
 *
 * `roster_session=<userId>.<hmac>`. The proxy verifies the signature on every
 * gated request with no I/O beyond reading the secret once, which is the
 * property that matters — a session check must never be the slow part of a
 * page. The secret comes from the environment or, failing that, a file
 * generated on first use so a fresh clone works with zero setup. Production
 * requires the environment variable — see `sessionSecret`.
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

function sign(userId: string): string {
  return createHmac("sha256", secret()).update(userId).digest("base64url");
}

export function signSession(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

/** The user id the cookie vouches for, or null if it is missing or forged. */
export function verifySession(value: string | undefined | null): string | null {
  if (!value) return null;

  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;

  const userId = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(userId));

  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? userId : null;
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
