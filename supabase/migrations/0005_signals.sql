-- Roster · 0005 · Recognition signals
--
-- The feedback loop that makes the record worth maintaining: who looked at it,
-- who saved you, and what you should know about.
--
-- Brand-deal tables are deliberately absent. That surface needs real contract,
-- payment, and disclosure modelling, and building it speculatively now would
-- guess wrong. It lands once the recruiter side has actual usage to learn from.

-- ---------------------------------------------------------------------------
-- profile_views — "your record was viewed 14 times this week"
--
-- One row per viewer per day rather than per pageview: the athlete-facing
-- number should mean "distinct people", and daily grain keeps the table from
-- growing without bound while still supporting a weekly trend line.
-- ---------------------------------------------------------------------------

create table profile_views (
  profile_id uuid not null references profiles(id) on delete cascade,
  viewer_id  uuid references profiles(id) on delete set null,
  viewed_on  date not null default current_date,
  view_count integer not null default 1,

  primary key (profile_id, viewer_id, viewed_on)
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

-- ---------------------------------------------------------------------------
-- notifications
--
-- `actor_id` is nullable so system notifications (a verification decision, an
-- access grant) use the same inbox as social ones.
-- ---------------------------------------------------------------------------

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  kind       text not null,   -- 'follow', 'like', 'comment', 'verified', 'endorsed', 'viewed'
  actor_id   uuid references profiles(id) on delete cascade,
  post_id    uuid references posts(id) on delete cascade,
  achievement_id uuid references achievements(id) on delete cascade,
  body       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

-- The unread badge, and the inbox itself.
create index notifications_unread_idx
  on notifications (profile_id, created_at desc) where read_at is null;
create index notifications_inbox_idx
  on notifications (profile_id, created_at desc);

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
