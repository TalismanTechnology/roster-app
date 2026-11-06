-- Roster · 0019 · Avatars in Supabase Storage
--
-- `profiles.avatar_url` has existed since 0002 with nowhere to upload to.
-- This adds the bucket and its policies; the app (SupabaseRepository.setAvatar)
-- uploads to `avatars/<profile id>/avatar-<stamp>.<ext>` and stores the public
-- URL. Local mode mirrors the layout on disk.
--
-- The rule is the owner prefix: the first path segment must be the caller's
-- own auth.uid(). Reads are public — the bucket is public, so objects are
-- served by URL without a policy — because an avatar sits on a resume a
-- recruiter opens with no account. Listing (which the app does to clear old
-- uploads) stays owner-only.
--
-- Additive and safe to re-run against live: `on conflict`, and `drop … if
-- exists` before every policy. The whole storage block is skipped where the
-- `storage` schema does not exist — the plain-Postgres schema test
-- (supabase/tests/run.sh) has no Storage.
--
-- Plus: `media` joins reserved_handles, level with src/lib/handles.ts — the
-- local-mode avatar route lives at /media/avatars/….

set client_min_messages = warning;

insert into reserved_handles (handle) values ('media')
on conflict (handle) do nothing;

do $avatars$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema absent; skipping avatars bucket';
    return;
  end if;

  -- 512 KB and three image types: the editor sends a ~512px JPEG; the cap
  -- is the same AVATAR_MAX_BYTES the Server Action enforces.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 524288, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists avatars_select_own on storage.objects';
  execute $p$
    create policy avatars_select_own on storage.objects
      for select to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;

  execute 'drop policy if exists avatars_insert_own on storage.objects';
  execute $p$
    create policy avatars_insert_own on storage.objects
      for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;

  execute 'drop policy if exists avatars_update_own on storage.objects';
  execute $p$
    create policy avatars_update_own on storage.objects
      for update to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;

  execute 'drop policy if exists avatars_delete_own on storage.objects';
  execute $p$
    create policy avatars_delete_own on storage.objects
      for delete to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;
end
$avatars$;
