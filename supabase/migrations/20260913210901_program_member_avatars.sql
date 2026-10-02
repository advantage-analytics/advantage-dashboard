-- Teammates' profile photos.
--
-- `users` RLS is own-row only, so a page could build a photo URL for the
-- viewer and nobody else: every other person on a program drew as initials.
-- The objects themselves were never the problem — `user-avatars` is a public
-- bucket readable by any signed-in user — only the key was out of reach.
--
-- `program_member_avatars(p_program_id)` hands back the key, and only the
-- key, for each person on that program who has one: every member, plus the
-- login behind any live claimed roster profile. The caller must be on the
-- program themselves (`user_program_ids()`), the same gate `program_roster`
-- uses. No email, no name — those already come through the roster calls.

create or replace function public.program_member_avatars(p_program_id uuid)
returns table (user_id uuid, avatar_path text)
language sql
stable
security definer
set search_path to ''
as $$
  select u.id, u.avatar_path
    from public.users u
   where u.avatar_path is not null
     and p_program_id in (select public.user_program_ids())
     and (
       exists (select 1 from public.program_members pm
                where pm.program_id = p_program_id and pm.user_id = u.id)
       or exists (select 1 from public.program_players pp
                   where pp.program_id = p_program_id
                     and pp.claimed_by_user_id = u.id
                     and pp.merged_into_id is null
                     and pp.archived_at is null)
     );
$$;

comment on function public.program_member_avatars(uuid) is
  'Avatar object keys for the members and claimed roster profiles of a program. '
  'Callable only by a member of that program. Keys only; the bucket is public.';

revoke execute on function public.program_member_avatars(uuid) from public, anon;
grant  execute on function public.program_member_avatars(uuid) to authenticated;
