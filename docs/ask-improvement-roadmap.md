# Ask — improvement roadmap

**Point-in-time (2026-10-14).** A survey of every way the Ask feature
(`/dashboard/ask`, `/dashboard/team/ask`, `POST /api/ask`) could get faster,
cheaper, more accurate and more useful, grounded in measurements taken that day
against the live database and PostHog. Nothing here is built. The "Where the
time goes" section is the baseline to re-measure against; everything after it
is a menu, ranked at the end.

**Status, 2026-10-15:** 2.1 (the `mine` CTE), 5.1 (usage on the Gemini path)
and 5.2 (span names, one trace per question) landed together; see migration
`20261015014557_ask_my_matches` and `docs/llm-setup.md` §7. Then 1.2 (prompts
laid out fixed text first), 1.3 (the plan reply as a JSON schema at
temperature 0), 1.10 (the court line), 2.6 (sources before the answer, one
save call: `ask_save_exchange_ids`), 2.7 (the pre-stream reads in parallel,
one auth read) and 2.8 (`maxDuration`, the abort signal) landed as Tier 1b.
Tier 2 followed on `claude/ask-tier-2`: 5.3 (`ask_runs` and the `ask_run`
product event), 1.1 and 1.5 (a model per stage, provider fallback, cached SDK
clients), 4.1 (starter questions and follow-ups), 2.9 (the answer cache,
`ask_answer_cache` + `ask_data_version`), 2.3 (`ask_point_facts` kept by
statement triggers and the fifth view `ask.point_plays`; the serve +1, plays
and pattern templates read it — serve +1 146 → 97 ms, losing plays 109 → 97
ms, double faults no longer counted twice), 3.1–3.4 and 6.1's figures (serve
placement drawn on the court, matchup bars, a two-series trend with match
links, point-by-point momentum, and a one-cell figure tile that opens the
film filtered to its measure), 6.2 (the wizard hand-off with `?return=ask`,
and Ask on arrival: the first question asked for the uploader when a
personal match finishes processing, its headline on the "analysis ready"
mail), and 1.8 in part (the harness scores itself — `scripts/ask-eval-season.json`
carries an `expect` block per question pinning the seed's deterministic
values where the scope is seeded-only (Dvorsky 0-3) and
shape/visual/notice/SQL checks elsewhere; the team file carries structural
checks; the nightly workflow is written but off by default; still open are
p50/p95 per stage and the PostHog rubric). 2.2 (a participation table) was
deferred: after 2.1 `ask.my_matches()` runs in 4 ms, and keeping a table
current from the roster's claim and merge paths is the only risk left in
it. Tier 3 followed on `claude/ask-tier-3`: 1.6 (`ask_examples` with
`gemini-embedding-001` vectors; the three nearest rated pairs in the plan
prompt's tail; a thumbs-up learnt as it happens; `scripts/ask-examples-seed.ts`
— the store is empty until it is run), 1.7 (a routed view shortlist in the
tail, the schema block kept in the cached prefix; measurement in
`prompts.ts`), 4.5 (the planner's state object saved with the answer and shown
ahead of a shortened turn tail; the writer gets the previous headline), 4.3
(coach mode behind `ASK_COACH_MODE`, team owners and coaches, off: a product
decision not yet taken), 3.6–3.10 (the play tree for +1 and pattern answers,
form ticks with opponent and score, clicks on bars, rows, zones and ticks into
the Video tab, server-chosen visuals validated against the rows, visual-first
layout when a chart was asked for), 4.6–4.9 (Ask about this match, a player
or an opponent, and Ask in the palette; rail titles, rename, pin and a
filter; the page below 768 px; Admin › Ask feedback reader, `/admin/ask`),
6.4 (action cards from a fixed catalogue: watch, pin, visualize, save a view,
export CSV, share, open), 3.11 (pins: `ask_pins` + `ask_pin_answer()`, the
"Pinned from Ask" card on the personal Home), 6.1's strip ("Show me" through
`POST /api/ask/show`, which re-runs the saved scope only; a point list and an
inline clip strip under the answer — a 340-px Ask drawer in the film room was
built and taken out the same day: the match page's one chat glyph links into
Ask on every view, and an answer's film links bring the reader back to the
Video tab on the points they counted) and 6.3's playlist and preset (`?pn=` point sets, "Open on these points" on the
share popover; no mp4 export — the "Play in sequence" glyph was folded into Skip dead time, which walks the listed points, 2026-10-25). Still open from Tier 3: model-written titles,
a pins slot on the team Home, thumbnails in the point list, and the live
model has not been run against any of it. Everything else below is still
unbuilt unless its section says otherwise.

Shipped so far: PR #436 (the feature), #442 (plays, patterns, Video links,
clarifying questions), #443 (feedback), #446 (admin unlimited), #447 (exact +1).
Design record: `work/personal-ask-page/02_design/output/design.md`.

## Where the time goes today

One question is a chain of sequential steps. Nothing runs in parallel.

| Stage               | What runs                                                                                                                                                                              | Measured                                                                      | Source                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------- |
| Pre-stream          | same-origin → `auth.getUser()` → body → (team) workspace → **all** tag options (every personal match, plus a second `getUser`) → conversation + every message → `ask_reserve_question` | not instrumented; ~8 sequential Vercel→Supabase round trips, iad1 → us-east-2 | `src/app/api/ask/route.ts:303-499`       |
| Plan call           | `gemini-3.5-flash-lite`, ~32k-char system prompt (8–9k tokens), reply buffered whole, up to 3 attempts                                                                                 | first call in a multi-call trace: **1.2–1.8 s**                               | PostHog `$ai_generation`, Sept 14–Oct 14 |
| SQL guard + reroute | pure code                                                                                                                                                                              | ms                                                                            | `sql-guard.ts`, `ask.ts:987`             |
| Query               | `ask_run_query` → scope SQL run **twice** + the model's SQL                                                                                                                            | points / match_stats **~100 ms**, shots **~145 ms warm, 1.2 s cold**          | live `EXPLAIN ANALYZE`, 18-match viewer  |
| Answer call         | same model, ~17k-char prompt (4.5k tokens), streamed                                                                                                                                   | **0.8–1.2 s** + stream                                                        | PostHog                                  |
| Save                | `ask_save_exchange` then `ask_last_answer_id`, sequential; `sources` only after both                                                                                                   | 2 round trips                                                                 | `ask.ts:2025-2060`                       |
| Worst path          | 3 plan attempts + pattern read + answer = 5 model calls                                                                                                                                | **6.4–8.1 s of model time** observed on 4- and 5-call traces                  | PostHog                                  |

What the user sees: an optimistic bubble, then "Planning the query" for the
whole plan call, "Reading your matches", and a headline only once the answer
model has finished its first line. A fair estimate for the happy path is
**3–5 s to first content**; a retry-heavy question is 10 s+.

Facts that shape the rest of this document:

- **Volume is tiny.** 50 questions ever, 4 askers, 26 conversations, 3 feedback
  rows (2 down, 1 up). 93 matches, 7.5k points, 41k shots (12 MB) in the whole
  database. The database is not the bottleneck today; the model calls are.
- **The database cost is O(all matches), not O(the viewer's matches).** Every
  `ask.*` view starts with a `mine` CTE that calls `ask.my_side(m.*)` on every
  row of `public.matches` before joining to `my_match_ids()`; `my_side` is a
  SECURITY DEFINER SQL function with `search_path=''` that cannot be inlined and
  re-signs the viewer on every call (~1 ms each). Measured 90 ms for 93 rows.
  At 5,000 matches this alone would exceed the 8 s statement timeout.
- **Nobody knows what Ask costs.** All 701 Gemini generation events in the last
  30 days report **0 input and 0 output tokens** and $0 cost: the OpenAI-compat
  streaming call never asks for `stream_options: { include_usage: true }`.
  There is also no per-stage name on the events, so Ask's calls cannot be told
  apart from the home and team insight cards.
- **Failures leave no record.** Only successful exchanges are saved;
  `cannot_answer`, guard rejections, retries and `llm_unavailable` vanish. Ask
  fires no PostHog product events at all.
- **Two of three answers get a table.** Visual kinds on saved answers: table 33,
  none 10, split 3, trend 3, serve 1, bars 0, form 0.
- **The demand is advice-shaped.** Of the 50 questions, about a quarter are
  "how can I improve", "how should X play against Y", "tell me how to beat this
  opponent", which the product answers with facts plus a fixed no-advice line.

## 1. Model layer

### 1.1 Per-stage models

Everything runs on one model (`route.ts:459-467` builds one stream for all
stages). The planner (text-to-SQL) is the hard, accuracy-critical step; the
writer (prose over rows with cell references) is easy. Give each its own model
via `ASK_PLAN_MODEL` / `ASK_ANSWER_MODEL`, and choose with the eval harness
(1.8), not by taste.

Official list prices on 2026-10-14, per million tokens, with a per-question
estimate for the happy path (plan ≈ 9k in / 0.3k out, answer ≈ 4.5k in /
0.4k out):

| Model                           | Input | Output | Cache read | ≈ per question                  | Notes                                                |
| ------------------------------- | ----- | ------ | ---------- | ------------------------------- | ---------------------------------------------------- |
| `gemini-3.5-flash-lite` (today) | $0.30 | $2.50  | $0.03      | $0.006                          | fast; weakest at SQL                                 |
| `gemini-3.8-flash`              | $0.75 | $3.75  | $0.075     | $0.013 uncached, ~$0.005 cached | rises to $1.50 / $7.50 on 2027-01-01                 |
| `gemini-3.1-pro-preview`        | $2.00 | $12.00 | $0.20      | $0.035                          | overkill for the writer                              |
| `claude-haiku-5-5`              | $0.10 | $0.50  | $0.01      | $0.002                          | cheapest listed; test as the writer and as a planner |
| `claude-sonnet-5-5`             | $2.00 | $10.00 | $0.10      | $0.034 uncached, ~$0.013 cached | strong planner candidate                             |
| `claude-opus-5-5`               | $4.00 | $20.00 | $0.20      | $0.07                           | only if Sonnet fails the eval                        |

Sources: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing),
[Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing).
At 20 questions per user per month and 100 active users, even the most
expensive mix is under $70/month. **Cost is not the constraint; latency and
SQL correctness are.** The Anthropic branch still names `claude-opus-4-6`
(`adapter.ts:158`); update it when the adapter grows per-call options.

Recommended first experiment: Sonnet 5.5 or 3.8-flash as planner, Haiku 5.5
or flash-lite as writer, judged on the eval set.

### 1.2 Prompt caching

No caching exists, and the prompts are laid out so none can happen:

- The plan prompt puts **today's date on line 3** (`prompts.ts:421`), so the
  13k-char schema block that follows never shares a prefix across days, and the
  conversation and previous plan come after the schema.
- The answer prompt puts **the question and rows first** and the ~10k chars of
  fixed rules and examples last (`prompts.ts:786-802`).

Reorder both: fixed rules → schema → examples → (dynamic) date, tags, history,
rows. Then:

- Anthropic: mark the static prefix with `cache_control` (5-minute cache; the
  prefix is well over the 1,024/2,048-token minimum). Cache reads are 10× cheaper
  than input and the prefill is skipped, which cuts time-to-first-token.
- Gemini: implicit caching applies automatically to a stable prefix on 2.5+
  models; the same reorder is what makes it hit.

Honest caveat: at today's volume (well under one question per five minutes
fleet-wide) cross-user hits will be rare. The reliable win is **inside one
question**: plan attempts 2 and 3 re-send the identical prefix seconds later,
and the answer call can share the schema prefix with the plan call if the two
prompts are built from one base.

### 1.3 Structured output for the plan

The planner's reply is free text parsed into one of four shapes
(`parsePlanReply`, `ask.ts:2160`), and a parse failure costs a full retry.
Both providers support JSON-schema-constrained output (Gemini `response_format`
/ `responseSchema`, Anthropic tool-use with a fixed schema). Declare the four
shapes as one discriminated-union schema, set `temperature: 0` for the planner,
and keep the parser only as a belt-and-braces check. Expected effect: fewer
3-attempt questions, which are the 6–8 s outliers above.

### 1.4 Reasoning controls

No sampling or thinking parameters are set anywhere. On Gemini 3.x the
OpenAI-compat `reasoning_effort` maps to the thinking level; set it to `low`
(or off) for the writer, where thinking adds latency and nothing else, and try
`low` vs `medium` for the planner in the eval. Set `max_tokens` on the Gemini
path (only the Anthropic path has one, 1,024).

### 1.5 Adapter v2

`getLLMStream(system, messages, context)` has no room for any of the above.
Grow it (or add `getLLMCompletion` beside it) with: `model`, `temperature`,
`maxTokens`, `jsonSchema`, `reasoning`, `cacheStaticPrefix`, `signal`
(propagate `request.signal`, which is ignored today: `ask.ts` only notices a
client disconnect at the next yield), a per-call `timeoutMs`, `stage` and
`feature` tags for telemetry, and `includeUsage`. Create the SDK clients once at
module scope instead of per call (`adapter.ts:170-180`, `:220-232`), and add a
provider fallback so one vendor's outage is `llm_unavailable` only after the
other was tried.

### 1.6 Dynamic few-shot from rated answers

The single most effective text-to-SQL technique in practice is retrieving a few
_similar, known-good_ (question → SQL) pairs into the prompt instead of fixed
examples. `ask_feedback` already stores the question, the answer and the SQL
for every rated answer, and the `ask-eval-*.json` lists hold `want` notes.
Embed thumbs-up and eval-verified pairs (pgvector, `gemini-embedding-2` or
equivalent), retrieve the top 3 by similarity per question, and replace the 5–7
static examples. This also turns the feedback loop into a product loop.

### 1.7 Schema routing

The schema block is 13k chars and `ask.match_stats` alone is 7.8k of it (86
columns). Most questions touch one or two views. Classify the question first
(keyword rules already exist in `reroute()`; a Haiku-class call or an embedding
nearest-view lookup covers the rest) and send only the relevant view sections
plus a one-line index of the others. Smaller prompt, faster plan, and fewer
wrong-column mistakes.

### 1.8 Eval harness into CI

`scripts/ask-eval.ts` runs 21 season and 32 team questions through the real
pipeline and writes a report a human reads. It has no scoring. Add expected
values (the seeded account from `scripts/seed-ask-season.ts` makes every answer
deterministic), grade automatically (numbers present and correct, no typed
digits, no advice, a visual when expected, attempts = 1), run it nightly and on
any change to `prompts.ts`, `schema.ts` or the model config, and report the
pass rate and p50/p95 latency per stage. Every model or prompt idea in this
document is then a measured A/B, not an opinion. PostHog's LLM evaluations can
hold the same rubric for sampled production answers.

### 1.9 Verification pass

Optional, async: after the answer streams, a cheap judge checks the headline
and figures against the rows and records a score (PostHog `$ai_evaluation` or an
`ask_runs` row). Never in the request path; use it to find the answers to read.

### 1.10 Housekeeping

`docs/llm-setup.md` still says the OpenAI branch means `gpt-4o` and never
mentions Ask. The prompt still says "No view records which court (deuce or ad) a
serve was hit from" (`prompts.ts:523`, `:1058`) although `ask.points.court`
has existed since migration `20261014214810`.

## 2. Data architecture

### 2.1 Fix the `mine` CTE (highest value per hour)

Measured on the live database for an 18-match viewer, same session:

| Formulation                                                                                                       | Execution time                                 |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Today: `where m.id in (select ask.my_match_ids()) and ask.my_side(m.*) is not null`                               | **90 ms** (seq scan, `my_side` on all 93 rows) |
| `where m.id = any(array(select ask.my_match_ids())) and …`                                                        | 31 ms (index scan, `my_side` on 18 rows)       |
| One pass: resolve `ask.viewer()` and `ask.viewer_player_ids()` once in materialized CTEs, then one `CASE` per row | **4 ms**                                       |

Add a set-returning `ask.my_matches()` that returns `(match_id, me_is_player1)`
computed the one-pass way (team scope: resolve `on_roster` once into a set of
seat ids, same idea), and make the four views join it instead of each carrying
its own `mine` CTE. `ask.matches` should do the same: `my_side` is called four
or more times per row there (`opponent_name`, `i_won`, `score_text`,
`side_player_name`). Keep `tests/ask-views-parity.spec.ts` as the proof that
orientation did not move.

### 2.2 Persist participation

`my_side` answers a question that is static per match: which seat belongs to
which user or roster profile. A `match_participants(match_id, participant_id,
seat)` table maintained by triggers on `matches`, `program_players` and
`program_members` turns every scoping check into an index lookup, for the team
scope too, where `on_roster` runs three subqueries per row today. It also
serves the rest of the dashboard (`my_player_ids()`, `visible_match_ids()`).

### 2.3 Precompute the "+1" and pattern columns

Serve +1, return +1, winning/losing plays and shot patterns are answered by
6–9k-character SQL with window functions over `ask.shots` joined to
`ask.points` twice (`serve-plus-one.ts`, `plays.ts`, `pattern.ts`). Shots are
immutable once a match is processed, so compute at derivation time (or in a
materialized view refreshed when a match finishes) one row per point with:
serve type and zone, return shot type / direction / depth, the +1 shot type and
direction, the last shot and who hit it, rally length, outcome. Expose it as
`ask.point_plays`. The template SQL shrinks to group-bys, the model can answer
pattern questions with ordinary SQL, the schema the model sees gets _simpler_,
and the per-query hand inference (`inferred` CTE in `ask.shots`) disappears.

### 2.4 Shots carry their match

`shots` has no `match_id`; every shot query joins through `points` (41k rows →
hash join today, fine; at millions of shots it is the first thing that hurts).
Add `shots.match_id` (backfilled, indexed `(match_id, point_id)`) and let
`ask.shots` filter on it directly.

### 2.5 Dimensions the model lacks

- `ask.matches`: add `season` (academic season, as `academicSeason()`),
  `month`, `days_ago`, so period questions stop needing date arithmetic.
- `ask.opponents` (personal) / `ask.players` (team): name, hand, backhand,
  matches, record, last played. The prompt says "You are not shown the
  player's opponents" (`prompts.ts:472`); a short list in the prompt lets
  "against left-handers" and "versus Eli" work without a tag, and the view lets
  the SQL group by opponent.
- A `data_version` (max `updated_at` over the scope) for cache keys (2.9).

### 2.6 One scope run, earlier sources

`ask.exec_query` runs `scope_sql` twice: once to list the scope's matches for
the sources panel, once inside the answer query. Run it once into a temp table
or materialized CTE, and have the route emit `sources` as soon as the scope is
known rather than after the save. Fold `ask_last_answer_id` into
`ask_save_exchange`'s return value (one round trip instead of two).

### 2.7 Route: parallel pre-stream, lighter reads

`getAskTagOptions` loads every personal match on each POST and calls
`auth.getUser()` a second time; `getAskConversation` loads every message with
feedback. Run tag options, the conversation and the quota in `Promise.all`,
pass the user through, load only the ids the request actually tagged (resolve
the tags with one `in (...)` query), and page the conversation to the last 12
messages (the prompt only uses 6 turns).

### 2.8 Query guard and budget

`sql-guard.ts` is an allow-list parser with no cost ceiling. Add a dry
`EXPLAIN` cost check (reject above a threshold, feed back to the planner), set
a per-query `statement_timeout` of ~4 s inside `exec_query` so a bad query
leaves time for a second attempt within the route's budget, and set
`maxDuration` on `/api/ask` explicitly.

### 2.9 Answer cache and precomputation

Key: viewer, normalised question, scope ids, `data_version`. A hit skips both
model calls. Hit rates only matter once starter questions (4.1) exist; then
precompute those three answers in the background when a match finishes
processing, so the first click on Ask after an upload is instant.

### 2.10 Region

Supabase is `us-east-2`; Vercel functions default to `iad1`. Pin the function
region to the nearest (`cle1`) to shave each of the ~12 round trips per
question. Small, free.

## 3. Visualizations

Six kinds exist (`bars`, `table`, `trend`, `split`, `serve`, `form`;
`src/components/dashboard/ask/visuals/`), one per answer, numbers always from
the rows. In practice two thirds of answers get a table. Ideas, roughly in
order of value:

1. **Court visuals, reusing the match-detail components.** Serve placement by
   court (deuce / ad) on `half-court-svg.tsx` / `court-tile.tsx` now that
   `ask.points.court` exists (the current `serve` block draws one bar per zone);
   shot direction and depth on the same court; return contact depth bands.
   These are the visuals the design canvases (`.dc.html`) always wanted.
2. **Point-by-point momentum** for a single match: a line of points won over
   the match with break, set and match points marked, sets as segments. Reuses
   `performance-tracker-chart.tsx` and `chart-tooltip.tsx`.
3. **Me-vs-opponent bars across several measures** (serve, return, pressure) in
   one block, and the `radar-chart-section.tsx` shape for "how do we match up".
4. **Trend with two series** (me vs my average, or player vs team) and match
   markers that link to the match; today a trend is one series with an
   unlabelled mean line.
5. **Distributions**: rally-length buckets, serve speed, return depth.
6. **Play tree** for +1 and pattern answers: serve → +1 → outcome with win
   share bars per branch, instead of a 12-row table.
7. **Form strip with labels**: the `form` block exists but is never emitted by
   the model; give it opponent and score on hover and a link per tick.
8. **Interactivity**: a click on a bar, row or zone opens the Video tab with
   that filter (the pattern answers already link; extend `pattern-video.ts` to
   serve zones and table rows); hover readouts; tabular numerals in prose.
9. **Server-chosen visuals.** Let the server pick the block from the result
   shape (it already does for template answers) and let the model only choose
   among kinds that fit the rows; validate that a `split`'s parts form one whole
   (the known wrong-split bug).
10. **Visual-first layout** from `src/app/design/ask/answers` sheets 2–4
    (visual above, prose behind a disclosure) for questions that asked for a
    chart.
11. **Keep it**: pin an answer's visual to Home or a player profile, copy as
    image, include in a shared match link.

## 4. UX and product

1. **Starter questions.** There are none. Generate 3–5 chips from the viewer's
   own data ("Your serve across the last 5 matches", "Record against
   left-handers", "What changed since September") and "Ask next" suggestions
   under each answer. Discoverability and cache hits in one change.
2. **Perceived speed.** Show a skeleton for the figure tiles and visual while
   "Writing the answer"; emit `sources` as soon as the scope resolves; keep
   streamed content on a late error instead of dropping it; add a client
   timeout with a retry; the status line could name the attempt ("Rewriting the
   query") so a retry doesn't read as a hang.
3. **The advice question.** A quarter of real questions ask what to do. The
   no-advice rule is a product promise, but the demand is clear. Options: a
   role-gated **coach mode** (team owners and coaches) that may recommend, with
   every recommendation tied to a cited figure; or a sharper "what the numbers
   point to" comparison beat for everyone. A product decision, not a code one.
4. **Quota.** 20 a month was the artboard's number. At $0.002–0.013 a question
   it is far below cost pressure; raise it, tier it by plan, or count only
   answered questions. Keep clarifications free as they are.
5. **Thread memory.** Replace six 600-char turns with a compact state object
   (current scope, measure, period, subject) the planner reads and updates, and
   give the writer the previous headline so follow-ups read as follow-ups.
6. **Entry points.** "Ask about this match" on the match page with the match
   pre-tagged (`/dashboard/ask?match=`), the same from a player profile and an
   opponent row, and Ask in the command palette.
7. **Rail.** Model-written short titles, rename, search, pin.
8. **Mobile.** The 390-px canvases exist; the Ask page has not been adapted.
9. **Feedback reader.** `ask_feedback` has no UI; an Admin › Ask page listing
   down-votes with question, SQL, answer and a link to the PostHog trace closes
   the loop that 1.6 depends on.
10. **Bring-your-own-model and MCP** stay the planned slices 2 and 3; the views
    and reader role were built to serve them unchanged.

## 5. Observability

1. **Usage and cost.** Pass `stream_options: { include_usage: true }` on the
   OpenAI-compat path so tokens and cost reach PostHog; today every Gemini call
   reports zero.
2. **Name the calls.** Set `$ai_span_name` (`ask.plan`, `ask.pattern`,
   `ask.answer`, `home.insight`, …) and a `feature` property so Ask is
   separable from the insight cards.
3. **Product events.** `ask_question_sent`, `ask_answer_done` with stage
   timings (pre-stream, plan, attempts, query, answer, time to headline), route
   taken (model SQL vs which template), visual kind, row count;
   `ask_answer_failed` with the code; `ask_feedback`. Persist failed runs in an
   `ask_runs` table too, since errors are not saved anywhere today.
4. **Dashboard and alerts.** p50/p95 to headline, error rate, `cannot_answer`
   rate, retry rate, cost per question; alert on p95 and on retry rate.
5. **Evals in production.** Sample 10% of answers into an LLM-judge evaluation
   with the 1.8 rubric.

## 6. Video and actions: what Ask should be allowed to do

Ask reads match data and writes prose. The question is whether it should also
_act_: send a video for analysis, jump the player into the film, cut clips,
change the page. The short answer: **jump to video, yes, as far as it will go;
upload, by hand-off only; every other action through a confirmed card, never
silently.** The reasoning, item by item:

### 6.1 Jump to video (do this; it is the differentiator)

Every other analytics product stops at a number. Advantage has the points on
film, and the plumbing already exists: pattern answers carry a "Watch N points"
link that opens the Video tab with the same filters the answer counted
(`pattern-video.ts` → `serializeMatchFilters`, `tab=film`), and the film tab
reads `?point=` to open on one point (`film-tab.tsx:900`). Extend that from one
answer kind to all of them:

- **Every figure is watchable.** A tile like "Second-serve points won 41%"
  links to the Video tab filtered to those points. The server knows the scope
  and the SQL; for template answers it knows the exact filter, and for
  model-written SQL it can re-run the query selecting `match_id, point_number`
  to get the point list (the `ask.points` view has both; `video_time` stays
  hidden from the model and is resolved server-side only).
- **"Show me" as a follow-up.** "Show me those double faults" after an answer
  opens the film at the first such point with the rest queued. This is the
  clarification mechanism in reverse: a fixed action, not a model-written one.
- **Point list in the answer.** For a scope of one match, a row per point (set,
  game, score, result) with a play glyph, reusing `point-list.tsx`, with the
  first frame from the seek-lane preview as a thumbnail.
- **Ask inside the film room.** A 340-px right drawer on the Video tab
  (`film-room-drawer.tsx` and the rail-drawer pattern already exist) where the
  match is pre-tagged and every answer seeks the player. This is where "jump to
  video" is strongest: the question and the footage share one screen.
- **Inline clip strip.** For small point sets (≤ 8), an inline player that plays
  the points in sequence inside the answer, using the read-only playback URL
  from `GET /api/matches/[id]/video` and the existing seek logic. Heavier than
  a link; build it after the links prove people click them.

Constraints that hold: only matches with a video attachment or an Advantage
Intelligence job get links (the sources rows already know `source`); team
scope follows the program's video visibility; a saved answer's links must
still work after the video's retention window closes, so render the film tab's
expired state rather than a broken link.

### 6.2 Uploading a video from Ask (hand off; do not take the file in chat)

Tempting, because "here is my match, what happened?" is the natural first
question. Three reasons not to accept the file in the composer:

1. **The wizard exists to get three inputs right.** `docs/ui-revamp-guardrails.md`
   names the three wizard inputs that, when wrong, attribute every statistic to
   the wrong player with nothing looking broken. A chat box is the worst place
   to collect player side, score and format; Ask would inherit the silent
   mis-attribution failure the wizard was built to prevent.
2. **Processing is asynchronous and metered.** A video takes the vendor minutes
   to an hour, costs monthly budget (team) or pilot hours (individual), and may
   be refused (frame rate, size, allowance). None of that fits a reply stream,
   and a question cannot be answered in the same turn anyway.
3. **It duplicates a surface.** Trim, alignment, drafts, cancel and resend all
   live in the wizard and its routes; Ask would re-implement or bypass them.

What Ask _should_ do instead:

- **Hand off with a return path.** A "Send a match video" action in the
  composer (the team day-zero state already shows this button when
  `explainVideoRefusal` allows it) opens `/dashboard/matches/new` with
  `?return=ask&question=<text>`. The wizard runs as it does today.
- **Ask on arrival.** When the job finishes, Ask asks the parked question
  against the new match (or, with no question parked, runs the review template)
  and the answer appears at the top of the rail, with a notification and the
  existing product email carrying the headline. The `generate-insights` match
  summary and this are the same idea from two sides; one implementation could
  serve both the report's insight card and Ask's first answer.
- **Attach a video to a SwingVision match** is a separate flow
  (`docs/match-video-attachments.md`); Ask can link to it when a question needs
  footage the match does not have ("No video on this match yet. Attach one?").

Revisit direct upload only if a mobile "record and ask" flow is built, and
then as the wizard's video step embedded in Ask, not a new path.

### 6.3 Clips, reels and sharing

- **Playlist in the film room.** "All my aces" today means a filter; a
  play-in-sequence mode over a point list is cheap, reuses the player, and is
  what people mean by "show me a reel".
- **Share a point set.** Public match links can already carry video and
  visualization options (PR #431, #429); add the filter preset so an answer's
  "Watch" link can be shared with a coach or parent.
- **Export an actual clip (mp4).** Server-side trimming from Azure Blob is a
  real build with real cost and retention questions. Later, and only after the
  playlist and share link show demand.

### 6.4 Other actions, through a fixed catalogue

If Ask can act, the actions should be a short, server-defined list the model
_selects_ from, each rendered as a card with a button, nothing executed
without a click, and nothing that writes or spends without the same
confirmation the rest of the app uses:

| Action                                       | Writes?          | Worth it                              |
| -------------------------------------------- | ---------------- | ------------------------------------- |
| Open a match, a player, an opponent          | no               | yes, trivial                          |
| Filter the Video or Visualizations tab       | no               | yes (6.1)                             |
| Save the answer's filter as a saved view     | yes, cheap       | yes; `saved_views` exist              |
| Pin the answer's visual to Home or a profile | yes, cheap       | yes (3.11)                            |
| Share a match link with this filter          | yes, public      | with the share popover's confirmation |
| Send a video / attach a video                | spends budget    | hand-off only (6.2)                   |
| Edit a score, rebuild statistics             | yes, destructive | no; link to the dialog                |
| Export rows as CSV                           | no               | cheap and useful for coaches          |

### 6.5 Video-aware answers (not now)

Sending frames or clips to a vision model to describe technique would break the
feature's promise (facts from the player's own data, no video to the model), add
cost and latency per question, and raise the minors' data question the design
flagged. The vendor's results already give every point a time and every shot
a position; use those to cite moments (6.1), and leave footage out of the
prompt until there is a separate, consented product for it. The label console's
hand-labelled points are a better next data source than video.

## Sequencing

**Tier 1 — days each, no design needed.** 2.1 (`mine` fix), 5.1 + 5.2 (usage
and span names), 1.2 (prompt reorder for caching), 1.3 (JSON plan, temperature
0), 2.7 (parallel pre-stream), 2.8 (`maxDuration`, abort, timeout), 2.6 (early
sources, one save RPC), 1.10 (stale prompt line and docs), 4.1 (starter
questions).

**Tier 2 — one to two weeks each, measurable with 1.8 first.** 1.8 (scored
eval in CI), 1.5 + 1.1 (adapter v2, per-stage models), 2.3 (precomputed
+1/pattern columns), 2.2 (participation table), 5.3 (product events and
`ask_runs`), 3.1–3.3 (court, momentum, matchup visuals), 6.1 (watchable
figures and "show me", starting from the existing pattern links), 6.2 (wizard
hand-off and ask-on-arrival), 2.9 (answer cache and precomputed starters).

**Tier 3 — product decisions or longer builds.** 1.6 (retrieved few-shot), 1.7
(schema routing), 4.3 (coach mode), 3.6–3.11, 4.5–4.9, 6.1's film-room drawer
and inline clip strip, 6.3 (playlist, shared filter presets, mp4 export), 6.4
(the action catalogue), slices 2 and 3.

Re-measure after each tier with the same four numbers: time to headline p50 /
p95, attempts per question, `cannot_answer` rate, cost per question.
