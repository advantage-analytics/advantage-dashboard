-- Resolve a recorded lineup's opponent to a directory row.
--
-- `opponent_school` is free text a coach typed, and free text does not
-- aggregate: "Stanford", "Stanford University" and "STAN" are three opponents
-- to a GROUP BY and one opponent to a human. The directory already solved this
-- exact problem once — `programs.school_group` is keyed `normalized-name|STATE`
-- because keying on name alone pooled Glendale Community College in Arizona
-- with the one in California — and pointing at that row is how a lineup stops
-- being a string.
--
-- `opponent_school` STAYS. Not every opponent is a collegiate program in the
-- directory: an alumni match, a touring club side and a foreign university all
-- have to remain recordable, and for those the typed name is the whole truth.
-- The column is the fallback, and null here means "not a program we can name",
-- never "no opponent".

alter table public.program_event_entries
  add column if not exists opponent_program_id uuid
  references public.programs(id) on delete set null;

-- A program does not play itself. Guards the dual-creation form against picking
-- its own school out of a directory that contains it.
alter table public.program_event_entries
  drop constraint if exists program_event_entries_opponent_check;
alter table public.program_event_entries
  add constraint program_event_entries_opponent_check
  check (opponent_program_id is distinct from program_id);

-- The Opponents page's read: every line anyone recorded against this program.
create index if not exists program_event_entries_opponent_idx
  on public.program_event_entries (opponent_program_id)
  where opponent_program_id is not null;

comment on column public.program_event_entries.opponent_program_id is
  'The directory row this line was played against, where the opponent is a collegiate program. NULL falls back to opponent_school, which stays authoritative for non-collegiate opponents.';
