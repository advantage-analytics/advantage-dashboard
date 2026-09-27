# Run log — codex/admin-uploads

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Verify live Phase 2b database contracts — done

**gate:** Mechanical GATE PASS (lint, typecheck, full test suite). Completion reviewer: VERDICT: pass; sampled E1/E2 captures, timestamps, migration baseline, fingerprints and privileges matched. Documentation formatting and diff whitespace checks passed. Pipeline and RLS guardrail reviews are reserved for branch-level /pr-check, as specified by task-next.

**changed:** Added docs/admin-uploads-contracts.md with read-only live catalog evidence captured through the existing authenticated, linked Supabase CLI at 2026-09-16 23:47:25 UTC and 23:48:26 UTC. Records Phase 2a baseline, upload/schedule/processing/audit boundaries, protected result fields, permitted downstream writes and fresh migration timestamp guidance. Highlights service-role-only quota reservation, missing match entry/round uniqueness, and the outcome RPC's effective INSERT-grant gap. Separates catalog facts from inferred behavior and deferred runtime tests. No database writes or migrations.

## T2 · Persist explicit console submission provenance — done

**gate:** Mechanical GATE PASS (lint, typecheck, full test suite); isolated PostgreSQL contract suite passed via npm run test:database. Completion reviewer VERDICT: pass. Reviewer additionally noted a TypeScript submission-kind mismatch; corrected to the exact SQL kinds before commit, then typecheck, focused ESLint, SQL tests, formatting and diff checks passed. Branch-level RLS and pipeline review remain for /pr-check.

**changed:** Added migration 20260917000513_persist_admin_upload_submissions.sql, durable submission/item row types, and a pinned PGlite test dependency with reproducible database contract tests. Explicit console origin and session actor, admin-only reads/begin, immutable request identities, event setup reuse, locked item replay, and private transactional completion/audit helpers. No broad match policy changes. Live catalog was re-read, but this migration has NOT been applied to the shared database. Tests execute actual SQL against minimal live-derived dependencies in isolated PostgreSQL; deployed trigger integration and concurrent connections remain later-task verification. Later authorized mutation RPCs must call the private helpers in the same transaction as their write.

## T3 · Resolve a guarded admin team workspace — done

**gate:** Mechanical GATE PASS (lint, typecheck, full test suite). Completion reviewer VERDICT: pass. Focused context and client-boundary tests passed (13 tests); diff whitespace checks passed. Branch-level guardrail reviews remain for /pr-check.

**changed:** Added getAdminUploadContext with admin authorization before service-client creation, explicit invalid/missing-program and read-failure results, real session actor/viewer, selected-team status and capability context, canonical eligible roster and program video allowance. Paged roster/membership/usage reads and chunked identity reads avoid response-limit truncation, covered with 1,001-row fixtures. No workspace-cookie writes, credentials in results, database mutations, UI changes or dependency on the unapplied T2 migration. The projected owner role is explicitly not membership or write authorization; later mutations must independently re-check permission and reserve quota.

## T4 · Add explicit program scope to wizard lookups — done

**gate:** Mechanical GATE PASS (lint, typecheck, full test suite). Completion reviewer VERDICT: pass. Focused tests exercise legitimate non-member admin scope, refused malformed/forged/cross-program requests across six actions, unchanged dashboard defaults, and actual action-to-schedule-loader flow. Focused lint, formatting and diff checks passed. Branch-level guardrails remain for /pr-check.

**changed:** Added optional WizardLookupScope to six wizard reads and a server resolver that re-authorizes explicit admin scopes via T3 before service-client creation. Admin schedule, roster aliases, event/history/style lookups use the selected program; dashboard calls retain active workspace, session identity and role restrictions. Opponent pooled roster/lineup reads remain session-scoped. Added explicit program_id filters to schedule entries and matches for safe privileged reads. No UI callsite changes, draft/upload writes, cookie changes, database mutations or migrations.

## T5 · Prepare analysis attachments without rewriting results — done

**gate:** Mechanical GATE PASS (lint, typecheck, full test suite). Completion reviewer VERDICT: pass. Isolated database tests passed (2); focused service tests passed (3), formatting and diff checks passed. Branch-level guardrail reviews remain for /pr-check.

**changed:** Added admin-gated attachment preview/preparation service and migration 20260917004400_prepare_admin_analysis_attachments.sql. Preparation locks and validates selected-program manual results, fingerprints recorded context, and reserves one operation/item per match; replay revalidates eligibility and identity. Protected result fields remain untouched, forged payload fields are rejected, and existing analysis, in-flight work, stale targets and competing reservations are refused. No match, job, media, quota or successful audit writes; migration is NOT applied live. Tests use isolated PostgreSQL without multi-connection race coverage. T6/T7 consumers must lock and revalidate before creating work; ordinary writers do not consume reservations yet, and expiry/cancellation is outside this preparation task.

## T6 · Integrate admin match-file submissions — done

**gate:** Mechanical GATE PASS (lint, typecheck, full test suite). Completion reviewer VERDICT: pass. All 3 isolated database suites passed; 9 targeted service/Edge/attachment cases passed. Formatting and diff checks passed. Branch-level guardrail reviews remain for /pr-check.

**changed:** Added authenticated admin file submission/status endpoint and transactional admission migration 20260917010000. Actual XLSX bytes pass the existing validator/parser; minimal ExcelJS import compatibility fixes allow server reuse. Selected-program new matches and prepared existing-result attachments persist one file, match linkage and audit per operation/item; mismatches and stale reservations roll back. Durable processing claims and exact-byte hash checks prevent replay/bypass, including console paths on legacy requests. Existing point/shot/statistics logic is retained; recorded result fields are protected during processing. Queued work can retry; failed or interrupted partial processing explicitly requires review. T8 owns wizard integration. Documentation records unlinked-blob cleanup limitation and mandatory migration, Edge, endpoint deployment order. Live read-only schema/stat-function checks succeeded; no migration, Edge deployment or live data mutation performed.

## T7 · Authorize admin video submission and program billing — done

**gate:** Mechanical GATE PASS (lint, typecheck, full test suite). Completion reviewer VERDICT: pass. All 4 isolated database suites and 81 focused service/handler tests passed; final admission roster hardening passed SQL checks. Formatting and diff checks passed. Branch-level guardrail reviews remain for /pr-check.

**changed:** Added durable admin video admission and access/quota services, migration 20260917011813 and endpoint contract documentation. Existing upload-URL/jobs routes discover explicit provenance even without console parameters; exact-job ownership, target-program authorization and frozen vendor answers are enforced. Attachment admission locks/revalidates T5 context; result and entry preservation spans processing and stats-pending. One-job replay and atomic submission claims prevent duplicate work, with target-program charging revalidated under SQL locks and caps supplied by existing config. Existing trimming/upload helper remains the T8 integration path. Durable item state follows processing. Fresh read-only live catalog verified quota contracts; no live mutation, quota spend, vendor call or deployment. Migration must precede routes. Uncertain or failed vendor work requires reconciliation instead of replacement jobs.

## T8 · Add the shared wizard’s admin variant — blocked

**gate:** Mechanical GATE FAIL. ESLint rejects tests/admin-wizard-mode.spec.ts:148 assigning variable module (@next/next/no-assign-module-variable). Full tests: 1302 passed, 155 skipped, 1 failed: tests/upload-player-details.spec.ts:347 expects the shared missing-answers source block; renaming const missing to ordinaryMissing makes its extraction empty. Completion review not run because mechanical gate failed.

**changed:** Implementation and tests preserved in stash a7a0e59fc3c8229ffb84a400c268310da2a9dd1c; no T8 source changes committed. Root also found queued-file retry refusals hidden by the prior status screen: current wizard.error is not rendered while adminFileResult remains queued. Worker was stopped after gate failure before completing that correction. Restore stash and address these findings before rerunning T8; queued criteria/order remain unchanged.

## T9 · Extract reusable schedule writes — blocked

**gate:** Dispatch failed: collaboration.spawn_agent with exact requested model gpt-6-astra returned "agent thread limit reached". No implementation agent started; mechanical and completion gates did not run.

**changed:** No stash — the task produced no changes. Only blocked status and this log entry are committed. No model substitution or source edits. All remaining tasks depend directly or transitively on blocked T8 or T9; queue automation paused pending recovery of these blockers, not marked complete.

## T8 · Add the shared wizard’s admin variant — done

**gate:** User authorized recovery with "keep going". Restored stash a7a0e59fc3c8229ffb84a400c268310da2a9dd1c and reused the existing gpt-5.6-sol worker due thread capacity. Mechanical GATE PASS; completion reviewer VERDICT: pass. Focused regressions 89 passed, 9 skipped; full lint 0 errors, 34 warnings; typecheck, formatting and diff checks pass.

**changed:** Shared AdminUploadMatchFlow isolates the server-resolved target workspace/roster/allowance and scopes wizard lookups. Explicit exit/success destinations, no draft writes/switching, static preserved-result summary, stable operation IDs, secure file/video endpoint submissions and exact video job reuse. File retry refusals and pending state are visible. Attachment gates no longer demand inaccessible ending controls. Fixed prior test lint error and adapted existing source-contract extraction without removing its assertions. Dashboard defaults retained. T12 mounts the entry route; T19 owns full browser fidelity. No live effects.

**follow-ups:** User-authorized queue recovery resets T9 from blocked to todo; existing Astra worker and reviewer reuse handles the agent thread limit without model substitution. Queue automation resumed with this dispatch fallback.

## T9 · Extract reusable schedule writes — done

**gate:** Mechanical GATE PASS (lint, typecheck, full test suite); completion reviewer VERDICT: pass. Focused schedule/boundary regressions: 172 passed, 48 opt-in database skips. Formatting and diff checks passed. Reused exact gpt-6-astra worker and completion reviewer under authorized thread-limit fallback.

**changed:** Extracted six dual/tournament creation/update, result and outcome operations plus shared lineup helpers into writes-server.ts, with input contracts in write-types.ts and compatible type re-exports. Member actions retain authorization before service construction, lazy session-client RLS, scoped event reads and revalidation. Service is not a Server Action and is registered in the enforced server-only boundary list. Existing action harnesses execute the actual extracted service; added all-six authorization and cross-program tests. No schema, UI, admin writes or live mutations. Existing nontransactional member behavior is unchanged; T10/T11 own durable admin results.

## T10 · Save dual results with durable retries — done

**gate:** Mechanical GATE PASS (lint, typecheck, full test suite); completion reviewer VERDICT: pass. Focused application checks: 203 passed, 17 existing skips. Database checks: 11 passed, including 7 T10 cases. Formatting and diff checks passed. Reused exact gpt-6-astra worker and completion reviewer under authorized thread-limit fallback.

**changed:** Added guarded existing/new dual submission, full-envelope validation, immutable event setup and per-item result transactions. Stable operation/item IDs replay prior successes without duplicate events, results or audits. Entry locks and snapshots reject competing or stale writes while preserving coach-created scores. Added actual SQL tests using captured live guards, boundary tests and contract documentation. Migration 20260917025856_save_admin_dual_results.sql remains unapplied. SELECT-only catalog evidence captured at 2026-09-17 02:54:20 UTC; live head 20260916183239. PGlite tests verify sequential conflicting-write outcomes, not simultaneous multi-session lock timing. No live writes or deployment.

## T11 · Save tournament results through the retry contract — done

**gate:** Mechanical GATE PASS (lint, typecheck, full test suite); completion reviewer VERDICT: pass. Focused application checks: 208 passed, 17 existing skips. Database checks: 18 passed, including 7 tournament and 7 dual cases with T10/T11 installed together. Changed-file formatting, ESLint and diff checks passed. Reused exact gpt-6-astra worker and completion reviewer under authorized thread-limit fallback.

**changed:** Added guarded single-player tournament round submissions for new/existing tournaments and entries. Validates scope, participant, round, dates, format and scores before durable setup; immutable operation/item replay and exact entry/round reservations preserve saved results. Console-backed entry protection recognizes profile/user aliases and prevents duplicate setup, while existing coach results remain unchanged. Shared score validation and SQL harness retain dual regression coverage. Migration 20260917032144_save_admin_tournament_results.sql remains unapplied. SELECT-only catalog refreshed at 2026-09-17 03:21:39 UTC, live head 20260916183239. Local SQL tests verify sequential competing-write outcomes, not simultaneous-session lock timing. No live mutations or deployment.

## T12 · Build the admin upload entry route — blocked

**gate:** Mechanical GATE PASS; completion reviewer VERDICT: needs-work. The upload-kind selection uses native radio glyphs, but the approved frame and design primitive require the blue check-dot with white check (reference/primitives.md:167). Criterion 3 did not pass.

**changed:** Failed implementation preserved in stash 1810d3eb9105ac04b1e9419f1024d7a9488c6973; only blocked status and this log entry are committed. Focused regressions passed (24 tests, including 6 new). Disposable browser fixture verified kind/provider/slot selection, URL preservation through team changes, Cancel destination and invalid-team recovery, with shared wizard/navigation mocked; no authenticated end-to-end claim. No live mutations or deployment. T15 remains independently eligible, so queue automation stays active.

## T15 · Load paginated console history — done

**gate:** Mechanical GATE PASS (lint, typecheck, full test suite); completion reviewer VERDICT: pass. Nine actual-loader fixture tests passed, covering authorization, provenance, states, batch reads and cursor traversal. Implementation dispatched on exact gpt-6-astra model.

**changed:** Added admin-guarded console history loader and row/item contracts, with session provenance reads and guarded privileged metadata hydration. Explicit origin includes member/nonmember admins and existing-result attachments, excluding dashboard activity. Persisted item/attempt/job/stat evidence drives partial-save and canonical analysis states; session-readable match IDs alone receive report links. Descending timestamp/operation-ID pagination preserves microseconds and handles equal timestamps; related reads are chunked and paginated. Contract documentation records unapplied migration prerequisites and read-only catalog evidence. No UI, migration or live mutation. T13 was passed over waiting on T12; T14 waits on T13. T18 remains independently eligible.

## T18 · Verify authorization and retry concurrency — done

**gate:** Mechanical GATE PASS; completion reviewer VERDICT: pass. Real PostgreSQL 17: 17 passed; PGlite: 18 passed; focused application tests: 120 passed; root client import-graph check passed. Focused root RLS review found no unresolved findings, substantiated by actual-role checks across all eight new tables. Final branch-wide specialist reviews remain T20 work.

**changed:** Added independent-session PostgreSQL retry/authorization tests with server-confirmed blocking, actual grants/RLS, protected attachment snapshots, double submission/rollback/lost-response replay, program charging/status races and exact record/job/audit counts. Shared fixtures retain existing contracts; pg is development-only and the new opt-in driver requires a disposable loopback database. Evidence/limits documented; no application or migration corrections and no live mutations. Local disposable container is cleaned up after review. T13/T16/T17 were passed over waiting on blocked T12; T14 waits on T13. Remaining T19/T20 transitively wait on those UI tasks. Queue automation pauses for T12 recovery, not queue completion.

## T12 · Build the admin upload entry route — done

**gate:** User explicitly authorized recovery and queue resume. Restored stash 1810d3eb9105ac04b1e9419f1024d7a9488c6973; exact gpt-5.6-sol worker corrected selection primitive. Mechanical GATE PASS; completion reviewer VERDICT: pass. Focused regressions 24 passed; typecheck, lint, formatting and route-map checks passed. Browser fixture confirmed blue check-dot rendering and native ArrowRight selection with URL update.

**changed:** Added guarded /admin/uploads/new team search and four URL-preserved kinds, shared admin file/video wizard mounting with stable per-mount operation/item IDs, recoverable invalid selections, cancellation and dual/tournament integration slots. Generated MAP includes route. Approved shell uses required blue check-dot with white check while retaining native radio semantics. Copy reflects supported team attribution. Browser fixture used actual shell with mocked wizard/navigation; authenticated end-to-end verification remains T19. Original stash retained. Queue automation resumes after commit; no live writes, push or merge.

## T13 · Build dual entry, review, and retry states — blocked

**gate:** Mechanical GATE FAIL: lint and typecheck passed; full tests had 1334 passed, 155 skipped, 4 failed in tests/admin-upload-entry.spec.ts because its route harness does not mock the new ./dual-actions import. Completion review not run.

**changed:** Preserved implementation in stash 046938dc6fe331e1b76dcc165a38485e5fa9096b. Focused form/service tests and mocked-browser existing-result read-only, review, partial-save and retry checks passed, but full gate remains authoritative. Recovery must update the existing route harness for the new guarded dependencies, then rerun both gates. No task code committed. T14 waits on T13; T16 and T17 remain independently eligible.

## T13 · Build dual entry, review, and retry states — done

**gate:** Mechanical GATE PASS (lint, typecheck, full test suite); completion review VERDICT: pass. Focused route/form tests: 15 passed. Prior mocked-browser checks verified coach read-only results, invalid review gating, two-line review, retained partial success and retry completion.

**changed:** Restored T13 implementation and repaired route harness mocks for the new actions, form and guarded event queries, adding program/kind scoping and refusal coverage. Added nine-line existing/new dual entry using shared lineup, format, score and outcome helpers; guarded saved-result context; read-only coach results; frozen review requests and durable retry status retaining successes. Wired the dual route slot. Existing stash remains preserved. No deployment or live writes. T14 is now eligible; queue automation remains active.

## T14 · Build tournament entry and review — done

**gate:** Mechanical GATE PASS (lint, typecheck, full tests); completion review VERDICT: pass. Focused tests 21 passed. Mocked actual-component browser checks verified invalid gating, existing recorded round read-only, nullable scoring display, quarter-final review and interrupted-save retry to success. Recorded-result fixture view checked; full live integration remains T19.

**changed:** Added existing/new tournament and singles entry form, shared result review, score/outcome validation, immutable operation snapshot and retained retry inputs. Guarded context adapter filters eligible singles entries and preserves legacy scoring; result links use session-readable report access or exact guarded event/entry/round selection, plus admin destination. Wired tournament route slot and adapted route harness. No live writes, migrations or deployment. T16 is next eligible.

## T16 · Render console submission history — blocked

**gate:** Mechanical verdict unavailable after interrupted session: process 56049 no longer exists and no GATE PASS was received. Fail-closed per task-next; completion review not run. Focused lint/typecheck and 9 history tests passed, and browser fixture verified six columns, canonical analysis labels, partial details, cursor navigation and empty/error/loading states. These do not replace the full gate.

**changed:** Work preserved in stash 5c3927aedc0a6fb401407de13afec76b59ed344f: admin history page, six-column component and loading route. No implementation failure established; recovery requires fresh mechanical gate then completion review. T17 remains independently eligible; T19 waits on T16 and T17.

## T16 · Render console submission history — done

**gate:** Mechanical GATE PASS, preserved in /private/tmp/t16-retry-gate.log; completion review VERDICT: pass. Pipeline guardrails skipped: no dashboard/wizard edits. RLS boundary skipped: no data-layer/API/schema or new query changes; uses existing guarded history loader. Prior 9 focused tests and actual-component browser checks verified columns, authorized links, partial/analysis states, cursor navigation and empty/error/loading behavior.

**changed:** Restored history implementation after interrupted gate and verified it without code changes: six-column console history, Upload for a team action, cursor pagination, expandable item details and session-authorized match links, canonical analysis states and partial-save counts, recoverable error/empty/loading states. Prior stash retained. No live writes, deployment, push or merge. T17 is next eligible.

## T17 · Add the team upload shortcut — done

**gate:** Mechanical GATE PASS (/private/tmp/t17-gate.log); completion review VERDICT: pass. Focused formatting, ESLint and typecheck passed.

**changed:** Added Upload for this team in the admin team header using the existing primary button primitive and adminUploadHref(program.id, null). Preserved crest, heading, status/plan pills and facts with a wrapping action layout. No other source changes or live effects. T19 is now eligible for integrated flow and desktop verification.

## T19 · Verify all four flows and desktop fidelity — blocked

**gate:** Mechanical GATE PASS (/private/tmp/t19-gate.log); completion review VERDICT: needs-work. All four integrated submission/history/schedule/report flows, attachment/partial retry E2E, actual dashboard browser regressions and final route/frame desktop comparison remain incomplete. Fresh focused tests 253 passed, 31 skipped; PGlite 18 passed.

**changed:** Verification record and concrete disposable integration setup/replay checklist preserved in stash 9f7bb1afd11f311affed363bbd016c9a635af38b, also readable at /private/tmp/admin-uploads-verification-t19.md. Requires isolated full Supabase schema/Auth/Storage/Edge with Phase2b migrations, seeded admin/member/nonmember accounts and program fixtures, actual Next routes, test media and isolated vendor transport; previous component mocks do not meet E2E. No live writes or deployment. T20 waits on blocked T19, so queue automation pauses for integration verification.

## T19 · Verify all four flows and desktop fidelity — done

**gate:** Mechanical: GATE PASS (lint, typecheck, full test suite; /private/tmp/t19-retry-gate.log). Completion: VERDICT: pass from independent task-completion-reviewer. Focused actual local Auth/PostgREST eligibility: 31 passed; database contracts: 18 passed.

**changed:** Provisioned disposable full-schema Supabase/Auth/Storage/Edge and local Azure/vendor transport; completed all four actual browser flows, both protected coach-result attachments, partial-save retry, schedule/report readback and dashboard draft/navigation/allowance regressions. Wired attachment selection with server-derived presets, aligned court values, repaired the shot foreign-key guard in fresh migration 20260917065829, enabled guarded loopback-only Azure emulation, corrected test profiles and the choice-card radius token. Recorded IDs, exact 122-second target-program charge, preservation/retry evidence and desktop comparison in docs/admin-uploads-verification.md. Hosted deployment, real vendor/LLM processing and release checks remain separate; T20 is next.

## T20 · Complete release checks and reviews — done

**gate:** Mechanical GATE PASS (/private/tmp/t20-gate.log: lint, typecheck, full tests); independent completion VERDICT: pass. Final complete-branch RLS and pipeline reviews report no remaining actionable findings. Production build, formatting, 73-route map freshness and seven design-drift checks pass. Ten focused Playwright tests, PGlite deletion contract and real PostgreSQL concurrency proof (four orderings) pass; eighth migration applies to disposable full-schema database.

**changed:** Fixed reviewed deletion data-loss risk with durable match/actor claims and atomic account preparation, refusing protected console records before storage side effects and serializing concurrent admission. Added fresh migration 20260917072323 and focused regression/concurrency coverage. Verification documentation records eight unapplied hosted migrations, deployment sequence and outstanding live checks separately. Local preview restored on port 3119. All queue tasks done; ready for /pr-check against splitstep-integration. No hosted deployment, push or merge.

## 2026-09-27 · Migration status note (appended; entries above left as written)

The eight admin-upload migrations the entries above call unapplied were applied live on 2026-09-19, and commit 781e96c9 renamed the files to their live-recorded versions: 20260917000513 → 20260919044542 (persist_admin_upload_submissions), 20260917004400 → 20260919044622 (prepare_admin_analysis_attachments), 20260917010000 → 20260919044716 (submit_admin_match_files), 20260917011813 → 20260919044829 (submit_admin_match_videos), 20260917025856 → 20260919045015 (save_admin_dual_results), 20260917032144 → 20260919045138 (save_admin_tournament_results), 20260917065829 → 20260919045156 (fix_admin_attachment_shot_lookup), 20260917072323 → 20260919045221 (guard_admin_match_storage_purge). The docs under docs/admin-*.md now cite the new names.

## T21 · Add admin_reconcile_submission_item for stuck video and file attempts — done

**gate:** mechanical PASS · completion pass

**changed:** New service-role-only RPC `admin_reconcile_submission_item` (abandon for video/file, complete for file; refusal codes incl. kind-unsupported, attempt-active, quota-held, analysis-present, analysis-missing, attempt-completed, mode-unsupported) plus the audit CHECK widened with `console.submission_reconciled`. Applied live via the Supabase MCP; file renamed to the recorded version 20260927084958. PGlite test `tests/database/admin-reconcile.test.mjs` added to the video harness (test:database 20/20); contracts doc paragraph added. Deliberate extras: `kind` returns the branch, `result.abandoned.fileId`, `result.completed` on complete, extra refusal codes (mode-invalid, operation-not-found, item-not-found, attempt-missing, attempt-not-processing, linkage-mismatch).

**follow-ups:**

1. Add a `tests/database/README.md` paragraph for admin-reconcile.test.mjs.
2. Load `20260919045221_guard_admin_match_storage_purge.sql` into the video harness so `reject_purging_match` is exercised by the item rewrite.
3. A prepared-but-never-submitted item (reservation, no attempt) is `attempt-missing` yet still blocks a fresh prepare with `attachment-reserved` — needs a `release` mode or reservation expiry.
4. `quota-held` is a dead end in the UI unless T22 offers `release_processing_quota` before abandon.
