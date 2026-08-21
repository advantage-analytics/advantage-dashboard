-- Entries — somebody on our side, in a slot, at an event.
-- Applied live 2026-08-20 as version 20260820072347.
--
-- One table for both rails, because a dual line and a tournament entry are the
-- same shape. What differs is arity: a dual line has at most one match, while a
-- tournament entry has as many as the player's run is long — Q1, Q2, R32 and
-- R16 are four matches under one entry. That asymmetry is why the match points
-- here (matches.event_entry_id) rather than an entry pointing at a match.
--
-- An entry never stores a result. The moment anyone records how a line went — a
-- score or a video, whichever lands first — a matches row is created, and the
-- score lives there and only there. Two homes for one score is two scores, and
-- the one on the schedule would be the stale one.

create table if not exists public.program_event_entries (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.program_events(id) on delete cascade,

  -- Denormalized from the event. Every policy below filters on it, and gating
  -- through a join to program_events would put a correlated subquery in each
  -- one — the cost the round-4 initplan migration existed to remove.
  program_id       uuid not null references public.programs(id) on delete cascade,

  discipline       text not null,

  -- 'S1'..'S6', 'D1'..'D3' for a dual. NULL for a tournament entry, which has a
  -- draw instead of a court.
  slot             text,
  position         integer not null default 0,

  -- Tournament: 'main', 'qualifying', 'consolation', or a flight label. Where a
  -- player STARTS, not where they end up — a run through the draw is read from
  -- their matches, not from this column.
  draw             text,
  seed             integer,

  -- Roster members on our side: one for singles, two for doubles. May be empty
  -- when a coach types a name that has no account yet, which is the normal case
  -- in the first week of a program.
  player_user_ids  uuid[] not null default '{}',

  -- Display names, written at create and never re-derived. A lineup has to read
  -- correctly after a roster edit, a name change, or a player leaving the
  -- program; joining through program_members for a historical lineup would
  -- rewrite the past every time the present changed.
  player_labels    text[] not null default '{}',

  opponent_labels  text[] not null default '{}',
  opponent_school  text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.program_event_entries
  drop constraint if exists program_event_entries_discipline_check;
alter table public.program_event_entries
  add constraint program_event_entries_discipline_check
  check (discipline in ('singles', 'doubles'));

alter table public.program_event_entries
  drop constraint if exists program_event_entries_seed_check;
alter table public.program_event_entries
  add constraint program_event_entries_seed_check
  check (seed is null or seed > 0);

-- A dual has one S1. Partial, because a tournament entry has no slot at all and
-- would otherwise be constrained against every other slotless entry.
create unique index if not exists program_event_entries_slot_key
  on public.program_event_entries (event_id, slot)
  where slot is not null;

-- The event page's read: this event's entries, in lineup order.
create index if not exists program_event_entries_event_idx
  on public.program_event_entries (event_id, discipline, position);

-- The upload queue's read, and every RLS predicate below.
create index if not exists program_event_entries_program_idx
  on public.program_event_entries (program_id);

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

alter table public.program_event_entries enable row level security;

grant select, insert, update, delete on public.program_event_entries to authenticated;

drop policy if exists "Entries are visible to program members" on public.program_event_entries;
create policy "Entries are visible to program members"
  on public.program_event_entries for select
  using (program_id in (select public.user_program_ids()));

drop policy if exists "Staff create entries" on public.program_event_entries;
create policy "Staff create entries"
  on public.program_event_entries for insert
  with check (public.is_program_staff(program_id));

drop policy if exists "Staff update entries" on public.program_event_entries;
create policy "Staff update entries"
  on public.program_event_entries for update
  using (public.is_program_staff(program_id))
  with check (public.is_program_staff(program_id));

drop policy if exists "Staff delete entries" on public.program_event_entries;
create policy "Staff delete entries"
  on public.program_event_entries for delete
  using (public.is_program_staff(program_id));
