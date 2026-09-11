-- Apply only after reconciling the live schema with migrations 0001–0009.
-- Never rename an existing handle implicitly.
do $$ begin
  if exists(select 1 from profiles where handle = 'app') then
    raise exception 'Handle app is already owned. Resolve routing with its owner before applying this migration.';
  end if;
end $$;
insert into reserved_handles(handle) values ('app') on conflict do nothing;

create function protect_profile_authority() returns trigger language plpgsql set search_path=public as $$
begin
  if current_user not in ('postgres','service_role','supabase_admin') then
    if tg_op = 'INSERT' then
      if new.account_kind not in ('athlete','coach','recruiter') or new.entry_count <> 0 or new.verified_count <> 0 or new.identity_verified_at is not null or new.suspended_at is not null then raise exception 'Protected profile fields' using errcode='42501'; end if;
    elsif (new.id,new.account_kind,new.entry_count,new.verified_count,new.identity_verified_at,new.suspended_at) is distinct from (old.id,old.account_kind,old.entry_count,old.verified_count,old.identity_verified_at,old.suspended_at) then raise exception 'Protected profile fields' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_authority before insert or update on profiles for each row execute function protect_profile_authority();
-- A self-managed membership cannot grant coach/admin authority.
drop policy memberships_write_own on memberships;
create policy memberships_write_own on memberships for all using(profile_id=auth.uid() and role in ('athlete','captain')) with check(profile_id=auth.uid() and role in ('athlete','captain'));
-- Preserve membership verification history from 0008 while preventing
-- callers from forging verification through an owner or peer-update policy.
create function protect_membership_authority() returns trigger
language plpgsql set search_path=public as $$
begin
  if current_user not in ('postgres','service_role','supabase_admin') then
    if tg_op='INSERT' then
      if to_jsonb(new)->>'verified_at' is not null or to_jsonb(new)->>'verified_by' is not null then
        raise exception 'Protected membership verification fields' using errcode='42501';
      end if;
    elsif (new.id,new.profile_id,new.org_id,new.role) is distinct from (old.id,old.profile_id,old.org_id,old.role)
       or (to_jsonb(new)->'verified_at') is distinct from (to_jsonb(old)->'verified_at')
       or (to_jsonb(new)->'verified_by') is distinct from (to_jsonb(old)->'verified_by') then
      raise exception 'Protected membership authority fields' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
create trigger memberships_authority before insert or update on memberships
for each row execute function protect_membership_authority();
-- The legacy guard still limits a peer to verification-only edits. Run it as
-- the caller so trusted maintenance can bypass that restriction regardless of
-- a retained JWT; the authority trigger above protects verification for every
-- untrusted caller. Keep the historical guard's remaining rules unchanged.
create or replace function guard_membership_verify_only()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('postgres','service_role','supabase_admin') then return new; end if;
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

-- Historical self-claimed coach/staff/admin memberships remain in place, but
-- only verified current coaching relationships grant access to reviewer
-- evidence or permission to endorse an athlete. Email-bound invitations below
-- have their own authorization and do not rely on this helper.
create or replace function coaches_athlete(target uuid)
returns boolean language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from memberships coach
    join memberships athlete on athlete.org_id=coach.org_id
    where coach.profile_id=auth.uid()
      and coach.role in ('coach','staff','admin')
      and coach.verified_at is not null
      and coach.ended_on is null
      and athlete.profile_id=target
      and athlete.role in ('athlete','captain')
      and athlete.ended_on is null
  );
$$;
-- All coach attestation writes use the identity-bound RPC below.
drop policy verifications_insert on verifications;

alter table achievements add column revision bigint not null default 1;
create table verification_requests (
 id uuid primary key default gen_random_uuid(), token_hash text unique not null check(length(token_hash)=64),
 achievement_id uuid not null references achievements on delete cascade,
 profile_id uuid not null references profiles on delete cascade,
 coach_contact_id uuid not null references coach_contacts on delete cascade,
 recipient_email citext not null, achievement_revision bigint not null,
 status text not null default 'pending' check(status in ('pending','verified','disputed','expired')),
 note text, verifier_name text, verifier_role text,
 created_at timestamptz not null default now(), responded_at timestamptz,
 expires_at timestamptz not null default now()+interval '30 days',
 check(expires_at <= created_at+interval '30 days')
);
alter table verification_requests enable row level security;
create policy verification_requests_owner on verification_requests for select using(profile_id=auth.uid());
create index verification_requests_recipient on verification_requests(recipient_email,created_at desc);

create function protect_claim() returns trigger language plpgsql set search_path=public as $$
begin
 if current_user not in ('postgres','service_role','supabase_admin') then
  if tg_op='INSERT' then
   if new.verification <> 'unverified' or new.verified_at is not null or new.revision <> 1 then raise exception 'Protected verification fields' using errcode='42501'; end if;
  elsif (new.verification,new.verified_at,new.revision,new.profile_id) is distinct from (old.verification,old.verified_at,old.revision,old.profile_id) then raise exception 'Protected verification fields' using errcode='42501'; end if;
 end if;
 if tg_op='UPDATE' and (to_jsonb(new)-array['is_pinned','updated_at','verification','verified_at','revision']) is distinct from (to_jsonb(old)-array['is_pinned','updated_at','verification','verified_at','revision']) then
  new.revision=old.revision+1; new.verification='unverified'; new.verified_at=null;
 end if;
 return new;
end $$;
create trigger achievements_claim_guard before insert or update on achievements for each row execute function protect_claim();
create function invalidate_claim_requests() returns trigger language plpgsql security definer set search_path=public as $$
begin if new.revision <> old.revision then update verification_requests set status='expired' where achievement_id=new.id and status='pending'; end if; return null; end $$;
create trigger achievements_invalidate_requests after update on achievements for each row execute function invalidate_claim_requests();

create function handle_available(candidate text) returns boolean language sql stable security definer set search_path=public as $$
 select candidate ~ '^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$' and not exists(select 1 from profiles where handle=candidate) and not exists(select 1 from reserved_handles where handle=candidate);
$$;
create function feature_film(clip uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from profiles where id=auth.uid() for update;
 if not exists(select 1 from film_clips where id=clip and profile_id=auth.uid()) then raise exception 'Clip not found' using errcode='P0002'; end if;
 update film_clips set is_featured=false where profile_id=auth.uid() and is_featured;
 update film_clips set is_featured=true where id=clip;
end $$;
create function create_verification_request(achievement uuid,coach uuid,token_digest text) returns jsonb language plpgsql security definer set search_path=public as $$
declare a achievements; c coach_contacts; r verification_requests;
begin
 select * into a from achievements where id=achievement and profile_id=auth.uid() for update;
 if not found then raise exception 'Entry not found' using errcode='42501'; end if;
 select * into c from coach_contacts where id=coach and profile_id=auth.uid();
 if not found or c.email is null then raise exception 'Add the coach email before requesting verification' using errcode='22023'; end if;
 if exists(select 1 from auth.users where id=auth.uid() and email::citext=c.email) then raise exception 'Cannot verify your own entry' using errcode='42501'; end if;
 update verification_requests set status='expired' where achievement_id=achievement and status='pending';
 insert into verification_requests(token_hash,achievement_id,profile_id,coach_contact_id,recipient_email,achievement_revision)
 values(token_digest,achievement,auth.uid(),coach,c.email,a.revision) returning * into r;
 update achievements set verification='submitted',verified_at=null where id=achievement;
 return to_jsonb(r)-'token_hash';
end $$;
create function verification_request_detail(token_digest text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r verification_requests; a jsonb; p jsonb; c jsonb;
begin
 select * into r from verification_requests where token_hash=token_digest or id::text=token_digest;
 if not found then return null; end if;
 if r.profile_id <> auth.uid() and not exists(select 1 from auth.users u join profiles p on p.id=u.id where u.id=auth.uid() and u.email_confirmed_at is not null and u.email::citext=r.recipient_email and p.account_kind='coach') then raise exception 'Sign in with the invited coach confirmed email' using errcode='42501'; end if;
 select to_jsonb(e) into a from record_entries e where id=r.achievement_id;
 select jsonb_build_object('id',e.id,'handle',e.handle,'display_name',e.display_name) into p from profiles e where id=r.profile_id;
 select jsonb_build_object('id',e.id,'name',e.name,'role',e.role) into c from coach_contacts e where id=r.coach_contact_id;
 return (to_jsonb(r)-'token_hash') || jsonb_build_object('entry',a,'athlete',p,'coach',c);
end $$;
create function respond_verification_request(token_digest text,decision text,response_note text) returns void language plpgsql security definer set search_path=public as $$
declare r verification_requests; a achievements; coach profiles;
begin
 if decision not in ('verified','disputed') or length(response_note)>500 then raise exception 'Invalid response' using errcode='22023'; end if;
 select * into r from verification_requests where token_hash=token_digest or id::text=token_digest;
 if not found then raise exception 'Request not found' using errcode='22023'; end if;
 -- Claim edits and new invitations lock the achievement first. Match that order.
 select * into a from achievements where id=r.achievement_id for update;
 select * into r from verification_requests where id=r.id for update;
 if auth.uid() is null or auth.uid()=r.profile_id or not exists(select 1 from auth.users u join profiles p on p.id=u.id where u.id=auth.uid() and u.email_confirmed_at is not null and u.email::citext=r.recipient_email and p.account_kind='coach' and p.suspended_at is null) then raise exception 'Use the invited coach confirmed account' using errcode='42501'; end if;
 if r.status <> 'pending' or r.expires_at<=now() or r.achievement_revision<>a.revision then raise exception 'Request completed, expired, or entry changed' using errcode='22023'; end if;
 select * into coach from profiles where id=auth.uid();
 insert into verifications(achievement_id,verifier_id,verifier_kind,outcome,method,note) values(a.id,auth.uid(),'coach',decision::verification_state,'coach_attestation',response_note);
 update verification_requests set status=decision,note=response_note,verifier_name=coach.display_name,verifier_role='Coach',responded_at=now() where id=r.id;
end $$;
create function coach_verification_requests() returns setof verification_requests language sql stable security definer set search_path=public as $$
 select r.* from verification_requests r join auth.users u on u.email::citext=r.recipient_email join profiles p on p.id=u.id where u.id=auth.uid() and u.email_confirmed_at is not null and p.account_kind='coach' order by r.created_at desc;
$$;
revoke all on function feature_film(uuid),create_verification_request(uuid,uuid,text),verification_request_detail(text),respond_verification_request(text,text,text),coach_verification_requests() from public;
grant execute on function feature_film(uuid),create_verification_request(uuid,uuid,text),verification_request_detail(text),respond_verification_request(text,text,text),coach_verification_requests() to authenticated;


-- An athlete may hide a received endorsement, but may never rewrite its author or content.
create function protect_endorsement_recipient() returns trigger language plpgsql set search_path=public as $$
begin
 if current_user not in ('postgres','service_role','supabase_admin') and old.profile_id=auth.uid() and old.endorser_id<>auth.uid() then
  if (to_jsonb(new)-'is_visible') is distinct from (to_jsonb(old)-'is_visible') then
   raise exception 'Recipients may only change endorsement visibility' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
create trigger coach_endorsements_recipient_guard before update on coach_endorsements for each row execute function protect_endorsement_recipient();
-- Owners and authors must still see a hidden row to update it under RLS.
drop policy coach_endorsements_select on coach_endorsements;
create policy coach_endorsements_select on coach_endorsements for select using (
 profile_id=auth.uid() or endorser_id=auth.uid() or (is_visible and can_view_profile(profile_id))
);
