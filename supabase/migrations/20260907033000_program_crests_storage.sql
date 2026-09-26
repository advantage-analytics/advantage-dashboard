-- The bucket a program's crest lives in, and who may write under it.
--
-- Its own migration, apart from `20260907031610_teams_management.sql`: the
-- crest is the one part of Settings › Teams that can be dropped from a deploy
-- without touching anything else, and an applied migration is never edited.
--
-- Public, because the crest is drawn on the roster and on match cards that
-- other programs' members see, and a signed URL per render would be a fetch
-- per row. 512 KB and four image types, enforced by the bucket so a client
-- that skips its own check still cannot store a 40 MB "crest".
--
-- Keys are `<program_id>/crest-<stamp>.<ext>`. The policies compare the first
-- folder as TEXT against the caller's own program ids rather than casting it
-- to uuid: a cast inside a policy raises 22P02 on any non-uuid prefix, which
-- aborts the statement with a 500-shaped error instead of a refusal, and
-- Postgres does not promise `and` will short-circuit past it.
--
-- SELECT is granted to authenticated even though anonymous GET on a public
-- bucket needs no policy at all — the storage API's own row reads on `upsert`
-- and `remove()` do, and without it a replace would succeed at the object and
-- then fail to clean up the one it replaced.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'program-crests',
  'program-crests',
  true,
  524288,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;

drop policy if exists "Program crests are readable" on storage.objects;
create policy "Program crests are readable"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'program-crests');

drop policy if exists "Program staff write their crest" on storage.objects;
create policy "Program staff write their crest"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'program-crests'
    and exists (
      select 1
        from public.user_program_ids() as pid
       where pid::text = (storage.foldername(name))[1]
         and public.is_program_staff(pid)
    )
  );

drop policy if exists "Program staff replace their crest" on storage.objects;
create policy "Program staff replace their crest"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'program-crests'
    and exists (
      select 1
        from public.user_program_ids() as pid
       where pid::text = (storage.foldername(name))[1]
         and public.is_program_staff(pid)
    )
  )
  with check (
    bucket_id = 'program-crests'
    and exists (
      select 1
        from public.user_program_ids() as pid
       where pid::text = (storage.foldername(name))[1]
         and public.is_program_staff(pid)
    )
  );

drop policy if exists "Program staff remove their crest" on storage.objects;
create policy "Program staff remove their crest"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'program-crests'
    and exists (
      select 1
        from public.user_program_ids() as pid
       where pid::text = (storage.foldername(name))[1]
         and public.is_program_staff(pid)
    )
  );
