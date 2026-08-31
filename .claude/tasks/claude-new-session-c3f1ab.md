# Tasks — claude/new-session-c3f1ab

> Scope: events-lineups pipeline — schedule day-zero states by role (designs 5a/5b)

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

## T1 · Rewrite EmptySchedule as the role-branched 5a/5b day-zero body
- **status:** todo
- **model:** sonnet
- **files:** src/components/dashboard/schedule/schedule-list.tsx, src/app/dashboard/team/schedule/page.tsx (both confirmed via route trace, not guesses)
- **done when:**
  - [ ] `EmptySchedule` takes `{ canCreate: boolean }` and renders two variants: `canCreate` → headline "No events yet", body "Create a dual and the lineup card builds itself — S1–S6, D1–D3, each slot a real match from the moment you set it." (max-w-[46ch]), quiet links "New event" → `/dashboard/team/schedule/new` and "Add a one-off match in Matches" → `/dashboard/matches/new`; else → headline "Nothing scheduled yet", body "Your coach adds the duals and tournaments. Once a lineup is set, your line appears here with the opponent, site and time." (max-w-[48ch]), one quiet link "Add your own match" → `/dashboard/matches/new`, and a note strip (rounded-lg, bg-[var(--surface-subtle)], px-3 py-[9px], max-w-[520px], Lucide Bell 13px --ink-500, .text-micro --ink-600) reading "The schedule is coach-managed — your line appears here once the lineup is set." — no "How events work" link, no "Notifications" link anywhere.
  - [ ] Both variants share the centered frame: `flex flex-1 flex-col items-center justify-center text-center min-h-[360px] py-16`; bare Lucide `Calendar` size-7 strokeWidth 1.5 text-[var(--ink-300)] (no circle container); headline 24px/300, line-height 28px, tracking −0.3px, --ink-900, mt-[18px]; body `.text-body-sm` mt-2 with `[text-wrap:pretty]`; links row mt-5 gap-4, links text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)] via next/link, separated by a `h-2.5 w-px bg-[var(--border-medium)]` divider.
  - [ ] The zero-rows branch wrapper in `ScheduleList` gains `flex-1` and passes `canCreate` to `EmptySchedule`; `page.tsx`'s inner container (`mx-auto flex max-w-screen-2xl flex-col px-6 py-8 sm:px-10`) gains `flex-1` — and the diff contains no other change to `page.tsx`, none to the `Header` component, and none to the populated-schedule path.
  - [ ] The diff adds no `advButton` call, no focus-\* class, and no new component file — the change lives entirely in the two named files.
  - [ ] `npx tsc --noEmit` reports 0 errors; `npm run lint` adds no new warnings over the 43 pre-existing; `npm run build` succeeds.
- **notes:** Pipeline events-lineups step 1 (work/events-lineups/03_plan/output/plan.md; component spec in 02_design/output/design.md). Copy is verbatim from the approved design including its two deliberate deviations from the mock (dropped "How events work" + corrected note-strip copy) — do not "fix" the copy back to the mock. Em-dashes in body copy are U+2014 as written here.

## T2 · Run repo gates over the finished 5a/5b diff
- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** none edited — gates run against T1's committed diff
- **done when:**
  - [ ] `npm test` exits 0 on the branch containing T1's commit.
  - [ ] The `pipeline-guardrails-reviewer` agent has been run over T1's diff and its verdict is recorded (in this task's notes update or the run log); the verdict contains no finding that requires changing the diff — if it does, this task is blocked with the finding quoted, not silently fixed.
- **notes:** Pipeline events-lineups step 2. Expected clean — the diff is §3.5 "safe to redesign freely" territory (empty state, copy); no wizard input, analysis-status predicate, or deletion path is touched. No `npm run map` needed (no route added).
