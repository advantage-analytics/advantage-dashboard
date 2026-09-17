# Database contract tests

Run `npm ci`, then `npm run test:database`. The pinned PGlite dev dependency runs
PostgreSQL in an isolated, in-memory database; no Supabase credentials, Docker,
network connection or shared database writes are needed.

`admin-upload-submissions.test.mjs` executes the real provenance migration against
minimal dependency tables based on the live catalog contract in
`docs/admin-uploads-contracts.md`. It exercises SQL authorization, RLS, member and
non-member admins, immutable operation/item identity, failure recovery, terminal
success replay, exactly-once audit insertion, program linkage and durable event
setup. Ordinary match writes create no provenance, and the migration grants no
additional match update/delete access.

This is not a clone of the deployed schema. It does not exercise deployed upload
and schedule triggers, multi-connection races, PostgREST, or the later console
mutation integrations. Those need separate integration coverage. The private
completion and setup helpers are exercised as the database owner with a session
actor, which models calls from later authorized SECURITY DEFINER mutation RPCs;
clients cannot execute them. Those RPCs must lock/register the operation before
side effects, return saved successes, and complete the ledger in the same
transaction as the mutation. The event setup RPC must lock the submission before
creating anything and reuse its existing event ID/setup result.

The migration is one-shot and must be recorded by the normal migration runner.
It intentionally fails on existing objects instead of hiding divergent schema.
Runtime operation/item retries are independently idempotent. These tests do not
apply the migration to the linked project or certify production deployment.
