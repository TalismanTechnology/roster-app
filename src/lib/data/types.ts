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
 * tables — inputs, the verification request (a local-mode extension), the
 * list views, and the one error type actions map to copy.
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
 * A link the athlete sends a coach. Not a table in the Supabase schema —
 * there, verification authority comes from org memberships. The local
 * adapter models the by-link flow the product needs before orgs exist.
 */
export type VerificationRequest = {
  id: string;
  token: string;
  achievement_id: string;
  profile_id: string;
  coach_contact_id: string;
  status: VerificationRequestStatus;
  note: string | null;
  verifier_name: string | null;
  verifier_role: string | null;
  created_at: string;
  responded_at: string | null;
  expires_at: string;
};

export type VerificationRequestDetail = VerificationRequest & {
  entry: RecordEntry;
  athlete: Profile;
  coach: CoachContact;
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

export type DataErrorCode = "conflict" | "not_found" | "forbidden" | "invalid" | "unavailable";

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
