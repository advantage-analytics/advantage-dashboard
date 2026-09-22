# Tasks — claude/advantage-intelligence-loading-state-996643

> Scope: Team Home (/dashboard/team) loading states — the Advantage Intelligence card on page load.

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

## T1 · Render FocusCardPending in TeamHomeSkeleton instead of null insight

- **status:** todo
- **model:** sonnet
- **files:** src/components/dashboard/loading/team-home-skeleton.tsx (guess)
- **done when:**
  - [ ] `team-home-skeleton.tsx`'s import from `./home-skeleton` includes `FocusCardPending` alongside the existing `HomeKpisPending, HomeFooterPending`
  - [ ] Line 213's `insight={null}` is replaced with `insight={<FocusCardPending />}`, so `TeamHomeSkeleton` no longer passes `null` for the insight slot
  - [ ] No other prop or JSX in `team-home-skeleton.tsx` changes — diff is limited to the import line and the single `insight` prop value
  - [ ] `npm run typecheck` passes with no new errors attributable to this file
  - [ ] `npx eslint src/components/dashboard/loading/team-home-skeleton.tsx` reports no new errors
- **notes:** Mechanical one-line swap in a single already-identified file; `FocusCardPending` is already exported from `./home-skeleton.tsx:187` with the correct a11y attrs and pulse animation, so no new component work is needed. Before committing: `git add -A` then run `.claude/hooks/widget-states-gate.sh mark` to satisfy the widget-states commit gate. Route trace: `src/app/dashboard/team/loading.tsx` → `TeamHomePageSkeleton` (`loading/team-page-pending.tsx`) → `TeamHomeSkeleton`; the streamed region on `team/page.tsx` already uses `FocusCardPending`. The personal Home route skeleton (`home-skeleton.tsx` `HomePageSkeleton`) has the same omission — out of scope here, separate branch.
