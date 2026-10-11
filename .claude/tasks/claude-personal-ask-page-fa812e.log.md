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

## T2 · `ask.match_stats`, `ask.points`, `ask.shots` — done

**gate:** mechanical PASS; completion review `VERDICT: pass`.

**changed:** migration `20261011193659_ask_stats_points_shots_views.sql`, applied live through the claude.ai Supabase connector, adds three views in schema `ask`, each limited to `ask.my_match_ids()` and turned to me/opponent with `ask.my_side`: `ask.match_stats` (86 columns, one row per match per side), `ask.points` (12) and `ask.shots` (9), every column commented, `SELECT` granted to `ask_reader` only. `tests/ask-views-parity.spec.ts` gains cases for the `me` stats row, `i_served` / `i_won`, the no-coordinates/no-ids rule and the refusal for `authenticated`.

**follow-ups:**

1. `ask.points.game_number` is renumbered from 1 within each set (the table's value is match-cumulative); `ask.shots.spin_type` is passed through `initcap()` because live data mixes cases. T8's schema text should say both.
2. A match whose side cannot be resolved has no row in the three views but is still listed in `ask.matches`.
3. `is_pressure_point` is never true in live data; the model should use the break, set and match point flags.
4. `ask.match_stats` carries no date — a period question must join `ask.matches`.
5. The parity spec seeds no shots, so `ask.shots.mine` is untested; the new live cases have not run (they skip against production).

## T8 · Prompts and mock mode — done

**gate:** mechanical PASS; completion review `VERDICT: pass`. Run out of file order: T3 was eligible first but could not be dispatched (see the note below).

**changed:** `src/lib/services/ask/schema.ts` holds the four `ask` views' columns and meanings as `ASK_SCHEMA` (meanings generated from the migrations' column comments). `src/lib/services/ask/prompts.ts` adds `buildPlanPrompt()` and `buildAnswerPrompt()`, with the function list and the reference/figure syntax rendered from T6's and T7's constants, and `ASK_NO_ADVICE_SENTENCE` exported and absent from both prompts. `src/lib/services/ask/mock.ts` holds the fixed plan and answer template. `src/lib/llm/adapter.ts` gains `isLLMConfigured()` only. `tests/ask-prompt.spec.ts` pins the wording in 26 cases.

**note on T3:** T3's dispatch was refused by the session's permission system (the brief told the subagent to apply its migration through the claude.ai Supabase connector). T3 was returned to `todo` untouched and awaits the author's decision on how its migration is applied.

**follow-ups:**

1. The reply contract is `{ scope_sql, sql, asks_for_advice }` or `{ cannot_answer, asks_for_advice }`; T9's parser must tolerate a reply that omits `asks_for_advice`.
2. The current question is NOT in the plan prompt — T9 sends it as the user message. The plan prompt keeps the newest 6 turns, each cut to 600 characters.
3. `tags.ts` (T9) must produce `AskPromptTag`: `{ kind: "match", matchId, opponentName, playedOn }` or `{ kind: "opponent", opponentName, matchIds }`. `buildAnswerPrompt` needs `matchCount`.
4. `isLLMConfigured()` restates `getLLMStream()`'s two conditions rather than sharing a predicate, because the task forbade other changes to the file.
5. The plan prompt is about 20k characters, mostly the 86 `match_stats` columns; group them if latency or cost matters.
6. A difference between two percentages (a `*_diff` column) prints without a percent sign.
7. No real model has read these prompts yet.

## T11 · Ask server loaders — done

**gate:** mechanical PASS; completion review `VERDICT: pass`.

**changed:** `src/lib/data/ask-tags.ts` adds the pure `buildAskTagOptions(matches, sideOf)` and `askOpponentKey()`; `src/lib/data/ask-server.ts` adds the `cache()`d loaders `getAskTagOptions()`, `getAskQuota()`, `getAskConversations()` and `getAskConversation(id)`, all on the cookie-auth client; `tests/ask-tags.spec.ts` pins opponent grouping, blank names and ordering in 11 cases.

**follow-ups:**

1. An opponent tag's id is the normalised name — T9's tag resolver must use `askOpponentKey()` so both sides group by the same rule. A match tag's id is the match id.
2. `getAskQuota()` returns null on a read failure; T13 and T15 must handle it rather than assume 0 of 20.
3. A saved message's `content` is `unknown` here. The design stores the SQL that produced an answer inside the assistant message, and `getAskConversation` returns `content` whole — whoever defines the saved shape (T9) should strip the SQL before it reaches a client component.
4. A question and its answer share one `created_at`; the loader orders by `created_at` then `role` descending so the question comes first.
5. The loaders in `ask-server.ts` have no automated test and have not been exercised against the live database.

**widget-states (runner, at commit):** loading ✓ (`PendingFrame` with `role="status"`, real title, bars only); empty ✓ (day zero renders the offer, no composer, no `return null`); stream settles on every exit ✓ (done, error, refusal, interruption, abort). Error: FIXED after the gate — the page awaited its loaders outside any boundary, so a failed match read fell through to the app-wide error screen; `page.tsx` now reads inside a `WidgetBoundary` (`AskContent`). That one edit postdates the full gate; typecheck, eslint and the `ask-stream`, `nav-icons`, `client-bundle-boundary` and `generate-map` specs were re-run on it and pass.

## T13 · Ask composer and tag menu — done

**gate:** mechanical PASS; completion review `VERDICT: pass`.

**changed:** `src/components/dashboard/ask/ask-composer.tsx` is the real composer: tag chips, labelled textarea, "Tag a match or opponent", the static "Advantage Intelligence" label, the `n / 20` count and Send. `ask-tag-menu.tsx` is the `@` listbox in two groups (Opponents, Matches) on `FloatMenu`. `src/components/ui/float-menu.tsx` gains four optional props (`role`, `listId`, `onOpenAutoFocus`, `onCloseAutoFocus`) with unchanged defaults, so the menu can be a listbox without taking focus from the textarea. `tests/ask-composer.spec.ts` drives 18 cases with real key presses through `tests/fixtures/ask-composer-harness.tsx`.

**widget-states (runner, at commit):** no loading state of its own; empty ✓ (a filter that matches nothing shows an honest empty line); no spinner; `quota` null omits the count rather than inventing one.

**follow-ups:**

1. At the limit only Send and Enter-to-send are disabled; the textarea stays editable so a restored question can be copied. The design says "the composer is disabled" — confirm which is wanted.
2. Not looked at on screen: the harness loads no CSS, so layout, the engine mark and the focus ring are for `/pr-check`'s eyes-on stage.
3. The menu caps at 5 opponents and 8 matches with no "type to narrow" hint.
4. `askTagRows` / `askTagKey` could be shared with the rail (T15) so chips and "Tagged in this question" agree; the exchange view in `ask-page.tsx` still draws plain chips.
5. Option rows are not focusable and follow the mouse via `onMouseMove` (the `aria-activedescendant` listbox pattern) — worth an accessibility look at `/pr-check`.

## T14 · Ask answer and sources — done

**gate:** mechanical PASS; completion review `VERDICT: pass`.

**changed:** `src/components/dashboard/ask/ask-answer.tsx` is the real answer: engine mark and name, headline, up to three figure tiles, evidence paragraphs, a `role="status"` line naming the step while in flight, and fixed copy per error code (`ASK_ERROR_COPY`). `ask-sources.tsx` renders "Computed from N matches" with linked record rows, two shown and "All N" expanding in place. `ask-engine-mark.tsx` is the one shared engine mark, and `ask-composer.tsx` now uses it (same markup). `tests/ask-answer-view.spec.ts` pins 16 cases through `tests/fixtures/ask-answer-harness.tsx`.

**widget-states (runner, at commit):** loading ✓ (in-flight status text naming the real step, no spinner or bar); empty ✓ (`no_data` and `cannot_answer` each have their own copy, never dressed as a finding); error ✓ (one message per code, an interruption shows the reader's own sentence).

**follow-ups:**

1. An unfinished match draws a local dashed-circle mark, because `ResultMark`'s null state is labelled "Level". Promote the unfinished mark into `ResultMark` and `reference/tables.md` so Matches rows stop calling an unfinished match "Level".
2. Any error drops whatever had already streamed and shows only the copy. `no_data`'s copy is fixed, so a more specific server sentence is not shown.
3. Numbers inside evidence paragraphs are plain text; the artboard sets them in ink tabular figures, which would need the route to mark substituted cells.
4. `ask-sources.tsx` reads the current year at render to decide whether to show a year — a possible hydration mismatch around New Year only.
5. `answer_failed` and the no-code interruption have copy here but are not in the design's error table or the OpenAPI description yet (T10).

## T12 · Ask page shell — done

**gate:** mechanical PASS; completion review `VERDICT: pass`. Committed as `9012695b`. This entry is late and out of order: the commit hook blocked the command that was to write it and the `status: done` line, so the task sat at `doing` through T13 and T14. The `widget-states (runner, at commit)` paragraph directly under the T11 entry above belongs to this task.

**changed:** `src/app/dashboard/ask/page.tsx` is now a Server Component that loads tag options, quota, the conversation list and the `?c=` conversation inside a `WidgetBoundary` and renders `<AskPage>`; `loading.tsx` is a skeleton of the same frame. `src/components/dashboard/ask/` gains `ask-page.tsx` (client shell), `ask-frame.tsx` (the shared 720px column and 340px rail), `use-ask-stream.ts` (NDJSON reader, reducer, saved-message reader and the hook) and placeholders for the composer, answer and rail. `tests/ask-stream.spec.ts` pins 23 cases. `tests/nav-icons.spec.ts` gains a `BUILT_AHEAD_OF_NAV` list holding `/dashboard/ask`, because the page stops rendering `ComingSoonPage` before its nav entry is opened.

**follow-ups:**

1. T16 MUST remove `/dashboard/ask` from `BUILT_AHEAD_OF_NAV` in `tests/nav-icons.spec.ts` when it unflags the nav entry — the spec fails until it does.
2. The saved-message reader expects a question as `{ text, tags: [{ kind, id, label }] }` and an answer as `{ headline, figures, body, sources }` — T9 should save that shape, including a tag `label`, and never the SQL in a field the reader shows.
3. After a first answer the URL carries `?c=<id>` but the server-side key is still `"new"`; a `revalidatePath` from T15's delete action would remount the thread and drop an answer that is mid-stream.
4. `use-ask-stream.ts` is 719 lines; a candidate for splitting at `/pr-check`.
5. `loading.tsx` always draws the two-column skeleton, so a day-zero account sees it briefly before the empty state. The conversation date beside the title was left out to avoid a hydration mismatch.

## T15 · Ask right rail: tags, limit meter, earlier questions — done

**gate:** mechanical PASS; completion review `VERDICT: pass`.

**changed:** `src/components/dashboard/ask/ask-rail.tsx` is the real rail: "Tagged in this question", the limit ("N questions left", a 20-unit meter, the count line) and "Earlier questions" with a delete row action behind `ConfirmDialog`. `src/app/dashboard/ask/actions.ts` adds `deleteAskConversation`, which validates the id, calls `ask_delete_conversation` on the cookie-auth client and revalidates the page. `ask-page.tsx` wires both; `ask-tag-menu.tsx` exports `ASK_TAG_ICON` and `askTagMeta` so the rail and the composer's chips agree. `tests/ask-rail.spec.ts` pins 22 cases through `tests/fixtures/ask-rail-harness.tsx`.

**widget-states (runner, at commit):** no loading state of its own (it renders from the page's loaders, covered by `loading.tsx`); empty ✓ ("Tagged in this question" and "Earlier questions" are each absent when there is nothing to list, and the limit section is omitted when the quota could not be read — never `0 / 20`); error ✓ (a failed delete keeps the row and says so in the dialog).

**follow-ups:**

1. The count line renders "8 / 20 · Resets on the 1st" with a capital R, not the task's quoted lower-case form: design-drift fails on a lower-case word after a middot. The reviewer ruled the criterion met; the quote in the task text is what is off.
2. `deleteAskConversation` has no test of its own (the spec proves the handler receives the id through a stand-in); it wants a live-DB spec.
3. Delete is disabled while an answer is in flight, with no explanation shown — a disabled button has no tooltip.
4. Deleting the open conversation resets the thread and replaces the URL with `/dashboard/ask`; that path has not been exercised in a running app.
5. The limit heading reads "Questions this month"; the artboard's eyebrow there reads "Advantage Intelligence".
6. Not looked at on screen: the harness loads no CSS, so the hover reveal is asserted by class only.

## T3 · `ask_run_query`: run a model-written query as `ask_reader` — done

**gate:** mechanical PASS; completion review `VERDICT: pass` on the second review. The first returned `needs-work` for one line of the runner's own record: the P9 result quoted the message for a null `scope_sql` while the printed probe passes a null `sql`. The probe was re-run as printed and the line corrected; nothing in the function changed.

**how it ran:** the subagent wrote the SQL and the spec without applying anything; the runner applied the migration through the claude.ai Supabase connector (the author's explicit instruction for T3) and ran the probes. Live version `20261011215730`.

**changed:** `supabase/migrations/20261011215730_ask_run_query.sql` creates `public.ask_run_query(scope_sql text, sql text) returns jsonb`: `SECURITY DEFINER`, owner `ask_reader`, `STABLE`, `search_path = ask, pg_catalog, pg_temp`, executable by `authenticated` only (not `anon`, not `service_role`). It refuses a blank argument or a caller with no JWT subject, switches the transaction read-only, and opens each string as a cursor, returning `{ matches, rows }` with `rows` capped at 200. `tests/ask-views-rls.spec.ts` is the live spec; it is registered in `LIVE_DB_SPECS`.

**probes (live, as an `authenticated` session):** a normal read returned the caller's 14 matches and a stranger got none; insert, update, a data-modifying CTE, two statements (plain and paren-balanced), `create temp table`, turning read-only off and `set role` all errored; `public.users`, `auth.users` and `public.matches` were permission-denied; a null argument and a missing subject were refused; `pg_sleep(30)` was cancelled at 8 s with the timeout set on the calling transaction.

**follow-ups:**

1. BLOCKING for the feature, and a defect in T2, not T3: `ask.match_stats` cannot be read through this function — `42501 permission denied for table match_stats`. It reads `public.match_stats_with_percentages`, which is `security_invoker=on`, so the base table is checked against `ask_reader`. `ask.matches`, `ask.points` and `ask.shots` read fine (14 / 1661 / 6762 rows for the probe user). `ASK_MOCK_PLAN` fails for the same reason, so mock mode fails too. Needs a migration that replaces `ask.match_stats` (for example a definer function owned by postgres returning the caller's rows of the percentages view) — never a grant to `ask_reader` on the base table.
2. Whether PostgREST's role-level 8 s timeout binds inside the definer function is unproven until `tests/ask-views-rls.spec.ts` runs against a non-production project.
3. `postgres` holds only ADMIN on `ask_reader`, so it cannot `create or replace` this function later without the grant → alter → revoke steps in the header.
4. Run `rls-boundary-reviewer` over T1–T3 together, as T3's notes ask, before the PR.
5. Three EXPECT lines in the header quote message text that differs from what was observed (same SQLSTATEs); cosmetic.

## T9 · Ask orchestration: tags, reserve, plan, run, answer, save — done

**gate:** mechanical PASS; completion review `VERDICT: pass`.

**changed:** `src/lib/services/ask/tags.ts` adds `resolveAskTags()`, which re-resolves each tag against the viewer's own tag options and takes every name from those rows. `src/lib/services/ask/ask.ts` adds `reserveAskQuestion()` and the generator `askQuestion()`, which takes its database client, model and clock as arguments and yields planning → guard → query → answer → save → sources → done, with one fed-back retry, a release on every failure path and on an abandoned stream, mock mode with no reservation, and the fixed no-advice sentence appended when the plan flags advice. Also `parsePlanReply()` and `conversationTurnsFromMessages()`. `tests/ask-orchestration.spec.ts` pins 37 cases offline.

**follow-ups:**

1. Deviation the reviewer accepted: the criterion says "one function … reserve → …"; reserving is a separate exported `reserveAskQuestion()` so the route (T10) can answer 429 before a stream opens, and `askQuestion()` takes the reservation as an argument.
2. T10 wiring: `model = { configured: isLLMConfigured(), stream: (s, m) => getLLMStream(s, m, createLLMObservabilityContext(userId)) }`, `now: () => new Date()`. On `ask_limit_reached` with a null `detail`, read `ask_quota()` for the 429 body.
3. A failed `ask_save_exchange` ends as `answer_failed` and releases the reservation — an unsaved answer is not kept or charged.
4. A non-empty scope whose query returns zero rows reaches the answer step and then fails as `answer_failed`; consider treating zero rows as `no_data` after sampling live output.
5. The `cannot_answer` event carries the model's own sentence, which the client does not show (T14 renders fixed copy per code).
6. Database error messages are fed back to the planner verbatim; cap their length if they could ever carry row data.
7. `ask.match_stats` is still unreadable through `ask_run_query` live, so mock mode and statistics questions fail against the real database until that view is fixed.
