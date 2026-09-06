# Plan — personal scope on the home widgets and the activity tray

Four one-clause query fixes, a regression spec, and a verification pass.
Steps 1–4 are independent of one another and may run in any order or in
parallel; 5 and 6 come after all four.

**Scope guard.** The brief scoped this to the dashboard home widgets. Step 4
(the header activity tray) sits outside that scope and is here on the human's
explicit decision, recorded in `02_design/output/design.md` under "Scope
decision". Nothing else exceeds the brief: no schema change, no RLS change, no
team-surface change, and `/dashboard/matches`, `/dashboard/statistics` and match
detail are untouched — the design confirmed they are already correct.

Every step is one file. That is deliberate: `performance-server.ts` (~900 lines)
and `recent-activity.tsx` (~500 lines) each need reading before a safe edit, and
a step that opened both would spend its context on reading rather than work.

---

## Step 1 — Personal scope on the home performance read

**Files:** `src/lib/data/performance-server.ts`

**Change.** In `getOverallPerformance()` (line ~846), the `matches` query at
lines ~858-861 filters `.eq("created_by", user.id)` only. Add
`.is("program_id", null)` to it. Add a brief comment stating the rule — the
viewer's own matches, filed under no program — and pointing at
`src/app/dashboard/matches/page.tsx` as its canonical statement, in the manner
`statistics-server.ts:281-289` already documents the same predicate.

Nothing else in the function changes. The downstream computation
(`calculateWinLoss`, `viewerSide`, the `match_stats_with_percentages` read keyed
by `matchIds`) already handles a smaller row set, including the empty one —
`DEFAULT_PERFORMANCE` is the existing zero-match return.

**Verification.**
- `npx tsc --noEmit` clean (or `npm run build`), `npm run lint` clean.
- Read the diff: exactly one added clause plus a comment. If the change touched
  `calculateWinLoss`, `viewerSide`, or the stats read, it went too far.
- Confirm the function still returns `DEFAULT_PERFORMANCE` on an empty result
  rather than throwing.

**Consumers to be aware of (no edits expected):** this single read feeds the KPI
strip, Win Rate, form, `matchCount`, `analyzedMatchCount`, the Season title, and
`buildInsightEvidence()` — hence the Focus card and the AI insight prompt. All
of them narrow correctly with no change of their own.

---

## Step 2 — Personal scope on the Recent Matches card

**Files:** `src/app/dashboard/(home)/recent-activity.tsx`

**Change.** The browser-client `matches` query at lines ~338-342 filters
`.eq("created_by", userId)` only. Add `.is("program_id", null)`, with the same
one-line comment as step 1.

**This is a client component and RLS will not do this for you.** The viewer is a
legitimate member of the program, so its matches are rows they are permitted to
read; the predicate must be explicit in the query.

**Do not touch:** the realtime path lower in the file. The `match_stats` channel
(line ~469) is keyed by a single `match_id` the component already holds
(`filter: match_id=eq.${targetMatchId}`) and the `match_stats` read at line ~448
is likewise keyed by match id. Neither needs a program clause, and adding one to
either would be wrong.

**Verification.**
- Type-check and lint clean.
- Diff is one clause plus a comment inside the list query only; the channel
  subscription, the toast state machine and `PROCESSING_TIMEOUT_MS` are
  untouched.
- The empty branch still renders `RecentMatchesEmpty` rather than a spinner when
  the narrowed query returns nothing.

---

## Step 3 — Personal scope on the home Serve Placement widget

**Files:** `src/components/dashboard/home/serve-placement-home.tsx`

**Change.** The browser-client `matches` query at lines ~57-62 filters
`.eq("created_by", userId)` only. Add `.is("program_id", null)` after it and
before `.order("date", …).limit(4)`, with the same comment.

The `shots` read below is keyed by the ids this query returns and follows
automatically — leave it alone.

**Verification.**
- Type-check and lint clean.
- Diff is one clause plus a comment; the early return on an empty result
  (`if (!matches || matches.length === 0)`) still stands and still clears the
  loading state.

---

## Step 4 — Personal scope on the header activity tray *(folded in by human decision)*

**Files:** `src/lib/data/activity-server.ts`

**Change.** In `getActivityFeed()`, the personal branch at line ~100 is
`query.eq('created_by', workspace.id)`. It must become that **plus**
`.is('matches.program_id', null)`.

Both clauses. `created_by` is not redundant and must not be replaced: this
file's header comment establishes that the tray is scoped on the **job**, not
the match, because a job can belong to someone who did not create the match row
— and there is one such row on this database. Scoping by match alone hid it from
the person who submitted it. The program filter is *added* to the job filter.

The filter targets the embedded resource. The existing `matches!inner(…)`
projection already selects `program_id` through the join, which is the same
mechanism the team branch one line above uses for
`.eq('matches.program_id', workspace.id)`.

**Replace the stale comment, do not leave it standing.** The current comment
says the personal branch is "Not `program_id is null` — that column does not
exist until the program migrations land in an environment, and a filter on a
missing column is an error rather than an empty result." That is now false: the
column exists on the live database and four other call sites filter on it, and
this comment is why the clause was missing. The replacement should state what
the two clauses mean together — the jobs I submitted, on matches of my own —
and note that RLS cannot supply the second half, which the file's header
paragraph already explains at length.

**Verification.**
- Type-check and lint clean.
- The team branch (`.eq('matches.program_id', workspace.id)`) is byte-identical
  in the diff.
- The stale comment is gone, not merely amended around.
- `tests/activity-tray-detail.spec.ts` still passes — it covers this surface.

---

## Step 5 — Regression spec

**Files:** `tests/personal-home-scope.spec.ts` (new)

**Change.** A live-database spec on the `tests/fixtures/live-db` harness that
`tests/rls-workspace-isolation.spec.ts` uses: `HAVE_ENV` / `SKIP_REASON` guard,
`createAdminClient()` for fixtures, `createLogins()` for the signed-in client,
a `runMarker()` prefix on every seeded row, and `deleteAuthUsers()` plus explicit
row cleanup in `afterAll` (matches first — `matches.created_by` has no cascade).

Fixture: one user, one program they belong to, **one personal match**
(`created_by = user`, `program_id IS NULL`) and **one program match**
(`created_by = user`, `program_id = program`) — the same person on both, which is
the shape the bug needs. Plus one `processing_jobs` row per match with
`created_by = user`, for the tray case.

Assertions, signed in as that user:
1. The step-1 query shape returns the personal match only.
2. The step-2 query shape returns the personal match only.
3. The step-3 query shape returns the personal match only.
4. The step-4 personal query shape returns the personal match's job only — and,
   with the team branch's filter instead, the program match's job only. Assert
   both directions: a fix that swapped `created_by` for the program clause
   rather than adding to it would pass a one-sided assertion.

**Be honest about what this spec is.** It mirrors the query shapes rather than
invoking the loaders — `getOverallPerformance()` builds its Supabase client from
request cookies and is not callable from the Playwright node context. Its value
is that deleting the predicate from any of the four call sites turns it red. For
the same reason it **cannot be written red-first**: it issues the corrected query
itself, so it would pass against the unfixed source. Write it after steps 1–4
and say so in the file's doc comment rather than implying a TDD cycle that did
not happen.

**Verification.**
- `npx playwright test tests/personal-home-scope.spec.ts` passes against the
  live project, and skips cleanly with `SKIP_REASON` when the env is absent.
- Re-run it with one predicate temporarily removed from the source and confirm
  the matching assertion fails. A green-only spec proves nothing about a filter.
- `afterAll` leaves no rows behind: re-query the marker prefix and expect zero.

---

## Step 6 — Verification pass

**Files:** none (review and manual checks only)

**Change.** No code. Run the full gate on the assembled diff.

**Verification.**
- `npm run lint` and `npm test` both clean, including
  `tests/rls-workspace-isolation.spec.ts` and `tests/activity-tray-detail.spec.ts`.
- Run the `pipeline-guardrails-reviewer` agent on the diff — it touches
  `src/app/dashboard/` and `src/components/dashboard/`.
- Run the `rls-boundary-reviewer` agent — the diff touches `src/lib/data/` and
  changes what a query returns.
- **Manual, on real data.** Sign in as `clajersongimena@gmail.com` (3 personal,
  16 program-attached matches on the live DB — the only account that reproduces
  this) and open `/dashboard` in the **personal** workspace:
  - Season title and KPI match counts read **3**, not 19.
  - Recent Matches lists only those three.
  - Serve Placement draws from those three.
  - The header activity tray shows only jobs on non-program matches.
  - Then switch to the team workspace: `/dashboard/team` is unchanged and the
    tray shows the program's jobs as before.
- Confirm the day-zero path still works for a user with zero personal matches:
  the page must render `DayZeroHome`, not zeroes or a spinner.

---

## Test strategy

Three layers, in descending order of what they actually prove:

1. **The existing suite is the real guard against collateral damage.**
   `npm test` already contains `rls-workspace-isolation.spec.ts` (cross-program
   match isolation against the live DB) and `activity-tray-detail.spec.ts`. If
   either breaks, this change broke something it had no business touching. These
   must stay green with no edits to them.

2. **The new spec is a predicate guard, not a behavioural test.** It locks the
   four query shapes so a future reader cannot quietly drop the clause. Its
   limits are stated in step 5 and should be stated in the file itself. It only
   earns its place if the "remove a predicate, watch it go red" check in step 5's
   verification is actually performed once.

3. **Manual verification on the reproducing account is what confirms the bug is
   fixed.** 19 → 3 is the observable outcome, and no automated layer here
   asserts it end to end. Do not report this feature complete on a green suite
   alone.

There is no unit-test layer to add. Every change is a clause in a query builder;
the only honest ways to exercise it are against the database or against the
running page, and both are covered above.

## Also consulted

Beyond the declared inputs (`design.md`, `brief.md`):

- `src/app/dashboard/(home)/recent-activity.tsx` — to confirm the realtime
  channel and `match_stats` reads are keyed by match id and must not change.
- `tests/fixtures/live-db.ts` — the harness exports step 5 builds on.
