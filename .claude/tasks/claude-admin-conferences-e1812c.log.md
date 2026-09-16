# Run log — claude/admin-conferences-e1812c

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Migration: conferences table, programs.conference_id, backfill, sync triggers — blocked

**gate:** mechanical: pass · completion: needs-work
**failed stage:** completion review. Criterion 4 requires `count(*) from conferences` = 137; live it is 138.
**reason:** the extra row is `Owner Conference` (0 programs, created 07:35:49, after the migration at 07:31:29). The gate's `npm test` ran the live `tests/teams-management.spec.ts`, which sets `p_conference: "Owner Conference"` on a throwaway college program. T1's `programs_sync_conference` trigger created a conferences row for it (create-if-missing for colleges, by design), and the spec's cleanup deletes the program but not the conference. So every live test run can leave conference rows behind. The other four criteria were judged met, including two justified deviations: `conferences_label_key` is `unique (label)`, not `lower(label)`, because live data has both `Ivy League (IVY)` and `Ivy League (Ivy)`; and the name-collision fallback demotes only the losing variant.
**live DB state:** the migration IS applied live (schema_migrations version 20260916073129, `conferences_table`). Backfill verified: 137 migration rows, 2 null `conference_id`, 0 mirror mismatches, conference text md5 unchanged. The orphan `Owner Conference` row was NOT deleted; that is a live-data write left for the author.
**stash:** b82355e52895acee020d20ca9b3422f0e21921f5 (the migration file; it matches what was applied live)
**to unblock (author's call):** decide how test-fixture conferences are cleaned up — e.g. `teams-management.spec.ts` cleanup deletes conference rows it caused, or the trigger stops auto-creating — then delete the orphan row, restore the stash, and reset T1 to `todo`. Criterion 4's "137" holds only while no fixture rows exist.
**follow-ups:**

1. Merge `Ivy League (Ivy)` into `Ivy League (IVY)` once T2/T9 land, then tighten `conferences_label_key` to `lower(label)`.
2. Rename `Northern Sun Intercollegiate Conference  (NSIC)` (double space) to name + `NSIC` via the admin UI.
3. `programs` has no `updated_at` touch trigger; separate task if audit needs it.

## T1 · Migration: conferences table, programs.conference_id, backfill, sync triggers — done

**gate:** mechanical: pass · completion: pass
**changed:** Unblocked by the author choosing to fix the test. `tests/teams-management.spec.ts` now names its owner conference per run (`Owner Conference ${MARK}`) and `afterAll` deletes the conferences row that T1's create-if-missing trigger mints for it. The orphan `Owner Conference` row (0 programs) was deleted live. Stash b82355e5 was restored and dropped. The migration file `supabase/migrations/20260915100000_conferences_table.sql` (already live as schema_migrations 20260916073129) is committed unchanged. After a gate run with the live spec executing: 137 conferences, 0 fixture rows, 2 null `conference_id`, 0 mirror mismatches. Deviations accepted by review: `conferences_label_key` is `unique (label)` (live data holds both `Ivy League (IVY)` and `Ivy League (Ivy)`), and the name-collision fallback demotes only the losing variant.
**follow-ups:**

1. Any other live spec that writes a new college conference name must clean up its conferences row the same way.
2. Merge `Ivy League (Ivy)` into `Ivy League (IVY)` once T2/T9 land, then tighten `conferences_label_key` to `lower(label)`.
3. Rename `Northern Sun Intercollegiate Conference  (NSIC)` (double space) to name + `NSIC` via the admin UI.
4. `programs` has no `updated_at` touch trigger; separate task if audit needs it.

## T2 · Migration: admin conference RPCs + audit action — done

**gate:** mechanical: pass · completion: pass
**changed:** New `supabase/migrations/20260915100100_admin_conference_rpcs.sql`, applied live as `admin_conference_rpcs`. It re-creates `program_audit_log_action_check` from the live 18-action list plus `program.conference_changed`, and adds `admin_upsert_conference`, `admin_merge_conferences`, `admin_delete_conference`, `admin_set_program_conference` and `admin_list_conferences`. All five are security definer with `search_path = ''`, open with the `is_admin()` 42501 gate, and grant execute to `authenticated` only. Verified live: `admin_list_conferences()` as admin returns 137 rows summing to 1940 teams; a non-admin gets 42501 on all five. A rolled-back probe covered upsert, set, no-op, delete refusal with the P0001 message, merge, rename mirroring and detach. Extra validation beyond the spec: short name, website, unknown ids, self-merge. Nothing left live (137 conferences, 0 `program.conference_changed` rows). The executor also deleted one pre-existing orphan `Owner Conference` (0 programs, created by a test run in the main checkout, where the teams-management spec still hard-codes that name) through `admin_delete_conference`.
**follow-ups:**

1. T3's spec should count `program_audit_log` rows with the service-role client; RLS hides them from `authenticated`.
2. The main checkout's `tests/teams-management.spec.ts` recreates the `Owner Conference` orphan on every live run until this branch merges; merge soon or cherry-pick the `MARK` fix.
3. Merge `Ivy League (Ivy)` into `Ivy League (IVY)` once T9 ships, then tighten `conferences_label_key` to `lower(label)`.

## T3 · Live spec: conference RPC gates + sync invariant — blocked

**gate:** mechanical: fail · completion: not run
**failed stage:** mechanical (`npm test`).
**reason:** Supabase auth rate limit, not the spec's own assertions. The new `tests/admin-conferences-rpcs.spec.ts` passes alone against the live DB (8 passed), skips cleanly with env blanked (8 skipped), and left no live residue (137 conferences, nothing carrying its mark). In the full suite, other live specs fail inside `createLogins` with `signIn(...): Request rate limit reached`. First gate run: 7 failures. Diagnostic re-run: 6 failures, all rate-limit sign-ins. Gate re-run after a 7-minute wait: 1 failure (`rls-workspace-isolation.spec.ts`, same error). Those specs pass in isolation. T1 and T2's gates passed the full suite without this spec, so its 2 extra sign-ins plausibly push the live suite over the per-window sign-in limit.
**stash:** 0ed5c76a7076bb25f8433136f47f716f77e23c2c
**to unblock (author's call):** raise the project's auth sign-in rate limit, have live specs reuse logins or sign in fewer times, or run live specs with fewer workers. Then restore the stash and reset T3 to `todo`.
**follow-ups:**

1. The spec could also cover `admin_list_conferences` counts for an admin, the `23505` duplicate-name bubble, and the `22023` self-merge / bad-division checks.

## T4 · Conferences loader, server actions, pure helpers — done

**gate:** mechanical: pass · completion: pass
**changed:** New `src/lib/data/admin-conferences-server.ts`: row and view types, cached `listAdminConferences()` (session-client `admin_list_conferences` plus a service-role null-`conference_id` count), `getAdminConferenceTeams()`, and the pure helpers `applyConferenceView`, `sortConferences`, `conferenceMeta`, `squadsFor`, `toAdminConferenceRow`. New `src/lib/services/programs/conference-format.ts` (`normalizeWebsite`, `websiteHref`, `conferenceInitials`, `conferenceChanged`). New `"use server"` file `admin-conference-actions.ts` (create, save, merge, delete, addTeam, loadTeams; `requireAdmin()` then the session-client RPC; 23505 and P0001 mapped; writes revalidate `/admin`). `divisionLongLabel()` added to `programs-server.ts`. Accepted deviations: `conferenceInitials` drops filler words ("Conference", "the", "of", "and") so "Big 12 Conference" gives "B12"; `normalizeWebsite` rejects input with no dotted host, and create/save return a readable error for it; extra mappings for 22023, P0002 and 42501. Live evidence: the admin RPC returned 137 real conferences plus the recurring `Owner Conference` orphan, and 2 unplaced programs. The runner deleted that orphan once. It reappeared within minutes: another checkout still runs the unfixed `tests/teams-management.spec.ts`.
**follow-ups:**

1. The `Owner Conference` orphan keeps coming back until the teams-management spec fix (commit bbda63cc) reaches `splitstep-integration` or whichever checkout keeps running the old spec.
2. `getAdminConferenceTeams` creates one Supabase client per crest; it could share one.

## T5 · Move existing conference readers to the conferences table — done

**gate:** mechanical: pass · completion: pass
**changed:** `getConferenceOptions` (`team-settings-server.ts`) now runs one session-client `conferences.select('label').order('label')` query, with the optional division filter. `CONFERENCE_PAGE`, the paging loop and the dedup are removed. `listAdminTeamFacets` (`admin-teams-server.ts`) reads conferences from `conferences.label` and states from `programs.state` in parallel, and takes divisions from a fixed D1/D2/D3/NAIA/JUCO list sorted by `divisionLabel`. The `?conference=` filter is untouched. `AdminSearchResult` (`admin-search-server.ts`) gains `conferenceId` and `conferenceLabel`, filled from `conference_id` and the mirrored `conference` text. No UI files changed. No caller can be unauthenticated. Conference option order now follows the database collation rather than `localeCompare`.
**follow-ups:**

1. The states facet reads about 1,940 `programs` rows with no paging, so PostgREST's 1,000-row cap has probably always dropped some states (pre-existing).
2. Share the D1/D2/D3/NAIA/JUCO list between `admin-teams-server.ts` and `dual-school-step.tsx`, e.g. in `programs-server.ts`.
3. Both option lists include conferences with no teams, so the recurring `Owner Conference` orphan shows up in pickers until the spec fix merges.

## T6 · ConferenceMark + conferences table — done

**gate:** mechanical: pass · completion: pass
**changed:** New `src/components/admin/conference-mark.tsx` (`ConferenceMark`, a 24/28/40 initials square on `--radius-button` and `--surface-subtle`), `conferences-table-layout.ts` (`COL`, `ROW`, `CONFERENCES_COLUMNS`, `conferenceRowId`, on the frame's 64/56/104/48 grid), and the client component `conferences-table.tsx` (`ConferencesTable`: `role="button"` container rows with no chevron and a persistent selected wash, `TableEmptyBody` when empty, mark 28 plus name, "D-I"-style division or `EmptyMark`, three tabular counts with zeros in `--ink-600`). Row height, header and wash copy the shipped requests and teams tables (52px, `eyebrow-sm`, `--surface-muted`) instead of the frame's 56px, so the admin tabs stay consistent. Drift seeds unchanged. Not rendered on a page yet.
**follow-ups:**

1. Decide once, for all three admin tables, whether the frame's 56px rows, sentence-case headers and `--surface-subtle` selected wash should replace the shipped 52px / `eyebrow-sm` / `--surface-muted` styling.
2. The frame's 40px mark uses `--radius-element`; the criterion's `--radius-button` was followed.
3. `ProgramCrest` still hard-codes `rounded-[8px]` instead of a radius token.
