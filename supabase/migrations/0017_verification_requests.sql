-- Roster · 0017 · Verification by link
--
-- The by-link flow the local adapter has modelled since day one: an athlete
-- names a coach from their references, Roster mints a single-use link, and
-- whoever opens it answers yes or no — no account needed. Until now the
-- Supabase schema had nowhere to keep the link, so the app reported the flow
-- as unavailable there.
--
-- Additive and safe to re-run against live: `if not exists`, `create or
-- replace`, `drop … if exists` before every policy and trigger.
--
-- The design in four rules:
--
--   1. The raw token is never stored. The app mints it, shows it to the
--      athlete once, and sends Postgres only its sha256 hex. A leaked table
--      dump (or a leaked backup) yields hashes, not working links.
--
--   2. Coach-side functions take the RAW token and hash it themselves. If they
--      accepted the hash, the hash would be the credential and rule 1 would
--      protect nothing.
--
--   3. Nobody reads the table directly except the athlete, and then only the
--      non-secret columns. Inserts and status changes go through SECURITY
--      DEFINER functions, which is where ownership, the daily cap, and expiry
--      are enforced.
--
--   4. `achievements.verification` stays a cache written only by triggers
--      (0007, 0015): opening a request marks the entry `submitted`, revoking
--      the last open one puts it back, and an answer flows through
--      `verifications` → `apply_verification()` exactly as before.

-- Re-runs print "does not exist, skipping" for every guarded drop otherwise.
set client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

create table if not exists verification_requests (
  id                      uuid primary key default gen_random_uuid(),
  -- sha256(token) as lowercase hex. Never the token itself.
  token_hash              text not null unique,
  achievement_id          uuid not null references achievements(id) on delete cascade,
  profile_id              uuid not null references profiles(id) on delete cascade,
  coach_contact_id        uuid not null references coach_contacts(id) on delete cascade,
  -- Same four states as `VerificationRequestStatus` in src/lib/data/types.ts.
  -- `expired` covers superseded, revoked, and invalidated-by-edit alike: in
  -- every case the coach should hear "this link no longer works".
  status                  text not null default 'pending',
  note                    text,
  verifier_name           text,
  verifier_role           text,
  -- The coach answered "I don't coach or know this athlete" (#83). Always
  -- paired with status = 'disputed'.
  flagged_unknown_athlete boolean not null default false,
  created_at              timestamptz not null default now(),
  responded_at            timestamptz,
  expires_at              timestamptz not null,

  constraint verification_request_status
    check (status in ('pending', 'verified', 'disputed', 'expired')),
  constraint verification_request_hash_format
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint verification_request_flag_is_dispute
    check (not flagged_unknown_athlete or status = 'disputed'),
  constraint verification_request_note_length
    check (note is null or char_length(note) <= 500)
);

create index if not exists verification_requests_profile_idx
  on verification_requests (profile_id, created_at desc);
create index if not exists verification_requests_achievement_pending_idx
  on verification_requests (achievement_id) where status = 'pending';
create index if not exists verification_requests_coach_pending_idx
  on verification_requests (coach_contact_id) where status = 'pending';

alter table verification_requests enable row level security;

-- ---------------------------------------------------------------------------
-- Privileges
--
-- Supabase grants every API role everything on a new table. Take it all back
-- and give the athlete SELECT on the columns that are safe to hand them —
-- everything except token_hash. `select *` from a client therefore fails;
-- the app lists explicit columns. No INSERT/UPDATE/DELETE grants at all:
-- writes go through the functions below, so the daily cap and the
-- ownership checks cannot be skipped by talking to PostgREST directly.
-- ---------------------------------------------------------------------------

revoke all on table verification_requests from anon, authenticated;
grant select (id, achievement_id, profile_id, coach_contact_id, status, note,
              verifier_name, verifier_role, flagged_unknown_athlete,
              created_at, responded_at, expires_at)
  on verification_requests to authenticated;

drop policy if exists verification_requests_select_own on verification_requests;
create policy verification_requests_select_own on verification_requests
  for select to authenticated using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- sha256 hex of the token's UTF-8 bytes — the same digest `hashToken()` in
-- src/lib/data/tokens.ts computes. Builtin since PG 11, no pgcrypto needed.
create or replace function verification_token_hash(p_token text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

revoke all on function verification_token_hash(text) from public, anon, authenticated;

-- What a coach is shown: the entry, a narrow slice of the athlete, a narrow
-- slice of the coach contact. No contact details, no academics — a leaked
-- link should reveal the claim and nothing else about a minor.
create or replace function verification_request_payload(r verification_requests)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id,
    'achievement_id', r.achievement_id,
    'profile_id', r.profile_id,
    'coach_contact_id', r.coach_contact_id,
    'status', r.status,
    'note', r.note,
    'verifier_name', r.verifier_name,
    'verifier_role', r.verifier_role,
    'flagged_unknown_athlete', r.flagged_unknown_athlete,
    'created_at', r.created_at,
    'responded_at', r.responded_at,
    'expires_at', r.expires_at,
    'entry', (select to_jsonb(e) from record_entries e where e.id = r.achievement_id),
    'athlete', (select jsonb_build_object(
                  'id', p.id, 'handle', p.handle, 'display_name', p.display_name,
                  'primary_sport', p.primary_sport, 'school', p.school, 'grad_year', p.grad_year)
                  from profiles p where p.id = r.profile_id),
    'coach', (select jsonb_build_object(
                'id', c.id, 'name', c.name, 'role', c.role, 'org_name', c.org_name)
                from coach_contacts c where c.id = r.coach_contact_id)
  );
$$;

revoke all on function verification_request_payload(verification_requests) from public, anon, authenticated;

-- The athlete-facing row: every column but the hash.
create or replace function verification_request_row(r verification_requests)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select to_jsonb(r) - 'token_hash';
$$;

revoke all on function verification_request_row(verification_requests) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Keeping achievements.verification in step
--
-- Both run as triggers so the 0015 guard sees them at depth > 1 and lets the
-- write through — the same path `apply_verification()` takes. A client can
-- not reach a nested trigger with values of its own choosing.
-- ---------------------------------------------------------------------------

create or replace function sync_entry_on_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    update achievements
       set verification = 'submitted', verified_at = null
     where id = new.achievement_id
       and verification <> 'submitted';
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'expired' then
    -- Revoked or superseded. Only the last open request takes the entry back
    -- to unverified; a re-request inserts its replacement right after.
    update achievements
       set verification = 'unverified', verified_at = null
     where id = new.achievement_id
       and verification = 'submitted'
       and not exists (select 1 from verification_requests o
                        where o.achievement_id = new.achievement_id
                          and o.status = 'pending'
                          and o.id <> new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists verification_requests_sync_entry on verification_requests;
create trigger verification_requests_sync_entry
  after insert or update of status on verification_requests
  for each row execute function sync_entry_on_request();

-- A substantive edit to a submitted entry (0015 resets it to unverified)
-- kills any link still out: the coach would be vouching for the old values.
create or replace function expire_requests_on_entry_reset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update verification_requests
     set status = 'expired'
   where achievement_id = new.id
     and status = 'pending';
  return null;
end;
$$;

drop trigger if exists achievements_expire_requests on achievements;
-- No `update of verification`: a column trigger fires only when the column is
-- in the statement's SET list, and here 0015's BEFORE trigger is what changes
-- it. The WHEN clause keeps every other update from paying for the call.
create trigger achievements_expire_requests
  after update on achievements
  for each row
  when (old.verification = 'submitted' and new.verification = 'unverified')
  execute function expire_requests_on_entry_reset();

-- ---------------------------------------------------------------------------
-- Error codes
--
-- Custom SQLSTATEs so the app can map a refusal to copy without parsing
-- message text. PostgREST passes them through as `error.code`.
--
--   RS403  not allowed (no session, or answering your own record)
--   RS404  no such request / entry / reference
--   RS409  already answered
--   RS410  expired, revoked, or superseded
--   RS429  daily request cap reached
--   22023  bad argument (invalid_parameter_value)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- create_verification_request — athlete only
-- ---------------------------------------------------------------------------

create or replace function create_verification_request(
  p_achievement   uuid,
  p_coach_contact uuid,
  p_token_hash    text,
  p_expires_at    timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  daily_cap constant integer := 10;  -- DAILY_REQUEST_CAP in src/lib/data/rules.ts
  max_ttl   constant interval := interval '30 days';
  sent      integer;
  expires   timestamptz;
  created   verification_requests;
begin
  if uid is null then
    raise exception 'sign in to request verification' using errcode = 'RS403';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'token hash must be 64 lowercase hex characters' using errcode = '22023';
  end if;

  if not exists (select 1 from achievements where id = p_achievement and profile_id = uid) then
    raise exception 'that entry was not found' using errcode = 'RS404';
  end if;
  if not exists (select 1 from coach_contacts where id = p_coach_contact and profile_id = uid) then
    raise exception 'that reference was not found' using errcode = 'RS404';
  end if;

  -- Serialize this athlete's requests so two tabs cannot both slip under the
  -- cap. The profile row is theirs; locking it blocks nobody else.
  perform 1 from profiles where id = uid for update;

  select count(*) into sent
    from verification_requests
   where profile_id = uid
     and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');
  if sent >= daily_cap then
    raise exception 'daily verification request limit (%) reached', daily_cap using errcode = 'RS429';
  end if;

  -- The caller proposes an expiry; it is clamped to the 30-day maximum.
  expires := least(coalesce(p_expires_at, now() + max_ttl), now() + max_ttl);
  if expires <= now() then
    raise exception 'expiry must be in the future' using errcode = '22023';
  end if;

  -- One live request per entry: a new link supersedes the old one.
  update verification_requests
     set status = 'expired'
   where achievement_id = p_achievement
     and status = 'pending';

  insert into verification_requests (token_hash, achievement_id, profile_id, coach_contact_id, expires_at)
  values (p_token_hash, p_achievement, uid, p_coach_contact, expires)
  returning * into created;

  return verification_request_row(created);
end;
$$;

-- ---------------------------------------------------------------------------
-- get_verification_request — anyone holding the link
--
-- Returns the payload for any status, so the page can say "already answered"
-- or "expired" rather than "not found". Null when the token matches nothing.
-- ---------------------------------------------------------------------------

create or replace function get_verification_request(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select verification_request_payload(r)
    from verification_requests r
   where r.token_hash = verification_token_hash(p_token);
$$;

-- ---------------------------------------------------------------------------
-- get_coach_batch_requests — the other entries waiting on the same coach
--
-- Siblings are other pending, unexpired requests from the SAME athlete to
-- the same coach contact (or a duplicate contact row with the same email).
-- Deliberately not matched by email across athletes: coach emails are typed
-- by athletes and unverified, so anyone could list "coach@school.org" and use
-- their own link to read — and answer — another athlete's pending entries.
-- ---------------------------------------------------------------------------

create or replace function get_coach_batch_requests(p_token text)
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select verification_request_payload(s)
    from verification_requests r
    join coach_contacts rc on rc.id = r.coach_contact_id
    join verification_requests s
      on s.profile_id = r.profile_id
     and s.id <> r.id
     and s.status = 'pending'
     and s.expires_at > now()
    join coach_contacts sc on sc.id = s.coach_contact_id
   where r.token_hash = verification_token_hash(p_token)
     and r.status <> 'expired'
     and r.expires_at > now()
     and (s.coach_contact_id = r.coach_contact_id
          or (rc.email is not null and sc.email = rc.email))
   order by s.created_at;
$$;

-- ---------------------------------------------------------------------------
-- respond_verification — the coach's answer
--
-- `p_request_id` answers a sibling from get_coach_batch_requests using this
-- link as the authority; null answers the link's own request. Either way the
-- target must be pending and unexpired, and the athlete's own session is
-- refused (#37) — the same rule as `canRespondToRequest` in rules.ts.
-- ---------------------------------------------------------------------------

create or replace function respond_verification(
  p_token         text,
  p_outcome       text,
  p_note          text,
  p_verifier_name text,
  p_verifier_role text,
  p_flag_unknown  boolean default false,
  p_request_id    uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  authority verification_requests;
  target    verification_requests;
  v_outcome text := case when coalesce(p_flag_unknown, false) then 'disputed' else p_outcome end;
  athlete   profiles;
  entry_title text;
begin
  if v_outcome is null or v_outcome not in ('verified', 'disputed') then
    raise exception 'outcome must be verified or disputed' using errcode = '22023';
  end if;
  if p_verifier_name is null or char_length(btrim(p_verifier_name)) < 2
     or char_length(p_verifier_name) > 80
     or char_length(coalesce(p_verifier_role, '')) > 80
     or char_length(coalesce(p_note, '')) > 500 then
    raise exception 'name, role, or note is out of range' using errcode = '22023';
  end if;

  select * into authority
    from verification_requests
   where token_hash = verification_token_hash(p_token)
   for update;
  if not found then
    raise exception 'that verification link is not valid' using errcode = 'RS404';
  end if;

  if p_request_id is null or p_request_id = authority.id then
    target := authority;
  else
    -- Answering a sibling: the link must itself still be live, and the
    -- sibling must be one get_coach_batch_requests would have listed.
    if authority.status = 'expired' or authority.expires_at <= now() then
      raise exception 'this link has expired' using errcode = 'RS410';
    end if;
    select s.* into target
      from verification_requests s
      join coach_contacts sc on sc.id = s.coach_contact_id
      join coach_contacts rc on rc.id = authority.coach_contact_id
     where s.id = p_request_id
       and s.profile_id = authority.profile_id
       and (s.coach_contact_id = authority.coach_contact_id
            or (rc.email is not null and sc.email = rc.email))
       for update of s;
    if not found then
      raise exception 'that verification request was not found' using errcode = 'RS404';
    end if;
  end if;

  if target.status = 'expired' then
    raise exception 'this link has expired' using errcode = 'RS410';
  end if;
  if target.status <> 'pending' then
    raise exception 'this link has already been used' using errcode = 'RS409';
  end if;
  if target.expires_at <= now() then
    raise exception 'this link has expired' using errcode = 'RS410';
  end if;
  if uid is not null and uid = target.profile_id then
    raise exception 'a record cannot verify itself' using errcode = 'RS403';
  end if;

  -- The decision. verifier_id only when the responder has a profile (the FK
  -- would refuse a bare auth user); apply_verification() (0007) copies the
  -- outcome onto the achievement.
  insert into verifications (achievement_id, verifier_id, verifier_kind, outcome, method,
                             note, verifier_name, verifier_role)
  values (target.achievement_id,
          (select id from profiles where id = uid),
          'coach', v_outcome::verification_state, 'coach_attestation',
          nullif(btrim(p_note), ''), btrim(p_verifier_name), nullif(btrim(p_verifier_role), ''));

  update verification_requests
     set status = v_outcome,
         note = nullif(btrim(p_note), ''),
         verifier_name = btrim(p_verifier_name),
         verifier_role = nullif(btrim(p_verifier_role), ''),
         flagged_unknown_athlete = coalesce(p_flag_unknown, false),
         responded_at = now()
   where id = target.id;

  select * into athlete from profiles where id = target.profile_id;
  select title into entry_title from achievements where id = target.achievement_id;

  -- contact_email is the address the athlete chose to publish; the auth email
  -- needs the service role and stays out of reach of a link holder.
  return jsonb_build_object(
    'request_id', target.id,
    'handle', athlete.handle,
    'display_name', athlete.display_name,
    'contact_email', athlete.contact_email,
    'entry_title', entry_title,
    'outcome', v_outcome,
    'flagged_unknown_athlete', coalesce(p_flag_unknown, false)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- revoke_verification_request — athlete only (#41)
-- ---------------------------------------------------------------------------

create or replace function revoke_verification_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  revoked verification_requests;
begin
  if uid is null then
    raise exception 'sign in to revoke a request' using errcode = 'RS403';
  end if;

  update verification_requests
     set status = 'expired'
   where id = p_request_id
     and profile_id = uid
     and status = 'pending'
  returning * into revoked;

  if not found then
    if exists (select 1 from verification_requests where id = p_request_id and profile_id = uid) then
      raise exception 'that request has already been answered or closed' using errcode = 'RS409';
    end if;
    raise exception 'that verification request was not found' using errcode = 'RS404';
  end if;

  return verification_request_row(revoked);
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute grants
--
-- Functions are executable by PUBLIC by default, and Supabase's default
-- privileges also grant anon and authenticated explicitly; start from nothing. The
-- token-taking functions are for anyone holding a link, signed in or not.
-- Creating and revoking need a session.
-- ---------------------------------------------------------------------------

revoke all on function create_verification_request(uuid, uuid, text, timestamptz) from public, anon;
revoke all on function get_verification_request(text) from public;
revoke all on function get_coach_batch_requests(text) from public;
revoke all on function respond_verification(text, text, text, text, text, boolean, uuid) from public;
revoke all on function revoke_verification_request(uuid) from public, anon;
revoke all on function sync_entry_on_request() from public, anon, authenticated;
revoke all on function expire_requests_on_entry_reset() from public, anon, authenticated;

grant execute on function create_verification_request(uuid, uuid, text, timestamptz) to authenticated;
grant execute on function revoke_verification_request(uuid) to authenticated;
grant execute on function get_verification_request(text) to anon, authenticated;
grant execute on function get_coach_batch_requests(text) to anon, authenticated;
grant execute on function respond_verification(text, text, text, text, text, boolean, uuid) to anon, authenticated;
