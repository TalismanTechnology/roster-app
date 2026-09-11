-- Behavioral tests for the Roster schema.
-- Runs as `authenticated` / `anon` with a simulated JWT so RLS is actually
-- exercised; as the table owner, postgres bypasses RLS and would prove nothing.

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- A permissive peer policy must not bypass the authority trigger. Its identity
-- predicate stands in for the legacy helper without needing that helper here.
create policy memberships_legacy_peer_test on memberships for update
  using (auth.uid()='00000000-0000-0000-0000-000000000003'::uuid)
  with check (auth.uid()='00000000-0000-0000-0000-000000000003'::uuid);

-- --- Seed (as owner, RLS bypassed) ----------------------------------------
insert into sports (slug, name, category, is_timed) values
  ('track_field', 'Track & Field', 'track_field', true),
  ('basketball',  'Basketball',    'team_ball',   false)
on conflict (slug) do nothing;

insert into sport_events (sport_slug, slug, name, unit, direction) values
  ('track_field', '100m', '100 Meters', 's', 'lower_is_better');

insert into organizations (id, slug, name, kind, level) values
  ('00000000-0000-0000-0000-0000000000aa', 'east-high', 'East High School', 'school', 'high_school');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'ava@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'ben@example.com'),
  ('00000000-0000-0000-0000-000000000003', 'coach@example.com'),
  ('00000000-0000-0000-0000-000000000004', 'stranger@example.com'),
  ('00000000-0000-0000-0000-000000000005', 'cleo@example.com');

-- ava      public, recruitable   — the ordinary case
-- ben      private              — opted out entirely
-- cleo     unlisted             — link-only
insert into profiles (id, handle, display_name, account_kind, level, primary_sport,
                      visibility, grad_year, region, positions, is_recruitable)
values
  ('00000000-0000-0000-0000-000000000001', 'ava', 'Ava Reyes', 'athlete',
   'high_school', 'track_field', 'public',   2027, 'MI', '{"sprinter"}', true),
  ('00000000-0000-0000-0000-000000000002', 'ben', 'Ben Osei',  'athlete',
   'high_school', 'track_field', 'private',  2027, 'MI', '{}', true),
  ('00000000-0000-0000-0000-000000000003', 'coach_k', 'Coach Kim', 'coach',
   null, null, 'public', null, null, '{}', false),
  ('00000000-0000-0000-0000-000000000004', 'stranger', 'Stranger', 'athlete',
   'club', 'basketball', 'public', 2026, 'OH', '{"guard"}', true),
  ('00000000-0000-0000-0000-000000000005', 'cleo', 'Cleo Nakamura', 'athlete',
   'high_school', 'track_field', 'unlisted', 2027, 'MI', '{"sprinter"}', true);

insert into memberships (profile_id, org_id, role, sport, started_on) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000aa', 'athlete', 'track_field', '2024-08-01'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000aa', 'coach',   'track_field', '2020-08-01');
-- The historical coaching fixture is a trusted, verified membership.
update memberships set verified_at='2026-01-01T00:00:00Z',
  verified_by='00000000-0000-0000-0000-000000000003'
where profile_id='00000000-0000-0000-0000-000000000003';

insert into achievements (id, profile_id, kind, title, sport, achieved_on, value_numeric, value_display, unit)
values ('00000000-0000-0000-0000-0000000000e1',
        '00000000-0000-0000-0000-000000000001', 'personal_record',
        '100m Personal Best', 'track_field', '2026-05-04', 10.42, '10.42', 's');

grant usage on schema public, auth to authenticated, anon;
-- Simulate platform grants without undoing migration 0012's profile ACLs.
grant insert, update, delete on all tables in schema public to authenticated;
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='public' and tablename <> 'profiles' loop
    execute format('grant select on public.%I to anon, authenticated', t.tablename);
  end loop;
end $$;
grant select on public.record_entries to anon, authenticated;
grant execute on all functions in schema auth to authenticated, anon;

-- Helpers: become a given user, or nobody.
create or replace function become(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
end $$;

create or replace function become_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ===========================================================================
do $$
declare
  ava       uuid := '00000000-0000-0000-0000-000000000001';
  ben       uuid := '00000000-0000-0000-0000-000000000002';
  coach     uuid := '00000000-0000-0000-0000-000000000003';
  stranger  uuid := '00000000-0000-0000-0000-000000000004';
  cleo      uuid := '00000000-0000-0000-0000-000000000005';
  ach       uuid := '00000000-0000-0000-0000-0000000000e1';
  clip      uuid;
  invitation_coach uuid;
  projection jsonb;
  membership_id uuid;
  candidate_field text;
  n         integer;
  txt       text;
begin
  set local role authenticated;

  -- 1. a public resume is readable by a signed-out recruiter ----------------
  set local role anon;
  perform become_anon();
  select count(*) into n from profiles where id = ava;
  assert n = 1, '1: a public resume must be readable while signed out';

  -- 2. a private resume is hidden, signed out or in -------------------------
  select count(*) into n from profiles where id = ben;
  assert n = 0, '2: a private resume must be hidden from the public';

  set local role authenticated;
  perform become(stranger);
  select count(*) into n from profiles where id = ben;
  assert n = 0, '2b: a private resume must be hidden from other members';

  -- 3. an unlisted resume opens by direct link ------------------------------
  set local role anon;
  perform become_anon();
  select count(*) into n from profiles where id = cleo;
  assert n = 1, '3: an unlisted resume must open for anyone holding the link';

  -- 4. ...but is absent from discovery --------------------------------------
  select count(*) into n from search_athletes() where id = cleo;
  assert n = 0, '4: an unlisted resume must not appear in search';

  select count(*) into n from search_athletes() where id = ava;
  assert n = 1, '4b: a public resume must appear in search';

  -- 5. the record inherits resume visibility --------------------------------
  select count(*) into n from achievements where profile_id = ava;
  assert n = 1, '5: achievements should inherit the owner''s visibility';

  -- 6. evidence is NOT public even when the achievement is ------------------
  set local role authenticated;
  perform become(ava);
  insert into achievement_evidence (achievement_id, kind, url, submitted_by)
  values (ach, 'results_url', 'https://athletic.net/result/123', ava);

  perform become(stranger);
  select count(*) into n from achievement_evidence where achievement_id = ach;
  assert n = 0, '6: evidence must not be visible to the general audience';

  -- 7. the athlete's coach CAN see the evidence -----------------------------
  perform become(coach);
  select count(*) into n from achievement_evidence where achievement_id = ach;
  assert n = 1, '7: the athlete''s coach should see submitted evidence';

  -- 8. an athlete cannot verify their own record ----------------------------
  perform become(ava);
  begin
    insert into verifications (achievement_id, verifier_id, verifier_kind, outcome)
    values (ach, ava, 'coach', 'verified');
    assert false, '8: an athlete must not be able to verify their own record';
  exception when insufficient_privilege or check_violation then
    null;  -- expected
  end;

  -- 9. only an invited confirmed coach can verify through the atomic RPC.
  set local role postgres;
  update auth.users set email_confirmed_at=now() where id=coach;
  set local role authenticated;
  perform become(ava);
  insert into coach_contacts(profile_id,name,email) values(ava,'Coach Kim','coach@example.com') returning id into invitation_coach;
  perform create_verification_request(ach,invitation_coach,repeat('a',64));
  perform become(stranger);
  begin
    perform respond_verification_request(repeat('a',64),'verified',null);
    assert false, '9a: wrong account must not verify';
  exception when insufficient_privilege then null;
  end;
  perform become(coach);
  projection := verification_request_detail(repeat('a',64));
  assert projection->'athlete' ? 'display_name', '9b: coach needs athlete identity';
  assert not (projection->'athlete' ?| array['gpa','contact_email','phone','sat_score','ncaa_id']), '9c: invitation must not expose private profile fields';
  perform respond_verification_request(repeat('a',64),'verified','Witnessed');
  begin
    perform respond_verification_request(repeat('a',64),'verified',null);
    assert false, '9d: completed request must not replay';
  exception when invalid_parameter_value then null;
  end;
  perform become(ava);
  delete from coach_contacts where id=invitation_coach;

  set local role postgres;
  select verification::text into txt from achievements where id = ach;
  assert txt = 'verified', '9: achievement.verification should sync to verified, got ' || txt;

  -- 10. the denormalized counters follow the record -------------------------
  select entry_count into n from profiles where id = ava;
  assert n = 1, '10a: entry_count should be 1, got ' || n;
  select verified_count into n from profiles where id = ava;
  assert n = 1, '10b: verified_count should be 1 after verification, got ' || n;
  set local role authenticated;

  perform become(ava);
  insert into achievements (profile_id, kind, title, achieved_on)
  values (ava, 'award', 'All-Conference', '2026-06-01');

  set local role postgres;
  select entry_count into n from profiles where id = ava;
  assert n = 2, '10c: entry_count should be 2, got ' || n;
  select verified_count into n from profiles where id = ava;
  assert n = 1, '10d: an unverified entry must not raise verified_count, got ' || n;
  set local role authenticated;

  perform become(ava);
  delete from achievements where profile_id = ava and title = 'All-Conference';

  set local role postgres;
  select entry_count into n from profiles where id = ava;
  assert n = 1, '10e: entry_count should fall back to 1 on delete, got ' || n;
  set local role authenticated;

  -- 11. verified_only search uses those counters ----------------------------
  set local role anon;
  perform become_anon();
  select count(*) into n from search_athletes(verified_only => true);
  assert n = 1, '11a: only the verified athlete should match, got ' || n;
  select count(*) into n from search_athletes(verified_only => true) where id = ava;
  assert n = 1, '11b: the verified athlete should be the one returned';

  -- 12. search filters ------------------------------------------------------
  select count(*) into n from search_athletes(sport => 'basketball');
  assert n = 1, '12a: sport filter should return one athlete, got ' || n;
  select count(*) into n from search_athletes(grad_years => array[2026]::smallint[]);
  assert n = 1, '12b: grad year filter should return one athlete, got ' || n;
  select count(*) into n from search_athletes(regions => array['MI']::char(2)[]);
  assert n = 1, '12c: region filter should exclude the unlisted MI athlete, got ' || n;
  select count(*) into n from search_athletes(athlete_positions => array['guard']);
  assert n = 1, '12d: position filter should return one athlete, got ' || n;

  -- 13. fuzzy name search tolerates a misspelling ---------------------------
  select count(*) into n from search_athletes(q => 'Ava Reyez') where id = ava;
  assert n = 1, '13: a near-miss spelling should still find the athlete';

  -- 14. coach contact details are gated ------------------------------------
  set local role authenticated;
  perform become(cleo);
  insert into coach_contacts (profile_id, name, role, phone)
  values (cleo, 'Coach Diaz', 'Head Coach', '555-0100');

  perform become(ava);
  insert into coach_contacts (profile_id, name, role, phone)
  values (ava, 'Coach Kim', 'Head Coach', '555-0199');

  set local role anon;
  perform become_anon();
  select count(*) into n from coach_contacts where profile_id = cleo;
  assert n = 0, '14a: an unlisted resume must not expose a coach phone number';

  select count(*) into n from coach_contacts where profile_id = ava;
  assert n = 1, '14b: a public, recruitable resume should show its coach contact';

  -- 15. closing recruiting withdraws the contact ---------------------------
  set local role authenticated;
  perform become(ava);
  update profiles set is_recruitable = false where id = ava;

  set local role anon;
  perform become_anon();
  select count(*) into n from coach_contacts where profile_id = ava;
  assert n = 0, '15: closing recruiting must withdraw the coach contact';

  set local role authenticated;
  perform become(ava);
  update profiles set is_recruitable = true where id = ava;

  -- 16. film: one featured clip per athlete --------------------------------
  insert into film_clips (profile_id, title, url, is_featured)
  values (ava, 'Junior season', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', true)
  returning id into clip;

  begin
    insert into film_clips (profile_id, title, url, is_featured)
    values (ava, 'State final', 'https://vimeo.com/76979871', true);
    assert false, '16: a second featured clip must be refused';
  exception when unique_violation then
    null;  -- expected
  end;

  -- 17. film provider and id are parsed on write ---------------------------
  set local role postgres;
  select provider into txt from film_clips where id = clip;
  assert txt = 'youtube', '17a: provider should be youtube, got ' || coalesce(txt, 'null');
  select external_id into txt from film_clips where id = clip;
  assert txt = 'dQw4w9WgXcQ', '17b: youtube id should be parsed, got ' || coalesce(txt, 'null');
  set local role authenticated;

  -- 18. an unrecognised host stays an honest outbound link -----------------
  perform become(ava);
  insert into film_clips (profile_id, title, url)
  values (ava, 'Raw footage', 'https://example.com/clip.mp4')
  returning id into clip;

  set local role postgres;
  select provider into txt from film_clips where id = clip;
  assert txt is null, '18: an unknown host must not be given a provider';
  set local role authenticated;

  -- 19. film urls must be web urls -----------------------------------------
  perform become(ava);
  begin
    insert into film_clips (profile_id, title, url)
    values (ava, 'Bad', 'javascript:alert(1)');
    assert false, '19: a non-http film url must be rejected';
  exception when check_violation then
    null;  -- expected
  end;

  -- 20. a signed-out view is counted ---------------------------------------
  set local role anon;
  perform become_anon();
  perform record_profile_view(ava);
  perform record_profile_view(ava);

  set local role postgres;
  select view_count into n from profile_views
   where profile_id = ava and viewer_id is null;
  assert n = 2, '20a: anonymous views should coalesce into one daily row, got ' || n;
  select count(*) into n from profile_views where profile_id = ava;
  assert n = 1, '20b: should be exactly one profile_views row, got ' || n;
  set local role authenticated;

  -- 21. self-views are not counted -----------------------------------------
  perform become(ava);
  perform record_profile_view(ava);
  set local role postgres;
  select count(*) into n from profile_views where profile_id = ava and viewer_id = ava;
  assert n = 0, '21: a self-view must not be recorded';
  set local role authenticated;

  -- 22. the viewer cannot read someone else's view log ---------------------
  perform become(stranger);
  perform record_profile_view(ava);
  select count(*) into n from profile_views where profile_id = ava and viewer_id is distinct from stranger;
  assert n = 0, '22: a viewer must not read another viewer''s rows';

  -- 23. a user cannot edit another athlete's record ------------------------
  update achievements set title = 'tampered' where id = ach;
  set local role postgres;
  select title into txt from achievements where id = ach;
  assert txt = '100m Personal Best', '23: record must not be editable by others, got ' || txt;
  set local role authenticated;

  -- 24. a user cannot forge film on someone else's resume ------------------
  perform become(stranger);
  begin
    insert into film_clips (profile_id, title, url)
    values (ava, 'forged', 'https://youtu.be/dQw4w9WgXcQ');
    assert false, '24: must not be able to add film to another athlete''s resume';
  exception when insufficient_privilege then
    null;  -- expected
  end;

  -- 25. future-dated achievements are rejected -----------------------------
  perform become(ava);
  begin
    insert into achievements (profile_id, kind, title, achieved_on)
    values (ava, 'award', 'Time traveler', current_date + 1);
    assert false, '25: achievements must not be dated in the future';
  exception when check_violation then
    null;  -- expected
  end;

  -- 26. handle format is enforced ------------------------------------------
  set local role postgres;
  begin
    insert into auth.users (id, email) values
      ('00000000-0000-0000-0000-0000000000ff', 'bad@example.com');
    insert into profiles (id, handle, display_name, account_kind, level)
    values ('00000000-0000-0000-0000-0000000000ff', 'Bad Handle!', 'Bad', 'athlete', 'club');
    assert false, '26: invalid handles must be rejected';
  exception when check_violation then
    null;  -- expected
  end;

  -- 27. a handle that collides with an app route is refused ----------------
  begin
    insert into auth.users (id, email) values
      ('00000000-0000-0000-0000-0000000000fe', 'route@example.com');
    insert into profiles (id, handle, display_name, account_kind, level)
    values ('00000000-0000-0000-0000-0000000000fe', 'search', 'Route Squatter', 'athlete', 'club');
    assert false, '27: a reserved handle must be rejected';
  exception when check_violation then
    null;  -- expected
  end;

  -- 28. academic fields are sanity-checked ---------------------------------
  begin
    update profiles set sat_score = 2400 where id = ava;
    assert false, '28: an out-of-range SAT score must be rejected';
  exception when check_violation then
    null;  -- expected
  end;

  -- 29. Endorsement recipients may hide, but cannot rewrite attribution/content.
  set local role postgres;
  insert into coach_endorsements(profile_id,endorser_id,body) values(ava,coach,'Original coach endorsement');
  set local role authenticated;
  perform become(ava);
  begin
    update coach_endorsements set body='Forged endorsement' where profile_id=ava;
    assert false, '29a: recipient must not rewrite endorsement content';
  exception when insufficient_privilege then null;
  end;
  begin
    update coach_endorsements set endorser_id=stranger where profile_id=ava;
    assert false, '29b: recipient must not rewrite endorsement attribution';
  exception when insufficient_privilege then null;
  end;
  update coach_endorsements set is_visible=false where profile_id=ava;
  set local role postgres;
  assert exists(select 1 from coach_endorsements where profile_id=ava and body='Original coach endorsement' and not is_visible), '29c: recipient may hide the original endorsement';

  -- 30. Contact privacy is enforced below REST, including RPC and search.
  set local role authenticated;
  perform become(ava);
  update profiles set title='Sprinter', contact_email='recruiting@example.com', phone='555-0123', is_recruitable=false where id=ava;
  select to_jsonb(p) into projection from get_profile(target_id => ava) p;
  assert projection->>'contact_email' = 'recruiting@example.com' and projection->>'phone' = '555-0123', '30a: owner must read and update their own contact values';

  set local role anon;
  perform become_anon();
  begin
    perform contact_email from profiles where id=ava;
    assert false, '30b: direct contact email selection must be denied';
  exception when insufficient_privilege then null; end;
  begin
    perform id from profiles where phone='555-0123';
    assert false, '30c: contact filters must not reveal values';
  exception when insufficient_privilege then null; end;
  select to_jsonb(p) into projection from get_profile(target_handle => 'AVA') p;
  assert (select title from profiles where id=ava) = 'Sprinter', '30d: historical public title remains directly readable';
  assert projection->>'display_name' = 'Ava Reyes' and projection->>'contact_email' is null and projection->>'phone' is null, '30d: public resume remains readable with masked contacts';
  select to_jsonb(p) into projection from search_athletes(q => 'Ava') p where id=ava;
  assert projection is not null and projection->>'contact_email' is null and projection->>'phone' is null, '30e: discovery must mask opted-out contacts';
  assert not exists(select 1 from get_profile(target_id => ben)), '30f: private profile stays hidden through RPC';
  assert not exists(select 1 from get_profile()), '30g: empty lookup must not enumerate profiles';

  set local role authenticated;
  perform become(stranger);
  begin
    perform phone from profiles where id=ava;
    assert false, '30h: signed-in users cannot bypass contact masking';
  exception when insufficient_privilege then null; end;
  select to_jsonb(p) into projection from get_profile(target_id => ava) p;
  assert projection->>'contact_email' is null and projection->>'phone' is null, '30i: other members receive masked contacts';
  update profiles set contact_email='forged@example.com' where id=ava;
  perform become(ava);
  select to_jsonb(p) into projection from get_profile(target_id => ava) p;
  assert projection->>'contact_email' = 'recruiting@example.com', '30j: other users cannot update contact values';
  update profiles set is_recruitable=true where id=ava;
  set local role anon;
  perform become_anon();
  select to_jsonb(p) into projection from get_profile(target_id => ava) p;
  assert projection->>'contact_email' = 'recruiting@example.com' and projection->>'phone' = '555-0123', '30k: recruiting opt-in exposes contact through authorized projection';
  select to_jsonb(p) into projection from search_athletes(q => 'Ava') p where id=ava;
  assert projection->>'contact_email' = 'recruiting@example.com', '30l: discovery respects recruiting opt-in';
  set local role authenticated;
  perform become(ava);
  update profiles set visibility='unlisted' where id=ava;
  select to_jsonb(p) into projection from get_profile(target_id => ava) p;
  assert projection->>'contact_email' = 'recruiting@example.com', '30m: unlisted owner retains contact access';
  set local role anon;
  perform become_anon();
  select to_jsonb(p) into projection from get_profile(target_handle => 'ava') p;
  assert (select title from profiles where id=ava) = 'Sprinter', '30d: historical public title remains directly readable';
  assert projection->>'display_name' = 'Ava Reyes' and projection->>'contact_email' is null and projection->>'phone' is null, '30n: unlisted opt-in resumes must mask contacts for visitors';
  set local role authenticated;
  perform become(stranger);
  select to_jsonb(p) into projection from get_profile(target_id => ava) p;
  assert projection->>'contact_email' is null and projection->>'phone' is null, '30o: unlisted contacts stay hidden from other members';
  perform become(ava);
  update profiles set visibility='public' where id=ava;
  perform become(ben);
  update profiles set phone='555-0124', is_recruitable=false where id=ben;
  select to_jsonb(p) into projection from get_profile(target_id => ben) p;
  assert projection->>'phone' = '555-0124', '30p: private owners retain contact access';
  set local role postgres;
  update profiles set account_kind='staff' where id=coach;
  set local role authenticated;
  perform become(coach);
  select to_jsonb(p) into projection from get_profile(target_id => ben) p;
  assert projection->>'phone' = '555-0124', '30q: staff retain private contact access';
  set local role postgres;
  update profiles set account_kind='coach' where id=coach;

  -- 31. Legacy membership verification and peer policies cannot forge authority.
  select id into membership_id from memberships where profile_id=ava;
  perform become(ava); -- Trusted maintenance must work even with an owner JWT.
  update memberships set verified_at='2026-01-01T00:00:00Z', verified_by=coach where id=membership_id;
  set local role authenticated;
  perform become(ava);
  update memberships set jersey='12', sport='basketball', ended_on='2026-06-01' where id=membership_id;
  assert exists(select 1 from memberships where id=membership_id and jersey='12' and sport='basketball' and ended_on='2026-06-01' and verified_by=coach and verified_at='2026-01-01T00:00:00Z'), '31a: ordinary owner edits preserve existing verification history';
  begin
    insert into memberships(profile_id,org_id,role,started_on,verified_at)
    values(ava,'00000000-0000-0000-0000-0000000000aa','athlete','2025-01-01',now());
    assert false, '31b: owners cannot insert verified membership timestamps';
  exception when insufficient_privilege then null; end;
  begin
    insert into memberships(profile_id,org_id,role,started_on,verified_by)
    values(ava,'00000000-0000-0000-0000-0000000000aa','athlete','2025-01-01',coach);
    assert false, '31c: owners cannot insert membership verifiers';
  exception when insufficient_privilege then null; end;
  begin
    update memberships set verified_at=null where id=membership_id;
    assert false, '31d: owners cannot erase existing verification';
  exception when insufficient_privilege then null; end;
  begin
    update memberships set verified_by=ava where id=membership_id;
    assert false, '31e: owners cannot change verifier attribution';
  exception when insufficient_privilege then null; end;
  perform become(coach);
  begin
    update memberships set verified_at=now() where id=membership_id;
    assert false, '31f: legacy peer policy cannot grant verification writes';
  exception when insufficient_privilege then null; end;
  -- Exercise every authority-context column through a permissive peer policy.
  foreach candidate_field in array array['id','profile_id','org_id','role'] loop
    begin
      execute format('update memberships set %I=%L where id=%L', candidate_field,
        case when candidate_field='role' then 'coach' else stranger::text end, membership_id);
      assert false, '31g: legacy peer policy cannot rewrite membership ' || candidate_field;
    exception when insufficient_privilege then null; end;
  end loop;
  set local role postgres;
  assert exists(select 1 from memberships where id=membership_id and profile_id=ava and role='athlete' and verified_by=coach and verified_at='2026-01-01T00:00:00Z'), '31h: rejected writes preserve historical identity and attestation';
  drop policy memberships_legacy_peer_test on memberships;

  -- 32. Old self-claimed coaching roles cannot grant reviewer authority.
  update memberships set ended_on=null where profile_id=ava;
  insert into memberships(profile_id,org_id,role,started_on)
    values(stranger,'00000000-0000-0000-0000-0000000000aa','coach','2025-01-01');
  set local role authenticated;
  perform become(stranger);
  assert not coaches_athlete(ava), '32a: unverified legacy coach claim has no authority';
  select count(*) into n from achievement_evidence where achievement_id=ach;
  assert n=0, '32b: unverified coach cannot read private reviewer evidence';
  begin
    insert into coach_endorsements(profile_id,endorser_id,body) values(ava,stranger,'Forged coaching relationship');
    assert false, '32c: unverified coach cannot endorse';
  exception when insufficient_privilege then null; end;
  set local role postgres;
  update memberships set verified_at=now(), verified_by=coach where profile_id=stranger;
  set local role authenticated;
  assert coaches_athlete(ava), '32d: trusted verification enables current coach authority';
  select count(*) into n from achievement_evidence where achievement_id=ach;
  assert n=1, '32e: verified current coach can review evidence';
  insert into coach_endorsements(profile_id,endorser_id,body) values(ava,stranger,'Verified coaching relationship');
  delete from coach_endorsements where profile_id=ava and endorser_id=stranger;
  set local role postgres;
  update memberships set ended_on='2026-06-01' where profile_id=stranger;
  set local role authenticated;
  assert not coaches_athlete(ava), '32f: ended coaching membership withdraws authority';
  select count(*) into n from achievement_evidence where achievement_id=ach;
  assert n=0, '32g: former coach loses private evidence access';
  set local role postgres;
  update memberships set ended_on=null where profile_id=stranger;
  update memberships set ended_on='2026-06-01' where profile_id=ava;
  set local role authenticated;
  assert not coaches_athlete(ava), '32h: ended athlete membership withdraws the coaching relationship';
  set local role postgres;
  update memberships set ended_on=null where profile_id=ava;

  raise notice 'ALL 32 CHECKS PASSED';
end $$;
