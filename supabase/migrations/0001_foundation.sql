-- Roster · 0001 · Foundation
-- Extensions, enums, and reference data shared by every later migration.
-- Contains no policies: all security lives in 0006_security.sql.

create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Where an athlete competes. Drives discovery filters and recruiter search.
create type athlete_level as enum (
  'high_school',
  'club',
  'juco',
  'ncaa_d3',
  'ncaa_d2',
  'ncaa_d1',
  'naia',
  'semi_pro',
  'professional',
  'national_team',
  'olympic'
);

-- The kinds of entries that make up the living record.
create type achievement_kind as enum (
  'personal_record',  -- a new PR / PB
  'result',           -- placement at a meet, match, or game
  'award',            -- POTY, all-conference, all-american
  'record',           -- school / conference / national record
  'captaincy',        -- named captain
  'commitment',       -- signed / committed to a program
  'selection',        -- national team, combine invite, showcase
  'milestone'         -- 1000th point, 100th win, etc.
);

-- How much trust an entry carries. The whole product rests on this ladder.
create type verification_state as enum (
  'unverified',   -- athlete-claimed, no evidence
  'submitted',    -- evidence attached, awaiting review
  'verified',     -- confirmed against evidence or a trusted source
  'disputed',     -- flagged, under review
  'rejected'      -- reviewed and not substantiated
);

-- Who did the verifying. Determines the badge shown on the record.
create type verifier_kind as enum (
  'roster_staff',   -- internal review
  'coach',          -- verified coach at the athlete's org
  'organization',   -- school / club / governing body account
  'integration'     -- automated import from a results provider
);

-- Visibility model for a resume. A recruiter is the audience, and recruiters
-- do not make accounts to read one, so the default is genuinely public.
--
-- `unlisted` is not a weaker `private`: it is "reachable by anyone holding the
-- link, absent from search and search engines". That distinction is enforced in
-- two different places — RLS lets an unlisted resume load, and the discovery
-- query filters to `public` — because they answer different questions.
create type profile_visibility as enum (
  'private',   -- only the athlete
  'unlisted',  -- anyone with the link; excluded from search and indexing
  'public'     -- listed, indexable, findable (default)
);

create type org_kind as enum ('school', 'club', 'team', 'league', 'governing_body');

create type membership_role as enum ('athlete', 'captain', 'coach', 'staff', 'admin');

create type account_kind as enum ('athlete', 'coach', 'recruiter', 'brand', 'staff');

-- How a measured result is expressed. A 10.42 sprint and a 315 lb squat are
-- both "personal records" but sort in opposite directions, so the unit needs
-- to carry that intent with it.
create type measure_direction as enum ('lower_is_better', 'higher_is_better');

-- ---------------------------------------------------------------------------
-- sports — reference data. Referenced by profiles, memberships, achievements.
-- ---------------------------------------------------------------------------

create table sports (
  slug       text primary key,
  name       text not null,
  category   text not null,           -- 'track_field', 'team_ball', 'combat', ...
  is_timed   boolean not null default false,
  created_at timestamptz not null default now()
);

-- Events within a sport (100m, shot put, 5k). Sports without discrete events
-- simply have none, and achievements reference the sport alone.
create table sport_events (
  id         uuid primary key default gen_random_uuid(),
  sport_slug text not null references sports(slug) on delete cascade,
  slug       text not null,
  name       text not null,
  unit       text not null,           -- 's', 'm', 'kg', 'pts', 'lbs'
  direction  measure_direction not null,

  unique (sport_slug, slug)
);

create index sport_events_sport_idx on sport_events (sport_slug);

-- ---------------------------------------------------------------------------
-- Utility: updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
