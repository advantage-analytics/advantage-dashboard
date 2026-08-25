# Tasks — claude/roster-edit-player

> Scope: let program staff edit an existing roster player — name, class year, lineup spot, email.

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

## T1 · Let staff edit a roster player from the row menu
- **status:** blocked
- **files:** src/components/dashboard/team/roster-actions.ts,
  src/components/dashboard/team/roster-table.tsx,
  src/components/dashboard/team/add-player-dialog.tsx, plus two new files
  (edit-player-dialog.tsx, player-fields.tsx) — a guess
- **done when:**
  - [ ] The roster row menu carries an `Edit player` entry for every member with a
        non-null `profileId`, gated on that and not on role, and the menu closes
        before the dialog opens.
  - [ ] The dialog's fields are seeded from a fresh read of `program_players`, NOT
        from the `RosterMember` in props: a two-word surname round-trips intact, and
        a claimed player whose profile has no email shows an empty email field rather
        than their login address.
  - [ ] Saving a change to lineup spot alone leaves class year and email intact on
        reopen — proving all five params are passed explicitly to the full-row-overwrite
        RPC.
  - [ ] A spot another player already holds produces the existing soft warning without
        blocking Save, and that warning never names the player being edited.
  - [ ] A duplicate email surfaces a written sentence, never the raw
        `duplicate key value violates unique constraint` string; and a player removed
        in another tab yields a terminal "no longer on this roster" state with the
        archived row left unchanged in the database.
- **notes:** `update_program_player` already exists and has zero callers. No migration.
  Drag-and-drop reordering is deliberately a separate later task — it needs a bulk
  reorder RPC. Full design and risks: `docs/roster-edit-and-people-search.md` §1.
