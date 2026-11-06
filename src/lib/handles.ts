/**
 * The handle namespace.
 *
 * A resume lives at roster.us/<handle>, so handles and top-level routes share
 * one namespace. This file is the app-side mirror of `reserved_handles` in
 * migration 0002; the database trigger is the enforcement point, so drift here
 * costs a worse error message, not a broken route.
 *
 * Callers: the onboarding action and form refuse a reserved handle before
 * submit, and the local adapter refuses one on insert.
 *
 * Migration 0015 brought `reserved_handles` level with this list. A new
 * entry here needs a matching `insert ... on conflict do nothing` migration.
 */

export const RESERVED_HANDLES = new Set([
  // Top-level segments under src/app — a handle here would be shadowed by
  // the route (or shadow it). The handles test fails if a new route is
  // added without its name landing in this block.
  "auth",
  "forgot-password",
  "lists",
  "media",
  "onboarding",
  "preview",
  "reset-password",
  "resume",
  "search",
  "settings",
  "sign-in",
  "sign-up",
  "verify",
  // Metadata files Next serves from the root.
  "apple-icon",
  "favicon",
  "icon",
  "manifest",
  "opengraph-image",
  "robots",
  "sitemap",
  "twitter-image",
  // Words held for routes and pages that will exist, or that read as official.
  "about",
  "account",
  "admin",
  "api",
  "edit",
  "explore",
  "help",
  "join",
  "legal",
  "login",
  "logout",
  "privacy",
  "recruit",
  "roster",
  "sign-out",
  "signin",
  "signup",
  "static",
  "support",
  "terms",
  "www",
]);

/** Mirrors the `handle_format` CHECK on profiles: 3-30 chars, no edge underscores. */
export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$/;

export function isReservedHandle(handle: string): boolean {
  return RESERVED_HANDLES.has(handle.toLowerCase());
}

export function isValidHandle(handle: string): boolean {
  return HANDLE_PATTERN.test(handle) && !isReservedHandle(handle);
}

/**
 * The handle a request path addresses — the resume itself or its share-card
 * images — or null for every other route. Used by the proxy to decide which
 * requests are worth a visibility lookup.
 */
export function handleFromPath(pathname: string): string | null {
  const match = /^\/([^/]+)(?:\/(?:opengraph|twitter)-image[^/]*)?\/?$/.exec(pathname);
  if (!match) return null;
  const handle = match[1].toLowerCase();
  return isValidHandle(handle) ? handle : null;
}

/**
 * A handle for an account that never chose one — recruiters and coaches
 * skip the athlete's "claim your handle" step, but `profiles.handle` is
 * still required. "Casey Morgan" + "k3f9" → "casey_morgan_k3f9": the name
 * as lowercase words joined by underscores, capped so the suffix always
 * fits, with a short suffix the caller varies on a collision.
 */
export function handleFromName(name: string, suffix: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20)
    .replace(/_+$/, "");
  const tail = suffix.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "0";
  const handle = `${base || "member"}_${tail}`;
  return isValidHandle(handle) ? handle : `member_${tail}`;
}
