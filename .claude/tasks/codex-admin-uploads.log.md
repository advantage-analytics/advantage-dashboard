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
