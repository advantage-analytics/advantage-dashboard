-- A thumbs up or down on one Ask answer, so a bad answer can be read later
-- with the whole exchange beside it: the answer row (`ask_messages`) already
-- holds the question, the answer and the SQL that produced it, so feedback
-- stores only the verdict and points at that row.
--
-- One row per answer, written by the player who asked it. A thumbs down may
-- carry reasons from a fixed list and a short note; a thumbs up carries
-- neither. Taking the thumb back deletes the row. Deleting the conversation
-- deletes its feedback with it (the messages cascade): a player who removes a
-- thread removes what they said about it too.
--
-- Applied to the live database on 2026-10-14 as version 20261014203258
-- (`ask_feedback`). VERIFIED in a rolled-back transaction as an answer's
-- owner: up drops reasons and note, down keeps them, a direct insert is
-- refused (42501), null deletes, another user is refused and reads no id.

create table public.ask_feedback (
  message_id  uuid primary key references public.ask_messages(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  rating      text not null check (rating in ('up', 'down')),
  reasons     text[] not null default '{}'
    check (
      reasons <@ array['wrong_numbers', 'misread', 'not_useful', 'other']::text[]
      and (rating = 'down' or cardinality(reasons) = 0)
    ),
  note        text check (
    note is null
    or (rating = 'down' and char_length(note) between 1 and 500)
  ),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.ask_feedback is
  'A thumbs up or down on one Ask answer (ask_messages, role assistant), by the player who asked it; a down may carry reasons and a note.';

create index ask_feedback_user_idx on public.ask_feedback (user_id);
create index ask_feedback_down_idx on public.ask_feedback (updated_at desc)
  where rating = 'down';

-- Owner-only reads, no write policy: writes go through ask_set_feedback().
alter table public.ask_feedback enable row level security;

create policy ask_feedback_select on public.ask_feedback
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.ask_feedback from public, anon, authenticated;
grant select on public.ask_feedback to authenticated;
grant all on public.ask_feedback to service_role;

-- Set, change or take back the caller's thumb on one of their own answers.
-- A null rating deletes it. Refuses a message that is not the caller's or is
-- not an answer alike, so an id cannot be used to probe.
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
begin
  if v_uid is null then
    raise exception 'ask_set_feedback: no signed-in user'
      using errcode = '42501';
  end if;

  perform 1
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

  insert into public.ask_feedback (message_id, user_id, rating, reasons, note)
  values (
    p_message_id,
    v_uid,
    p_rating,
    case when p_rating = 'down' then coalesce(p_reasons, '{}') else '{}' end,
    case when p_rating = 'down' then v_note end
  )
  on conflict (message_id) do update
     set rating = excluded.rating,
         reasons = excluded.reasons,
         note = excluded.note,
         updated_at = now();
end;
$$;

-- The id of the newest answer in one of the caller's conversations, read
-- right after ask_save_exchange() so the stream's `done` can name the answer
-- a thumb will point at. Invoker rights: RLS limits it to the caller's rows.
-- ask_save_exchange() locks the conversation, and the page sends one question
-- at a time, so the newest answer is the one just saved.
create or replace function public.ask_last_answer_id(p_conversation_id uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select id
    from public.ask_messages
   where conversation_id = p_conversation_id
     and user_id = (select auth.uid())
     and role = 'assistant'
   order by created_at desc
   limit 1;
$$;

revoke execute on function public.ask_set_feedback(uuid, text, text[], text) from public, anon;
revoke execute on function public.ask_last_answer_id(uuid) from public, anon;
grant execute on function public.ask_set_feedback(uuid, text, text[], text) to authenticated, service_role;
grant execute on function public.ask_last_answer_id(uuid) to authenticated, service_role;
