-- ask_runs: one row per Ask question asked, whatever became of it.
--
-- Until now only a question that produced an answer left a trace
-- (ask_messages). A plan the guard refused, a reply that could not be
-- parsed, a query the database refused, a cannot_answer, a provider outage,
-- an abandoned stream: none of these were recorded anywhere, so nobody could
-- say how often Ask fails, on what, or how long a question takes at each
-- step (docs/ask-improvement-roadmap.md, 5.3). This table is that record.
--
-- What a row holds is the shape of the run, not its content: the outcome,
-- the route the answer took (the model's own query or one of the server's
-- templates), how many plan attempts and model calls it took, the time each
-- stage took, the visual drawn, the row and match counts, and the model
-- ids. The question's text is kept — the same text ask_messages keeps for an
-- answered question — so a failed question can be read when the failure is
-- investigated; no answer text, no rows, no SQL (those are in ask_messages
-- for an answered question and in the server log for a failed one).
--
-- Owner-only, like ask_messages: a player reads their own runs and writes
-- them only through ask_record_run(), which takes the user from the session.
-- PostHog gets the same shape minus the text, as the product event
-- `ask_run` (src/lib/services/ask/runs.ts), for the dashboard and alerts.
--
-- Applied to the live database on 2026-10-15 as version 20261015083635
-- (`ask_runs`). VERIFIED: see the end of this file.

create table if not exists public.ask_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  program_id uuid references public.programs (id) on delete cascade,
  conversation_id uuid references public.ask_conversations (id) on delete set null,
  question text not null,
  -- done | cannot_answer | no_data | needs_clarification | llm_unavailable
  -- | answer_failed | abandoned
  outcome text not null,
  -- model | review | compare | plays | serve_plus_one | pattern | paired
  -- | two_group | match_list | trend | mock
  route text,
  plan_attempts integer not null default 0,
  model_calls integer not null default 0,
  query_count integer not null default 0,
  pre_stream_ms integer,
  plan_ms integer,
  query_ms integer,
  answer_ms integer,
  to_headline_ms integer,
  total_ms integer,
  visual_kind text,
  row_count integer,
  match_count integer,
  asks_for_advice boolean,
  plan_model text,
  answer_model text,
  mock boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.ask_runs is
  'One row per Ask question asked, answered or not: outcome, route, attempts, per-stage timings, visual and sizes. Written by ask_record_run(); readable by its owner.';

create index if not exists ask_runs_user_created_idx
  on public.ask_runs (user_id, created_at desc);
create index if not exists ask_runs_outcome_created_idx
  on public.ask_runs (outcome, created_at desc);

alter table public.ask_runs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'ask_runs'
       and policyname = 'ask_runs_owner_select'
  ) then
    create policy ask_runs_owner_select on public.ask_runs
      for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

-- No insert, update or delete policy: the one write path is the function
-- below. anon gets nothing (the default-grants sweep leaves new tables
-- unreadable to anon); authenticated reads through the policy.
revoke all on public.ask_runs from anon;
-- The default table grants hand authenticated every privilege on a new
-- table; RLS with no write policy already refuses the writes, but the grant
-- should say the same thing. (Run by hand right after the migration, so the
-- live migration record lacks this one statement.)
revoke insert, update, delete, truncate, references, trigger
  on public.ask_runs from authenticated;
grant select on public.ask_runs to authenticated;
grant select, insert on public.ask_runs to service_role;

create or replace function public.ask_record_run(p_run jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_program uuid := nullif(p_run->>'program_id', '')::uuid;
begin
  if v_uid is null then
    raise exception 'ask_record_run: no signed-in user'
      using errcode = '42501';
  end if;
  if p_run is null or coalesce(p_run->>'outcome', '') = '' then
    raise exception 'ask_record_run: outcome is required'
      using errcode = '22004';
  end if;
  if v_program is not null
     and public.user_program_role(v_program) is null then
    raise exception 'ask_record_run: not a member of that program'
      using errcode = '42501';
  end if;

  insert into public.ask_runs (
    user_id, program_id, conversation_id, question, outcome, route,
    plan_attempts, model_calls, query_count,
    pre_stream_ms, plan_ms, query_ms, answer_ms, to_headline_ms, total_ms,
    visual_kind, row_count, match_count, asks_for_advice,
    plan_model, answer_model, mock
  ) values (
    v_uid,
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

comment on function public.ask_record_run(jsonb) is
  'Records one Ask run for the signed-in user: outcome, route, attempts, per-stage timings, visual and sizes. The one write path into ask_runs.';

revoke all on function public.ask_record_run(jsonb) from public, anon;
grant execute on function public.ask_record_run(jsonb) to authenticated, service_role;

-- VERIFIED on the live database, 2026-10-15, after the migration ran:
-- ask_runs has RLS on with one policy, ask_runs_owner_select (SELECT, to
-- authenticated); grants after the revoke: anon none, authenticated SELECT,
-- service_role SELECT and INSERT; ask_record_run executable by authenticated
-- and service_role only. The signed-in path is exercised by
-- tests/ask-route.spec.ts (the route records every run through db.rpc) and
-- by the next question asked in production.
