# Run log — codex/admin-uploads

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Verify live Phase 2b database contracts — done

**gate:** Mechanical GATE PASS (lint, typecheck, full test suite). Completion reviewer: VERDICT: pass; sampled E1/E2 captures, timestamps, migration baseline, fingerprints and privileges matched. Documentation formatting and diff whitespace checks passed. Pipeline and RLS guardrail reviews are reserved for branch-level /pr-check, as specified by task-next.

**changed:** Added docs/admin-uploads-contracts.md with read-only live catalog evidence captured through the existing authenticated, linked Supabase CLI at 2026-09-16 23:47:25 UTC and 23:48:26 UTC. Records Phase 2a baseline, upload/schedule/processing/audit boundaries, protected result fields, permitted downstream writes and fresh migration timestamp guidance. Highlights service-role-only quota reservation, missing match entry/round uniqueness, and the outcome RPC's effective INSERT-grant gap. Separates catalog facts from inferred behavior and deferred runtime tests. No database writes or migrations.

## T2 · Persist explicit console submission provenance — done

**gate:** Mechanical GATE PASS (lint, typecheck, full test suite); isolated PostgreSQL contract suite passed via npm run test:database. Completion reviewer VERDICT: pass. Reviewer additionally noted a TypeScript submission-kind mismatch; corrected to the exact SQL kinds before commit, then typecheck, focused ESLint, SQL tests, formatting and diff checks passed. Branch-level RLS and pipeline review remain for /pr-check.

**changed:** Added migration 20260917000513_persist_admin_upload_submissions.sql, durable submission/item row types, and a pinned PGlite test dependency with reproducible database contract tests. Explicit console origin and session actor, admin-only reads/begin, immutable request identities, event setup reuse, locked item replay, and private transactional completion/audit helpers. No broad match policy changes. Live catalog was re-read, but this migration has NOT been applied to the shared database. Tests execute actual SQL against minimal live-derived dependencies in isolated PostgreSQL; deployed trigger integration and concurrent connections remain later-task verification. Later authorized mutation RPCs must call the private helpers in the same transaction as their write.
