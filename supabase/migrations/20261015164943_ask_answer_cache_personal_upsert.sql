-- ask_answer_cache: personal rows upsert, reads take the newest, sizes bound.
--
-- Found by the /pr-check RLS review of #453 on 2026-10-15. The constraint
-- ask_answer_cache_key is unique (user_id, program_id, cache_key), and
-- program_id is null for every personal row: NULLs compare distinct, so
-- ask_cache_put's `on conflict` never fired for a personal question and each
-- miss added a row; ask_cache_get's `limit 1` had no order, so which of
-- several matching rows it returned was arbitrary. Not a leak (every row is
-- the caller's own), but bloat and nondeterminism.
--
-- - A second unique index with NULLS NOT DISTINCT on the same columns makes
--   them an arbiter for personal rows too (on conflict infers every unique
--   index that matches the columns). The old constraint stays, redundant.
-- - A check bounds what a signed-in caller can store through ask_cache_put
--   (key and version are hashes; the largest live payload was 4,977 bytes).
-- - ask_cache_get orders by created_at desc. CREATE OR REPLACE keeps its
--   ACL and SECURITY DEFINER.
--
-- Applied to the live database on 2026-10-15 as version 20261015164943
-- (`ask_answer_cache_personal_upsert`). VERIFIED: see the end of this file.
create unique index if not exists ask_answer_cache_key_nnd
  on public.ask_answer_cache (user_id, program_id, cache_key)
  nulls not distinct;

alter table public.ask_answer_cache
  add constraint ask_answer_cache_sizes check (
    length(cache_key) <= 128
    and length(data_version) <= 128
    and pg_column_size(payload) <= 262144
  );

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
   order by c.created_at desc
   limit 1;
$$;

-- VERIFIED on the live database, 2026-10-15, after the migration ran:
--
-- Before: 31 rows, 0 duplicates under (user_id, coalesce(program_id), key),
-- largest payload 4,977 bytes, every key 64 characters — the index and the
-- check applied without touching a row.
--
-- Probe, rolled back (a DO block as the eyes-on verifier, `set local role
-- authenticated`, then raise): two ask_cache_put calls with the same
-- personal key and versions v1 then v2 left ONE row, and ask_cache_get for
-- v2 answered the second payload. ask_cache_get's proacl is unchanged:
-- {postgres=X,authenticated=X,service_role=X}.
