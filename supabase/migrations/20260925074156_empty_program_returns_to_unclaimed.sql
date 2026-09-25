-- A program nobody belongs to goes back to unclaimed.
-- Applied live 2026-09-25 as version 20260925074156.
--
-- `programs.status` is what the directory and the claim flow read: anything
-- other than 'unclaimed' renders as "on Advantage" and routes a visitor to
-- "request access" from `owner_user_id`. Access itself comes only from
-- `program_members` (`user_program_role()`), so the two can drift apart: every
-- path that removes the last member (account deletion, a coach removing
-- staff, direct cleanup) left the program 'active' with an owner who is no
-- longer on it. On 2026-09-25 that left UCLA, Dartmouth, Berkeley and ZZ Test
-- telling new coaches to ask a former owner for access, with nobody able to
-- let them in and `program_claims_one_open_per_program` blocking a new claim.
--
-- The rule, enforced after every membership delete:
--
--   * no members left  -> status 'unclaimed', owner and claimed_at cleared,
--     and any open claim closed as 'rejected' so a new claim can start. This
--     is the same end state the app writes when an admin rejects a claim or
--     somebody objects (admin-actions.ts, claim-actions.ts).
--   * the owner left but others remain -> `owner_user_id` is cleared
--     (`programs_one_owner` allows one owner row, so there is nobody to pass
--     it to), so the directory stops naming a person who is no longer on the
--     team. The program stays active: its members still use it.
--
-- Not covered here, and pre-existing: an admin rejecting a claim
-- (admin-actions.ts `transition`) nulls the owner and deletes only the
-- claimant's membership, so staff the claimant invited stay on a program now
-- marked unclaimed. That is a claim-flow question, left to its own change.
--
-- Matches, rosters and schedules are untouched. A program's matches stay
-- filed under it, and whoever claims it next sees them.

create or replace function public.program_members_after_delete()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- Serialise on the program row. Without it, the last two members leaving
  -- concurrently would each still see the other's row and both skip the
  -- cleanup. Under READ COMMITTED the check below takes a fresh snapshot
  -- after the lock is granted, so the second leaver sees the first's delete.
  perform 1 from public.programs p where p.id = old.program_id for update;

  if not exists (select 1 from public.program_members pm
                  where pm.program_id = old.program_id) then
    update public.programs p
       set status = 'unclaimed', owner_user_id = null, claimed_at = null
     where p.id = old.program_id
       and (p.status <> 'unclaimed' or p.owner_user_id is not null);

    update public.program_claims c
       set status = 'rejected',
           review_notes = coalesce(c.review_notes || ' ', '') ||
             '[auto] closed: the program has no members left.',
           updated_at = now()
     where c.program_id = old.program_id
       and c.status in ('pending_email', 'pending_review', 'objection_window');
    return null;
  end if;

  update public.programs p
     set owner_user_id = null
   where p.id = old.program_id and p.owner_user_id = old.user_id;

  return null;
end;
$$;

revoke all on function public.program_members_after_delete() from public, anon, authenticated;

drop trigger if exists program_members_after_delete on public.program_members;
create trigger program_members_after_delete
  after delete on public.program_members
  for each row execute function public.program_members_after_delete();

-- One-time: programs already left empty before this trigger existed.
update public.program_claims c
   set status = 'rejected',
       review_notes = coalesce(c.review_notes || ' ', '') ||
         '[auto] closed: the program has no members left.',
       updated_at = now()
 where c.status in ('pending_email', 'pending_review', 'objection_window')
   and not exists (select 1 from public.program_members pm where pm.program_id = c.program_id);

update public.programs p
   set status = 'unclaimed', owner_user_id = null, claimed_at = null
 where (p.status <> 'unclaimed' or p.owner_user_id is not null)
   and not exists (select 1 from public.program_members pm where pm.program_id = p.id);
