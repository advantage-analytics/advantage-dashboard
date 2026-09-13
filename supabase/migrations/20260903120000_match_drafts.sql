-- Match drafts: the upload wizard's "Save draft", as a row the Matches table
-- can list (design 11c). Private to the author — a draft is a half-answered
-- form, not a match, and nobody else has a reason to see one.
--
-- The File itself never survives: it is re-picked on resume. `payload` holds
-- the wizard's own state (form data, chosen source, an accepted schedule
-- offer, the event preset a team flow started from); the flat columns beside
-- it exist only so the list can render a row without opening the JSON.

create table if not exists public.match_drafts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  -- NULL is the personal workspace, exactly as on matches.program_id.
  program_id   uuid references public.programs(id) on delete cascade,
  step         text not null,
  step_index   integer not null,
  step_count   integer not null,
  provider     text,
  file_name    text,
  player_name  text,
  event_label  text,
  payload      jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists match_drafts_user_idx
  on public.match_drafts (user_id, updated_at desc);

alter table public.match_drafts enable row level security;

drop policy if exists "Drafts are private to their author" on public.match_drafts;
create policy "Drafts are private to their author"
  on public.match_drafts
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.match_drafts is
  'A half-finished upload wizard, saved by "Save draft". Private to its author; the Matches table lists it with Resume. The file is never stored.';
