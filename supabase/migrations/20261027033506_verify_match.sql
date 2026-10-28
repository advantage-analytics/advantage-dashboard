-- Verified by Advantage, step 1 (docs/plans/advantage-review.md): the first
-- legitimate way to set `matches.verified`, and the way back.
--
-- `verify_match` / `unverify_match` are the one door step 0's
-- `zz_matches_guard_verification` leaves open: SECURITY DEFINER, executable
-- by `service_role` only. The label console's Mark complete calls
-- verify_match with the admin who pressed it (session-status-session.ts),
-- Reopen calls unverify_match. Through the service role the guard sees a
-- non-client JWT and passes; a browser JWT reaching either function is
-- refused EXECUTE first, and the guard after that.
--
-- verify_match re-checks that p_actor is an admin (`users.is_admin`), so
-- verified_by can only ever name one, whatever the caller passes. It stamps
-- verified_at with the database clock every time — completing again after a
-- Reopen is a new verification. It leaves verified_review_id alone; step 3a
-- adds the review parameter.
--
-- "Something still wrong? Tell us" files into /admin Requests, which reads
-- `program_requests`. Every row there named a program or a school; a
-- personal match has neither, so: a `match_issue` kind and a `match_id`
-- column (cascade: a deleted match takes its reports with it). program_id
-- stays null on a match_issue even for a team match: the queue reads the
-- program through the match, and `program_requests_open_unique` (one open
-- request per kind, program and address) would otherwise refuse a coach's
-- second report on another of the team's matches. The table keeps no
-- policies: the server action proves the reporter can see the match with
-- their own client, then inserts with the service role.

create or replace function public.verify_match(p_match_id uuid, p_actor uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  if not exists (
    select 1 from public.users u where u.id = p_actor and u.is_admin
  ) then
    raise exception 'Only an Advantage admin can verify a match'
      using errcode = '42501';
  end if;
  update public.matches
     set verified = true, verified_at = now(), verified_by = p_actor
   where id = p_match_id
  returning verified_at into v_at;
  if v_at is null then
    raise exception 'Match % not found', p_match_id using errcode = 'P0002';
  end if;
  return v_at;
end;
$$;

comment on function public.verify_match(uuid, uuid) is
  'Verified by Advantage: sets matches.verified with verified_at = now() and '
  'verified_by = p_actor, who must be an admin. service_role only.';

create or replace function public.unverify_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.matches
     set verified = false,
         verified_at = null,
         verified_by = null,
         verified_review_id = null
   where id = p_match_id;
end;
$$;

comment on function public.unverify_match(uuid) is
  'Removes Verified by Advantage from a match (all four verified columns). '
  'service_role only.';

revoke execute on function public.verify_match(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.unverify_match(uuid)
  from public, anon, authenticated;
grant execute on function public.verify_match(uuid, uuid) to service_role;
grant execute on function public.unverify_match(uuid) to service_role;

alter table public.program_requests
  add column match_id uuid references public.matches (id) on delete cascade;

comment on column public.program_requests.match_id is
  'The match a match_issue report is about ("Something still wrong? Tell '
  'us" on Verified by Advantage). Null for every other kind.';

alter table public.program_requests
  drop constraint program_requests_kind_check,
  add constraint program_requests_kind_check check (
    kind = any (array[
      'invite_request', 'ownership_dispute', 'unlisted_program', 'match_issue'
    ])
  ),
  drop constraint program_requests_target_check,
  add constraint program_requests_target_check check (
    (kind = 'unlisted_program' and school_name is not null)
    or (kind = 'match_issue' and match_id is not null)
    or (kind not in ('unlisted_program', 'match_issue') and program_id is not null)
  );

create index program_requests_match_id_idx
  on public.program_requests (match_id)
  where match_id is not null;
