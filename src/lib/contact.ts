import type { AccountKind, CoachContact, Profile } from "@/lib/database.types";

/**
 * Who may read an athlete's contact details on the public resume (#44).
 *
 * Many athletes are minors, and a resume page is crawlable: a raw `mailto:`
 * in the HTML is a harvestable address. So the address and phone are only
 * rendered for a signed-in recruiter or coach (any non-athlete account),
 * staff, or the athlete themselves. Everyone else sees a masked hint and a
 * way to become someone who may ask. The same gate covers the references'
 * email and phone, which are adults' details but just as scrapable.
 *
 * This sits on top of the existing rules, never instead of them: contact is
 * only offered at all when the athlete is open to recruiting on a public
 * resume (IdentityBand), and references only arrive when
 * `canSeeCoachContact` allows (rules.ts / RLS).
 *
 * Pure: the page decides, the components render what they are handed, and
 * the unit tests pin the masking.
 */

export type ContactViewer = { id: string; account_kind: AccountKind } | null;

/** What the identity band shows for "Contact". */
export type ContactGate =
  | { state: "revealed"; email: string | null; phone: string | null }
  | { state: "gated"; maskedEmail: string | null; maskedPhone: string | null }
  | { state: "none" };

/** The athlete, staff, and any recruiter / coach / brand account may read contact details. */
export function canRevealContact(profile: Pick<Profile, "id">, viewer: ContactViewer): boolean {
  if (!viewer) return false;
  if (viewer.id === profile.id) return true;
  return viewer.account_kind !== "athlete";
}

/** `jordanreyes@example.com` → `j•••••••••@example.com`; the domain stays (it says "school" or "gmail"). */
export function maskEmail(email: string | null | undefined): string | null {
  const value = email?.trim();
  if (!value) return null;
  const at = value.lastIndexOf("@");
  if (at < 1) return "•••";
  const local = value.slice(0, at);
  return `${local[0]}${"•".repeat(Math.min(Math.max(local.length - 1, 3), 10))}${value.slice(at)}`;
}

/** `(616) 555-0142` → `•••-•••-0142`: the last four only. */
export function maskPhone(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (digits.length < 4) return digits ? "•••" : null;
  return `•••-•••-${digits.slice(-4)}`;
}

/** Whether the resume offers contact at all: open to recruiting, public, and something to contact. */
export function offersContact(profile: Pick<Profile, "is_recruitable" | "visibility" | "contact_email" | "phone">): boolean {
  return profile.is_recruitable && profile.visibility === "public" && Boolean(profile.contact_email || profile.phone);
}

export function contactGate(
  profile: Pick<Profile, "id" | "is_recruitable" | "visibility" | "contact_email" | "phone">,
  viewer: ContactViewer,
): ContactGate {
  if (!offersContact(profile)) return { state: "none" };
  if (canRevealContact(profile, viewer)) return { state: "revealed", email: profile.contact_email, phone: profile.phone };
  return { state: "gated", maskedEmail: maskEmail(profile.contact_email), maskedPhone: maskPhone(profile.phone) };
}

/**
 * The profile and references as this viewer may receive them: contact
 * fields nulled unless they may be revealed. Applied in the page before any
 * component renders, so nothing downstream — HTML, RSC payload, print view —
 * can leak what it was never given.
 */
export function redactForViewer<P extends Pick<Profile, "id" | "contact_email" | "phone">>(
  profile: P,
  coaches: CoachContact[],
  viewer: ContactViewer,
): { profile: P; coaches: CoachContact[]; coachContactHidden: boolean } {
  if (canRevealContact(profile, viewer)) return { profile, coaches, coachContactHidden: false };
  return {
    profile: { ...profile, contact_email: null, phone: null },
    coaches: coaches.map((c) => ({ ...c, email: null, phone: null })),
    coachContactHidden: coaches.some((c) => c.email || c.phone),
  };
}
