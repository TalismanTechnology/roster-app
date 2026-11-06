-- Roster · 0018 · Adapter parity: featured film, thumbnails, search hygiene
--
-- Three places the Supabase adapter did something the local adapter does not
-- (or did it in two round trips where one transaction belongs):
--
--   1. feature_film(clip) — unfeature the athlete's other clips and feature
--      this one in a single transaction. The adapter used to send two
--      UPDATEs; if the second failed, the athlete was left with no featured
--      clip at all.
--
--   2. parse_film_url() also derives `thumbnail_url` for YouTube, exactly as
--      the local adapter does on write. Existing rows are backfilled.
--
--   3. search_athletes() escapes LIKE metacharacters itself, so `%` and `_`
--      typed into the search box match literally, and matches positions
--      case-insensitively ("wr" finds "WR"). The app now sends the raw query:
--      escaping in the client also fed the backslashes to similarity(),
--      which skewed the ranking for any name containing `_`.
--
-- Plus the two new routes, /forgot-password and /reset-password, join
-- reserved_handles to stay level with src/lib/handles.ts.
--
-- Additive and safe to re-run: `create or replace` throughout, the backfill
-- only touches rows still missing a thumbnail, inserts skip on conflict.

set client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- 1. feature_film
-- ---------------------------------------------------------------------------

create or replace function feature_film(clip uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in to do that' using errcode = 'RS403';
  end if;

  -- Not-found for missing and not-mine alike: a different answer would
  -- confirm that someone else's clip id exists.
  select profile_id into owner
    from film_clips
   where id = clip
     for update;
  if owner is null or owner <> auth.uid() then
    raise exception 'clip not found' using errcode = 'RS404';
  end if;

  -- Lock the athlete's clips so two concurrent calls serialize rather than
  -- trip film_clips_one_featured_idx (0004). Two statements, not one: the
  -- partial unique index is checked row by row, so a single UPDATE that
  -- flips one row off and another on can collide with itself mid-statement.
  perform 1 from film_clips where profile_id = owner for update;

  update film_clips
     set is_featured = false
   where profile_id = owner
     and is_featured
     and id <> clip;

  update film_clips
     set is_featured = true
   where id = clip
     and not is_featured;
end;
$$;

revoke all on function feature_film(uuid) from public, anon;
grant execute on function feature_film(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. parse_film_url, now with the YouTube thumbnail
--
-- Mirrors parseFilmUrl() + filmThumbnailUrl() in src/lib/data/local/film.ts.
-- Only YouTube publishes a thumbnail at a URL derivable from the id; every
-- other provider gets null, as it does locally.
-- ---------------------------------------------------------------------------

create or replace function parse_film_url()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.provider      := null;
  new.external_id   := null;
  new.thumbnail_url := null;

  if new.url ~* '^https?://(www\.)?(youtube\.com|youtu\.be)/' then
    new.provider := 'youtube';
    new.external_id := coalesce(
      substring(new.url from '[?&]v=([A-Za-z0-9_-]{11})'),
      substring(new.url from 'youtu\.be/([A-Za-z0-9_-]{11})'),
      substring(new.url from '/embed/([A-Za-z0-9_-]{11})')
    );
    if new.external_id is not null then
      new.thumbnail_url := 'https://i.ytimg.com/vi/' || new.external_id || '/hqdefault.jpg';
    end if;

  elsif new.url ~* '^https?://(www\.)?vimeo\.com/' then
    new.provider := 'vimeo';
    new.external_id := substring(new.url from 'vimeo\.com/(?:video/)?([0-9]+)');

  elsif new.url ~* '^https?://(www\.)?hudl\.com/' then
    new.provider := 'hudl';
    new.external_id := substring(new.url from 'hudl\.com/video/[^/]*/([A-Za-z0-9]+)');
  end if;

  return new;
end;
$$;

-- The trigger itself (0007) already points at this function by name.

update film_clips
   set thumbnail_url = 'https://i.ytimg.com/vi/' || external_id || '/hqdefault.jpg'
 where provider = 'youtube'
   and external_id is not null
   and thumbnail_url is null;

-- ---------------------------------------------------------------------------
-- 3. search_athletes, escaping its own LIKE pattern
-- ---------------------------------------------------------------------------

-- `\` first, so the escapes added for `%` and `_` are not themselves escaped.
create or replace function like_literal(value text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select replace(replace(replace(value, '\', '\\'), '%', '\%'), '_', '\_');
$$;

grant execute on function like_literal(text) to anon, authenticated;

-- Same signature as 0007, so `create or replace` keeps the grant.
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
     -- Case-insensitive: athletes type "WR", recruiters type "wr". Positions
     -- are at most six per row (0002), so the unnest is cheap; the filter
     -- always runs alongside the listing rule, never across the whole table.
     and (athlete_positions is null
          or exists (select 1
                       from unnest(p.positions) as mine(pos)
                       join unnest(athlete_positions) as wanted(pos)
                         on lower(mine.pos) = lower(wanted.pos)))
     and (not verified_only or p.verified_count > 0)
     and (
       q is null
       or btrim(q) = ''
       or p.display_name ilike '%' || like_literal(q) || '%' escape '\'
       or p.handle::text ilike '%' || like_literal(q) || '%' escape '\'
       or p.display_name % q
     )
   order by
     case when q is null or btrim(q) = '' then 0
          else similarity(p.display_name, q) end desc,
     p.verified_count desc,
     p.entry_count desc,
     p.display_name asc
   limit least(coalesce(page_size, 24), 100)
  offset greatest(coalesce(page_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- 4. reserved_handles — the password-reset routes
--
-- Hyphenated, so `handle_format` already refuses them; listed so the two
-- lists diff cleanly (see 0015).
-- ---------------------------------------------------------------------------

insert into reserved_handles (handle) values ('forgot-password'), ('reset-password')
on conflict (handle) do nothing;
