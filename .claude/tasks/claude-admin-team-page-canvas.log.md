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

## T6 · Add admin details + pilot server actions with gate specs — done

**gate:** mechanical `GATE PASS`; completion review `VERDICT: pass`, all four criteria met.

**changed:** Three actions appended to `src/lib/services/programs/admin-team-actions.ts`,
each mirroring `adminSetProgramMemberRole`: `requireAdmin()` → `NOT_AUTHORIZED` when null
→ session (cookie) client → RPC → `toMessage` on error → `revalidatePath("/admin",
"layout")`. Verified by grep that **none** of the three touches `createAdminClient`, so
every audit row names the real admin.

- `adminUpdateProgramDetails({ programId, patch })` — a camelCase
  `AdminProgramDetailsPatch` plus a `DETAILS_COLUMNS` map converting it to T2's
  snake_case jsonb patch, preserving present-vs-absent: only own keys whose value is not
  `undefined` are sent, so `null` clears a nullable column and a missing key keeps it.
- `adminSetPilotEnd({ programId, endsOn })`
- `adminEndPilot(programId)` — the thin one; T1's RPC is already idempotent and clamps
  `pilot_ends_on` so it can only shorten.

**The date check is the part worth remembering.** Both refusals return before
`createClient()`, so the RPC cannot be reached. Malformed is an ISO regex plus a `Date.UTC`
round-trip, so `2026-02-30` is caught here rather than surfacing as a Postgres `22008`.
"Past" is `endsOn < today` as a **lexicographic string comparison** of two `YYYY-MM-DD`
values — zero-padded ISO dates sort in calendar order, so no `Date` is parsed and the
midnight-UTC trap (`new Date("2026-09-26") < new Date()` is true all day) never arises.
Strict `<` accepts today, matching the column's inclusive last-free-day meaning.

Validation of the patch itself is **deliberately not duplicated** — the trim, the `''`→null
collapse, the squad/surface/timezone/policy vocabularies and the "collegiate needs a squad"
rule all live in T2's RPC, whose `RAISE` messages surface through `toMessage`. The spec
proves that pass-through. The reviewer judged the delegation correct: one source of truth
rather than a second copy that can drift.

**The spec is a real negative proof.** `tests/admin-team-details-pilot-actions.spec.ts`
transpiles the actual actions module and runs it under `node:vm` with only `next/cache`,
`@/lib/supabase/server` and `./admin-guard` stubbed, then asserts the recorded `rpc()`
call list is **empty** for each action — not merely that an error came back. 8 tests, no
database, no network, and correctly **not** registered in `live-db-specs.ts`. It reuses
`tests/schedule-outcome-actions.spec.ts`'s pattern, so no `deps` parameter was needed and
the action signatures stay clean.

**follow-ups:**

1. `today` is UTC, not the program's `timeZone`. An admin west of UTC late in the evening
   cannot pick their local "today" and must pick the next day — which, for an inclusive
   last-free-day, grants one day more of pilot, never fewer. T15's date picker should use
   the same UTC bound the action computes, so the refusal string is a backstop rather
   than the first thing an admin meets.
2. `admin_set_pilot_end` always clears `pilot_ended_at`, so offering "set end date" on an
   already-ended pilot silently reopens it. T15 should either hide that control once
   ended or give the reopen its own confirmation copy.
3. Third recording of T1's open gap, now easier to hit: these actions make the pilot
   columns editable, but nothing server-side gates video submission on them, so an admin
   who ends a pilot today still sees uploads work. The gate belongs in `reserveQuota()` /
   `explainVideoRefusal()`.

## T7 · Add admin member-upload + add-player actions with gate specs — done

**gate:** mechanical `GATE PASS`; completion review `VERDICT: pass`, all four criteria met.

**changed:** Two actions appended to `admin-team-actions.ts`, same shape as T6's three:

- `adminSetMemberUploadEnabled({ programId, userId, enabled }): AdminTeamOutcome`
- `adminAddProgramPlayer({ programId, firstName, lastName, classYear?, lineupSpot?,
email? }): AddPlayerResult`

Both `requireAdmin()` first, both use the **session** client (verified by grep that
neither touches `createAdminClient`), both pass an explicit `p_program_id` — which is the
whole point, since an admin has no membership to infer a program from — and both place
`revalidatePath` after the error return, so a failed call revalidates nothing. The spec
asserts that last part too.

**`adminAddProgramPlayer` returns `AddPlayerResult`, not `AdminTeamOutcome`, on purpose.**
The dialog reads `result.profileId` and hands it to `inviteMember({ playerId })` when
"also invite" is ticked; `AdminTeamOutcome` carries no id, so returning it would have
forced a second result shape or a roster re-read to guess the row just written. Criterion 1
names no return type for these two (unlike T6's), and `AddPlayerResult`'s failure arm is
already `{ ok: false; error: string }`, so criterion 4 is unaffected. The type is imported
type-only rather than re-declared, so the admin and member actions cannot drift while the
dialog treats them as one prop.

**A correction to the task's own wording, worth knowing before T13 runs.** Criterion 3 says
the dialog "can take it as an action prop unchanged" — but `add-player-dialog.tsx` has **no
action prop today**; it imports `addProgramPlayer` directly at `:23`. The shapes are
compatible — its `submit()` builds exactly the five keys, so
`(input) => adminAddProgramPlayer({ programId, ...input })` binds cleanly — but **T13 has
to add the prop seam itself**, in an 847-line file shared with the dashboard roster. That
is more work than T13's wording implies. The reviewer agreed shape-compatibility is the
correct reading of criterion 3, since T7's `files:` deliberately excludes the dialog.

Spec `tests/admin-team-member-roster-actions.spec.ts` (6 tests) uses T6's `node:vm`
pattern: the real module transpiled, only `next/cache`, `@/lib/supabase/server` and
`./admin-guard` stubbed, asserting the recorded `rpc()` array is empty — a genuine
negative, not merely an error result. No database; correctly not in `live-db-specs.ts`.

**follow-ups:**

1. **`set_member_upload_enabled` still writes no audit row** (third recording). An admin
   flipping another program's per-member upload switch leaves no trace, and T11 puts that
   switch on the page while T19's Activity card is meant to show what admins did. The fix
   belongs in the **RPC**, not the action — adding it in the action would give the
   coach-facing path a different history for the same switch. A `member.upload_changed`
   row with `details.by_admin` would match `add_program_player`'s convention. The gap is
   documented in the action's doc comment so the next reader does not assume a trace.
2. The member-facing action special-cases `P0002` ("no membership row") with friendlier
   wording; the admin one passes the RPC's own raise text through. Fine, since that text
   is person-readable, but T11 may want the friendlier branch lifted.

## T8 · Collapse team sub-routes into one anchored page — done

**gate:** mechanical `GATE PASS` (including the full suite, which the implementer had not
run itself); completion review `VERDICT: pass`, all six criteria met.

**changed:** The five sub-route `page.tsx` files and `team-tabs.tsx` are deleted; nothing
under the route renders `ComingSoonPage`. `next.config.ts` gains
`ADMIN_TEAM_SECTION_SLUGS` and spreads five redirects to
`/admin/teams/:programId#<slug>`. `page.tsx` renders `TeamSectionPills` over a
`grid-cols-[minmax(0,1fr)_380px] gap-6 items-start` body with two `flex flex-col gap-6`
columns, sections driven by `team-sections.ts` (`people, requests, roster, schedule,
activity` main; `pilot, usage, conference, details` rail). The three existing cards mount
in their sections. `MAP.md` regenerated — 68 routes, sub-routes gone.

**The `#hash` redirect assumption is now settled, empirically.** It was the one unverified
premise in the whole plan. The bundled Next docs never mention fragments in `destination`,
so reading could not answer it; the implementer built the app, served it, and curled all
five paths, getting `307` with `location: /admin/teams/p1#people` and equivalents. The
spec asserts the **raw** `location` header, with an in-code comment explaining that a
parsed pathname would drop the exact part under test — an assertion that would otherwise
pass while proving nothing. Verified by reading it.

**`ViewPills` was not reused wholesale, and that was the right call.** It is a
`value`/`onChange` switcher whose contract is `<button aria-pressed>`; the canvas row is
in-page navigation whose contract is `<a aria-current="location">`. Merging them would
have meant a props union — two components under one name. Instead the visual rule was
extracted into `viewPillProps(isActive)` and both consume it, so the 26px geometry lives
in exactly one file. The note said "reuse it if it fits", a conditional; the reviewer
agreed the intent (no duplicated geometry) is satisfied.

**Empty sections render a real card** — `SettingsCard` with the section's true title and
one muted "Not built yet." line — so each pill lands on something named instead of
scrolling into nothing, without inventing a layout for cards T13–T19 have not designed.
Six centred `ComingSoon` blocks down one scroll would be the page apologising to itself.

Declared deviations: `scroll-mt-16` per section for the 44px sticky header (the canvas is
a static frame with no opinion on anchor offset); `activity` exists as a placeholder
though the canvas draws no Activity card, because the task places it in the main column;
and the pill border keeps the shipped `--border-hairline` over the canvas's
`--border-card` after verifying both resolve to `var(--ink-100)` in light and dark.

**follow-ups:**

1. **Nobody has viewed this page in a browser.** The build compiles, the redirects are
   proven at the HTTP layer, and the classes are right in the source — but the grid and
   the IntersectionObserver pill tracking are unverified by eye. T20 owns this, and it is
   now several tasks downstream of the change that introduced them; an earlier look would
   cost less than a late surprise.
2. `adminLoadProgramUsage` and `ProgramUsageCard`'s `load` prop now have **no caller** —
   the deleted `/usage` sub-route was the only one. T16 is scoped to that cleanup; the
   dangling doc reference at `program-usage-card.tsx:48` should go with it.
3. `page.tsx`'s `metadata = { title: "Overview" }` is a leftover tab name now that
   Overview is a pill rather than a route. A `generateMetadata` returning the school name
   would be more useful.
4. The pill row is not sticky. An anchor nav that scrolls out of view cannot show the
   reader where they are, which is half the point of the IntersectionObserver — but the
   canvas does not call for it, so it was left alone deliberately.

## T9 · Header: 64px crest upload and facts line — done

**gate:** mechanical `GATE PASS`; completion review `VERDICT: pass`, all four criteria met.

**changed:** `team-page-header.tsx` swaps the read-only 52px `ProgramCrest` for a new
client wrapper `team-crest-control.tsx` (needed because a Server Component cannot pass
`onError` down) rendering `CrestControl variant="header"` wired to
`adminUploadProgramCrest` / `adminRemoveProgramCrest`. The facts line becomes a
four-entry array — `Landmark` Division · Conference, `MapPin` City, ST, `Globe` primary
domain, `Calendar` Claimed Mon D — filtered on non-empty text, so a missing fact is
dropped rather than printed empty and an unclaimed program shows no claimed fact.
`program-crest.tsx` gained `64` in its size union.

**Criterion 1 was already satisfied on arrival** — `CrestControl`'s `upload`/`remove`
props with member-action defaults came from `9eba5415`, already merged; the Settings
caller passes neither and so uses them. Reported as such rather than redone. That is the
third task this queue has dispatched against a partly-stale premise.

**The shared component was modified, and I checked the blast radius rather than trusting
"byte-for-byte".** `crest-control.tsx` gained `variant?: "card" | "header"` (default
`"card"`) and hoisted the file input plus `ImageAdjustDialog` into a `machinery` fragment.
Verified: the Settings caller still passes the same four props; `machinery` is rendered by
**both** branches (defined `:103`, header `:151`, card `:217`), so Settings keeps its
upload and adjust flow. This shares rather than forks, which is what the notes required.

**Two judgment calls worth keeping.** The canvas asks for 18px/600 initials, but 18px is
off this repo's type scale and `check-design-drift.mjs` check 2 fails on it — so 16px
semibold, commented in place. And criterion 4's "every button comes from `advButton()`"
is satisfied vacuously: the header's only control is the 26px icon-only crest badge,
which the DS's own chrome rule says must carry `aria-label` + `ChromeTooltip` rather than
be an `advButton()`. The reviewer read the criterion as "no advButton-eligible button was
hand-rolled", which is right — the buttons that _would_ qualify belong to T10 and T22.

**follow-ups:**

1. **Home venue was dropped from the facts line**, on the grounds that the canvas omits it
   and T18's Details card will carry it. The reviewer flagged this as real information
   loss: an admin scanning the header no longer sees the venue, and that UX now silently
   depends on T18 landing. If T18 slips or changes shape, this regression ships alone.
2. The header crest badge is upload-only — `adminRemoveProgramCrest` is passed but only
   reachable through the card variant. If admins need to clear a crest from this page,
   the badge should become a small FloatMenu (Replace / Adjust / Remove) when one exists.
3. `--radius-float` (12px) is in the canvas token set but not in
   `src/styles/design-system/spacing.css`, where the same value is `--radius-dropdown`.
   Worth aliasing once so future canvas transcriptions do not each redo the mapping.
4. Still nobody has viewed this page in a browser (T8's follow-up 1). The header is now
   the second layer built on an unverified layout.

## T10 · Header: Edit details dialog and more-actions menu — done

**gate:** mechanical `GATE PASS`; completion review `VERDICT: pass`, all five criteria met.

**changed:** New `admin-team-details-dialog.tsx` — twelve fields matching
`AdminProgramDetailsPatch` exactly, reusing `SettingsField`, `advField("underline")` and
`SQUAD_OPTIONS`/`SURFACE_OPTIONS`; Save calls `adminUpdateProgramDetails`, renders a
`DialogProblem` inline on `{ ok: false }`, closes on success, and is
`advButton("primary","md")` disabled until something differs. Exported as
`{ program, open, onOpenChange }` so T18's Details card renders the same component.
New `team-header-actions.tsx` carries the `Edit details` button
(`advButton("outline","md")`) and the `⋯` `FloatMenu` with exactly three rows —
`Remove crest` (hidden, not disabled, when there is no crest), `Change conference`
(scrolls to `#conference`; T17 owns the control), `View in Teams list`.

**A third file beyond the task's guess, and it is justified.** `team-page-header.tsx` is
a Server Component — it imports `programSubtitle` from a `*-server.ts` module — so it
cannot hold the `useState`/`useTransition` the button, popover and dialog need. Splitting
the interactive controls into their own client component is the minimal fix; the header
gained only the import, `flex-1` on the text column, and the mount. The reviewer agreed
this is not creep.

**Only changed keys are sent, and the reason is concurrency, not tidiness.** A full
twelve-key patch would re-assert every column on every save, so a field another admin
edited while this dialog sat open would be silently clobbered — last-write-wins on data
the editor never saw. `changedPatch()` (exported, so a spec can hold the arithmetic
without rendering) assigns each key only when it differs. The matching subtlety: the
dialog re-seeds on the closed→open edge only, not on `program` prop change, because the
action revalidates the whole layout and re-seeding there would wipe an in-progress edit
whenever any other control on the page wrote something.

The RPC's validation vocabulary is **not** duplicated client-side — no trim, no `''`→null
collapse, no squad/surface/timezone/policy rules, no "collegiate needs a squad". Time zone
is free text with a hint, because `is_iana_time_zone()` owns that vocabulary and the repo
has no list to reuse. The policy ladders come from `UPLOAD_POLICIES`/`EVENTS_POLICIES` +
`uploadPolicyLabel()` in `src/lib/workspace/types.ts`, since `team-policies-card.tsx`
exports no option arrays — the defining module rather than retyped labels.

`View in Teams list` is a plain `/admin/teams` link: the list reads `view`, `sort`,
`after`, `division`, `conference`, `state` and has **no** highlight parameter, so a
row-targeting param would be a promise the list does not keep. Verified before linking.

**follow-ups:**

1. `changedPatch()` is exported specifically to be testable and has **no spec**. An offline
   spec would be cheap and would pin the one piece of real arithmetic in this dialog —
   including the clobber-avoidance behaviour, which is otherwise invisible.
2. The canvas also draws a primary `Upload for this team` button between `Edit details`
   and the `⋯`. `TeamHeaderActions` has the slot; T22 fills it once admin-uploads lands.
3. No eyes-on: the dialog has never been opened in a browser against a real program. The
   header now has three interactive controls that nothing has exercised.

## T11 · People card: transfer label, Uploads on switch, invited rows — done

**gate:** mechanical `GATE PASS`; completion review `VERDICT: pass`, all five criteria met.

**changed:** `Make owner` → `Transfer ownership` (grep count 0 for the old string). Each
non-owner row gains an `AdvSwitch` labelled `Uploads on` bound to `member.uploadEnabled`,
calling `adminSetMemberUploadEnabled`. Pending invites now render in this card with the
canvas's meta line, an `Invited` pill and `Resend` / `Revoke`, reusing
`roster-vocabulary.tsx`'s labels and the Requests card's guard rationale rather than
reinventing them. Empty state is a text line on the card's hairline.

**The switch uses `useOptimistic`, not a `useState` copy** — and that distinction is the
whole of criterion 2. Every action here calls `revalidatePath`, so a `useState` copy
seeded once from the prop would fight the server value on every write. The override is
dispatched inside the transition, holds through the refresh, and is dropped when the
transition settles; on failure nothing was written, so dropping it _is_ the revert, with
the message in `AdminCardProblem`.

**It fixed a seat re-derivation that was already shipped.** The card computed
`total = Math.max(seats.seats, seats.used + seats.pending)`, which inflates the
denominator whenever used+pending exceeds the sold seat count — so this page would print
a different capacity than `program_seat_usage` and than Settings › Teams. That is exactly
what the note's "print the loader's figure, never re-derive it" was guarding against, and
the reviewer judged replacing it required by criterion 1 rather than scope creep. Now
prints `seats.seats`.

**Two files outside the `files:` guess, and criterion 3 was unbuildable without them.**
`TeamInvite` carries neither `expires_at` nor the inviter's name, so the meta line the
criterion specifies could not be built. The loader gained
`AdminTeamInvite extends TeamInvite { expiresAt; invitedByName }` with an `inviter:users`
join, and `page.tsx` passes `invites={data.invites}`. Additive: `AdminRequestsCard` still
takes `readonly TeamInvite[]` and has **no diff** — the overlap is T12's to resolve, as
the note intended.

**A canvas deviation taken deliberately.** The canvas puts `Transfer ownership` on the
owner's row; the code puts it on each coach/staff row — the rows that can _receive_
ownership, since the dialog takes a target. The label was renamed as criterion 1 asks but
the control was not moved, because the canvas placement would need a recipient picker no
task specifies. Consequence the reviewer flagged: a coach/staff row now shows both
`Transfer ownership` and `Uploads on` together, which the canvas never depicts. T20's
fidelity pass will meet this.

**follow-ups:**

1. **Expired invites now render as `Invited`.** `readSeatUsage` filters invites on
   `expires_at > now()` but `AdminTeamData.invites` does not, so an expired invitation
   shows with `expires <past date>` and an `Invited` pill while holding no seat. The
   asymmetry is pre-existing and documented in the loader — this task's meta line just
   made it visible for the first time. An `Expired` pill variant would read better than
   silently mislabelling it.
2. **The `Uploads on` switch is silent.** `set_member_upload_enabled` writes no
   `program_audit_log` row, so T19's Activity card will never show an admin flipping it.
   No audit write was added from the action or the component, deliberately — it belongs
   in the RPC, where both the admin and coach paths would get one entry. This is the
   fourth recording of this gap and the affordance now exists on the page.
3. `AdminRequestsCard` can drop to join requests only and be retitled once T12 lands; its
   `roster-vocabulary` imports would then shrink to nothing.

## T12 · Requests card: Decline / Send invite and claim note strip — done

**gate:** mechanical `GATE PASS`; completion review `VERDICT: pass`, all four criteria met.

**changed:** Card is now `Requests` with an `<n> open` count (suppressed rather than
printing `0 open`); `Invites & requests`, `Dismiss` and bare `Invite` are gone (grep 0),
and the invite rows are deleted — resolving the overlap T11 deliberately left. Request
rows read `<Name> asked to join as a <role> · <Mon D>` with the quoted note and email,
`Decline` → `adminResolveJoinRequest(id, "dismiss")` and `Send invite` → `(id, "invite")`.
Dropping the `invites` and `programId` props forced `page.tsx` to change, and a loader doc
comment that named `AdminRequestsCard` as an `AdminTeamInvite` consumer was reworded
rather than left false.

**It researched the claim taxonomy instead of guessing it.** The notes warned against
reusing the canvas sentence for every case. It queried live `program_claims`, read
`complete_program_claim` and `domain-match.ts`, and found `skips_manual_review` false on
every row plus a header stating those fields stopped routing anything — so the real
discriminator is `contactMatched` → `reviewedBy`, not `skipsManualReview`. Four sentences:
the canvas's verbatim for a staff-list match; "approved by an admin … after review" for a
reviewer; a domain sentence that says outright the domain is "recorded evidence and not an
approval on its own"; and, for a claim whose reviewer row was nulled by a deleted account,
"Nothing on the record says who approved it." That fourth case is reachable and has no
honest attribution, so it says so rather than inventing one.

Role handling is honest too: `program_requests.role` is null on 7 of 10 live rows and
`other` on one, so the clause is dropped for both rather than rendering "as a other".

**follow-ups:**

1. **`Send invite` invites the wrong role — a real bug, now visible.**
   `adminResolveJoinRequest` hardcodes `role: "player"`
   (`admin-team-actions.ts:568`) and its select at `:550` does not even fetch the
   request's `role`. I verified both lines directly. It is pre-existing, but T12 puts
   `asked to join as a coach` immediately beside a `Send invite` button that will invite
   that person as a player. Before this task the card said only "Asked to join", so the
   mismatch was invisible; now it is on screen and still wrong. Nobody would notice until
   someone held the wrong permissions. **This is the most actionable finding in the queue
   so far and does not belong to any task.**
2. **The claim strip renders on nothing today.** I confirmed live: zero `approved` claims
   (6 rejected, 4 objected), and nothing in the codebase emits the `settle` event, so
   `status = 'approved'` is currently unreachable. The strip is correct code conditioned
   on a state the pipeline cannot reach — worth deciding whether the objection window is
   meant to settle on a cron or on read.
3. `AdminTeamClaim.reviewedBy` is a bare user id, so the admin sentence cannot name the
   reviewer. `getAdminTeam` could add the same `users` join `AdminTeamInvite.invitedByName`
   already uses, which would let that sentence match the canvas's register.
4. `voucherNote` and `claimantMessage` are carried on `AdminTeamClaim` and used by the
   Requests drawer but shown nowhere on this page. A vouched claim may deserve a line.

## T13 · Roster card: table and Add player — done

**gate:** mechanical `GATE PASS`; completion review `VERDICT: pass`, all five criteria met.
The largest task so far — 12 files.

**changed:** New `admin-roster-card.tsx` + `admin-roster-table-layout.ts` fill the `#roster`
section: title, `<n> players · <m> have accounts`, `Add player`, and the six columns
(`# · Player · Class · Account · Matches · Last match`) rendered **from** the constants
array so the header order cannot drift from the grid tracks. Empty roster gets a real row
with copy and the `Add player` affordance — no `null`, no zeroed table.

**The task said "an action prop"; the dialog needed three.** It imports `addProgramPlayer`,
`restoreProgramPlayer` and `inviteMember`, and only the first two have admin equivalents —
there is no `adminRestoreProgramPlayer`. Rather than mount a Restore button that would
answer with a message about the caller's workspace, `restore` is typed nullable and the
dialog suppresses the **whole** offer (note and button) when null. The admin sees the add
path and nothing that cannot work. Re-enabling costs one wrapper plus a prop. Dashboard
parity verified directly: `roster-header-buttons.tsx` passes `MEMBER_ACTIONS` holding the
same three functions the dialog previously imported, so its behaviour is unchanged.

**It checked the task's own suggestion and rejected it, correctly.** The note said to route
`lastMatch.result` through `matchEndingFrom`/`endingMark`. Live query shows
`matches.result` currently holds **four incompatible spellings** — `"Scott Watson Wins"`
(18 rows), `"win"`, `""`, and the score flow's `Final Score`/`Retired`/`Unfinished` — so
neither helper can yield won/lost. The outcome now comes from the score via
`matchOutcome()`, the same authority the dashboard's own last-match cell uses, with `score`
added to the projection and a derived `won: boolean | null`. `won === null` draws an
en-dash rather than claiming an outcome nobody recorded.

**The open scoping decision was respected.** Match counts are displayed exactly as T5's
loader returns them; the card's docstring points at the loader's comment instead of putting
a second answer on the page. `matchCount === 0` renders a mark, not `0` — a coach-made
profile has not played nothing, it has not been uploaded.

**Two specs were modified, and I checked the riskier one myself** rather than trusting the
report, since editing a test to accommodate a change is how a regression hides. In
`add-player-restore-retry.spec.ts` the original `formerPlayerMatch(...) ?? (restoreTarget
…)` expression is **still pinned** — only the `const restorable =` prefix moved, because
the expression now nests under the gate — and a **second** assertion pins the new
`actions.restore === null ? null :` gate. Additive coverage, not a loosened check.

Three declared canvas deviations, each commented in source: no row hover wash (rows are
inert, and Data Table law 5 ties the wash to row actions), `EmptyMark` rather than the
canvas's centred `—`, and a bare opponent name matching the dashboard's cell.

**follow-ups:**

1. **`adminRestoreProgramPlayer` is the one thing standing between the console and a
   complete Add player dialog.** A thin wrapper over `restore_program_player` plus an admin
   `former`-players read would light the offer back up with no dialog change — pass a
   function instead of `null`.
2. **`matches.result` is four incompatible spellings in one text column.** Worth a
   normalising migration; until then every new reader has to rediscover that the outcome
   lives in the score. The comment on `AdminRosterMatchRow.result` is the warning sign.
3. Match-count scoping is still undecided and now **on screen**. Either scope the loader or
   say so in the column — but not both in different places.
4. No roster drawer: rows are inert by design. If an admin ever needs a per-player view
   here, the hover wash and the peek drawer arrive together.

## T14 · Schedule & results card — done

**gate:** mechanical `GATE PASS`; completion review `VERDICT: pass`, all four criteria met.
(The reviewer's report quoted the card as wired through `column(TEAM_RAIL_SECTIONS)`,
which would have crushed a five-column table into the 380px rail. Checked directly: it
conflated the card lookup at `page.tsx:90` with the column call at `:108`. `schedule` is
in `TEAM_MAIN_SECTIONS`; the layout is correct.)

**changed:** New `admin-schedule-card.tsx` + `admin-schedule-table-layout.ts` fill the
`#schedule` section — `Date · Event · Type · Score · Result`, header rendered from the
constants array so labels cannot drift from the grid tracks. Empty schedule keeps the
column labels and adds one honest line, with no action beside it, because the console
cannot add an event to another program's season.

**The criterion named three renderings; the loader emits six states.** That gap was the
real substance of the task, and each was given an honest rendering rather than collapsed:

- `level` keeps its score — a tied dual **is** decided, so `Awaiting results` would throw
  a real result away.
- `played` gets its own mark, "No team result — a tournament has no team score". Calling
  it awaiting would send an admin hunting a number that cannot exist.
- `playing` reads `In progress` with `—`, and deliberately invents **no** running score:
  the loader withholds `teamScore` until every line is in, and this card is not given the
  entries to compute one. A number here would disagree with the program's own schedule
  page for the same event.
- `scheduled` splits on the date — and on **`endsOn`, not `startsOn`**, so a multi-day
  tournament is not told its results are late on its second morning. That one would have
  been wrong by default.

`neutral` reads `vs`, since `at` would claim the program travelled to the opponent's
courts; a tournament prints its name bare with a tournament glyph, because
`AdminTeamEvent.name` is the tournament's own name and "vs Ivy Invitational" would read
as a team.

**No second sort was added.** `readScheduleWithClient` already orders `starts_on`
descending (`schedule-server.ts:189`), verified directly. Adding one here would be a
second ordering to keep in step with the program's own schedule page reading the same
functions.

Declared deviations, noted in-file: the canvas's "Enter results for this team" header link
is absent (T22 owns it once `adminUploadHref` exists); no row hover wash, since the card
is read-only and Data Table law 5 ties the wash to a row action; and undecided words render
at 11px `ink-500` where the canvas draws 12px `ink-600` — the design-system law taken over
the canvas, with geometry left to the canvas.

**follow-ups:**

1. **A running dual score exists but is not plumbed.** `AdminTeamEvent` carries
   `playedCount`/`entryCount` but not the entries, so a `playing` row shows `—` where the
   program's own Schedule page shows a live score. Matching it is a loader change
   (carry `dualScore(entries)` through as `runningScore`), not a card one.
2. T22 should add the canvas's header link into `SettingsCardTitle`'s trailing slot, which
   currently holds only the meta line.
3. `entryCount`/`playedCount` are unused by this card — the data is already on the prop if
   a later round wants the Schedule page's `Lines n / 9` column back.

## T15 · Pilot card: canvas layout, Change end date, End pilot — done

**gate:** mechanical `GATE PASS`; completion review `VERDICT: pass`, all five criteria met.

**changed:** `pilot-usage-card.tsx` rewritten (118 → 434 lines). Title `Pilot`, sub-line
`Through <Mon D, YYYY>` from `pilot.endsOn`; no `PILOT_ENDS_AT`/`formatPilotEnd` import and
no `Analysis hours` (both verified by grep). The month readout, bar, hours-left and the
four kv rows, with `Each member` derived from `getMonthlyCapSeconds("individual")` rather
than a literal. `Change end date` is `DateField` in a popover calling `adminSetPilotEnd`;
`End pilot` is `ConfirmDialog` calling `adminEndPilot`; both surface `{ ok: false }`.
`page.tsx` passes `programId`, `programName` and `pilot`.

**This was the task most likely to ship a lie, and it did not.** T1's migration header
records that `admin_end_pilot` writes two columns, never touches `programs.status`, and
that **nothing server-side gates on the pilot columns** — so the obvious confirm copy
("they will no longer be able to upload video") would have been false. What it says
instead: the team keeps its matches, members and monthly pool; "Nothing the team can do
today changes"; and outright, "Ending a pilot is a **record, not a gate** — video is still
limited only by that monthly pool." Every clause traces to the header. The dialog reads
undersized on purpose, because that is the feature's real state.

**The reopen case, which no criterion covers.** `admin_set_pilot_end` clears
`pilot_ended_at`, so saving a date on an ended pilot restarts it. `End pilot` hides when
ended (criterion 5) but `Change end date` stays, and the popover discloses before the press
— "This pilot was ended by hand. Saving a date starts it again." — rather than adding a
second confirm for a reversible act.

**A declared deviation on criterion 4, and the reviewer flagged the literal mismatch.**
The criterion asks for an `advButton("danger")` confirm; `ConfirmDialog` owns its footer
and renders `tone="danger"` as `danger-solid`, per the DS rule that `danger` proposes and
`danger-solid` is the confirmed destruction. So `danger` sits on the card's trigger and the
dialog commits in solid, rather than hand-rolling a button inside the shared shell. Both
the implementer and the reviewer judged this the intent; a reader applying the criterion's
literal text would need to accept that reading.

Extra states rendered rather than left blank: ran out on its own → `<date> · Ran out`
(the header's own word); no end date → `No end date set` and `—`; missing approver → `—`.

The date picker's lower bound is `utcToday()`, byte-identical to the `today` T6's action
compares against, so the refusal string is the backstop T6 asked for rather than the first
thing an admin meets.

**follow-ups:**

1. **The real one, third recording:** `reserveQuota()` / `explainVideoRefusal()` and
   `/api/splitstep/upload-url` still ignore `pilot_ended_at` / `pilot_ends_on`. Until they
   read them, this confirm has to keep saying video does not stop — and when the gate
   lands, the dialog's second paragraph is the thing to rewrite.
2. **`approve-pilot-popover` promises a _global_ end date** at the moment an admin starts a
   _per-program_ pilot. It and this card will disagree the first time anyone moves a date.
   That sharpens the standing "on pilot means two things" item: it is now three surfaces.
3. There is **no `pilot.ended` / `pilot.end_changed` label** in the activity vocabulary yet,
   so those rows would surface unlabelled in T19's card. T19 should add them.
4. A `Kv`-style fact row is now hand-written in three admin files. Worth one exported
   primitive before a fourth appears — T17 and T18 are both about to want it.

## T16 · Usage-in-month rail card — done

**gate:** mechanical GATE PASS · completion VERDICT: pass

**changed:** New server component `src/components/admin/admin-usage-card.tsx` fills the `#usage` rail slot: `Usage in <month>` with a summed `<n> videos` count, one row per member (avatar, name, `<x> h`), and an empty-state line with no usage. Canvas footer "Players use their own 2 h before the team pool" is false for every org type (`quota.ts`: every team-workspace upload files under the program ledger; a member's own 2 h covers personal uploads only), so `poolRuleNote()` prints corrected copy by `quotaTierFor()` with `<cap>` from `getMonthlyCapSeconds("individual")`; the `<x> of <cap> h` row form is unreachable and never rendered. Removed orphaned `usageByMonth`, `adminLoadProgramUsage` and `ProgramUsageCard`'s `load` prop (its only caller, Settings › Usage, never passed it). Offline spec `tests/admin-usage-card.spec.ts`.

**follow-ups:**

1. The Pilot card's "Each member 2 h every month" row (`pilot-usage-card.tsx:147`) invites the same false reading — reword to "Personal uploads" or drop.
2. "Videos" sums distinct matches per member; a match analysed by two members counts twice — the loader could return an exact distinct count.
3. `plan.md` §7 still quotes the canvas footer as copy to verify; note the outcome there.

## T17 · Conference rail card with Change and sibling teams — done

**gate:** mechanical GATE PASS · completion VERDICT: pass

**changed:** New client component `src/components/admin/admin-conference-card.tsx` fills the `#conference` rail slot: `ConferenceMark`, name, `<Division> · <n> teams · <m> on Advantage` (n = whole conference incl. this program; m = `active` + `claim_pending`, the Admin › Conferences rule), up to 3 sibling teams linking to `/admin/teams/<id>` with a grey `StatePill` (Unclaimed / Claimed / Claim pending) and `N more · View conference` past the cap. `Change` (or `Set conference` under `No conference yet`) is a `MenuSelect` over `conferenceOptionsFor()` loaded server-side in `page.tsx`; picking resolves the label via a new admin-gated `conferenceIdForLabel()` in `admin-conference-actions.ts` (outside `files:` — options are labels, `addTeamToConference` takes an id), then calls `addTeamToConference`; either `{ ok: false }` shows in `DialogProblem`. Offline spec `tests/admin-conference-card.spec.ts`.

**follow-ups:**

1. Have `conferenceOptionsFor` return ids (or add a move-by-label action) to drop the extra lookup round trip.
2. The menu loses the checkmark on the current conference because the trigger reads "Change" — a trigger-label option on `MenuSelect` would restore it.
3. No action exists to remove a team from its conference (set to none).

## T18 · Details rail card — blocked

**gate:** mechanical GATE PASS · completion VERDICT: needs-work

**reason:** Staff page link safety. `hostnameOf()` in the new `admin-details-card.tsx` accepts any `<scheme>://` value, so an admin-entered `staff_page_url` of `javascript://alert(1)` renders as `<a href="javascript://alert(1)">` — a clickable script link — instead of plain text. The T10 dialog does no URL validation, so the value is reachable. Fix: only link when the scheme is `http:`/`https:`, plain text otherwise, plus a spec case. All other criteria met (row order matches the canvas; policy rows via `uploadPolicyLabel()`; local IANA→label map accepted since the dialog's Time zone is free text; `—` for null key/URL; `Edit` opens `AdminTeamDetailsDialog`).

**stash:** 7643fbfd6472a09791375da25c4f5c391d4124ad (`admin-details-card.tsx`, `tests/admin-details-card.spec.ts`, `page.tsx` wire-up)

**follow-ups:**

1. `team-page-header.tsx:40` says Home venue is omitted from the header because "the Details card below already prints" it — it does not (not in T18's rows). Either add a Home venue row or fix the comment (standing decision 6).
2. The offline vm harness has no `URL` global, which is why the card used a regex — worth adding `URL` to `tests/fixtures/vm-modules.ts`.

## T19 · Activity log card — done

**gate:** mechanical GATE PASS · completion VERDICT: pass

**changed:** New `src/components/admin/admin-activity-card.tsx` fills the `#activity` main-column slot: `Activity log`, rows of sentence label · actor (`—` when null) · `shortDate()`, in the loader's `created_at desc, id desc` order, with an empty-state line. New `admin-activity-labels.ts` maps all 26 live `program_audit_log_action_check` actions (read via `pg_get_constraintdef` 2026-09-26) and falls back to the raw string. The two `console.*` actions are labelled as admin-console events ("Result entered from the admin console", "Analysis attached from the admin console") — the first pass called them Advantage Intelligence events, corrected before the gate after tracing their only writer (`persist_admin_upload_submissions`, `details.origin = 'admin_console'`). Offline spec `tests/admin-activity-card.spec.ts` checks every action has a label.

**follow-ups:**

1. The loader deliberately omits `program_audit_log.details`; richer lines ("role changed from coach to staff") need a loader change first.
2. Nothing keeps the label map in step with the constraint — a new audit action shows its raw string until someone adds a label.

## T18 · Details rail card — done

**gate:** mechanical GATE PASS · completion VERDICT: pass

**changed:** Restored the blocked work from stash 7643fbfd at the user's request and fixed the link-safety finding: `hostnameOf()` in `admin-details-card.tsx` now matches only `^https?://` (case-insensitive, trimmed), so `javascript:`/`data:` and bare-domain values print as plain text, never a link; spec case added in `tests/admin-details-card.spec.ts`. The rest is as logged under the blocked entry: `Details` card with the six canvas rows in order, policy rows via `uploadPolicyLabel()`, a local IANA→label map for Time zone (the dialog's field is free text), `—` for a null key or URL, and `Edit` opening `AdminTeamDetailsDialog`.

**follow-ups:**

1. Home venue shows nowhere on the page: `team-page-header.tsx:40` says the Details card prints it, but T18's rows do not include it (standing decision 6).
2. The T10 dialog accepts any string as the staff page URL — validating to `http(s)` at write time would stop bad values at the source.

## T20 · Fidelity pass against the canvas at 1440 — blocked

**gate:** mechanical GATE PASS · completion VERDICT: needs-work

**reason:** Criterion 2 — `fidelity.md` has 52 rows (30 match, 9 fixed-in-this-diff each backed by a hunk, 10 deliberate deviations) but 3 rows are left as "unfixed mismatch": (1) at scroll 0 the section pills highlight `People`, not `Overview` — needs a scroll-listener fix, not a constant; (2) card titles are 13px vs the canvas 14px, hard-coded in the shared `SettingsCardTitle` every Settings card uses; (3) People/Requests rows are one line (47px, 22px avatar) vs the canvas two-line 52px — `AdminPersonRow` follows the DS Settings person row, a restructure. Each needs a decision (fix, or record as a deliberate deviation) before T20 can pass. Criteria 1, 3, 4 met; all six flows exercised on ZZ Test Program with their audit actions; ZZ state restored and verified by SQL (crest/city/state/conference/pilot columns null, 0 members, 0 invites); both throwaway admin users deleted (0 `t20%@example.com` rows). Fixes in the stash: header→pills gap and h1 row gap, card padding to canvas on all nine cards, Pilot kv row height and button widths, conference mark 40px radius 6→8 (also affects the conference drawer's mark).

**stash:** c2125259d6513d2d62b1dde6bdc63eae0a5a8f4d (`fidelity.md` + class fixes across 10 `src/components/admin/*` files)

**follow-ups:**

1. Crest upload/remove (`set_program_crest`), invite revoke (`revoke_program_invite`) and the uploads toggle write no audit row, though an `invite.revoked` label exists.
2. The Pilot card shows `End pilot` and "No end date set" on a program that never had a pilot.
3. Schedule rows and the Pilot pill don't render on ZZ (no events, unclaimed); their fidelity rows were checked from source constants, not measured.
4. The harness script names `t20-harness.mjs`/`t20-flows.mjs` remain in the worktree's `info/exclude` (files deleted).
