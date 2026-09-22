# Tasks — claude/dialog-list-design-ceb3cd

> Scope: confirm-dialog prose, the Matches unread marker, and the seat meter.

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

## T1 · Replace the Matches New pill with an unread dot in the row gutter

- **status:** done
- **model:** sonnet
- **files:** `src/components/dashboard/matches/match-card-list.tsx`, `src/components/ui/new-pill.tsx` (delete), `src/components/ui/state-pill.tsx` (doc comment only) — guess
- **done when:**
  - [ ] `src/components/ui/new-pill.tsx` is deleted and `grep -rn "NewPill" src/` returns nothing
  - [ ] The marker is absolutely positioned inside the row element, which already carries `relative` and `-mx-4 … px-4`; no grid cell gains or loses a child and `match-list-layout.ts` does not appear in the diff
  - [ ] The marker renders only when `unseen`, is `aria-hidden`, and is paired with `sr-only` text so the state is not conveyed by colour alone
  - [ ] The `unseen` prop's doc comment (`match-card-list.tsx:84`) no longer says it "draws the blue 'New' pill"
  - [ ] `state-pill.tsx`'s doc comment no longer names `NewPill` as the blue-tinted exception
- **notes:** Direction settled from the mockup canvas (board "New row — 4 to 8", option 7). A leading grid track and a reserved span inside the Date cell were both rejected. The track touches six files including all three lists in `match-list-layout.ts` (`TEAM_LIST_GRID_COLS_COMPACT` must keep an equal track count or the drawer's `grid-template-columns` transition stops interpolating) plus three hand-summed `LIST_MIN_WIDTH` literals. The Date-cell span shifts match dates 11px right but not `draft-row.tsx:102-108`, which renders its own identical Date cell in the same table. Editing a dashboard widget gates the commit on the `widget-states` skill. No Playwright spec covers this.

## T2 · Draw a free seat as an outline in SeatBoxes

- **status:** done
- **model:** sonnet
- **files:** `src/components/dashboard/team/dialog-shell.tsx` — guess
- **done when:**
  - [ ] `SeatBoxes`' `free` branch is an inset `--ink-300` hairline with no background; the `used`, `held`, `adding` and `full` branches are unchanged
  - [ ] The doc comment above `SeatBoxes` no longer says "grey = free" and states the grammar it now follows — outline means not spent, solid means spent
  - [ ] `.skills/advantage-analytics-design/reference/settings.md:81` still reads true, or is amended: it says an outlined seat box stands for an invite, which is now outline-plus-blue specifically
  - [ ] No call site changed — `add-player-dialog.tsx:813`, `SeatNote` and `team-members-card.tsx:225` (`SeatPips`) are untouched apart from the shared component
- **notes:** Free seats are `--ink-100` #F3F3F3 drawn on `SeatNote`'s `--surface-subtle` #F5F5F5 — two points apart on every channel, so half the quota is not drawn. A darker fill (`ink-100` → `ink-200`) is not the fix: fill-against-fill is the comparison that already failed, and the three call sites sit on three different grounds — `--surface-subtle` twice, and `SeatPips` on no fill at all, since `SettingsCard` sets border and shadow only. An outline is ground-independent. `tests/seats-count-players.spec.ts` asserts DB-level counts only and never touches a class string.

## T3 · Reconcile the "New is the one blue-tinted pill" rule across the design system

- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** `.skills/advantage-analytics-design/SKILL.md`, `reference/tables.md`, `reference/settings.md`, `reference/primitives.md`, `reference/empty-and-loading.md` — guess
- **done when:**
  - [ ] Every printing of the rule is reconciled — `SKILL.md:62` and `:66`, `reference/tables.md:105` and `:118`, `reference/settings.md:92`, `reference/primitives.md:162`, `reference/empty-and-loading.md:103`
  - [ ] `tables.md:118`'s statement that `match-card-list.tsx` draws "New" through `NewPill` is replaced by a description of the row-gutter dot
  - [ ] The replacing rule carries a supersession note quoting the retired rule verbatim, in the `_Supersedes (v3): "…"._` form `SKILL.md:72` requires
  - [ ] SKILL.md's supersession roll-call (`:60-67`) records the change
  - [ ] Nothing under `src/styles/design-system/` is touched — no token value changes
- **notes:** Seven references, five files. This is exactly the trap AGENTS.md warns about for design-system edits: `grep -rn` the whole skill directory before writing, because a rule may be printed in more than one place. The locations above were found that way and are believed complete, but re-grep. `settings.md:92` calls its own case "the sanctioned blue-tinted pill besides New", so it depends on New's status and cannot be skipped.
