# Tasks — claude/selection-items-layout-d19d31

> Scope: layout and spacing pass on the onboarding college-step option rows (`/onboarding`, step 2 of 2)

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

## T1 · Re-space the college-step option rows
- **status:** todo
- **model:** opus
- **files:** src/app/onboarding/onboarding-flow.tsx (college step, lines ~261–293: the `role="radiogroup"` container, the three `role="radio"` rows and their inner label/sub stack) — the only file the diff may touch. Read-only references: src/components/claim/claim-shell.tsx (`RadioDot`'s `align` prop), src/styles/design-system/spacing.css (the two-tier spacing rule), .skills/advantage-analytics-design/SKILL.md (gap scale, padding patterns, `Radio` card variant), DESIGN.md, .claude/skills/layout/SKILL.md (the `/impeccable layout` procedure). Guess — the runner may correct.
- **done when:**
  - [ ] Every spacing utility on the college radiogroup container, its three option rows and the rows' inner text stack resolves to a value on the DS scale: the bracketed `px-[18px]` and `gap-[3px]` are gone, and the row-to-row gap is a layout-grid step (`gap-2` or `gap-3`), not the fenced half-step `gap-2.5`. (The RadioDot's optical offset is the one exempt bracketed value — see the alignment criterion.)
  - [ ] The row-to-row gap is strictly smaller than each row's vertical padding and horizontal padding (e.g. 8px between rows, 16px/20px inside), so the class list makes each row a bounded item and the three read as one group beneath the column's 28px gap — inter-row gap and internal padding are two different values, not near-equal ones.
  - [ ] The `RadioDot` is centred on the label's first line: the 14px label carries an explicit line-height class (e.g. `leading-5`), and the dot's `align` prop is passed from the onboarding call site as `(line-height − 14px) / 2` (`mt-[3px]` for `leading-5`). `RadioDot`'s default `align` in claim-shell.tsx is unchanged, because three claim components share it.
  - [ ] The rows keep `rounded-[var(--radius-element)]` (no `rounded-full`, no card radius), the selected row keeps `border-[var(--blue)] bg-[var(--blue-tint-08)]`, the unselected keeps `border-[var(--border-field)]` + `hover:bg-[var(--surface-subtle)]`, and the `focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]` pair survives — selection and focus stay visible in the class list exactly as before.
  - [ ] Outside those class lists nothing changes: `role="radiogroup"` + its `aria-label`, three separately bordered `role="radio"` buttons with `aria-checked` and `onClick`, the `COLLEGE_OPTIONS` strings, the "Step 2 of 2" eyebrow, the Continue/Skip `ClaimActions` row, step 1 and step 3 are byte-identical to before, and the diff touches only `src/app/onboarding/onboarding-flow.tsx`.
- **notes:** Scope is the college step only, on purpose. Step 1 (lines ~197–237) is a different pattern — the icon card grid (`grid gap-3 sm:grid-cols-3`, `flex-col gap-2 p-5`, icon on top, no `RadioDot`) copied verbatim from `claim/role-choice.tsx` — so leaving it alone creates no inconsistency inside the flow. The byte-identical twin of the college rows is `src/components/claim/team-type-choice.tsx` (lines ~65–80: same `gap-3.5 px-[18px] py-4` row and `gap-[3px]` stack). Not touched here — adjacent surfaces get their own branch; if the author wants the twin brought along, that is a separate task, and the values chosen here are the spec for it. The author's screenshot reads "STEP 3 OF 3"; this branch renders "Step 2 of 2" (line ~256) and no reachable commit adds a name step — do not touch the eyebrow or any copy. Guardrails: onboarding is named nowhere in docs/ui-revamp-guardrails.md and §3.5 lists layout/spacing/card structure as free to redesign — none apply. The other branch queue (.claude/tasks/splitstep-integration.md) mentions onboarding only in T37, the Team Home onboarding checklist — a different surface, not a duplicate. Design context for the impeccable loader is the repo-root DESIGN.md, which exists — do NOT run `/impeccable teach` or `document` (both write files). Where the impeccable reference's generic 4pt advice and the repo's rules differ, the repo wins: spacing.css fences 2/6/10px as component-internal only — fine for label→sub (`gap-0.5`/`gap-1`/`gap-1.5`) and dot→text (`gap-2.5` is the DS's icon+text pair, `gap-3` its list-item gap), never between the rows. Tailwind v4's `text-[14px]` sets no line-height, which is why the alignment criterion asks for an explicit `leading-*`. This is a spacing/alignment pass, not a restructure or a visual redesign: no icons, no illustrations, no reordering, no fusing the rows into one bordered list, no weight changes unless the DS type scale already names the weight. The worktree has no node_modules — run `npm ci` before `npm run lint`.
