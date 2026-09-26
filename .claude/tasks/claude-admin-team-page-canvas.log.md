# Run log — claude/admin-team-page-canvas

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add per-team pilot columns and admin pilot RPCs — done

**gate:** mechanical `GATE PASS` (typecheck first reported only `.next/` route-type
errors — stale output from the pre-detach base — which `check.sh` cleared and re-ran
clean automatically); completion review `VERDICT: pass`, all five criteria met.

**changed:** New `supabase/migrations/20260926075216_admin_program_pilot.sql` adds
`programs.pilot_ends_on / pilot_approved_by / pilot_approved_at / pilot_ended_at`,
rewrites `program_audit_log_action_check` to 25 values (every live action, including
the two `console.*` ones applied from the unmerged admin-uploads branch, plus
`pilot.end_changed` and `pilot.ended`), and adds `admin_set_pilot_end(uuid, date)` and
`admin_end_pilot(uuid)` — both `security definer`, `set search_path = ''`, gated on
`public.is_admin()`, revoked from `public`/`anon`, granted to `authenticated`, each
writing one audit row naming `auth.uid()`. `admin_end_pilot` writes only
`pilot_ended_at`, `pilot_ends_on` (never extending) and `updated_at`; it deliberately
leaves `programs.status` alone, because `programs_status_check` offers no value that
means "pilot over" and `programStatusFor()` would overwrite an invented one — reasoning
recorded in the migration header. Applied to the live DB via Supabase MCP
`apply_migration`; live verified (four columns, both functions' `prosecdef`/`proconfig`,
the 25-value constraint). Tests: `tests/admin-program-pilot-rpcs.spec.ts` (+ registered
in `tests/fixtures/live-db-specs.ts`).

Two deviations, both deliberate and recorded rather than papered over:

1. The `done when:` list named `tests/database/admin-program-pilot.test.mjs`. That
   harness does not exist on this branch — no `tests/database/`, no `test:database`
   script, no PGlite; it lives only on the unmerged admin-uploads branch. The `files:`
   line was marked "(guess)" and guessed wrong. The task's four assertions were written
   against this repo's real convention instead (`tests/admin-program-pilot-rpcs.spec.ts`,
   modelled on `tests/admin-program-rpcs.spec.ts`). The reviewer judged the substitution
   as satisfying the criterion.
2. The backfill is scoped to `org_type = 'college'`, narrower than the criterion's
   literal "active programs". An `rls-boundary-reviewer` finding caught that custom orgs
   are `active` with no claim and bill on the individual tier, and the one live active
   program (a `high_school` org) had been wrongly stamped. The guard was added to the
   repo file and that row's pilot fields nulled on live, so live now has zero piloted
   programs — an admin sets one explicitly.

**follow-ups:**

1. **The queue's own T2 and T3 criteria repeat the `tests/database/` mistake** — both
   name a `tests/database/*.test.mjs` file that cannot exist on this branch. Correct
   them to this repo's live-DB spec convention before those tasks run, or they will hit
   the same deviation. Author's call via `/task-add`; the runner cannot edit criteria.
2. Nothing server-side stops at pilot end: `reserve_processing_quota` checks only the
   monthly cap and `PILOT_ENDS_AT` is UI-only. Wire the gate into `reserveQuota()` /
   `explainVideoRefusal()` and the upload-url handler (refuse when
   `pilot_ended_at is not null or pilot_ends_on < current_date`), then retire
   `PILOT_ENDS_AT` from UI copy in favour of the per-program column.
3. The new `pilot_*` columns are anon-readable through `programs`' table-level SELECT
   grant plus its unconditional college policy. Column-level REVOKE cannot narrow a
   table-level GRANT, so fixing it means moving `programs`' public projection behind a
   view — a whole-table exposure change, out of scope here.
4. `admin-teams-server.ts` still derives `plan: 'pilot'` from `status = 'active'`; T4+
   should read `pilot_ends_on` / `pilot_ended_at` instead.
5. Provenance note: the migration was applied before the `org_type` guard was added, so
   the ledger's stored SQL for version `20260926075216` lacks that `where` clause. Net
   live state matches the repo file; only the recorded text differs. No corrective
   migration needed — but anyone diffing migration history against live should know.

## T2 · Add admin_update_program_details RPC — done

**gate:** mechanical `GATE PASS`; completion review `VERDICT: pass`, all four criteria met.

**changed:** New `supabase/migrations/20260926082507_admin_update_program_details.sql`
adds `admin_update_program_details(p_program_id uuid, p_patch jsonb)` — a new function
rather than a widened `update_program_settings`, because the live body covers only 8 of
the 12 columns, extra params would create a second PostgREST overload, its owner-only
gates are member semantics an admin does not share, and its null-means-keep convention
cannot clear a nullable field. Reasoning is in the header, as the criterion required.
`security definer`, `set search_path = ''`, `is_admin()` gate raising `42501`, revoked
from `public`/`anon`, granted to `authenticated`. Patch semantics: key present = write
(null clears a nullable column), key absent = keep, unknown key = `22023`; a 12-key
whitelist means no dynamic SQL. Enum-like inputs are validated against the live check
constraints (team, college fields, default_surface, time_zone via `is_iana_time_zone`,
upload_policy, events_policy). One audit row per successful call, action
`program.details_changed`, added to `program_audit_log_action_check` rebuilt from the
live 25-value definition → 26 values, every prior action preserved. Tests:
`tests/admin-program-details-rpc.spec.ts` (6 passed), registered in
`tests/fixtures/live-db-specs.ts`.

Applied to live as ledger version `20260926082507`, and — unlike T1 — the reviewer ran
BEFORE the apply, so the applied SQL is byte-identical to the committed file:
`sha256(statements[1])` = `shasum -a 256` of the repo file = `42a836a3…f63ad1`. Verified
independently, along with the function's `prosecdef`/`proconfig` and all 26 constraint
values.

One deviation, same as T1 and for the same reason: the criterion named
`tests/database/admin-program-details.test.mjs`, a PGlite harness that does not exist on
this branch. The four assertions were written against this repo's real live-DB spec
convention instead.

**follow-ups:**

1. **T3's criteria repeat the `tests/database/` mistake** (`tests/database/admin-member-roster-writes.test.mjs`).
   Two of three DB tasks have now had to substitute the harness. Worth correcting T3's
   criterion via `/task-add` before it runs — the runner cannot edit criteria.
2. `apply_migration` ignores a caller-supplied timestamp and stamps its own ledger
   version, so both T1 and T2 had to rename the file afterwards to match. Worth a line
   in `AGENTS.md`'s migration notes so later tasks expect it.
3. `primary_domain_inferred` is forced to `false` when an admin patches
   `primary_domain`; a future "re-infer" affordance would need its own path.
4. Regenerate the Supabase TypeScript types so `p_patch` is typed before T6 calls this
   RPC from a server action.

## T3 · Widen member-upload and add-player RPCs for admins — done

**gate:** mechanical `GATE PASS`; completion review `VERDICT: pass`, all five criteria met.

**changed:** New `supabase/migrations/20260926084422_admin_member_and_roster_writes.sql`
widens the authorisation clause of `set_member_upload_enabled(p_program_id, p_user_id,
p_enabled)` and `add_program_player(p_program_id, …)` to
`is_program_staff(p_program_id) or is_admin()`. Both keep `security definer` and
`set search_path = ''`, revoke from `public`/`anon`, grant to `authenticated`.
`add_program_player`'s audit row gains a `by_admin` key inside `details` — the action
stays `player.added`, so `program_audit_log_action_check` is untouched at 26 values and
no 27th value was invented. Tests: `tests/admin-member-roster-writes.spec.ts`
(5 passed), registered in `tests/fixtures/live-db-specs.ts`.

**The task's premise was wrong, and this reshaped the task.** T3 assumed both functions
inferred the program from the caller's workspace and needed an explicit `p_program_id`
added. Live `pg_get_function_arguments` shows both _already_ took `p_program_id` as their
first parameter, and both dashboard call sites already passed
`workspace.active.id`. So no signature moved and no caller changed — only the gate
widened. Criterion 3's "pass the program id if the signature changed" never fired, and
criterion 2 had no superseded overload to drop; instead the migration carries a `do $$`
guard that raises at apply time if either function ever has more than one overload.
Live confirms `overloads = 1` for both, so no ungated signature survives.

Cross-tenant closure (the blocking criterion) is real, not argued:
`is_program_staff(p_program_id)` resolves through `user_program_role` keyed on
`pm.program_id = p_program_id and pm.user_id = auth.uid()`, so a coach of program A
evaluating program B gets false, `is_admin()` is false for them, and the `42501` raise
stands. The spec proves it live — a coach of A is refused on B's id and B's row, roster
and audit rows are verified unchanged, while the same coach still succeeds on A.

Applied to live as ledger version `20260926084422`; reviewer ran before the apply, so the
applied SQL is byte-identical to the committed file (`sha256` `1dfa2ffd…5034f` on both
sides). Verified independently, along with both functions' args, `prosecdef`, `proconfig`,
ACL, overload count, and that each gates on the _passed_ id.

Same harness substitution as T1 and T2, third time, for the same verified reason.

**follow-ups:**

1. `set_member_upload_enabled` writes **no** audit row at all, so an admin flipping a
   member's upload switch leaves no trace — and T11 puts exactly that switch in the
   admin People card, where T19's Activity card is meant to show what admins did. Adding
   one needs a new action value or reuse of an existing `member.*` one.
2. **Three of three database tasks have now been dispatched with a corrected test-harness
   criterion.** No further DB tasks remain, so the cost stops here — but the same
   wrong-premise risk applies to the code tasks: T3's premise about these two RPCs was
   simply false, so later tasks may likewise assume work that is already done. Check the
   live/current state before building, as T4 onward are told to.
3. `is_admin()`, `is_program_staff()` and `user_program_role()` are anon-executable
   security-definer helpers. Harmless (they return false when `auth.uid()` is null) but a
   `revoke ... from anon` round would quiet the advisor lint.

## T4 · Extend getAdminTeam: details, pilot, uploads flag, conference, activity — done

**gate:** mechanical `GATE PASS`; completion review `VERDICT: pass`, all five criteria met.

**changed:** `src/lib/data/admin-team-server.ts` (+390). `PROGRAM_SELECT` and
`AdminTeamProgram` gain `programKey`, `city`, `state`, `staffPageUrl`, `rosterPublic`;
`homeVenue`, `defaultSurface`, `timeZone`, `uploadPolicy` and `eventsPolicy` were already
inherited from `TeamIdentity` and already selected, so nothing was added for them — the
reviewer accepted inheritance-plus-five as satisfying criterion 1. Four new shapes on
`AdminTeamData`: `pilot` (`AdminTeamPilot` — `endsOn`, `approvedAt`, `approvedByName`,
`approvedByIsViewer`, `endedAt`, read from T1's columns), `conference`
(`AdminTeamConference | null` — name, short mark, division, team count, on-Advantage
count, plus siblings with a `claimed` flag), `activity` (`AdminTeamActivityEntry[]` — 20
newest `program_audit_log` rows, `created_at desc, id desc` so rows sharing a timestamp
stay ordered, actor names batched over distinct ids), and `members` widened to
`AdminTeamMember[]` carrying `uploadEnabled` from `program_members.upload_enabled`.

`loadConferenceTeams` reused as the notes required. All three new readers were appended
to the loader's **existing** fan-out array (7 → 10 entries), verified by reading the
destructuring, so no second await round was introduced; the loader now issues one wave of
13–17 queries per render, up from 9–11. `PILOT_ENDS_AT` is not referenced in this file —
`grep -c` is 0, and it was already 0 before the change. No consumer needed updating: every
change is additive and `AdminTeamMember extends TeamMember`, confirmed by a clean
full-repo `tsc --noEmit`.

Two judgment calls recorded for the eventual PR reviewer rather than buried: `pilot` is
non-null with nullable fields (T15 reads as one card with varying text, not an absent
card), and `claimed` is `status in ('active','claim_pending')` copied verbatim from live
`admin_list_conferences()`'s `on_advantage` predicate so this page cannot disagree with
the Admin › Conferences column.

No test added. T4's criteria do not ask for one, there is no PGlite harness on this
branch, and every line is a column mapping or a query; the reviewer agreed. T5's pure
attribution helper is the first thing in this file that will earn a spec.

**follow-ups:**

1. `readConference` pays a duplicate `requireAdmin()` (two extra round trips per render)
   purely because `loadConferenceTeams` is a server action. The unguarded service-role
   read it actually wants is `readConferenceTeams`
   (`src/lib/data/admin-conferences-server.ts:173`), and `getAdminTeam`'s own
   `requireAdminOrNotFound()` is already the gate. The task's notes named the action
   explicitly, so this was followed rather than silently substituted — an author's call.
2. `AdminTeamActivityEntry` drops `details` and `subject_id`. Fine while T19 labels from
   `action` alone, but a label like "Removed X from the roster" needs `subject_id`
   resolved. Decide when T19 writes `admin-activity-labels.ts`.
3. `admin-teams-server.ts` still derives `plan: "pilot"` from `status === "active"`, and
   `team-page-header.tsx:53` reads that. So the Teams **list** badge and this page's Pilot
   card now disagree about what "on pilot" means. T15 covers the card; no current task
   covers the list badge.
4. Still nothing server-side stops at pilot end (T1 follow-up 2, now one line away):
   with `pilot_ends_on` and `pilot_ended_at` on the row, the gate in `reserveQuota()` /
   `explainVideoRefusal()` is cheap. Until it exists, "End pilot" ends only a label.

## T5 · Extend getAdminTeam: roster with match counts, schedule — done

**gate:** mechanical `GATE PASS`; completion review `VERDICT: pass`, all four criteria
met — but the reviewer attached a real finding that the criteria do not cover. See the
warning below; it must be settled before T13 ships.

**changed:** `AdminTeamData` gains `roster: AdminTeamRosterPlayer[]` and
`schedule: AdminTeamEvent[]`. New pure module `src/lib/data/admin-team-roster.ts` — zero
imports, so the spec needs no database and the client-bundle boundary stays clean —
exporting `rosterWithMatchCounts`, `rosterIdIndex` and `rosterMatchOwnerIds`.
`readRoster` reads `program_players` filtered `archived_at is null and merged_into_id is
null`, ordered by lineup spot with nulls last (name as tiebreak). `readSchedule` calls
`readScheduleWithClient(admin, programId)`; `ProgramSchedule` already supplied date,
opponent, site, kind and score, so only the result state was derived (`eventResult`,
reusing `dualScore` — the same function the program's own schedule page uses, so the
console cannot print a different score for a dual). New spec
`tests/admin-team-roster.spec.ts`, 12 tests, deliberately NOT registered in
`live-db-specs.ts` because it touches no database. Both readers joined the loader's
existing fan-out (10 → 12 entries); no second await round.

`my_player_ids()` and `program_roster_full` are unusable here: both gate on
`user_program_ids()` / `auth.uid()`, which is null under the service role, so they would
answer with an empty roster and no error. The same two-id-space rule is therefore computed
locally from data the page already holds.

**⚠ CROSS-PROGRAM MATCH LEAK — decide before T13.** The matches read
(`admin-team-server.ts:1027-1030`) has **no `program_id` filter and no row limit**. For a
_claimed_ player, `ownerIds` contains their auth uid, and that uid is the same
`player1_id` value on every match they own — so their personal matches, and matches from
any other program they belong to, are folded into THIS program's roster row. That inflates
`matchCount` and can surface an unrelated opponent as `lastMatch`. It is faithful to
criterion 2 as written ("matches whose `player1_id` equals EITHER … OR …" — no program
scope), which is why the gate passed, and the omission was deliberate: a claimed player's
pre-claim matches do not carry this program's id, so a naive `.eq("program_id")` would drop
exactly the rows the two-id-space fold exists to find. Both are true, which is the point —
the criterion under-specified the case. T13 consumes `matchCount` and `lastMatch` directly,
so whichever way this is resolved must land before that card renders. Options: scope to
`program_id = this program OR program_id is null`, scope to this program only and accept
losing pre-claim history, or keep the current behaviour and relabel the column so it does
not read as a team statistic.

**follow-ups:**

1. The leak above. Not a follow-up so much as a decision owed before T13.
2. The matches read has no upper bound — a long-history program pulls every row to count
   them. A grouped `SECURITY DEFINER` RPC with no membership gate would be the real fix,
   which is a deliberate decision rather than a refactor.
3. `AdminTeamRosterMatch.result` is raw `matches.result`. T13's card should route it
   through the existing `matchEndingFrom` / `endingMark` helpers the schedule surfaces
   already use, not a new switch in the component.
4. Only `player1_id` is counted, per the criterion. Doubles partners and matches where one
   of ours was player two are not attributed; `sideOf()` in `roster-ids.ts` is the existing
   rule if that is ever wanted.
5. `matches.opponent_player_id` exists on the live table and is read nowhere in this
   loader — a future "who did they play" column could resolve a real opponent profile
   instead of the `player2_name` string.
