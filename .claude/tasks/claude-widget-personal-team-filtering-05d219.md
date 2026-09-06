# Tasks — claude/widget-personal-team-filtering-05d219

> Scope: personal-workspace scoping — the dashboard home widgets, plus the
> header activity tray, must read only the viewer's own non-program matches
> (`created_by = me AND program_id IS NULL`). Pipeline workspace:
> `work/widget-personal-team-filtering/`.

**Before merge, a manual check no task can assert.** Sign in as
`clajersongimena@gmail.com` (3 personal, 16 program-attached matches — the only
account that reproduces this) and open `/dashboard` in the **personal**
workspace: the Season title and KPI counts must read **3**, not 19; Recent
Matches and Serve Placement must draw from those three; the header tray must
show only jobs on non-program matches. Then switch to the team workspace and
confirm `/dashboard/team` and the tray are unchanged. A green suite alone does
not prove this bug fixed — see `work/widget-personal-team-filtering/03_plan/output/plan.md`,
"Test strategy".

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

## T1 · Scope home performance read to personal matches
- **status:** done
- **model:** sonnet
- **files:** src/lib/data/performance-server.ts (guess — `getOverallPerformance()`, matches query at ~L858-861)
- **done when:**
  - [ ] The `matches` query in `getOverallPerformance()` carries `.is("program_id", null)` directly after `.eq("created_by", user.id)`
  - [ ] A one-line comment above the clause states the rule (viewer's own matches, filed under no program) and points at `src/app/dashboard/matches/page.tsx` as the canonical statement, in the style of `statistics-server.ts:281-289`
  - [ ] The diff to this file is exactly the added clause plus the comment — `calculateWinLoss`, `viewerSide`, the `match_stats_with_percentages` read and `DEFAULT_PERFORMANCE` are byte-identical
  - [ ] `npx tsc --noEmit` and `npm run lint` are clean
- **notes:** Server-side loader; this single read feeds the KPI strip, Win Rate, form, both match counts, the Season title and `buildInsightEvidence()` — none of those need edits. Plan step 1.

## T2 · Scope Recent Matches card to personal matches
- **status:** done
- **model:** sonnet
- **files:** src/app/dashboard/(home)/recent-activity.tsx (guess — browser-client `matches` list query at ~L338-342)
- **done when:**
  - [ ] The list query carries `.is("program_id", null)` directly after `.eq("created_by", userId)`, with the same one-line comment as T1
  - [ ] The diff to this file is confined to that list query: the `match_stats` read keyed by match id (~L448), the realtime `match_stats` channel with `filter: match_id=eq.${targetMatchId}` (~L469), the toast state machine and `PROCESSING_TIMEOUT_MS` are byte-identical
  - [ ] When the narrowed query returns zero rows the component renders `RecentMatchesEmpty`, not a spinner (verify by reading the empty branch — no logic change)
  - [ ] `npx tsc --noEmit` and `npm run lint` are clean
- **notes:** Client component — RLS cannot supply this predicate because the viewer legitimately reads the program's rows. Do NOT add a program clause to the match-id-keyed reads; that would be wrong. Plan step 2.

## T3 · Scope home Serve Placement widget to personal matches
- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/home/serve-placement-home.tsx (guess — browser-client `matches` query at ~L57-62)
- **done when:**
  - [ ] The `matches` query carries `.is("program_id", null)` after `.eq("created_by", userId)` and before `.order("date", …).limit(4)`, with the same one-line comment as T1
  - [ ] The diff to this file is exactly the added clause plus the comment; the `shots` read and the `if (!matches || matches.length === 0)` early return are byte-identical
  - [ ] `npx tsc --noEmit` and `npm run lint` are clean
- **notes:** This is `home/serve-placement-home.tsx` — serve placement exists four times in the repo; the other three are out of scope. Plan step 3.

## T4 · Add program clause to the personal activity-tray branch
- **status:** todo
- **model:** opus
- **files:** src/lib/data/activity-server.ts (guess — `getActivityFeed()`, personal branch at ~L100-105)
- **done when:**
  - [ ] The personal branch reads `query.eq('created_by', workspace.id).is('matches.program_id', null)` — the `created_by` clause is still present in the post-diff source, and the program clause is added to it, not substituted for it
  - [ ] The team branch `.eq('matches.program_id', workspace.id)` and the `matches!inner(... program_id)` projection are byte-identical in the diff
  - [ ] The comment "Not `program_id is null` — that column does not exist until the program migrations land…" no longer appears anywhere in the file (`grep -n "does not exist until" src/lib/data/activity-server.ts` returns nothing)
  - [ ] Its replacement states what the two clauses mean together (the jobs I submitted, on matches of my own) and notes that RLS cannot supply the second half, deferring to the file's header paragraph
  - [ ] `npx tsc --noEmit`, `npm run lint` and `npx playwright test tests/activity-tray-detail.spec.ts` are clean
- **notes:** Correctness trap: the tray is scoped on the JOB, not the match — a job can belong to someone who did not create the match row, and one such row exists on the live DB. Dropping `created_by` would hide it from its submitter. Folded into the branch by explicit human decision (design.md "Scope decision"). Plan step 4.

## T5 · Add personal-home-scope regression spec
- **status:** todo
- **model:** opus
- **needs:** T1, T2, T3, T4
- **files:** tests/personal-home-scope.spec.ts (new), reading tests/fixtures/live-db.ts and tests/rls-workspace-isolation.spec.ts for harness style
- **done when:**
  - [ ] The spec uses the `tests/fixtures/live-db` harness: `test.skip(!HAVE_ENV, SKIP_REASON)`, `createAdminClient()` for fixtures, `createLogins()` for the signed-in client, `runMarker()` on every seeded row, and `afterAll` deletes matches first, then the program, then `deleteAuthUsers()`; a post-cleanup re-query of the marker prefix returns zero rows
  - [ ] Fixture is one user, one program they belong to, one personal match (`created_by = user`, `program_id IS NULL`), one program match (`created_by = user`, `program_id = program`), and one `processing_jobs` row per match with `created_by = user`
  - [ ] Signed in as that user, three assertions mirror the T1/T2/T3 query shapes exactly as the source now writes them and each returns only the personal match
  - [ ] The tray case asserts both directions: the personal shape (`created_by` + `matches.program_id IS NULL`) returns only the personal match's job, and the team shape (`matches.program_id = program`) returns only the program match's job
  - [ ] The file's doc comment states this is a query-shape mirror written after the fix, not red-first, and that it does not invoke the loaders (which build clients from request cookies); the runner's notes record that temporarily removing one predicate from source turned the matching assertion red before restoring it
- **notes:** `npx playwright test tests/personal-home-scope.spec.ts` must pass live and skip cleanly keyless. `matches.created_by` has no cascade — order of cleanup matters. Plan step 5.
