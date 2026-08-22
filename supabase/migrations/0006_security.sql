-- Roster · 0006 · Security
--
-- Every row-level policy in the product lives in this file. Keeping them
-- together means the answer to "who can see an athlete's record" is auditable
-- in one read, instead of reconstructed from six migrations.
--
-- The helpers are SECURITY DEFINER so a policy can consult another table
-- without re-entering that table's own policies. Without it, a policy on
-- `profiles` that reads `follows` (whose policy reads `profiles`) recurses
-- forever. `search_path` is pinned on each to defeat search_path hijacking.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select account_kind = 'staff' from profiles where id = auth.uid()),
    false
  );
$$;

-- Does the current user have an accepted follow of `target`?
create or replace function follows_profile(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from follows
     where follower_id = auth.uid()
       and following_id = target
       and accepted_at is not null
  );
$$;

-- The single source of truth for profile visibility. Every other table defers
-- to this, so the privacy model has exactly one definition.
create or replace function can_view_profile(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when target is null then false
    when target = auth.uid() then true
    when is_staff() then true
    else coalesce(
      (
        select case p.visibility
          when 'public'  then true
          when 'members' then auth.uid() is not null
          when 'private' then follows_profile(target)
        end
        from profiles p
        where p.id = target and p.suspended_at is null
      ),
      false
    )
  end;
$$;

-- Can the current user see this post? Posts inherit their author's visibility.
create or replace function can_view_post(target_post uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from posts p
     where p.id = target_post
       and p.removed_at is null
       and can_view_profile(p.author_id)
  );
$$;

-- Is the current user a coach or staff member at any org where `target` is a
-- current athlete? Gates coach endorsements and verification authority.
create or replace function coaches_athlete(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from memberships coach
      join memberships athlete on athlete.org_id = coach.org_id
     where coach.profile_id = auth.uid()
       and coach.role in ('coach', 'staff', 'admin')
       and coach.ended_on is null
       and athlete.profile_id = target
       and athlete.role in ('athlete', 'captain')
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
--
-- Supabase exposes every table in `public` over PostgREST. A table without RLS
-- enabled is world-readable to anyone holding the anon key, so this list must
-- stay exhaustive as tables are added.
-- ---------------------------------------------------------------------------

alter table sports                 enable row level security;
alter table sport_events           enable row level security;
alter table profiles               enable row level security;
alter table organizations          enable row level security;
alter table memberships            enable row level security;
alter table invites                enable row level security;
alter table access_requests        enable row level security;
alter table achievements           enable row level security;
alter table achievement_evidence   enable row level security;
alter table verifications          enable row level security;
alter table coach_endorsements     enable row level security;
alter table follows                enable row level security;
alter table posts                  enable row level security;
alter table post_media             enable row level security;
alter table likes                  enable row level security;
alter table comments               enable row level security;
alter table profile_views          enable row level security;
alter table recruiter_lists        enable row level security;
alter table recruiter_list_members enable row level security;
alter table notifications          enable row level security;

-- ---------------------------------------------------------------------------
-- Reference data — readable by all, written by staff
-- ---------------------------------------------------------------------------

create policy sports_select on sports for select using (true);
create policy sports_write  on sports for all
  using (is_staff()) with check (is_staff());

create policy sport_events_select on sport_events for select using (true);
create policy sport_events_write  on sport_events for all
  using (is_staff()) with check (is_staff());

create policy organizations_select on organizations for select using (true);
create policy organizations_write  on organizations for all
  using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create policy profiles_select on profiles
  for select using (can_view_profile(id));

create policy profiles_insert_self on profiles
  for insert with check (id = auth.uid());

create policy profiles_update_self on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_staff_all on profiles
  for all using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------------
-- memberships — inherit the athlete's visibility
-- ---------------------------------------------------------------------------

create policy memberships_select on memberships
  for select using (can_view_profile(profile_id));

create policy memberships_write_own on memberships
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- The record
-- ---------------------------------------------------------------------------

create policy achievements_select on achievements
  for select using (can_view_profile(profile_id));

create policy achievements_write_own on achievements
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Evidence is visible to the athlete, their coaches, and staff — not to the
-- general audience of the record. A recruiter sees the verified badge; the
-- underlying screenshot is reviewer material.
create policy achievement_evidence_select on achievement_evidence
  for select using (
    exists (
      select 1 from achievements a
       where a.id = achievement_id
         and (a.profile_id = auth.uid() or coaches_athlete(a.profile_id))
    )
    or is_staff()
  );

create policy achievement_evidence_write_own on achievement_evidence
  for all using (
    exists (select 1 from achievements a
             where a.id = achievement_id and a.profile_id = auth.uid())
  )
  with check (
    exists (select 1 from achievements a
             where a.id = achievement_id and a.profile_id = auth.uid())
  );

-- Verification decisions are public alongside the achievement: the badge is
-- only meaningful if you can see who stands behind it.
create policy verifications_select on verifications
  for select using (
    exists (select 1 from achievements a
             where a.id = achievement_id and can_view_profile(a.profile_id))
  );

-- Only a coach of that athlete, or staff, may record a decision. Notably the
-- athlete cannot verify their own record.
create policy verifications_insert on verifications
  for insert with check (
    verifier_id = auth.uid()
    and (
      is_staff()
      or exists (
        select 1 from achievements a
         where a.id = achievement_id
           and a.profile_id <> auth.uid()
           and coaches_athlete(a.profile_id)
      )
    )
  );

create policy coach_endorsements_select on coach_endorsements
  for select using (is_visible and can_view_profile(profile_id));

create policy coach_endorsements_write on coach_endorsements
  for all using (endorser_id = auth.uid()) with check (
    endorser_id = auth.uid() and coaches_athlete(profile_id)
  );

-- The athlete may hide an endorsement from their record but not edit its text.
create policy coach_endorsements_hide on coach_endorsements
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Social graph
-- ---------------------------------------------------------------------------

create policy follows_select on follows
  for select using (
    follower_id = auth.uid()
    or following_id = auth.uid()
    or (can_view_profile(follower_id) and can_view_profile(following_id))
  );

create policy follows_insert_self on follows
  for insert with check (follower_id = auth.uid());

create policy follows_delete_self on follows
  for delete using (follower_id = auth.uid() or following_id = auth.uid());

-- Accepting a pending request is the target's call, not the follower's.
create policy follows_accept on follows
  for update using (following_id = auth.uid()) with check (following_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Feed
-- ---------------------------------------------------------------------------

create policy posts_select on posts
  for select using (removed_at is null and can_view_profile(author_id));

create policy posts_write_own on posts
  for all using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy post_media_select on post_media
  for select using (can_view_post(post_id));

create policy post_media_write_own on post_media
  for all using (
    exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid())
  )
  with check (
    exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid())
  );

create policy likes_select on likes
  for select using (can_view_post(post_id));

create policy likes_write_own on likes
  for all using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and can_view_post(post_id));

create policy comments_select on comments
  for select using (removed_at is null and can_view_post(post_id));

create policy comments_write_own on comments
  for all using (author_id = auth.uid())
  with check (author_id = auth.uid() and can_view_post(post_id));

-- ---------------------------------------------------------------------------
-- Signals
-- ---------------------------------------------------------------------------

-- An athlete sees who viewed their record. A viewer sees only their own rows.
-- Writes go through record_profile_view() so a viewer cannot forge traffic.
create policy profile_views_select on profile_views
  for select using (profile_id = auth.uid() or viewer_id = auth.uid());

create policy recruiter_lists_own on recruiter_lists
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy recruiter_list_members_own on recruiter_list_members
  for all using (
    exists (select 1 from recruiter_lists l
             where l.id = list_id and l.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from recruiter_lists l
             where l.id = list_id and l.owner_id = auth.uid())
    and can_view_profile(profile_id)
  );

-- Notifications are created by triggers (which run as definer), never by
-- clients. Hence select and update-own-read-state only.
create policy notifications_select_own on notifications
  for select using (profile_id = auth.uid());

create policy notifications_mark_read on notifications
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Invites and access requests
-- ---------------------------------------------------------------------------

-- You can see codes you issued. Redemption goes through redeem_invite() so a
-- code is never enumerable through the API.
create policy invites_select_own on invites
  for select using (issued_by = auth.uid() or is_staff());

create policy invites_insert_staff on invites
  for insert with check (is_staff());

-- Write-only to the public: anyone may apply, only staff may read the list.
create policy access_requests_insert_anon on access_requests
  for insert with check (true);

create policy access_requests_select_staff on access_requests
  for select using (is_staff());

create policy access_requests_update_staff on access_requests
  for update using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------------
-- Callable functions
-- ---------------------------------------------------------------------------

-- Consume an invite code atomically. The conditional UPDATE is the lock: two
-- concurrent redemptions of a single-use code cannot both report success.
create or replace function redeem_invite(invite_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  update invites
     set used_count = used_count + 1
   where code = invite_code
     and used_count < max_uses
     and (expires_at is null or expires_at > now());

  get diagnostics claimed = row_count;
  return claimed = 1;
end;
$$;

-- Record a profile view. Definer so the counter cannot be written directly,
-- and self-views are ignored so the number stays meaningful.
create or replace function record_profile_view(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() = target then
    return;
  end if;

  if not can_view_profile(target) then
    return;
  end if;

  insert into profile_views (profile_id, viewer_id, viewed_on, view_count)
  values (target, auth.uid(), current_date, 1)
  on conflict (profile_id, viewer_id, viewed_on)
  do update set view_count = profile_views.view_count + 1;
end;
$$;

revoke all on function redeem_invite(text)       from public;
revoke all on function record_profile_view(uuid) from public;
grant execute on function redeem_invite(text)       to authenticated;
grant execute on function record_profile_view(uuid) to authenticated;
