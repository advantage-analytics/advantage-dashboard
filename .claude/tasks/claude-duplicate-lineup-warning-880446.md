# Tasks — claude/duplicate-lineup-warning-880446

> Scope: pre-submit duplicate warnings in the team Roster's Add player dialog.

Run one with `/task-next`. Drain the file with `/loop /task-next`.
Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so `/loop /task-next`
drains straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Warn when a lineup spot is already taken
- **status:** done
- **files:** src/components/dashboard/team/add-player-dialog.tsx,
  src/components/dashboard/team/roster-header-buttons.tsx,
  src/app/dashboard/team/roster/page.tsx *(guess)*
- **done when:**
  - [ ] Picking a lineup spot already held by a live roster member shows an inline
        warning in the Add player dialog that names the player holding it
  - [ ] The warning is non-blocking — Add player stays enabled, and submitting
        still creates the row with that spot
  - [ ] "Not set" and any free spot show no warning
  - [ ] The warning is visually distinct from `DialogProblem` and does not use the
        error red — that row stays reserved for `add_program_player`'s messages
  - [ ] `npm run lint` and `npm run build` pass
- **notes:** The `length: 9` comment in add-player-dialog.tsx records that spots
  are non-unique on purpose (no swap control exists). Warn, never block or
  disable the taken options. Occupied spots come from `roster.members[].lineupSpot`
  (`team-roster-server.ts`), passed page → RosterHeaderButtons → AddPlayerDialog.

## T2 · Warn on a name already on the roster before submit
- **status:** done
- **files:** src/components/dashboard/team/add-player-dialog.tsx,
  src/components/dashboard/team/roster-header-buttons.tsx,
  src/app/dashboard/team/roster/page.tsx *(guess)*
- **done when:**
  - [ ] Typing a first + last name that matches a live roster player shows an
        inline warning in the Add player dialog naming that player and showing
        their email, or saying they have no email on file
  - [ ] The match reuses the roster's existing duplicate rule — trim, lowercase,
        collapse whitespace — and introduces no new fuzzy-matching definition
  - [ ] Non-blocking: Add player stays enabled and submitting still creates the row
  - [ ] No warning when the name is unique on the roster or either name field is empty
  - [ ] No client-side email-collision check is added — `add_program_player`'s
        messages still render unchanged in `DialogProblem`
- **notes:** The email tripwire has teeth (partial unique index + two RPC checks);
  the name rule is warn-not-refuse on purpose — see program_players.sql:84. Keep
  the tone of roster-table's chip: "a question and not an alarm". Shares the
  members → RosterHeaderButtons → AddPlayerDialog plumbing with T1, so whichever
  runs second should reuse it rather than add a second prop path.
