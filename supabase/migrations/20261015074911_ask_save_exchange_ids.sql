-- ask_save_exchange_ids(): save an exchange and answer with both ids.
--
-- After an answer streamed, /api/ask made two round trips in a row:
-- ask_save_exchange() for the conversation's id, then ask_last_answer_id()
-- for the saved answer's (the feedback control's target). The `done` event,
-- and with it the page's "questions left" count, waited on both
-- (docs/ask-improvement-roadmap.md, 2.6).
--
-- This function is the two in one call, as a wrapper: it runs
-- ask_save_exchange() unchanged — the SECURITY DEFINER function that owns
-- the writes, the title, the row lock and the membership check — and reads
-- the answer's id back through ask_last_answer_id(), as the route did, in
-- the same transaction. It returns
--
--   { "conversation_id": <uuid>, "answer_id": <uuid> }
--
-- A new function rather than a changed return type on purpose: the
-- deployed route keeps calling ask_save_exchange() and reading a uuid until
-- the code that calls this one is live, so the two can land in either order.
-- ask_save_exchange() and ask_last_answer_id() stay as they are; a later
-- migration may retire the route's direct use of the second.
--
-- SECURITY INVOKER (the default): the write runs as the definer function
-- underneath, and the read of the answer's id runs as the signed-in user
-- under ask_messages' owner-only policy, exactly as before. Grants follow
-- 20261001184305's default — authenticated and service_role, never anon —
-- and are written out here so the file says so.
--
-- Applied to the live database on 2026-10-15 as version 20261015074911
-- (`ask_save_exchange_ids`). VERIFIED: see the end of this file.

create or replace function public.ask_save_exchange_ids(
  p_conversation_id uuid,
  p_question jsonb,
  p_answer jsonb,
  p_program_id uuid default null
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select jsonb_build_object(
    'conversation_id', saved.id,
    'answer_id', public.ask_last_answer_id(saved.id)
  )
    from public.ask_save_exchange(
      p_conversation_id, p_question, p_answer, p_program_id
    ) as saved(id);
$$;

comment on function public.ask_save_exchange_ids(uuid, jsonb, jsonb, uuid) is
  'ask_save_exchange() and ask_last_answer_id() in one call: saves the question and its answer and returns {conversation_id, answer_id}. The route''s one save round trip.';

revoke all on function public.ask_save_exchange_ids(uuid, jsonb, jsonb, uuid)
  from public, anon;
grant execute on function public.ask_save_exchange_ids(uuid, jsonb, jsonb, uuid)
  to authenticated, service_role;

-- VERIFIED on the live database, 2026-10-15, after the migration ran:
--
-- Privileges: ask_save_exchange_ids, ask_save_exchange and ask_last_answer_id
-- each hold EXECUTE for postgres, authenticated and service_role and nothing
-- for anon or PUBLIC (pg_proc.proacl). The function is SECURITY INVOKER,
-- language sql; its comment is set.
--
-- Probe, as the postgres role with no signed-in user: a call raised
-- insufficient_privilege (42501, ask_save_exchange's "no signed-in user")
-- and ask_messages held the same 100 rows before and after — the wrapper
-- adds no write path of its own. The signed-in path is exercised by the
-- route (tests/ask-orchestration.spec.ts fakes the function; the eval
-- script intercepts it) and by the next Ask question asked in production.
