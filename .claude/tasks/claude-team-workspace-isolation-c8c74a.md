# Tasks — claude/team-workspace-isolation-c8c74a

> Scope: team-workspace isolation — matches must not leak across team workspaces, and pending join requests must be visible to whoever sets up the team.

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

## T1 · Prove and lock cross-program match isolation
- **status:** done
- **model:** fable
- **files:** tests/rls-workspace-isolation.spec.ts (new — guess; a scripts/ harness or pgTAP SQL is equally acceptable), supabase/migrations/ (only if a gap is found)
- **done when:**
  - [ ] A committed, repeatable test (named in the diff, runnable on demand) builds the two-program fixture — one athlete rostered in program A and program B, a match filed with `program_id = A` — and asserts a B-staff session reads zero rows for that match from `matches`, `match_stats`, `points`, `shots`, and `match_files`
  - [ ] The same test asserts a B-rostered player session (with `roster_visible` on for B) also reads zero rows for the A-filed match
  - [ ] The test asserts the write side: a session that is not a member of program A can neither INSERT a match with `program_id = A` nor UPDATE an existing match's `program_id` to A (the `matches_block_client_regraft` refusal is the expected failure)
  - [ ] Any assertion that fails is closed by a migration applied to the live DB and committed under `supabase/migrations/`, and the test passes afterward; if every assertion passes untouched, the commit message states the audit passed with policies unchanged
- **notes:** Verified live 2026-08-29: `matches` SELECT policy + `visible_match_ids()`/`visible_point_ids()` already isolate by program, and `/dashboard/matches` + statistics already scope app-side (team `eq(program_id)`, personal `created_by` + `program_id is null`) — so the deliverable is the executable proof, not a blind new policy. Live DB is the only schema source of truth; fixtures must be cleaned up or run on a disposable Supabase branch. Load supabase:supabase-postgres-best-practices before any SQL.

## T2 · Staff read path for pending join requests
- **status:** todo
- **model:** fable
- **files:** src/lib/data/join-requests-server.ts (new — guess), src/lib/services/programs/claim-actions.ts (reference: `fileRequest()` writes the rows), supabase/migrations/ (only if the RLS-policy route is chosen)
- **done when:**
  - [ ] A server-side loader returns, for a given program, the pending `program_requests` rows of kind `invite_request` (email, name, note, created_at) when the caller is that program's owner/coach/staff — and returns nothing (or denies) for a non-member and for staff of a different program
  - [ ] Rows of kind `ownership_dispute` or `unlisted_program`, and rows already resolved, never appear in the loader's result for any caller
  - [ ] A staff-gated server action marks one of the caller's program's `invite_request` rows resolved (status + resolved_by + resolved_at), and refuses the same call from a non-staff caller or against a request belonging to another program
  - [ ] Whichever access mechanism is chosen (RLS policy + grant, or admin-client loader behind an `is_program_staff` check), the admin client never enters a client component module graph, and any migration is applied to live and committed under `supabase/migrations/`
  - [ ] A committed test covers the staff read, the non-member denial, and the cross-program denial
- **notes:** Verified live 2026-08-29: `program_requests` has NO RLS policies and revoked public grants — deliberately server-only (migration 20260818041110). It also holds `ownership_dispute` rows about the program; those must stay admin-only (surfacing a dispute to current staff could tip off a squatter). `/claim/[programKey]/request` files these rows today and only `/admin/claims` reads them.

## T3 · Roster page: pending join requests section
- **status:** todo
- **model:** opus
- **needs:** T2
- **files:** src/app/dashboard/team/roster/page.tsx, src/components/dashboard/team/join-requests-card.tsx (new — guess), src/components/dashboard/team/roster-invite-dialog.tsx
- **done when:**
  - [ ] In a team workspace with pending `invite_request` rows, the roster page (staff view) lists each requester's name (email local part when unnamed), email, note when present, and request date
  - [ ] With zero pending requests the section mounts nothing at all — no card, no empty-state copy (the needs-attention convention on team pages)
  - [ ] An Invite affordance on a row opens the existing roster invite dialog with the requester's email prefilled
  - [ ] A dismiss control on a row calls the T2 resolve action and the row leaves the list without a full page reload
  - [ ] A player-role viewer of the same workspace never sees the section, and it never renders in a personal workspace
- **notes:** Read docs/ui-revamp-guardrails.md and .skills/advantage-analytics-design/SKILL.md before building; use trace-route. The roster page is the confirmed invite-management surface (roster-invite-dialog.tsx, roster-header-buttons.tsx). This is what makes intent 2's "whoever sets it up sees who requested" true for requests filed before the program was claimed — they sit in the same table and surface the moment staff first open the roster.
