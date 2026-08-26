# Tasks — splitstep-integration

> Scope: the integration trunk. Anything landing on `splitstep-integration`
> before it merges to `main`.

Renamed from `claude-workspace-setup-repo-1389c6.md` on 2026-08-24, when that
branch merged here. T1 ran on the old branch and is kept for its history; the
queue file is named after the branch it serves, so the tasks moved with the
work rather than staying with the branch that happened to create them.

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

## T1 · Replace the boilerplate README
- **status:** done
- **files:** README.md
- **done when:**
  - [ ] No `create-next-app` boilerplate text remains
  - [ ] States what Advantage Analytics is in two sentences, matching PRODUCT.md
  - [ ] Lists the three required env vars by name, with no values
  - [ ] Links MAP.md, CLAUDE.md and docs/README.md
  - [ ] `npm run dev` and `npm run build` are documented and both still work
- **notes:** Untouched since 2025-09-06. It is the repo's front door.

## T2 · Reconcile DATABASE_PRD.md with the live schema
- **status:** todo
- **files:** DATABASE_PRD.md
- **done when:**
  - [ ] Every table it documents is verified against the live database via the
        Supabase MCP `list_tables`, not against supabase/migrations/
  - [ ] Tables that exist live but are undocumented are listed
  - [ ] Fields it documents that no longer exist are removed or marked removed
  - [ ] Carries a dated header saying current-state or point-in-time, per the
        convention in docs/README.md
- **notes:** 778 lines stamped February 2026. supabase/migrations/ runs about
  100 migrations behind live, so the folder is not a source of truth. CLAUDE.md
  cites this file as "Schema reference" — Task 7 of the plan qualifies that.

## T3 · Add a docs-freshness reviewer
- **status:** later
- **files:** .claude/agents/docs-freshness-reviewer.md
- **done when:**
  - [ ] Reads docs/README.md first and honours its current-vs-point-in-time marks
  - [ ] Flags a doc whose described behaviour the diff contradicts
  - [ ] Does not flag a point-in-time doc merely for being old
  - [ ] tools and model match the other agents in .claude/agents/
- **notes:** Phase 2. docs/README.md already states the house rule that a doc
  drifting silently is worse than no doc; this enforces it.

## T4 · Vitest over the pure logic layer
- **status:** later
- **files:** package.json, vitest.config.ts, src/lib/services/upload/, src/lib/data/
- **done when:**
  - [ ] Vitest runs alongside Playwright without either claiming the other's files
  - [ ] The SwingVision parser has tests over a real fixture
  - [ ] statistics-server and statistics-client are asserted to produce the same
        shape from the same input
  - [ ] `npm test` runs both runners
- **notes:** Phase 2, and deliberately scoped. Blanket unit tests across all 419
  files are rejected: the runner is Playwright, most files are React components,
  and the cost/benefit does not hold. Target the logic that fails silently.

## T5 · Notion task ingestion
- **status:** later
- **files:** .claude/skills/task-import/
- **done when:**
  - [ ] Pulls open items from Notion via MCP
  - [ ] Rewrites each into the schema in this file, with a `done when:` list
  - [ ] Appends to the current branch's queue without touching existing entries
  - [ ] An item too vague for acceptance criteria is reported, not guessed at
- **notes:** Phase 3. The rewrite is the point: a Notion line like "fix the
  matches page" has no criteria, and a task without criteria cannot be gated.

## T7 · Stop a refused upload stranding its blob and job
- **status:** todo
- **files:** src/lib/services/splitstep/submit-match-video.ts,
  src/app/api/splitstep/jobs/route.ts (guess)
- **done when:**
  - [ ] A permission refusal at `/api/splitstep/jobs` leaves the job in a state
        something eventually reclaims — not `uploaded`, which
        `reap_stalled_uploads()` skips, reaping only `pending`/`uploading`
  - [ ] The blob for a refused job becomes reclaimable by the `reclaim-videos`
        cron rather than staying pinned by a job row that names it
  - [ ] A genuine transient submit failure — network, vendor 5xx — still leaves
        the job retryable without re-uploading, which is why `uploaded` exists
  - [ ] The person is told the upload will not be retried, instead of a
        "Not submitted" state inviting a retry that can never succeed
- **notes:** `/pr-check` finding. A coach revoking "Can send video" mid-transfer
  is the trigger: bytes land, submit 403s, and the job sits at `uploaded`
  forever with the blob behind it. The pending-review refusal has the same shape
  but self-resolves when the claim is approved; a permission refusal does not.

## T8 · Tell "cannot resolve your workspace" apart from "you are not a member"
- **status:** todo
- **files:** src/app/api/splitstep/upload-url/route.ts (guess)
- **done when:**
  - [ ] A null `getWorkspaceContext()` on a personal upload no longer returns
        the "you do not have access to the workspace this match belongs to" 403
  - [ ] That case returns a status the client treats as transient, with a
        message that asserts no membership fact
  - [ ] A real non-member — a match whose `program_id` the caller genuinely has
        no membership for — still gets the 403 and the existing sentence
  - [ ] The transient case does not mark the job failed, so a retry needs no
        re-upload
- **notes:** The route calls `getWorkspaceContext()` a second time (after its own
  `getUser()`); any transient GoTrue failure collapses `available` to `[]`, and
  `billingWorkspaceFor([], null)` returns undefined — reported as "no access" to
  the user's *own* personal workspace.

## T9 · Name every remedy a refused uploader actually needs
- **status:** todo
- **files:** src/lib/workspace/types.ts (guess — `explainVideoRefusal`)
- **done when:**
  - [ ] With both `players_can_upload` and the member's `upload_enabled` off,
        the refusal names both fixes, not only the program-wide one
  - [ ] With only one off, the sentence still names just that one
  - [ ] Staff and personal workspaces are unaffected — the `kind` and
        `isProgramStaff` short-circuits still answer first
  - [ ] The pending-review sentence is unchanged and still answered before the
        switches
- **notes:** Today the `!playersCanUpload` branch returns first, so a coach who
  opens Team settings as instructed finds the player still refused, now with a
  different message pointing at the roster row. Two round trips for one refusal.

## T10 · Catch a roster email that belongs to an account, not a roster row
- **status:** todo
- **files:** src/components/dashboard/team/roster-actions.ts,
  supabase/migrations/ (one migration, likely a check inside
  `update_program_player` / `add_program_player`)
- **done when:**
  - [ ] Saving a roster row whose email matches a `users.email` in the program
        — a coach's or another athlete's login address — is refused with a
        sentence a coach can act on, not saved silently
  - [ ] The refusal names whose account it collides with only as much as a
        coach may already see on the roster; it must not disclose an address
        the caller could not otherwise read
  - [ ] `addProgramPlayer` and `updateProgramPlayer` behave the same way — the
        gap is in both paths, not only Edit
  - [ ] The existing `program_players_email_key` path is untouched: a
        collision with another live roster row still maps to the same
        coach-readable sentence, not the raw constraint string
  - [ ] The check runs in the database, not only in the server action, so a
        direct RPC call from a staff session cannot bypass it
- **notes:** `program_players_email_key` is
  `(program_id, lower(email)) where email is not null and merged_into_id is
  null and archived_at is null` — it is scoped to **`program_players` rows**
  (`supabase/migrations/20260822090000_program_players.sql:96`). An address
  that lives in `users.email` and on no live roster row in that program passes
  it and saves. That is the reverse of the collision the tripwire was built
  for: `program_roster_full` coalesces `pp.email` with `u.email`, so the
  roster already *displays* account addresses, and a coach retyping one has no
  signal that it binds a personal login address into the program's own column.
  Deferred from the T1 roster-edit work on `claude/roster-edit-player`
  (branch merged and deleted); the finding is in
  `.claude/tasks/claude-roster-edit-player.log.md` and
  `docs/roster-edit-and-people-search.md`, which a log alone never makes
  runnable. Smaller follow-ups from the same review, not worth their own
  tasks: consolidate `toMessage`/`activeProgramId` in `roster-actions.ts`,
  dedupe the repeated select field list, give `UnderlineSelect` a chevron
  affordance, and put a unit suite over `spotHolders`/`spotHeldNote` and the
  error classifier (T4's Vitest task is the natural home for the last one).
