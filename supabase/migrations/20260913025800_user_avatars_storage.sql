-- A profile photo: the column that points at it, and the bucket it lives in.
--
-- Modelled on `20260907033000_program_crests_storage.sql`. The row holds the
-- storage key and nothing else; the public URL is built at read time.
--
-- Public, because the photo is drawn wherever the person's initials are today
-- (header, roster rows) and a signed URL per render would be a fetch per row.
-- 2 MB and three raster types, enforced by the bucket. No SVG: this is
-- arbitrary user content, and an SVG can carry script.
--
-- Keys are `<user_id>/avatar-<stamp>.<ext>`. The policies compare the first
-- folder as TEXT against `auth.uid()` rather than casting it to uuid, for the
-- reason the crest migration gives: a cast inside a policy raises 22P02 on a
-- non-uuid prefix instead of refusing.
--
-- `users` already has an own-row ALL policy, so the column needs no policy of
-- its own, and `users_block_plan_self_update` only guards `plan`.

alter table public.users add column if not exists avatar_path text;

-- The own-row ALL policy lets a user write any string here, including another
-- user's key. Pin it to the caller's own folder in the database rather than
-- trusting every writer to remember.
alter table public.users drop constraint if exists users_avatar_path_own_folder;
alter table public.users add constraint users_avatar_path_own_folder
  check (avatar_path is null or avatar_path like (id::text || '/%'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-avatars',
  'user-avatars',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "User avatars are readable" on storage.objects;
create policy "User avatars are readable"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'user-avatars');

drop policy if exists "Users write their own avatar" on storage.objects;
create policy "Users write their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users replace their own avatar" on storage.objects;
create policy "Users replace their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users remove their own avatar" on storage.objects;
create policy "Users remove their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
