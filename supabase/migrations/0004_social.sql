-- Roster · 0004 · Social graph and feed
-- The commodity half of the product. Deliberately conventional.

-- ---------------------------------------------------------------------------
-- follows
--
-- `accepted_at` is null while a request to follow a private profile is pending.
-- Public and members-only profiles auto-accept via the trigger in 0006, so the
-- same table serves both the "follow" and "request to follow" flows.
-- ---------------------------------------------------------------------------

create table follows (
  follower_id  uuid not null references profiles(id) on delete cascade,
  following_id uuid not null references profiles(id) on delete cascade,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now(),

  primary key (follower_id, following_id),
  constraint no_self_follow check (follower_id <> following_id)
);

-- "Who do I follow" — drives every feed query.
create index follows_follower_idx on follows (follower_id) where accepted_at is not null;
-- "Who follows me" — profile counts and the pending-request inbox.
create index follows_following_idx on follows (following_id) where accepted_at is not null;
create index follows_pending_idx on follows (following_id) where accepted_at is null;

-- ---------------------------------------------------------------------------
-- posts
--
-- A post may stand alone or carry an achievement. The second case is Roster's
-- whole loop: log a PR to your record, and it becomes a feed moment that earns
-- recognition — rather than the two being separate chores.
-- ---------------------------------------------------------------------------

create table posts (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references profiles(id) on delete cascade,
  body           text,
  achievement_id uuid references achievements(id) on delete set null,

  -- Denormalized counters. Maintained by trigger; a feed of 50 posts should not
  -- issue 100 aggregate subqueries.
  like_count     integer not null default 0,
  comment_count  integer not null default 0,

  edited_at      timestamptz,
  removed_at     timestamptz,          -- soft delete, preserves comment threads
  created_at     timestamptz not null default now(),

  constraint post_has_content
    check (nullif(btrim(body), '') is not null or achievement_id is not null),
  constraint body_length check (body is null or length(body) <= 2000)
);

create index posts_author_idx on posts (author_id, created_at desc)
  where removed_at is null;
create index posts_feed_idx on posts (created_at desc) where removed_at is null;
create index posts_achievement_idx on posts (achievement_id)
  where achievement_id is not null;

-- ---------------------------------------------------------------------------
-- post_media — images and video attached to a post
-- ---------------------------------------------------------------------------

create table post_media (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references posts(id) on delete cascade,
  storage_path text not null,
  mime_type    text not null,
  width        integer,
  height       integer,
  duration_ms  integer,          -- video only
  alt_text     text,
  position     smallint not null default 0,
  created_at   timestamptz not null default now(),

  unique (post_id, position)
);

create index post_media_post_idx on post_media (post_id, position);

-- ---------------------------------------------------------------------------
-- likes
-- ---------------------------------------------------------------------------

create table likes (
  post_id    uuid not null references posts(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (post_id, profile_id)
);

create index likes_profile_idx on likes (profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- comments
--
-- One level of threading (a reply targets a top-level comment, not another
-- reply). Arbitrary nesting is a moderation and rendering cost that a
-- professional network does not need.
-- ---------------------------------------------------------------------------

create table comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts(id) on delete cascade,
  author_id  uuid not null references profiles(id) on delete cascade,
  parent_id  uuid references comments(id) on delete cascade,
  body       text not null,
  edited_at  timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint body_present check (nullif(btrim(body), '') is not null),
  constraint body_length check (length(body) <= 1000)
);

create index comments_post_idx on comments (post_id, created_at)
  where removed_at is null;
create index comments_parent_idx on comments (parent_id) where parent_id is not null;

-- Enforce single-level threading: a comment with a parent may not itself be a
-- parent. A CHECK constraint cannot see other rows, so this needs a trigger.
create or replace function enforce_comment_depth()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is not null then
    if exists (select 1 from comments where id = new.parent_id and parent_id is not null) then
      raise exception 'comments may only be nested one level deep';
    end if;
  end if;
  return new;
end;
$$;

create trigger comments_depth_guard
  before insert or update on comments
  for each row execute function enforce_comment_depth();
