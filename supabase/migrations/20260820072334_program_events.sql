-- Events — a dual or a tournament a program shows up to.
-- Applied live 2026-08-20 as version 20260820072334.
--
-- An event owns the facts every one of its matches would otherwise repeat:
-- date, site, surface, and the scoring format. Storing them here rather than on
-- nine match rows means a wrong surface is one edit instead of nine, and it is
-- what lets the upload wizard's details step shrink to the two questions only
-- the video can answer.
--
-- Duals and tournaments share one table because the schedule reads them as one
-- list, ordered by date. What actually differs between them is what hangs off
-- them, and that lives in program_event_entries.

create table if not exists public.program_events (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs(id) on delete cascade,
  kind        text not null,

  -- The opponent school for a dual, the tournament's own name for a
  -- tournament. One column because the schedule row prints it the same way
  -- either way, and a `dual_opponent`/`tournament_name` pair would be two
  -- columns of which exactly one is ever populated.
  name        text not null,

  starts_on   date not null,
  -- Equal to starts_on for a dual. A tournament is a weekend, and the schedule
  -- prints "4–6 Sep" from these two.
  ends_on     date not null,

  site        text not null,
  surface     text,
  -- Who is running it — "Buckeye State". Tournament only; a dual's host is
  -- whichever side is at home, which `site` already says.
  host        text,

  -- { best_of, ad_scoring }. Dual-wide, because a dual's lines are all played
  -- under one agreed format. The upload wizard reads ad_scoring back from here
  -- rather than asking a coach the same question nine times — and ad_scoring is
  -- one of the five fields the vision pipeline refuses a job without.
  format      jsonb not null default '{}'::jsonb,

  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.program_events
  drop constraint if exists program_events_kind_check;
alter table public.program_events
  add constraint program_events_kind_check
  check (kind in ('dual', 'tournament'));

alter table public.program_events
  drop constraint if exists program_events_site_check;
alter table public.program_events
  add constraint program_events_site_check
  check (site in ('home', 'away', 'neutral'));

alter table public.program_events
  drop constraint if exists program_events_span_check;
alter table public.program_events
  add constraint program_events_span_check
  check (ends_on >= starts_on);

-- The schedule page's only query: this program's events, newest first.
create index if not exists program_events_program_idx
  on public.program_events (program_id, starts_on desc);

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

alter table public.program_events enable row level security;

grant select, insert, update, delete on public.program_events to authenticated;

-- Every member reads the schedule, players included. A lineup is a thing a
-- squad is told — a player who cannot see which court they are on is being kept
-- from their own fixture, and `programs.roster_visible` is about whose numbers
-- are whose business, not about who is playing on Friday.
drop policy if exists "Events are visible to program members" on public.program_events;
create policy "Events are visible to program members"
  on public.program_events for select
  using (program_id in (select public.user_program_ids()));

drop policy if exists "Staff create events" on public.program_events;
create policy "Staff create events"
  on public.program_events for insert
  with check (public.is_program_staff(program_id));

drop policy if exists "Staff update events" on public.program_events;
create policy "Staff update events"
  on public.program_events for update
  using (public.is_program_staff(program_id))
  with check (public.is_program_staff(program_id));

drop policy if exists "Staff delete events" on public.program_events;
create policy "Staff delete events"
  on public.program_events for delete
  using (public.is_program_staff(program_id));
