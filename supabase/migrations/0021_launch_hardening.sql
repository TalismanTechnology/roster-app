-- Roster · 0021 · Launch hardening: minors' consent, profile reports, suspension
--
-- Wave 9. Everything here is additive:
--
--   1. profiles.age_consent / profiles.consent_at — the onboarding
--      attestation (#44): the athlete is 18 or older, or a parent or guardian
--      agreed. Nullable: accounts created before this have neither, and the
--      app treats null as "not attested" rather than inventing an answer.
--      Once set, only staff (or the service role) may change it — the same
--      guard 0015 puts on moderation and trust fields.
--
--   2. profile_reports — "Report this profile" (#50). Written only through
--      report_profile() (definer), which takes the reporter from auth.uid(),
--      refuses resumes the caller cannot see and the caller's own, drops a
--      signed-in reporter's duplicate while one is open, and caps a reporter
--      at 20 a day (DAILY_REPORT_CAP in src/lib/data/rules.ts). Signed-out
--      visitors may report; the app rate-limits them per address. Readable
--      and updatable by staff only.
--
--   3. set_profile_suspension(profile, suspend) — staff only. Sets or clears
--      profiles.suspended_at (which can_view_profile, search_athletes, and
--      the coach-contact policy already honour) and resolves the resume's
--      open reports as actioned. The service role can do the same with a
--      plain UPDATE; see docs/LAUNCH-CHECKLIST.md.
--
-- Safe to re-run: `if not exists`, `create or replace`, `drop … if exists`.

set client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- 1. Age / guardian consent
-- ---------------------------------------------------------------------------

alter table profiles
  add column if not exists age_consent text,
  add column if not exists consent_at  timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_age_consent_check') then
    alter table profiles
      add constraint profiles_age_consent_check
      check (age_consent is null or age_consent in ('adult', 'guardian'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_consent_at_check') then
    alter table profiles
      add constraint profiles_consent_at_check
      check ((age_consent is null) = (consent_at is null));
  end if;
end;
$$;

-- An attestation is a record of what was said when; the owner may give it
-- (insert, or first update from null) but not rewrite it afterwards.
create or replace function guard_profile_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if may_write_guarded_columns() then
    return new;
  end if;
  if old.age_consent is not null
     and (new.age_consent is distinct from old.age_consent or new.consent_at is distinct from old.consent_at) then
    raise exception 'consent attestation cannot be changed once given'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_consent on profiles;
create trigger profiles_guard_consent
  before update on profiles
  for each row execute function guard_profile_consent();

-- ---------------------------------------------------------------------------
-- 2. profile_reports
-- ---------------------------------------------------------------------------

create table if not exists profile_reports (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles (id) on delete cascade,
  -- Kept when the reporter deletes their account, minus who they were.
  reporter_id uuid references profiles (id) on delete set null,
  reason      text not null
              check (reason in ('impersonation', 'false_record', 'inappropriate', 'minor_safety', 'spam', 'other')),
  detail      text,
  status      text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references profiles (id) on delete set null,
  constraint profile_reports_detail_len check (detail is null or char_length(detail) <= 1000)
);

create index if not exists profile_reports_open_idx
  on profile_reports (created_at desc) where status = 'open';
create index if not exists profile_reports_profile_idx on profile_reports (profile_id);
create index if not exists profile_reports_reporter_idx
  on profile_reports (reporter_id, created_at) where reporter_id is not null;

alter table profile_reports enable row level security;

drop policy if exists profile_reports_select_staff on profile_reports;
create policy profile_reports_select_staff on profile_reports
  for select using (is_staff());

drop policy if exists profile_reports_update_staff on profile_reports;
create policy profile_reports_update_staff on profile_reports
  for update using (is_staff()) with check (is_staff());

-- No insert policy: report_profile() is the only way in.
revoke all on profile_reports from anon;
revoke insert, delete on profile_reports from authenticated;

-- RS403 not allowed · RS404 no such (visible) resume · RS429 daily cap · 22023 bad input
create or replace function report_profile(p_profile uuid, p_reason text, p_detail text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter uuid := auth.uid();
  daily_cap  constant integer := 20;
  v_detail   text := nullif(btrim(coalesce(p_detail, '')), '');
begin
  if p_reason is null
     or p_reason not in ('impersonation', 'false_record', 'inappropriate', 'minor_safety', 'spam', 'other') then
    raise exception 'unknown report reason' using errcode = '22023';
  end if;
  if v_detail is not null and char_length(v_detail) > 1000 then
    raise exception 'report detail is too long' using errcode = '22023';
  end if;

  -- can_view_profile runs as the caller (auth.uid() is theirs), so a private
  -- or suspended resume is "not found" exactly as it is on the page.
  if p_profile is null or not can_view_profile(p_profile) or p_profile = v_reporter then
    raise exception 'that resume was not found' using errcode = 'RS404';
  end if;

  if v_reporter is not null then
    if exists (
      select 1 from profile_reports
       where reporter_id = v_reporter and profile_id = p_profile and status = 'open'
    ) then
      return;  -- already reported and still open: accepted, not duplicated
    end if;
    if (
      select count(*) from profile_reports
       where reporter_id = v_reporter
         and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
    ) >= daily_cap then
      raise exception 'daily report limit (%) reached', daily_cap using errcode = 'RS429';
    end if;
  end if;

  insert into profile_reports (profile_id, reporter_id, reason, detail)
  values (p_profile, v_reporter, p_reason, v_detail);
end;
$$;

revoke all on function report_profile(uuid, text, text) from public;
grant execute on function report_profile(uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. set_profile_suspension
-- ---------------------------------------------------------------------------

create or replace function set_profile_suspension(p_profile uuid, p_suspend boolean)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_updated profiles;
begin
  -- The service role (no auth.uid()) may; otherwise staff only.
  if v_actor is not null and not is_staff() then
    raise exception 'staff only' using errcode = 'RS403';
  end if;

  update profiles
     set suspended_at = case when p_suspend then coalesce(suspended_at, now()) else null end,
         updated_at   = now()
   where id = p_profile
  returning * into v_updated;

  if v_updated.id is null then
    raise exception 'that profile was not found' using errcode = 'RS404';
  end if;

  if p_suspend then
    update profile_reports
       set status = 'actioned', resolved_at = now(), resolved_by = v_actor
     where profile_id = p_profile and status = 'open';
  end if;

  return v_updated;
end;
$$;

revoke all on function set_profile_suspension(uuid, boolean) from public, anon;
grant execute on function set_profile_suspension(uuid, boolean) to authenticated;
