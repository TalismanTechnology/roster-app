import type { AccountKind, CoachContact, Profile, ProfileView, RecordEntry } from "@/lib/database.types";

import { DataError, type MoveDirection, type NewEntry, type TopMark, type VerificationRequest, type ViewerSummary } from "./types";

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

/**
 * The position filter from `search_athletes` (0018): any of the athlete's
 * positions, case-insensitively — athletes type "WR", recruiters "wr".
 */
export function holdsPosition(positions: readonly string[], wanted: string | null | undefined): boolean {
  const w = wanted?.trim().toLowerCase();
  if (!w) return true;
  return positions.some((p) => p.trim().toLowerCase() === w);
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

/** How long a link works. The editor copy says "expires in 30 days". */
export const REQUEST_TTL_DAYS = 30;

/**
 * New requests one athlete may open per UTC day — `daily_cap` in
 * create_verification_request() (0017). Every request emails a coach, so
 * this is the ceiling on how much mail one account can make Roster send.
 */
export const DAILY_REQUEST_CAP = 10;

/** Start of the UTC day containing `now`, as an ISO string. */
export function utcDayStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/** Whether the athlete has used up today's requests. */
export function isOverDailyCap(
  requests: Pick<VerificationRequest, "profile_id" | "created_at">[],
  profileId: string,
  now = new Date(),
): boolean {
  const since = utcDayStart(now);
  return requests.filter((r) => r.profile_id === profileId && r.created_at >= since).length >= DAILY_REQUEST_CAP;
}

/** Still waiting on an answer and still answerable. */
export function isLiveRequest(request: Pick<VerificationRequest, "status" | "expires_at">, now = new Date()): boolean {
  return request.status === "pending" && new Date(request.expires_at) > now;
}

/**
 * Whether a link may be used to answer one of the athlete's OTHER requests
 * (the coach's batch, #81): the link must not be revoked, superseded, or past
 * its date — answering it already is fine — and the sibling must come from
 * the same athlete to the same coach. Matching across athletes by email is
 * deliberately not allowed: emails are typed by athletes and unverified, so
 * it would let anyone's link reach anyone's pending entries.
 */
export function canActForSibling(
  authority: Pick<VerificationRequest, "id" | "status" | "expires_at" | "profile_id" | "coach_contact_id">,
  sibling: Pick<VerificationRequest, "id" | "profile_id" | "coach_contact_id">,
  coachEmails: { authority: string | null; sibling: string | null },
  now = new Date(),
): boolean {
  if (authority.status === "expired" || new Date(authority.expires_at) <= now) return false;
  if (sibling.id === authority.id || sibling.profile_id !== authority.profile_id) return false;
  if (sibling.coach_contact_id === authority.coach_contact_id) return true;
  const a = coachEmails.authority?.trim().toLowerCase();
  return Boolean(a) && a === coachEmails.sibling?.trim().toLowerCase();
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
  "unit",
] as const satisfies readonly (keyof NewEntry)[];

/**
 * What an entry edit may write: the claim, plus `value_numeric`, which is
 * derived from the mark and unit (`parseMark`) and so never decides on its
 * own whether the badge goes — an entry saved before 0020 gaining its number
 * is not a new claim.
 */
export const ENTRY_WRITE_FIELDS = [...SUBSTANTIVE_ENTRY_FIELDS, "value_numeric"] as const satisfies readonly (keyof NewEntry)[];

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

/** Film order (#56): `ids` with `id` swapped one place toward the front ("up") or back; unchanged at an end. */
export function swapNeighbour(ids: readonly string[], id: string, direction: MoveDirection): string[] {
  const out = [...ids];
  const i = out.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i === -1 || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/** How long a password reset link works. The email copy says "within an hour". */
export const PASSWORD_RESET_TTL_MINUTES = 60;

/**
 * Whether the session came from a password-recovery link, recently. The
 * `amr` claim records how the session was established and survives token
 * refreshes, so the timestamp bounds how long "I clicked the reset link"
 * stands in for the old password — the same hour a local reset link lives.
 */
export function isRecentRecovery(amr: unknown, nowS = Date.now() / 1000): boolean {
  if (!Array.isArray(amr)) return false;
  return amr.some(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      (entry as { method?: unknown }).method === "recovery" &&
      typeof (entry as { timestamp?: unknown }).timestamp === "number" &&
      nowS - (entry as { timestamp: number }).timestamp <= PASSWORD_RESET_TTL_MINUTES * 60,
  );
}

/** What a duplicate sign-up hears, in both modes — never "already registered". */
export const SIGN_UP_CONFLICT_COPY =
  "We couldn't create an account with that email. If it's yours, sign in or reset your password.";

/** Wrong current password on a change, in both modes. The e2e run asserts "did not match". */
export const CURRENT_PASSWORD_MISMATCH = "Your current password did not match.";

/** The shape of a Supabase AuthError that matters here; nothing else is read. */
export type AuthErrorLike = { code?: string | null; status?: number | null; message?: string | null };

function isRateLimit(error: AuthErrorLike): boolean {
  return error.status === 429 || /^over_.*_limit$/.test(error.code ?? "") || /rate limit/i.test(error.message ?? "");
}

/**
 * A Supabase sign-up refusal as copy safe to show a stranger (#33). The raw
 * message ("User already registered") is never passed through: it confirms
 * which emails have accounts.
 */
export function signUpError(error: AuthErrorLike): DataError {
  if (isRateLimit(error)) {
    return new DataError("rate_limited", "Too many attempts. Wait a minute and try again.");
  }
  if (
    error.code === "user_already_exists" ||
    error.code === "email_exists" ||
    error.status === 409 ||
    /already (been )?registered|already exists/i.test(error.message ?? "")
  ) {
    return new DataError("conflict", SIGN_UP_CONFLICT_COPY);
  }
  if (
    error.code === "weak_password" ||
    error.code === "validation_failed" ||
    error.code === "email_address_invalid" ||
    error.status === 400 ||
    error.status === 422
  ) {
    return new DataError("invalid", "Check the email address, and use a password of at least 8 characters that is hard to guess.");
  }
  return new DataError("unavailable", "Could not create your account. Try again.");
}

/** The same mapping for a change of sign-in email: an address in use is not confirmed either. */
export function emailChangeError(error: AuthErrorLike): DataError {
  if (isRateLimit(error)) return new DataError("rate_limited", "Too many attempts. Wait a minute and try again.");
  if (error.code === "email_exists" || error.code === "user_already_exists" || error.status === 409 || /already/i.test(error.message ?? "")) {
    return new DataError("conflict", "That email can't be used. Try another.");
  }
  if (error.code === "same_email") return new DataError("invalid", "That's already your sign-in email.");
  return new DataError("invalid", "Check the email address and try again.");
}

/** The same for a new password Supabase refuses (too weak, reused). */
export function newPasswordError(error: AuthErrorLike): DataError {
  if (isRateLimit(error)) return new DataError("rate_limited", "Too many attempts. Wait a minute and try again.");
  if (error.code === "same_password") return new DataError("invalid", "Choose a password you haven't used here before.");
  if (error.code === "weak_password" || error.status === 422) {
    return new DataError("invalid", "Choose a stronger password — at least 8 characters, hard to guess.");
  }
  return new DataError("unavailable", "Could not update your password. Try again.");
}

// ---------------------------------------------------------------------------
// Recruiter signals (0020)
// ---------------------------------------------------------------------------

/** The account kinds that use lists and saved searches: everyone but athletes. */
export function isRecruiterKind(kind: AccountKind | null | undefined): boolean {
  return Boolean(kind) && kind !== "athlete";
}

/**
 * `weekly_viewer_summary()`: distinct signed-in viewers of `profileId` on or
 * after `since` (a YYYY-MM-DD day), split by account kind. Anonymous views
 * (null viewer) and every other kind are left out; a viewer seen on three
 * days counts once.
 */
export function summarizeViewers(
  views: readonly ProfileView[],
  kindOf: (viewerId: string) => AccountKind | undefined,
  profileId: string,
  since: string,
): ViewerSummary {
  const recruiters = new Set<string>();
  const coaches = new Set<string>();
  for (const v of views) {
    if (v.profile_id !== profileId || v.viewer_id === null || v.viewed_on < since) continue;
    const kind = kindOf(v.viewer_id);
    if (kind === "recruiter") recruiters.add(v.viewer_id);
    else if (kind === "coach") coaches.add(v.viewer_id);
  }
  return { recruiters: recruiters.size, coaches: coaches.size };
}

/** The first day of the seven-day window, as `viewed_on` stores it. */
export function weekStart(now = Date.now()): string {
  return new Date(now - 7 * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The entry a search row leads with: verified only, pinned first, then the
 * most recently verified. Null when nothing on the record is verified.
 */
export function pickTopMark(
  entries: readonly Pick<RecordEntry, "title" | "value_display" | "unit" | "verification" | "is_pinned" | "verified_at">[],
): TopMark | null {
  const best = entries
    .filter((e) => e.verification === "verified")
    .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || (b.verified_at ?? "").localeCompare(a.verified_at ?? ""))[0];
  return best ? { title: best.title, value_display: best.value_display, unit: best.unit } : null;
}
