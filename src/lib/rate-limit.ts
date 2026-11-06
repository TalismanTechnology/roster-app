import "server-only";

import { createHash } from "node:crypto";

/**
 * A small sliding-window limiter for endpoints anyone can call without an
 * account — the handle checker, the forgot-password form.
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

/** Past this many tracked keys, expired ones are swept before adding another. */
const SWEEP_AT = 5_000;

/**
 * Records one hit for `key` in `scope` and says whether it is within `limit`
 * per `windowMs`. Refused hits are not recorded, so a client that backs off
 * recovers as soon as its oldest hit ages out.
 */
export function hit(scope: string, key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const { salt, buckets } = state();
  const id = `${scope}:${createHash("sha256").update(`${salt}:${key}`).digest("hex").slice(0, 24)}`;

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

/** Test seam: forget every window. */
export function resetRateLimits(): void {
  state().buckets.clear();
}
