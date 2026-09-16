# Admin uploads: live Phase 2b contracts

Status: T1 reconnaissance complete; **Phase 2b writes are not implemented or approved by this note**.

## Evidence and limits

The schema authority is Supabase project `pouxujkhtbvkdwbzfvka` (`advantage-dashboard`), PostgreSQL 17.4. The main checkout's existing project link and `NEXT_PUBLIC_SUPABASE_URL` identify the same project. No Supabase MCP SQL tools were exposed in this session. The already-authenticated Supabase CLI supplied read access instead:

```sh
cd /Users/cjgimena/Desktop/vscode/advantage-dashboard
supabase db query --linked --output json --file /tmp/admin-uploads-recon.sql
```

Only catalog SELECTs were submitted. No application records were changed, RPCs executed, migrations applied, credentials printed, or user identities impersonated. Initial server time was `2026-09-16 23:46:22.996002+00`; main catalog snapshot **E1** was `2026-09-16 23:47:25.408067+00`; supplemental snapshot **E2** was `2026-09-16 23:48:26.843534+00` (UTC). E1 captured columns, constraints, indexes, policies, enabled triggers, function definitions/configuration/ACLs, table grants, and the latest 25 applied migrations. E2 checked effective privileges, upload-shape/visibility helper bodies, file-upload guards, and possible provenance names.

“Verified” below means these live catalog definitions and privileges were read. Behavioral descriptions are deductions from those definitions, **not executed write tests**. Actor-specific success, rejection, concurrent retries, and end-to-end processing remain for the later queue tasks. No row counts, user-specific visibility, deployment state, or runtime correctness are inferred from the old plan or local migration bodies.

The repository baseline is queue commit `a22b8b0e`, based on `e3a6c4d7`. Local source supplies application semantics only: `src/lib/schedule/actions.ts`, `src/lib/data/add-video-server.ts`, `src/lib/data/match-analysis.ts`, and `docs/ui-revamp-guardrails.md`. The queue's criteria supersede the earlier Phase 2b draft, especially its membership-based audit proposal and assumptions about editing coach-created matches.

## Phase 2a baseline verified live

| Applied version  | Live migration name                |
| ---------------- | ---------------------------------- |
| `20260916073129` | `conferences_table`                |
| `20260916142034` | `admin_conference_rpcs`            |
| `20260916183239` | `conferences_owner_gate_and_locks` |

`conferences` has RLS enabled, generated `label`, unique normalized name and label indexes, and authenticated SELECT only. `programs.conference_id` references it; `programs_sync_conference` resolves ID/text and `conferences_mirror_label` propagates renames. **The draft's college null-equivalence invariant is no longer true:** an owner entering an unknown name may retain conference text with a null ID. Create-if-missing requires a college row and an admin session or service role.

The five RPCs `admin_upsert_conference`, `admin_merge_conferences`, `admin_delete_conference`, `admin_set_program_conference`, and `admin_list_conferences` are SECURITY DEFINER with empty search paths and explicit `is_admin()` checks. EXECUTE is granted to authenticated/service_role, not anon/PUBLIC. A service-role grant alone does not satisfy the body’s actor check. Set locks the program with `FOR NO KEY UPDATE` and returns without auditing a no-op. Merge locks conference IDs in order, moves programs and records one `program.conference_changed` audit row per moved program. Delete locks and refuses conferences with teams. The audit action CHECK already includes this Phase 2a action; preserve it and all pre-existing actions.

## Verified table and policy boundaries (E1/E2)

All 16 E1 tables have RLS enabled and not forced. Table grants, RLS, trigger authorization, and application guards are separate layers.

| Object                                 | Current session boundary and relevant structure                                                                                                                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `matches`                              | INSERT/UPDATE/DELETE require `auth.uid() = created_by`; UPDATE has both USING and WITH CHECK. SELECT permits creator, either player's IDs from `my_player_ids()`, or program membership through `user_program_role`. There is **no admin SELECT or UPDATE arm**. |
| `programs`                             | SELECT permits college rows, owner, or member. Custom programs do not gain visibility merely because the caller is admin.                                                                                                                                        |
| `program_events`                       | SELECT requires program membership. INSERT/UPDATE/DELETE use `can_manage_program_schedule(program_id)`; deletion has an additional trigger guard.                                                                                                                |
| `program_event_entries`                | Same member SELECT and schedule-manager write policies; unique `(event_id, slot)` only when slot is non-null. Carries program/event IDs, discipline, slot, player IDs/labels, opponent facts, and legacy `forfeit`.                                              |
| `program_event_outcomes`               | Member SELECT; schedule-manager INSERT policy also checks actor; DELETE requires schedule manager; no UPDATE policy. Composite foreign keys bind entry/event/program/kind. Unique entry for null round, unique entry/round otherwise.                            |
| `program_members`                      | SELECT permits one's own membership or program staff.                                                                                                                                                                                                            |
| `program_players` / `program_invites`  | Member-only / staff-only SELECT respectively. No general admin read arm.                                                                                                                                                                                         |
| `processing_jobs` / `processing_usage` | Authenticated CRUD policies require `created_by = auth.uid()` (including UPDATE check). Job ownership does not establish permission to rewrite the linked result.                                                                                                |
| `match_files`                          | CRUD policies bind `uploaded_by = auth.uid()`; INSERT also invokes `match_upload_transition_guard`.                                                                                                                                                              |
| `match_drafts`                         | Author-only ALL policy uses **`user_id`**, not `created_by`.                                                                                                                                                                                                     |
| `program_audit_log`                    | Staff-only SELECT policy; no session INSERT/UPDATE/DELETE policy or grant. Fields include bigint identity `id`, program, actor, action, UUID subject, details JSON, and creation time.                                                                           |
| `match_stats`, `points`, `shots`       | Writes require the parent match's creator; reads use `visible_match_ids()` / `visible_point_ids()`. E2 confirms `visible_match_ids()` has the same creator/player/member logic, with no admin arm.                                                               |

`is_admin()` reads `users.is_admin` for `auth.uid()`. `program_roster_full(uuid)` is SECURITY DEFINER but all three UNION arms require `user_program_ids()` membership; an admin or a service client with no actor does not automatically pass it.

**Observed grant gap:** E2 `has_table_privilege('authenticated', 'public.program_event_outcomes', 'INSERT')` and UPDATE both returned false, while EXECUTE on `set_schedule_outcome(uuid,uuid,text,text,text)` returned true. That function is **SECURITY INVOKER**. Thus its INSERT branch is not authorized by the INSERT policy alone. T9/T10 must resolve or account for this verified mismatch and exercise the intended role; this reconnaissance did not attempt an outcome write.

For `matches`, processing tables, events and entries, anon/authenticated/service_role have broad table grants including TRUNCATE, REFERENCES and TRIGGER in addition to CRUD. Audit anon/authenticated retain SELECT/TRUNCATE/REFERENCES/TRIGGER; conferences grant only authenticated SELECT. These are existing catalog grants, **not permission for new console code to use them**. In particular, RLS does not protect TRUNCATE; catalog presence is not an authorization audit of every exposed transport. New provenance tables must not copy these grants indiscriminately.

## Verified trigger and RPC behavior

| Function / trigger                                | Live contract and implication                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `matches_block_client_regraft`                    | Enabled BEFORE INSERT or UPDATE OF program, entry, player1, provider, method. For JWT role authenticated/anon, INSERT requires program membership, authorized same-program event line, and same-program player. Program is immutable on UPDATE; changing entry requires the attachment RPC's transaction setting, a previously unlinked match, and schedule permission. Roster reassignment is checked. Service calls bypass this client guard.                                                                                          |
| `match_is_upload_shaped(text,text)`               | `source_provider IS NOT NULL OR analysis_method IS DISTINCT FROM 'manual'`. Both null counts as an upload; only null provider plus manual method avoids upload eligibility.                                                                                                                                                                                                                                                                                                                                                              |
| `upload_eligibility_refusal(uuid,uuid,uuid,uuid)` | Requires an actor. Personal rows require creator/athlete alignment. Team rows require membership, **active** program status, upload-policy permission, and an eligible roster athlete when non-null. Neither non-member admins nor claim-pending file imports have an exception.                                                                                                                                                                                                                                                         |
| `match_upload_transition_guard`                   | Enabled BEFORE INSERT on jobs and files. For client JWT roles, resolves the match and applies eligibility; null file match IDs do not transition a match. It does not enforce a general “job actor must equal match creator” rule for team rows. Service role bypasses the trigger check.                                                                                                                                                                                                                                                |
| `can_manage_program_schedule(uuid)`               | Membership plus `events_policy`: owner, owner/coaches, or owner/coach/staff. No admin bypass. Used by INSERT/UPDATE/**DELETE** policies and multiple RPCs: broadening it is broader than adding uploads.                                                                                                                                                                                                                                                                                                                                 |
| `schedule_private.guard_schedule_result`          | Enabled BEFORE match INSERT/UPDATE OF entry, round, score; also before outcome INSERT/UPDATE. Client outcome branch requires staff membership and refuses UPDATE. Match branch returns early for a non-member so later regraft authorization can reject without disclosing results. Locks/versions the entry via `UPDATE ... SET id = id`; excludes outcomes/legacy forfeits against matches. It does **not** make matches unique per entry/round. A new admin path must not retain an early return that skips required conflict checks. |
| `set_schedule_outcome`                            | Actor and schedule-manager gate; same-program entry `FOR UPDATE`; validates round/kind/side, clears or inserts outcomes and legacy forfeits. See the effective-grant gap above. Dual outcomes use null round; tournament outcomes accept Q1/Q2/Q3/R128/R64/R32/R16/QF/SF/F/C1/C2/C3.                                                                                                                                                                                                                                                     |
| `guard_legacy_forfeit`                            | Refuses a changed non-null side until cleared and excludes existing matches/outcomes. Preserve this conflict model.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `delete_schedule_event` / `guard_event_delete`    | RPC additionally requires owner/coach membership. Trigger retains membership checks, entry locks, recorded-result refusal, and `event.deleted` audit. Deletion is not a Phase 2b capability.                                                                                                                                                                                                                                                                                                                                             |
| `attach_match_to_event_line`                      | Creator-only, locks match and entry, validates same program/singles/no conflict, and attaches an **existing match to an event**. It changes entry, tournament name, round, date, type and surface and writes `match.attached`. This is **not** the proposed attach-analysis-to-existing-result operation; do not repurpose it to change a coach's recorded context.                                                                                                                                                                      |
| `contribute_opponent_player`                      | Actor plus schedule gate; different existing opponent program, validated names/position; refuses programs already managed by members. Reuses a matching live profile or inserts one. Admin entry must preserve those limits.                                                                                                                                                                                                                                                                                                             |

`matches.score` only has an object-type CHECK, not score semantics. The event-entry foreign key is `ON DELETE SET NULL`; matches' program FK is also SET NULL. The schedule guards complement these single-column FKs. `matches_event_entry_idx` is **nonunique**, and there is no `(event_entry_id, round)` unique index. The current application checks for an existing result with SELECT/limit before insertion; this is neither a durable operation key nor a complete concurrent deduplication guarantee.

E1 has no admin-added INSERT audit trigger on matches/events. `program_audit_log_action_check` includes `match.attached` and `program.conference_changed` but not `match.admin_added`, `result.admin_recorded`, or `event.admin_added`. E2 found no public table names matching submission/upload other than `match_files`, and no public column names matching operation/submission/idempot/console/origin. This limited search plus the captured schema provides **no evidence of an existing durable console provenance contract**; it is not proof that every possible differently named helper was inspected.

## Processing and billing contract

`processing_jobs_one_live_per_match` is a unique match-ID index where status is not failed/completed/derivation_failed. It includes pending, uploading, uploaded, submitting, queued, processing, and deriving. Completed/derivation_failed are excluded from the index, **not thereby eligible for fresh analysis**. Application eligibility must refuse existing analysis and derivation retries that already have results.

The live job status CHECK contains exactly those ten states. Trim end must exceed start when both are present; progress is 0–100. Jobs reference matches with ON DELETE CASCADE. Quota uses `processing_usage` account ID/type, month, job, actor, reserved/actual seconds, and released flag.

`reserve_processing_quota` is SECURITY DEFINER, empty search path, with **service_role-only EXECUTE** (besides owner); authenticated/anon effective EXECUTE returned false. It validates positive seconds, advisory-locks account/month, sums unreleased actual-or-reserved seconds, checks the supplied cap, and inserts a reservation. There is no actor/program check in its body and no retry-return branch: server authorization, target-program billing and job/operation idempotency must surround it. Do not grant it to clients or treat a repeated reservation as automatically safe. Release/reconcile are also service-only in E1.

Preserve the vendor inputs, trim accounting, per-job writes, and upload retry state described in `docs/ui-revamp-guardrails.md`. History must resolve status with derivation version: vendor completed without derived stats remains “Stats pending.” These are application requirements, not new database status values.

## Permitted Phase 2b writes (required contract, not current grants)

| Operation                  | Permitted effect after an explicit server-side admin check                                                                                                                                                                                    | Required exclusions                                                                                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Console provenance         | Persist operation/item identity, authenticated actor, selected program, kind, linked records and durable per-item outcome; audit each successful addition or analysis attachment once. Include admins who are members and admins who are not. | Never infer console origin from missing membership, accept a forged actor/origin, include ordinary dashboard writes, or replay successful audit entries.                                                                   |
| New dual/tournament result | Validate all submitted lines before writes; create event/entry setup once; save each accepted new line/round and its outcome independently under stable operation/item identities.                                                            | Do not overwrite existing recorded results. Retry only failed items; retain successful IDs and outcomes after partial failure or a lost response. Serialize or explicitly refuse competing writes to the same entry/round. |
| Analysis attachment        | Resolve and lock the selected-program existing result, recheck eligibility, preserve its identity/result, reserve one authorized analysis attempt, and link file/job/provider metadata and provenance.                                        | Refuse wrong program, existing analysis, competing processing/reservation, stale eligibility and player/score mismatch. Do not create a duplicate match, competing job or reservation.                                     |
| Processing/billing         | Authorized server processing may transition the reserved attempt and charge the **selected target program** with the existing quota/trim rules.                                                                                               | Do not charge an admin's personal workspace, spoof a job owner, reset saved scores, or treat access to the service client as authorization.                                                                                |

For attachment, protected fields are at least `matches.id`, `created_by`, `program_id`, `event_entry_id`, `player1_id`, `player2_id`, `opponent_player_id`, both player names, `score` (including winner/tiebreak arrays), `result`, `round`, `tournament_name`, `date`, `match_type`, `format`, and `court_type`; preserve the associated entry's participant/opponent identity and recorded outcome/forfeit too. These are **required preservation rules**, broader than today's trigger protection. The live trigger can permit a creator to change same-program player identity; that does not authorize console attachment to do so.

Provider/method, processing/file linkage, and attempt state may change only through a narrowly validated attachment operation. Any needed camera/orientation metadata must retain the established player mapping. A shared wizard's current fill payload cannot be trusted as a safe result-update allowlist. Point/shot/stat generation stays with the existing processing pipeline; do not use new console code to overwrite imported or already-derived analysis. Exact new table names, RPC signatures and implementation mechanics belong to T2/T5/T10, not T1.

Keep session actor attribution in privileged RPCs, guard service-role reads before use, use empty search paths and explicit EXECUTE grants for new privileged functions, and avoid widening match UPDATE/DELETE or the shared schedule-manager helper merely to get console writes working. Revalidate eligibility at mutation time, not only during a loader read.

## Migration identities and remaining verification

The latest applied migration in E1 is `20260916183239`. Local filenames differ: Phase 2a files are `20260915100000_conferences_table.sql`, `20260915100100_admin_conference_rpcs.sql`, and `20260916100000_conferences_owner_gate_and_locks.sql`. Thus the earlier draft's `20260916100000_admin_upload_bypasses.sql` collides with an existing local timestamp and predates the live head. **Do not reuse either draft Phase 2b timestamp.**

At this reconnaissance, fresh candidate timestamps `20260916235000` and `20260916235100` are later than both recorded heads and absent from the captured latest-25 live list and local filenames. They are not reservations or migrations; generate/recheck current UTC timestamps against the full live migration list and current branch immediately before implementation. Re-read live function bodies before any replacement; fingerprints below identify this snapshot, not permanent truth.

Later tasks must verify member-admin, non-member-admin and non-admin behavior; outcome grants; coach-result preservation; imports and video eligibility; lost responses/partial saves/concurrent entry writes; program billing; downstream report access; and migration application. In particular, widening only matches SELECT does not automatically widen stats/points visibility. These checks were intentionally not simulated with live writes in T1. The live-access prerequisite was satisfied; no migration or deployment has been performed.

## Reproducing the evidence

Use the existing authenticated CLI on the already-linked project above. The following are SELECT-only catalog queries; save them to the temporary SQL file used by the command. The broad public catalog queries avoid relying on guessed legacy migration bodies. Compare function definitions as well as grants and trigger attachment points.

```sql
SELECT current_timestamp AS captured_at, version();
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC;
SELECT table_name, column_name, data_type, is_nullable, column_default,
       is_generated, generation_expression
FROM information_schema.columns WHERE table_schema = 'public';
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');
SELECT * FROM pg_policies WHERE schemaname = 'public';
SELECT * FROM information_schema.role_table_grants WHERE table_schema = 'public';
SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE connamespace = 'public'::regnamespace;
SELECT * FROM pg_indexes WHERE schemaname = 'public';
SELECT tgrelid::regclass, tgname, tgenabled, pg_get_triggerdef(oid)
FROM pg_trigger WHERE NOT tgisinternal
  AND tgrelid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n
                 ON n.oid = c.relnamespace WHERE n.nspname = 'public');
SELECT n.nspname, p.oid::regprocedure, p.prosecdef, p.proconfig, p.proacl,
       pg_get_functiondef(p.oid), md5(pg_get_functiondef(p.oid)) AS body_md5
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'schedule_private') AND p.prokind = 'f';
SELECT has_table_privilege('authenticated', 'public.program_event_outcomes', 'INSERT'),
       has_table_privilege('authenticated', 'public.program_event_outcomes', 'UPDATE'),
       has_function_privilege('authenticated',
         'public.set_schedule_outcome(uuid,uuid,text,text,text)', 'EXECUTE'),
       has_function_privilege('authenticated',
         'public.reserve_processing_quota(uuid,uuid,text,uuid,date,integer,integer)', 'EXECUTE');
```

The last query returned `false, false, true, false` in E2. Do not call these mutating RPCs as a verification shortcut.

### Function fingerprints

MD5 values identify exact `pg_get_functiondef` text captured in E1/E2 for reproducible drift checks, not security guarantees. `definer` means SECURITY DEFINER; all listed functions have empty search paths. `auth` means authenticated, `service` means service_role; the owner also retains EXECUTE. PUBLIC includes all roles. Trigger functions listed with only owner access are still invoked by their enabled triggers.

| Function identity                                                    | Mode    | EXECUTE besides owner       | Body MD5                           |
| -------------------------------------------------------------------- | ------- | --------------------------- | ---------------------------------- |
| `admin_delete_conference(uuid)`                                      | definer | auth, service               | `56ef2184829c747c439cff3938172843` |
| `admin_list_conferences()`                                           | definer | auth, service               | `1e5b567ebd9305fb401b06cc4eec955f` |
| `admin_merge_conferences(uuid,uuid)`                                 | definer | auth, service               | `ea6a192f42fc59ce25464d886e66c41c` |
| `admin_set_program_conference(uuid,uuid)`                            | definer | auth, service               | `21d41a0eb36438b4acfe732e6ac8a359` |
| `admin_upsert_conference(uuid,text,text,text,text)`                  | definer | auth, service               | `120b2e06c3ede125f29dd618bab95924` |
| `attach_match_to_event_line(uuid,uuid)`                              | definer | auth, service               | `67af7479fef7ba8d5cd2d3dc897b4ac1` |
| `can_manage_program_schedule(uuid)`                                  | definer | auth, service               | `40b3553e819b3993b2e81537f56146bf` |
| `conference_id_for(text,text,boolean)`                               | definer | service                     | `7abba46f8759a1907e4089a1633f061b` |
| `conferences_mirror_label()`                                         | definer | service                     | `3547d8fea703542583a3230f81d989af` |
| `contribute_opponent_player(uuid,uuid,text,text,integer)`            | definer | auth, service               | `71580c5652f3fa6e5c9af8abd9c8c35c` |
| `delete_schedule_event(uuid,uuid)`                                   | invoker | auth, service               | `f82db27d902070d371b04b88c5273d60` |
| `is_admin()`                                                         | definer | auth, service, anon         | `44094c2944a8457c2b55948e1a1b3dcb` |
| `is_program_staff(uuid)`                                             | definer | auth, service, anon         | `ec0fb80d545c0e605d0f98e1621ad7ae` |
| `match_is_upload_shaped(text,text)`                                  | invoker | PUBLIC, anon, auth, service | `645ea5010068051a30e639911454147f` |
| `match_upload_transition_guard()`                                    | definer | service                     | `4014ef3e9ab3da8d1446b421c9e12d6c` |
| `matches_block_client_regraft()`                                     | definer | PUBLIC, anon, auth, service | `b64d72b9aa2c3a6256610b4fc21082b1` |
| `my_player_ids()`                                                    | definer | anon, auth, service         | `43c763eb9436d4cc2c8033e3b6497cc6` |
| `program_players_clear_claimed_at()`                                 | invoker | PUBLIC, anon, auth, service | `6e04066d29f748d67ac91c222dd405d8` |
| `program_roster_full(uuid)`                                          | definer | auth, service               | `8e96c3332ad32ce86ccc496351da3f4b` |
| `programs_sync_conference()`                                         | definer | service                     | `0a4cde23f70305c6b342d625bcc1363c` |
| `reconcile_processing_quota(uuid,integer)`                           | definer | service                     | `b92a246f4fa337031527d054b3fb1a01` |
| `release_processing_quota(uuid)`                                     | definer | service                     | `884f6d664dfbb3e50a6a1ca903f52807` |
| `reserve_processing_quota(uuid,uuid,text,uuid,date,integer,integer)` | definer | service                     | `3210563d82c1444d35216be1cbaeeb34` |
| `schedule_private.guard_event_delete()`                              | definer | none                        | `5f750ebcfd1deb09c92fbce4924d4327` |
| `schedule_private.guard_legacy_forfeit()`                            | definer | none                        | `2a6ff4466342c51c4a82f4c32d915e7f` |
| `schedule_private.guard_schedule_result()`                           | definer | none                        | `6c46e7c153c57101b308929a4d79667c` |
| `set_conferences_updated_at()`                                       | invoker | PUBLIC, anon, auth, service | `6fe4712c2762dbfe4f39e9d00e62cf42` |
| `set_processing_jobs_updated_at()`                                   | invoker | service                     | `0404a335e0c4575583f62f92e6431e42` |
| `set_schedule_outcome(uuid,uuid,text,text,text)`                     | invoker | auth, service               | `02f50f0af1054d375d8764ffa8c1d4a1` |
| `update_match_stats_updated_at()`                                    | invoker | PUBLIC, anon, auth, service | `4c375bc22846d16d4f7ef57078fbe107` |
| `upload_eligibility_refusal(uuid,uuid,uuid,uuid)`                    | definer | service                     | `2aceb36f4a76f3002ad11d750bcc9920` |
| `user_program_ids()`                                                 | definer | auth, service, anon         | `d338220382e5ed7c06ba91954685ee27` |
| `user_program_role(uuid)`                                            | definer | auth, service, anon         | `5298b2fc19901ca4e2b978ab63eee7bd` |
| `visible_match_ids()`                                                | definer | auth, service, anon         | `f532b5d37ccb80555dbc79bb690b51dd` |
