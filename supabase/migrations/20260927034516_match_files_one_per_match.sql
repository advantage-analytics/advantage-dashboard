-- One `match_files` row per match, enforced by the database (intent 1, route
-- layer — the pr-check low finding at src/app/api/upload/route.ts:162).
--
-- `/api/upload` already refuses a second file for a match (T12): before the
-- storage upload it reads `match_files` and `points` for the match and answers
-- 409 when either has a row. That is a check-then-act — two tabs submitting
-- the same match at once can both read empty, both write the object and both
-- insert, and `process-match` then runs twice and doubles every statistic.
-- This index is what makes the second insert fail instead. It changes no
-- working path: the route's pre-check stays as the fast path, and
-- `UploadService.uploadMatchFile` (the only writer of `match_files` in src/
-- and supabase/functions/) maps the unique violation — matched on
-- SQLSTATE 23505, never on the message — to the same 409 body.
--
-- Live counts the index was created over, read via the Supabase MCP on
-- 2026-09-26 and re-checked immediately before apply: 21 rows, all
-- `provider_id = 'swing-vision'`, 21 distinct `match_id`s (max 1 row per
-- match), 0 rows with a null `match_id`. Existing indexes were the pkey plus
-- non-unique btrees on `match_id` and `uploaded_by`, so the unique index
-- creates cleanly with nothing to repair. Had any match carried two rows the
-- apply would have been blocked and the match named — never a row deleted to
-- make the index fit.
--
-- Partial on `match_id is not null`: the column is nullable (the FK to
-- `matches` is `on delete cascade`, but nothing forbids a null), and a unique
-- btree treats nulls as distinct anyway — the predicate states the rule the
-- index enforces and keeps any null row out of it, the same shape as
-- `processing_jobs_external_job_id_key`. No `provider_id` predicate: the
-- route refuses processing providers before the service runs
-- (`getImportProviderStrategy` throws), so every row here is an import file.
-- Not `concurrently`: 21 rows, and the MCP applies inside a transaction where
-- `concurrently` is not allowed; the share lock is momentary.
--
-- The second layer of the same race — `process-match`'s own non-atomic
-- `points` check — is T18, independent of this index.
--
-- Applied to the live database via the Supabase MCP as
-- `match_files_one_per_match`; this file carries the version the live
-- project recorded on apply.

create unique index match_files_one_per_match on public.match_files (match_id) where match_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_def text;
begin
  select indexdef into v_def
    from pg_indexes
   where schemaname = 'public'
     and tablename = 'match_files'
     and indexname = 'match_files_one_per_match';

  if v_def is null then
    raise exception 'match_files_one_per_match: index is missing';
  end if;

  if v_def not like 'CREATE UNIQUE INDEX %' then
    raise exception 'match_files_one_per_match: not unique (%)', v_def;
  end if;

  if v_def not like '% WHERE (match_id IS NOT NULL)' then
    raise exception 'match_files_one_per_match: predicate is not (match_id IS NOT NULL) (%)', v_def;
  end if;
end
$$;
