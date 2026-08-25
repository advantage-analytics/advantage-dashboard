# Run log — claude/roster-edit-player

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Let staff edit a roster player from the row menu — blocked

**gate:** 5a mechanical — pass (`npm run lint` 0 errors / 38 warnings, all
pre-existing and none in the five touched files; `npx tsc --noEmit` exit 0, no
stale-`.next/` re-run needed; `npm test` 93 passed). 5b
`task-completion-reviewer` — `VERDICT: pass`, all five `done when:` bullets met
with file:line evidence, no scope creep (it judged the added
`/dashboard/team/roster/[playerId]` revalidation and the `claimed` info row as
in-bounds consequences of the feature). 5c both guardrails ran, neither skipped:
`pipeline-guardrails-reviewer` (diff is entirely under
`src/components/dashboard/team/`) — explicitly clear, no violation, and it
verified the `player-fields.tsx` extraction is behaviour-preserving for the Add
dialog; `rls-boundary-reviewer` (`roster-actions.ts` adds new `program_players`
queries and the first caller of an RPC) — **one finding, so the stage fails.**

**failed stage:** 5c, `rls-boundary-reviewer`. It reported one moderate finding:
the `update_program_player` RPC
(`supabase/migrations/20260822090700_program_player_writes.sql:139-141`) finds
its row on `merged_into_id is null` alone, without `archived_at is null` — unlike
`archive_program_player` in the same file. The RPC is `security definer` with
`grant execute … to authenticated`, so any staff member of a program can call it
directly from a browser console and overwrite an **archived** player row in that
program, bypassing the app-level guard entirely. The new
`updateProgramPlayer()` does re-read through `getProgramPlayerFields()` (which
*does* check `archived_at`) and returns before the RPC on a dead row, so the
feature itself is correct — but that compensation lives only in the Next.js
server action, not in the database, and this diff is what makes the RPC
reachable for the first time. Scope is bounded to staff acting on their own
program's rows: no cross-tenant read or write, no privilege escalation. Every
other RLS check came back clean — no service-role import reaches the client
components (`RosterMember` is a type-only import), workspace scoping holds
against a forged `profileId` on both the read and the write, the duplicate-email
lookup is program-scoped and uses `.eq` so a `%`/`_` in the address cannot act
as a wildcard, and only `error.message` is read so no Postgres `DETAIL` line
leaks.

Not triaged away on severity: this gate treats any guardrail finding as
blocking. Note the tension for whoever picks this up — the fix is one line
inside the RPC, which means a migration, and T1's notes say "No migration". That
constraint needs amending (or a follow-up task filed) before T1 can pass 5c;
the code as written is otherwise gate-clean.

**stash:** `7273343f91e9b8e4cf0cc575037e07d12234c652` — all five files, 861
insertions / 140 deletions, including the two untracked new files
(`edit-player-dialog.tsx`, `player-fields.tsx`). Recover with
`git stash apply 7273343f91e9b8e4cf0cc575037e07d12234c652`; a SHA rather than
`stash@{0}` because `refs/stash` is shared across worktrees and five older
stashes sit behind this one.

**changed:** nothing landed in history. The stashed work adds an `Edit player`
entry to the roster row menu gated on `member.profileId !== null`, a dialog
seeded from a fresh `program_players` read (never from the coalesced
`program_roster_full` view, whose `coalesce(pp.email, u.email)` would otherwise
write a login address into the column), `getProgramPlayerFields()` and
`updateProgramPlayer()` in `roster-actions.ts` passing all five RPC params
explicitly against the full-row overwrite, and a `player-fields.tsx` extraction
so Add and Edit share one duplicate-spot warning implementation.
