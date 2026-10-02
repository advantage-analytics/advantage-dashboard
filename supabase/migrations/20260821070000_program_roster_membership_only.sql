-- Any member of a program may see who else is on it.
--
-- `program_roster` gated the member list on `programs.roster_visible` — the
-- same flag `visible_match_ids()` reads to decide whether a player may see the
-- program's MATCHES. One switch answering two very different questions, with
-- the consequences pulling against each other:
--
--   flag off  a player opens the Roster and sees a list containing only
--             themselves, which reads as the page being broken
--   flag on   the squad can see the roster, and also every serve percentage,
--             result and pattern belonging to every one of their teammates
--
-- So a coach who wanted a team list had to publish everyone's numbers to get
-- one. These separate here. Membership alone now answers "who is on this
-- team"; `roster_visible` keeps governing match data, which is the half worth
-- protecting. A roster is a phone book; the statistics are the private part.
--
-- The three-branch OR collapses into a single membership test, which is also
-- the cheaper plan. `user_program_ids()` is uncorrelated, so it hoists to an
-- InitPlan and runs once per statement, where the old `is_program_staff(...)`
-- branch was evaluated per candidate row — the same defect migration
-- 20260818043926 fixed by wrapping that call in a subselect. Dropping the call
-- entirely is strictly better than wrapping it.
--
-- Non-members still get nothing: with no membership row the predicate is false
-- for every row of the program, which is the same answer they got before.
--
-- Note what this DOES expose that it did not: every member now sees the email
-- address of every other member, because the function returns `u.email`. On a
-- squad that is ordinary — it is how a team list works — but it is a change,
-- and it is the reason to keep this function returning the roster and nothing
-- about performance.

create or replace function public.program_roster(p_program_id uuid)
returns table (
  user_id        uuid,
  display_name   text,
  email          text,
  role           text,
  upload_enabled boolean,
  joined_at      timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select pm.user_id,
         nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''),
         u.email,
         pm.role,
         pm.upload_enabled,
         pm.joined_at
    from public.program_members pm
    join public.users u on u.id = pm.user_id
   where pm.program_id = p_program_id
     and p_program_id in (select public.user_program_ids())
   order by
     case pm.role when 'owner' then 0 when 'coach' then 1 when 'staff' then 2 else 3 end,
     pm.joined_at;
$$;

revoke all on function public.program_roster(uuid) from public;
revoke execute on function public.program_roster(uuid) from anon;
grant execute on function public.program_roster(uuid) to authenticated;

comment on function public.program_roster(uuid) is
  'Members of a program, for any member of it. Gated on membership alone — roster_visible governs match data, not the member list.';
