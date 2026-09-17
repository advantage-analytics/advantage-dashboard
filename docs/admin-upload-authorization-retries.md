# Admin uploads: authorization and retry verification (T18)

Point-in-time verification on 2026-09-17 UTC, starting from branch
`codex/admin-uploads` at `0983fbdc`. This verifies source migrations and service
boundaries locally. It does not assert that Phase 2b is deployed or its migrations
are applied to the live database.

## Executed evidence

- `npm run test:database:postgres`: **17 passed**, PostgreSQL 17 in a disposable,
  loopback-only Docker container. Every race uses independent backend sessions.
  The first write stays uncommitted until a third connection observes the second
  backend in `pg_blocking_pids`; only then does the first commit or roll back.
- `npm run test:database`: **18 passed**, existing PGlite migration contracts.
  These remain sequential single-connection tests.
- Focused Playwright service/Edge/history tests: **120 passed** across
  `admin-file-processing`, `admin-upload-history`, `admin-dual-submission`,
  `admin-upload-context`, `admin-tournament-submission`, `admin-video-submission`,
  `admin-match-files`, `admin-analysis-attachment`,
  `job-submission-authorization`, and `upload-url-authorization` specs.
  Their storage, quota and vendor transports are fixtures; they send no external
  requests and spend no real quota.

| Contract                          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actual authorization boundaries   | PostgreSQL executes the real migration grants, RLS policies and SECURITY DEFINER bodies. Member and nonmember admins can read console provenance; ordinary members see no rows; anon reads fail. Browser INSERT/UPDATE/DELETE/TRUNCATE, service-only admission RPCs and private completion helpers are denied. Revoked admin status immediately prevents reads/admission. Wrong-program attachment lookup and another admin's video access fail. Existing service specs prove authorization precedes privileged clients and ignores workspace/actor spoofing. |
| Protected attachment result       | Both file and video races snapshot the entire coach match before attachment and compare every column afterward, allowing only the intended provider/method transition. A simultaneous score/participant edit waits, then fails. Existing file tests exercise each protected field and the video contract also protects its event entry.                                                                                                                                                                                                                       |
| Partial failure and lost response | Same-operation replay recovers the original durable IDs. Rolling back the first simultaneous admission allows the blocked retry to create exactly one committed match/link/audit. A file worker's simulated partial point write plus durable failure cannot be claimed again or create a second file. Dual/tournament tests retain prior successes across independent failures. Handler tests retain video quota/claim when vendor acceptance is followed by a lost queued write.                                                                             |
| Simultaneous writes               | File/video double admission, worker claims, video submit claims, quota reservation, attachment reservation, dual/tournament setup and apply, competing operations on one result, ordinary coach writes and tournament athlete registration all overlap in actual PostgreSQL sessions. Assertions check exact persisted counts, original IDs, refusal states and one audit.                                                                                                                                                                                    |
| Program charging and status       | One reservation charges the durable target program, never the admin account. Existing contracts verify college/club caps and roster eligibility. Claim-pending admits file imports but refuses video; suspended/archived refuse both. A concurrent program status change wins before the blocked quota transaction, which refuses with zero usage rows.                                                                                                                                                                                                       |

## Reproduce

Use a disposable PostgreSQL 17 cluster with a superuser able to create databases
and the `anon`, `authenticated` and `service_role` roles. Set
`ADMIN_UPLOADS_TEST_DATABASE_URL` to that cluster's **loopback** URL, then run:

```sh
npm run test:database:postgres
npm run test:database
```

The test driver never reads `.env.local`, refuses non-loopback hosts, creates a
random database per test and drops it in `finally`. It creates missing fixture
roles at the cluster level; therefore do not point it at a shared local cluster.
The opt-in command fails if the URL is missing, rather than silently skipping
concurrency evidence. Ordinary `test:database` retains its no-server PGlite path.
`pg` is a development dependency only.

The PostgreSQL harness reuses the PGlite video/schedule fixtures and executes
source migration files unchanged. Shared request fixtures keep sequential and
concurrent result semantics aligned. The schedule fixture includes the previously
captured live guard bodies. These are intentionally reduced base schemas, not a
clone of production: they verify the new migration boundaries and locking, not
all historical policies, unrelated triggers, deployed Edge versions, Azure,
vendor behavior or full media processing. Production deployment integration
remains a separate rollout check.

## RLS review

Independent root-agent review found **no unresolved findings** in the Phase 2b
boundaries reviewed for T18. No application,
RPC, policy or migration correction was needed by the executed tests; the T18
changes add verification and reusable fixtures only. The review covers admin
session gates before service clients, exact program/actor resolution, admin-only
provenance reads, private helper grants, service-only mutation RPCs, Edge durable
claim discovery and existing webhook/cron authentication boundaries.

The root review also confirmed RLS on all eight new tables, absence of new views,
session-authorized history links and a passing client import graph check. This
is the focused T18 review, not the T20 branch-wide specialist review or deployed
RLS verification.
