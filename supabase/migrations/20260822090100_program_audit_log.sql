-- An append-only record of who changed the roster.
--
-- 7e's merge dialog promises "logged in team activity", and there was nowhere
-- for that to go. `program_events` is the SCHEDULING table — matches, duals,
-- tournaments — and the header activity tray is built from `processing_jobs`.
-- Neither is a log, and overloading either would put roster administration in
-- a feed people read for something else.
--
-- Deliberately small. It records the writes that a coach could later dispute
-- ("who took Priya off the roster?", "who merged those two rows?"), not every
-- read and not every field edit.

create table if not exists public.program_audit_log (
  id            bigint generated always as identity primary key,
  program_id    uuid not null references public.programs(id) on delete cascade,
  -- SET NULL rather than CASCADE: a departed coach's actions are still what
  -- happened, and deleting the record of them to tidy up a user row is how an
  -- audit log stops being one.
  actor_user_id uuid references public.users(id) on delete set null,
  action        text not null,
  -- The profile, invite or member the action was about.
  subject_id    uuid,
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- A CHECK rather than an enum: adding a value to an enum inside a transaction
-- was a hazard until recently and the list is expected to grow.
alter table public.program_audit_log drop constraint if exists program_audit_log_action_check;
alter table public.program_audit_log add constraint program_audit_log_action_check
  check (action in (
    'player.added', 'player.updated', 'player.archived',
    'player.claimed', 'player.merged',
    'invite.created', 'invite.revoked', 'invite.accepted',
    'member.removed', 'seats.changed'
  ));

create index if not exists program_audit_log_program_idx
  on public.program_audit_log (program_id, created_at desc);

alter table public.program_audit_log enable row level security;
grant select on public.program_audit_log to authenticated;

-- Append-only from the application's point of view. The SECURITY DEFINER
-- functions that write here run as the owner and are unaffected by this.
revoke insert, update, delete on public.program_audit_log from authenticated;
revoke insert, update, delete on public.program_audit_log from anon;

drop policy if exists "Staff read their program's log" on public.program_audit_log;
create policy "Staff read their program's log"
  on public.program_audit_log for select
  using (public.is_program_staff(program_id));

comment on table public.program_audit_log is
  'Append-only record of roster administration. Written only from SECURITY DEFINER functions; readable by program staff.';
