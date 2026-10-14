-- Keep Ask feedback when its conversation is deleted.
--
-- Until now an ask_feedback row went with its answer: deleting a conversation
-- cascaded to its messages and from them to their feedback, so a player who
-- marked an answer wrong and then cleared the thread took the only record of
-- it with them. Decided 2026-10-14: a thumb keeps a copy of the exchange it
-- was given on, and survives the conversation. The answer's control says so
-- (ask-feedback.tsx), so "kept to improve Ask" is what the player was told.
--
--   - question / answer: the two ask_messages contents, copied when the thumb
--     is set — the answer row already holds the SQL that produced it.
--   - message_id: now nullable, set null when the message goes; the row's own
--     id is the key. Still unique, so one thumb per answer and PostgREST
--     still embeds it one-to-one on a conversation read.
--   - user_id keeps its cascade: deleting the account deletes the feedback.
--
-- Applied to the live database on 2026-10-14 as version 20261014205215
-- (`ask_feedback_keep`); the existing rows were backfilled. VERIFIED in a
-- rolled-back transaction: a new thumb copies both contents, a change keeps
-- one row, and deleting the conversation leaves the row with message_id null,
-- still readable by its owner.

alter table public.ask_feedback
  add column id uuid not null default gen_random_uuid(),
  add column question jsonb,
  add column answer jsonb;

-- The rows already there take their copy now, while their messages exist.
update public.ask_feedback f
   set answer = a.content,
       question = (
         select q.content
           from public.ask_messages q
          where q.conversation_id = a.conversation_id
            and q.role = 'user'
            and q.created_at = a.created_at
          limit 1
       )
  from public.ask_messages a
 where a.id = f.message_id;

alter table public.ask_feedback
  alter column answer set not null,
  drop constraint ask_feedback_pkey,
  add constraint ask_feedback_pkey primary key (id),
  alter column message_id drop not null,
  drop constraint ask_feedback_message_id_fkey,
  add constraint ask_feedback_message_id_fkey
    foreign key (message_id) references public.ask_messages(id) on delete set null,
  add constraint ask_feedback_message_id_key unique (message_id);

comment on table public.ask_feedback is
  'A thumbs up or down on one Ask answer, by the player who asked it, with a copy of the question and answer; kept when the conversation is deleted (message_id goes null), removed with the account.';
comment on column public.ask_feedback.question is
  'The question''s ask_messages content when the thumb was set; null only if it could not be found.';
comment on column public.ask_feedback.answer is
  'The answer''s ask_messages content when the thumb was set, including the SQL behind it.';

-- As before, plus the copy. Taking a thumb back still deletes the row: that
-- is the player withdrawing it, not deleting a conversation.
create or replace function public.ask_set_feedback(
  p_message_id uuid,
  p_rating text,
  p_reasons text[] default '{}',
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_answer public.ask_messages%rowtype;
  v_question jsonb;
begin
  if v_uid is null then
    raise exception 'ask_set_feedback: no signed-in user'
      using errcode = '42501';
  end if;

  select * into v_answer
    from public.ask_messages
   where id = p_message_id and user_id = v_uid and role = 'assistant';
  if not found then
    raise exception 'ask_set_feedback: not your answer'
      using errcode = '42501';
  end if;

  if p_rating is null then
    delete from public.ask_feedback where message_id = p_message_id;
    return;
  end if;

  -- ask_save_exchange() inserts the pair in one statement: same created_at.
  select q.content into v_question
    from public.ask_messages q
   where q.conversation_id = v_answer.conversation_id
     and q.role = 'user'
     and q.created_at = v_answer.created_at
   limit 1;

  insert into public.ask_feedback
    (message_id, user_id, rating, reasons, note, question, answer)
  values (
    p_message_id,
    v_uid,
    p_rating,
    case when p_rating = 'down' then coalesce(p_reasons, '{}') else '{}' end,
    case when p_rating = 'down' then v_note end,
    v_question,
    v_answer.content
  )
  on conflict (message_id) do update
     set rating = excluded.rating,
         reasons = excluded.reasons,
         note = excluded.note,
         updated_at = now();
end;
$$;

revoke execute on function public.ask_set_feedback(uuid, text, text[], text) from public, anon;
grant execute on function public.ask_set_feedback(uuid, text, text[], text) to authenticated, service_role;
