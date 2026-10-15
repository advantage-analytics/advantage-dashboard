-- ask_pins: an answer's visual, kept on Home.
--
-- An Ask answer may carry one visual block (serve placement, a trend, a
-- table). A player who wants to keep one -- "my first-serve trend" -- had
-- nowhere to put it: the answer lives in a conversation under "Earlier
-- questions". A pin is a copy of that block, with its caption, shown on
-- Home as "Pinned from Ask" (docs/ask-improvement-roadmap.md, 3.11).
--
-- A copy, not a reference: the block is read when the pin is made, so a
-- conversation deleted later leaves the pin standing (conversation_id and
-- answer_id go null) and the card never reads ask_messages. The copy is
-- made by ask_pin_answer() from the caller's own answer row -- there is no
-- insert policy, so nothing in the browser can write an arbitrary block.
--
--   - user_id: the owner. Owner-only reads and deletes.
--   - program_id: the conversation's program, null for a personal one. A
--     team pin is readable only while the owner is still a member, the same
--     clause ask_messages and ask_feedback carry. Today only the personal
--     Home draws pins; the column scopes a team pin from the start.
--   - conversation_id / answer_id: where it came from, for the card's
--     "Open in Ask"; set null when the source goes.
--   - visual: the block, as ask_messages.content->'visual' held it.
--   - caption: the card's line -- the block's own caption, else the headline.
--
-- One pin per answer per owner: pinning twice answers the existing pin.
--
-- Applied to the live database on 2026-10-15 as version 20261015094823
-- (`ask_pins`). VERIFIED: see the end of this file.

create table if not exists public.ask_pins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  program_id uuid references public.programs (id) on delete cascade,
  conversation_id uuid references public.ask_conversations (id) on delete set null,
  answer_id uuid references public.ask_messages (id) on delete set null,
  visual jsonb not null check (jsonb_typeof(visual) = 'object'),
  caption text not null check (char_length(caption) between 1 and 200),
  created_at timestamptz not null default now()
);

comment on table public.ask_pins is
  'A copy of one Ask answer''s visual block, pinned by its asker to Home; survives the conversation (answer_id goes null), removed with the account.';

create unique index if not exists ask_pins_user_answer_key
  on public.ask_pins (user_id, answer_id) where answer_id is not null;
create index if not exists ask_pins_user_created_idx
  on public.ask_pins (user_id, program_id, created_at desc);

alter table public.ask_pins enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'ask_pins'
       and policyname = 'ask_pins_owner_select'
  ) then
    create policy ask_pins_owner_select on public.ask_pins
      for select to authenticated
      using (
        user_id = (select auth.uid())
        and (program_id is null or public.user_program_role(program_id) is not null)
      );
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'ask_pins'
       and policyname = 'ask_pins_owner_delete'
  ) then
    create policy ask_pins_owner_delete on public.ask_pins
      for delete to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

-- anon gets nothing; authenticated reads and deletes its own rows and
-- writes only through ask_pin_answer(); service_role keeps everything.
revoke all on public.ask_pins from anon;
revoke insert, update, truncate, references, trigger
  on public.ask_pins from authenticated;
grant select, delete on public.ask_pins to authenticated;
grant all on public.ask_pins to service_role;

-- Pin one of the caller's own answers: copies its visual block. Refuses a
-- message that is not the caller's, not an answer, or has no block, and a
-- team answer once the caller has left the program. Pinning an answer twice
-- keeps the one pin (caption refreshed) and answers its id.
create or replace function public.ask_pin_answer(
  p_answer_id uuid,
  p_caption text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_answer public.ask_messages%rowtype;
  v_program uuid;
  v_visual jsonb;
  v_caption text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'ask_pin_answer: no signed-in user'
      using errcode = '42501';
  end if;

  select * into v_answer
    from public.ask_messages
   where id = p_answer_id and user_id = v_uid and role = 'assistant';
  if not found then
    raise exception 'ask_pin_answer: not your answer'
      using errcode = '42501';
  end if;

  v_visual := v_answer.content -> 'visual';
  if v_visual is null or jsonb_typeof(v_visual) <> 'object' then
    raise exception 'ask_pin_answer: the answer has no visual'
      using errcode = '22023';
  end if;

  select program_id into v_program
    from public.ask_conversations
   where id = v_answer.conversation_id;
  if v_program is not null and public.user_program_role(v_program) is null then
    raise exception 'ask_pin_answer: not a member of the program'
      using errcode = '42501';
  end if;

  v_caption := left(coalesce(
    nullif(btrim(coalesce(p_caption, '')), ''),
    nullif(btrim(coalesce(v_visual ->> 'caption', '')), ''),
    nullif(btrim(coalesce(v_answer.content ->> 'headline', '')), ''),
    'Pinned from Ask'
  ), 200);

  insert into public.ask_pins
    (user_id, program_id, conversation_id, answer_id, visual, caption)
  values
    (v_uid, v_program, v_answer.conversation_id, p_answer_id, v_visual, v_caption)
  on conflict (user_id, answer_id) where answer_id is not null
  do update set caption = excluded.caption
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.ask_pin_answer(uuid, text) from public, anon;
grant execute on function public.ask_pin_answer(uuid, text) to authenticated, service_role;

-- VERIFIED on the live database, 2026-10-15, after the migration ran:
-- ask_pins has RLS on with ask_pins_owner_select and ask_pins_owner_delete
-- (to authenticated); grants after the revoke: anon none, authenticated
-- SELECT and DELETE, service_role everything; ask_pin_answer executable by
-- authenticated and service_role only. In a rolled-back transaction as the
-- owner of an answer carrying a serve block: ask_pin_answer() returned a pin
-- whose caption was the block's own, a second call returned the same id, a
-- direct insert was refused (42501); as another signed-in user,
-- ask_pin_answer() on that answer was refused (42501) and the owner's pins
-- read as none.
