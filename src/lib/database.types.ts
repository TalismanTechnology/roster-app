/**
 * Database types.
 *
 * Hand-authored to cover the tables the app currently reads. Once the Supabase
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

export type ProfileVisibility = "private" | "unlisted" | "public";

export type AccountKind = "athlete" | "coach" | "recruiter" | "brand" | "staff";

export type MembershipRole = "athlete" | "captain" | "coach" | "staff" | "admin";

export type FilmProvider = "youtube" | "vimeo" | "hudl";

export type Profile = {
  id: string;
  handle: string;
  account_kind: AccountKind;
  visibility: ProfileVisibility;
  display_name: string;
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
  kind: "school" | "club" | "team" | "league" | "governing_body";
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
  created_at: string;
};

export type ProfileView = {
  profile_id: string;
  viewer_id: string | null;
  viewed_on: string;
  view_count: number;
};

type Row<T> = {
  Row: T;
  Insert: Partial<T>;
  Update: Partial<T>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Row<Profile>;
      achievements: Row<Achievement>;
      organizations: Row<Organization>;
      memberships: Row<Membership>;
      film_clips: Row<FilmClip>;
      coach_contacts: Row<CoachContact>;
      profile_views: Row<ProfileView>;
      reserved_handles: Row<{ handle: string; reason: string }>;
    };
    Views: {
      record_entries: { Row: RecordEntry; Relationships: [] };
    };
    Functions: {
      record_profile_view: { Args: { target: string }; Returns: void };
      search_athletes: {
        Args: {
          q?: string | null;
          sport?: string | null;
          levels?: AthleteLevel[] | null;
          grad_years?: number[] | null;
          regions?: string[] | null;
          athlete_positions?: string[] | null;
          verified_only?: boolean;
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
    };
    CompositeTypes: Record<string, never>;
  };
};
