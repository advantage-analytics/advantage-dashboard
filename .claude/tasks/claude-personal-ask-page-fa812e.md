# Tasks — claude/personal-ask-page-fa812e

> Scope: the personal Ask page at /dashboard/ask, slice 1 — Advantage Intelligence answers from model-written SQL over the `ask` views, the question limit, saved conversations.

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · `ask` schema: side and outcome rules, `ask.matches`, the reader role

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<live-version>_ask_schema_matches_view.sql (new), tests/ask-views-parity.spec.ts (new) — a guess
- **done when:**
  - [ ] A migration creates schema `ask` and three functions in it: `ask.my_match_ids()` (the personal Matches list's rule — `created_by = auth.uid() and program_id is null`, as `getPersonalMatches()` in src/lib/data/personal-matches-server.ts), `ask.my_side(...)` restating the three steps of `playerSide()` (src/lib/data/player-identity-server.ts), and `ask.i_won(...)` restating `scoreWinner()` / `matchOutcome()` (src/lib/data/match-utils.ts: stored `score.winner` first, else the set count, else null). Each function's SQL comment names the TypeScript function it restates.
  - [ ] The same migration creates view `ask.matches`, one row per match in `ask.my_match_ids()`, with exactly these columns: `match_id`, `played_on`, `opponent_name`, `opponent_hand`, `opponent_backhand`, `tournament`, `round`, `court_type`, `match_type`, `i_won`, `score_text`, `source`, `duration_seconds`, `has_stats` — opponent fields taken from whichever side is not `ask.my_side`, and every column carrying a one-line `comment on column`.
  - [ ] The migration creates role `ask_reader` as `NOLOGIN` with `USAGE` on schema `ask` and `SELECT` on `ask.matches` only, and grants nothing in `ask` to `anon`, `authenticated` or `PUBLIC`.
  - [ ] The DDL is applied to the live project with `apply_migration`, the repo file is named to the version the live migration took (`list_migrations` confirms), and the file's header comment records the query run afterwards that lists every table/view privilege `ask_reader` holds, with its result (`ask.matches` only).
  - [ ] tests/ask-views-parity.spec.ts is a live-DB spec (tests/fixtures/live-db.ts) that seeds one account with a match as player 1, a match as player 2, a legacy match with both player ids null, and a match decided by `score.winner` against the set count, and asserts `ask.matches.i_won` and `opponent_name` equal `matchOutcome()` and the `playerSide()`-derived opponent for every row.
- **notes:** Design: work/personal-ask-page/02_design/output/design.md ("Database", "What the facts on the ground decided"); plan step 1 in work/personal-ask-page/03_plan/output/plan.md. Do NOT read `matches.result` for the outcome — it is free text ("Cj Gimena Wins", "Final Score", "won"). `matches.status` is null on every live row, so it is not a filter. Schema `ask` must not be added to PostgREST's exposed schemas. Views are owned by the migration role and bypass RLS on the base tables, so the `ask.my_match_ids()` filter IS the access rule — it must be in the view body, not assumed. Verify the base tables against the live database, not supabase/migrations/ (the folder runs ~100 behind). Never hand-format supabase/migrations/. The live-DB spec skips against the production project unless LIVE_DB_ALLOW_PROD=1; never set that in a gate or loop.

## T2 · `ask.match_stats`, `ask.points`, `ask.shots`

- **status:** done
- **model:** fable
- **needs:** T1
- **files:** supabase/migrations/<live-version>_ask_stats_points_shots_views.sql (new), tests/ask-views-parity.spec.ts — a guess
- **done when:**
  - [ ] A migration creates `ask.match_stats` (one row per match per side: `match_id`, `side` as `'me'` or `'opponent'`, then every counter column of `match_stats` and every percentage/rating column of `match_stats_with_percentages`), `ask.points` (`match_id`, `set_number`, `game_number`, `point_number`, `i_served`, `i_won`, `is_break_point`, `is_set_point`, `is_match_point`, `is_pressure_point`, `rally_length`, `result_type`) and `ask.shots` (`match_id`, `point_number`, `shot_number`, `mine`, `shot_type`, `spin_type`, `speed_mph`, `zone`, `result`), each restricted to `ask.my_match_ids()` and oriented with `ask.my_side`.
  - [ ] None of the three views exposes shot coordinates, any `video_time` column, `flags`, `derived`, or any id other than `match_id`; every exposed column carries a one-line `comment on column`.
  - [ ] `ask_reader` is granted `SELECT` on the three new views and nothing else is granted to any role.
  - [ ] The DDL is applied live with `apply_migration`, the repo file is named to the live version, and its header comment records the post-apply privilege listing for `ask_reader` (four views, nothing else).
  - [ ] tests/ask-views-parity.spec.ts gains cases asserting, for the T1 fixture account's player-1 and player-2 matches, that the `side = 'me'` row of `ask.match_stats` equals the `match_stats` row whose `is_player1` matches `playerSide()`, and that `ask.points.i_served` / `i_won` equal `server_is_player1` / `won_by_player1` turned by the same side.
- **notes:** Design "Database" table; plan step 1. `match_stats_with_percentages` is a view over `match_stats` — select from it rather than recomputing percentages. Shot coordinates are left out on purpose: SwingVision fault coordinates are imputed, `result` and `zone` are the trustworthy columns. T8 reads these column comments into the model's prompt, so write them for a reader who has never seen the schema ("share of my second-serve points I won, 0–100").

## T3 · `ask_run_query`: run a model-written query as `ask_reader`

- **status:** todo
- **model:** fable
- **needs:** T2
- **files:** supabase/migrations/<live-version>_ask_run_query.sql (new), tests/ask-views-rls.spec.ts (new) — a guess
- **done when:**
  - [ ] A migration creates `public.ask_run_query(scope_sql text, sql text) returns jsonb` as `SECURITY DEFINER`, owned by `ask_reader`, with `search_path = ask, pg_catalog`, `EXECUTE` granted to `authenticated` only (revoked from `PUBLIC` and `anon`). It sets the transaction read-only, then returns `{ "matches": [...], "rows": [...] }` where `matches` is `ask.matches` rows for the ids `scope_sql` selects and `rows` is `with scope as (<scope_sql>) select * from (<sql>) q limit 200`.
  - [ ] The function refuses a null or empty argument and a caller with no `auth.uid()` with a raised exception, before executing anything.
  - [ ] The DDL is applied live with `apply_migration`, the repo file is named to the live version, and its header comment records each of these probes run live inside a rolled-back transaction as an `authenticated` session, with the observed result: an `insert`, an `update`, a data-modifying CTE and a two-statement string each error; `select * from public.users` errors with permission denied; `select pg_sleep(30)` is cancelled by a statement timeout (and, if the role's 8 s timeout did not bind inside the definer function, the function sets one explicitly and the comment says so).
  - [ ] tests/ask-views-rls.spec.ts is a live-DB spec asserting, with two seeded accounts sharing a program, that user A's `ask_run_query('select match_id from ask.matches', 'select count(*) from ask.points join scope using (match_id)')` returns only A's personal matches — none of B's and none of the shared program's — and that the write, `public.users` and two-statement probes each return an error through the RPC.
- **notes:** Design "Database" (the three independent guards) and plan step 2. This is brief success criterion 6 and the security heart of the feature — after the gate, run `rls-boundary-reviewer` over T1–T3 together. `auth.uid()` still resolves inside a definer function because it reads the request's JWT setting. Nothing in `public` is executable by `PUBLIC` today (0 of 178 functions), which is what makes a grant-less role tight; do not add grants to make a probe pass. The role must be grantable to the migration role for `alter function … owner to ask_reader` to succeed.

## T4 · Question limit: `ask_usage` and its functions

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<live-version>_ask_usage.sql (new), tests/ask-quota.spec.ts (new) — a guess
- **done when:**
  - [ ] A migration creates `ask_usage` (`id`, `user_id` → `users` on delete cascade, `billing_month date`, `created_at`) with RLS enabled, one policy letting the owner `select` their rows, and no insert, update or delete policy for any role.
  - [ ] It creates `ask_reserve_question() returns jsonb`, which under a per-user advisory lock counts the caller's rows for the current calendar month, raises a distinguishable error at 20, and otherwise inserts one row and returns `{ usage_id, used, cap, resets_on }`; the cap of 20 is a constant inside the function and is not a parameter.
  - [ ] It creates `ask_release_question(usage_id uuid)`, which deletes that row only when it belongs to the caller, and `ask_quota() returns jsonb` returning `{ used, cap, resets_on }` without writing. All three functions are granted to `authenticated` and `service_role` and not to `anon`.
  - [ ] The DDL is applied live with `apply_migration` and the repo file is named to the live version.
  - [ ] tests/ask-quota.spec.ts is a live-DB spec asserting: the 21st reservation in a month is refused; two concurrent reservations made at 19 used yield exactly one success; a released reservation frees its slot; user A cannot release user B's reservation; a direct `insert` or `delete` on `ask_usage` as `authenticated` is refused.
- **notes:** Design "The question limit"; plan step 3. `billing_month` is keyed the way `processing_usage.billing_month` is (`YYYY-MM-01`) — read src/lib/data/usage-server.ts for the convention and use the same month boundary. One cap for every plan: Pro is not enforced anywhere and a tier plan is pending. New functions in `public` are not executable signed out by default since `20261001184305`; do not grant `anon`. Independent of T1–T3.

## T5 · Saved conversations: tables and functions

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<live-version>_ask_conversations.sql (new), tests/ask-conversations.spec.ts (new) — a guess
- **done when:**
  - [ ] A migration creates `ask_conversations` (`id`, `user_id` → `users` on delete cascade, `title`, `created_at`, `updated_at`) and `ask_messages` (`id`, `conversation_id` → `ask_conversations` on delete cascade, `user_id`, `role` checked to `user` / `assistant`, `content jsonb`, `created_at`), both with RLS enabled and an owner-only `select` policy, and no insert, update or delete policy.
  - [ ] It creates `ask_save_exchange(...)`, which in one transaction creates the conversation when no id is given (title from the question, truncated), refuses a conversation id that is not the caller's, inserts the question and answer rows, bumps `updated_at`, and returns the conversation id; and `ask_delete_conversation(id uuid)`, which deletes only the caller's own. Both granted to `authenticated` and `service_role`, not `anon`.
  - [ ] The DDL is applied live with `apply_migration` and the repo file is named to the live version.
  - [ ] tests/ask-conversations.spec.ts is a live-DB spec asserting: a first exchange creates one conversation and two messages; a second exchange with that id appends two more; user B can neither read, append to, nor delete user A's conversation; deleting a conversation removes its messages.
- **notes:** Design "Database → Tables" and "Data flow"; plan step 3 (split from the limit so each migration stays reviewable). `content` for a question holds its text and resolved tags; for an answer, the headline, figures, body, the match ids it was computed from, and the SQL that produced it — the function takes these as jsonb and does not validate their inner shape. Deleting a conversation must not touch `ask_usage` (that is why usage is a separate table). Independent of T1–T4.

## T6 · SQL guard for model-written queries

- **status:** done
- **model:** fable
- **files:** src/lib/services/ask/sql-guard.ts (new), tests/ask-sql-guard.spec.ts (new), package.json, next.config.ts — a guess
- **done when:**
  - [ ] `checkAskSql({ scopeSql, sql })` in src/lib/services/ask/sql-guard.ts is a pure function (no database, no network) returning `{ ok: true }` or `{ ok: false, reason }`, built on a Postgres SQL parser added to package.json.
  - [ ] It refuses, each pinned by a case in tests/ask-sql-guard.spec.ts: an `insert`, `update`, `delete` and DDL statement; two statements in one string; a data-modifying CTE; a reference to `public.users`, to an unqualified `users`, and to any `pg_catalog` or `information_schema` relation; a function outside the allowlist (`pg_sleep`, `current_setting`); `sql` that does not reference `scope`; and text the parser cannot parse.
  - [ ] It accepts, each pinned by a case: a plain aggregate over `ask.match_stats` joined to `scope`; a query with a non-modifying CTE, a window function, `count(*) filter (where …)`, `date_trunc`, `round` and `coalesce`; and a `scope_sql` selecting `match_id` from `ask.matches` with a date range and an `opponent_name` filter.
  - [ ] The relation allowlist is the four `ask` views plus `scope` (in `sql` only) plus the query's own CTE names, and the function allowlist is one exported constant.
  - [ ] If the chosen parser ships WASM or a native build it is listed in `serverExternalPackages` in next.config.ts; if it is pure JavaScript, next.config.ts is unchanged.
- **notes:** Design "Route → Check step"; plan step 4. Prefer a pure-JavaScript parser (e.g. `pgsql-ast-parser`) over a native one unless it cannot parse the accept cases above. This guard exists for a clear error and an early stop; the database's guards in T3 are what the security rests on — so when in doubt, refuse. A refused-but-valid query costs one retry; an accepted-but-unsafe one is still stopped by T3. No dependency on any other task.

## T7 · Answer renderer and the NDJSON stream helper

- **status:** done
- **model:** opus
- **files:** src/lib/services/ask/answer-render.ts (new), src/lib/services/ask/events.ts (new), src/lib/llm/stream-response.ts, tests/ask-answer-render.spec.ts (new) — a guess
- **done when:**
  - [ ] src/lib/services/ask/events.ts exports the event union the route streams and the client reads — `status` (`planning` | `querying` | `writing`), `headline`, `figure` (`label`, `value`), `text` (`delta`), `sources` (`matches`), `done` (`conversationId`, `used`, `cap`), `error` (`code`, `error`) — and imports nothing server-only.
  - [ ] src/lib/services/ask/answer-render.ts exports a streaming transform from an `AsyncIterable<string>` of model text plus the result rows to an `AsyncIterable` of those events: the first line becomes `headline`, the following figure lines become `figure` events (at most three), the rest becomes `text` deltas, and every `{{rN.column}}` reference is replaced by that cell's formatted value.
  - [ ] Pinned in tests/ask-answer-render.spec.ts: a reference split across two chunks still substitutes; percentages, counts and dates format as the spec's table states; a raw digit outside a reference is dropped from the output and reported through the transform's result; a reference to a row or column that does not exist ends the stream with an `error` event rather than printing a blank.
  - [ ] src/lib/llm/stream-response.ts gains `ndjsonStreamResponse()` beside `textStreamResponse()` — one JSON object per line, `Content-Type: application/x-ndjson` — and `textStreamResponse()` is unchanged.
- **notes:** Design "Route → Answer step" ("Never type a number"); plan step 5. The cell-reference rule is what makes "every number traces to a row the query returned" true by construction — it is the home card's rule (src/app/api/home-insight/route.ts: "a number you write is a number nobody verified") made mechanical. The figure-line syntax is this task's to fix; export it as a constant so T8's prompt quotes it rather than restating it. No dependency on any other task.

## T8 · Prompts and mock mode

- **status:** done
- **model:** opus
- **needs:** T2, T7
- **files:** src/lib/services/ask/prompts.ts (new), src/lib/services/ask/schema.ts (new), src/lib/services/ask/mock.ts (new), src/lib/llm/adapter.ts, tests/ask-prompt.spec.ts (new) — a guess
- **done when:**
  - [ ] src/lib/services/ask/schema.ts holds the four `ask` views' columns and one-line meanings as a typed constant, and `buildPlanPrompt()` in prompts.ts renders it together with today's date, the resolved tags, the conversation so far, and the reply contract `{ scope_sql, sql }` or `{ cannot_answer }`.
  - [ ] `buildAnswerPrompt()` renders the question and the result rows, and its rules state: claim first with no digits; comparisons are computed by the query, never in prose; every number, percentage, count and date is a `{{rN.column}}` reference (quoting T7's exported syntax); no recommendation, drill, tactic, strategy, encouragement or praise; a sample of one or two matches is stated as provisional. The fixed sentence "Ask reports what your matches show; it does not recommend what to work on." is an exported constant and appears in no prompt.
  - [ ] src/lib/llm/adapter.ts exports `isLLMConfigured()`, true exactly when `getLLMStream()` would call a real provider, and nothing else in the file changes.
  - [ ] src/lib/services/ask/mock.ts exports a fixed `{ scope_sql, sql }` (the player's record and second-serve points won across all their matches) that passes `checkAskSql` if T6 has landed, and a fixed answer template that uses only cell references.
  - [ ] tests/ask-prompt.spec.ts pins the no-advice and no-typed-number wording, and asserts the plan prompt's schema block lists exactly the view and column names in schema.ts.
- **notes:** Design "Route → Plan step / Answer step / Mock mode"; plan step 6. schema.ts must match the views T1 and T2 created — check the live column list with `execute_sql` and copy the column comments; a drift between this constant and the views is the failure this file exists to make visible. Voice reference: `buildHomeInsightSystemPrompt` in src/app/api/home-insight/route.ts. The provider in production is Gemini through the OpenAI SDK (`LLM_PROVIDER=openai`); write prompts for a small fast model — explicit, with one worked example of each reply shape.

## T9 · Ask orchestration: tags, reserve, plan, run, answer, save

- **status:** todo
- **model:** fable
- **needs:** T3, T4, T5, T6, T7, T8
- **files:** src/lib/services/ask/ask.ts (new), src/lib/services/ask/tags.ts (new), tests/ask-orchestration.spec.ts (new) — a guess
- **done when:**
  - [ ] src/lib/services/ask/tags.ts resolves `{ kind: "match" | "opponent", id }[]` against the viewer's own personal matches and returns a refusal for any tag that is not theirs; the names put into the prompt come from the database rows, never from the request.
  - [ ] src/lib/services/ask/ask.ts exports one function that takes its Supabase client, model stream and clock as arguments (no `Request`) and yields T7's events in order: reserve → `status: planning` → plan → guard → `status: querying` → `ask_run_query` → `status: writing` → rendered answer → save → `sources` → `done`.
  - [ ] Pinned in tests/ask-orchestration.spec.ts with the model and database faked: a database error on the first query is fed back and retried once, and a second failure ends with `error: cannot_answer`; a guard refusal is treated the same way; an empty scope ends with `error: no_data`; a provider error ends with `error: llm_unavailable`.
  - [ ] Pinned in the same spec: every one of those failure paths calls `ask_release_question` with the reserved id, a completed answer never does, and when `isLLMConfigured()` is false the mock query and template are used and no reservation is made.
  - [ ] Pinned in the same spec: when the question asks for advice (the plan reply flags it), the fixed no-advice sentence is appended to the answer by this module after the model's text.
- **notes:** Design "Architecture", "Data flow for one question", "Error handling"; plan step 7 (split: this is the logic, T10 is the HTTP shell). The plan call is not streamed — collect `getLLMStream()`'s chunks and parse JSON; tolerate a fenced code block around it. How the planner flags an advice question is this task's to define, in step with T8's reply contract (amend prompts.ts and its spec if the contract needs a field). "An answer the player received always costs one question; nothing else does."

## T10 · `POST /api/ask` route and its API description

- **status:** todo
- **model:** opus
- **needs:** T9
- **files:** src/app/api/ask/route.ts (new), openapi/advantage-api.yaml, tests/ask-route.spec.ts (new) — a guess
- **done when:**
  - [ ] src/app/api/ask/route.ts exports `POST` with `runtime = "nodejs"` and `dynamic = "force-dynamic"`, reads the body with `checkSameOrigin()` and `readBoundedJson()` from src/lib/services/match-video/http.ts, and returns `ndjsonStreamResponse()` over T9's function.
  - [ ] Every refusal before the stream goes through `errorResponse()` with these status/`code` pairs: 401 `unauthenticated`, 403 `cross_origin`, 400 `invalid_request` (empty or over-long question, malformed tags, a tag that is not the viewer's), 404 `conversation_not_found`, 409 `no_matches`, 429 `ask_limit_reached` — and the 429 is decided by `ask_reserve_question()`'s refusal, not by a count read in TypeScript.
  - [ ] tests/ask-route.spec.ts pins each of those status/`code` pairs and that a successful request answers `200` with `Content-Type: application/x-ndjson`.
  - [ ] openapi/advantage-api.yaml describes `POST /api/ask` — request body, the NDJSON event shapes, and each refusal — and the file still passes the repo's `api:lint` script.
- **notes:** Design "Route" and "Error handling" table; plan step 7. Pattern for the route file: src/app/api/home-insight/route.ts (auth guard, server-derived data, never trust the client). `readBoundedJson`'s default cap is `MUTATION_BODY_MAX_BYTES` (4096) — a question plus tags fits; cap the question at a stated character length and refuse beyond it. The route is not linked from anywhere until T16, so it is safe to land ahead of the page.

## T11 · Ask server loaders

- **status:** done
- **model:** opus
- **needs:** T4, T5
- **files:** src/lib/data/ask-server.ts (new), src/lib/data/ask-tags.ts (new), tests/ask-tags.spec.ts (new) — a guess
- **done when:**
  - [ ] src/lib/data/ask-tags.ts is a pure module that turns `DbPersonalMatch[]` into tag options: one option per match (date, opponent, tournament, score) newest first, and one per opponent (name, match count, handedness) ordered by match count.
  - [ ] Pinned in tests/ask-tags.spec.ts: the same opponent name across several matches is one opponent with the right count; names differing only in case or surrounding whitespace group together; a blank or null opponent name yields no opponent option; an undated match sorts last.
  - [ ] src/lib/data/ask-server.ts exports `cache()`d loaders `getAskTagOptions()` (over `getPersonalMatches()`), `getAskQuota()` (over `ask_quota()`), `getAskConversations()` (id, title, updated date, newest first) and `getAskConversation(id)` (messages in order, or null when not the viewer's), each using the cookie-auth server client.
- **notes:** Design "Components" (page loads through `ask-server.ts`); plan step 8. Use the repo's existing person-name helpers for grouping rather than a new normaliser (src/lib/data/person-name.ts, person-name-case.ts). Which side of a match is the opponent comes from `playerSide()` — never assume the viewer is player 1. Never the service-role client here.

## T12 · Ask page shell

- **status:** done
- **model:** opus
- **needs:** T7, T11
- **files:** src/app/dashboard/ask/page.tsx, src/app/dashboard/ask/loading.tsx (new), src/components/dashboard/ask/ask-page.tsx (new), src/components/dashboard/ask/use-ask-stream.ts (new), tests/ask-stream.spec.ts (new) — a guess
- **routes:** /dashboard/ask
- **done when:**
  - [ ] src/app/dashboard/ask/page.tsx is a Server Component that no longer renders `ComingSoonPage`: it loads tag options, quota, the conversation list and the conversation named by `?c=` through src/lib/data/ask-server.ts and renders `<AskPage>`; an unknown or foreign `?c=` renders the page with no conversation open rather than an error.
  - [ ] `AskPage` (client) lays out a centre column capped at 720px and a 340px right rail, holds the thread and the in-flight answer, sets `?c=<id>` when a first answer completes, and offers "New question". Composer, answer and rail are imported from their own files and may be minimal placeholders in this task.
  - [ ] With no personal matches the page renders an empty state whose action links to `/dashboard/matches/new` and renders no composer; src/app/dashboard/ask/loading.tsx is a skeleton of the same two-column layout.
  - [ ] `use-ask-stream.ts` reads the NDJSON response into thread state using the event types from src/lib/services/ask/events.ts, and tests/ask-stream.spec.ts pins: events arriving split across network chunks are reassembled; an `error` event leaves the question text available to the composer; a non-200 response surfaces the body's `error` sentence and `code`.
- **notes:** Design "Components" and "States"; plan step 9. Before writing UI read .skills/advantage-analytics-design/SKILL.md, then reference/foundations.md and reference/empty-and-loading.md, and run the `trace-route` skill for /dashboard/ask. Artboard: `project/Ask.dc.html` in https://claude.ai/artifact/USGQxmojNd6K6rCvCCfxaV (read with the Artifact tool) — layout intent only, never rendered; take colours and spacing from src/styles/design-system and existing primitives, not the artboard's token file. The nav entry stays `comingSoon` until T16, so the page is reachable only by URL. The widget-states hook will audit loading and empty states on commit.

## T13 · Ask composer and tag menu

- **status:** done
- **model:** opus
- **needs:** T12
- **files:** src/components/dashboard/ask/ask-composer.tsx (new), src/components/dashboard/ask/ask-tag-menu.tsx (new), src/components/dashboard/ask/ask-page.tsx, tests/ask-composer.spec.ts (new), tests/fixtures/ask-composer-harness.tsx (new) — a guess
- **routes:** /dashboard/ask
- **done when:**
  - [ ] The composer renders a labelled textarea with the placeholder "Ask about a match, an opponent or a stretch of the season. Type @ to tag one.", a "Tag a match or opponent" button, removable tag chips, a static "Advantage Intelligence" label with no chevron and no menu, the `n / 20` count, and a Send button built with `advButton()` carrying `aria-label="Send question"`.
  - [ ] The tag menu is a `role="listbox"` in two groups, Opponents and Matches, built on the repo's `FloatMenu`, filtered by the text typed after `@`; there is no "Groups" section.
  - [ ] Pinned in tests/ask-composer.spec.ts through a harness: typing `@` opens the menu; arrow keys and Enter choose a row, which adds a chip and removes the `@query` text from the textarea; a chip's remove button removes it; Escape closes the menu; Enter sends and Shift+Enter inserts a line break.
  - [ ] Pinned in the same spec: Send is disabled when the question is empty, while an answer is in flight, and when `used >= cap`, and in the last case the reset date is shown beside the count.
- **notes:** Design "Components" and "Departures from the artboard"; plan step 10. Read reference/chrome.md (Dropdown / Menu), reference/focus.md and reference/components.md first. The model control is deliberately a label: a menu with one row is a control that does nothing, and it returns with bring-your-own-model in a later slice. Harness pattern: tests/fixtures/*-harness.tsx with tests/fixtures/vm-modules.ts — keep the composer's imports clear of `next/navigation`.

## T14 · Ask answer and sources

- **status:** done
- **model:** opus
- **needs:** T12
- **files:** src/components/dashboard/ask/ask-answer.tsx (new), src/components/dashboard/ask/ask-sources.tsx (new), src/components/dashboard/ask/ask-page.tsx, tests/ask-answer-view.spec.ts (new), tests/fixtures/ask-answer-harness.tsx (new) — a guess
- **routes:** /dashboard/ask
- **done when:**
  - [ ] `AskAnswer` renders the engine mark with "Advantage Intelligence", the headline, up to three figure tiles (value over label), and the evidence paragraphs; while in flight it shows a `role="status"` line naming the current step from the stream's `status` event (planning, querying, writing) and no progress bar or percentage.
  - [ ] `AskSources` renders "Computed from N matches" and one row per match using the existing `ResultMark` and score primitives with opponent and date, each row a link to `/dashboard/matches/<match_id>`; the first two rows show, and "All N" expands the rest in place.
  - [ ] The three stream errors render distinct, fixed copy: `cannot_answer` ("Your match data can't answer that" plus what Ask covers), `no_data` (stated plainly as no matches in that scope), and `llm_unavailable` (try again; the question is kept).
  - [ ] Pinned in tests/ask-answer-view.spec.ts through a harness: a full answer's markup contains the headline, three figures and the source links; a one-match answer reads "Computed from 1 match" with no "All" control; each error state renders its copy and no figure tiles; there is no "Open Statistics" link.
- **notes:** Design "Components", "Error handling", "Departures from the artboard"; plan step 11 (split from the rail for size). Read reference/primitives.md (`ResultMark`, `Score`, `InsightCard` / `EngineChip`) and reference/tables.md (row law: the outcome is a mark, never the word) first. An unfinished match (`i_won` null) uses the unfinished mark, not a loss. Green and red are for outcome only; figure tiles are ink.

## T15 · Ask right rail: tags, limit meter, earlier questions

- **status:** todo
- **model:** opus
- **needs:** T12
- **files:** src/components/dashboard/ask/ask-rail.tsx (new), src/components/dashboard/ask/ask-page.tsx, src/app/dashboard/ask/actions.ts (new), tests/ask-rail.spec.ts (new), tests/fixtures/ask-rail-harness.tsx (new) — a guess
- **routes:** /dashboard/ask
- **done when:**
  - [ ] The rail renders three sections: "Tagged in this question" (one row per tag: name and a meta line), the limit ("N questions left", a 20-unit meter with `role="img"` and an `aria-label` of the form "8 of 20 questions used", and "8 / 20 · resets on the 1st"), and "Earlier questions" (title and date, newest first, each a link to `?c=<id>`).
  - [ ] Each earlier question has a delete row action, revealed on hover and focus-within, that opens the repo's `ConfirmDialog` and on confirm calls a server action in src/app/dashboard/ask/actions.ts which invokes `ask_delete_conversation` and revalidates the page.
  - [ ] There is no "Bring your own model" link anywhere in the rail.
  - [ ] Pinned in tests/ask-rail.spec.ts through a harness: the meter fills exactly `used` of 20 units; at `used = cap` the section reads "0 questions left"; the "Tagged in this question" section is absent when no tag is set; "Earlier questions" is absent when the list is empty; confirming a delete calls the action with that conversation's id.
- **notes:** Design "Components" and "Data flow" (conversations kept until deleted; a saved answer is frozen); plan step 11. Read reference/chrome.md (Dialog (v3)) and reference/components.md (list rows) first. Deleting a conversation never changes the limit count — do not word the confirm as if it frees questions. Every icon-only control needs an `aria-label` and a dark tooltip.

## T16 · Open Ask in the nav; regenerate the map

- **status:** todo
- **model:** sonnet
- **needs:** T10, T13, T14, T15
- **files:** src/lib/dashboard/nav.ts, MAP.md, AGENTS.md — a guess
- **routes:** /dashboard/ask
- **done when:**
  - [ ] In src/lib/dashboard/nav.ts the personal Ask entry (`href: "/dashboard/ask"`) no longer carries `comingSoon`; the team Ask entry (`/dashboard/team/ask`) still does.
  - [ ] MAP.md is regenerated with `npm run map` and its "Source layout" row for `src/app/api/` names `ask` (POST, streamed answer about the viewer's own matches).
  - [ ] AGENTS.md's Routes paragraph no longer lists `/dashboard/ask` among the `ComingSoonPage` routes, and its "LLM and email" section gains one sentence saying `/api/ask` streams through `getLLMStream()`, runs model-written SQL only through `ask_run_query` as role `ask_reader`, and that the model never types a number.
- **notes:** Plan step 12. Sibling branches for Opponents and Statistics also touch nav.ts and MAP.md — expect a small conflict at merge; resolve by keeping each branch's own entry change and re-running `npm run map`. NOT a task and still owed before the PR: about 20 real questions run against a live model with a key and read by a person — including "what should I work on?", a question about a teammate, and one the data cannot answer — with the transcript attached to the PR (brief success criterion 5). `/pr-check`'s eyes-on stage needs the verifier account to hold at least one personal match with statistics, or every Ask screen it sees is the empty state.
