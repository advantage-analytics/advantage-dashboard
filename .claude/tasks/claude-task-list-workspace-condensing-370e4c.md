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

## T3 · Correct the STAFF_ONLY_PAGES fallback for team upload
- **status:** done
- **files:** src/lib/workspace/actions.ts (guess — STAFF_ONLY_PAGES and the
  comment above it)
- **done when:**
  - [ ] The fallback for `/dashboard/team/upload` and the destination
        `team/upload/page.tsx` actually sends a non-staff viewer to are the
        same path
  - [ ] The comment above `STAFF_ONLY_PAGES` states only what the map does —
        no claim the entries do not honour
  - [ ] The `/dashboard/settings/team` entry still resolves to
        `/dashboard/settings/profile`, matching `settings/team/page.tsx`
  - [ ] Nothing outside `landingPath` changes — the membership re-resolve, the
        cookie write and the `redirect` call are untouched
- **notes:** Flagged by both reviewers during T2 as non-blocking: the entry maps
  to `/dashboard/team` while the page redirects to `/dashboard/team/schedule`.
  T4 changes who may open that page, so it must revisit this entry.

## T4 · Let players upload when their program allows it
- **status:** todo
- **files:** src/app/dashboard/team/upload/page.tsx, a new
  supabase/migrations/ file, src/lib/workspace/actions.ts (guess)
- **done when:**
  - [ ] A player in a program with `players_can_upload` true can open
        `/dashboard/team/upload` instead of being redirected away
  - [ ] A player in a program with `players_can_upload` false is still
        redirected
  - [ ] `owner`, `coach` and `staff` can still open it regardless of the flag
  - [ ] `programs.players_can_upload` defaults to true for new programs and
        existing rows are backfilled to true, verified against the live schema
        via the Supabase MCP rather than supabase/migrations/
  - [ ] The `/dashboard/team/upload` entry in `STAFF_ONLY_PAGES` still matches
        the page's gate after the change
- **notes:** The setting exists and is surfaced ("anyone" vs "coaches") but
  nothing enforces it — `upload/page.tsx:47` gates on `isProgramStaff` alone.
  `staff` already passes that check, so only players are affected. The column is
  `not null default false`, so a stored false cannot be told apart from
  never-set — the backfill in criterion 4 will also flip any program that
  deliberately turned it off, which the author accepted when adding this task.
