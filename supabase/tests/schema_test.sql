-- Behavioral tests for the Roster schema.
-- Runs as `authenticated` with a simulated JWT so RLS is actually exercised;
-- as the table owner, postgres bypasses RLS and would prove nothing.

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
  ('00000000-0000-0000-0000-000000000004', 'stranger@example.com');

insert into profiles (id, handle, display_name, account_kind, level, primary_sport, visibility) values
  ('00000000-0000-0000-0000-000000000001', 'ava', 'Ava Reyes', 'athlete', 'high_school', 'track_field', 'members'),
  ('00000000-0000-0000-0000-000000000002', 'ben', 'Ben Osei',  'athlete', 'high_school', 'track_field', 'private'),
  ('00000000-0000-0000-0000-000000000003', 'coach_k', 'Coach Kim', 'coach', null, null, 'members'),
  ('00000000-0000-0000-0000-000000000004', 'stranger', 'Stranger', 'athlete', 'club', 'basketball', 'members');

insert into memberships (profile_id, org_id, role, sport, started_on) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000aa', 'athlete', 'track_field', '2024-08-01'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000aa', 'coach',   'track_field', '2020-08-01');

insert into achievements (id, profile_id, kind, title, sport, achieved_on, value_numeric, value_display, unit)
values ('00000000-0000-0000-0000-0000000000e1',
        '00000000-0000-0000-0000-000000000001', 'personal_record',
        '100m Personal Best', 'track_field', '2026-05-04', 10.42, '10.42', 's');

grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;

-- Helper: become a given user.
create or replace function become(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
end $$;

-- ===========================================================================
do $$
declare
  ava       uuid := '00000000-0000-0000-0000-000000000001';
  ben       uuid := '00000000-0000-0000-0000-000000000002';
  coach     uuid := '00000000-0000-0000-0000-000000000003';
  stranger  uuid := '00000000-0000-0000-0000-000000000004';
  ach       uuid := '00000000-0000-0000-0000-0000000000e1';
  post      uuid;
  parent    uuid;
  n         integer;
  txt       text;
  ok        boolean;
begin
  set local role authenticated;

  -- 1. members-only profile is visible to a signed-in member -----------------
  perform become(stranger);
  select count(*) into n from profiles where id = ava;
  assert n = 1, '1: members-only profile should be visible to a signed-in member';

  -- 2. private profile is hidden from a non-follower -------------------------
  select count(*) into n from profiles where id = ben;
  assert n = 0, '2: private profile must be hidden from a non-follower';

  -- 3. follow of a members-only profile auto-accepts -------------------------
  insert into follows (follower_id, following_id) values (stranger, ava);
  select count(*) into n from follows
   where follower_id = stranger and following_id = ava and accepted_at is not null;
  assert n = 1, '3: follow of a members-only profile should auto-accept';

  -- 4. follow of a private profile stays pending -----------------------------
  insert into follows (follower_id, following_id) values (stranger, ben);
  select count(*) into n from follows
   where follower_id = stranger and following_id = ben and accepted_at is null;
  assert n = 1, '4: follow of a private profile should remain pending';

  -- 5. pending follow does not unlock the private profile --------------------
  select count(*) into n from profiles where id = ben;
  assert n = 0, '5: a pending follow must not grant visibility';

  -- 6. accepted follow does unlock it ----------------------------------------
  perform become(ben);
  update follows set accepted_at = now()
   where follower_id = stranger and following_id = ben;
  perform become(stranger);
  select count(*) into n from profiles where id = ben;
  assert n = 1, '6: an accepted follow should grant visibility';

  -- 7. the record inherits profile visibility --------------------------------
  select count(*) into n from achievements where profile_id = ava;
  assert n = 1, '7: achievements should inherit the owner''s visibility';

  -- 8. evidence is NOT public even when the achievement is ------------------
  perform become(ava);
  insert into achievement_evidence (achievement_id, kind, url, submitted_by)
  values (ach, 'results_url', 'https://athletic.net/result/123', ava);
  perform become(stranger);
  select count(*) into n from achievement_evidence where achievement_id = ach;
  assert n = 0, '8: evidence must not be visible to the general audience';

  -- 9. the athlete's coach CAN see the evidence ------------------------------
  perform become(coach);
  select count(*) into n from achievement_evidence where achievement_id = ach;
  assert n = 1, '9: the athlete''s coach should see submitted evidence';

  -- 10. an athlete cannot verify their own record ---------------------------
  perform become(ava);
  begin
    insert into verifications (achievement_id, verifier_id, verifier_kind, outcome)
    values (ach, ava, 'coach', 'verified');
    assert false, '10: an athlete must not be able to verify their own record';
  exception when insufficient_privilege or check_violation then
    null;  -- expected
  end;

  -- 11. a coach at the athlete's org can verify, and state syncs ------------
  perform become(coach);
  insert into verifications (achievement_id, verifier_id, verifier_kind, outcome, method)
  values (ach, coach, 'coach', 'verified', 'coach_attestation');

  set local role postgres;
  select verification::text into txt from achievements where id = ach;
  assert txt = 'verified', '11: achievement.verification should sync to verified, got ' || txt;

  -- 12. the athlete is notified of the verification -------------------------
  select count(*) into n from notifications
   where profile_id = ava and kind = 'verification_verified';
  assert n = 1, '12: verification should notify the athlete';
  set local role authenticated;

  -- 13. like counter increments and decrements ------------------------------
  perform become(ava);
  insert into posts (author_id, body, achievement_id)
  values (ava, 'Broke 10.5 today.', ach) returning id into post;

  perform become(stranger);
  insert into likes (post_id, profile_id) values (post, stranger);
  set local role postgres;
  select like_count into n from posts where id = post;
  assert n = 1, '13a: like_count should be 1, got ' || n;
  set local role authenticated;

  delete from likes where post_id = post and profile_id = stranger;
  set local role postgres;
  select like_count into n from posts where id = post;
  assert n = 0, '13b: like_count should return to 0, got ' || n;
  set local role authenticated;

  -- 14. comment counter + single-level threading ----------------------------
  perform become(stranger);
  insert into comments (post_id, author_id, body)
  values (post, stranger, 'Huge.') returning id into parent;

  set local role postgres;
  select comment_count into n from posts where id = post;
  assert n = 1, '14a: comment_count should be 1, got ' || n;
  set local role authenticated;

  perform become(ava);
  insert into comments (post_id, author_id, parent_id, body)
  values (post, ava, parent, 'Thanks!') returning id into parent;

  begin
    insert into comments (post_id, author_id, parent_id, body)
    values (post, ava, parent, 'nested too deep');
    assert false, '14b: comments must not nest more than one level';
  exception when raise_exception then
    null;  -- expected
  end;

  -- 15. soft-deleting a comment decrements the counter ----------------------
  set local role postgres;
  select comment_count into n from posts where id = post;
  assert n = 2, '15a: comment_count should be 2, got ' || n;
  set local role authenticated;

  perform become(stranger);
  update comments set removed_at = now()
   where post_id = post and author_id = stranger;

  set local role postgres;
  select comment_count into n from posts where id = post;
  assert n = 1, '15b: soft delete should decrement to 1, got ' || n;
  set local role authenticated;

  -- 16. self-views are not counted ------------------------------------------
  perform become(ava);
  perform record_profile_view(ava);
  set local role postgres;
  select count(*) into n from profile_views where profile_id = ava;
  assert n = 0, '16: a self-view must not be recorded';
  set local role authenticated;

  -- 17. a real view is counted, and repeat views coalesce per day -----------
  perform become(stranger);
  perform record_profile_view(ava);
  perform record_profile_view(ava);
  set local role postgres;
  select view_count into n from profile_views
   where profile_id = ava and viewer_id = stranger;
  assert n = 2, '17a: repeat views should coalesce to one row, got count ' || n;
  select count(*) into n from profile_views where profile_id = ava;
  assert n = 1, '17b: should be exactly one profile_views row, got ' || n;
  set local role authenticated;

  -- 18. the viewer cannot read someone else's view log ----------------------
  perform become(stranger);
  select count(*) into n from profile_views where profile_id = ava and viewer_id <> stranger;
  assert n = 0, '18: a viewer must not read another viewer''s rows';

  -- 19. a single-use invite can only be redeemed once -----------------------
  set local role postgres;
  insert into invites (code, max_uses) values ('testcode', 1);
  set local role authenticated;

  perform become(stranger);
  select redeem_invite('testcode') into ok;
  assert ok, '19a: first redemption should succeed';
  select redeem_invite('testcode') into ok;
  assert not ok, '19b: second redemption of a single-use code must fail';

  -- 20. invites are not enumerable by a non-issuer --------------------------
  select count(*) into n from invites;
  assert n = 0, '20: invite codes must not be enumerable, saw ' || n;

  -- 21. a user cannot forge a post as someone else --------------------------
  begin
    insert into posts (author_id, body) values (ava, 'forged');
    assert false, '21: must not be able to post as another user';
  exception when insufficient_privilege then
    null;  -- expected
  end;

  -- 22. a user cannot edit another athlete's record -------------------------
  update achievements set title = 'tampered' where id = ach;
  set local role postgres;
  select title into txt from achievements where id = ach;
  assert txt = '100m Personal Best', '22: record must not be editable by others, got ' || txt;
  set local role authenticated;

  -- 23. future-dated achievements are rejected ------------------------------
  perform become(ava);
  begin
    insert into achievements (profile_id, kind, title, achieved_on)
    values (ava, 'award', 'Time traveler', current_date + 1);
    assert false, '23: achievements must not be dated in the future';
  exception when check_violation then
    null;  -- expected
  end;

  -- 24. an empty post is rejected -------------------------------------------
  begin
    insert into posts (author_id, body) values (ava, '   ');
    assert false, '24: a post with no body and no achievement must be rejected';
  exception when check_violation then
    null;  -- expected
  end;

  -- 25. handle format is enforced -------------------------------------------
  set local role postgres;
  begin
    insert into auth.users (id, email) values
      ('00000000-0000-0000-0000-0000000000ff', 'bad@example.com');
    insert into profiles (id, handle, display_name, account_kind, level)
    values ('00000000-0000-0000-0000-0000000000ff', 'Bad Handle!', 'Bad', 'athlete', 'club');
    assert false, '25: invalid handles must be rejected';
  exception when check_violation then
    null;  -- expected
  end;

  raise notice 'ALL 25 CHECKS PASSED';
end $$;
