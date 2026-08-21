-- Which line this match is.
-- Applied live 2026-08-20 as version 20260820072352.
--
-- NULL for every match that exists today, and for every personal upload after
-- it. Non-null means the match was created from an event entry, which is the
-- only thing that makes a dual's team score computable and a tournament run
-- readable as a run rather than as four unrelated matches.
--
-- This column is also the rule that keeps both rails honest: an entry becomes a
-- match the first moment anyone records how it went — a score or a video,
-- whichever lands first. Before that the entry is a line with a name on it. The
-- alternative, minting nine scoreless matches when a dual is created, would put
-- nine empty rows into /dashboard/matches (scoped by created_by, so the coach's
-- own list) and into every statistic computed from it.
--
-- ON DELETE SET NULL, not CASCADE. Deleting a lineup must never delete an
-- athlete's analysed match — the match outlives the line it came from, and the
-- storage cleanup in app/api/matches/[matchId]/route.ts is the only path
-- allowed to remove one.

alter table public.matches
  add column if not exists event_entry_id uuid
  references public.program_event_entries(id) on delete set null;

-- Partial, matching matches_program_idx: the overwhelming majority of rows are
-- personal and NULL here, and this index only ever serves "matches for entry X".
create index if not exists matches_event_entry_idx
  on public.matches (event_entry_id)
  where event_entry_id is not null;

comment on column public.matches.event_entry_id is
  'The event entry this match was created from. NULL = not from an event.';

-- visible_match_ids() is deliberately NOT changed. A match created from an
-- entry already carries program_id, so the program route added in
-- 20260817074043 already covers it, and match_stats / points / shots inherit
-- that without their own policies changing.
