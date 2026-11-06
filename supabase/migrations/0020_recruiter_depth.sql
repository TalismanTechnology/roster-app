-- Roster · 0020 · Recruiter depth: saved searches, search sort, viewer summary
--
-- Wave 8. Everything here is additive:
--
--   1. profiles.viewer_summary_opt_in — the athlete chooses to see "viewed by
--      N recruiters this week" (#90). Off by default.
--
--   2. record_entries gains value_numeric (appended, as `create or replace
--      view` requires) so the record can show measurable chips (#55). The
--      column itself has existed on achievements since 0003.
--
--   3. saved_searches — a recruiter's saved /search filters (#88), owner-only
--      under RLS. `query` is the app's canonical query string. `digest` opts
--      a search into the weekly new-matches email; until a sender exists the
--      flag is stored and honoured by nothing — see src/lib/email/digest.ts.
--
--   4. search_athletes(…, min_gpa, sort_by) — a GPA floor and an explicit
--      sort (#85). The signature changes, so the 0018 function is dropped
--      and recreated; an overload would make PostgREST's named-argument
--      resolution ambiguous. LIKE escaping (like_literal) is unchanged.
--
--   5. weekly_viewer_summary() — distinct recruiter and coach viewers of the
--      caller's own resume in the last seven days, as counts. Definer, because
--      a viewer's account_kind sits behind that viewer's own profile
--      visibility; it never returns ids or names.
--
-- Safe to re-run: `if not exists`, `create or replace`, and `drop … if exists`
-- before each recreate.

set client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- 1. profiles.viewer_summary_opt_in
-- ---------------------------------------------------------------------------

alter table profiles
  add column if not exists viewer_summary_opt_in boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. record_entries.value_numeric
--
-- 0016's definition, unchanged, plus the one column at the end.
-- ---------------------------------------------------------------------------

create or replace view record_entries
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
    as evidence_count,
  nullif(
    case
      when lv.verifier_name is not null then concat_ws(', ', lv.verifier_name, lv.verifier_role)
      else concat_ws(', ', lv.display_name, lv.title)
    end,
    ''
  ) as verified_by,
  a.value_numeric
from achievements a
left join organizations o on o.id = a.org_id
left join sport_events  e on e.id = a.event_id
left join lateral (
  select v.verifier_name, v.verifier_role, vp.display_name, vp.title
    from verifications v
    left join profiles vp on vp.id = v.verifier_id
   where v.achievement_id = a.id
     and v.outcome = 'verified'
   order by v.created_at desc
   limit 1
) lv on a.verification = 'verified';

-- ---------------------------------------------------------------------------
-- 3. saved_searches
-- ---------------------------------------------------------------------------

create table if not exists saved_searches (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references profiles(id) on delete cascade,
  name       text not null,
  -- The canonical /search query string ("sport=football&class=2027"), never
  -- a full URL. The app re-parses it on every read, so a hand-edited row can
  -- only ever produce a valid search.
  query      text not null default '',
  digest     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (owner_id, name),
  constraint saved_search_name_len check (char_length(name) between 2 and 60),
  constraint saved_search_query_len check (char_length(query) <= 500)
);

create index if not exists saved_searches_digest_idx
  on saved_searches (owner_id) where digest;

drop trigger if exists saved_searches_updated_at on saved_searches;
create trigger saved_searches_updated_at
  before update on saved_searches
  for each row execute function set_updated_at();

alter table saved_searches enable row level security;

drop policy if exists saved_searches_own on saved_searches;
create policy saved_searches_own on saved_searches
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Signed-in only; anon has no business here at all.
revoke all on saved_searches from anon;

-- ---------------------------------------------------------------------------
-- 4. search_athletes with min_gpa and sort_by
-- ---------------------------------------------------------------------------

drop function if exists search_athletes(text, text, athlete_level[], smallint[], char(2)[], text[], boolean, integer, integer);

create or replace function search_athletes(
  q             text default null,
  sport         text default null,
  levels        athlete_level[] default null,
  grad_years    smallint[] default null,
  regions       char(2)[] default null,
  athlete_positions text[] default null,
  verified_only boolean default false,
  page_size     integer default 24,
  page_offset   integer default 0,
  min_gpa       numeric default null,
  sort_by       text default 'verified_count'
)
returns setof profiles
language sql
stable
set search_path = public
as $$
  select p.*
    from profiles p
   where p.account_kind = 'athlete'
     and p.visibility = 'public'
     and p.suspended_at is null
     and (sport         is null or p.primary_sport = sport)
     and (levels        is null or p.level     = any(levels))
     and (grad_years    is null or p.grad_year = any(grad_years))
     and (regions       is null or p.region    = any(regions))
     and (athlete_positions is null
          or exists (select 1
                       from unnest(p.positions) as mine(pos)
                       join unnest(athlete_positions) as wanted(pos)
                         on lower(mine.pos) = lower(wanted.pos)))
     and (not verified_only or p.verified_count > 0)
     -- No GPA on file is not "above the floor".
     and (min_gpa is null or p.gpa >= min_gpa)
     and (
       q is null
       or btrim(q) = ''
       or p.display_name ilike '%' || like_literal(q) || '%' escape '\'
       or p.handle::text ilike '%' || like_literal(q) || '%' escape '\'
       or p.display_name % q
     )
   -- Mirrors searchProfiles()/sortKey() in src/lib/data/local/search.ts: an
   -- explicit sort leads, nulls last; then name relevance; then the
   -- verified-first ranking every sort ends on. An unknown sort_by reads as
   -- the default.
   order by
     case when sort_by = 'graduation_year' then p.grad_year end asc nulls last,
     case when sort_by = 'gpa'             then p.gpa       end desc nulls last,
     case when sort_by = 'recent'          then p.updated_at end desc nulls last,
     case when q is null or btrim(q) = '' then 0
          else similarity(p.display_name, q) end desc,
     p.verified_count desc,
     p.entry_count desc,
     p.display_name asc
   limit least(coalesce(page_size, 24), 100)
  offset greatest(coalesce(page_offset, 0), 0);
$$;

revoke all on function search_athletes(text, text, athlete_level[], smallint[], char(2)[], text[], boolean, integer, integer, numeric, text) from public;
grant execute on function search_athletes(text, text, athlete_level[], smallint[], char(2)[], text[], boolean, integer, integer, numeric, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. weekly_viewer_summary
-- ---------------------------------------------------------------------------

create or replace function weekly_viewer_summary()
returns json
language sql
stable
security definer
set search_path = public
as $$
  -- Only the caller's own resume, only signed-in viewers, distinct per
  -- viewer across the week (profile_views keeps one row per viewer per day).
  -- Mirrors summarizeViewers() in src/lib/data/rules.ts.
  select json_build_object(
    'recruiters', count(distinct v.viewer_id) filter (where vp.account_kind = 'recruiter'),
    'coaches',    count(distinct v.viewer_id) filter (where vp.account_kind = 'coach')
  )
    from profile_views v
    join profiles vp on vp.id = v.viewer_id
   where auth.uid() is not null
     and v.profile_id = auth.uid()
     and v.viewed_on >= current_date - 7;
$$;

revoke all on function weekly_viewer_summary() from public, anon;
grant execute on function weekly_viewer_summary() to authenticated;
