/**
 * Database types.
 *
 * Hand-authored to cover the schema through migration 0016. Once the Supabase
 * CLI is linked to the project, replace this file wholesale with:
 *
 *   npx supabase gen types typescript --linked > src/lib/database.types.ts
 *
 * Keeping it hand-written in the meantime is deliberate: an untyped client
 * would silently accept column names that do not exist, and those only fail at
 * runtime against production data.
 */

export type AthleteLevel =
  | "high_school"
  | "club"
  | "juco"
  | "ncaa_d3"
  | "ncaa_d2"
  | "ncaa_d1"
  | "naia"
  | "semi_pro"
  | "professional"
  | "national_team"
  | "olympic";

export type AchievementKind =
  | "personal_record"
  | "result"
  | "award"
  | "record"
  | "captaincy"
  | "commitment"
  | "selection"
  | "milestone";

export type VerificationState =
  | "unverified"
  | "submitted"
  | "verified"
  | "disputed"
  | "rejected";

export type VerifierKind = "roster_staff" | "coach" | "organization" | "integration";

export type ProfileVisibility = "private" | "unlisted" | "public";

export type AccountKind = "athlete" | "coach" | "recruiter" | "brand" | "staff";

export type MembershipRole = "athlete" | "captain" | "coach" | "staff" | "admin";

export type OrgKind = "school" | "club" | "team" | "league" | "governing_body";

export type MeasureDirection = "lower_is_better" | "higher_is_better";

export type FilmProvider = "youtube" | "vimeo" | "hudl";

/** Leftover from a reverted social PR (0010); client access revoked in 0015. */
export type PostAnchor = "achievement" | "film";

export type Sport = {
  slug: string;
  name: string;
  category: string;
  is_timed: boolean;
  created_at: string;
};

export type SportEvent = {
  id: string;
  sport_slug: string;
  slug: string;
  name: string;
  unit: string;
  direction: MeasureDirection;
};

export type Profile = {
  id: string;
  handle: string;
  account_kind: AccountKind;
  visibility: ProfileVisibility;
  display_name: string;
  /** "Head Coach", "Assistant Coach" — free text, not coach-only (0008). */
  title: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  location: string | null;
  hometown: string | null;
  level: AthleteLevel | null;
  primary_sport: string | null;
  grad_year: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  positions: string[];
  jersey: string | null;
  region: string | null;
  school: string | null;
  gpa: number | null;
  sat_score: number | null;
  act_score: number | null;
  ncaa_id: string | null;
  contact_email: string | null;
  phone: string | null;
  is_recruitable: boolean;
  instagram: string | null;
  x_handle: string | null;
  hudl_url: string | null;
  results_url: string | null;
  entry_count: number;
  verified_count: number;
  identity_verified_at: string | null;
  suspended_at: string | null;
  /** The athlete opted into "viewed by N recruiters this week" (0020). */
  viewer_summary_opt_in: boolean;
  created_at: string;
  updated_at: string;
};

export type Achievement = {
  id: string;
  profile_id: string;
  kind: AchievementKind;
  title: string;
  detail: string | null;
  sport: string | null;
  event_id: string | null;
  value_numeric: number | null;
  value_display: string | null;
  unit: string | null;
  competition: string | null;
  opponent: string | null;
  placement: number | null;
  field_size: number | null;
  org_id: string | null;
  location: string | null;
  achieved_on: string;
  verification: VerificationState;
  verified_at: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

/** A row of `record_entries` — an achievement joined to its org and event. */
export type RecordEntry = {
  id: string;
  profile_id: string;
  kind: AchievementKind;
  title: string;
  detail: string | null;
  sport: string | null;
  value_display: string | null;
  unit: string | null;
  competition: string | null;
  placement: number | null;
  field_size: number | null;
  location: string | null;
  achieved_on: string;
  verification: VerificationState;
  verified_at: string | null;
  is_pinned: boolean;
  org_name: string | null;
  org_logo_url: string | null;
  event_name: string | null;
  evidence_count: number;
  /** "Tom Bradley, Head Coach" — who stood behind a verified entry. Null
   *  unless the entry is currently verified (view column since 0016; the
   *  local adapter derives it the same way). */
  verified_by: string | null;
  /** The mark in `unit` (view column since 0020). */
  value_numeric: number | null;
};

export type AchievementEvidence = {
  id: string;
  achievement_id: string;
  kind: string;
  url: string;
  storage_path: string | null;
  caption: string | null;
  submitted_by: string | null;
  created_at: string;
};

/** The append-only audit trail behind `achievements.verification`. */
export type Verification = {
  id: string;
  achievement_id: string;
  verifier_id: string | null;
  verifier_kind: VerifierKind;
  outcome: "verified" | "disputed" | "rejected";
  method: string | null;
  note: string | null;
  source_url: string | null;
  /** Name and role as given at verification time (0016). */
  verifier_name: string | null;
  verifier_role: string | null;
  created_at: string;
};

export type CoachEndorsement = {
  id: string;
  profile_id: string;
  endorser_id: string;
  org_id: string | null;
  body: string;
  is_visible: boolean;
  created_at: string;
};

export type FilmClip = {
  id: string;
  profile_id: string;
  title: string;
  url: string;
  provider: FilmProvider | null;
  external_id: string | null;
  thumbnail_url: string | null;
  season: string | null;
  sport: string | null;
  duration_s: number | null;
  is_featured: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

export type CoachContact = {
  id: string;
  profile_id: string;
  name: string;
  role: string | null;
  org_id: string | null;
  org_name: string | null;
  email: string | null;
  phone: string | null;
  is_visible: boolean;
  position: number;
  created_at: string;
};

export type Organization = {
  id: string;
  slug: string;
  name: string;
  kind: OrgKind;
  level: AthleteLevel | null;
  logo_url: string | null;
  city: string | null;
  region: string | null;
  country: string;
  claimed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Membership = {
  id: string;
  profile_id: string;
  org_id: string;
  role: MembershipRole;
  sport: string | null;
  jersey: string | null;
  started_on: string;
  ended_on: string | null;
  is_current: boolean;
  /** Set by a verified coach at the same org, or staff (0008). */
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
};

export type ProfileView = {
  profile_id: string;
  viewer_id: string | null;
  viewed_on: string;
  view_count: number;
};

export type RecruiterList = {
  id: string;
  owner_id: string;
  name: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

/** 0020. A recruiter's saved /search filters, owner-only under RLS. */
export type SavedSearchRow = {
  id: string;
  owner_id: string;
  name: string;
  query: string;
  digest: boolean;
  created_at: string;
  updated_at: string;
};

export type RecruiterListMember = {
  list_id: string;
  profile_id: string;
  note: string | null;
  added_at: string;
};

export type AccessRequest = {
  id: string;
  full_name: string;
  email: string;
  level: AthleteLevel | null;
  sport: string | null;
  organization: string | null;
  instagram: string | null;
  results_url: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type ReservedHandle = { handle: string; reason: string };

export type Post = {
  id: string;
  author_id: string;
  anchor_kind: PostAnchor;
  achievement_id: string | null;
  film_id: string | null;
  caption: string | null;
  created_at: string;
};

export type PostReaction = {
  post_id: string;
  profile_id: string;
  created_at: string;
};

/**
 * `verification_requests` (0017) as the athlete may read it — every column
 * but `token_hash`, which API roles cannot select. Writes go through the
 * functions below; there are no client INSERT/UPDATE grants.
 */
export type VerificationRequestRecord = {
  id: string;
  achievement_id: string;
  profile_id: string;
  coach_contact_id: string;
  status: "pending" | "verified" | "disputed" | "expired";
  note: string | null;
  verifier_name: string | null;
  verifier_role: string | null;
  flagged_unknown_athlete: boolean;
  created_at: string;
  responded_at: string | null;
  expires_at: string;
};

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Row<T> = {
  Row: T;
  Insert: Partial<T>;
  Update: Partial<T>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      sports: Row<Sport>;
      sport_events: Row<SportEvent>;
      reserved_handles: Row<ReservedHandle>;
      profiles: Row<Profile>;
      organizations: Row<Organization>;
      memberships: Row<Membership>;
      access_requests: Row<AccessRequest>;
      achievements: Row<Achievement>;
      achievement_evidence: Row<AchievementEvidence>;
      verifications: Row<Verification>;
      coach_endorsements: Row<CoachEndorsement>;
      film_clips: Row<FilmClip>;
      coach_contacts: Row<CoachContact>;
      profile_views: Row<ProfileView>;
      recruiter_lists: Row<RecruiterList>;
      recruiter_list_members: Row<RecruiterListMember>;
      saved_searches: Row<SavedSearchRow>;
      verification_requests: Row<VerificationRequestRecord>;
      /** Not client-accessible since 0015; typed so service-role code can. */
      posts: Row<Post>;
      post_reactions: Row<PostReaction>;
    };
    Views: {
      record_entries: { Row: RecordEntry; Relationships: [] };
    };
    Functions: {
      record_profile_view: { Args: { target: string }; Returns: void };
      is_staff: { Args: Record<string, never>; Returns: boolean };
      can_view_profile: { Args: { target: string }; Returns: boolean };
      coaches_athlete: { Args: { target: string }; Returns: boolean };
      can_vouch_for_membership: { Args: { target_membership: string }; Returns: boolean };
      /** 0017. Returns the new row (no hash) as JSON. Authenticated only. */
      create_verification_request: {
        Args: { p_achievement: string; p_coach_contact: string; p_token_hash: string; p_expires_at?: string | null };
        Returns: Json;
      };
      /** 0017. Takes the RAW token. The detail payload, or null. Anon-callable. */
      get_verification_request: { Args: { p_token: string }; Returns: Json | null };
      /** 0017. Takes the RAW token. Detail payloads of live sibling requests. Anon-callable. */
      get_coach_batch_requests: { Args: { p_token: string }; Returns: Json[] };
      /** 0017. Takes the RAW token. Anon-callable; refuses the athlete's own session. */
      respond_verification: {
        Args: {
          p_token: string;
          p_outcome: string;
          p_note: string | null;
          p_verifier_name: string;
          p_verifier_role: string | null;
          p_flag_unknown?: boolean;
          p_request_id?: string | null;
        };
        Returns: Json;
      };
      /** 0017. Owner only; marks a pending request expired. */
      revoke_verification_request: { Args: { p_request_id: string }; Returns: Json };
      /** 0018. Owner only; unfeatures the athlete's other clips and features this one, atomically. */
      feature_film: { Args: { clip: string }; Returns: void };
      /** 0018. Escapes LIKE metacharacters (backslash, `%`, `_`) so a value matches literally. */
      like_literal: { Args: { value: string }; Returns: string };
      /** 0020. Owner only (auth.uid()); distinct recruiter/coach viewers in the last 7 days. Counts, never ids. */
      weekly_viewer_summary: { Args: Record<string, never>; Returns: Json };
      search_athletes: {
        Args: {
          q?: string | null;
          sport?: string | null;
          levels?: AthleteLevel[] | null;
          grad_years?: number[] | null;
          regions?: string[] | null;
          athlete_positions?: string[] | null;
          verified_only?: boolean;
          /** 0020. Inclusive GPA floor; null is no floor. */
          min_gpa?: number | null;
          /** 0020. verified_count (default) | graduation_year | gpa | recent. */
          sort_by?: string | null;
          page_size?: number;
          page_offset?: number;
        };
        Returns: Profile[];
      };
    };
    Enums: {
      athlete_level: AthleteLevel;
      achievement_kind: AchievementKind;
      verification_state: VerificationState;
      profile_visibility: ProfileVisibility;
      account_kind: AccountKind;
      membership_role: MembershipRole;
      verifier_kind: VerifierKind;
      org_kind: OrgKind;
      measure_direction: MeasureDirection;
      post_anchor: PostAnchor;
    };
    CompositeTypes: Record<string, never>;
  };
};
