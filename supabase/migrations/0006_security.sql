-- Roster · 0006 · Security
--
-- Every row-level policy in the product lives in this file. Keeping them
-- together means the answer to "who can see an athlete's resume" is auditable
-- in one read, instead of reconstructed from six migrations.
--
-- The model inverted with the pivot. Roster was a private network where the
-- default answer was "no" and a follow edge was the key; it is now a resume
-- that is worthless if a recruiter without an account cannot open it. So the
-- default answer is "yes", and the interesting cases are the two ways an
-- athlete opts out — `private` and `unlisted` — plus the material that is
-- never public at any visibility: evidence, contact details, view logs.
--
-- The helpers are SECURITY DEFINER so a policy can consult another table
-- without re-entering that table's own policies. `search_path` is pinned on
-- each to defeat search_path hijacking.

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

-- The single source of truth for resume visibility. Every other table defers
-- to this, so the privacy model has exactly one definition.
--
-- `unlisted` reads as visible here on purpose: it means "not listed", and the
-- listing is done by the discovery query in 0007, which filters to `public`.
-- Encoding it as a weaker `private` would break the shareable link that is the
-- entire point of the setting.
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
        select p.visibility in ('public', 'unlisted')
        from profiles p
        where p.id = target and p.suspended_at is null
      ),
      false
    )
  end;
$$;

-- Is the current user a coach or staff member at any org where `target` is a
-- current athlete? Gates verification authority and access to evidence.
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
alter table reserved_handles       enable row level security;
alter table profiles               enable row level security;
alter table organizations          enable row level security;
alter table memberships            enable row level security;
alter table access_requests        enable row level security;
alter table achievements           enable row level security;
alter table achievement_evidence   enable row level security;
alter table verifications          enable row level security;
alter table coach_endorsements     enable row level security;
alter table film_clips             enable row level security;
alter table coach_contacts         enable row level security;
alter table profile_views          enable row level security;
alter table recruiter_lists        enable row level security;
alter table recruiter_list_members enable row level security;

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

-- Readable so sign-up can tell someone their handle is taken before they
-- submit, rather than after.
create policy reserved_handles_select on reserved_handles for select using (true);
create policy reserved_handles_write  on reserved_handles for all
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
-- general audience of the resume. A recruiter sees the verified badge; the
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

-- The athlete may hide an endorsement from their resume but not edit its text.
create policy coach_endorsements_hide on coach_endorsements
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Film
-- ---------------------------------------------------------------------------

create policy film_clips_select on film_clips
  for select using (can_view_profile(profile_id));

create policy film_clips_write_own on film_clips
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Coach contacts
--
-- The strictest read on the resume, and the one worth being careful about: a
-- phone number for a minor's coach. Three conditions, all required — the
-- athlete marked it visible, the athlete is open to being recruited, and the
-- resume is public rather than merely unlisted. An unlisted resume is a link
-- an athlete hands out; it should not carry someone else's phone number to
-- whoever that link gets forwarded to.
-- ---------------------------------------------------------------------------

create policy coach_contacts_select on coach_contacts
  for select using (
    profile_id = auth.uid()
    or is_staff()
    or (
      is_visible
      and exists (
        select 1 from profiles p
         where p.id = profile_id
           and p.visibility = 'public'
           and p.is_recruitable
           and p.suspended_at is null
      )
    )
  );

create policy coach_contacts_write_own on coach_contacts
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Signals
-- ---------------------------------------------------------------------------

-- An athlete sees who viewed their resume. A viewer sees only their own rows.
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

-- ---------------------------------------------------------------------------
-- Access requests
-- ---------------------------------------------------------------------------

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

-- Record a resume view. Definer so the counter cannot be written directly, and
-- self-views are ignored so the number stays meaningful.
--
-- Anonymous views count. That is the change from the private-network version:
-- most recruiters reading a resume are not signed in, and a view counter that
-- ignored them would under-report the exact traffic the athlete cares about.
-- The viewer column stays null for those, so "14 views" is honest while "who"
-- is only ever answerable for signed-in viewers.
create or replace function record_profile_view(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = target then
    return;
  end if;

  if not can_view_profile(target) then
    return;
  end if;

  -- Must match profile_views_daily_idx in 0005 expression-for-expression.
  insert into profile_views (profile_id, viewer_id, viewed_on, view_count)
  values (target, auth.uid(), current_date, 1)
  on conflict (
    profile_id,
    coalesce(viewer_id, '00000000-0000-0000-0000-000000000000'::uuid),
    viewed_on
  )
  do update set view_count = profile_views.view_count + 1;
end;
$$;

revoke all on function record_profile_view(uuid) from public;
grant execute on function record_profile_view(uuid) to anon, authenticated;
