-- Roster · 0010 · Posts (reconstructed)
--
-- RECONSTRUCTED — DO NOT RE-APPLY TO LIVE.
--
-- Version 0010 is recorded in the live project's schema_migrations, but its
-- statements column is NULL: the migration came from a social-feed PR that was
-- later reverted in git, after it had already been applied. The tables it made
-- are still live. This file rebuilds them from the live catalog so a local
-- rebuild matches production; it is here for git parity only.
--
-- Roster is a resume, not a feed (see 0004), so nothing in the app reads these
-- tables. 0015 revokes client access to them; dropping them is a separate,
-- deliberate decision that has not been made.
--
-- Confirmed against live catalog:
--   * FK delete behaviour — `on delete cascade` throughout.
--   * posts_caption_short and posts_one_anchor CHECK constraints.

create type post_anchor as enum ('achievement', 'film');

create table posts (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references profiles(id) on delete cascade,
  anchor_kind    post_anchor not null,
  achievement_id uuid references achievements(id) on delete cascade,
  film_id        uuid references film_clips(id) on delete cascade,
  caption        text,
  created_at     timestamptz not null default now(),

  constraint posts_caption_short check (caption is null or char_length(caption) <= 280),
  constraint posts_one_anchor check (
    (anchor_kind = 'achievement' and achievement_id is not null and film_id is null)
    or (anchor_kind = 'film' and film_id is not null and achievement_id is null)
  )
);

create unique index posts_author_achievement_once on posts (author_id, achievement_id);
create unique index posts_author_film_once        on posts (author_id, film_id);
create index posts_feed_idx   on posts (created_at desc);
create index posts_author_idx on posts (author_id);

create table post_reactions (
  post_id    uuid not null references posts(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (post_id, profile_id)
);
