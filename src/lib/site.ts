/**
 * The public origin, for every place the app prints or links its own
 * address: the handle prefix in the UI, verify links a coach receives,
 * robots and the sitemap.
 *
 * Isomorphic on purpose — Client Components (onboarding's handle prefix)
 * need it too — so it reads `process.env.NEXT_PUBLIC_SITE_URL` literally,
 * which the bundler inlines. `env.ts` validates the same variable on the
 * server; here a malformed value degrades to the default instead of
 * throwing in someone's browser.
 */

export const DEFAULT_SITE_URL = "https://roster.us";

/** The origin, no trailing slash: `https://roster.us`. */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return DEFAULT_SITE_URL;
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

/** The origin as people read it: `roster.us`, `localhost:3000`. */
export function siteHost(): string {
  return new URL(siteUrl()).host;
}

/** A path on this site as an absolute URL. */
export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** The link a coach opens to answer a verification request. */
export function verifyUrl(token: string): string {
  return absoluteUrl(`/verify/${token}`);
}
