# Run log — claude/database-connection-timeout-25a351

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Refuse the production project in the live-DB fixture unless opted in — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass
**changed:** `tests/fixtures/live-db.ts` gains a production guard: pure `isProductionTarget(url, ...keys)` (hostname or JWT `ref` claim; non-JWT `sb_*` and malformed keys never throw), `HAVE_ENV` now false against prod unless `LIVE_DB_ALLOW_PROD=1` (read from the process env only, never `.env.local`), `SKIP_REASON` names the variable and ref, and `assertWritableTarget()` backstops `createLogin`/`createLogins`/`deleteAuthUsers`. New `HAVE_READ_ENV`/`READ_SKIP_REASON` keep read-only `claim-eyebrow-width.spec.ts` running. Offline `tests/live-db-target-guard.spec.ts` (6 cases). Dispatched after the prod DB recovered from the 2026-09-23 overload; the gate ran with the guard in place, so no user-creating spec hit prod.
**follow-ups:**

1. `scripts/*.ts` (e.g. `seed-programs.ts`, `cleanup-orphan-storage.ts`) use the service role with no production guard.
2. Against prod without the opt-in, `admin-routes.spec.ts`'s `afterAll` cleanup now throws from the `deleteAuthUsers` backstop even though nothing was created — make its cleanup a no-op when `READY` is false.
3. Only one spec besides the fixture calls `auth.admin.createUser` directly (`upload-write-eligibility`, loopback-only) — T2's live-spec list criterion should be read with that in mind.

## T2 · Run live-DB specs one at a time under a lock shared across worktrees — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass
**changed:** `playwright.config.ts` splits into a `live-db` project (`LIVE_DB_SPECS`, `workers: 1`, `fullyParallel: false`) and an `offline` project that ignores that list and keeps the parallel default. `tests/fixtures/live-db-specs.ts` holds the hand-kept list plus the `LIVE_DB_CALL` regex; a drift test in `live-db-target-guard.spec.ts` asserts it equals the files that call `createLogin(`/`createLogins(`/`auth.admin.createUser(` (and requires ≥10 matches). `tests/fixtures/live-db-lock.ts` is the `globalSetup`: a machine-wide hard-link lock at `os.tmpdir()/advantage-dashboard-live-db.lock`, polled every 5 s for up to 20 min, then an error naming the path, holder pid and cwd; dead-pid or unreadable locks are taken over; release removes only its own record. Taken only when `HAVE_ENV` is true, so keyless and refused-prod runs never wait. Offline lock tests use a fake clock and fake `isAlive`.
**follow-ups:**

1. `globalSetup` can't see CLI file filters, so a single offline spec run with writes allowed (non-prod target or `LIVE_DB_ALLOW_PROD=1`) still waits on another worktree's live lock — consider an env opt-out or a `live-db` setup project.
2. A reused pid reads as alive, so a stale lock after a pid wrap costs one bounded 20-min wait and a clear error rather than a takeover.

## T3 · Document the live-DB testing rule — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass
**changed:** `AGENTS.md` gets a paragraph under the Commands block: live-DB specs skip against `pouxujkhtbvkdwbzfvka` unless `LIVE_DB_ALLOW_PROD=1`, run serially under the machine-wide lock, never set the opt-in in a gate or loop, never raise the auth rate limit (citing the 2026-09-23 incident), and how to point them at another project via the three shell-exported Supabase vars. `.env.example` gains a commented, empty `LIVE_DB_ALLOW_PROD=` section. `ci.yml`'s header comment no longer states a spec count.
**follow-ups:**

1. `ci.yml` still says the Playwright config "declares no `projects`" — stale since T2 added `live-db`/`offline`.

## T4 · Add a pool of reused test users to the live-DB fixture — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass
**changed:** New `tests/fixtures/live-db-pool.ts`: `poolLogin`/`poolLogins` hand out fixed `live-pool-<slot>@example.com` users — found via `public.users` then auth, created only when absent, never deleted, behind `assertWritableTarget`. Passwords are HMAC-SHA256 of the slot keyed by the service-role key; one `updateUserById` + retry only on `invalid_credentials` (key rotation). Each hand-out first fails, naming the table, on leftover `program_members` (`user_id`, `invited_by`) or `programs` (`owner_user_id`) rows, then resets `POOL_USER_DEFAULTS` (`is_admin`, `plan`, `first_name`, `last_name`, `avatar_path`, each commented with its mutating spec) or inserts a missing row. `live-db.ts` exports the helpers the pool needs and splits `passwordSignIn` out of `signIn` (behaviour unchanged); `createLogin(s)` get use-only-when-deleting doc comments. `LIVE_DB_CALL` now also matches `poolLogin(s)(`. Offline `tests/live-db-pool.spec.ts` (13 tests, stubbed admin) imports the helpers under aliases so it stays in the parallel project. Reset columns chosen from the live `public.users` schema.
**follow-ups:**

1. The pool has never run against a real database — the first live run creates the `live-pool-*` users on whichever project is targeted.
2. `poolLogin` carries test-only `secret`/`signIn`/`guard` options for the offline spec; the real guard runs when they are omitted.
