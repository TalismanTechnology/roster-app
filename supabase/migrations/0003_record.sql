-- Roster · 0003 · The Living Record
--
-- This is the product. Everything else on Roster is commodity social software;
-- the record is the reason a recruiter opens the link.
--
-- Design note: one `achievements` table rather than a table per kind. A PR, an
-- award, and a commitment share ~90% of their columns (who, when, where, what
-- proof), and the differences are a handful of nullable fields. Splitting them
-- would force a five-way UNION on the single most-read query in the app —
-- rendering somebody's record in reverse-chronological order.

-- ---------------------------------------------------------------------------
-- achievements
-- ---------------------------------------------------------------------------

create table achievements (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  kind        achievement_kind not null,

  -- What it was
  title       text not null,
  detail      text,
  sport       text references sports(slug) on delete set null,
  event_id    uuid references sport_events(id) on delete set null,

  -- The measurement, when there is one. `value_numeric` is always stored in the
  -- event's canonical unit so records sort correctly; `value_display` preserves
  -- how the sport actually writes it ("4:03.21", "6-08.25") because converting
  -- back for display loses conventions that athletes care about.
  value_numeric numeric(12,4),
  value_display text,
  unit          text,

  -- Competitive context
  competition text,          -- "MHSAA D1 State Final"
  opponent    text,
  placement   smallint,      -- 1 = win / first
  field_size  smallint,      -- out of how many

  -- Where it happened
  org_id      uuid references organizations(id) on delete set null,
  location    text,

  -- When. Date, not timestamp: nobody records a PR to the second, and a plain
  -- date avoids timezone drift shifting a result across day boundaries.
  achieved_on date not null,

  -- Trust. Denormalized from `verifications` so the record renders in one query;
  -- kept honest by the trigger in 0006.
  verification      verification_state not null default 'unverified',
  verified_at       timestamptz,

  -- Athlete curation: the handful of entries pinned to the top of the record.
  is_pinned   boolean not null default false,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint placement_positive check (placement is null or placement > 0),
  constraint placement_within_field
    check (field_size is null or placement is null or placement <= field_size),
  constraint measured_has_unit
    check (value_numeric is null or unit is not null),
  constraint not_achieved_in_future check (achieved_on <= current_date)
);

-- The record page: one athlete, newest first. Every profile view hits this.
create index achievements_profile_date_idx
  on achievements (profile_id, achieved_on desc, created_at desc);

-- Pinned entries render above the timeline.
create index achievements_pinned_idx
  on achievements (profile_id) where is_pinned;

-- Recruiter search: "best verified 100m times, class of 2027".
create index achievements_event_value_idx
  on achievements (event_id, value_numeric)
  where verification = 'verified' and value_numeric is not null;

create index achievements_verification_queue_idx
  on achievements (created_at) where verification = 'submitted';

create trigger achievements_updated_at
  before update on achievements
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- achievement_evidence — the proof behind a claim
--
-- Kept separate from the achievement because one claim can carry several kinds
-- of proof (a results URL, a photo of the board, a coach's attestation) and
-- because evidence is visible to reviewers on claims the public cannot see.
-- ---------------------------------------------------------------------------

create table achievement_evidence (
  id             uuid primary key default gen_random_uuid(),
  achievement_id uuid not null references achievements(id) on delete cascade,
  kind           text not null,        -- 'results_url', 'image', 'video', 'document'
  url            text not null,
  storage_path   text,                 -- Supabase Storage object, when uploaded
  caption        text,
  submitted_by   uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index achievement_evidence_achievement_idx
  on achievement_evidence (achievement_id);

-- ---------------------------------------------------------------------------
-- verifications — the audit trail
--
-- Append-only by convention: a rejected claim that is later verified keeps both
-- rows. Roster's credibility depends on being able to answer "who vouched for
-- this, when, and on what basis" years after the fact.
-- ---------------------------------------------------------------------------

create table verifications (
  id             uuid primary key default gen_random_uuid(),
  achievement_id uuid not null references achievements(id) on delete cascade,
  verifier_id    uuid references profiles(id) on delete set null,
  verifier_kind  verifier_kind not null,
  outcome        verification_state not null,
  method         text,          -- 'results_lookup', 'coach_attestation', 'video_review'
  note           text,
  source_url     text,
  created_at     timestamptz not null default now(),

  constraint outcome_is_terminal
    check (outcome in ('verified', 'disputed', 'rejected'))
);

create index verifications_achievement_idx
  on verifications (achievement_id, created_at desc);
create index verifications_verifier_idx on verifications (verifier_id);

-- ---------------------------------------------------------------------------
-- coach_endorsements — the social proof layer above verification
--
-- Distinct from a verification: a coach saying "this athlete is the hardest
-- worker I have coached" is not a factual claim to be checked, but it is the
-- thing that actually moves a recruiter.
-- ---------------------------------------------------------------------------

create table coach_endorsements (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles(id) on delete cascade,
  endorser_id  uuid not null references profiles(id) on delete cascade,
  org_id       uuid references organizations(id) on delete set null,
  body         text not null,
  is_visible   boolean not null default true,
  created_at   timestamptz not null default now(),

  constraint no_self_endorsement check (profile_id <> endorser_id),
  unique (profile_id, endorser_id)
);

create index coach_endorsements_profile_idx
  on coach_endorsements (profile_id) where is_visible;
