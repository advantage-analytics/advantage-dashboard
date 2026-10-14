# Design — Personal Ask page

Input: `../01_brief/output/brief.md`, unedited since stage 01. Three decisions
were taken in chat on 2026-10-10 during this stage and are treated as settled:

1. **Migrations are allowed**, applied to the live database.
2. **The AI writes SQL against curated views**, not the raw tables.
3. **Bring-your-own-model lands in later slices** — "but research this". The
   research is in "Bring-your-own-model: what is actually buildable" below, and
   it corrected one thing I had told the user.

## What the facts on the ground decided

Four things found while reading the code and the live database shape
everything below.

- **`matches.result` cannot be used to say who won.** It is free text: `won`,
  `lost`, `Cj Gimena Wins`, `Final Score`, `Unfinished`, empty. The app never
  reads it for the outcome; it uses `scoreWinner()` over `matches.score`
  (`src/lib/data/match-utils.ts`). A model writing SQL against `matches`
  would have to rediscover that rule and would not.
- **Which side is "me" differs per match.** `match_stats` and `points` are
  keyed on `is_player1`; the viewer is player 1 in some matches and player 2
  in others, by the three-step rule in `playerSide()`
  (`src/lib/data/player-identity-server.ts`). A wrong guess produces
  plausible numbers that belong to the opponent — the same silent failure
  `docs/ui-revamp-guardrails.md` §4 exists to prevent.
- **RLS is wider than "my matches".** The `matches` SELECT policy also admits
  every match of any program the viewer belongs to, and `authenticated` can
  select 30-odd other tables (`users`, `program_members`, `label_points`, …).
  "Read-only under RLS" would let a model-written query read all of that.
- **Nothing in `public` is executable by `PUBLIC`** (0 of 178 functions), and
  `authenticated` already carries `statement_timeout=8s`. A role with no
  grants can therefore call nothing and read nothing until told otherwise —
  which makes a dedicated reader role cheap and tight.

## Approaches considered

### A. Raw tables, run as the user

The model writes SQL against `matches`, `match_stats`, `points`, `shots`. The
route runs it through the user's own session, so RLS applies.

- For: no new database objects beyond the limit and conversation tables;
  every column is reachable.
- Against: all three problems above. The model must derive the outcome from
  `score` jsonb and the viewer's side from `my_player_ids()` in every query.
  Access is as wide as RLS, which includes teammates' matches and unrelated
  tables. Rejected by the user's decision 2, and by the facts.

### B. Curated `ask` views, run as a dedicated reader role — recommended

Four views in a new `ask` schema present only the viewer's own matches,
already turned to me/opponent, with a clean `i_won`. A model-written query
runs inside one database function as a role that can read those four views
and nothing else, in a read-only transaction.

- For: the two silent-corruption rules are written once, in SQL, and tested
  against the TypeScript originals. The model's schema is small and named in
  the player's terms, so it writes better SQL. Access is narrower than RLS by
  construction, not by trusting a prompt.
- Against: one more place that states "which side is me" and "who won" (a
  parity test holds it to the TypeScript rule). Anything not in a view cannot
  be asked about until a view grows a column.

### C. No free SQL — the model picks from a fixed metric catalogue

The model returns a structured request (`metric`, `filters`, `group by`) and
the server compiles the SQL.

- For: no SQL to validate; nothing can go wrong at the database.
- Against: it is not what was asked for — the user's words were "the AI is
  used to generate the right SQL query". It also caps Ask at whatever the
  catalogue anticipated, which is the Statistics page's job, not Ask's.

**Recommendation: B.** It is the only one that satisfies both "the AI writes
the SQL" and "a model-written query cannot widen access", and it is the only
one where the wrong-player failure is closed in the database rather than left
to a prompt.

## Bring-your-own-model: what is actually buildable

Researched 2026-10-10. Primary sources where I could reach them.

| Part of the design | Status | Basis |
|---|---|---|
| **Sign in with Claude** | **Not permitted.** | Anthropic's own page: it "does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users." Developers are told to use API keys. |
| **Sign in with ChatGPT** | **Exists, but invite-only.** I told the user this was not possible; that was out of date. | OpenAI launched plan-usage sharing on 2026-09-29. Commercial apps join through a limited trial and an interest form; open-source and local personal projects are self-serve, which Advantage is not. OpenAI's help article returned 403 to me, so the plan details come from search summaries of it. |
| **API key** ("Use an API key instead") | **Buildable today**, both providers. | Standard API access; usage bills to the key owner. |
| **MCP connector** | **Buildable today**, and it is the sanctioned way for a player to use their own Claude or ChatGPT subscription on their Advantage data. | Both products accept a remote MCP server by URL; it must be publicly reachable and, in practice, speak OAuth 2.1. |

What follows for the slices (decision 3 keeps all of this out of the first
PR):

- **Slice 2 — own model by API key.** The model menu, the connect dialog's
  key path, encrypted key storage, and the model writing the SQL as well as
  the answer. Exempt from the question limit.
- **Slice 3 — MCP connector.** A remote MCP server with its own OAuth. It
  reuses this design's `ask` views and reader role unchanged, which is a
  second reason to build them now.
- **Sign in with ChatGPT** — one action only the user can take: submit
  OpenAI's interest form. If Advantage is admitted it becomes a row in slice
  2's menu. Nothing is built for it until then.
- **Sign in with Claude** — dropped. The `AskConnect` frame's "Claude ·
  Anthropic account · connected" row cannot ship as drawn.

Each slice gets its own brief when its turn comes. This design covers slice 1.

## Chosen design — slice 1

Ask with Advantage Intelligence, the question limit, and saved conversations.

### Architecture

```
/dashboard/ask (Server Component)
  └─ loads: tag options · quota · conversation list · the open conversation
     └─ <AskPage> (client): thread · composer · right rail
          └─ POST /api/ask  ──────────────────────────────────────────┐
                                                                       │
  1 auth, same-origin, bounded body        (errorResponse on refusal)  │
  2 resolve tags against the viewer's own matches                      │
  3 ask_reserve_question()   → 429 ask_limit_reached when spent        │
  4 PLAN    model writes { scope_sql, sql } against the ask views      │
  5 CHECK   parser: one SELECT, ask.* and `scope` only                 │
  6 RUN     ask_run_query() as role ask_reader, read-only, ≤200 rows   │
  7 ANSWER  model streams prose that cites cells, never types numbers  │
  8 save both messages; stream ends with sources + remaining count  ◄──┘
```

Two model calls per question, both through `getLLMStream()`: a short
non-streamed one that writes the query (the route collects the chunks), and
the streamed one the player watches.

### Database (one migration per object group; verify against live, not the folder)

**Schema `ask`, four views.** Not exposed through PostgREST. Every view
returns only the viewer's own personal matches and is already oriented.

| View | One row per | Columns (indicative — the plan stage fixes the list) |
|---|---|---|
| `ask.matches` | match | `match_id`, `played_on`, `opponent_name`, `opponent_hand`, `opponent_backhand`, `tournament`, `round`, `court_type`, `match_type`, `i_won` (null when the score cannot say), `score_text`, `source`, `duration_seconds`, `has_stats` |
| `ask.match_stats` | match × side | `match_id`, `side` (`me` / `opponent`), every counter in `match_stats`, every percentage in `match_stats_with_percentages` |
| `ask.points` | point | `match_id`, `set_number`, `game_number`, `point_number`, `i_served`, `i_won`, `is_break_point`, `is_set_point`, `is_match_point`, `is_pressure_point`, `rally_length`, `result_type` |
| `ask.shots` | shot | `match_id`, `point_number`, `shot_number`, `mine`, `shot_type`, `spin_type`, `speed_mph`, `zone`, `result` |

Rules the views carry so no query has to:

- **Whose matches.** The same set the personal Matches list shows —
  `created_by = auth.uid() and program_id is null`, as `getPersonalMatches()`
  has it — so "Computed from 9 matches" always names rows the player can open
  from this workspace. See Open question 1.
- **My side** — `playerSide()`'s three steps, restated once in a SQL function
  `ask.my_side(matches)`.
- **Who won** — `scoreWinner()`: the stored `score.winner` when present,
  otherwise the set count, otherwise null.
- **Left out on purpose:** shot coordinates (SwingVision fault coordinates
  are imputed; `result` and `zone` are the trustworthy columns), video times,
  `key_moments`, `insights`, and every id but `match_id`.

**Role `ask_reader`** — `NOLOGIN`, `USAGE` on schema `ask`, `SELECT` on the
four views, nothing else.

**Function `public.ask_run_query(scope_sql text, sql text) returns jsonb`** —
`SECURITY DEFINER`, owned by `ask_reader`, `search_path = ask, pg_catalog`,
executable by `authenticated` only. It sets the transaction read-only, then
executes `with scope as (<scope_sql>) select … from (<sql>) limit 200` and
returns `{ matches: [...], rows: [...] }`. `auth.uid()` still resolves inside
it, because it reads the request's JWT setting, so the views still know who is
asking. Three independent guards, any one of which is sufficient against a
write or a wider read:

1. the role holds no privilege outside the four views;
2. the transaction is read-only;
3. the query is wrapped as a subquery, so a statement that is not a single
   `SELECT` does not parse.

The 8-second `authenticated` timeout already bounds runtime; the plan stage
confirms it applies through the definer function and adds an explicit one if
it does not.

**Tables.**

- `ask_conversations` — `id`, `user_id` (FK `users`, cascade), `title`,
  `created_at`, `updated_at`. RLS: owner may select and delete.
- `ask_messages` — `id`, `conversation_id` (cascade), `user_id`, `role`
  (`user` / `assistant`), `content jsonb`, `created_at`. For a question:
  text and tags. For an answer: headline, figures, body, the match ids it was
  computed from, and the SQL that produced it. RLS: owner may select.
- `ask_usage` — `id`, `user_id`, `billing_month date`, `created_at`. RLS:
  owner may select; **no insert, update or delete policy**. Separate from the
  messages so deleting a conversation cannot hand questions back.

Writes go through two definer functions, because the limit must not be
something the browser can restate:

- `ask_reserve_question() returns jsonb` — under a per-user advisory lock,
  counts this month's `ask_usage` rows, refuses at the cap, otherwise inserts
  one and returns `{ usage_id, used, cap, resets_on }`. **The cap lives in
  this function, not in TypeScript.**
- `ask_release_question(usage_id)` — deletes the caller's own reservation;
  called when a question fails before an answer is produced, so a failure
  never costs the player a question.
- `ask_save_exchange(...)` — writes the question and answer rows and creates
  the conversation on a first question, in one transaction.

New functions follow `20261001184305`'s default: `authenticated` and
`service_role`, never `anon`.

### The question limit

**20 questions per calendar month, resetting on the 1st**, the same for every
account. The number and the reset both come from the artboard ("12 of 20
questions left this month", "resets on the 1st"), and the calendar month
matches how `processing_usage.billing_month` already works. Pro is not
enforced anywhere today and a new tier plan is pending, so there is one cap,
changed in one function when tiers arrive.

### Route — `POST /api/ask`

`src/app/api/ask/route.ts`, `runtime = "nodejs"`, decision logic in
`src/lib/services/ask/` so it can be tested without a request.

Request: `{ conversationId?: string, question: string, tags: { kind:
"match" | "opponent", id: string }[] }`. Read with `checkSameOrigin()` and
`readBoundedJson()`.

Response: a streamed `application/x-ndjson` body, one event per line —
`status` (`planning` / `querying` / `writing`), `headline`, `figure`, `text`,
`sources`, `done` (`conversationId`, `used`, `cap`), `error`. The existing
`textStreamResponse()` carries one sentence of plain text; Ask needs
structure, so it gets a sibling `ndjsonStreamResponse()` in
`src/lib/llm/stream-response.ts` rather than a third copy of the encoder loop.

**Plan step.** The system prompt holds the four views' columns with one line
each on meaning, today's date, the resolved tags (match ids, opponent names),
and the conversation so far. It asks for JSON `{ scope_sql, sql }` or
`{ cannot_answer: reason }`. `scope_sql` selects the `match_id`s the question
is about; `sql` computes the answer and reads its matches from `scope`. That
split is what lets the page say truthfully which matches an answer was
computed from. Comparisons and differences are computed in the SQL, not in
prose. On a database error the route feeds the error back once and retries;
a second failure is a refusal.

**Check step.** `src/lib/services/ask/sql-guard.ts`, a pure module using a
Postgres SQL parser (dependency chosen in the plan stage): exactly one
`SELECT`; every relation is `scope` or one of the four `ask` views; `sql`
references `scope`; no function outside a short allowlist of aggregates and
date/number helpers. This guard is for a clear error and an early stop — the
database's three guards are what the security rests on.

**Answer step.** The system prompt holds the question and the returned rows
as a small table. Its rules are the product's existing voice
(`/api/home-insight`) extended:

- First line: one claim, at most two sentences, no digits.
- Then up to three figure lines, each a label and one cell reference.
- Then at most three short paragraphs of evidence.
- **Never type a number.** Every figure, percentage, count and date is
  written as a reference to a cell of the result — `{{r2.second_serve_won_pct}}`
  — and the server substitutes the value as it streams. A raw digit in the
  model's prose is dropped and logged. This is the home card's rule ("a number
  you write is a number nobody verified") made mechanical, and it is what
  makes success criterion 4 true by construction rather than by hope.
- **No advice.** No recommendation, drill, tactic, strategy, encouragement or
  praise. When the question asks for advice, answer the factual part and end
  with one fixed sentence the server appends — "Ask reports what your matches
  show; it does not recommend what to work on." — so that sentence is never
  the model's to improvise.
- A thin sample is stated as thin: one or two matches reads as provisional.

**The "so-what" beat** (brief Open question 2) becomes a **comparison**: the
figure against the player's own all-matches average or against another slice
of their matches, both computed by the query. That is what the artboard's
answer already does (55% vs. 48% vs. 41%), and it is a fact, not advice.

**Mock mode.** `getLLMStream()` falls back to a fixed warning sentence, which
is useless as a query. The adapter gains an exported `isLLMConfigured()`;
when it is false, `src/lib/services/ask/mock.ts` supplies a fixed
`{ scope_sql, sql }` (the player's record and second-serve points won across
all matches) and a fixed answer template with cell references. The query
still runs against the real views, so mock mode exercises everything but the
model. Mock questions do not count against the limit.

### Components

Route trace: `/dashboard/ask` → `src/app/dashboard/ask/page.tsx` →
`ComingSoonPage` today, with no other importer. Nothing shares the name.

New, under `src/components/dashboard/ask/`:

| File | What it is |
|---|---|
| `ask-page.tsx` | Client shell. Owns the thread, the in-flight stream and the open menu. Centre column `max-width: 720px`, right rail `340px`. |
| `ask-composer.tsx` | Textarea, the `@` trigger and "Tag a match or opponent" button, tag chips, the static engine label, the `12 / 20` count, Send. |
| `ask-tag-menu.tsx` | Listbox in two groups, Opponents and Matches, filtered as the player types after `@`. Built on `FloatMenu`. |
| `ask-answer.tsx` | Engine mark and name, headline, up to three figure tiles, evidence paragraphs, sources. |
| `ask-sources.tsx` | "Computed from N matches": record rows of `ResultMark`, opponent, `Score`, date; first two shown, "All N" expands in place. Each row opens the match. |
| `ask-rail.tsx` | "Tagged in this question", the 20-unit meter with "resets on the 1st", "Earlier questions". |
| `use-ask-stream.ts` | Reads the NDJSON stream into thread state. |

`src/app/dashboard/ask/page.tsx` becomes a Server Component that loads
through `src/lib/data/ask-server.ts` — tag options (from
`getPersonalMatches()`), the quota, the conversation list, and the
conversation named by `?c=<id>` — and gets a `loading.tsx` skeleton.

Departures from the artboard, each deliberate:

- **The model control is a static label**, "Advantage Intelligence", with no
  chevron and no menu. A menu with one row is a control that does nothing;
  it returns in slice 2. The rail's "Bring your own model" link is left out
  for the same reason.
- **No "Groups" in the tag menu** ("Left-handed opponents", "Last 5
  matches"). The brief asks for matches and opponents; a period or a
  handedness is said in words and the query handles it.
- **No "Open Statistics" link.** `/dashboard/statistics` is a stub on this
  branch; the sibling branch can add the link when both have landed.
- **Colours and spacing come from the codebase's tokens and primitives**, not
  the artboard's v3 token file, and the frames were never rendered — layout
  intent only.

States: no matches at all → the page's empty state points to
`/dashboard/matches/new` and the composer is not offered; matches but no
conversation → the composer alone under the page title; limit reached → the
composer is disabled with the reset date beside the count; `loading.tsx` and
the in-flight answer follow `reference/empty-and-loading.md` (a status line
that names the real step — planning, querying, writing — never a fake
progress bar).

The build reads `SKILL.md` plus `reference/foundations.md`, `components.md`,
`chrome.md` (menus, glyph registry), `primitives.md` (`ResultMark`, `Score`,
`InsightCard`/`EngineChip`), `empty-and-loading.md` and `focus.md`.

`nav.ts` loses `comingSoon` on the personal Ask entry only; `npm run map`
after. `openapi/advantage-api.yaml` gains `/api/ask`.

### Data flow for one question

1. The player types, tags with `@`, sends. The client appends the question
   optimistically and opens the stream.
2. The route authenticates, re-resolves each tag id against the viewer's own
   matches (a tag is never trusted as text from the browser), and reserves a
   question.
3. Plan → check → run. `ask_run_query` returns the scope's matches and up to
   200 result rows.
4. The answer streams; cell references become values on the way out.
5. The route saves both messages, then sends `sources` and `done`. The
   client updates the meter and, on a first question, puts `?c=<id>` in the
   URL and the conversation at the top of "Earlier questions".

Conversations are kept until the player deletes them (a row action under
"Earlier questions", confirmed with `ConfirmDialog`) or deletes their
account. A saved answer is **frozen**: reopening shows what was said, with
its date, and does not re-run the query — an answer that silently changed
would be worse than one that is visibly dated. A follow-up question in an
old conversation runs fresh.

### Error handling

Before the stream opens, refusals are `errorResponse()`:

| Status | `code` | When |
|---|---|---|
| 401 | `unauthenticated` | no session |
| 403 | `cross_origin` | `checkSameOrigin()` fails |
| 400 | `invalid_request` | empty or over-long question, malformed tags, a tag that is not the viewer's |
| 404 | `conversation_not_found` | `conversationId` is not the viewer's |
| 409 | `no_matches` | the viewer has no personal match with statistics |
| 429 | `ask_limit_reached` | `detail` carries `used`, `cap`, `resets_on` |

After it opens, failure is an `error` event and the reservation is released:

- `cannot_answer` — the model said the data cannot answer it, or the query
  failed twice. The player sees "Your match data can't answer that" and what
  the views do cover.
- `no_data` — the query ran and the scope is empty ("No matches against
  left-handers yet"). Stated plainly; never dressed as a finding.
- `llm_unavailable` — the provider errored. The question stays in the
  composer.

An answer the player received always costs one question; nothing else does.

### Testing

Offline specs (`tests/`, Playwright runner):

- `ask-sql-guard.spec.ts` — accepts plain aggregates over the views; refuses
  `insert`/`update`/`delete`/DDL, two statements, a data-modifying CTE,
  `public.users`, `pg_catalog` reads, an unlisted function, and `sql` that
  ignores `scope`.
- `ask-answer-render.spec.ts` — cell references substitute; a raw digit is
  dropped; a reference to a missing cell fails the answer rather than
  printing a blank.
- `ask-prompt.spec.ts` — pins the no-advice and no-typed-number wording, as
  `generate-insights-prompt.spec.ts` does for the summary voice.
- `ask-route.spec.ts` — each refusal's status and `code`; a failed answer
  releases its reservation; mock mode end to end with no key.

Live-DB specs (serial, under the existing lock, never against prod in a
gate):

- `ask-views-rls.spec.ts` — **success criterion 6.** As user A,
  `ask_run_query` returns none of user B's matches, including a teammate's
  match in a shared program; a write through it fails; `select * from
  public.users` through it fails with permission denied.
- `ask-views-parity.spec.ts` — for a fixture account, `ask.matches.i_won`
  and the me/opponent orientation equal `matchOutcome()` and `playerSide()`
  row for row. This is what stops the restated rules drifting.
- `ask-quota.spec.ts` — the 21st reservation in a month is refused; two
  concurrent reservations at 19 yield exactly one success; deleting a
  conversation does not lower the count.

Sampled, not gated: a set of about 20 questions — including "what should I
work on?", a question about a teammate, and one the data cannot answer —
run against the real model and read by a person before the PR, for criterion
5. The prompt spec pins wording; only reading output shows whether the
wording works.

Reviewers the build should invoke: `rls-boundary-reviewer` on the migrations
and route, `pipeline-guardrails-reviewer` on the dashboard diff.

### Landing

Slice 1 is **one PR** into `splitstep-integration`. It is large but not
separable: the views, the runner and the page only mean something together,
and the limit has to exist before the route is public. Suggested task
grouping for stage 04: (1) views, role and runner with their live specs;
(2) limit and conversation tables and functions; (3) SQL guard and answer
renderer, pure; (4) route; (5) page and components; (6) nav, map, OpenAPI.

## Open questions

Resolved here from the brief: 1 (migrations — yes), 2 (so-what — a computed
comparison), 3 (SQL surface — curated views), 4 (advice — answer the facts,
append the fixed sentence), 5 (unanswerable — `cannot_answer` / `no_data`),
6 (limit — 20 per calendar month, one cap), 8 (persistence — kept until
deleted, frozen), 9 (one feature? — three slices, slice 1 is one PR).

Carried forward:

1. **Whose matches does Ask cover?** The design uses the personal Matches
   list's rule: matches the player uploaded outside any team. A player whose
   college matches were recorded by a coach would not be able to ask about
   those from their personal workspace. The alternative is every match the
   viewer played in (`my_player_ids()`), which then cites matches the
   personal Matches list does not show. The first is consistent; the second
   is more useful to team players. Say which before stage 03.
2. **Is 20 a month right?** It is the artboard's number, not a costed one.
   Each question is two model calls on `gemini-3.5-flash-lite` in production.
3. **Minors and the model.** The query result sent to the model contains
   opponent names and the player's statistics, and some players are minors.
   The existing insight routes already send first names and statistics to
   the same provider, so this is not new in kind, but it is more data per
   request. PostHog stays in privacy mode as it is. Worth a deliberate yes.
4. **Sign in with ChatGPT** — whether to submit OpenAI's interest form now,
   so an answer exists by the time slice 2 is planned. Only the user can.
5. **Team Ask** stays a stub (brief non-goal). The `ask` views are
   personal-only; a team version is a different scope and a separate design.

## Also consulted

Beyond the declared inputs (`brief.md`, `MAP.md`,
`docs/ui-revamp-guardrails.md`, `.skills/advantage-analytics-design/SKILL.md`):

- Artifact <https://claude.ai/artifact/USGQxmojNd6K6rCvCCfxaV>:
  `project/Ask.dc.html`, `project/AskConnect.dc.html`
- `src/lib/llm/adapter.ts`, `src/lib/llm/stream-response.ts`
- `src/app/api/home-insight/route.ts`
- `src/app/dashboard/ask/page.tsx`, `src/lib/dashboard/nav.ts`
- `src/lib/services/match-video/http.ts` (exports only)
- `src/lib/data/player-identity-server.ts`, `src/lib/data/match-utils.ts`,
  `src/lib/data/personal-matches-server.ts`; export lists of
  `opponents-server.ts` and `usage-server.ts`
- `src/lib/workspace/types.ts`, `src/lib/user/plan.ts` (grep only)
- Live database (project `pouxujkhtbvkdwbzfvka`, read-only queries): table
  and view list with RLS and grants; columns of `matches`, `match_stats`,
  `match_stats_with_percentages`, `points`, `shots`, `processing_usage`;
  SELECT policies on those; definitions of `my_player_ids`,
  `visible_match_ids`, `visible_point_ids`; distinct `matches.result`,
  `source_provider`, `status`; role settings; function execute grants
- `docs/ui-revamp-guardrails.md` was read by section headings plus §3.5 and
  §4, not end to end (1,031 lines). Ask writes no match data and touches
  none of §2's files; if the build goes near the wizard or match detail, read
  §2 in full first.
- Web, for the bring-your-own-model research:
  <https://code.claude.com/docs/en/legal-and-compliance> (read directly);
  <https://developers.openai.com/siwc/quickstart>,
  <https://openai.com/form/sign-in-with-chatgpt-interest/>,
  <https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites>
  (search summaries; the help article refused a direct fetch);
  <https://thenewstack.io/sign-in-with-chatgpt/>;
  <https://support.claude.com/en/articles/11175166-using-connectors-in-claude-ai>
