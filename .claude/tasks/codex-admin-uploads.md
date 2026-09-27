# Tasks — codex/admin-uploads

> Scope: Admin Console Phase 2b — team-scoped file/video uploads, dual/tournament results, explicit console provenance, retryable saves, and submission history.
> Base and PR target: splitstep-integration. All tasks begin as todo; creating this queue does not execute them.

Run one by reading `.claude/skills/task-next/SKILL.md` and following it with this queue's Codex dispatch override. Use the tracked `.claude/tasks/` queue, not the stale `.Codex/tasks/` path in the local skill mirror.

To drain the file, loop a plain-text instruction — not `/loop /task-next`:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every iteration, and the runner only rewrites a task's `status:` line. Mark a task `next` to jump the queue.

Status values: `todo`, `next`, `doing`, `done`, `blocked`, and `later`. A task with unmet `needs:` is not eligible; `later` tasks are not selected automatically. The log is the runner's append-only record.

## Model routing

These are workload equivalents, not exact model equivalences:

| Original | Codex model     | Work                                                |
| -------- | --------------- | --------------------------------------------------- |
| Fable    | `gpt-6-astra`   | Security, database contracts, architectural changes |
| Opus     | `gpt-5.6-sol`   | Feature implementation and integration              |
| Sonnet   | `gpt-5.6-terra` | Small, fully specified changes                      |

**Queue dispatch override (explicit user instruction):** Pass each task's exact Codex model ID to the subagent tool. This overrides the task skills' Anthropic names and Sonnet fallback. If a named model is unavailable, report it instead of silently substituting. This changes agent routing only, not the application's LLM provider. Supply the task's context explicitly when using a model override; use a supported history setting rather than a full-history fork that forbids model overrides.

## Task routing

| Task                                   | Model | Dependencies            |
| -------------------------------------- | ----- | ----------------------- |
| T1 · Verify live contracts             | Astra | —                       |
| T2 · Persist console provenance        | Astra | T1                      |
| T3 · Resolve admin workspace           | Astra | T1                      |
| T4 · Scope wizard lookups              | Astra | T3                      |
| T5 · Guard analysis attachments        | Astra | T2, T3                  |
| T6 · Integrate file submissions        | Astra | T4, T5                  |
| T7 · Authorize video submissions       | Astra | T5                      |
| T8 · Add admin wizard variant          | Sol   | T4, T6, T7              |
| T9 · Extract schedule writes           | Astra | T1                      |
| T10 · Save retryable dual results      | Astra | T2, T3, T9              |
| T11 · Save tournament results          | Astra | T10                     |
| T12 · Build upload entry route         | Sol   | T3, T8                  |
| T13 · Build dual result form           | Sol   | T10, T12                |
| T14 · Build tournament result form     | Sol   | T11, T13                |
| T15 · Load submission history          | Astra | T6, T7, T10, T11        |
| T16 · Render submission history        | Sol   | T12, T15                |
| T17 · Add team shortcut                | Terra | T12                     |
| T18 · Verify authorization and retries | Astra | T6, T7, T10, T11, T15   |
| T19 · Verify flows and design          | Sol   | T13, T14, T16, T17, T18 |
| T20 · Complete release checks          | Astra | T19                     |

## Queue-wide requirements

- All tasks initially use `status: todo`.
- Read the design skill before UI work; trace dashboard routes before editing shared components.
- Preserve upload attribution, trimming, scoring, and vendor validation invariants.
- Console history includes member and non-member admins; ordinary dashboard activity is excluded.
- Preserve successful partial saves and retry failed items without duplication.
- Existing coach-created results permit analysis attachment, not score or identity changes.
- Apply the normal completion, RLS, and pipeline review gates. Push and merge remain separately authorized.
- Desktop scope; no Activity tab, bulk import, full tournament draw editor, or general processing monitor. Do not claim an owner activity-log surface exists.
- The live database is the schema authority. T1 must verify it before dependent implementation; do not substitute old migration bodies for live evidence.

## Planning and design references

The approved task criteria below supersede conflicting details in the earlier Phase 2b draft, particularly membership-based audit triggers and the assumption that coach-created matches cannot receive analysis.

- Earlier local plan: `/Users/cjgimena/.claude/plans/synchronous-cuddling-phoenix.md`, Phase 2b.
- Extracted approved frame: `/private/tmp/claude-501/-Users-cjgimena-Desktop-vscode-advantage-dashboard--claude-worktrees-remove-title-attributes-e1812c/6be4629b-eb27-4993-8822-bf4f8a330486/scratchpad/canvas-p2/UploadForTeam.dc.html` (markup 1098–1252). This is an external local reference, not a tracked artifact; verify it remains available before visual work.
- Repository guidance: `MAP.md`, `AGENTS.md`, `.skills/advantage-analytics-design/SKILL.md`, and `docs/ui-revamp-guardrails.md`.

## T1 · Verify live Phase 2b database contracts

- **status:** done
- **model:** gpt-6-astra
- **files:** Best guesses: `docs/admin-uploads-contracts.md`; relevant live Supabase objects.
- **done when:**
  - [ ] The contract note records the Phase 2a baseline and timestamped live evidence for relevant match, schedule, processing, audit, policy, trigger, and RPC behavior.
  - [ ] It specifies permitted writes for provenance, retryable results, and analysis attachment while identifying protected result fields.
  - [ ] It distinguishes verified facts from assumptions and identifies fresh migration timestamps; missing live access blocks completion.

## T2 · Persist explicit console submission provenance

- **status:** done
- **model:** gpt-6-astra
- **needs:** T1
- **files:** Best guesses: new submission migration, `src/lib/admin/uploads/types.ts`, database contract tests.
- **done when:**
  - [ ] Durable submissions record operation ID, actor, program, kind, linked records, and per-item status.
  - [ ] Admin-gated writes explicitly record console origin for member and non-member admins; ordinary dashboard writes do not.
  - [ ] Successful additions and existing-match attachments produce one audit entry; repeated operation/item IDs return prior outcomes.
  - [ ] Non-admin callers cannot forge provenance, and policies do not grant unrestricted match updates or deletion.

## T3 · Resolve a guarded admin team workspace

- **status:** done
- **model:** gpt-6-astra
- **needs:** T1
- **files:** Best guesses: `src/lib/data/admin-upload-server.ts`, workspace helpers and tests.
- **done when:**
  - [ ] A server-only loader checks admin authorization and resolves the selected program, eligible roster, status, and video allowance.
  - [ ] Authorized non-member admins succeed; non-admin callers and invalid program IDs receive explicit refusals.
  - [ ] The context preserves the session actor without changing workspace cookies; service-role reads follow the guard and expose no credentials.

## T4 · Add explicit program scope to wizard lookups

- **status:** done
- **model:** gpt-6-astra
- **needs:** T3
- **files:** Best guesses: `src/lib/wizard/actions.ts`, scoped workspace resolver, action tests.
- **done when:**
  - [ ] Admin roster, event-line, opponent, and supporting lookups use an explicitly authorized program.
  - [ ] Client-supplied program or admin-mode values cannot bypass server authorization.
  - [ ] Existing dashboard callers retain their workspace permissions, with tests covering legitimate admin access and refused cross-program requests.

## T5 · Prepare analysis attachments without rewriting results

- **status:** done
- **model:** gpt-6-astra
- **needs:** T2, T3
- **files:** Best guesses: `src/lib/data/add-video-server.ts`, admin attachment service, scoped RPC and tests.
- **done when:**
  - [ ] Admins can prepare analysis for an eligible coach-created match in the selected program.
  - [ ] Creator, program, event linkage, player identities, score, and recorded result remain unchanged.
  - [ ] Existing analysis, in-flight processing, wrong-program targets, and stale eligibility produce explicit refusals.
  - [ ] Repeated preparation cannot create duplicate matches or competing reservations; tests reject forged protected fields.

## T6 · Integrate admin match-file submissions

- **status:** done
- **model:** gpt-6-astra
- **needs:** T4, T5
- **files:** Best guesses: `useUploadMatchWizard.ts`, admin file submission service, relevant upload action and tests.
- **done when:**
  - [ ] Admin file submission creates a selected-program match or attaches analysis to an authorized existing result.
  - [ ] The existing SwingVision validation, parsing, and processing pipeline remains authoritative.
  - [ ] Player or score mismatches produce actionable refusals without modifying recorded results.
  - [ ] Submission/processing states link to the durable operation; retry tests show no duplicate matches or audit entries.

## T7 · Authorize admin video submission and program billing

- **status:** done
- **model:** gpt-6-astra
- **needs:** T5
- **files:** Best guesses: video upload-URL and jobs handlers/routes, submission service, authorization tests.
- **done when:**
  - [ ] Video authorization supports verified admin attachments to coach-created matches while retaining job ownership checks.
  - [ ] Eligibility and billing derive from the target program, preserving status, roster, quota, trimming, and vendor validation.
  - [ ] Repeated requests do not create duplicate jobs; operation state reflects processing outcomes.
  - [ ] Tests cover member/non-member admins, unauthorized actors, wrong-program attempts, and target-program charging.

## T8 · Add the shared wizard’s admin variant

- **status:** done
- **model:** gpt-5.6-sol
- **needs:** T4, T6, T7
- **files:** Best guesses: `UploadMatchFlow.tsx`, wizard provider/footer, `useUploadMatchWizard.ts`.
- **done when:**
  - [ ] Admin mode consumes the server-resolved workspace and scoped actions, with explicit exit and success destinations.
  - [ ] Draft saving and workspace switching are hidden; preserved result fields are read-only and refusals are visible.
  - [ ] Allowance displays consistently reflect the target team.
  - [ ] Existing dashboard entrypoints retain drafts, navigation, and provider step order.

## T9 · Extract reusable schedule writes

- **status:** done
- **model:** gpt-6-astra
- **needs:** T1
- **files:** Best guesses: `src/lib/schedule/actions.ts`, server-only schedule services, existing schedule tests.
- **done when:**
  - [ ] Required event, lineup, score, and outcome logic is reusable from server-only modules.
  - [ ] Member-facing actions retain their existing role and workspace authorization; internal helpers are not exposed as unguarded actions.
  - [ ] Schedule regression tests pass, including cross-program refusal.

## T10 · Save dual results with durable retries

- **status:** done
- **model:** gpt-6-astra
- **needs:** T2, T3, T9
- **files:** Best guesses: admin result actions/services, verified RPC migration, retry tests.
- **done when:**
  - [ ] Guarded submission supports existing/new duals and validates all submitted lines before writing.
  - [ ] Event setup occurs once; each line records an independent durable success or failure.
  - [ ] Retries preserve prior successes without duplicating events, matches, or audit entries.
  - [ ] Conflicting entry/round writes are serialized or rejected as stale; coach-created scores remain protected.

## T11 · Save tournament results through the retry contract

- **status:** done
- **model:** gpt-6-astra
- **needs:** T10
- **files:** Best guesses: admin tournament submission service/actions and tests.
- **done when:**
  - [ ] Guarded submission records one player’s round in an existing/new tournament and entry.
  - [ ] Program, participant, round, format, and score validation precedes persistence.
  - [ ] Durable IDs prevent duplicate setup/results on retry; existing results and concurrent conflicts are handled without overwriting.

## T12 · Build the admin upload entry route

- **status:** done
- **model:** gpt-5.6-sol
- **needs:** T3, T8
- **files:** Best guesses: `src/app/admin/uploads/new/page.tsx`, admin upload shell/components, `MAP.md`.
- **done when:**
  - [ ] The guarded route provides team selection and the four upload kinds, preserving team/kind in the URL.
  - [ ] File/video choices mount the shared admin wizard with the resolved team; invalid selections are recoverable.
  - [ ] The shell follows the approved frame and primitives, with cancellation and integration slots for result forms.
  - [ ] The generated route map includes the route.

## T13 · Build dual entry, review, and retry states

- **status:** done
- **model:** gpt-5.6-sol
- **needs:** T10, T12
- **files:** Best guesses: admin dual form and shared result review/status components.
- **done when:**
  - [ ] Existing/new duals use a compact nine-line form with current lineup, format, score, and outcome helpers.
  - [ ] Coach-recorded results are read-only; invalid fields show feedback; Confirm requires valid changes.
  - [ ] Review identifies the team, event, and submitted lines.
  - [ ] Partial completion identifies saved/failed lines and retries failed work while retaining inputs and successes.

## T14 · Build tournament entry and review

- **status:** done
- **model:** gpt-5.6-sol
- **needs:** T11, T13
- **files:** Best guesses: admin tournament form and shared review/status components.
- **done when:**
  - [ ] The form supports existing/new tournaments and entries for one player and round.
  - [ ] Validation and read-only recorded results are visible; review shows team, tournament, player, round, and score.
  - [ ] Failure preserves inputs and operation identity; success links to the result and admin destination.

## T15 · Load paginated console history

- **status:** done
- **model:** gpt-6-astra
- **needs:** T6, T7, T10, T11
- **files:** Best guesses: `src/lib/data/admin-uploads-server.ts`, history types and tests.
- **done when:**
  - [ ] An admin-guarded loader returns newest-first Date, Team, Kind, What, Added by, and State data.
  - [ ] All console submissions appear, including member-admin activity and existing-result attachments; dashboard submissions are excluded.
  - [ ] Partial-save and processing states derive from persisted evidence and existing analysis-status rules.
  - [ ] Pagination has a deterministic tie-breaker, tested with equal timestamps.

## T16 · Render console submission history

- **status:** done
- **model:** gpt-5.6-sol
- **needs:** T12, T15
- **files:** Best guesses: `src/app/admin/uploads/page.tsx`, admin history table/content components.
- **done when:**
  - [ ] The placeholder is replaced with the six-column history and “Upload for a team” action.
  - [ ] Pagination and authorized result links work.
  - [ ] Empty, loading, error, processing, and partial-save states use current primitives and preserve analysis-status meanings.

## T17 · Add the team upload shortcut

- **status:** done
- **model:** gpt-5.6-terra
- **needs:** T12
- **files:** Best guesses: admin team page and its header component.
- **done when:**
  - [ ] The team page shows “Upload for this team” using the appropriate existing action primitive.
  - [ ] Its URL contains that page’s program ID as the `team` parameter.
  - [ ] Existing header hierarchy, actions, and primary CTA styling remain intact.

## T18 · Verify authorization and retry concurrency

- **status:** done
- **model:** gpt-6-astra
- **needs:** T6, T7, T10, T11, T15
- **files:** Best guesses: admin authorization/retry specs and focused service corrections.
- **done when:**
  - [ ] Tests exercise actual authorization boundaries for program scope, provenance, and attachment permissions.
  - [ ] File/video attachment tests prove protected result fields survive.
  - [ ] Partial failures, double submissions, lost responses, and concurrent writes produce no duplicate records or jobs.
  - [ ] Program charging/status restrictions pass, and RLS review findings are resolved before completion.

## T19 · Verify all four flows and desktop fidelity

- **status:** done
- **model:** gpt-5.6-sol
- **needs:** T13, T14, T16, T17, T18
- **files:** Best guesses: admin flow tests, `docs/admin-uploads-verification.md`, scoped integration corrections.
- **done when:**
  - [ ] Each submission kind completes and appears in history; schedule/report reads reflect saved results.
  - [ ] Existing-result attachment and partial-save retry are exercised end to end.
  - [ ] Personal/team dashboard regressions cover drafts, navigation, eligibility, and allowance displays.
  - [ ] Recorded desktop checks compare delivered screens with the frame; unavailable checks remain explicitly incomplete.

## T20 · Complete release checks and reviews

- **status:** done
- **model:** gpt-6-astra
- **needs:** T19
- **files:** Best guesses: verification documentation and narrowly scoped fixes.
- **done when:**
  - [ ] Relevant tests, lint, typecheck, production build, route-map freshness, and design-drift checks pass.
  - [ ] Final RLS-boundary and pipeline-guardrails reviews cover the complete branch, with findings resolved.
  - [ ] Required migration/deployment steps and outstanding live checks are separately documented.
  - [ ] The branch is ready for `/pr-check` against `splitstep-integration`, without claiming unperformed deployment or merge work.

## T21 · Add admin_reconcile_submission_item for stuck video and file attempts

- **status:** done
- **model:** fable
- **files:** Best guesses: new `supabase/migrations/<live-version>_reconcile_admin_submission_items.sql`; `tests/database/fixtures/admin-video-harness.mjs` (append the new file to its migration list); new `tests/database/admin-reconcile.test.mjs`; `docs/admin-uploads-contracts.md` (one paragraph under "Verified trigger and RPC behavior").
- **done when:**
  - [ ] The migration creates `public.admin_reconcile_submission_item(p_actor_id uuid, p_operation_id uuid, p_item_id uuid, p_mode text) returns jsonb`, security definer, `set search_path=''`, EXECUTE revoked from public/anon/authenticated and granted to service_role only; it requires `p_actor_id` to be a current `users.is_admin` (any admin, not only the operation's actor), locks submission → item → parent match → attempt in that order, refuses a dual/tournament item with `kind-unsupported`, and re-creates `program_audit_log_action_check` with every one of the 28 actions the live constraint carries on 2026-09-27 plus `console.submission_reconciled`; the file ends with a `do $$` block asserting the function exists, the three grant facts, `prosecdef`, the empty search_path and that the new action is accepted (precedent: 20260927040947 on `claude/code-review-tools-order-68b9e9`).
  - [ ] Video branch: `abandon` is accepted only when the linked `processing_jobs` row has `status in ('pending','uploading','uploaded','failed')`, `external_job_id is null` and no `processing_usage` row with `released=false`; otherwise it raises `attempt-active` or `quota-held`. On success, in one transaction, it deletes the `admin_video_attempts` row and any `admin_analysis_reservations` row for the item, sets the job `status='failed'` (error_message kept, else `'abandoned'`), updates the match to `source_provider=null, analysis_method='manual'`, rewrites the item to `status='failed', error_code='abandoned', audit_id=null, match_id=null, processing_job_id=null, match_file_id=null` with `result` extended by `{"abandoned": {"matchId", "jobId", "actorId", "at"}}`, and inserts exactly one `program_audit_log` row with action `console.submission_reconciled` and details naming mode, operation, item, match and job. `complete` on a video item raises `mode-unsupported`. The return value carries `mode`, `kind`, `matchId`, `jobId`, `fileId`, `programId` and `consoleCreated = (item.kind = 'match')`.
  - [ ] File branch: `abandon` is accepted for attempt `state in ('queued','processing','failed')` only when the match has no `points` and no `match_stats` rows (else `analysis-present`); it deletes the `admin_file_attempts` row, the reservation row and the `match_files` row the attempt links, reverts the match's `source_provider`/`analysis_method` as above, and rewrites the item and audit as above. `complete` is accepted only for `state='processing'` when the match has at least one `points` row and a `match_stats` row (else `analysis-missing`), and sets `state='completed', completed_at=now()` leaving the item `succeeded` and writing the same audit action. A `completed` attempt refuses both modes with `attempt-completed`.
  - [ ] `tests/database/admin-reconcile.test.mjs` (PGlite, on the video harness) proves, in order: anon and authenticated callers get `permission denied`; a non-admin actor id gets `admin-required`; abandoning a failed video attachment leaves zero rows in `admin_video_attempts`/`admin_analysis_reservations` for the match, the match at `source_provider is null and analysis_method='manual'`, the item `failed`/`abandoned` with the old ids inside `result->'abandoned'`, one new audit row, and a following `admin_prepare_analysis_attachment` for the same match succeeding; `attempt-active` for a `submitting` job; `quota-held` for an unreleased usage row; file `complete` succeeds with points+match_stats present and raises `analysis-missing` without them; file `abandon` raises `analysis-present` when points exist.
  - [ ] The migration is applied live through the Supabase MCP and the committed file's 14-digit prefix equals the `version` recorded for it in `supabase_migrations.schema_migrations` (precedent 781e96c9); the file is not run through Prettier; `npm run test:database` passes with the new file in the video harness's list; `docs/admin-uploads-contracts.md` gains one paragraph naming the RPC, its two modes and refusal codes.
- **notes:** Live today: 0 rows in every admin_* table, so apply reads and writes no existing row — say so in the header comment as 20260927040947 does. Order the deletes before the match UPDATE: `preserve_admin_file_attachment` protects the match while an attempt is queued/processing, and `prevent_competing_admin_job` fires on the job status write and looks for other attempts on the match. `guard_video_job` forbids DELETE of a job with an attempt row — that is why the job is closed with `status='failed'`, not deleted; the blob is purged later when the match is deleted (T22). Closing the job matters: a member admin's `uploaded` job with no attempt row would fall through `authorizeAdminVideo → null` into the ordinary eligibility path. `matches_block_client_regraft` skips non-client roles, so the service-role revert passes. Reconciliation by _any_ admin is deliberate (the original actor may be gone); the audit row names who. Do not add an `abandoned` state to `admin_file_attempts`: its `match_id unique` would block a fresh console attempt on the same match, which is the whole point. Frozen paths untouched (`jobs/handler.ts`, `upload-url/*`, `src/lib/services/splitstep/**`, `purge-match-storage.ts`); if the subagent finds it must edit one, stop and add a bullet to the 2026-09-27 reviewed-exception entry in `docs/ui-revamp-guardrails.md`.

## T22 · Add console reconciliation controls and finish a console-created match's teardown

- **status:** done
- **model:** opus
- **needs:** T21
- **files:** Best guesses: new `src/lib/services/programs/admin-reconciliation.ts`; new `src/app/admin/uploads/history-actions.ts` ("use server"); `src/lib/data/admin-uploads-server.ts` (read `external_job_id`, derive per-item `reconcile` flags); `src/lib/admin/uploads/history.ts`; `src/components/admin/admin-upload-history.tsx`; new `tests/admin-reconciliation.spec.ts`; `tests/admin-upload-history.spec.ts`; `docs/admin-video-submission.md`, `docs/admin-match-file-submissions.md`, `docs/admin-upload-history.md`.
- **done when:**
  - [ ] `reconcileAdminSubmission({ operationId, itemId, mode }, deps)` in the new service calls `deps.requireAdmin()` before creating any client, validates both uuids and `mode ∈ {abandon, complete}`, calls `admin_reconcile_submission_item` with `p_actor_id` = the session actor (never a body field), and — only when the RPC returns `consoleCreated: true` and mode is `abandon` — runs `purgeMatchStorage(admin, [matchId], "console abandon")` and then deletes that one `matches` row by `id` and the RPC's `programId`; a purge throw returns `{ ok: false, message }` with no delete issued and the RPC's reversion left standing. `purge-match-storage.ts` is not modified.
  - [ ] `getAdminUploadHistory` items gain `reconcile: { abandon: boolean; complete: boolean }`: `abandon` is true for a video item whose linked job is in `pending|uploading|uploaded|failed` with a null `external_job_id` (the job select now includes `external_job_id`), and for a file item whose attempt state is `queued|processing|failed`; `complete` is true only for a file attempt in `processing`; everything else is `false/false`. `tests/admin-upload-history.spec.ts` gains cases asserting each of those four outcomes from fixture rows.
  - [ ] `admin-upload-history.tsx` renders, inside the existing per-item detail `<li>`, a `<form action={reconcileAdminSubmissionAction}>` with hidden `operationId`, `itemId`, `mode` and an `advButton("outline","sm")` submit — labelled "Abandon and delete match" when the item's `kind` is `match`, "Abandon" for an `analysis_attachment`, and "Mark complete" for the `complete` flag — shown only when the corresponding flag is true; an item whose `error` is exactly `abandoned` prints "Abandoned by an administrator" in place of the raw code. The action revalidates `/admin/uploads` and returns the service result unchanged.
  - [ ] `tests/admin-reconciliation.spec.ts` (deps-injected, no network — the shape of `tests/admin-video-submission.spec.ts`) proves: a non-admin gets "Administrator access is required." with zero rpc calls; the rpc receives the session actor id and the mode; a `consoleCreated` abandon records the effect order `rpc → purge → delete`; an attachment abandon records `rpc` only; a purge throw records `rpc → purge` and returns `ok:false`.
  - [ ] `docs/admin-video-submission.md` lines 67–71 ("require administrator reconciliation") and the `docs/admin-match-file-submissions.md` paragraph on `processing`/`failed` states are rewritten to name the control, the RPC and its refusal codes; `docs/admin-upload-history.md` gains a sentence on the controls. `npm run lint`, `npm run typecheck` and the two named specs pass.
- **notes:** T13 was blocked once because a route harness did not mock a new `./dual-actions` import — check `tests/admin-routes.spec.ts` and `tests/admin-upload-entry.spec.ts` for a harness that renders `/admin/uploads` before adding the `history-actions.ts` import, and mock it there. `admin-upload-history.tsx` is a Server Component (no "use client"): a `<form action>` bound to a "use server" export is the whole client surface; do not add a client island. `purgeMatchStorage`'s default `claimPurge` will now pass because the RPC removed every console reference first. The match delete cascades the `processing_jobs` and `match_files` rows (live FKs are `on delete cascade`). Read `.skills/advantage-analytics-design/SKILL.md` before touching the table cell; the reviewed-exception rule applies as in T21.

## T23 · Read durable file status when the admin file POST response is lost

- **status:** done
- **model:** sonnet
- **files:** Best guesses: `src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts` (~2990–3020, the `/api/admin/uploads/file` branch); `tests/admin-wizard-mode.spec.ts` or a sibling using `tests/fixtures/upload-wizard-hook.ts`.
- **done when:**
  - [ ] In the admin file branch, when the POST `fetch` rejects, its body is not JSON, or it answers non-2xx with the route's "Submission response was interrupted" message, the hook issues `GET /api/admin/uploads/file?operationId=<id>&itemId=<id>` with the same ids before deciding anything.
  - [ ] When that GET answers `{ ok: true, state, message, ... }`, the hook calls `setAdminFileResult(status)` and `setError(null)` so `UploadMatchFlow` mounts `AdminFileSubmissionStatus`; it throws nothing.
  - [ ] When the GET is not `ok`, the original POST message (or "Submission was refused…" fallback) is thrown exactly as today; a POST that answers a normal `{ ok: false, message }` 400 never triggers the GET.
  - [ ] A spec drives the hook with a stubbed `fetch` for both outcomes — lost POST + `ok` GET asserts `adminFileResult.state` is set and `error` is null; lost POST + failed GET asserts the thrown message equals the POST's — and the existing admin-mode cases still pass.
- **notes:** `src/app/api/admin/uploads/file/route.ts` already returns JSON 500 with that sentence on a thrown import; `getAdminMatchFileStatus` already scopes the GET to the submitting admin. Do not change `maxDuration` or make the invoke non-awaited — `docs/admin-match-file-submissions.md` documents the awaited dispatch. §3.1 of `docs/ui-revamp-guardrails.md` applies: none of the three attribution inputs is touched.

## T24 · Add admin_abandon_result_items and make abandoned dual/tournament items terminal

- **status:** done
- **model:** fable
- **needs:** T21
- **files:** Best guesses: new `supabase/migrations/<live-version>_abandon_admin_result_items.sql`; new `tests/database/admin-abandon-results.test.mjs` on `tests/database/fixtures/admin-schedule-harness.mjs`; `docs/admin-dual-results.md`, `docs/admin-tournament-results.md`.
- **done when:**
  - [ ] The migration creates `public.admin_abandon_result_items(p_actor_id uuid, p_operation_id uuid) returns jsonb`, security definer, `set search_path=''`, service_role-only EXECUTE; it requires a current admin actor (any admin), requires `admin_upload_submissions.kind in ('dual','tournament')` else `kind-unsupported`, locks the submission `for update`, and for every item with `status='pending'` runs `update program_event_entries set id=id where id=<target entry>` then sets `status='failed', error_code='abandoned', updated_at=now()`; succeeded and already-failed items are untouched; one `program_audit_log` row with action `console.submission_reconciled` (from T21) records mode `abandon`, the operation and the abandoned item ids; the return value lists `{ itemId, status, error }` per item.
  - [ ] `public.admin_apply_dual_result` and `public.admin_apply_tournament_result` are re-created via the `pg_get_functiondef` → `replace()` → assert-anchor-found pattern of 20260913032329 so the early-return condition reads `item.status='succeeded' or item.error_code='abandoned'`; the `do $$` block raises if either anchor is missing, and also asserts the new function's grants, `prosecdef` and empty search_path.
  - [ ] The PGlite test proves: after preparing a nine-line dual and applying three items, abandon flips exactly the six pending items to `failed`/`abandoned`, leaves the three succeeded items and their `admin_schedule_result_targets` rows unchanged, and writes one audit row; an `insert into program_event_outcomes` for an abandoned line as the coach succeeds where before abandon it raised `console-result-reserved`; re-running `admin_apply_dual_result` for an abandoned item returns without inserting a match or outcome; the tournament path behaves the same for its single item; anon/authenticated callers get `permission denied`.
  - [ ] Applied live through the Supabase MCP, file prefix = the recorded `version`, not Prettier-formatted, `npm run test:database` passes with T21's and this migration added to the schedule harness's extra list for the new test; each of the two docs gains one paragraph naming the RPC and the terminal `abandoned` rule.
- **notes:** `admin_schedule_result_targets` rows stay (they are history); `guard_reserved_schedule_result` joins items on `status in ('pending','succeeded')`, so a `failed` item stops reserving with no trigger change. Without the apply-RPC patch a same-request resume would re-apply the abandoned items and re-reserve the line — that is why T24 owns both halves. T21's migration must load in the schedule harness: it creates only a function and rewrites the audit check; the fixture's `program_audit_log_action_check` is replaced by it, which is fine.

## T25 · Add Resume and Abandon pending controls for dual/tournament history rows

- **status:** done
- **model:** opus
- **needs:** T22, T24
- **files:** Best guesses: `src/app/admin/uploads/history-actions.ts` (add `resumeAdminResultsAction`, `abandonAdminResultsAction`); `src/lib/services/programs/admin-reconciliation.ts` (result-operation helpers); `src/lib/data/admin-uploads-server.ts` + `src/lib/admin/uploads/history.ts` (row-level `pendingActions`); `src/components/admin/admin-upload-history.tsx`; `tests/admin-reconciliation.spec.ts`; `tests/admin-upload-history.spec.ts`; `docs/admin-upload-history.md`.
- **done when:**
  - [ ] `resumeAdminResults(operationId, deps)` requires an admin, reads the frozen request from `admin_dual_batches.request` or `admin_tournament_batches.request` through the session client (admin SELECT RLS), refuses with a message when no batch exists or the session actor is not the operation's `actor_user_id`, and otherwise calls `submitAdminDualResults` / `submitAdminTournamentResult` with that stored request unmodified — no client-supplied request or ids are accepted.
  - [ ] `abandonAdminResults(operationId, deps)` requires an admin and calls `admin_abandon_result_items` with the session actor; both helpers are exposed as "use server" actions that revalidate `/admin/uploads`.
  - [ ] History rows of kind `dual`/`tournament` with `counts.pending > 0` gain `pendingActions: { resume: boolean; abandon: boolean }` where `resume` is true only when the session actor equals the row's `addedBy.id`; the State cell renders "Resume" and/or "Abandon pending" as `<form action>` buttons only when the flag is true; `tests/admin-upload-history.spec.ts` asserts the flags for an actor-owned pending row, another admin's pending row, and a fully saved row.
  - [ ] `tests/admin-reconciliation.spec.ts` gains cases proving: resume passes the stored request byte-for-byte to the submit service and never reads a request from its input; resume by a different admin refuses before any submit call; abandon calls the RPC with the session actor.
  - [ ] `docs/admin-upload-history.md` and `docs/admin-dual-results.md` state that resume reads the durable batch request, so recovery no longer depends on client state (`src/lib/admin/results/dual-form.ts:234` unchanged).
- **notes:** `admin_prepare_dual_results` replays only for the operation's own actor (`operation-unavailable` otherwise) — hence the actor rule on Resume while Abandon is any-admin. Same harness-mock caution as T22. The 40001 coach-side message is T26's, not this task's.

## T26 · Map console-reserved and console-FK errors to sentences in scheduleWriteError

- **status:** done
- **model:** sonnet
- **files:** Best guesses: `src/lib/schedule/writes-server.ts` (`scheduleWriteError` at ~906–917; `applyEntryPlan` ~275–312); new `tests/schedule-write-errors.spec.ts` via `tests/helpers/schedule-writer.ts`.
- **done when:**
  - [ ] `scheduleWriteError` returns "An administrator's console submission has reserved this line and has not finished. Ask an administrator to resume or abandon it in the admin console." when `error.message` contains `console-result-reserved`, checked before the existing 40001/40P01 "This line changed while you were saving" branch.
  - [ ] It returns "This event has results recorded through the admin console, so it can't be deleted or have its lines removed here." when `error.code === "23503"` and `error.message` names any of `admin_upload_submissions_event_id_fkey`, `admin_upload_submission_items_outcome_id_fkey`, `admin_schedule_result_targets_entry_id_fkey`; every other error still returns `error.message`.
  - [ ] `applyEntryPlan`'s delete, update and insert failures return `scheduleWriteError(error)` instead of `{ error: error.message }`, so the `updateDual` slot-swap path reaches the mapping like `deleteEvent` (`src/lib/schedule/actions.ts:85`) and the outcome clear (`writes-server.ts:495`) already do.
  - [ ] The new spec asserts all three sentences and the pass-through for a plain error, and that an `updateDual` whose entry delete answers a 23503 naming `admin_schedule_result_targets_entry_id_fkey` returns the console sentence.
- **notes:** Refusal, not `ON DELETE`, is deliberate: `admin_upload_submission_items` check1 forbids a null `outcome_id` on a succeeded outcome item so `set null` would trade one raw error for another, cascade would erase provenance that T20 chose to keep, and `src/app/api/matches/[matchId]/route.ts:304–316` already refuses with a sentence. No migration; all three FKs verified live today as NO ACTION.

## T27 · Release deletion claims when a later deletion step fails

- **status:** done
- **model:** fable
- **files:** Best guesses: new `supabase/migrations/<live-version>_release_deletion_claims.sql`; `src/components/dashboard/settings/actions.ts` (`deleteAccount`, ~255–370); `src/app/api/matches/[matchId]/route.ts` (DELETE, ~304–320); `tests/admin-account-delete-protection.spec.ts`; new `tests/match-delete-claim-release.spec.ts`; `tests/database/admin-delete-protection.test.mjs`.
- **done when:**
  - [ ] The migration adds `public.release_my_account_deletion_claim() returns boolean` (security definer, `search_path=''`, EXECUTE to authenticated only; deletes the `admin_actor_delete_claims` row where `actor_user_id = auth.uid()`, returning whether one was removed) and `public.admin_release_match_storage_purge(p_match_ids uuid[]) returns integer` (service_role only; deletes `match_storage_purge_claims` rows for those ids, returning the count); a `do $$` block asserts both functions' grants, definer flag and search_path; applied live, file prefix = recorded version, not Prettier-formatted.
  - [ ] In `deleteAccount`, every failure return after `prepare_my_account_deletion` succeeded (matches list read error, `purgeMatchStorage` throw, match delete error, auth delete error) first calls `release_my_account_deletion_claim` and, once `purgeMatchStorage` has run, `admin_release_match_storage_purge(matchIds)`; both are logged on error and never change the message returned; the success path calls neither.
  - [ ] In the match DELETE route, a `matches.delete()` error after `purgeMatchStorage` calls `admin_release_match_storage_purge([matchId])` through the service-role client before answering 500; the 409 purge-refusal branch is unchanged.
  - [ ] `tests/admin-account-delete-protection.spec.ts` asserts, via its `effects` list, that the release calls appear after a failing matches read and after a failing auth delete, and are absent on the success path; `tests/match-delete-claim-release.spec.ts` (transpile harness like `tests/admin-match-delete-protection.spec.ts`) asserts the route's effect order `purge → delete(fails) → release` and `purge → delete(ok)` with no release.
  - [ ] `tests/database/admin-delete-protection.test.mjs` proves anon cannot call either function, authenticated can call only `release_my_account_deletion_claim` and it removes only the caller's own row, and a released match id is admitted again by `reject_purging_match`.
- **notes:** `match_storage_purge_claims.match_id` cascades on match delete, so success already cleans up; only failure needs the compensating delete. Releasing after a failed auth delete is intentional: the claim guards deletion I/O, which is over; the user is told to contact support. §3.4 of `docs/ui-revamp-guardrails.md` (match deletion — touch carefully) applies; `purge-match-storage.ts` (frozen) is called, not edited.

## T28 · Add a confirm step and refusal messages to the upload-history controls

- **status:** done
- **model:** opus
- **files:** Best guesses: new `src/components/admin/history-action-button.tsx` ("use client"); `src/components/admin/admin-upload-history.tsx`; new `tests/admin-upload-history-controls.spec.ts`; `docs/admin-upload-history.md`. Unchanged: `src/app/admin/uploads/history-actions.ts`, `tests/admin-reconciliation.spec.ts`, `tests/admin-upload-history.spec.ts`.
- **done when:**
  - [ ] A new "use client" component renders each of the five history controls — "Abandon and delete match", "Abandon", "Mark complete", "Resume", "Abandon pending" — as an `advButton("outline","sm")` `<button type="button">` that, on click, builds a `FormData` with the field names the actions already read (`operationId`, `itemId`, `mode`; `operationId` alone for the two result actions) and awaits the server action inside `useTransition` (`disabled` and `aria-busy` while pending). `admin-upload-history.tsx` keeps every show/hide flag and label from T22/T25 but no longer contains `<form action`, `ReconcileForm`, `PendingResultsForm` or the three `as unknown as` void casts; `history-actions.ts` and `tests/admin-reconciliation.spec.ts` are byte-for-byte unchanged.
  - [ ] When the awaited action returns `{ ok: false, message }`, the control renders that `message` verbatim in a `<p role="alert">` (12px `--danger`, the shape `TeamHeaderActions` uses in `src/components/admin/team-header-actions.tsx`) directly beneath its button, replacing any earlier message; on `{ ok: true }` it clears the message and renders no success copy — the action's `revalidatePath("/admin/uploads")` re-renders the row (chip, flags, "Abandoned by an administrator") as the feedback.
  - [ ] The control for `mode="abandon"` on an item whose `kind === "match"` ("Abandon and delete match") does not call the action on click: it opens `ConfirmDialog` (`src/components/ui/confirm-dialog.tsx`) with `tone="danger"`, a question title ending in "?", a one-sentence `description` that names the item's `what` in `Em` and says the match and its uploaded video are removed with no undo, `confirmLabel` "Abandon and delete match", `pendingLabel` "Deleting…", `pending` bound to the transition; `onConfirm` is the only path that calls `reconcileAdminSubmissionAction`; a refusal is passed as the dialog's `error` prop with the dialog left open, and success closes it. The other four controls open no dialog. The dialog copy (title text, description text, `confirmLabel`, `pendingLabel`, `tone`) is exported as a named constant from the island's module so a spec can assert it without mounting Radix; no `window.confirm` anywhere in the diff.
  - [ ] New `tests/admin-upload-history-controls.spec.ts` renders `AdminUploadHistory` offline via `createLoader()` (`tests/fixtures/vm-modules.ts`; precedent `tests/admin-activity-card.spec.ts`), stubbing `next/link`, `next/navigation` and `@/app/admin/uploads/history-actions` with recording fakes, over one hand-built `ok` result holding: a `video` row whose `match` item has `reconcile.abandon: true`; an `analysis_attachment` row whose item has `reconcile.abandon: true`; a `file` row whose item has `reconcile.complete: true`; a `dual` row with `pendingActions: { resume: true, abandon: true }`; and an item with `error: "abandoned"`. It asserts that each of the five labels appears as `<button` text and "Abandoned by an administrator" appears; that the raw markup contains no `<form` and no `role="alert"` at rest; and that the exported confirm copy has `tone === "danger"`, a title ending in "?" and `confirmLabel === "Abandon and delete match"`.
  - [ ] `docs/admin-upload-history.md` lines 9 and 11 ("…forms bound to `reconcileAdminSubmissionAction`" / "…forms bound to `resumeAdminResultsAction` and `abandonAdminResultsAction`") are rewritten to name the client control, that "Abandon and delete match" confirms in `ConfirmDialog` before the action runs, and that a refusal's `message` is shown beside the control; `npm run lint`, `npm run typecheck`, the new spec, `tests/admin-upload-history.spec.ts` and `tests/admin-reconciliation.spec.ts` pass.
- **notes:** Origin: T22 follow-ups 1–3 and T25 follow-up 1 in the log (a plain `<form action>` discards the `{ ok, message }` result, so RPC refusals such as `quota-held`, `attempt-active`, `analysis-present`, a purge failure or a resume by a different admin leave the page silently unchanged; "Abandon and delete match" purges storage and deletes the match on one click). T22 follow-up 4 (the loader cannot see `quota-held`) is out of scope — do not touch `admin-uploads-server.ts`. Confirm only the destructive control: the attachment abandon leaves the match standing and frees it for a fresh attempt, and abandon-pending keeps saved lines and the frozen batch request, so both are recoverable by resubmission — pass the confirm as a prop so either can be flipped later. Read `.skills/advantage-analytics-design/SKILL.md`, then `reference/chrome.md` › Dialog (v3): question title, contract sentence, prose not bullets (three nouns need no body — `DeleteMatchDialog` in `src/components/dashboard/matches/match-actions/delete-match-dialog.tsx` is the shape), `tone="danger"` only because something is lost, Cancel + one action, `DialogProblem` carries the refusal. A Server Component may pass a server-action reference to a client component as a prop (serializable), or the island may import `history-actions.ts` directly — either way the spec stubs `@/app/admin/uploads/history-actions` by alias, which wins over the file per `vm-modules.ts`. Radix `Portal` renders nothing under `renderToStaticMarkup`, hence the exported copy constant; `useTransition`/`useState` render fine server-side. No success message by design: a successful action flips the item's flags and the control unmounts on revalidation, so a row-local success line would vanish with it. Admin surface — the `widget-states` hook and `docs/ui-revamp-guardrails.md` attribution inputs are not involved; `purge-match-storage.ts` and the RPCs are not touched.
