import type { Profile } from "@/lib/database.types";

/**
 * The outbound links on a resume, built from what the athlete typed.
 *
 * Every href is constructed or checked here — an athlete-entered string is
 * never an href as-is — so a `javascript:` URL or a typo'd domain cannot
 * reach the page. Pure; unit-tested.
 */

export type ProfileLink = { kind: "instagram" | "x" | "hudl" | "results"; label: string; href: string };

/** The value as an http(s) URL, or null. */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * A social handle from whatever was typed: `name`, `@name`, or a profile URL
 * on the expected site. Null when it doesn't look like a handle.
 */
export function socialHandle(raw: string | null | undefined, hosts: string[], pattern: RegExp): string | null {
  const value = raw?.trim();
  if (!value) return null;

  let candidate = value.replace(/^@/, "");
  if (/^https?:\/\//i.test(value)) {
    const url = safeHttpUrl(value);
    if (!url) return null;
    const { hostname, pathname } = new URL(url);
    if (!hosts.includes(hostname.replace(/^www\./, ""))) return null;
    candidate = pathname.split("/").filter(Boolean)[0] ?? "";
  }
  return pattern.test(candidate) ? candidate : null;
}

const INSTAGRAM = /^[A-Za-z0-9._]{1,30}$/;
const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;

export type SocialKind = "instagram" | "x";

/**
 * The social accounts a profile stores, with the sites a profile link may
 * come from and the first path segments that are site pages, not people
 * (`instagram.com/p/…` is a post; `x.com/home` is nobody).
 */
const SOCIALS: Record<SocialKind, { hosts: string[]; pattern: RegExp; notHandles: string[] }> = {
  instagram: { hosts: ["instagram.com"], pattern: INSTAGRAM, notHandles: ["p", "reel", "reels", "stories", "explore", "accounts"] },
  x: { hosts: ["x.com", "twitter.com"], pattern: X_HANDLE, notHandles: ["home", "i", "intent", "share", "search", "explore", "hashtag"] },
};

/**
 * What the profile stores for a social account: the bare handle, whatever
 * was typed — `ava`, `@ava`, `instagram.com/ava`, `https://www.x.com/ava?s=20`.
 * Null for an empty field and for anything that isn't a handle on that site,
 * which the action turns into a field error instead of saving junk. Pure;
 * unit-tested.
 */
export function normalizeSocialHandle(raw: string | null | undefined, kind: SocialKind): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const { hosts, pattern, notHandles } = SOCIALS[kind];

  let candidate = value.replace(/^@/, "");
  // A profile link pasted without its scheme is still a link.
  const bare = new RegExp(`^(?:(?:www|m|mobile)\\.)?(?:${hosts.map((h) => h.replace(/\./g, "\\.")).join("|")})(?:[/?#]|$)`, "i");
  const link = /^https?:\/\//i.test(value) ? value : bare.test(value) ? `https://${value}` : null;
  if (link) {
    const url = safeHttpUrl(link);
    if (!url) return null;
    const { hostname, pathname } = new URL(url);
    if (!hosts.includes(hostname.toLowerCase().replace(/^(?:www|m|mobile)\./, ""))) return null;
    candidate = (pathname.split("/").filter(Boolean)[0] ?? "").replace(/^@/, "");
    if (notHandles.includes(candidate.toLowerCase())) return null;
  }
  return pattern.test(candidate) ? candidate : null;
}

/** Hudl and results pages — performance records, shown like film. */
export function recordLinks(profile: Pick<Profile, "hudl_url" | "results_url">): ProfileLink[] {
  const links: ProfileLink[] = [];
  const hudl = safeHttpUrl(profile.hudl_url);
  if (hudl) links.push({ kind: "hudl", label: "Hudl", href: hudl });
  const results = safeHttpUrl(profile.results_url);
  if (results) links.push({ kind: "results", label: "Results", href: results });
  return links;
}

/** Instagram and X — personal accounts, so shown only alongside contact details. */
export function socialLinks(profile: Pick<Profile, "instagram" | "x_handle">): ProfileLink[] {
  const links: ProfileLink[] = [];
  const ig = normalizeSocialHandle(profile.instagram, "instagram");
  if (ig) links.push({ kind: "instagram", label: `Instagram @${ig}`, href: `https://www.instagram.com/${ig}/` });
  const x = normalizeSocialHandle(profile.x_handle, "x");
  if (x) links.push({ kind: "x", label: `X @${x}`, href: `https://x.com/${x}` });
  return links;
}
