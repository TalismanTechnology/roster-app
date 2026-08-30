/**
 * The handle namespace.
 *
 * A resume lives at roster.us/<handle>, so handles and top-level routes share
 * one namespace. This file is the app-side mirror of `reserved_handles` in
 * migration 0002; the database trigger is the enforcement point, so drift here
 * costs a worse error message, not a broken route.
 *
 * Two callers: `src/proxy.ts` uses it to route single-segment paths, and the
 * onboarding form uses it to refuse a reserved handle before submit.
 */

export const RESERVED_HANDLES = new Set([
  "about",
  "account",
  "admin",
  "api",
  "auth",
  "edit",
  "explore",
  "help",
  "join",
  "legal",
  "login",
  "logout",
  "onboarding",
  "preview",
  "privacy",
  "recruit",
  "resume",
  "roster",
  "search",
  "settings",
  "sign-in",
  "sign-out",
  "sign-up",
  "signin",
  "signup",
  "static",
  "support",
  "terms",
  "verify",
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
