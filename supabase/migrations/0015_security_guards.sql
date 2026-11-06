-- Roster · 0015 · Security guards
--
-- The first migration since 0009 written to run against the live project.
-- Everything here is additive and safe to re-run: inserts skip existing rows,
-- functions are `create or replace`, triggers are `create or replace`.
--
-- Four things, all closing a gap between what the app enforces and what the
-- database would let a client with the anon key do directly over PostgREST:
--
--   1. reserved_handles catches up with the app's route list.
--   2. New profiles start closed to recruiting.
--   3. The leftover posts tables (0010–0014) stop being client-writable.
--   4. Column-level guards on profiles and achievements, which RLS cannot
--      express because policies are row-level.

-- ---------------------------------------------------------------------------
-- 1. reserved_handles — level with `src/lib/handles.ts`
--
-- Top-level `src/app` segments and the metadata files Next serves from the
-- root, plus the rest of the app's list. Hyphenated words can never pass
-- `handle_format`, but are listed anyway so the two lists diff cleanly.
-- ---------------------------------------------------------------------------

insert into reserved_handles (handle) values
  ('lists'), ('manifest'), ('sitemap'), ('robots'), ('favicon'), ('icon'),
  ('apple-icon'), ('opengraph-image'), ('twitter-image'),
  ('auth'), ('onboarding'), ('preview'), ('resume'), ('search'), ('settings'),
  ('sign-in'), ('sign-up'), ('verify'), ('coach'), ('staff')
on conflict (handle) do nothing;

-- ---------------------------------------------------------------------------
-- 2. is_recruitable defaults to false
--
-- Being recruitable exposes a minor's coach phone number (coach_contacts
-- policy, 0006), so it is something an athlete turns on, not something they
-- have to find and turn off. Existing rows keep whatever they have.
-- ---------------------------------------------------------------------------

alter table profiles alter column is_recruitable set default false;

-- ---------------------------------------------------------------------------
-- 3. posts / post_reactions — inert to clients
--
-- Nothing in the app reads these, and live they carry every privilege for
-- anon and authenticated, TRUNCATE included — RLS does not apply to TRUNCATE.
-- service_role keeps its grants so the tables can still be inspected or
-- dropped deliberately later.
-- ---------------------------------------------------------------------------

revoke all on table posts, post_reactions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Who may write a guarded column
--
-- Staff, or a caller with no JWT subject — the service role, migrations, the
-- dashboard. Anon also has no subject, but RLS gives anon no UPDATE on either
-- table, so it never reaches these triggers with a row to change.
--
-- `pg_trigger_depth() > 1` admits writes made by another trigger: the
-- counters `sync_record_counts()` keeps on profiles, and the verification
-- state `apply_verification()` copies onto achievements. Both run with the
-- athlete's or coach's JWT still set, and a client cannot reach a nested
-- trigger with values of its own choosing.
-- ---------------------------------------------------------------------------

create or replace function may_write_guarded_columns()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is null or pg_trigger_depth() > 1 or is_staff();
$$;

revoke all on function may_write_guarded_columns() from public;

-- ---------------------------------------------------------------------------
-- 4a. profiles — account kind, moderation, trust, and counters
--
-- `profiles_update_self` lets an athlete update their own row, every column of
-- it. Without this an athlete could make themselves staff, lift their own
-- suspension, mark their identity verified, or inflate the verified count
-- search ranks on. Insert is guarded too: `profiles_insert_self` would
-- otherwise accept a brand-new row with `account_kind = 'staff'`.
-- ---------------------------------------------------------------------------

create or replace function guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if may_write_guarded_columns() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.account_kind = 'staff'
       or new.suspended_at is not null
       or new.identity_verified_at is not null
       or new.verified_count <> 0
       or new.entry_count <> 0 then
      raise exception 'a new profile cannot set account kind staff, moderation, or trust fields'
        using errcode = 'insufficient_privilege';
    end if;
  elsif new.account_kind         is distinct from old.account_kind
     or new.suspended_at         is distinct from old.suspended_at
     or new.identity_verified_at is distinct from old.identity_verified_at
     or new.verified_count       is distinct from old.verified_count
     or new.entry_count          is distinct from old.entry_count then
    raise exception 'account kind, moderation, and trust fields are not editable'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create or replace trigger profiles_guard_privileged
  before insert or update on profiles
  for each row execute function guard_profile_privileged_columns();

-- ---------------------------------------------------------------------------
-- 4b. achievements — the verification badge
--
-- `achievements.verification` is a cache of the newest row in `verifications`
-- (0007). `achievements_write_own` lets the athlete write every column of
-- their own entry, so without this they could mark it verified themselves.
--
-- A substantive edit clears the badge: the coach vouched for the old values,
-- not the new ones. Same rule, same fields, as `isSubstantiveEntryChange` in
-- `src/lib/data/rules.ts`, plus the columns the app does not edit yet. The
-- reset runs before the direct-write check so the app's own update — which
-- sends the reset itself — passes. Staff and the service role may set
-- verification explicitly in the same statement as an edit; their value wins.
-- ---------------------------------------------------------------------------

create or replace function guard_achievement_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  privileged boolean := may_write_guarded_columns();
begin
  if tg_op = 'INSERT' then
    if not privileged
       and (new.verification <> 'unverified' or new.verified_at is not null) then
      raise exception 'a new entry starts unverified'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if (new.kind, new.title, new.detail, new.sport, new.event_id,
      new.value_numeric, new.value_display, new.unit,
      new.competition, new.opponent, new.placement, new.field_size,
      new.org_id, new.location, new.achieved_on)
     is distinct from
     (old.kind, old.title, old.detail, old.sport, old.event_id,
      old.value_numeric, old.value_display, old.unit,
      old.competition, old.opponent, old.placement, old.field_size,
      old.org_id, old.location, old.achieved_on)
     and not (privileged
              and (new.verification is distinct from old.verification
                   or new.verified_at is distinct from old.verified_at)) then
    new.verification := 'unverified';
    new.verified_at  := null;
    return new;
  end if;

  if not privileged
     and (new.verification is distinct from old.verification
          or new.verified_at is distinct from old.verified_at) then
    raise exception 'verification is recorded through verifications, not set directly'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create or replace trigger achievements_guard_verification
  before insert or update on achievements
  for each row execute function guard_achievement_verification();
