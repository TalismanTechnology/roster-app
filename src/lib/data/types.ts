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
  Partial<Pick<Profile, "primary_sport" | "grad_year" | "visibility" | "account_kind">>;

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
};

export type NewFilm = { title: string; url: string; season: string | null };

export type NewCoach = {
  name: string;
  role: string | null;
  org_name: string | null;
  email: string | null;
  phone: string | null;
};

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

export type SearchParams = {
  q?: string | null;
  sport?: string | null;
  level?: AthleteLevel | null;
  gradYear?: number | null;
  region?: string | null;
  verifiedOnly?: boolean;
  page?: number;
  pageSize?: number;
};

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
