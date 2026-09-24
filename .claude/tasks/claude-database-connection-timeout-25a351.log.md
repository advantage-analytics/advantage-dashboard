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
