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

## T7 · Answer renderer and the NDJSON stream helper — done

**gate:** mechanical PASS; completion review `VERDICT: pass`.

**changed:** `src/lib/services/ask/events.ts` defines the `AskEvent` union with no imports. `src/lib/services/ask/answer-render.ts` adds `renderAskAnswer(chunks, rows)`, which turns streamed model text into headline, figure and text events, substitutes `{{rN.column}}` cell references (rows 1-based), drops and reports typed numbers, and ends with an `error` event on a reference the result does not have. Exported syntax constants: `ASK_CELL_REFERENCE_SYNTAX`, `ASK_FIGURE_LINE_SYNTAX` (`FIGURE: <label> = {{rN.column}}`), `MAX_ASK_FIGURES`. `src/lib/llm/stream-response.ts` gains `ndjsonStreamResponse()`; `textStreamResponse()` is untouched. `tests/ask-answer-render.spec.ts` pins 70 cases including the formatting table.

**follow-ups:**

1. A new error code `answer_failed` was added for a broken cell reference — the design's table has no code for it. T9 must release the reservation on it, T14 needs copy for it, and the OpenAPI description should list it.
2. The `sources.matches` item shape (`matchId`, `opponentName`, `playedOn`, `iWon`, `scoreText`) was this task's choice; T9 and T14 should confirm it.
3. A percentage is recognised by its column name (`*_pct`, `*_percent`, `*_percentage`) — T8's prompt must tell the model to alias percentages that way, to put figure lines only directly under the headline, and to write ordinals in words ("2nd" would lose its digit).
4. Dropping a typed number can leave clipped prose; T9 should log `droppedDigits` so prompt drift is visible.

## T1 · `ask` schema: side and outcome rules, `ask.matches`, the reader role — done

**gate:** mechanical PASS; completion review `VERDICT: pass`. Resolved by hand on 2026-10-11 at the author's instruction, not by a runner dispatch.

**changed:** the blocked stash was restored and fixed in session (commit `da9dd703`): `tests/ask-views-parity.spec.ts` is registered in `LIVE_DB_SPECS` and its pool slot is written as a literal so the slot guard can read it. The migration `20261011134127_ask_schema_matches_view.sql` (already live since the blocked run) is now in the repo. The blocked entry above is superseded.

## T4 · Question limit: `ask_usage` and its functions — done

**gate:** mechanical PASS; completion review `VERDICT: pass`. Resolved by hand on 2026-10-11 at the author's instruction, not by a runner dispatch.

**changed:** the migration was applied to the live project through the claude.ai Supabase connector (the local Supabase MCP declined `apply_migration` each time) and took version `20261011191432`; the stashed files were restored under that name (commit `1149e11b`). Live checks: RLS on, one owner SELECT policy, `authenticated` holds SELECT only, the three functions are executable by `authenticated` and not `anon`. The blocked entry above is superseded.

## T5 · Saved conversations: tables and functions — done

**gate:** mechanical PASS; completion review `VERDICT: pass`. Resolved by hand on 2026-10-11 at the author's instruction, not by a runner dispatch.

**changed:** the migration was applied the same way and took version `20261011191453`; the stashed files were restored under that name with the "not yet applied" header note replaced (commit `e5a348e9`). Live checks as for T4, on `ask_conversations` and `ask_messages` and the two functions. The blocked entry above is superseded.

**follow-ups:**

1. The live specs for T1, T4 and T5 skip against production by design, so the functions' behaviour (the cap, concurrent reservations, cross-user refusals, view parity) has been reviewed and structurally verified but never executed; run them once against a non-production project.
2. Later tasks that apply migrations (T2, T3) should expect the local Supabase MCP to decline `apply_migration`.
