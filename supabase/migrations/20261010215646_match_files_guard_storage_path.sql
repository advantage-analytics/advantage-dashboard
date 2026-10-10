-- match_files.storage_path is written from the browser (upload.service.ts,
-- `{userId}/{providerId}/{matchId}/{fileName}`) and the match purge removes it
-- from match-data verbatim — with the service role on account deletion and
-- console abandon. So a signed-in user may only write a path under their own
-- uid, with no `..` segment. Existing rows are untouched; only a written
-- path is checked. Every live path already starts with its uploader's uid.

create or replace function public.match_files_guard_storage_path()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.storage_path is null
     or (tg_op = 'UPDATE' and new.storage_path is not distinct from old.storage_path) then
    return new;
  end if;
  if left(new.storage_path, 37) is distinct from coalesce((select auth.uid())::text, '-') || '/'
     or new.storage_path ~ '(^|/)\.\.(/|$)' then
    raise exception 'A match file''s storage path must be under your own folder.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.match_files_guard_storage_path() from public, anon, authenticated;

create trigger match_files_guard_storage_path
  before insert or update of storage_path on public.match_files
  for each row execute function public.match_files_guard_storage_path();
