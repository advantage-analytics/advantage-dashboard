-- Stop a client moving a match onto another program's line.
-- Applied live 2026-08-21 as version 20260821144058.
--
-- `matches.event_entry_id` (20260820072352) and `matches.program_id` are both
-- plain client-writable columns, and the matches UPDATE policy checks only
--
--   auth.uid() = created_by      (USING and WITH CHECK)
--
-- which is unchanged by a re-graft: the attacker keeps being the creator. So a
-- program member could PATCH their own match with a `program_id` and
-- `event_entry_id` belonging to a teammate's dual line, and `readSchedule`
-- would render it under that court and fold it into the team total. Insider
-- only, and it needs a hand-crafted PostgREST call rather than anything the UI
-- offers -- but the whole point of the columns is that they decide which
-- program a match counts for.
--
-- WHY A TRIGGER AND NOT A COLUMN GRANT. Postgres cannot revoke one column out
-- of a table-level grant; `revoke update on matches` then re-granting the
-- allowed columns means enumerating every column the app legitimately writes,
-- across the PATCH route, the upload wizard and recordResult. Miss one and a
-- user flow breaks silently. This is also the shape the codebase already uses
-- for exactly this problem -- `users_block_plan_self_update` guards `plan` the
-- same way.
--
-- SAFE AGAINST EVERY CALLER, verified. Both columns are only ever written on
-- INSERT (`useUploadMatchWizard` and `recordResult`), and `before update of`
-- fires only when the SET list names the column. The PATCH route at
-- `api/matches/[matchId]` whitelists its fields and neither is on the list.
-- The service role is exempt, so the webhook and every server-side job are
-- unaffected.
create or replace function public.matches_block_client_regraft()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.program_id is distinct from old.program_id
      or new.event_entry_id is distinct from old.event_entry_id)
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
         in ('authenticated', 'anon') then
    raise exception
      'which program and line a match belongs to is set when it is created'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists matches_block_client_regraft on public.matches;

create trigger matches_block_client_regraft
  before update of program_id, event_entry_id on public.matches
  for each row
  execute function public.matches_block_client_regraft();

comment on function public.matches_block_client_regraft() is
  'Refuses a client UPDATE that changes matches.program_id or matches.event_entry_id. Both are set at INSERT; changing them re-attributes a match to another program''s line.';
