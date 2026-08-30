-- Behavioral tests for the Roster schema.
-- Runs as `authenticated` / `anon` with a simulated JWT so RLS is actually
-- exercised; as the table owner, postgres bypasses RLS and would prove nothing.

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- --- Seed (as owner, RLS bypassed) ----------------------------------------
insert into sports (slug, name, category, is_timed) values
  ('track_field', 'Track & Field', 'track_field', true),
  ('basketball',  'Basketball',    'team_ball',   false);

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

insert into achievements (id, profile_id, kind, title, sport, achieved_on, value_numeric, value_display, unit)
values ('00000000-0000-0000-0000-0000000000e1',
        '00000000-0000-0000-0000-000000000001', 'personal_record',
        '100m Personal Best', 'track_field', '2026-05-04', 10.42, '10.42', 's');

grant usage on schema public, auth to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
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

  -- 9. a coach at the athlete's org can verify, and state syncs -------------
  perform become(coach);
  insert into verifications (achievement_id, verifier_id, verifier_kind, outcome, method)
  values (ach, coach, 'coach', 'verified', 'coach_attestation');

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

  raise notice 'ALL 28 CHECKS PASSED';
end $$;
