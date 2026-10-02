-- Schedule-only non-played results. No backfill: legacy entries.forfeit remains
-- authoritative until the loader/actions are rolled out. Do not apply to
-- production before the development-database constraint/RLS spec has passed.
-- Parent columns/checks/FKs verified with live Supabase list_tables 2026-09-10.
-- Remote catalog inspection was unavailable (Insufficient scope); this file
-- is not applied remotely. tests/fixtures/schedule-outcomes-local.sql supplies
-- a reduced local verification contract, NOT a production schema/policy clone.

-- Composite references make the denormalized RLS scope and event kind true even
-- when a parent is subsequently edited. Each index includes its existing PK,
-- so adding it imposes no new uniqueness restriction on historical rows.
create unique index program_events_outcome_scope_key
  on public.program_events (id, program_id, kind);
create unique index program_event_entries_outcome_scope_key
  on public.program_event_entries (id, event_id, program_id);

create table public.program_event_outcomes (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  event_id uuid not null,
  program_id uuid not null,
  event_kind text not null,
  round text,
  kind text not null check (kind in ('forfeit', 'default', 'withdrawal')),
  side text not null check (side in ('ours', 'theirs')),
  -- Preserve attribution after account deletion. Authenticated callers cannot
  -- supply this column; its default is their verified session identity.
  actor_user_id uuid not null default auth.uid(),
  recorded_at timestamptz not null default now(),
  constraint program_event_outcomes_entry_scope_fkey
    foreign key (entry_id, event_id, program_id)
    references public.program_event_entries (id, event_id, program_id)
    on update restrict on delete restrict,
  constraint program_event_outcomes_event_scope_fkey
    foreign key (event_id, program_id, event_kind)
    references public.program_events (id, program_id, kind)
    on update restrict on delete restrict,
  constraint program_event_outcomes_round_check check (
    (event_kind = 'dual' and round is null)
    or (event_kind = 'tournament' and round is not null and round in (
      'Q1', 'Q2', 'Q3', 'R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F',
      'C1', 'C2', 'C3'
    ))
  )
);

-- NULL is the dual line's grain, not permission for duplicate outcomes.
create unique index program_event_outcomes_dual_key
  on public.program_event_outcomes (entry_id) where round is null;
create unique index program_event_outcomes_round_key
  on public.program_event_outcomes (entry_id, round) where round is not null;
create index program_event_outcomes_program_event_idx
  on public.program_event_outcomes (program_id, event_id);

alter table public.program_event_outcomes enable row level security;

-- Clear then insert, never overwrite an outcome or its attribution. Explicit
-- revocation also neutralizes projects with broad default table privileges.
revoke all on public.program_event_outcomes from public, anon, authenticated;
grant select, delete on public.program_event_outcomes to authenticated;
grant insert (entry_id, event_id, program_id, event_kind, round, kind, side)
  on public.program_event_outcomes to authenticated;
grant all on public.program_event_outcomes to service_role;

create policy "Members read schedule outcomes"
  on public.program_event_outcomes for select to authenticated
  using (exists (
    select 1 from public.program_members m
    where m.program_id = program_event_outcomes.program_id
      and m.user_id = (select auth.uid())
  ));

create policy "Staff create schedule outcomes"
  on public.program_event_outcomes for insert to authenticated
  with check (
    actor_user_id = (select auth.uid())
    and exists (
      select 1 from public.program_members m
      where m.program_id = program_event_outcomes.program_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'coach', 'staff')
    )
  );

create policy "Staff clear schedule outcomes"
  on public.program_event_outcomes for delete to authenticated
  using (exists (
    select 1 from public.program_members m
    where m.program_id = program_event_outcomes.program_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'coach', 'staff')
  ));

comment on table public.program_event_outcomes is
  'Non-played schedule results only; never matches or analysis. Clear before changing. Legacy entry forfeits are retained during rollout.';
comment on column public.program_event_outcomes.side is
  'The side that forfeited, defaulted, or withdrew: ours awards the line to them; theirs awards it to us.';
