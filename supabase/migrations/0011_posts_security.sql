-- Roster · 0011 · Posts security (reconstructed)
--
-- RECONSTRUCTED — DO NOT RE-APPLY TO LIVE.
--
-- Version 0011's statements are NULL in the live schema_migrations; see 0010
-- for why. Policy predicates below are as recorded in the live catalog. The
-- two helper functions exist live with these signatures, but their bodies were
-- not captured, so the bodies here are the narrowest reading consistent with
-- the policies that call them.

-- The profile a post is about: the owner of the achievement or clip it
-- anchors to. A post is only visible where that resume is.
create or replace function post_subject_id(p posts)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case p.anchor_kind
    when 'achievement' then (select a.profile_id from achievements a where a.id = p.achievement_id)
    when 'film'        then (select f.profile_id from film_clips  f where f.id = p.film_id)
  end;
$$;

-- Whether the caller may post about this anchor: it must exist and belong to
-- them.
create or replace function can_post_anchor(kind post_anchor, anchor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case kind
    when 'achievement' then exists (
      select 1 from achievements a where a.id = anchor and a.profile_id = auth.uid())
    when 'film' then exists (
      select 1 from film_clips f where f.id = anchor and f.profile_id = auth.uid())
    else false
  end;
$$;

alter table posts          enable row level security;
alter table post_reactions enable row level security;

create policy posts_select on posts
  for select using (can_view_profile(author_id) and can_view_profile(post_subject_id(posts.*)));

create policy posts_insert on posts
  for insert with check (
    author_id = auth.uid()
    and can_post_anchor(anchor_kind, coalesce(achievement_id, film_id))
  );

create policy posts_delete on posts
  for delete using (author_id = auth.uid() or post_subject_id(posts.*) = auth.uid());

create policy post_reactions_select on post_reactions
  for select using (exists (select 1 from posts p where p.id = post_id));

create policy post_reactions_insert on post_reactions
  for insert with check (
    profile_id = auth.uid()
    and exists (select 1 from posts p where p.id = post_id)
  );

create policy post_reactions_delete on post_reactions
  for delete using (profile_id = auth.uid());
