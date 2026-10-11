-- Saved Ask conversations (work/personal-ask-page design, "Database → Tables"
-- and "Data flow"): one row per conversation, one row per message, both read
-- by their owner only. Every write goes through the two definer functions
-- below so a browser session can never append to, retitle or delete a
-- conversation it does not own — and so deleting one cannot touch
-- `ask_usage`, which is why the question limit lives in its own table.
--
-- `ask_messages.content` is opaque jsonb. For a question it holds the text
-- and the resolved tags; for an answer the headline, figures, body, the match
-- ids it was computed from and the SQL that produced it. The function stores
-- what it is handed and does not validate the inner shape.
--
-- Applied to the live database on 2026-10-11 as version 20261011191453
-- (`ask_conversations`).

create table public.ask_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.ask_conversations is
  'An Ask thread: one row per saved conversation, owned by the player who asked.';

create index ask_conversations_user_updated_idx
  on public.ask_conversations (user_id, updated_at desc);

create table public.ask_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.ask_conversations(id) on delete cascade,
  user_id          uuid not null references public.users(id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          jsonb not null,
  created_at       timestamptz not null default now()
);

comment on table public.ask_messages is
  'One question or one answer in an Ask conversation; content is the saved exchange, frozen as it was said.';

create index ask_messages_conversation_created_idx
  on public.ask_messages (conversation_id, created_at);

-- Owner-only reads; no insert, update or delete policy for any role. Writes
-- happen only inside ask_save_exchange / ask_delete_conversation, which run
-- as their definer and bypass these policies.
alter table public.ask_conversations enable row level security;
alter table public.ask_messages enable row level security;

create policy ask_conversations_select on public.ask_conversations
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy ask_messages_select on public.ask_messages
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Supabase's default privileges grant ALL to anon and authenticated on every
-- new table. Start from nothing: select for the owner (RLS narrows it), all
-- for the service role.
revoke all on public.ask_conversations from public, anon, authenticated;
revoke all on public.ask_messages from public, anon, authenticated;
grant select on public.ask_conversations to authenticated;
grant select on public.ask_messages to authenticated;
grant all on public.ask_conversations to service_role;
grant all on public.ask_messages to service_role;

-- Save one question-and-answer pair in one transaction. With no conversation
-- id, a conversation is created and titled from the question's text; with
-- one, it must be the caller's. Returns the conversation id either way.
create or replace function public.ask_save_exchange(
  p_conversation_id uuid,
  p_question jsonb,
  p_answer jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_conversation_id uuid := p_conversation_id;
  v_title text;
begin
  if v_uid is null then
    raise exception 'ask_save_exchange: no signed-in user'
      using errcode = '42501';
  end if;
  if p_question is null or p_answer is null then
    raise exception 'ask_save_exchange: question and answer are required'
      using errcode = '22004';
  end if;

  if v_conversation_id is null then
    -- The question's text, one line, cut to fit the title check.
    v_title := left(btrim(regexp_replace(
      coalesce(p_question->>'text', ''), '\s+', ' ', 'g')), 120);
    if v_title = '' then
      v_title := 'Untitled question';
    end if;
    insert into public.ask_conversations (user_id, title)
    values (v_uid, v_title)
    returning id into v_conversation_id;
  else
    -- Take the row lock so two follow-ups on one thread serialise, and refuse
    -- a conversation that is not the caller's (or does not exist) alike.
    perform 1
      from public.ask_conversations
     where id = v_conversation_id and user_id = v_uid
       for update;
    if not found then
      raise exception 'ask_save_exchange: conversation is not yours'
        using errcode = '42501';
    end if;
  end if;

  insert into public.ask_messages (conversation_id, user_id, role, content)
  values
    (v_conversation_id, v_uid, 'user', p_question),
    (v_conversation_id, v_uid, 'assistant', p_answer);

  update public.ask_conversations
     set updated_at = now()
   where id = v_conversation_id;

  return v_conversation_id;
end;
$$;

-- Delete the caller's own conversation (its messages cascade). True when a
-- row went; false when there was none the caller owns. Never touches
-- ask_usage: a deleted thread does not hand questions back.
create or replace function public.ask_delete_conversation(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'ask_delete_conversation: no signed-in user'
      using errcode = '42501';
  end if;
  delete from public.ask_conversations
   where id = p_id and user_id = v_uid;
  return found;
end;
$$;

-- 20261001184305's default already keeps new functions from anon; the revoke
-- is written out so the grant set reads whole here.
revoke execute on function public.ask_save_exchange(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.ask_delete_conversation(uuid) from public, anon;
grant execute on function public.ask_save_exchange(uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.ask_delete_conversation(uuid) to authenticated, service_role;
