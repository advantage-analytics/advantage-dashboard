# Tasks — claude/database-connection-timeout-25a351

> Scope: stop Playwright live-DB specs from churning auth users on the production Supabase project.

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Refuse the production project in the live-DB fixture unless opted in

- **status:** done
- **model:** opus
- **files:** guess: `tests/fixtures/live-db.ts`, `tests/live-db-target-guard.spec.ts` (new), `tests/claim-eyebrow-width.spec.ts`
- **done when:**
  - [ ] `tests/fixtures/live-db.ts` exports a pure `isProductionTarget(url, key)` that returns true when the URL hostname contains `pouxujkhtbvkdwbzfvka` OR when the anon/service-role key is a decodable JWT whose `ref` claim is `pouxujkhtbvkdwbzfvka`
  - [ ] `HAVE_ENV` is false when the target is production and `LIVE_DB_ALLOW_PROD` is not exactly `"1"`, and `SKIP_REASON` then names `LIVE_DB_ALLOW_PROD` and the prod ref — so every spec skipping on `!HAVE_ENV` skips against prod by default
  - [ ] `createLogin`, `createLogins` and `deleteAuthUsers` throw an error naming `LIVE_DB_ALLOW_PROD` before any auth call when the target is production and the opt-in is unset (backstop for specs that gate on something other than `HAVE_ENV`, e.g. `admin-routes.spec.ts`)
  - [ ] `tests/claim-eyebrow-width.spec.ts` (read-only) gates on a separate read-only flag (e.g. `HAVE_READ_ENV`) that does not require the opt-in
  - [ ] A new offline spec covers `isProductionTarget` with no network: prod hostname, non-prod hostname with a prod-ref key (mixed target), a loopback URL, and a non-JWT `sb_secret_…` key
- **notes:** Default to skipping, not failing, so `npm test` stays green in gates, CI and keyless checkouts. `upload-write-eligibility.spec.ts` already refuses any non-loopback URL and `schedule-outcomes-db.spec.ts` already requires a pinned local `DEV_URL` — neither needs changing. The key check exists because `env()` falls back per key to `.env.local`, so exporting only a branch URL would otherwise pair it with prod keys. Context: 2026-09-23 incident — ~43k auth.users inserts/~42.5k deletes from gate `npm test` runs across worktrees saturated the prod instance and broke sign-in. Routed opus (planner proposed fable) by author's call.

## T2 · Run live-DB specs one at a time under a lock shared across worktrees

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** guess: `playwright.config.ts`, `tests/fixtures/live-db-specs.ts` (new), `tests/fixtures/live-db-lock.ts` (new), `tests/live-db-target-guard.spec.ts`
- **done when:**
  - [ ] `playwright.config.ts` defines two `projects`: one takes the live-DB spec list with `workers: 1` and `fullyParallel: false`; the other ignores that list and keeps the current parallel behaviour
  - [ ] An offline spec asserts the exported live-spec list equals the set of `tests/*.spec.ts` files that call `createLogin(`, `createLogins(` or `auth.admin.createUser(`, so a new live spec cannot land outside the serial project
  - [ ] Live-DB runs take a lock at a fixed path under `os.tmpdir()` (same for every worktree on the machine); a second run waits a bounded time then fails with an error naming the lock path and the holder's pid; a lock left by a dead pid is taken over — unit-tested for all three cases with a fake clock and fake pid check
  - [ ] The lock is taken only when live writes are allowed (T1's `HAVE_ENV` true), so a keyless or skipped-prod run never waits
- **notes:** Per-project `workers` needs Playwright ≥1.52; the repo is on ^1.57. `workers: 1` alone serializes one run only — the cross-worktree stacking seen on 2026-09-23 needs the OS-level lock. Keep the `live-db-auth-retry.spec.ts` hook-budget test passing.

## T3 · Document the live-DB testing rule

- **status:** todo
- **model:** sonnet
- **needs:** T1, T2
- **files:** guess: `AGENTS.md`, `.env.example`, `.github/workflows/ci.yml`
- **done when:**
  - [ ] `AGENTS.md`'s Commands section has a testing note stating: live-DB specs skip against prod ref `pouxujkhtbvkdwbzfvka` unless `LIVE_DB_ALLOW_PROD=1`; they run serially under a machine-wide lock; never set the opt-in in a gate or loop, and never raise the auth rate limit; naming the 2026-09-23 saturation incident as the reason
  - [ ] That note says how to point live specs elsewhere: export `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in the shell (they take precedence over `.env.local`), and all three must name the same project
  - [ ] `.env.example` has a commented, empty `LIVE_DB_ALLOW_PROD=` entry saying what it enables and that it should stay unset
  - [ ] The stale "The 9 live-database specs" comment in `ci.yml` is corrected so it no longer states a spec count
- **notes:** Edit `AGENTS.md` only — never `CLAUDE.md` or `GEMINI.md`. Leave the `nextjs-agent-rules` block untouched.

## T4 · Add a pool of reused test users to the live-DB fixture

- **status:** todo
- **model:** opus
- **needs:** T2
- **files:** guess: `tests/fixtures/live-db.ts`, `tests/fixtures/live-db-pool.ts` (new), `tests/live-db-pool.spec.ts` (new)
- **done when:**
  - [ ] A `poolLogin(admin, slot)` / `poolLogins(admin, slots)` API returns a `Session` for a fixed `live-pool-<slot>@example.com` email, calling `auth.admin.createUser` only when that email does not exist and never calling `deleteUser`
  - [ ] Pool passwords are derived deterministically from a secret already in env (e.g. HMAC of the service-role key and the slot), so a reused user signs in without a per-run `updateUserById`
  - [ ] Before handing out a slot, the pool resets that user's `public.users` columns to a fixed default — the columns listed in code (including any admin/plan flags) with a comment naming which spec mutates each — and fails, naming the table, if leftover `program_members` or `programs` rows still reference the user
  - [ ] An offline spec with a stubbed admin client proves: a second `poolLogin` for the same slot issues no `createUser`, the password derivation is stable, and the reset issues an update with the defaults
  - [ ] `createLogin` / `createLogins` keep their current behaviour, each with a doc comment saying to use them only when a spec must delete the auth user it creates
- **notes:** Pool sharing is safe only because T2 serializes live specs across worktrees. Check the live schema via the Supabase MCP `list_tables` for `public.users` columns before choosing the reset list. A pool user's `public.users` row persists across runs, so domain cleanup must go by row id or run marker, never by cascading from an auth delete. Routed opus (planner proposed fable) by author's call.

## T5 · Move the RLS and workspace live specs onto the user pool

- **status:** todo
- **model:** opus
- **needs:** T4
- **files:** guess: `tests/saved-views-rls.spec.ts`, `tests/viz-bands-rls.spec.ts`, `tests/rls-workspace-isolation.spec.ts`, `tests/personal-home-scope.spec.ts`, `tests/point-bookmarks-db.spec.ts`, `tests/program-member-avatars.spec.ts`, `tests/seats-count-players.spec.ts`, `tests/pending-invites.spec.ts`
- **done when:**
  - [ ] None of the listed files contains `createLogin(`, `createLogins(` or `deleteAuthUsers(`; each gets its sessions from `poolLogin(s)`
  - [ ] Each listed file's `afterAll` still deletes every domain row its `beforeAll` inserted, by id or run marker — no cleanup relies on an auth-user delete cascading
  - [ ] Any listed spec that asserts a user owns nothing (e.g. an empty personal Home) removes that user's leftover rows in `beforeAll` before asserting
  - [ ] Pool slot names are unique per file, so two specs in one run never share a slot
- **notes:** Do not edit any spec that deletes an auth user as part of its assertions — `account-deletion-retention`, `match-video-attachments-db`, `schedule-outcomes-db` stay on `createLogin` behind T1's opt-in. If a listed file turns out to delete an auth user, leave it on `createLogin` and say why in the commit message.

## T6 · Move the admin and program live specs onto the user pool

- **status:** todo
- **model:** opus
- **needs:** T4
- **files:** guess: `tests/admin-self-promotion.spec.ts`, `tests/admin-routes.spec.ts`, `tests/admin-program-rpcs.spec.ts`, `tests/admin-conferences-rpcs.spec.ts`, `tests/join-requests-staff-read.spec.ts`, `tests/leave-program.spec.ts`, `tests/teams-management.spec.ts`, `tests/program-owner-name-live.spec.ts`
- **done when:**
  - [ ] None of the listed files contains `createLogin(`, `createLogins(` or `deleteAuthUsers(`; each gets its sessions from `poolLogin(s)`
  - [ ] Any listed spec that promotes a user or changes a `public.users` flag restores it in `afterAll`, and that column appears in T4's reset list
  - [ ] Each listed file's `afterAll` deletes the programs, members, claims and conferences it created, by id or run marker
  - [ ] Pool slot names are unique per file and do not overlap T5's
- **notes:** Same exclusions as T5. `admin-routes.spec.ts` also depends on `ADMIN_SMOKE_BASE_URL`/`ADMIN_SMOKE_CONFIRM` and a separately running server — keep those gates.
