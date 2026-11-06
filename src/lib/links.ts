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
  const ig = socialHandle(profile.instagram, ["instagram.com"], INSTAGRAM);
  if (ig) links.push({ kind: "instagram", label: `Instagram @${ig}`, href: `https://www.instagram.com/${ig}/` });
  const x = socialHandle(profile.x_handle, ["x.com", "twitter.com"], X_HANDLE);
  if (x) links.push({ kind: "x", label: `X @${x}`, href: `https://x.com/${x}` });
  return links;
}
