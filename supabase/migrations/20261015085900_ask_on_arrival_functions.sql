-- The server-only variants Ask needs to answer on a player's behalf.
--
-- When a match video finishes processing, Ask asks its first question
-- about it for the player who sent it — "How did my match against X go?",
-- the same wording the starter under the composer uses — so the answer is
-- waiting in their rail, and in the cache under that starter's key, before
-- they open the page (docs/ask-improvement-roadmap.md, 6.2). The vendor's
-- webhook has no session: auth.uid() is null there, and the four functions
-- the route writes through refuse without one. These are the same writes
-- with the user named by the caller, executable by service_role alone, so
-- only the server can name one — the same shape as ask_release_question
-- (p_user_id) and the three query functions (p_viewer).
--
-- ask_save_exchange_as() calls ask_save_exchange()'s logic with the named
-- user; it is restated rather than wrapped because the original reads
-- auth.uid() inside. ask_record_run_as(), ask_cache_put_as() and
-- ask_data_version_as() do the same for their originals. Nothing changes
-- for a signed-in call: the originals are untouched.
--
-- Applied to the live database on 2026-10-15 as version 20261015085900
-- (`ask_on_arrival_functions`). VERIFIED: see the end of this file.

create or replace function public.ask_save_exchange_as(
  p_user_id uuid,
  p_conversation_id uuid,
  p_question jsonb,
  p_answer jsonb,
  p_program_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation_id uuid := p_conversation_id;
  v_answer_id uuid;
  v_title text;
begin
  if p_user_id is null then
    raise exception 'ask_save_exchange_as: user is required'
      using errcode = '22004';
  end if;
  if p_question is null or p_answer is null then
    raise exception 'ask_save_exchange_as: question and answer are required'
      using errcode = '22004';
  end if;
  if p_program_id is not null and not exists (
    select 1 from public.program_members pm
     where pm.program_id = p_program_id and pm.user_id = p_user_id
  ) then
    raise exception 'ask_save_exchange_as: not a member of that program'
      using errcode = '42501';
  end if;

  if v_conversation_id is null then
    v_title := left(btrim(regexp_replace(
      coalesce(p_question->>'text', ''), '\s+', ' ', 'g')), 120);
    if v_title = '' then
      v_title := 'Untitled question';
    end if;
    insert into public.ask_conversations (user_id, title, program_id)
    values (p_user_id, v_title, p_program_id)
    returning id into v_conversation_id;
  else
    perform 1
      from public.ask_conversations
     where id = v_conversation_id
       and user_id = p_user_id
       and program_id is not distinct from p_program_id
       for update;
    if not found then
      raise exception 'ask_save_exchange_as: conversation is not the user''s'
        using errcode = '42501';
    end if;
  end if;

  insert into public.ask_messages (conversation_id, user_id, role, content)
  values (v_conversation_id, p_user_id, 'user', p_question);
  insert into public.ask_messages (conversation_id, user_id, role, content)
  values (v_conversation_id, p_user_id, 'assistant', p_answer)
  returning id into v_answer_id;

  update public.ask_conversations
     set updated_at = now()
   where id = v_conversation_id;

  return jsonb_build_object(
    'conversation_id', v_conversation_id,
    'answer_id', v_answer_id
  );
end;
$$;

create or replace function public.ask_record_run_as(p_user_id uuid, p_run jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_program uuid := nullif(p_run->>'program_id', '')::uuid;
begin
  if p_user_id is null then
    raise exception 'ask_record_run_as: user is required'
      using errcode = '22004';
  end if;
  if p_run is null or coalesce(p_run->>'outcome', '') = '' then
    raise exception 'ask_record_run_as: outcome is required'
      using errcode = '22004';
  end if;

  insert into public.ask_runs (
    user_id, program_id, conversation_id, question, outcome, route,
    plan_attempts, model_calls, query_count,
    pre_stream_ms, plan_ms, query_ms, answer_ms, to_headline_ms, total_ms,
    visual_kind, row_count, match_count, asks_for_advice,
    plan_model, answer_model, mock
  ) values (
    p_user_id,
    v_program,
    nullif(p_run->>'conversation_id', '')::uuid,
    left(coalesce(p_run->>'question', ''), 1000),
    left(p_run->>'outcome', 40),
    left(p_run->>'route', 40),
    coalesce((p_run->>'plan_attempts')::integer, 0),
    coalesce((p_run->>'model_calls')::integer, 0),
    coalesce((p_run->>'query_count')::integer, 0),
    (p_run->>'pre_stream_ms')::integer,
    (p_run->>'plan_ms')::integer,
    (p_run->>'query_ms')::integer,
    (p_run->>'answer_ms')::integer,
    (p_run->>'to_headline_ms')::integer,
    (p_run->>'total_ms')::integer,
    left(p_run->>'visual_kind', 40),
    (p_run->>'row_count')::integer,
    (p_run->>'match_count')::integer,
    (p_run->>'asks_for_advice')::boolean,
    left(p_run->>'plan_model', 80),
    left(p_run->>'answer_model', 80),
    coalesce((p_run->>'mock')::boolean, false)
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.ask_cache_put_as(
  p_user_id uuid,
  p_cache_key text,
  p_data_version text,
  p_payload jsonb,
  p_program_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'ask_cache_put_as: user is required'
      using errcode = '22004';
  end if;
  insert into public.ask_answer_cache
    (user_id, program_id, cache_key, data_version, payload)
  values (p_user_id, p_program_id, p_cache_key, p_data_version, p_payload)
  on conflict (user_id, program_id, cache_key) do update
     set data_version = excluded.data_version,
         payload = excluded.payload,
         created_at = now();
  delete from public.ask_answer_cache
   where user_id = p_user_id and created_at < now() - interval '1 day';
end;
$$;

create or replace function public.ask_data_version_as(
  p_user_id uuid,
  p_program_id uuid default null
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select md5(coalesce(string_agg(
           m.id::text || ':' || coalesce(m.date::text, '')
             || ':' || coalesce(m.score::text, '')
             || ':' || coalesce(m.player1_id::text, '')
             || ':' || coalesce(m.player2_id::text, '')
             || ':' || coalesce(m.player_hand, '')
             || ':' || coalesce(m.opponent_hand, '')
             || ':' || coalesce(s.updated_at::text, ''),
           ',' order by m.id), ''))
    from public.matches m
    left join public.match_stats s on s.match_id = m.id
   where p_user_id is not null
     and case
           when p_program_id is null then
             m.created_by = p_user_id and m.program_id is null
           else
             m.program_id = p_program_id
         end;
$$;

comment on function public.ask_save_exchange_as(uuid, uuid, jsonb, jsonb, uuid) is
  'ask_save_exchange_ids() for a named user: the server''s write when Ask answers on a player''s behalf (a match that just finished processing). service_role only.';
comment on function public.ask_record_run_as(uuid, jsonb) is
  'ask_record_run() for a named user. service_role only.';
comment on function public.ask_cache_put_as(uuid, text, text, jsonb, uuid) is
  'ask_cache_put() for a named user. service_role only.';
comment on function public.ask_data_version_as(uuid, uuid) is
  'ask_data_version() for a named user. service_role only.';

revoke all on function public.ask_save_exchange_as(uuid, uuid, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.ask_record_run_as(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.ask_cache_put_as(uuid, text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.ask_data_version_as(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ask_save_exchange_as(uuid, uuid, jsonb, jsonb, uuid) to service_role;
grant execute on function public.ask_record_run_as(uuid, jsonb) to service_role;
grant execute on function public.ask_cache_put_as(uuid, text, text, jsonb, uuid) to service_role;
grant execute on function public.ask_data_version_as(uuid, uuid) to service_role;

-- VERIFIED (live, 2026-10-15, after apply_migration recorded version
-- 20261015085900):
--   select proname, proacl from pg_proc where proname like 'ask_%_as'
--     ask_cache_put_as      {postgres=X/postgres,service_role=X/postgres}
--     ask_data_version_as   {postgres=X/postgres,service_role=X/postgres}
--     ask_record_run_as     {postgres=X/postgres,service_role=X/postgres}
--     ask_save_exchange_as  {postgres=X/postgres,service_role=X/postgres}
--   so neither anon nor authenticated can execute any of the four.
--   ask_save_exchange()'s live body was read back beside this file:
--   ask_save_exchange_as() restates it line for line with p_user_id in
--   place of auth.uid() (the membership test reads program_members
--   directly, which is what user_program_role() reads).
