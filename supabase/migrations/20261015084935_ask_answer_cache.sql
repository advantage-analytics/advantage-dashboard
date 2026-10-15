-- ask_answer_cache: an answer already computed for the same question over
-- the same data, served again without the model.
--
-- The starter questions (src/lib/services/ask/starters.ts) make the same
-- question recur — "How did my match against X go?" is asked the day the
-- match lands and again the next time the page opens — and nothing about
-- the answer changes until the data does. A hit skips both model calls and
-- the query (docs/ask-improvement-roadmap.md, 2.9): the page gets the saved
-- events back in a few milliseconds, and the question is not charged
-- against the month, since nothing was computed.
--
-- What makes a hit honest is the version: a hash over the viewer's matches
-- in scope and their statistics' update times, read as the signed-in user
-- under RLS (ask_data_version). A rebuild, a new match, a score edit or a
-- deleted match all move it, and a row whose version is not the current one
-- is a miss. Rows older than a day are misses too, whatever their version.
--
-- Owner-only, like ask_messages: a player reads and writes their own rows
-- through the two functions, which take the user from the session. The
-- key is the route's hash of the normalised question, the tag ids and the
-- scope (never the question's text), and the row holds exactly what the
-- route streamed and saved for that question — the same jsonb
-- ask_save_exchange_ids() was handed — so a replay saves the same answer
-- into the conversation it is asked in.
--
-- Applied to the live database on 2026-10-15 as version 20261015084935
-- (`ask_answer_cache`). VERIFIED: see the end of this file.

create table if not exists public.ask_answer_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  program_id uuid references public.programs (id) on delete cascade,
  cache_key text not null,
  data_version text not null,
  -- { events: [...], answer: <ask_save_exchange_ids p_answer> }
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint ask_answer_cache_key unique (user_id, program_id, cache_key)
);

comment on table public.ask_answer_cache is
  'Ask answers kept for a day per (asker, scope, question key, data version), replayed without the model while the data is unchanged. Read and written only through ask_cache_get() and ask_cache_put().';

create index if not exists ask_answer_cache_created_idx
  on public.ask_answer_cache (created_at);

alter table public.ask_answer_cache enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'ask_answer_cache'
       and policyname = 'ask_answer_cache_owner_select'
  ) then
    create policy ask_answer_cache_owner_select on public.ask_answer_cache
      for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

revoke all on public.ask_answer_cache from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.ask_answer_cache from authenticated;
grant select on public.ask_answer_cache to authenticated;
grant select, insert, update, delete on public.ask_answer_cache to service_role;

-- The version of the data a question's answer rests on: the viewer's
-- matches in the scope — their ids, dates, scores, seats and hands, which
-- is what an edit to a match changes — and when their statistics were last
-- written, which every import, rebuild and label publish moves. Read under
-- RLS as the signed-in user, so it covers exactly what the viewer can see.
-- Null for a signed-out caller. (matches has no updated_at column.)
create or replace function public.ask_data_version(p_program_id uuid default null)
returns text
language sql
stable
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
   where (select auth.uid()) is not null
     and case
           when p_program_id is null then
             m.created_by = (select auth.uid()) and m.program_id is null
           else
             m.program_id = p_program_id
         end;
$$;

comment on function public.ask_data_version(uuid) is
  'A hash over the viewer''s matches in a scope and their statistics'' update times: the data version an Ask answer rests on.';

create or replace function public.ask_cache_get(
  p_cache_key text,
  p_data_version text,
  p_program_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select c.payload
    from public.ask_answer_cache c
   where c.user_id = (select auth.uid())
     and c.program_id is not distinct from p_program_id
     and c.cache_key = p_cache_key
     and c.data_version = p_data_version
     and c.created_at > now() - interval '1 day'
   limit 1;
$$;

comment on function public.ask_cache_get(text, text, uuid) is
  'The cached Ask answer for the signed-in user, scope, key and data version, when it is under a day old; null otherwise.';

create or replace function public.ask_cache_put(
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
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'ask_cache_put: no signed-in user'
      using errcode = '42501';
  end if;
  if p_program_id is not null
     and public.user_program_role(p_program_id) is null then
    raise exception 'ask_cache_put: not a member of that program'
      using errcode = '42501';
  end if;
  insert into public.ask_answer_cache
    (user_id, program_id, cache_key, data_version, payload)
  values (v_uid, p_program_id, p_cache_key, p_data_version, p_payload)
  on conflict (user_id, program_id, cache_key) do update
     set data_version = excluded.data_version,
         payload = excluded.payload,
         created_at = now();
  -- Keep the table small: this user's rows older than a day are dead.
  delete from public.ask_answer_cache
   where user_id = v_uid and created_at < now() - interval '1 day';
end;
$$;

comment on function public.ask_cache_put(text, text, jsonb, uuid) is
  'Stores (or refreshes) the signed-in user''s cached Ask answer for a key and data version, and drops their rows older than a day.';

revoke all on function public.ask_data_version(uuid) from public, anon;
revoke all on function public.ask_cache_get(text, text, uuid) from public, anon;
revoke all on function public.ask_cache_put(text, text, jsonb, uuid) from public, anon;
grant execute on function public.ask_data_version(uuid) to authenticated, service_role;
grant execute on function public.ask_cache_get(text, text, uuid) to authenticated, service_role;
grant execute on function public.ask_cache_put(text, text, jsonb, uuid) to authenticated, service_role;

-- VERIFIED on the live database, 2026-10-15, after the migration ran: the
-- table has RLS on with one policy, ask_answer_cache_owner_select (SELECT,
-- to authenticated); grants: anon none, authenticated SELECT, service_role
-- all; ask_data_version, ask_cache_get and ask_cache_put executable by
-- authenticated and service_role only. (A first apply failed on
-- matches.updated_at, which does not exist; the version hashes the match's
-- own columns instead, as above. Nothing of that attempt was applied.)
