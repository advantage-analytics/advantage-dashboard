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
- **status:** blocked
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

## T5 · Re-land the player-upload gate without the line-picker dead end
- **status:** done
- **files:** recovered from stash 2c5f85b7 — src/lib/workspace/types.ts,
  src/lib/workspace/active-workspace-server.ts, src/lib/workspace/actions.ts,
  src/app/dashboard/team/upload/page.tsx, and the restored migration file
- **done when:**
  - [ ] The diff carries T4's stashed work — `Workspace.playersCanUpload`,
        `canUploadForProgram()`, the `active-workspace-server.ts` select, the
        `upload/page.tsx` gate, `RESTRICTED_PAGES`, and the migration file
  - [ ] A player admitted to `/dashboard/team/upload` cannot reach the
        `?entry=` line-picker path the `matches_block_client_regraft` trigger
        refuses — picking a line never surfaces a raw `42501`
  - [ ] `?match=`, `?player=` and the no-preset paths still work for an
        admitted player, and staff still see the full line picker
  - [ ] No comment in the changed files claims `program_members.upload_enabled`
        is checked while nothing checks it
  - [ ] The stale claim in `matches_block_client_regraft`'s comment, that
        `/dashboard/team/upload` redirects non-staff, is corrected somewhere a
        reader will meet it — without editing that already-applied migration,
        per the create-migration house rule
- **notes:** Migration `20260824182016` is ALREADY APPLIED to the live database
  (default true, 1941/1941 rows true, version recorded in
  `schema_migrations`). Restore the file; do NOT re-apply it. T6 owns the
  `upload_enabled` question — do not enforce it here, or criterion 4's comment
  fix and T6 will contradict each other.

## T6 · Make the roster's "Can send video" switch real
- **status:** done
- **files:** src/lib/workspace/types.ts,
  src/lib/workspace/active-workspace-server.ts,
  src/app/dashboard/team/upload/page.tsx, a new supabase/migrations/ file
- **done when:**
  - [ ] A member whose `program_members.upload_enabled` is false cannot open
        `/dashboard/team/upload`, even when the program's `players_can_upload`
        is true
  - [ ] `owner`, `coach` and `staff` are unaffected by `upload_enabled`
  - [ ] `program_members.upload_enabled` defaults to true for new members and
        existing rows are backfilled, verified against the live schema via the
        Supabase MCP rather than supabase/migrations/
  - [ ] Flipping the roster's "Can send video" switch off for one player
        changes what the page admits for that player alone, with no change to
        the program-wide setting
  - [ ] The three-condition doc comment in `types.ts` is true of the code once
        this lands
- **notes:** Depends on T5. The switch exists in the roster and reads as a
  working control, but nothing enforces it — `upload_enabled` defaults false on
  every invite, which is why criterion 3 flips the default: enforcing it
  without that would make "players can upload by default" false again. THIS
  TASK WRITES TO THE LIVE DATABASE. T4's lesson is that the migration is
  applied before the gate runs, and a gate failure cannot undo it — run this
  one deliberately.

## T7 · Bound match attribution to the program's own roster
- **status:** done
- **files:** a new supabase/migrations/ file,
  src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts,
  src/lib/data/match-detail-server.ts and the match-detail hero (guess)
- **done when:**
  - [ ] A match inserted with `program_id` set is refused unless `player1_id`
        names someone on that program — a `program_players` row of it or a
        `program_members` user of it — enforced in the database, not only by
        the wizard's roster picker
  - [ ] A player can still file a match for a teammate on their own program,
        and staff still can — the intended behaviour is preserved
  - [ ] An attempt to attribute a match to a uuid belonging to nobody on the
        program surfaces a written message, not a raw `42501` rendered as
        "Database error: …"
  - [ ] Match detail shows who uploaded a match when `created_by` differs from
        the player it is attributed to, so a teammate can see where it came from
  - [ ] Personal matches are unaffected — an insert with `program_id is null`
        behaves exactly as it does today
- **notes:** From T5's blocked run. Uploading for a teammate is intended (the
  roster page already says so), so this bounds attribution rather than closing
  the `?player=` branch — T5's criterion 3 stands as written. Today nothing
  below the picker constrains `player1_id`, so a crafted insert can name any
  uuid at all. THIS TASK WRITES TO THE LIVE DATABASE. Land it before re-queuing
  T5: with the constraint in place, the `rls-boundary-reviewer` finding that
  blocked T5 is answered at the layer it asked for.

## T8 · Enforce the upload permission where the budget is spent
- **status:** todo
- **files:** src/app/api/splitstep/jobs/route.ts (guess — between the
  `billingWorkspace` resolve at ~342 and `reserveQuota` at ~353),
  src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts
- **done when:**
  - [ ] A player whose program has `players_can_upload` false, or whose own
        `program_members.upload_enabled` is false, cannot reserve the
        program's video quota from `/dashboard/matches/new` — refused
        server-side, not merely hidden in the UI
  - [ ] `owner`, `coach` and `staff` can still file from either route,
        unaffected by both flags
  - [ ] A personal upload (`program_id is null`) is unaffected and still
        reserves against the personal account exactly as today
  - [ ] The refusal reaches the wizard as a written sentence, not a raw error
        or a silent failure after the video has uploaded
  - [ ] The check sits at the point the spend is committed, so it holds
        whichever page opened the wizard — adding a guard only to
        `/dashboard/matches/new/page.tsx` does not satisfy this
- **notes:** `/pr-check` blocker, found independently by six reviewers.
  `canUploadForProgram()` is enforced on one page only; `/dashboard/matches/new`
  renders the same wizard unguarded, and the "New match" button plus the global
  ⌘U shortcut reach it from five-plus surfaces. `matches_block_client_regraft`
  checks membership only and `reserveQuota` checks only `canSubmitVideo`, so a
  revoked player spends the budget with no error. T6 is what makes this urgent:
  it turned a visibly-broken switch into one that persists silently, so a coach
  now gets false confidence rather than an error. `route.ts` already holds
  `billingWorkspace` as a full `Workspace` four lines before `reserveQuota` —
  the guard is roughly four lines plus an import.

## T9 · Make the upload switch report a write that changed nothing
- **status:** todo
- **files:** a new supabase/migrations/ file,
  src/components/dashboard/team/roster-actions.ts,
  src/components/dashboard/team/roster-table.tsx (guess)
- **done when:**
  - [ ] `set_member_upload_enabled` distinguishes a write that matched a row
        from one that matched none, and the caller can tell them apart
  - [ ] When the write matches no row, the roster switch reverts its optimistic
        state and the coach sees a message — the existing revert at
        `roster-table.tsx:246` actually fires
  - [ ] An ordinary flip on a real member still succeeds and persists, in both
        directions, with no new round trip on the success path
  - [ ] The RPC stays staff-gated, `search_path`-pinned and closed to `anon` —
        a player calling it still gets `42501`
  - [ ] Verified against the live schema via the Supabase MCP rather than
        supabase/migrations/
- **notes:** `/pr-check` finding 2, found independently by four reviewers.
  `set_member_upload_enabled` returns void whether it updated one row or none,
  so `roster-actions.ts` reports `{ok:true}` either way and the optimistic
  `setEnabled(next)` sticks. Reachable because `remove_program_member` deletes
  the `program_members` row but leaves `program_players.claimed_by_user_id`
  set, so the profile still returns from `program_roster_full` arm 1 with a
  non-null `user_id` and `role='player'` — and the switch renders. The coach
  believes they granted upload; the next roster load shows it off again with
  nothing explaining why. Depends on T8: without it the switch still does not
  gate the budget, so making it honest about failed writes fixes reporting on a
  control that means nothing. THIS TASK WRITES TO THE LIVE DATABASE.
