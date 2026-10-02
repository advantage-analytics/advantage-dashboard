-- T5 extension for the disposable T1 local fixture only. This is not a
-- production policy clone. Preserve existing tables, records and sentinels.
alter table public.matches add column if not exists round text;
grant select on public.program_events, public.program_event_entries, public.matches to authenticated;
grant update (forfeit) on public.program_event_entries to authenticated;
create policy "LOCAL T5 member event read" on public.program_events for select to authenticated
  using (exists (select 1 from public.program_members m where m.program_id = program_events.program_id and m.user_id = auth.uid()));
create policy "LOCAL T5 member entry read" on public.program_event_entries for select to authenticated
  using (exists (select 1 from public.program_members m where m.program_id = program_event_entries.program_id and m.user_id = auth.uid()));
create policy "LOCAL T5 staff entry update" on public.program_event_entries for update to authenticated
  using (exists (select 1 from public.program_members m where m.program_id = program_event_entries.program_id and m.user_id = auth.uid() and m.role in ('owner','coach','staff')))
  with check (exists (select 1 from public.program_members m where m.program_id = program_event_entries.program_id and m.user_id = auth.uid() and m.role in ('owner','coach','staff')));
