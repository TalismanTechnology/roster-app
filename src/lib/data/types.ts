import type {
  AccountKind,
  AchievementKind,
  AthleteLevel,
  CoachContact,
  Profile,
  ProfileVisibility,
  RecordEntry,
} from "@/lib/database.types";

/**
 * Domain types shared by every adapter. Table types come from
 * database.types.ts; these are the shapes the app talks in that are not
 * tables — inputs, the verification request views, the list views, and
 * the one error type actions map to copy.
 */

export type AuthUser = { id: string; email: string };

export type NewProfile = Pick<Profile, "id" | "handle" | "display_name" | "level"> &
  Partial<
    Pick<Profile, "primary_sport" | "grad_year" | "visibility" | "account_kind" | "title" | "school" | "age_consent" | "consent_at">
  >;

export type NewEntry = {
  kind: AchievementKind;
  title: string;
  detail: string | null;
  value_display: string | null;
  competition: string | null;
  location: string | null;
  placement: number | null;
  field_size: number | null;
  achieved_on: string;
  sport?: string | null;
  /** The mark in `unit`, for sorting and chips (#55). Null without a unit (`measured_has_unit`). */
  value_numeric?: number | null;
  unit?: string | null;
};

export type NewFilm = { title: string; url: string; season: string | null };

/** Which way a clip moves in the athlete's order. */
export type MoveDirection = "up" | "down";

export type NewCoach = {
  name: string;
  role: string | null;
  org_name: string | null;
  email: string | null;
  phone: string | null;
};

/** An edit to a reference: any of its details, and whether recruiters see it. */
export type CoachPatch = Partial<NewCoach> & { is_visible?: boolean };

export type VerificationRequestStatus = "pending" | "verified" | "disputed" | "expired";

/**
 * A link the athlete sends a coach — `verification_requests` (0017). The raw
 * token is not part of the row: both adapters keep only its sha256, so a
 * stored request can never be turned back into a working link. The token
 * exists once, on the `CreatedVerificationRequest` handed back at creation.
 */
export type VerificationRequest = {
  id: string;
  achievement_id: string;
  profile_id: string;
  coach_contact_id: string;
  status: VerificationRequestStatus;
  note: string | null;
  verifier_name: string | null;
  verifier_role: string | null;
  /** The coach answered "I don't coach or know this athlete" (always disputed). */
  flagged_unknown_athlete: boolean;
  created_at: string;
  responded_at: string | null;
  expires_at: string;
};

/** What `requestVerification` returns: the row plus the raw token, this once. */
export type CreatedVerificationRequest = VerificationRequest & { token: string };

/** The slice of the athlete a link holder is shown — no contact details. */
export type VerifyAthlete = Pick<Profile, "id" | "handle" | "display_name" | "primary_sport" | "school" | "grad_year">;

/** The slice of the coach contact a link holder is shown — no email or phone. */
export type VerifyCoach = Pick<CoachContact, "id" | "name" | "role" | "org_name">;

export type VerificationRequestDetail = VerificationRequest & {
  entry: RecordEntry;
  athlete: VerifyAthlete;
  coach: VerifyCoach;
};

/** Optional parts of a coach's answer. */
export type VerificationAnswerOptions = {
  /** "I don't coach or know this athlete": recorded as a flagged dispute. */
  flagUnknownAthlete?: boolean;
  /**
   * Answer a sibling request (see `getCoachBatchRequests`) with this link as
   * the authority. Omitted: the link's own request.
   */
  requestId?: string;
};

export type RecruiterList = {
  id: string;
  owner_id: string;
  name: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  member_count: number;
};

export type ListedAthlete = Profile & { list_note: string | null; added_at: string };

export type RecruiterListDetail = { list: RecruiterList; members: ListedAthlete[] };

/**
 * A recruiter's saved /search filters (0020). `query` is the canonical
 * query string (`filtersToQuery`), never a raw URL. `digest` opts the
 * search into the weekly new-matches email.
 */
export type SavedSearch = {
  id: string;
  owner_id: string;
  name: string;
  query: string;
  digest: boolean;
  created_at: string;
  updated_at: string;
};

/** Why someone reported a resume (#50). Mirrors the `profile_reports.reason` check (0021). */
export const REPORT_REASONS = ["impersonation", "false_record", "inappropriate", "minor_safety", "spam", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type ProfileReportStatus = "open" | "actioned" | "dismissed";

/** `profile_reports` (0021). Readable by staff only. */
export type ProfileReport = {
  id: string;
  profile_id: string;
  /** The signed-in reporter, or null for a signed-out visitor. */
  reporter_id: string | null;
  reason: ReportReason;
  detail: string | null;
  status: ProfileReportStatus;
  created_at: string;
  resolved_at: string | null;
};

export type NewProfileReport = { reason: ReportReason; detail: string | null };

/** The order search results come back in (#85). */
export type SearchSort = "verified_count" | "graduation_year" | "gpa" | "recent";

/** The best verified mark on a resume, for a search row (#91). */
export type TopMark = Pick<RecordEntry, "title" | "value_display" | "unit">;

/**
 * Who looked this week, as counts only (#90): distinct signed-in viewers
 * whose account is a recruiter or a coach. Never names — the athlete opted
 * into a number, not a guest book.
 */
export type ViewerSummary = { recruiters: number; coaches: number };

export type SearchParams = {
  q?: string | null;
  sport?: string | null;
  level?: AthleteLevel | null;
  gradYear?: number | null;
  region?: string | null;
  /** One position, matched case-insensitively against the athlete's list. */
  position?: string | null;
  verifiedOnly?: boolean;
  /** GPA floor, inclusive. Athletes with no GPA drop out when set. */
  minGpa?: number | null;
  sort?: SearchSort;
  page?: number;
  pageSize?: number;
};

/** A resume the sitemap lists: public, listed, and with something on it. */
export type IndexableProfile = Pick<Profile, "handle" | "updated_at">;

/** One slice of the sitemap and the size of the whole set. */
export type IndexablePage = { profiles: IndexableProfile[]; total: number };

/** One page of search results and the size of the whole match. `page` is
 *  the page actually served — out-of-range requests are clamped. */
export type SearchResult = {
  athletes: Profile[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * What a coach's answer changed. The handle lets the caller revalidate the
 * resume; the rest is what the "your coach answered" email needs.
 */
export type VerificationResponse = {
  requestId: string;
  handle: string;
  outcome: "verified" | "disputed";
  flaggedUnknownAthlete: boolean;
  athleteName: string;
  /** Where to tell the athlete, if anywhere. */
  athleteEmail: string | null;
  entryTitle: string;
};

/**
 * What changing the sign-in email did. `updated`: it is the new address now
 * (local mode). `pending`: Supabase sent a confirmation link to the new
 * address, and the old one stays in force until it is clicked.
 */
export type EmailChangeResult = "updated" | "pending";

/**
 * A password reset the app must deliver itself (local mode): the raw token,
 * this once — only its hash is stored — and where to send it. Supabase
 * delivers its own recovery mail, so its adapter hands back null.
 */
export type IssuedPasswordReset = { email: string; token: string; expiresAt: string };

export type DataErrorCode = "conflict" | "not_found" | "forbidden" | "invalid" | "rate_limited" | "unavailable";

/** The one error adapters throw. Actions map `code` to user copy. */
export class DataError extends Error {
  constructor(
    public readonly code: DataErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DataError";
  }
}

export type { AccountKind, ProfileVisibility };
