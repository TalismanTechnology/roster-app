-- Roster · 0007 · Triggers
--
-- Invariants that must hold no matter which client wrote the row: follow
-- acceptance, denormalized counters, verification state, and the notification
-- fan-out. Enforcing these in the database rather than the app means a mobile
-- client added later cannot drift from the web one.

-- ---------------------------------------------------------------------------
-- Follow acceptance
--
-- Following a public or members-only profile is immediate. Following a private
-- profile creates a pending request the target approves. The client calls the
-- same insert either way.
-- ---------------------------------------------------------------------------

create or replace function auto_accept_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_visibility profile_visibility;
begin
  select visibility into target_visibility
    from profiles where id = new.following_id;

  if target_visibility is distinct from 'private' then
    new.accepted_at := now();
  end if;

  return new;
end;
$$;

create trigger follows_auto_accept
  before insert on follows
  for each row execute function auto_accept_follow();

-- ---------------------------------------------------------------------------
-- Denormalized counters
--
-- posts.like_count / comment_count are read on every feed render and written
-- comparatively rarely, so maintaining them here beats aggregating at read time.
-- ---------------------------------------------------------------------------

create or replace function sync_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update posts set like_count = like_count + 1 where id = new.post_id;
  else
    update posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger likes_count_sync
  after insert or delete on likes
  for each row execute function sync_like_count();

create or replace function sync_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  delta  integer;
begin
  if tg_op = 'INSERT' then
    target := new.post_id;
    delta  := case when new.removed_at is null then 1 else 0 end;
  elsif tg_op = 'DELETE' then
    target := old.post_id;
    delta  := case when old.removed_at is null then -1 else 0 end;
  else
    -- Soft delete and restore both land here.
    target := new.post_id;
    delta  := case
      when old.removed_at is null and new.removed_at is not null then -1
      when old.removed_at is not null and new.removed_at is null then 1
      else 0
    end;
  end if;

  if delta <> 0 then
    update posts
       set comment_count = greatest(comment_count + delta, 0)
     where id = target;
  end if;

  return null;
end;
$$;

create trigger comments_count_sync
  after insert or update or delete on comments
  for each row execute function sync_comment_count();

-- ---------------------------------------------------------------------------
-- Verification state
--
-- `achievements.verification` is a cache of the newest decision in
-- `verifications`. Writing it here keeps the record page to a single query
-- while leaving the audit trail authoritative.
-- ---------------------------------------------------------------------------

create or replace function apply_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update achievements
     set verification = new.outcome,
         verified_at  = case when new.outcome = 'verified' then new.created_at else null end
   where id = new.achievement_id;

  return null;
end;
$$;

create trigger verifications_apply
  after insert on verifications
  for each row execute function apply_verification();

-- ---------------------------------------------------------------------------
-- Notifications
--
-- One function per event rather than a single dispatcher: the payloads differ
-- enough that a shared one becomes a branch pile, and these are read far more
-- often than they are changed.
-- ---------------------------------------------------------------------------

create or replace function notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (profile_id, kind, actor_id)
  values (
    new.following_id,
    case when new.accepted_at is null then 'follow_request' else 'follow' end,
    new.follower_id
  );
  return null;
end;
$$;

create trigger follows_notify
  after insert on follows
  for each row execute function notify_on_follow();

create or replace function notify_on_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
begin
  select author_id into recipient from posts where id = new.post_id;

  -- Liking your own post is not news.
  if recipient is null or recipient = new.profile_id then
    return null;
  end if;

  insert into notifications (profile_id, kind, actor_id, post_id)
  values (recipient, 'like', new.profile_id, new.post_id);

  return null;
end;
$$;

create trigger likes_notify
  after insert on likes
  for each row execute function notify_on_like();

create or replace function notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author uuid;
  parent_author uuid;
begin
  select author_id into post_author from posts where id = new.post_id;

  if post_author is not null and post_author <> new.author_id then
    insert into notifications (profile_id, kind, actor_id, post_id)
    values (post_author, 'comment', new.author_id, new.post_id);
  end if;

  -- A reply also notifies the comment being replied to, unless that is the
  -- post author we just told.
  if new.parent_id is not null then
    select author_id into parent_author from comments where id = new.parent_id;

    if parent_author is not null
       and parent_author <> new.author_id
       and parent_author is distinct from post_author then
      insert into notifications (profile_id, kind, actor_id, post_id)
      values (parent_author, 'reply', new.author_id, new.post_id);
    end if;
  end if;

  return null;
end;
$$;

create trigger comments_notify
  after insert on comments
  for each row execute function notify_on_comment();

create or replace function notify_on_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  athlete uuid;
begin
  select profile_id into athlete from achievements where id = new.achievement_id;

  if athlete is null then
    return null;
  end if;

  insert into notifications (profile_id, kind, actor_id, achievement_id, body)
  values (athlete, 'verification_' || new.outcome, new.verifier_id,
          new.achievement_id, new.note);

  return null;
end;
$$;

create trigger verifications_notify
  after insert on verifications
  for each row execute function notify_on_verification();

create or replace function notify_on_endorsement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (profile_id, kind, actor_id)
  values (new.profile_id, 'endorsed', new.endorser_id);
  return null;
end;
$$;

create trigger coach_endorsements_notify
  after insert on coach_endorsements
  for each row execute function notify_on_endorsement();
