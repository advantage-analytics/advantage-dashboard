-- ask_save_exchange_ids(): read the answer's id in a statement of its own.
--
-- The function 20261015074911 wrote always answered `answer_id: null` on the
-- live database, found on 2026-10-15 by the first Ask question asked through
-- the Tier 3 branch: the page had no answer id, so the thumbs, "Show me these
-- points" and "Pin to Home" never appeared (the Tier 1b spec fakes the
-- function, so nothing offline could see it).
--
-- Why: the body was LANGUAGE sql, one statement — jsonb_build_object(...)
-- over `from ask_save_exchange(...)`. ask_last_answer_id() is STABLE, and a
-- stable function called inside a statement reads with that statement's
-- snapshot, taken before ask_save_exchange() inserted the rows; the row it
-- was asked for was not visible to it, and it answered null.
--
-- plpgsql runs its statements one after another, each with a fresh snapshot,
-- so the read after the call sees what the call wrote. Same signature, same
-- return shape, same callers (`src/lib/services/ask/ask.ts`, `cache.ts`);
-- ask_save_exchange() and ask_last_answer_id() are untouched. CREATE OR
-- REPLACE keeps the function's ACL (authenticated and service_role, never
-- anon) and its SECURITY INVOKER.
--
-- Applied to the live database on 2026-10-15 as version 20261015145039
-- (`ask_save_exchange_ids_reads_its_own_insert`). VERIFIED: see the end of
-- this file.
create or replace function public.ask_save_exchange_ids(
  p_conversation_id uuid,
  p_question jsonb,
  p_answer jsonb,
  p_program_id uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_conversation_id uuid;
begin
  v_conversation_id := public.ask_save_exchange(
    p_conversation_id, p_question, p_answer, p_program_id
  );
  return jsonb_build_object(
    'conversation_id', v_conversation_id,
    'answer_id', public.ask_last_answer_id(v_conversation_id)
  );
end;
$$;

comment on function public.ask_save_exchange_ids(uuid, jsonb, jsonb, uuid) is
  'Saves one question and answer through ask_save_exchange() and answers {conversation_id, answer_id}. plpgsql on purpose: the id is read in a statement after the insert, which a SQL-language body could not see.';

-- VERIFIED on the live database, 2026-10-15, after the migration ran:
--
-- pg_proc: ask_save_exchange_ids is language plpgsql, SECURITY INVOKER,
-- proacl {postgres=X,authenticated=X,service_role=X} — unchanged from
-- 20261015074911; ask_last_answer_id (sql, stable) and ask_save_exchange
-- (plpgsql, definer) hold the same three grants. The comment is set.
--
-- Probe, rolled back (a DO block that set request.jwt.claims to the eyes-on
-- verifier's id, `set local role authenticated`, called the function with a
-- null conversation id, then raised): it answered
-- {"conversation_id": <new uuid>, "answer_id": <uuid>} and the answer_id
-- named a row of role 'assistant'; ask_messages went 124 → 126 inside the
-- transaction and the raise undid it. Before the migration the same live
-- path had saved two conversations with answer_id null (the smoke run's).
-- Then a real question on the dev server: the thumbs, "Show me these
-- points" and the action cards appeared under the answer.
