# Tasks — claude/task-list-workspace-condensing-370e4c

> Scope: the workspace switcher in the dashboard sidebar — how it reads, and
> what happens to the page when you switch.

Run one with `/task-next`. Drain the file with `/loop /task-next`.
Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so `/loop /task-next`
drains straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Even out the workspace switcher rows
- **status:** done
- **files:** src/components/dashboard/sidebar/workspace-row.tsx (guess — the
  popover rows at ~L125-190, not the collapsed trigger)
- **done when:**
  - [ ] Every row in the switcher popover renders at the same height — no row
        carries a stacked second line while another is single-line
  - [ ] Squad and role are either condensed onto the one line or dropped
        deliberately, with a comment in the file saying which and why
  - [ ] A long workspace name still truncates inside the 232px panel with no
        horizontal overflow
  - [ ] The active row keeps its blue-soft background, its check mark stays
        vertically centred, and the pending spinner replaces it in the same slot
  - [ ] The collapsed/expanded trigger row above the popover is unchanged —
        it keeps its h-[42px] two-line layout
- **notes:** From a screenshot of the expanded sidebar: "ZZ Test Program · Men's"
  over "Coach" makes the team row taller than "Personal". Dashboard UI, so
  docs/ui-revamp-guardrails.md applies.

## T2 · Load the new workspace's page on switch
- **status:** done
- **files:** src/lib/workspace/actions.ts,
  src/components/dashboard/sidebar/workspace-row.tsx (guess — the cookie write
  and revalidatePath, and the switchTo transition that calls it)
- **done when:**
  - [ ] Selecting a different workspace in the switcher puts that workspace's
        page content on screen with no manual browser reload
  - [ ] Switching away from a team workspace while on a `/dashboard/team/*`
        route ends on a route that exists for the new workspace, not a blank
        or team-shaped page
  - [ ] There is no end state where the sidebar shows the new workspace while
        the page body still shows the old one's data
  - [ ] `setActiveWorkspace` still re-resolves membership server-side and
        ignores an id the viewer has no `program_members` row for
- **notes:** Today the action revalidates the dashboard layout and nothing more
  — team→personal relies on team/layout.tsx's redirect firing during that
  refresh. Verify both directions by hand against ZZ Test Program (owner) and
  Personal.
