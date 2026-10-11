# Run log — claude/personal-ask-page-fa812e

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · `ask` schema: side and outcome rules, `ask.matches`, the reader role — blocked

**gate:** mechanical FAIL (lint pass, typecheck pass, tests 2 failed of 5803); completion review not run.

**reason:** the new live-DB spec `tests/ask-views-parity.spec.ts` was not registered with the live-DB guard. `tests/live-db-target-guard.spec.ts` failed twice: "names exactly the specs that create auth users" (the file is missing from `LIVE_DB_SPECS` in `tests/fixtures/live-db-specs.ts`) and "no two spec files draw the same slot, and each slot carries its file's name" (its pool slot is not prefixed `ask-views-parity-`). Nothing else failed.

**stash:** `110a78253c59531802923d1c9307a9a593218bee` — holds `supabase/migrations/20261011134127_ask_schema_matches_view.sql` and `tests/ask-views-parity.spec.ts`.

**live database:** the migration WAS applied before the gate ran — version `20261011134127` (`ask_schema_matches_view`) is live on pouxujkhtbvkdwbzfvka: schema `ask`, `ask.my_match_ids()`, `ask.my_side()`, `ask.i_won()`, view `ask.matches`, role `ask_reader`. The repo file for it exists only in the stash. Nothing reads these objects yet.

**follow-ups:**

1. The spec reads `ask.matches` over a direct Postgres connection (`pg`, `LIVE_DB_DATABASE_URL`), because schema `ask` is not exposed through PostgREST; once `ask_run_query` exists it can read through supabase-js instead.
2. `alter function … owner to ask_reader` (T3) will need `postgres` granted membership of `ask_reader` with SET, and `ask_reader` CREATE on `public`, around the ownership change.
3. `ask_reader` holds EXECUTE on the three `ask` functions as well as SELECT on the view — required for the view to run.

## T4 · Question limit: `ask_usage` and its functions — blocked

**gate:** mechanical PASS; completion review `VERDICT: needs-work`.

**reason:** the criterion "the DDL is applied live with `apply_migration` and the repo file is named to the live version" is not met. The subagent's `apply_migration` call was declined by the session's permission system twice, and a rolled-back `execute_sql` probe was declined too, so nothing was applied: the reviewer confirmed the live database has no `public.ask_usage` and no `ask_*` function in `public`, and its newest migration is `20261011134127`. The other four criteria were judged met. The SQL has been read but never executed.

**stash:** `e9a17e8ce121d4c706a3d0ead2dfa4ccc9b160b7` — holds `supabase/migrations/20261011140108_ask_usage.sql` (self-stamped version, not a live one), `tests/ask-quota.spec.ts`, and the `LIVE_DB_SPECS` registration in `tests/fixtures/live-db-specs.ts`.

**to unblock:** a person applies the migration (or allows `apply_migration` for the session), renames the file to the version `list_migrations` reports, and re-runs the task.

**follow-ups:**

1. `ask_quota()` and `ask_reserve_question()` each hold the constant 20; one `ask_question_cap()` helper would keep them from drifting when tiers arrive.
2. `LEFTOVER_REFERENCES` in `tests/fixtures/live-db-pool.ts` does not list `ask_usage`; adding it would make a crashed spec run fail loudly on the next pool hand-out.
3. The limit refusal is errcode `54000` with a message starting `ask_limit_reached` — T9/T10 should branch on that code for the 429.

## T5 · Saved conversations: tables and functions — blocked

**gate:** mechanical PASS; completion review `VERDICT: needs-work`.

**reason:** the same as T4. The criterion "the DDL is applied live with `apply_migration` and the repo file is named to the live version" is not met: the subagent's one `apply_migration` call was declined by the session's permission system and, as instructed, it did not retry or apply the DDL another way. The reviewer confirmed `public.ask_conversations` and `public.ask_messages` do not exist live and the newest live migration is still `20261011134127`. The other three criteria were judged met against the file. The SQL has never been executed.

**stash:** `60b6d57230abde568bb56d9cbc4752ff1b954e11` — holds `supabase/migrations/20261011150000_ask_conversations.sql` (self-stamped version, header says NOT YET APPLIED), `tests/ask-conversations.spec.ts`, and the `LIVE_DB_SPECS` registration in `tests/fixtures/live-db-specs.ts` (the T4 stash edits the same file — expect a one-line conflict when both are restored).

**to unblock:** a person applies the migration (or allows `apply_migration` for the session), renames the file to the version `list_migrations` reports, removes the header note, and re-runs the task.

**follow-ups:**

1. `ask_save_exchange` takes the conversation title from `p_question->>'text'` — T9 must keep that key name in the question jsonb.
2. `ask_save_exchange` raises `42501` for a conversation that is not the caller's, and `ask_delete_conversation` returns `false` — T9/T11/T15 should branch on those.
3. `LEFTOVER_REFERENCES` in `tests/fixtures/live-db-pool.ts` could list `ask_conversations` and `ask_messages`.

## T6 · SQL guard for model-written queries — done

**gate:** mechanical PASS; completion review `VERDICT: pass`.

**changed:** `src/lib/services/ask/sql-guard.ts` adds `checkAskSql({ scopeSql, sql })`, a pure guard built on `pgsql-ast-parser` (pure JavaScript, so `next.config.ts` is unchanged). It walks the AST against an allowlist of node kinds, so anything that is not a single read-only `SELECT` is refused by default; relations are limited to the four `ask` views, the query's own CTEs, and `scope` in `sql` only; functions to the exported `ASK_SQL_FUNCTION_ALLOWLIST`. `tests/ask-sql-guard.spec.ts` pins 22 accept and refuse cases.

**follow-ups:**

1. Unqualified view names are accepted on the assumption that `ask_run_query`'s `search_path` is `ask, pg_catalog`; if `public` ever enters it, require `ask.`-qualified names.
2. `intersect` / `except` do not parse in `pgsql-ast-parser` and are refused as unparseable.
3. The function allowlist is a judgement call; trim or extend it from refusals seen in sampled model output.
