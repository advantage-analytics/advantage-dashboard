# Plan — Personal Ask page, slice 1

Inputs: `../02_design/output/design.md` and `../01_brief/output/brief.md`,
both unedited since their stages.

## What this plan assumes

- **Design open question 1 was not answered**, and the design asked for an
  answer before this stage. Re-invoking the pipeline approved the design as
  written, so this plan builds its default: **Ask covers the matches the
  personal Matches list shows** (`created_by = auth.uid()` and
  `program_id is null`). The rule lives in one SQL function (step 1), so
  switching to "every match I played in" later is a one-function change plus
  the parity spec — say so before stage 04 if you want the other answer.
- **Scope against the brief.** The brief puts bring-your-own-model in scope;
  the design moved it to later slices by the user's decision. This plan
  therefore does **not** meet brief success criterion 9, deliberately. It
  meets 1–8, 10 and 11. Nothing here exceeds the brief.
- Design open questions 2–5 (is 20 right, minors' data to the model, the
  ChatGPT interest form, team Ask) change no step and stay open.

## Order and dependencies

```
1 views+role ─► 2 runner ─┐
                          ├─► 7 route ─► 9 page shell ─► 10 composer ─► 11 answer+rail ─► 12 ship
3 tables+limit ───────────┤        ▲
4 sql guard ──────────────┤        │
5 answer renderer ────────┤        │
6 prompts+mock ───────────┘   8 data loaders (needs 1, 3)
```

Steps 1–3 are database; each applies its migration to the live project and
commits the file under the live version's name. Steps 4–6 are pure modules
with no dependency on each other or on the database, and may run in any
order. Nothing in 1–8 is reachable by a user: the nav entry stays
`comingSoon` and the page stays the stub until step 12, so the branch is
safe to stop on after any step.

## Steps

### 1. The `ask` schema: side and outcome rules, four views, the reader role

- **Files:** one new migration in `supabase/migrations/`;
  `tests/ask-views-parity.spec.ts` (live-DB).
- **Change:** create schema `ask` (not added to PostgREST's exposed
  schemas). Functions `ask.my_match_ids()`, `ask.my_side(matches)` restating
  `playerSide()`, and `ask.i_won(score jsonb, side)` restating
  `scoreWinner()` / `matchOutcome()`. Views `ask.matches`,
  `ask.match_stats`, `ask.points`, `ask.shots` with the design's columns and
  omissions; the migration fixes the exact column list and comments each
  column in one line (step 6 reads those comments into the prompt). Role
  `ask_reader`: `NOLOGIN`, `USAGE` on `ask`, `SELECT` on the four views,
  nothing else.
- **Verify:** the parity spec, for a seeded account with matches on both
  sides and a retired match: `ask.matches.i_won` and the me/opponent
  orientation of `ask.match_stats` equal `matchOutcome()` and `playerSide()`
  row for row. `get_advisors` shows no new security finding. A query listing
  every privilege `ask_reader` holds returns the four views only.

### 2. The query runner: `ask_run_query`

- **Files:** one new migration; `tests/ask-views-rls.spec.ts` (live-DB).
- **Change:** `public.ask_run_query(scope_sql text, sql text) returns jsonb`
  — `SECURITY DEFINER`, owned by `ask_reader`, `search_path = ask,
  pg_catalog`, `EXECUTE` to `authenticated` only. Sets the transaction
  read-only, runs `scope_sql` for the match rows and
  `with scope as (…) select … from (sql) limit 200` for the result, returns
  `{ matches, rows }`. Confirm the 8-second `authenticated` timeout binds
  inside the definer function; if it does not, set one explicitly.
- **Verify:** the RLS spec (brief criterion 6): as user A it returns none of
  user B's matches, including a teammate's match in a shared program; an
  `insert`, an `update` and a data-modifying CTE each fail; `select * from
  public.users` fails with permission denied; two statements in one string
  fail; a `pg_sleep(30)` is cut off. Then `rls-boundary-reviewer` on steps
  1–2 together.

### 3. Limit and conversation tables, with their functions

- **Files:** one new migration; `tests/ask-quota.spec.ts` (live-DB).
- **Change:** tables `ask_conversations`, `ask_messages`, `ask_usage` with
  the design's columns, cascades and RLS (`ask_usage` has no write policy at
  all). Functions `ask_reserve_question()` (advisory lock, cap of 20 held in
  the function, calendar month keyed like `processing_usage.billing_month`),
  `ask_release_question(usage_id)`, `ask_quota()` (read-only: used, cap,
  resets_on), `ask_save_exchange(...)`, `ask_delete_conversation(id)`. All
  granted to `authenticated` and `service_role`, none to `anon`.
- **Verify:** the quota spec: the 21st reservation in a month is refused;
  two concurrent reservations at 19 yield exactly one success; a released
  reservation frees its slot; deleting a conversation does not lower the
  count; user A cannot read, release or delete anything of user B's.
  `rls-boundary-reviewer` on the migration.

### 4. SQL guard (pure)

- **Files:** `src/lib/services/ask/sql-guard.ts`;
  `tests/ask-sql-guard.spec.ts`; `package.json` (one Postgres SQL parser
  dependency — pick one that runs in the Node runtime without a native
  build, and add it to `serverExternalPackages` in `next.config.ts` if it
  ships WASM).
- **Change:** `checkAskSql({ scopeSql, sql })` returns ok or a reason.
  Exactly one `SELECT` each; relations limited to the four `ask` views, plus
  `scope` in `sql`; `sql` must reference `scope`; functions limited to an
  allowlist of aggregates, date and numeric helpers.
- **Verify:** the guard spec's accept and refuse tables from the design
  (writes, DDL, two statements, data-modifying CTE, `public.users`,
  `pg_catalog`, unlisted function, `sql` ignoring `scope`).

### 5. Answer renderer and stream helper (pure)

- **Files:** `src/lib/services/ask/answer-render.ts`;
  `src/lib/services/ask/events.ts` (the NDJSON event types, shared with the
  client); `src/lib/llm/stream-response.ts` (add `ndjsonStreamResponse()`
  beside `textStreamResponse()`); `tests/ask-answer-render.spec.ts`.
- **Change:** a streaming transform from the model's text to events:
  first line → `headline`; figure lines → `figure`; the rest → `text`.
  `{{rN.column}}` references are replaced with the cell's formatted value as
  chunks pass, including a reference split across two chunks. A raw digit
  outside a reference is dropped and reported to the caller. A reference to
  a missing cell fails the answer.
- **Verify:** the render spec covers each of those, plus percent, count and
  date formatting, and a reference broken across a chunk boundary.

### 6. Prompts and mock mode

- **Files:** `src/lib/services/ask/prompts.ts`;
  `src/lib/services/ask/mock.ts`; `src/lib/llm/adapter.ts` (export
  `isLLMConfigured()`, no other change); `tests/ask-prompt.spec.ts`.
- **Change:** `buildPlanPrompt()` — the view columns and their one-line
  meanings, today's date, resolved tags, the conversation so far, the
  `{ scope_sql, sql } | { cannot_answer }` contract. `buildAnswerPrompt()` —
  the question, the rows, and the voice rules: claim first, comparison not
  advice, never type a number, thin samples stated as thin. The fixed
  no-advice sentence is a constant here, appended by the route, never
  generated. `mock.ts` holds the fixed query and the fixed answer template.
- **Verify:** the prompt spec pins the no-advice and no-typed-number wording
  and that the schema block lists exactly the four views' columns (so a view
  change that forgets the prompt fails a test).

### 7. The route: `POST /api/ask`

- **Files:** `src/app/api/ask/route.ts`; `src/lib/services/ask/ask.ts`
  (the orchestration, request-free so it can be tested);
  `src/lib/services/ask/tags.ts` (re-resolve tag ids against the viewer's
  own matches); `tests/ask-route.spec.ts`.
- **Change:** the design's eight stages in order — auth, `checkSameOrigin()`,
  `readBoundedJson()`, tag resolution, reserve, plan (one retry on a
  database error), guard, run, answer stream, save, `sources` and `done`.
  Refusals before the stream through `errorResponse()` with the design's
  status and `code` table; failures after it as an `error` event with the
  reservation released. Mock mode when `isLLMConfigured()` is false, without
  reserving.
- **Verify:** the route spec with the model and database faked at the
  module seam: each refusal's status and `code`; a failed plan, a twice-
  failed query and a provider error each release the reservation; an empty
  scope yields `no_data`; mock mode runs end to end with no key (brief
  criterion 10). `npm run typecheck`.

### 8. Server data loaders

- **Files:** `src/lib/data/ask-server.ts`; `tests/ask-server.spec.ts`
  (offline, for the pure shaping).
- **Change:** `getAskTagOptions()` — matches from `getPersonalMatches()`
  and the opponents derived from them (name, match count, handedness);
  `getAskQuota()`; `getAskConversations()`; `getAskConversation(id)`.
  `cache()`d like the rest of the data layer.
- **Verify:** the spec covers opponent grouping (same name across matches
  is one opponent; a blank name is not an opponent) and newest-first order.

### 9. Page shell

- **Files:** `src/app/dashboard/ask/page.tsx`;
  `src/app/dashboard/ask/loading.tsx`;
  `src/components/dashboard/ask/ask-page.tsx`;
  `src/components/dashboard/ask/use-ask-stream.ts`.
- **Change:** `page.tsx` becomes a Server Component that loads step 8's
  data and the conversation named by `?c=`. `AskPage` is the client shell:
  720px centre column, 340px rail slot, thread state, the in-flight stream,
  `?c=` set on a first answer, "New question". The three states with no
  conversation: no matches (empty state to `/dashboard/matches/new`, no
  composer), matches but no conversation, and a loaded conversation.
  Composer, answer and rail are stubs here, filled in by 10 and 11.
- **Before starting:** read `.skills/advantage-analytics-design/SKILL.md`,
  then `reference/foundations.md` and `reference/empty-and-loading.md`; run
  the `trace-route` skill for `/dashboard/ask`.
- **Verify:** `npm run typecheck` and `npm run lint`; the `widget-states`
  audit passes for the page's loading and empty states.

### 10. Composer and tag menu

- **Files:** `src/components/dashboard/ask/ask-composer.tsx`;
  `src/components/dashboard/ask/ask-tag-menu.tsx`;
  `tests/ask-composer.spec.ts` (component harness).
- **Change:** textarea, `@` trigger and the "Tag a match or opponent"
  button, the listbox in two groups filtered by what follows `@`, removable
  tag chips, the static "Advantage Intelligence" label (no chevron, no
  menu), the `n / 20` count, Send via `advButton()`. Disabled with the reset
  date when the limit is reached. Keyboard: arrows and Enter in the listbox,
  Escape closes, Enter sends, Shift+Enter breaks the line.
- **Before starting:** `reference/chrome.md` (menus), `reference/focus.md`,
  `reference/components.md`.
- **Verify:** the composer spec: typing `@` opens the menu, choosing a row
  adds a chip and removes the `@` text, a chip's remove button works, Send
  is disabled when empty and at the limit. `widget-states` audit.

### 11. Answer, sources and rail

- **Files:** `src/components/dashboard/ask/ask-answer.tsx`;
  `src/components/dashboard/ask/ask-sources.tsx`;
  `src/components/dashboard/ask/ask-rail.tsx`;
  `tests/ask-answer-view.spec.ts` (component harness).
- **Change:** the answer — engine mark, headline, up to three figure tiles,
  evidence, the status line naming the real step while in flight, and the
  three error states. Sources — "Computed from N matches", record rows of
  `ResultMark`, opponent, `Score`, date, each a link to the match; two
  shown, "All N" expands in place. Rail — "Tagged in this question", the
  20-unit meter with "resets on the 1st", "Earlier questions" with a delete
  row action behind `ConfirmDialog`. No "Bring your own model" link, no
  "Open Statistics" link.
- **Before starting:** `reference/primitives.md` (`ResultMark`, `Score`,
  `InsightCard`/`EngineChip`), `reference/tables.md` (row law).
- **Verify:** the view spec renders a full answer, each error state and a
  one-match answer; sources link to `/dashboard/matches/<id>`.
  `widget-states` audit; `pipeline-guardrails-reviewer` on steps 9–11.

### 12. Ship: nav, map, API description, sampled output

- **Files:** `src/lib/dashboard/nav.ts`; `MAP.md` (generated);
  `openapi/advantage-api.yaml`; `AGENTS.md` (the Routes paragraph that
  lists `/dashboard/ask` as a stub, and one line for `/api/ask` under LLM).
- **Change:** drop `comingSoon` from the personal Ask entry only — the team
  entry keeps it. `npm run map`. Describe `/api/ask` in the OpenAPI file.
- **Verify:** `npm run typecheck`, `npm run lint`, `npm run format:check`,
  `npm run api:lint`, `npm test`. Then, by hand with a real key, the
  sampled set of about 20 questions from the design — including "what
  should I work on?", a question about a teammate, and one the data cannot
  answer — read by a person for brief criterion 5, with the transcript
  attached to the PR. This last check is the user's or an attended
  session's; an unattended task cannot pass it.

## Test strategy

- **Offline specs carry the logic.** The guard, the renderer, the prompts,
  the route's decisions and the loaders' shaping are pure modules tested
  without a database or a model, so they run in every gate.
- **Live-DB specs carry the security claims.** Parity (1), access (2) and
  the limit (3) can only be shown against a real Postgres with real roles.
  They run serially under the existing machine-wide lock, skip against the
  production project unless `LIVE_DB_ALLOW_PROD=1`, and that opt-in is
  never set in a gate or a loop.
- **Component specs** use the repo's harness pattern
  (`tests/fixtures/*-harness.tsx`, `vm-modules.ts`); nothing in the Ask
  components may import `next/navigation` at a level the harness cannot
  mock.
- **The model is never called in a test.** Prompt wording is pinned; whether
  the wording works is judged once, by reading sampled output (step 12).
- **Each brief criterion and where it is shown:** 1 → step 12 and eyes-on;
  2 → 10, 11; 3 → 6, 7 and the sampled set; 4 → 5 and 7; 5 → 6 and the
  sampled set; 6 → 2; 7 → 3 and 7; 8 → 3, 8, 9; 9 → not in this slice;
  10 → 7; 11 → 12.
- **Before the PR:** `/pr-check`, whose eyes-on stage opens `/dashboard/ask`
  as the verifier account. That account needs at least one personal match
  with statistics, or every screen it sees is the empty state.

## Also consulted

- `supabase/migrations/` (file naming only), `tests/fixtures/` and
  `tests/database/` (listing only), `package.json` scripts,
  `src/lib/services/` (listing only).
