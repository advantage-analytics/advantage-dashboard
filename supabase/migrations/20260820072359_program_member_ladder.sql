-- Ladder position — the order a lineup defaults to.
-- Applied live 2026-08-20 as version 20260820072359.
--
-- Nullable, because a program that has never set one should get roster order
-- rather than a fabricated ranking. A number here is a claim about who beats
-- whom, and inventing that from join order would be a lie the lineup then
-- repeats every week.
--
-- The new-dual form reads it to seed S1..S6. Dragging a line reorders THAT
-- dual's lineup and never writes back here: a one-off change for one opponent
-- is not a challenge-ladder result, and conflating them would mean every
-- tactical lineup silently re-ranked the squad.

alter table public.program_members
  add column if not exists ladder_position integer;

alter table public.program_members
  drop constraint if exists program_members_ladder_check;
alter table public.program_members
  add constraint program_members_ladder_check
  check (ladder_position is null or ladder_position > 0);

comment on column public.program_members.ladder_position is
  'Challenge-ladder rank within the program. NULL = unranked.';
