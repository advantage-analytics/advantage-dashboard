-- T6 LOCAL fixture extension only, after T1/T5 fixture + migrations.
-- These cascade actions and audit columns/check values were read from the
-- actual catalog on 2026-09-10. Other parent schema remains reduced.
alter table public.program_event_entries drop constraint program_event_entries_event_id_fkey;
alter table public.program_event_entries add constraint program_event_entries_event_id_fkey
  foreign key(event_id) references public.program_events(id) on delete cascade;
alter table public.matches drop constraint matches_event_entry_id_fkey;
alter table public.matches add constraint matches_event_entry_id_fkey
  foreign key(event_entry_id) references public.program_event_entries(id) on delete set null;
create table public.program_audit_log (
  id bigint generated always as identity primary key,
  program_id uuid not null references public.programs(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null constraint program_audit_log_action_check check(action in
    ('player.added','player.updated','player.archived','player.claimed','player.merged',
     'invite.created','invite.revoked','invite.accepted','member.removed',
     'member.role_changed','seats.changed','member.account_deleted','lineup.set','ownership.transferred')),
  subject_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table public.program_audit_log enable row level security;
revoke all on public.program_audit_log from public,anon,authenticated;
grant all on public.program_audit_log to service_role;
grant usage on sequence public.program_audit_log_id_seq to service_role;
grant delete on public.program_events to authenticated;
create policy "LOCAL T6 actual staff delete" on public.program_events for delete to authenticated
  using (exists (select 1 from public.program_members m where m.program_id = program_events.program_id
    and m.user_id = auth.uid() and m.role in ('owner','coach','staff')));
