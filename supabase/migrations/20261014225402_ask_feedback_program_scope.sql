-- Kept Ask feedback stays behind team membership, like the messages it copies.
--
-- 20261014205215_ask_feedback_keep made every feedback row keep a copy of
-- its question and answer, and outlive the conversation. Its read policy
-- checked only the author (user_id = auth.uid()). But ask_messages was
-- deliberately tightened in 20261012223023_ask_team_scope_membership: a team
-- conversation is readable only while the reader is still a member of the
-- program. So a coach or player who left a program could still read that
-- program's Ask answers through ask_feedback — found by /pr-check on #443.
--
--   - program_id: the conversation's program (null for a personal one),
--     copied when the thumb is set, so the rule holds after the conversation
--     is deleted too. Backfilled for the rows already there.
--   - The read policy gains the same membership clause as ask_messages.
--   - ask_set_feedback() records it.
--
-- Applied to the live database on 2026-10-14 as version 20261014225402
-- (`ask_feedback_program_scope`). VERIFIED: the policy reads as above; both
-- existing rows were backfilled with their program; a current member still
-- reads their team rows and user_program_role() is null for a non-member.

alter table public.ask_feedback
  add column program_id uuid references public.programs(id) on delete cascade;

update public.ask_feedback f
   set program_id = c.program_id
  from public.ask_messages m
  join public.ask_conversations c on c.id = m.conversation_id
 where m.id = f.message_id;

comment on column public.ask_feedback.program_id is
  'The program of the conversation the thumb was given in; null for a personal conversation. A team row is readable only while its author is a member.';

drop policy if exists ask_feedback_select on public.ask_feedback;
create policy ask_feedback_select on public.ask_feedback
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and (
      program_id is null
      or public.user_program_role(program_id) is not null
    )
  );

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
  v_program uuid;
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

  select q.content into v_question
    from public.ask_messages q
   where q.conversation_id = v_answer.conversation_id
     and q.role = 'user'
     and q.created_at = v_answer.created_at
   limit 1;

  select c.program_id into v_program
    from public.ask_conversations c
   where c.id = v_answer.conversation_id;

  insert into public.ask_feedback
    (message_id, user_id, rating, reasons, note, question, answer, program_id)
  values (
    p_message_id,
    v_uid,
    p_rating,
    case when p_rating = 'down' then coalesce(p_reasons, '{}') else '{}' end,
    case when p_rating = 'down' then v_note end,
    v_question,
    v_answer.content,
    v_program
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
