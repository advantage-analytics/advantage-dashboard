-- Ask roadmap 1.6, dynamic few-shot from rated answers.
--
-- Applied live through the Supabase connector on 2026-10-15 as version
-- 20261015094614 (`apply_migration`, name `ask_examples`); this file is the
-- repo's copy of exactly what ran.
--
-- A rated (question → plan) pair is embedded (gemini-embedding-001, 768
-- dimensions, `src/lib/llm/embeddings.ts`) and stored here; the plan step
-- retrieves the nearest three for each new question and shows them to the
-- planner beside the fixed worked examples (`src/lib/services/ask/examples.ts`).
--
-- Who sees what. A row with user_id null is SHARED: an eval or seed pair
-- whose names are placeholders. A row with a user_id is one player's own
-- thumbs-up, shown to that player's planner only, so a question that names
-- somebody's opponent never reaches another account's prompt.
--
-- Access. RLS on, no policy, no grant to any role: the table is reached
-- only through the four functions below. `ask_similar_examples` and
-- `ask_example_upsert` are service_role-only (the route calls the first
-- with the session user's id pinned as p_viewer, the seed script the
-- second); `ask_feedback_pair` and `ask_example_from_feedback` run as the
-- signed-in user over their own feedback row. A thumb taken back or turned
-- down removes its example through the trigger.

create extension if not exists vector with schema extensions;

create table public.ask_examples (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('personal', 'team')),
  question text not null check (char_length(question) between 1 and 1000),
  sql text not null check (char_length(sql) between 1 and 8000),
  source text not null check (source in ('feedback', 'eval', 'seed')),
  quality smallint not null default 1 check (quality between 0 and 5),
  embedding extensions.vector(768) not null,
  user_id uuid references auth.users (id) on delete cascade,
  message_id uuid references public.ask_messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ask_examples_feedback_is_owned
    check (source <> 'feedback' or (user_id is not null and message_id is not null))
);

comment on table public.ask_examples is
  'Rated (question → planner reply) pairs for Ask''s plan prompt, embedded for similarity retrieval. user_id null = shared placeholder example; set = one player''s own thumbs-up, shown to them alone.';
comment on column public.ask_examples.scope is 'Which plan prompt the pair belongs to: personal or team.';
comment on column public.ask_examples.question is 'The question as asked (names replaced by placeholders on a shared row).';
comment on column public.ask_examples.sql is 'The planner reply for it, as the JSON the prompt shows: {scope_sql, sql}, or the compare / review form.';
comment on column public.ask_examples.source is 'feedback: a thumbs-up; eval: a pair from the eval lists; seed: the prompt''s own worked examples.';
comment on column public.ask_examples.quality is '0–5; retrieval breaks similarity ties on it.';
comment on column public.ask_examples.embedding is 'gemini-embedding-001 of the question, 768 dimensions, unit length.';
comment on column public.ask_examples.user_id is 'Null for a shared example; otherwise the one account that may be shown it.';
comment on column public.ask_examples.message_id is 'The rated answer a feedback example came from; removed with its thumb.';

-- One row per (scope, source, owner, question); null owners collapse to one.
create unique index ask_examples_one_per_question
  on public.ask_examples (scope, source, user_id, md5(question)) nulls not distinct;
create index ask_examples_embedding_idx
  on public.ask_examples using hnsw (embedding extensions.vector_cosine_ops);
create index ask_examples_user_idx on public.ask_examples (user_id) where user_id is not null;
create index ask_examples_message_idx on public.ask_examples (message_id) where message_id is not null;

alter table public.ask_examples enable row level security;
revoke all on table public.ask_examples from public, anon, authenticated, service_role;

-- ── Retrieval (service_role only; the route pins p_viewer to the session user) ──

create or replace function public.ask_similar_examples(
  p_embedding extensions.vector(768),
  p_scope text,
  p_limit integer,
  p_viewer uuid
)
returns table (question text, sql text, source text, similarity double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select e.question,
         e.sql,
         e.source,
         1 - (e.embedding operator(extensions.<=>) p_embedding) as similarity
    from public.ask_examples e
   where e.scope = p_scope
     and (e.user_id is null or e.user_id = p_viewer)
   order by e.embedding operator(extensions.<=>) p_embedding,
            e.quality desc,
            e.created_at desc
   limit greatest(1, least(coalesce(p_limit, 3), 10));
$$;

comment on function public.ask_similar_examples(extensions.vector, text, integer, uuid) is
  'The nearest examples to an embedded question for one plan prompt: shared rows and p_viewer''s own. service_role only; POST /api/ask passes its session user as p_viewer.';

revoke execute on function public.ask_similar_examples(extensions.vector, text, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.ask_similar_examples(extensions.vector, text, integer, uuid)
  to service_role;

-- ── Upsert (service_role only; the seed script) ──

create or replace function public.ask_example_upsert(
  p_scope text,
  p_question text,
  p_sql text,
  p_source text,
  p_quality integer,
  p_embedding extensions.vector(768),
  p_user_id uuid default null,
  p_message_id uuid default null
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.ask_examples
    (scope, question, sql, source, quality, embedding, user_id, message_id)
  values
    (p_scope, p_question, p_sql, p_source, coalesce(p_quality, 1), p_embedding, p_user_id, p_message_id)
  on conflict (scope, source, user_id, md5(question)) do update
     set sql = excluded.sql,
         quality = excluded.quality,
         embedding = excluded.embedding,
         message_id = excluded.message_id,
         updated_at = now()
  returning id;
$$;

comment on function public.ask_example_upsert(text, text, text, text, integer, extensions.vector, uuid, uuid) is
  'Write or refresh one example. service_role only: scripts/ask-examples-seed.ts.';

revoke execute on function public.ask_example_upsert(text, text, text, text, integer, extensions.vector, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.ask_example_upsert(text, text, text, text, integer, extensions.vector, uuid, uuid)
  to service_role;

-- ── A thumbs-up pair, read by its owner (the feedback route embeds it) ──

create or replace function public.ask_feedback_pair(p_message_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'question', f.question ->> 'text',
           'sql', f.answer ->> 'sql',
           'scope_sql', f.answer ->> 'scopeSql',
           'program_id', f.program_id
         )
    from public.ask_feedback f
   where f.message_id = p_message_id
     and f.user_id = (select auth.uid())
     and f.rating = 'up'
     and coalesce(f.answer ->> 'mock', 'false') <> 'true'
     and f.question ->> 'text' is not null
     and f.answer ->> 'sql' is not null
     and f.answer ->> 'scopeSql' is not null;
$$;

comment on function public.ask_feedback_pair(uuid) is
  'The caller''s own thumbs-up on an answer as {question, sql, scope_sql, program_id}; null when there is none to learn from (not theirs, not up, a mock answer).';

-- ── Write the caller's own thumbs-up as their example ──

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

  select f.question ->> 'text', f.program_id
    into v_question, v_program
    from public.ask_feedback f
   where f.message_id = p_message_id
     and f.user_id = v_uid
     and f.rating = 'up';
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

comment on function public.ask_example_from_feedback(uuid, text, extensions.vector) is
  'Store the caller''s thumbs-up on p_message_id as an example of their own (user_id = auth.uid()); refused with 42501 when the thumb is not theirs or not up.';

-- ── A thumb taken back or turned down takes its example with it ──

create or replace function public.ask_examples_follow_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or new.rating is distinct from 'up' then
    delete from public.ask_examples
     where message_id = old.message_id and source = 'feedback';
  end if;
  return null;
end;
$$;

create trigger ask_examples_follow_feedback
  after update of rating or delete on public.ask_feedback
  for each row execute function public.ask_examples_follow_feedback();

-- VERIFIED 2026-10-15, live project pouxujkhtbvkdwbzfvka, after apply:
--   supabase_migrations.schema_migrations holds version 20261015094614 'ask_examples'.
--   pg_extension: vector 0.8.2 installed (was available, not installed, before).
--   information_schema.role_table_grants for public.ask_examples: postgres only —
--     no row for anon, authenticated or service_role (the default ACL would have
--     granted the last two; the revoke above removed them). RLS on, 0 policies.
--   Indexes: ask_examples_pkey, ask_examples_one_per_question (unique, nulls not
--     distinct, md5(question)), ask_examples_embedding_idx (hnsw, cosine),
--     ask_examples_user_idx, ask_examples_message_idx.
--   has_function_privilege: ask_similar_examples and ask_example_upsert —
--     service_role EXECUTE only; ask_feedback_pair and ask_example_from_feedback —
--     authenticated + service_role; anon nothing on any of them.
--   A DO block that upserted the same shared (personal, seed, null owner) pair
--     twice through ask_example_upsert got the same id back both times (the
--     arbiter infers the nulls-not-distinct expression index); ask_similar_examples
--     over that vector returned 1 row for scope 'personal' and 0 for 'team'; the
--     block then raised, so nothing of the probe remains (count = 0 after).
