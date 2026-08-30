-- Roster · 0005 · Recognition signals
--
-- The feedback loop that makes the record worth maintaining: who looked at it,
-- and who saved you. Without these, keeping a resume current is a chore with
-- no evidence it is working.
--
-- Brand-deal tables are deliberately absent. That surface needs real contract,
-- payment, and disclosure modelling, and building it speculatively now would
-- guess wrong. It lands once the recruiter side has actual usage to learn from.

-- ---------------------------------------------------------------------------
-- profile_views — "your resume was viewed 14 times this week"
--
-- One row per viewer per day rather than per pageview: daily grain keeps the
-- table from growing without bound while still supporting a weekly trend line.
--
-- `viewer_id` is null for the signed-out recruiter, who is the majority of the
-- audience for a resume. Those collapse into one row per day per profile via
-- the nil-UUID sentinel below, so the honest reading of this table is "views,
-- of which the identified ones have a viewer_id" — not "distinct people".
--
-- Cascade rather than `set null` on the viewer: were a deleted account's rows
-- to fall back to null they would collide with that day's anonymous row and
-- the delete would fail on a unique violation.
-- ---------------------------------------------------------------------------

create table profile_views (
  profile_id uuid not null references profiles(id) on delete cascade,
  viewer_id  uuid references profiles(id) on delete cascade,
  viewed_on  date not null default current_date,
  view_count integer not null default 1
);

-- A partial index cannot serve ON CONFLICT for both cases, and a primary key
-- cannot contain a nullable column, so the daily-uniqueness rule is an
-- expression index. `record_profile_view()` in 0006 spells this expression
-- exactly; changing one without the other silently breaks the upsert.
create unique index profile_views_daily_idx
  on profile_views (
    profile_id,
    coalesce(viewer_id, '00000000-0000-0000-0000-000000000000'::uuid),
    viewed_on
  );

create index profile_views_recent_idx
  on profile_views (profile_id, viewed_on desc);

-- ---------------------------------------------------------------------------
-- recruiter_lists — a coach's working board of athletes
-- ---------------------------------------------------------------------------

create table recruiter_lists (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references profiles(id) on delete cascade,
  name       text not null,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (owner_id, name)
);

create trigger recruiter_lists_updated_at
  before update on recruiter_lists
  for each row execute function set_updated_at();

create table recruiter_list_members (
  list_id    uuid not null references recruiter_lists(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  note       text,
  added_at   timestamptz not null default now(),

  primary key (list_id, profile_id)
);

create index recruiter_list_members_profile_idx
  on recruiter_list_members (profile_id);

-- A notifications table stood here. It went out with the feed: every event it
-- carried was a like, a comment, or a follow. The two things worth telling an
-- athlete now — someone viewed your resume, a coach verified an entry — are
-- both already queryable from the tables above, and an inbox with two senders
-- is a page nobody opens twice.

-- ---------------------------------------------------------------------------
-- record_view — the athlete's record, assembled for rendering
--
-- A view rather than a client-side join so the profile page is one round trip
-- and the shape stays stable as the underlying tables evolve. RLS on the base
-- tables still applies: views run with the querying user's permissions unless
-- explicitly made security definer, which this is not.
-- ---------------------------------------------------------------------------

create view record_entries
with (security_invoker = true)
as
select
  a.id,
  a.profile_id,
  a.kind,
  a.title,
  a.detail,
  a.sport,
  a.value_display,
  a.unit,
  a.competition,
  a.placement,
  a.field_size,
  a.location,
  a.achieved_on,
  a.verification,
  a.verified_at,
  a.is_pinned,
  o.name  as org_name,
  o.logo_url as org_logo_url,
  e.name  as event_name,
  (select count(*) from achievement_evidence ev where ev.achievement_id = a.id)
    as evidence_count
from achievements a
left join organizations o on o.id = a.org_id
left join sport_events  e on e.id = a.event_id;
