-- Contact values are only readable through a visibility-checked, masked RPC.
-- Column grants keep ordinary RLS queries and owner writes working, while
-- rejecting direct REST selections/filters on either contact column.
revoke select on public.profiles from public, anon, authenticated;
revoke select (contact_email, phone) on public.profiles from public, anon, authenticated;
grant select (id, handle, account_kind, visibility, display_name, title, avatar_url, cover_url, bio, location, hometown, level, primary_sport, grad_year, height_cm, weight_kg, positions, jersey, region, school, gpa, sat_score, act_score, ncaa_id, is_recruitable, instagram, x_handle, hudl_url, results_url, entry_count, verified_count, identity_verified_at, suspended_at, created_at, updated_at) on public.profiles to anon, authenticated;

create or replace function public.get_profile(target_id uuid default null, target_handle text default null)
returns setof public.profiles
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare result public.profiles;
begin
  select p.* into result from public.profiles p
   where (target_id is not null or target_handle is not null)
     and (target_id is null or p.id = target_id)
     and (target_handle is null or p.handle = target_handle::public.citext)
     and public.can_view_profile(p.id);
  if not found then return; end if;
  if not (result.id = coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
          or public.is_staff() or (result.is_recruitable and result.visibility = 'public')) then
    result.contact_email := null;
    result.phone := null;
  end if;
  return next result;
end;
$$;
revoke all on function public.get_profile(uuid, text) from public;
grant execute on function public.get_profile(uuid, text) to anon, authenticated;

-- Discovery retains its filters/ranking and uses the same masked projection.
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
security definer
set search_path = public, pg_temp
as $$
  select visible.*
    from public.profiles p
    cross join lateral public.get_profile(p.id) visible
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
