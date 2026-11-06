import "server-only";

import { createHash } from "node:crypto";

/**
 * A small sliding-window limiter for endpoints anyone can call without an
 * account — sign-in, sign-up, the handle checker, the forgot-password form,
 * the coach's verify answer, profile reports (#39). Budgets are per client
 * address and, where there is one, per target (an email, a link), so neither
 * one address nor a botnet aimed at one mailbox gets far.
 *
 * In memory, per server instance. That is a speed bump, not a wall: several
 * instances each keep their own window, and a restart forgets everything.
 * It is enough to stop one client from walking the handle namespace or
 * sending a mailbox a hundred reset emails, which is the job. Supabase's
 * auth rate limits sit behind it in production.
 *
 * Privacy: the key is a truncated sha256 of the client address and a
 * per-process salt, never the address itself, and an entry is dropped once
 * its window passes. Nothing is written to disk or logged. The trade-off is
 * that clients behind one NAT share a budget — the limits are set well above
 * what a person typing produces, so in practice only scripts notice.
 */

type Window = { hits: number[] };

const STORE = Symbol.for("roster.rate-limit");
type Holder = { [STORE]?: { salt: string; buckets: Map<string, Window> } };

function state() {
  // On globalThis, like the store lock: Next may hold several instances of
  // this module in one process, and each must count against the same window.
  const holder = globalThis as Holder;
  holder[STORE] ??= { salt: createHash("sha256").update(`${process.pid}:${Date.now()}:${Math.random()}`).digest("hex"), buckets: new Map() };
  return holder[STORE];
}

function bucketId(scope: string, key: string): string {
  return `${scope}:${createHash("sha256").update(`${state().salt}:${key}`).digest("hex").slice(0, 24)}`;
}

/** Past this many tracked keys, expired ones are swept before adding another. */
const SWEEP_AT = 5_000;

/**
 * Records one hit for `key` in `scope` and says whether it is within `limit`
 * per `windowMs`. Refused hits are not recorded, so a client that backs off
 * recovers as soon as its oldest hit ages out.
 */
export function hit(scope: string, key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const { buckets } = state();
  const id = bucketId(scope, key);

  if (buckets.size > SWEEP_AT) {
    for (const [k, w] of buckets) {
      if (w.hits.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }

  const window = buckets.get(id) ?? { hits: [] };
  window.hits = window.hits.filter((t) => now - t < windowMs);
  if (window.hits.length >= limit) {
    buckets.set(id, window);
    return false;
  }
  window.hits.push(now);
  buckets.set(id, window);
  return true;
}

/**
 * Whether the action-level limits (`limit`, `limitAll`) apply in this
 * process. `hit` itself always counts — the unit tests drive it directly.
 *
 *   ROSTER_RATE_LIMIT=off  never limit (an escape hatch for load tests)
 *   ROSTER_RATE_LIMIT=on   always limit, even in the modes below
 *   NODE_ENV=test          off
 *   ROSTER_DATA=local      off — the demo and the e2e / audit runs, which
 *                          sign in dozens of times from one address and
 *                          must never flake on a budget meant for scripts
 *
 * Read from process.env directly, not lib/env.ts: the data-mode resolution
 * there throws in a misconfigured production, and a limiter must not be
 * the thing that takes a page down.
 */
export function rateLimitsEnabled(): boolean {
  const flag = process.env.ROSTER_RATE_LIMIT?.trim().toLowerCase();
  if (flag === "off") return false;
  if (flag === "on") return true;
  if (process.env.NODE_ENV === "test") return false;
  return process.env.ROSTER_DATA?.trim() !== "local";
}

/** One budget: `limit` hits per `windowMs` for `key` within `scope`. */
export type Budget = { scope: string; key: string; limit: number; windowMs: number };

/** `hit`, unless limits are off for this process (`rateLimitsEnabled`). */
export function limit(budget: Budget, now = Date.now()): boolean {
  if (!rateLimitsEnabled()) return true;
  return hit(budget.scope, budget.key, budget.limit, budget.windowMs, now);
}

/**
 * Several budgets at once — typically per client address and per target
 * (an email, a link). Every budget is checked before any is charged, so a
 * request refused by one does not eat into the others: a mailbox someone
 * else is hammering does not drain this client's own allowance.
 */
export function limitAll(budgets: Budget[], now = Date.now()): boolean {
  if (!rateLimitsEnabled()) return true;
  if (!budgets.every((b) => remaining(b, now) > 0)) return false;
  for (const b of budgets) hit(b.scope, b.key, b.limit, b.windowMs, now);
  return true;
}

/** Hits left for `budget` right now, without recording one. */
export function remaining(budget: Budget, now = Date.now()): number {
  const window = state().buckets.get(bucketId(budget.scope, budget.key));
  const live = window ? window.hits.filter((t) => now - t < budget.windowMs).length : 0;
  return Math.max(0, budget.limit - live);
}

/** Test seam: forget every window. */
export function resetRateLimits(): void {
  state().buckets.clear();
}
