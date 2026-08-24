# Tasks — claude/blue-highlight-inputs-334746

> Scope: focus-state styling on form inputs — make text fields share one
> neutral focus treatment instead of a mix of blue and grey rings.

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue, then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Make input focus rings neutral, not blue
- **status:** todo
- **files:** src/components/dashboard/statistics/match-selector.tsx,
  src/components/dashboard/schedule/score-entry.tsx,
  src/components/dashboard/schedule/single-score-entry.tsx
  (guess — a subagent should confirm against src/components/ui/input.tsx)
- **done when:**
  - [ ] No `<input>` or `<textarea>` in `src/` carries a blue focus ring —
        `grep -rn --include='*.tsx' '<input\|<textarea' -A8 src/ | grep -E 'blue-ring-40|accent-blue-ring|ring-\[#3B82F6\]'`
        returns nothing (it returns 5 matches today)
  - [ ] Tabbing into each changed field still shows a visible non-blue focus
        indicator matching `src/components/ui/input.tsx` — the ring is
        recoloured, never deleted
  - [ ] Blue focus rings on buttons, links, tabs, sidebar rows and filter
        pills are untouched — those call sites still match the same grep
  - [ ] `npm run lint` passes, and no other property (border, background,
        size, radius) changed on the touched inputs
- **notes:** A focus ring is an accessibility requirement — this task
  recolours it to the neutral grey the shared primitives already use, it does
  not remove focus styling. Blue rings on non-input controls are intentional
  design-system and out of scope.
