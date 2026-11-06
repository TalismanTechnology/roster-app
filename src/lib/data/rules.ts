import type { CoachContact, Profile, RecordEntry } from "@/lib/database.types";

import type { NewEntry, VerificationRequest } from "./types";

/**
 * The visibility model, in TypeScript.
 *
 * This is a line-for-line mirror of the policies in
 * supabase/migrations/0006_security.sql, and it must stay one: the local
 * adapter enforces these, the Supabase adapter inherits them from Postgres,
 * and the two must answer "who can see this" identically or the app behaves
 * differently in development than in production.
 *
 * Pure functions with no I/O, so pages (the verify screen) and both
 * adapters import the same copy.
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
  // Superseded by a newer link, or the entry was edited after sending:
  // the coach should hear "expired", not "already answered".
  if (request.status === "expired") return { ok: false, reason: "expired" };
  if (request.status !== "pending") return { ok: false, reason: "used" };
  if (new Date(request.expires_at) < now) return { ok: false, reason: "expired" };
  if (responderUserId !== null && responderUserId === request.profile_id) {
    return { ok: false, reason: "self" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/** How many entries may lead the resume. The editor copy says "the three". */
export const MAX_PINNED = 3;

/** Whether one more entry may be pinned, given the athlete's current record. */
export function canPinAnother(entries: Pick<RecordEntry, "is_pinned">[]): boolean {
  return entries.filter((e) => e.is_pinned).length < MAX_PINNED;
}

/**
 * The fields a coach vouched for. Changing any of them after verification
 * means the badge would sit on a claim nobody confirmed, so the entry drops
 * back to unverified. Everything an athlete can edit through `NewEntry` is
 * here — pinning goes through `setPinned` and never touches the badge.
 */
export const SUBSTANTIVE_ENTRY_FIELDS = [
  "kind",
  "title",
  "detail",
  "sport",
  "value_display",
  "competition",
  "location",
  "placement",
  "field_size",
  "achieved_on",
] as const satisfies readonly (keyof NewEntry)[];

/**
 * Whether applying `patch` changes what the entry claims. Fields the patch
 * omits are untouched; fields it repeats with the same value (a form saved
 * without edits) are not a change. `""` and `null` count as the same empty.
 */
export function isSubstantiveEntryChange(
  current: Partial<Record<(typeof SUBSTANTIVE_ENTRY_FIELDS)[number], unknown>>,
  patch: Partial<NewEntry>,
): boolean {
  const norm = (v: unknown) => (v === undefined || v === "" ? null : v);
  return SUBSTANTIVE_ENTRY_FIELDS.some(
    (field) => field in patch && patch[field] !== undefined && norm(patch[field]) !== norm(current[field]),
  );
}
