# Tasks — claude/grey-bar-replacement-54e9ed

> Scope: Replace the grey court-guide info box in the upload wizard's video requirements panel with a help-centre link.

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

## T1 · Replace the court-guide box with a help-centre link

- **status:** todo
- **model:** sonnet
- **files:** src/components/dashboard/matches/new-match-wizard/VideoRequirements.tsx
- **done when:**
  - [ ] The `CourtGuide` function, its inline SVG and the `bg-[var(--surface-subtle)]` wrapper are deleted from `VideoRequirements.tsx`; the wizard's video step renders no grey box between the spec line and the `REQUIREMENTS` list.
  - [ ] In its place, the panel ends with a single inline text link (a `next/link` `<Link>`) reading "View all requirements" that points to `/dashboard/help#advantage-intelligence` — the existing help-centre section whose `id` is already `advantage-intelligence` — styled with the DS link treatment (`text-[var(--blue)]`, hover `--blue-hover`, `text-[12px]`), not a button.
  - [ ] The `REQUIREMENTS` row "Elevated, centered, behind one baseline" no longer says "see the court guide below"; its `rest` copy instead carries the framing rule itself: both baselines and the far service line in frame, with some space beyond the court on every side.
  - [ ] The "A guide, not a check — nothing here confirms the framing." disclaimer appears nowhere in the wizard; the doc comment at the top of the file is updated so it no longer describes a court-framing guide or an inline SVG.
  - [ ] `npm run typecheck` and `npm run lint` pass with no new findings in the changed file.
- **notes:** Destination is confirmed, not guessed — MAP.md lists `/dashboard/help` (`src/app/dashboard/help/page.tsx`) and its Advantage Intelligence section has `id="advantage-intelligence"` with an `INTELLIGENCE_REQUIREMENTS` list (singles, 1080p, 30 fps, complete games). That section says nothing about camera framing, which is why criterion 3 keeps the framing sentence in the wizard rather than letting it vanish. Adding framing guidance to the help page itself is out of scope here (different surface — own task if wanted). `VideoRequirements` is deliberately not `"use client"`; `next/link` is fine in a Server-Component-compatible file, so do not add the directive. No measured outside-court margin exists in the provider's docs — keep "some space", don't invent a number. Do not touch `FileStepContent.tsx` or the wizard's player-assignment inputs (see `docs/ui-revamp-guardrails.md`).
