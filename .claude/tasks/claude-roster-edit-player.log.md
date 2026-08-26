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

## T1 · Let staff edit a roster player from the row menu — done

Second run. The first run is the `blocked` entry above; this one followed the user
amending the task to permit one migration, which is what that entry said had to
happen before T1 could pass 5c.

**gate:** 5a mechanical — pass (`npm run lint` 0 errors / 38 warnings, all
pre-existing and none in the touched files; `npx tsc --noEmit` exit 0, no
stale-`.next/` re-run needed; `npm test` 93 passed — and re-run green after the
doc edits below). 5b `task-completion-reviewer` — `VERDICT: pass` on all six
criteria, having re-verified the original five rather than assuming they
survived the migration; it also ruled on two deliberate judgment calls
(silent-return instead of `raise` for an archived row; no re-issued
`grant execute`) and accepted both, and judged the second rewritten comment
in-bounds. 5c both guardrails ran, neither skipped:
`pipeline-guardrails-reviewer` (`src/components/dashboard/team/`) — explicitly
clear, having re-diffed the replaced function body character-for-character to
confirm `claimed_by_user_id` / `merged_into_id` / `program_id` are still
unreachable as write targets, and ruling the silent-success race a recoverable
UI-staleness bug rather than the silent-attribution class the doc guards;
`rls-boundary-reviewer` (new migration, new `program_players` queries) — **"the
original finding is now closed"**, no blocking findings, verified independently
against live `pg_proc` rather than the migration file.

**the blocking finding, and how it was closed:** `update_program_player` found
its row on `merged_into_id is null` alone, without `archived_at is null`. Being
`security definer` and granted to `authenticated`, it was callable directly from
any staff session, so the TypeScript pre-flight read in `roster-actions.ts` was a
guard a caller could skip. `docs/roster-edit-and-people-search.md` §1 Risks had
considered this and chosen the TypeScript-only mitigation on the premise it was
"reachable only from a stale dialog" — that premise was the false step. The user
permitted a migration scoped to exactly one change; `20260825120000` adds the
clause and nothing else (verified byte-for-byte against `20260822090700`: two
hunks, the clause and its comment).

**applied to the live database.** The user chose this explicitly, because
`supabase/migrations/` runs behind live and a file alone would have left the hole
open. Before: `md5(prosrc)` `4641cb438578687fe962d6a29fffdecd`, len 1581. After:
`7e787bb584f0bcc160263497a6c29fd6`, len 1744,
`prosrc like '%archived_at is null%'` true, `prosecdef` true, `proconfig`
`search_path=""`, ACL still `{postgres,authenticated,service_role}=X/postgres` —
so `create or replace` preserved the grant and the omitted re-grant was correct.
Rollback: the pre-migration definition was captured verbatim from
`pg_get_functiondef` before applying, and re-applying it restores the old body
(including the hole). It is a session scratchpad file, not committed — recapture
from `20260822090700_program_player_writes.sql:115-177`, which was confirmed
byte-identical to what was live.

**noted, not acted on:** the live migration ledger is four versions ahead of
`supabase/migrations/` — `20260824182016 enable_players_can_upload_by_default`,
`20260824211820 matches_bound_program_attribution`,
`20260824223337 enforce_member_upload_enabled`,
`20260825021649 set_member_upload_enabled_reports_no_row` are applied live with
no file in the repo. None touch this RPC. Out of scope here, worth its own task.

**changed:** an `Edit player` entry on the roster row menu gated on
`member.profileId !== null` (inside the pre-existing staff-only `canManage`
gate), opening a dialog seeded from a fresh `program_players` read rather than
the `RosterMember` prop — which matters because `program_roster_full` returns
`coalesce(pp.email, u.email)`, so seeding from props could have written a
claimed athlete's login address into the column the duplicate tripwire keys on.
`getProgramPlayerFields()` and `updateProgramPlayer()` in `roster-actions.ts`
pass all five RPC params explicitly against the full-row overwrite, re-read for
liveness before writing, and map a duplicate-email collision to a sentence
instead of the raw constraint string. `player-fields.tsx` extracts the field
vocabulary so Add and Edit share one duplicate-spot warning. Migration
`20260825120000` closes the archived-row write at the database. Two comments in
`roster-actions.ts` were rewritten because the migration made them false, and
`docs/roster-edit-and-people-search.md` plus its `docs/README.md` index row were
annotated as superseded on that one point — both guardrail reviewers flagged the
doc independently as asserting a security property that no longer holds, and
`docs/README.md`'s own convention requires a superseded header.
