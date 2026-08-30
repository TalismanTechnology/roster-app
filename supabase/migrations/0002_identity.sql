-- Roster · 0002 · Identity
-- Profiles, organizations, memberships, and the reserved-handle guard.
-- Tables only: policies live in 0006_security.sql.

-- ---------------------------------------------------------------------------
-- profiles — one row per authenticated user, keyed to auth.users
-- ---------------------------------------------------------------------------

create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  handle        citext not null unique,
  account_kind  account_kind not null default 'athlete',
  visibility    profile_visibility not null default 'public',

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

  -- Where an athlete lines up. An array because two-way and multi-position
  -- athletes are the norm in high school, and text rather than an enum because
  -- positions are endlessly sport-local ("slot", "libero", "utility") and an
  -- enum would need a migration every time a sport is added.
  positions     text[] not null default '{}',
  jersey        text,

  -- State/province, stored separately from the free-text `location` because
  -- recruiting is organised by state and a filter cannot parse "Ann Arbor, MI".
  region        char(2),

  -- Free text, not a foreign key. `organizations` still exists for claimed,
  -- verified programs, but creating one is staff-gated — and an athlete
  -- setting up their resume on day one cannot wait on that. Text now, linked
  -- org later, is the same path every jobs site took with employer names.
  school        text,

  -- Academics. Half of a recruiting decision, and the half Hudl leaves out —
  -- a coach who cannot qualify an athlete academically stops reading.
  gpa           numeric(3,2),
  sat_score     smallint,
  act_score     smallint,
  ncaa_id       text,

  -- Recruiter contact. Separate from the auth email, which is a login and not
  -- something an athlete should have to expose to be reachable.
  contact_email citext,
  phone         text,
  is_recruitable boolean not null default true,

  -- Off-platform proof surface. Recruiters check these constantly.
  instagram     text,
  x_handle      text,
  hudl_url      text,
  results_url   text,

  -- Denormalized record size, maintained by trigger in 0007. Search results
  -- rank on these, and a subquery per row would make the results page quadratic.
  entry_count    integer not null default 0,
  verified_count integer not null default 0,

  -- Trust + moderation
  identity_verified_at timestamptz,
  suspended_at         timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint handle_format check (handle ~ '^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$'),
  constraint grad_year_sane check (grad_year is null or grad_year between 1950 and 2100),
  constraint athletes_have_level check (account_kind <> 'athlete' or level is not null),
  constraint gpa_sane check (gpa is null or gpa between 0 and 5.0),
  constraint sat_sane check (sat_score is null or sat_score between 400 and 1600),
  constraint act_sane check (act_score is null or act_score between 1 and 36),
  constraint positions_bounded check (cardinality(positions) <= 6)
);

-- The discovery query: level + sport + class year, narrowed to listed athletes.
-- Partial on `visibility = 'public'` because search never reads anything else,
-- which keeps the index to the rows it actually serves.
create index profiles_discovery_idx
  on profiles (primary_sport, level, grad_year)
  where account_kind = 'athlete' and visibility = 'public' and suspended_at is null;

create index profiles_region_idx on profiles (region)
  where account_kind = 'athlete' and visibility = 'public';

-- Ranking within a filtered set: most-verified first.
create index profiles_verified_count_idx on profiles (verified_count desc)
  where account_kind = 'athlete' and visibility = 'public';

create index profiles_positions_idx on profiles using gin (positions);
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
-- reserved_handles
--
-- A resume lives at roster.us/<handle>, so the handle namespace and the app's
-- top-level route namespace are the same namespace. An athlete who claimed
-- `search` would shadow the search page — or, worse, be shadowed by it and
-- become unreachable.
--
-- A table rather than a CHECK constraint with a baked-in list: adding a route
-- is a weekly event and altering a constraint to ship one is friction that
-- invites the check being skipped.
--
-- `src/lib/handles.ts` mirrors this list for the routing guard and the
-- sign-up form. The database is the enforcement point — the trigger in 0007
-- refuses a reserved handle whatever the client believes — so the mirror
-- drifting costs a worse error message, not a broken route.
-- ---------------------------------------------------------------------------

create table reserved_handles (
  handle text primary key,
  reason text not null default 'route'
);

insert into reserved_handles (handle) values
  ('about'), ('account'), ('admin'), ('api'), ('auth'), ('edit'), ('explore'),
  ('help'), ('join'), ('legal'), ('login'), ('logout'), ('onboarding'),
  ('preview'), ('privacy'), ('recruit'), ('resume'), ('roster'), ('search'),
  ('settings'), ('sign-in'), ('sign-out'), ('sign-up'), ('signin'), ('signup'),
  ('static'), ('support'), ('terms'), ('verify'), ('www');

-- ---------------------------------------------------------------------------
-- access_requests — the "Request early access" form on myroster.us
--
-- Sign-up is open, so this is no longer a gate. It stays because the marketing
-- site still posts to it and because a coach or recruiter asking to be
-- contacted is worth capturing.
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
  created_at    timestamptz not null default now()
);
