import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing for local mode. scrypt from node:crypto — no dependency,
 * memory-hard, and the parameters are stored with the hash so they can be
 * raised later without invalidating existing accounts.
 */

const KEY_LENGTH = 64;
const COST = 16384;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH, { N: COST }).toString("hex");
  return `scrypt$${COST}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, costRaw, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;

  const cost = Number(costRaw);
  const candidate = scryptSync(password, salt, KEY_LENGTH, { N: cost });
  const expected = Buffer.from(hash, "hex");

  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

let dummyHash: string | null = null;

/**
 * A real hash of a throwaway password, made once per process. Sign-in
 * verifies against it when the email has no account, so "no such user"
 * costs the same scrypt run as "wrong password" and response time does not
 * reveal which emails are registered.
 */
export function dummyPasswordHash(): string {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}

/**
 * `verifyPassword` against the stored hash, or against the dummy when there
 * is no account — always exactly one scrypt run, always false for a missing
 * account.
 */
export function verifyPasswordConstantTime(password: string, stored: string | null | undefined): boolean {
  const matched = verifyPassword(password, stored ?? dummyPasswordHash());
  return Boolean(stored) && matched;
}
