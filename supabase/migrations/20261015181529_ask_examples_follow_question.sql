-- A thumbs-up example is keyed by (scope, source, user_id, md5(question)), so two
-- thumbed answers to the same question share one row whose message_id is the
-- newer one. Retraction used to delete by message_id alone: taking back the
-- older thumb left the example, taking back the newer deleted it while the
-- older was still up. Now the example follows the QUESTION: it goes only when
-- none of that user's thumbs-up on that question remains, and is re-pointed at
-- the newest remaining one when the answer it named is the one taken back.
--
-- A re-pointed example keeps the sql it was written with: the reply is built
-- in TypeScript (examplePlanReply) and cannot be rebuilt here. Both answers
-- were thumbed up for the same question, so either one teaches it.
--
-- Signatures, SECURITY DEFINER, search_path and grants are unchanged
-- (create or replace keeps the ACL).

create or replace function public.ask_example_from_feedback(
  p_message_id uuid,
  p_sql text,
  p_embedding extensions.vector(768)
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_question text;
  v_program uuid;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'ask_example_from_feedback: no signed-in user'
      using errcode = '42501';
  end if;

  -- FOR SHARE: a retraction racing this write waits, so its trigger sees the
  -- example this call writes rather than deleting before it lands.
  select f.question ->> 'text', f.program_id
    into v_question, v_program
    from public.ask_feedback f
   where f.message_id = p_message_id
     and f.user_id = v_uid
     and f.rating = 'up'
     for share;
  if not found or v_question is null then
    raise exception 'ask_example_from_feedback: not your thumbs-up'
      using errcode = '42501';
  end if;

  insert into public.ask_examples
    (scope, question, sql, source, quality, embedding, user_id, message_id)
  values
    (case when v_program is null then 'personal' else 'team' end,
     v_question, p_sql, 'feedback', 1, p_embedding, v_uid, p_message_id)
  on conflict (scope, source, user_id, md5(question)) do update
     set sql = excluded.sql,
         embedding = excluded.embedding,
         message_id = excluded.message_id,
         updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.ask_examples_follow_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_question text := old.question ->> 'text';
  v_scope text := case when old.program_id is null then 'personal' else 'team' end;
  v_next uuid;
begin
  if tg_op = 'UPDATE' and new.rating is not distinct from 'up' then
    return null;
  end if;

  -- The newest thumbs-up of the same user on the same question in the same
  -- scope that is still up (this row is excluded: deleted, or no longer up).
  select f.message_id
    into v_next
    from public.ask_feedback f
   where f.user_id = old.user_id
     and f.message_id <> old.message_id
     and f.rating = 'up'
     and v_question is not null
     and f.question ->> 'text' = v_question
     and (f.program_id is null) = (old.program_id is null)
   order by f.updated_at desc
   limit 1;

  if v_next is null then
    delete from public.ask_examples e
     where e.source = 'feedback'
       and (e.message_id = old.message_id
            or (v_question is not null
                and e.user_id = old.user_id
                and e.scope = v_scope
                and md5(e.question) = md5(v_question)));
  else
    -- Still taught by a thumb that stands: keep the example, name that answer.
    update public.ask_examples e
       set message_id = v_next,
           updated_at = now()
     where e.source = 'feedback'
       and e.message_id = old.message_id;
  end if;
  return null;
end;
$$;

-- VERIFIED 2026-10-15, live project pouxujkhtbvkdwbzfvka, after apply:
--   supabase_migrations.schema_migrations holds version 20261015181529
--     'ask_examples_follow_question'.
--   Both functions: prosecdef true, search_path="", proacl unchanged
--     {postgres, authenticated, service_role} EXECUTE.
--   A DO block with two thumbs-up on one question and one example on the newer:
--     retracting the older kept the example on the newer, then retracting the
--     newer deleted it; with both up again, retracting the newer kept the
--     example re-pointed at the older, then retracting the older deleted it.
--     The block then raised, and 0 probe rows remained after.
