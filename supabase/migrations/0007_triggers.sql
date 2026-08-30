-- Roster · 0007 · Triggers and callable queries
--
-- Invariants that must hold no matter which client wrote the row, plus the one
-- query the product cannot express as a plain PostgREST filter. Enforcing
-- these in the database rather than the app means a mobile client added later
-- cannot drift from the web one.

-- ---------------------------------------------------------------------------
-- Reserved handles
--
-- `/<handle>` shares a namespace with the app's own routes, so a handle that
-- collides with one is refused at write time. A trigger rather than a CHECK
-- because the list lives in a table (see 0002) and a CHECK cannot read one.
-- ---------------------------------------------------------------------------

create or replace function enforce_handle_available()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from reserved_handles r where r.handle = lower(new.handle)) then
    raise exception 'handle % is reserved', new.handle
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger profiles_handle_available
  before insert or update of handle on profiles
  for each row execute function enforce_handle_available();

-- ---------------------------------------------------------------------------
-- Record counters
--
-- profiles.entry_count / verified_count are read once per row on the search
-- page and written whenever a record changes, which is far rarer. Maintaining
-- them here turns a correlated subquery per result into a column read.
--
-- Recomputed by aggregate rather than incremented by delta: an achievement can
-- change verification state, be deleted, or move between states in one
-- statement, and a delta arithmetic that covers every path is where counter
-- drift comes from. One indexed aggregate over an athlete's own rows is cheap.
-- ---------------------------------------------------------------------------

create or replace function sync_record_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.profile_id, old.profile_id);
begin
  update profiles p
     set entry_count    = counts.total,
         verified_count = counts.verified
    from (
      select count(*)                                          as total,
             count(*) filter (where verification = 'verified') as verified
        from achievements
       where profile_id = target
    ) as counts
   where p.id = target;

  return null;
end;
$$;

create trigger achievements_count_sync
  after insert or update or delete on achievements
  for each row execute function sync_record_counts();

-- ---------------------------------------------------------------------------
-- Verification state
--
-- `achievements.verification` is a cache of the newest decision in
-- `verifications`. Writing it here keeps the resume page to a single query
-- while leaving the audit trail authoritative. The counter trigger above then
-- fires on that update, so verified_count follows without a second path.
-- ---------------------------------------------------------------------------

create or replace function apply_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update achievements
     set verification = new.outcome,
         verified_at  = case when new.outcome = 'verified' then new.created_at else null end
   where id = new.achievement_id;

  return null;
end;
$$;

create trigger verifications_apply
  after insert on verifications
  for each row execute function apply_verification();

-- ---------------------------------------------------------------------------
-- Film provider parsing
--
-- Derived on write so rendering never parses a URL, and so a host we do not
-- recognise is recorded as such — the profile then shows an honest outbound
-- link instead of an iframe that renders a grey box.
--
-- Only providers with a stable, publicly documented embed path are matched.
-- Guessing at an embed URL for an arbitrary host produces exactly the broken
-- player this is meant to avoid.
-- ---------------------------------------------------------------------------

create or replace function parse_film_url()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.provider    := null;
  new.external_id := null;

  -- youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
  if new.url ~* '^https?://(www\.)?(youtube\.com|youtu\.be)/' then
    new.provider := 'youtube';
    new.external_id := coalesce(
      substring(new.url from '[?&]v=([A-Za-z0-9_-]{11})'),
      substring(new.url from 'youtu\.be/([A-Za-z0-9_-]{11})'),
      substring(new.url from '/embed/([A-Za-z0-9_-]{11})')
    );

  elsif new.url ~* '^https?://(www\.)?vimeo\.com/' then
    new.provider := 'vimeo';
    new.external_id := substring(new.url from 'vimeo\.com/(?:video/)?([0-9]+)');

  -- Hudl's public share URLs carry an opaque id; there is no documented embed
  -- endpoint, so the id is stored for display and the link stays outbound.
  elsif new.url ~* '^https?://(www\.)?hudl\.com/' then
    new.provider := 'hudl';
    new.external_id := substring(new.url from 'hudl\.com/video/[^/]*/([A-Za-z0-9]+)');
  end if;

  return new;
end;
$$;

create trigger film_clips_parse_url
  before insert or update of url on film_clips
  for each row execute function parse_film_url();

-- ---------------------------------------------------------------------------
-- Discovery
--
-- The one query PostgREST filters cannot express: name matching that tolerates
-- misspelling. A recruiter who heard a name at a meet and is typing it from
-- memory needs `ilike` to fail gracefully into trigram similarity, and needs
-- the filters and the ranking applied in the same pass.
--
-- STABLE + SECURITY INVOKER: this runs as the caller, so RLS on `profiles`
-- still applies and the explicit `visibility = 'public'` below is the listing
-- rule rather than the access rule. Both have to hold.
-- ---------------------------------------------------------------------------

create or replace function search_athletes(
  q             text default null,
  sport         text default null,
  levels        athlete_level[] default null,
  grad_years    smallint[] default null,
  regions       char(2)[] default null,
  athlete_positions text[] default null,
  verified_only boolean default false,
  page_size     integer default 24,
  page_offset   integer default 0
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
     and (athlete_positions is null or p.positions && athlete_positions)
     and (not verified_only or p.verified_count > 0)
     and (
       q is null
       or btrim(q) = ''
       or p.display_name ilike '%' || q || '%'
       or p.handle::text ilike '%' || q || '%'
       or p.display_name % q
     )
   order by
     -- Exact-ish name matches first, then the strongest records. Without the
     -- similarity term a search for "Reyes" ranks a stranger with 40 verified
     -- entries above the Reyes the recruiter was looking for.
     case when q is null or btrim(q) = '' then 0
          else similarity(p.display_name, q) end desc,
     p.verified_count desc,
     p.entry_count desc,
     p.display_name asc
   limit least(coalesce(page_size, 24), 100)
  offset greatest(coalesce(page_offset, 0), 0);
$$;

grant execute on function search_athletes(
  text, text, athlete_level[], smallint[], char(2)[], text[], boolean, integer, integer
) to anon, authenticated;
