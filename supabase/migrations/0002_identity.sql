-- Roster · 0002 · Identity
-- Profiles, organizations, memberships, and the invite gate.
-- Tables only: policies live in 0006_security.sql.

-- ---------------------------------------------------------------------------
-- profiles — one row per authenticated user, keyed to auth.users
-- ---------------------------------------------------------------------------

create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  handle        citext not null unique,
  account_kind  account_kind not null default 'athlete',
  visibility    profile_visibility not null default 'members',

  display_name  text not null,
  avatar_url    text,
  cover_url     text,
  bio           text,
  location      text,
  hometown      text,

  -- Athletic identity. Null for recruiter/brand/staff accounts.
  level         athlete_level,
  primary_sport text references sports(slug) on delete set null,
  grad_year     smallint,
  height_cm     smallint,
  weight_kg     numeric(5,2),

  -- Off-platform proof surface. Recruiters check these constantly.
  instagram     text,
  x_handle      text,
  hudl_url      text,
  results_url   text,

  -- Trust + moderation
  identity_verified_at timestamptz,
  suspended_at         timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint handle_format check (handle ~ '^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$'),
  constraint grad_year_sane check (grad_year is null or grad_year between 1950 and 2100),
  constraint athletes_have_level check (account_kind <> 'athlete' or level is not null)
);

create index profiles_level_sport_idx on profiles (level, primary_sport)
  where account_kind = 'athlete' and suspended_at is null;
create index profiles_grad_year_idx on profiles (grad_year)
  where account_kind = 'athlete';
create index profiles_display_name_trgm on profiles using gin (display_name gin_trgm_ops);

create trigger profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- organizations — schools, clubs, teams. Athletes attach their record to these.
-- ---------------------------------------------------------------------------

create table organizations (
  id         uuid primary key default gen_random_uuid(),
  slug       citext not null unique,
  name       text not null,
  kind       org_kind not null,
  level      athlete_level,
  logo_url   text,
  city       text,
  region     text,          -- state / province
  country    char(2) not null default 'US',
  claimed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organizations_name_trgm on organizations using gin (name gin_trgm_ops);

create trigger organizations_updated_at
  before update on organizations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- memberships — an athlete's tenure at an org. The resume's spine.
-- ---------------------------------------------------------------------------

create table memberships (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  org_id     uuid not null references organizations(id) on delete cascade,
  role       membership_role not null default 'athlete',
  sport      text references sports(slug) on delete set null,
  jersey     text,
  started_on date not null,
  ended_on   date,
  is_current boolean generated always as (ended_on is null) stored,
  created_at timestamptz not null default now(),

  constraint tenure_ordered check (ended_on is null or ended_on >= started_on),
  unique (profile_id, org_id, sport, started_on)
);

create index memberships_profile_idx on memberships (profile_id, started_on desc);
create index memberships_org_current_idx on memberships (org_id) where ended_on is null;

-- ---------------------------------------------------------------------------
-- invites — the network is invite-only. Every member arrives through a code.
-- ---------------------------------------------------------------------------

create table invites (
  code        text primary key default encode(gen_random_bytes(6), 'hex'),
  issued_by   uuid references profiles(id) on delete set null,
  email       citext,
  note        text,
  max_uses    smallint not null default 1,
  used_count  smallint not null default 0,
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),

  constraint uses_within_limit check (used_count <= max_uses)
);

create index invites_issued_by_idx on invites (issued_by);

-- ---------------------------------------------------------------------------
-- access_requests — the waitlist behind "Request early access" on myroster.us
-- ---------------------------------------------------------------------------

create table access_requests (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  email         citext not null unique,
  level         athlete_level,
  sport         text,
  organization  text,
  instagram     text,
  results_url   text,
  reviewed_at   timestamptz,
  invited_code  text references invites(code) on delete set null,
  created_at    timestamptz not null default now()
);
