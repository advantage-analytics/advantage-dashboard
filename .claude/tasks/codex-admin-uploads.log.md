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
