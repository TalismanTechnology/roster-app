import type { CoachContact, Profile } from "@/lib/database.types";

import type { VerificationRequest } from "../types";

/**
 * The visibility model, in TypeScript.
 *
 * This is a line-for-line mirror of the policies in
 * supabase/migrations/0006_security.sql, and it must stay one: the local
 * adapter enforces these, the Supabase adapter inherits them from Postgres,
 * and the two must answer "who can see this" identically or the app behaves
 * differently in development than in production.
 */

export function isStaff(profile: Profile | undefined | null): boolean {
  return profile?.account_kind === "staff";
}

/**
 * `can_view_profile`. Unlisted is visible on purpose: it means "not listed",
 * and the listing rule is `isListed` below.
 */
export function canViewProfile(
  target: Profile | undefined | null,
  viewerId: string | null,
  viewer?: Profile | null,
): boolean {
  if (!target) return false;
  if (viewerId !== null && target.id === viewerId) return true;
  if (isStaff(viewer)) return true;
  if (target.suspended_at !== null) return false;
  return target.visibility === "public" || target.visibility === "unlisted";
}

/** The discovery rule from `search_athletes`: public athletes only. */
export function isListed(profile: Profile): boolean {
  return (
    profile.account_kind === "athlete" &&
    profile.visibility === "public" &&
    profile.suspended_at === null
  );
}

/**
 * `coach_contacts_select`. Three conditions, all required: the contact is
 * marked visible, the athlete is open to recruiting, and the resume is
 * public rather than merely unlisted. When it fails the row does not exist
 * for the viewer — not even the coach's name. Postgres returns zero rows,
 * and so must this.
 */
export function canSeeCoachContact(
  contact: CoachContact,
  athlete: Profile,
  viewerId: string | null,
  viewer?: Profile | null,
): boolean {
  if (viewerId !== null && athlete.id === viewerId) return true;
  if (isStaff(viewer)) return true;
  return (
    contact.is_visible &&
    athlete.visibility === "public" &&
    athlete.is_recruitable &&
    athlete.suspended_at === null
  );
}

/**
 * `verifications_insert`, adapted to the by-link flow: whoever holds a live
 * token may decide — except the athlete, who can never verify their own
 * record no matter how they got the link.
 */
export function canRespondToRequest(
  request: VerificationRequest,
  responderUserId: string | null,
  now = new Date(),
): { ok: true } | { ok: false; reason: "used" | "expired" | "self" } {
  if (request.status !== "pending") return { ok: false, reason: "used" };
  if (new Date(request.expires_at) < now) return { ok: false, reason: "expired" };
  if (responderUserId !== null && responderUserId === request.profile_id) {
    return { ok: false, reason: "self" };
  }
  return { ok: true };
}
