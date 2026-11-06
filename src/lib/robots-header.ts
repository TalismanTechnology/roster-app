import "server-only";

import { getPublicRepository } from "@/lib/data";
import type { ProfileVisibility } from "@/lib/database.types";
import { handleFromPath } from "@/lib/handles";

/**
 * `X-Robots-Tag` for unlisted resumes (#73). The page's robots meta already
 * says noindex, but only HTML has a <head>: the share-card PNGs under the
 * same handle do not, and a header is also what some crawlers honour first.
 * "noarchive" because an unlisted resume can go private, and a cached copy
 * would outlive that choice.
 *
 * The proxy cannot see what the page will render, so it asks the data layer
 * once per handle and remembers the answer briefly. A visibility change
 * therefore reaches the header within VISIBILITY_TTL_MS (the HTML meta
 * changes at once). A failed lookup sets nothing: the meta tag still
 * protects the page, and a data hiccup must never break the resume.
 */

export const UNLISTED_ROBOTS = "noindex, noarchive";

const VISIBILITY_TTL_MS = 30_000;
const MAX_CACHED = 1000;

/** Handle → visibility as the anonymous visitor sees it (null: not visible to them). */
const cache = new Map<string, { visibility: ProfileVisibility | null; expires: number }>();

async function visibilityOf(handle: string): Promise<ProfileVisibility | null> {
  const now = Date.now();
  const hit = cache.get(handle);
  if (hit && hit.expires > now) return hit.visibility;

  const profile = await getPublicRepository().getProfileByHandle(handle, null);
  const visibility = profile?.visibility ?? null;
  // Oldest-first eviction: a Map iterates in insertion order.
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value as string);
  cache.delete(handle);
  cache.set(handle, { visibility, expires: now + VISIBILITY_TTL_MS });
  return visibility;
}

/** The header value for this path, or null when none applies. */
export async function robotsHeaderFor(pathname: string): Promise<string | null> {
  const handle = handleFromPath(pathname);
  if (!handle) return null;
  try {
    return (await visibilityOf(handle)) === "unlisted" ? UNLISTED_ROBOTS : null;
  } catch {
    return null;
  }
}
