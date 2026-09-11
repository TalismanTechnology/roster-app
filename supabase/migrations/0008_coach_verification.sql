-- Roster · 0008 · Coach verification
--
-- `account_kind = 'coach'` and `memberships.role = 'coach'` have existed since
-- 0001 — the column comment there even says "verified coach at the athlete's
-- org" — but nothing has ever verified one. `memberships_write_own` (0006) lets
-- any signed-in user insert a `role = 'coach'` row at any org with nothing
-- checking it's really them. This migration adds the missing verification step:
-- an existing verified coach at the same org can vouch for a new one, and
-- Roster staff are the fallback when there isn't one yet (the first coach at an
-- org, or one Roster hasn't added yet).
--
-- Policies for every other table live in 0006_security.sql, by that file's own
-- stated rule. This migration breaks that only because 0006 may already be
-- applied elsewhere and migrations are not edited in place after the fact —
-- the policies below are the coach-verification exception to that rule, not a
-- new home for policies in general.

alter table profiles
  add column title text;

-- "Head Coach", "Assistant Coach" — free text, not coach-only.

alter table memberships
  add column verified_at timestamptz,
  add column verified_by uuid references profiles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- can_vouch_for_membership
--
-- True if the caller already holds a verified, current coach/staff/admin
-- membership at the same org as the target row, and isn't the target's own
-- owner. Mirrors `coaches_athlete()` from 0006, but for "is this person really
-- a coach here" rather than "does this coach have authority over this athlete".
-- ---------------------------------------------------------------------------

create or replace function can_vouch_for_membership(target_membership uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from memberships target
      join memberships voucher on voucher.org_id = target.org_id
     where target.id = target_membership
       and target.role = 'coach'
       and voucher.profile_id = auth.uid()
       and voucher.profile_id <> target.profile_id
       and voucher.role in ('coach', 'staff', 'admin')
       and voucher.verified_at is not null
       and voucher.ended_on is null
  );
$$;

-- ---------------------------------------------------------------------------
-- memberships — close the self-verification gap, add the two ways a claim
-- can actually be verified.
-- ---------------------------------------------------------------------------

drop policy if exists memberships_write_own on memberships;

-- Unchanged from 0006 except the added check: the owner can insert or edit
-- their own tenure rows, but can never write a non-null verification onto one
-- themselves, whether inserting fresh or editing later.
create policy memberships_write_own on memberships
  for all using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and verified_at is null and verified_by is null);

create policy memberships_verify_peer on memberships
  for update
  using (role = 'coach' and can_vouch_for_membership(id))
  with check (role = 'coach' and can_vouch_for_membership(id));

create policy memberships_staff_all on memberships
  for all using (is_staff()) with check (is_staff());

-- Defense in depth: RLS policies are row-level, not column-level, so
-- `memberships_verify_peer` and `memberships_staff_all` could otherwise be used
-- to edit a claim's org, role, or tenure while "just" verifying it. This
-- trigger is the actual column-level guard, independent of which policy let
-- the statement through.
create or replace function guard_membership_verify_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.profile_id and not is_staff() then
    if new.verified_at is distinct from old.verified_at
       or new.verified_by is distinct from old.verified_by then
      raise exception 'a membership cannot verify itself'
        using errcode = 'insufficient_privilege';
    end if;
  elsif not is_staff() then
    if new.profile_id  is distinct from old.profile_id
       or new.org_id     is distinct from old.org_id
       or new.role       is distinct from old.role
       or new.sport      is distinct from old.sport
       or new.jersey     is distinct from old.jersey
       or new.started_on is distinct from old.started_on
       or new.ended_on   is distinct from old.ended_on then
      raise exception 'verifying a membership may only set verified_at and verified_by'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

create trigger memberships_guard_verify_only
  before update on memberships
  for each row execute function guard_membership_verify_only();

-- ---------------------------------------------------------------------------
-- reserved_handles — the new /coach and /staff routes
-- ---------------------------------------------------------------------------

insert into reserved_handles (handle) values ('coach'), ('staff')
  on conflict (handle) do nothing;
