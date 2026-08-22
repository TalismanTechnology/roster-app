import type { Membership, Organization, Profile, RecordEntry } from "@/lib/database.types";
import type { FeedPostData } from "@/components/feed/FeedPost";

/**
 * Fixture data for `/preview`.
 *
 * Exists so the interface can be designed and reviewed without a database
 * behind it. Kept realistic on purpose — placeholder text like "Lorem ipsum"
 * or "Athlete Name" hides exactly the problems worth catching: how a long
 * school name wraps, how a 4-character time sits next to a 7-character one,
 * what an unverified entry looks like beside a verified one.
 */

export const previewProfile: Profile = {
  id: "preview-athlete",
  handle: "avareyes",
  account_kind: "athlete",
  visibility: "public",
  display_name: "Ava Reyes",
  avatar_url: null,
  cover_url: null,
  bio: "400m / 4x400. Chasing 53 flat before outdoor states. Recruiting class of 2027 — open to conversations.",
  location: "Grand Rapids, MI",
  hometown: "Grand Rapids, MI",
  level: "high_school",
  primary_sport: "track & field",
  grad_year: 2027,
  height_cm: 170,
  weight_kg: 59,
  instagram: "avareyes.track",
  x_handle: null,
  hudl_url: "https://www.hudl.com/profile/example",
  results_url: "https://www.athletic.net/athlete/example",
  identity_verified_at: "2026-03-02T00:00:00Z",
  suspended_at: null,
  created_at: "2026-01-14T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

const eastKentwood: Organization = {
  id: "org-ek",
  slug: "east-kentwood",
  name: "East Kentwood High School",
  kind: "school",
  level: "high_school",
  logo_url: null,
  city: "Kentwood",
  region: "MI",
  country: "US",
  claimed_by: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

export const previewMemberships: (Membership & { organizations: Organization | null })[] = [
  {
    id: "m-1",
    profile_id: previewProfile.id,
    org_id: eastKentwood.id,
    role: "captain",
    sport: "track_field",
    jersey: null,
    started_on: "2024-08-15",
    ended_on: null,
    is_current: true,
    created_at: "2024-08-15T00:00:00Z",
    organizations: eastKentwood,
  },
];

function entry(partial: Partial<RecordEntry> & Pick<RecordEntry, "id" | "kind" | "title" | "achieved_on">): RecordEntry {
  return {
    profile_id: previewProfile.id,
    detail: null,
    sport: "track_field",
    value_display: null,
    unit: null,
    competition: null,
    placement: null,
    field_size: null,
    location: null,
    verification: "unverified",
    verified_at: null,
    is_pinned: false,
    org_name: null,
    org_logo_url: null,
    event_name: null,
    evidence_count: 0,
    ...partial,
  };
}

export const previewEntries: RecordEntry[] = [
  entry({
    id: "e-1",
    kind: "personal_record",
    title: "400m Personal Best",
    achieved_on: "2026-05-30",
    value_display: "53.94",
    unit: "s",
    competition: "MHSAA D1 State Final",
    location: "Rockford, MI",
    placement: 2,
    field_size: 9,
    verification: "verified",
    verified_at: "2026-06-01T00:00:00Z",
    event_name: "400 Meters",
    is_pinned: true,
    evidence_count: 2,
  }),
  entry({
    id: "e-2",
    kind: "award",
    title: "All-State, First Team",
    achieved_on: "2026-06-08",
    detail: "Selected by the Michigan Track Coaches Association following the D1 state final.",
    org_name: "MITCA",
    verification: "verified",
    verified_at: "2026-06-10T00:00:00Z",
    is_pinned: true,
  }),
  entry({
    id: "e-3",
    kind: "record",
    title: "School Record — 4x400 Relay",
    achieved_on: "2026-05-16",
    value_display: "3:52.11",
    unit: "",
    competition: "OK Red Conference Championship",
    org_name: "East Kentwood High School",
    verification: "verified",
    verified_at: "2026-05-18T00:00:00Z",
    is_pinned: true,
  }),
  entry({
    id: "e-4",
    kind: "captaincy",
    title: "Named Team Captain",
    achieved_on: "2026-03-04",
    org_name: "East Kentwood High School",
    verification: "verified",
    verified_at: "2026-03-06T00:00:00Z",
  }),
  entry({
    id: "e-5",
    kind: "result",
    title: "200m — Conference Championship",
    achieved_on: "2026-05-16",
    value_display: "25.31",
    unit: "s",
    competition: "OK Red Conference Championship",
    placement: 3,
    field_size: 24,
    verification: "verified",
    verified_at: "2026-05-18T00:00:00Z",
  }),
  entry({
    id: "e-6",
    kind: "selection",
    title: "Brooks PR Invitational — Invited",
    achieved_on: "2026-04-22",
    detail: "Invitation extended on the strength of the indoor 400m mark.",
    verification: "submitted",
    evidence_count: 1,
  }),
  entry({
    id: "e-7",
    kind: "personal_record",
    title: "Indoor 400m Personal Best",
    achieved_on: "2026-02-14",
    value_display: "55.20",
    unit: "s",
    competition: "MITS Championship",
    location: "Mount Pleasant, MI",
    verification: "verified",
    verified_at: "2026-02-16T00:00:00Z",
  }),
  entry({
    id: "e-8",
    kind: "milestone",
    title: "First sub-56 400m",
    achieved_on: "2025-05-02",
    value_display: "55.87",
    unit: "s",
    competition: "Grand Rapids City Championship",
  }),
];

export const previewPosts: FeedPostData[] = [
  {
    id: "p-1",
    body: "Two years chasing this one. Six tenths off the school record now.",
    created_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
    like_count: 47,
    comment_count: 6,
    profiles: {
      handle: "avareyes",
      display_name: "Ava Reyes",
      avatar_url: null,
    },
    achievements: {
      title: "400m Personal Best",
      value_display: "53.94",
      unit: "s",
      achieved_on: "2026-05-30",
      verification: "verified",
      kind: "personal_record",
    },
  },
  {
    id: "p-2",
    body: "Relay squad ran 3:52.11 last night. School record had stood since 2009.",
    created_at: new Date(Date.now() - 4 * 86_400_000).toISOString(),
    like_count: 112,
    comment_count: 19,
    profiles: {
      handle: "dmalone",
      display_name: "Devon Malone",
      avatar_url: null,
    },
    achievements: null,
  },
  {
    id: "p-3",
    body: null,
    created_at: new Date(Date.now() - 9 * 86_400_000).toISOString(),
    like_count: 28,
    comment_count: 3,
    profiles: {
      handle: "jhartley",
      display_name: "Jordan Hartley",
      avatar_url: null,
    },
    achievements: {
      title: "Committed — University of Michigan",
      value_display: null,
      unit: null,
      achieved_on: "2026-08-12",
      verification: "verified",
      kind: "commitment",
    },
  },
];
