# Review — widget-personal-team-filtering

Sign-off: pending

*(The human edits this line to `approved`, or annotates it otherwise. That is
the pipeline's final gate — stage 07 must not run while it reads `pending`.)*

Gate run: `/pr-check` over the branch range `0c8411e...HEAD`, working tree
clean at the start. Receipt recorded: **`bcef8ef ready`**.

The review was not a formality — it found a fifth leak on the surface this
branch exists to fix, and a bug in the branch's own regression spec. Both are
fixed here, in `bcef8ef`.

## Success criteria, from the brief

| # | Criterion | Verdict |
|---|---|---|
| 1 | Every home widget derives from `created_by = viewer AND program_id IS NULL` | **Met — after this stage's fix.** It was **not** met on the range as delivered by stage 05: `new-reports-subline.tsx` was still `created_by`-only. Five widgets now carry the predicate. A repo-wide sweep of every `matches` read filtering `created_by` shows all of them scoped except the four in `api/matches/[matchId]/route.ts`, which are single-match-by-id ownership checks where the predicate would be wrong. |
| 2 | A team member sees zero program matches on their personal home — lists, counts, activity feed, generated insight | **Met.** The counts half of this is exactly what criterion 1's gap broke: the "N new reports →" figure counted program matches. Insight text derives from `getOverallPerformance()`, so it narrows with T1 and needs no edit of its own. |
| 3 | Widgets on the same page agree — the "N matches" figure and the list beneath it count the same rows | **Met by construction.** Every home surface now applies the identical predicate, and `matchCount` / `analyzedMatchCount` / the Recent Matches list all descend from reads that carry it. |
| 4 | The team workspace is unchanged — same rows before and after | **Met.** No team loader was touched. `getActivityFeed()`'s team branch is byte-identical in the diff, verified by the completion reviewer on T4 and again by both guardrail reviewers over the whole range. |
| 5 | A personal workspace with no qualifying matches renders its designed empty state | **Met by inspection, not by execution.** `hasMatches` derives from the narrowed `matchCount`, so an all-program user routes to `DayZeroHome`; the Recent Matches empty branch and Serve Placement's early return were confirmed unchanged. **No automated test exercises this path** — it is part of the manual verification still owed. |
| 6 | `npm run lint` and `npm test` pass | **Met.** Lint clean, `tsc --noEmit` clean (no stale `.next/` re-run needed), `npm test` 430 passed. |

**Criterion 1 is the one worth dwelling on.** Stage 02's route trace followed
`page.tsx → home-content.tsx` and enumerated the widgets it rendered directly,
but `SeasonTitle` renders `NewReportsSubline`, which issues its own query. The
trace stopped one level short. Everything downstream — the plan, the task
breakdown, five per-task gates — inherited that omission without question,
because each stage checked its own contract and no stage re-derived the widget
list. The gate that caught it was the one asking a different question
(`simplify`'s altitude angle, noticing the predicate was hand-written per call
site and enumerating the sites).

## Findings and resolutions

### Fixed in this stage (`bcef8ef`)

1. **A fifth personal-home leak — `src/components/dashboard/home/new-reports-subline.tsx:31`.**
   The greeting row's "N new reports →" count read `matches` with
   `created_by` only, so a program-filed report inflated the count on the
   personal home after every other surface was fixed. Found by `simplify`'s
   altitude pass. Fixed with the same one-clause predicate and comment as the
   other four sites; the guardrails reviewer independently re-traced the whole
   home consumer chain afterwards and found no sixth.

2. **A vacuous teardown check — `tests/personal-home-scope.spec.ts:167`.**
   Introduced by this stage's own efficiency edit, caught by `code-review`
   reading that edit. `afterAll` runs even when `beforeAll` throws, leaving
   `personalMatchId`/`programMatchId` unassigned; `.in('id', [undefined])`
   fails the uuid cast, returns `data: null`, coalesces to `[]`, and the
   leftover assertion passes — reporting a clean teardown on the one path the
   check exists for. `.filter(Boolean)` restored, with a comment saying why it
   is not defensive noise.

3. **Three serial teardown reads overlapped** (efficiency finding). The
   `programs` / `matches` / `processing_jobs` leftover checks are independent
   and now run under one `Promise.all`. They run on every `npm test`.

### Consciously left

1. **The shared query-scoping helper.** Both the reuse and altitude passes
   recommended extracting the predicate — the altitude pass argued for a
   `workspaceMatches(supabase, workspace)` builder in `src/lib/workspace/`,
   noting the personal/team ternary is already written longhand in two places
   and that routing the spec through it would fix the mirror's structural
   weakness for free. **The reasoning is sound and the recommendation is
   accepted in principle — but not here.** It touches nine to thirteen
   pre-existing call sites, none of which this branch introduced or broke, and
   stage 02 already weighed and rejected exactly this (Approach B) on the
   grounds that converting only the new sites leaves the codebase *less*
   consistent than uniform inline use. Its own branch, per the branch-scope
   rule. This is the strongest follow-up the review produced.

2. **The duplicated four-line comment**, now at five sites. Same reasoning:
   it matches the convention the four pre-existing sites already set, and
   collapsing it is part of the helper refactor above, not separable from it.

3. **The spec's cosmetic cleanups** — the single-element `programIds` array,
   and `(data ?? [])` used after `expect(error).toBeNull()`. Real but trivial,
   and churn in a passing live-DB spec carries more risk than the tidiness is
   worth.

4. **Removing the teardown's self-verification** (a simplification finding).
   Rejected outright: the `rls-boundary-reviewer` specifically credited it as
   the thing that makes a silently-failed delete loud. Two reviewers
   disagreeing is the signal to keep the safety property and take only the
   efficiency win, which is what was done.

## Reviewers — ran, and skipped with reasons

| Reviewer | Status |
|---|---|
| lint · `tsc --noEmit` · `npm test` | ran — clean, 430 passed |
| `simplify` (4 angles) | ran — produced findings 1 and 3 above |
| `code-review medium` | ran — 1 finding, fixed |
| `pipeline-guardrails-reviewer` | **ran over the whole range**, not reported as covered per-task |
| `rls-boundary-reviewer` | **ran over the whole range** |
| `vercel-react-best-practices` | skipped — no `"use client"` added (0), no new `.tsx` component (0). The data-fetching changes are one added filter on existing queries, not a fetching-shape change |
| `supabase:supabase-postgres-best-practices` | skipped — no migration, and the diff adds no table, column, index, RLS policy or function |

**Why the guardrails ran rather than being reported covered per-task.** The
range contains seven `pipeline(...)` commits, so `git log --format=%s | grep -vE
'^(T[0-9]+:|task: add |...)'` does not return `all task-gated`. Those commits
are markdown-only, and the economy would arguably have been safe — but the rule
is fail-closed and offers no documentation-only exemption, and this stage then
added source changes of its own that no per-task gate ever saw. Running them was
correct twice over.

**Index check, done and dismissed.** Four queries now filter on `program_id`.
`matches_program_idx` is partial (`WHERE program_id IS NOT NULL`) and so cannot
serve an `IS NULL` predicate — but every one of these queries leads with
`created_by`, which `idx_matches_created_by_date (created_by, date DESC)` covers,
leaving the residual filter to run over one user's handful of rows. No index
change needed.

## Verdict

**Ready to merge, with one gate outstanding that no automated stage can close.**

The manual verification the plan and the queue header both call for has **not**
been performed:

> Sign in as `clajersongimena@gmail.com` (3 personal, 16 program-attached
> matches — the only account that reproduces this) and open `/dashboard` in the
> **personal** workspace. Season title and KPI counts read **3**, not 19;
> Recent Matches, Serve Placement and the "N new reports" count draw from those
> three; the header tray shows only jobs on non-program matches. Then switch to
> the team workspace and confirm `/dashboard/team` and the tray are unchanged.

A green suite does not prove this bug fixed. The new spec is a predicate guard
that mirrors query shapes rather than invoking the loaders, and criterion 5's
empty-state path is unexercised by any test. **Do that check before signing
off**, and note it now covers a fifth widget the earlier stages never mentioned.

## Follow-ups (logged, not queued)

1. **`workspaceMatches()` / `scopePersonal()` helper** — the accepted-in-
   principle refactor above. Its own branch. It would also convert the
   regression spec from a mirror into a real guard.
2. **`getActivityFeed()`'s workspace scoping is untested.**
   `tests/activity-tray-detail.spec.ts` covers only `trayDetail`'s
   pluralization. The `created_by`-vs-program substitution T4 was written
   around would be caught by a human reading the query and nothing else.
3. **The tray's team-branch test cannot distinguish two explanations** —
   the fixture athlete created both jobs and `processing_jobs` RLS is
   `created_by`-only by design, so it cannot tell "correctly program-scoped"
   from "RLS let the creator see their own row". Needs a second member (coach
   or staff) in the fixture.
4. **`/api/home-insight/route.ts`** inherits T1's fix as a second consumer of
   `getOverallPerformance()`; worth confirming the insight prose narrates
   personal-only figures during the manual pass.

## Also consulted

Beyond the declared inputs (`05_build/output/build.md`, the range diff,
`01_brief/output/brief.md`, `.claude/skills/pr-check/SKILL.md`):

- `src/components/dashboard/home/new-reports-subline.tsx` and
  `season-title.tsx` — to confirm the missed widget and its render path.
- `src/app/api/matches/[matchId]/route.ts` — to confirm its four
  `created_by` reads are single-match-by-id ownership checks, correctly
  without the predicate.
- Live database, project `pouxujkhtbvkdwbzfvka`, via Supabase MCP:
  `pg_indexes` for `public.matches`, for the index check above.
