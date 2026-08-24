# Tasks — claude/design-system-updates-850200

> Scope: bring DESIGN.md and the advantage-analytics-design skill back in line with the design system as shipped.

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

## T1 · Fold the shipped focus/token work into DESIGN.md and the design skill
- **status:** done
- **files:** DESIGN.md, .skills/advantage-analytics-design/SKILL.md (read-only:
  src/styles/design-system/{focus,effects,colors}.css, src/lib/ui/adv-button.ts,
  src/components/dashboard/team/invite-dialog.tsx, src/components/claim/program-search.tsx)
- **done when:**
  - [ ] SKILL.md's composite-field guidance names both shipped selectors — `focus-within:` for a box holding only the input, `has-[input:focus-visible]:` for a box that also holds focusable children — and says `focus-within` double-rings when a chip's remove button is focused. `invite-dialog.tsx` is cited as the second case, not the first.
  - [ ] No SKILL.md component recipe still instructs the builder to write `focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40` — each occurrence is removed or marked inert, so no snippet contradicts the section's own "Write nothing."
  - [ ] Both docs name the wrapper-ring pattern by that name and document `data-focus-ring="none"` as its opt-out, including why it is scoped to `:focus-visible` rather than an inline `boxShadow: "none"`.
  - [ ] DESIGN.md records the shipped values of `--focus-ring` and `--focus-ring-field` from effects.css and the 3:1 floor on `--field-ring` / `--ink-500`.
  - [ ] Every token defined in `src/styles/design-system/effects.css` and `focus.css` appears in DESIGN.md or SKILL.md, or is listed there as deliberately undocumented.
- **notes:** Docs-only; no component or CSS changes. Adjacent drift found but left out of scope — CLAUDE.md:151 still says "two Framer Motion curves" while both design docs list three (`--ease-chart`).
