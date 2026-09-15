# Tasks — claude/admin-claims-redesign-c793cc

> Scope: Phase 1 admin console (replace `/admin/claims` with Teams, Team page, Requests, Create team, admin emails) per `/Users/cjgimena/.claude/plans/synchronous-cuddling-phoenix.md`.

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

Full context, file tree and SQL skeletons: `/Users/cjgimena/.claude/plans/synchronous-cuddling-phoenix.md`.

## T1 · Security migration: block `users.is_admin` self-promotion

- **status:** done
- **model:** sonnet
- **files:** supabase/migrations/20260914100000_users_block_admin_self_update.sql
- **done when:**
  - [ ] Migration applied to the LIVE database via the Supabase MCP (`apply_migration`), not just written to the repo
  - [ ] `select tgname from pg_trigger where tgrelid='public.users'::regclass and not tgisinternal` lists `users_block_admin_self_update` alongside `users_block_plan_self_update`
  - [ ] The trigger fires `before insert or update of is_admin`, checks `new.is_admin is distinct from old.is_admin` (or `new.is_admin` true on insert), and raises `42501` only when `request.jwt.claims ->> 'role'` is `authenticated` or `anon` — mirroring `users_block_plan_self_update` in `supabase/migrations/20260806144035_separate_user_plan_from_role.sql`
  - [ ] `revoke all on public.users from anon, authenticated;` then explicit `grant select on public.users to authenticated;` and `grant update (<all columns except is_admin, plan>) on public.users to authenticated;` — confirm via `information_schema.role_table_grants`/`column_privileges` that `anon` has no grants on `public.users` and `authenticated` has no UPDATE on `is_admin` or `plan`
  - [ ] No `grant insert` added for `authenticated` (the row is created by `auth.users`' `on_auth_user_created` → `handle_new_user()`, not client-side) — confirm sign-up still works by reading `handle_new_user()`'s definition and its own grants (leave them untouched)
  - [ ] Partial index `users_admins_idx on public.users (id) where is_admin` created
  - [ ] A live spot-check: as a session with `authenticated` role and a real `auth.uid()`, `update users set is_admin = true where id = auth.uid()` fails with `42501`; a service-role update still succeeds
  - [ ] The existing admin user (`is_admin = true`) is untouched and `is_admin()` still returns true for them
- **notes:** This is the first task in the whole plan and should ship independently of everything else. Read the live grants first (`information_schema.role_table_grants` / `column_privileges` for `public.users`) and paste the findings into the migration's header comment before writing the `revoke`/`grant` statements — do not guess the current grant shape.

## T2 · Test: a signed-in user cannot self-promote to admin

- **status:** done
- **model:** sonnet
- **needs:** T1
- **files:** tests/admin-self-promotion.spec.ts
- **done when:**
  - [ ] New spec reuses `tests/fixtures/live-db.ts` (`createLogins`, `createAdminClient`, `deleteAuthUsers`, `HAVE_ENV`, `INSUFFICIENT_PRIVILEGE` or equivalent Postgres-error constant) and follows the structure of `tests/teams-management.spec.ts`
  - [ ] Case: a session-client `update` setting `is_admin = true` on the caller's own row fails with Postgres error code `42501`
  - [ ] Case: `rpc('is_admin')` for that session still returns `false` afterward
  - [ ] Case: a service-role client CAN set `is_admin = true` on the same row (proves the guard is role-scoped, not absolute)
  - [ ] Test users are created and cleaned up (`deleteAuthUsers`) even on failure
  - [ ] `npx playwright test admin-self-promotion` passes against the live DB, and skips cleanly with a stated reason when required env vars are absent

## T3 · Schema: claim verification columns + admin query indexes

- **status:** done
- **model:** sonnet
- **files:** supabase/migrations/20260914100100_claim_verification_and_admin_indexes.sql
- **done when:**
  - [ ] Migration applied to the LIVE database via the Supabase MCP
  - [ ] `program_claims` has (idempotent `add column if not exists`): `verification_token_hash text`, `verification_sent_at timestamptz`, `verification_opened_at timestamptz`, `verified_at timestamptz`, `voucher_note text`
  - [ ] A DO-block CHECK constraint `program_claims_voucher_note_len` limits `voucher_note` to ≤500 chars, added only `if not exists` in `pg_constraint`
  - [ ] Unique partial index on `program_claims (verification_token_hash) where verification_token_hash is not null`
  - [ ] Partial index `program_claims_review_queue_idx on program_claims (status, created_at) where status in ('pending_review', 'objected')`
  - [ ] Index `program_claims_created_idx on program_claims (created_at desc, id)` and `program_requests_created_idx on program_requests (created_at desc, id)`
  - [ ] Index `programs_status_idx on programs (status)` and `programs_directory_keyset_idx on programs (school_name, id)`
  - [ ] Index `processing_usage_account_month_idx on processing_usage (account_id, account_type, billing_month)`
  - [ ] All of the above confirmed present via `select indexname from pg_indexes where schemaname='public'` on the live DB
- **notes:** `verification_token_hash` existed once and was dropped in `20260817213512` because nothing read it — re-adding is clean, no data migration needed.

## T4 · RPCs: admin gates on existing functions + two new admin-only RPCs

- **status:** done
- **model:** opus
- **needs:** T3
- **files:** supabase/migrations/20260914100200_admin_program_rpcs.sql
- **done when:**
  - [ ] Before writing anything, the LIVE bodies of `set_program_member_role`, `set_program_crest`, `create_program_invite` (6-arg), `revoke_program_invite`, `transfer_program_ownership`, and `create_custom_program` were read via `pg_get_functiondef` on the live DB (NOT from the migrations folder, which is ~100 migrations behind) and quoted/referenced in the migration's header comment
  - [ ] `set_program_member_role` recreated from its live body with one addition: after it resolves the caller's role, `if public.is_admin() then v_caller := 'owner'; end if;` (or the equivalent local-variable name in the live body) — every other line unchanged from the live definition
  - [ ] `set_program_crest` and `create_program_invite` (6-arg) recreated from their live bodies with their staff-only gate widened to `is_program_staff(p_program_id) or public.is_admin()`
  - [ ] `revoke_program_invite` gets the same widened gate if its live body currently gates on staff only
  - [ ] New `admin_transfer_program_ownership(p_program_id uuid, p_new_owner uuid) returns void`: checks `public.is_admin()` first (raises `42501` otherwise), locks the program row (`for update`), demotes whichever row currently has `role = 'owner'` (if any) to `coach`, requires the target to already be `coach` or `staff` on the program (raises a clear error otherwise), promotes the target to `owner`, updates `programs.owner_user_id`, and inserts a `program_audit_log` row with action `'ownership.transferred'` and `details` including `{"by_admin": true}`
  - [ ] New `admin_create_program(p_org_type text, p_school_name text, p_team text, p_program_key text, p_school_group text, p_division text, p_conference text, p_city text, p_state text, p_primary_domain text) returns uuid`: checks `public.is_admin()` first, validates `org_type` against the same set as `programs_org_type_check`, validates school name length, requires `p_program_key`/`p_school_group`/`p_team` all non-null when `org_type = 'college'` (mirroring `programs_college_fields_check`), inserts with `status = 'unclaimed'`, returns the new id
  - [ ] All four/six functions are `security definer`, `set search_path = ''`, `revoke all ... from public, anon`, `grant execute ... to authenticated`
  - [ ] Applied to the live database via the Supabase MCP
  - [ ] Live spot-check: a non-admin, non-member session gets `42501` calling `admin_transfer_program_ownership` and `admin_create_program`; an admin session succeeds on a program they do not belong to

## T5 · Test: admin RPC gates

- **status:** done
- **model:** sonnet
- **needs:** T4
- **files:** tests/admin-program-rpcs.spec.ts
- **done when:**
  - [ ] Reuses the same fixture module as T2 and the `UNIQUE_VIOLATION`/`INVALID_PARAMETER`-style Postgres error constants pattern from `tests/teams-management.spec.ts`
  - [ ] Case: an admin can `set_program_member_role` (e.g. coach → staff) on a program they are not a member of
  - [ ] Case: a non-member, non-admin session gets `42501` on the same call
  - [ ] Case: `admin_transfer_program_ownership` moves both `program_members.role` and `programs.owner_user_id`; a second manual insert of `role='owner'` for the same program still fails `23505` (the `programs_one_owner` partial unique index still holds)
  - [ ] Case: `admin_transfer_program_ownership` works when the program currently has no owner row at all
  - [ ] Case: `admin_create_program` refuses a non-admin (`42501`), refuses `org_type='college'` missing key/group/team (`22023` or equivalent), and successfully creates a club program with `program_key` null and `status='unclaimed'`
  - [ ] All cases clean up their rows/users; passes live, skips cleanly without env

## T6 · Guard module, action revalidation, pilot constants

- **status:** done
- **model:** sonnet
- **files:** src/lib/services/programs/admin-guard.ts, src/lib/services/programs/admin-actions.ts, src/lib/services/splitstep/config.ts
- **done when:**
  - [ ] New `src/lib/services/programs/admin-guard.ts` exports `requireAdmin(): Promise<{ id: string } | null>` (the body moved verbatim out of `admin-actions.ts`, same cookie-client + `users.is_admin` lookup) and `requireAdminOrNotFound(): Promise<{ id: string }>` which calls `notFound()` (unauthenticated → the caller's own `redirect("/login")` still applies at the layout level; this helper is for server components already past that gate, or it redirects itself if no session — match `admin/layout.tsx`'s existing semantics)
  - [ ] `admin-actions.ts` imports `requireAdmin` from the new module instead of defining it locally; every `revalidatePath("/admin/claims")` call is replaced with `revalidatePath("/admin", "layout")`
  - [ ] `src/lib/services/splitstep/config.ts` exports `PILOT_ENDS_AT = "2026-12-31"`, `formatPilotEnd(): string` returning `"Dec 31, 2026"` computed in UTC (per `docs/email-system.md`'s UTC-date rule), and `getMonthlyCapHours(accountType: AccountType): number` (thin wrapper deriving hours from the existing `MONTHLY_CAP_HOURS`/`getMonthlyCapSeconds`, not a new source of truth)
  - [ ] `npx tsc --noEmit` passes
  - [ ] `grep -rn "/admin/claims" src` returns nothing (the route itself is deleted/redirected in a later task, but no code should reference the old path by then)

## T7 · Shared primitives: ViewPills, extracted vertical stepper, plan-pill tokens

- **status:** done
- **model:** sonnet
- **files:** src/components/admin/view-pills.tsx, src/components/dashboard/shared/vertical-steps.tsx, src/components/dashboard/matches/new-match-wizard/UploadMatchSuccess.tsx, src/components/admin/plan-pills.tsx, src/styles/design-system/colors.css
- **done when:**
  - [ ] `src/components/admin/view-pills.tsx` exports a generic `ViewPills<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void })`, copying the exact geometry of `LifecycleChips` (`src/components/dashboard/matches/lifecycle-chips.tsx`): 26px height, `role="group"`, each pill `aria-pressed`, active state = `--border-medium` box-shadow + `--surface-subtle` background + `--ink-900` text at 500 weight, inactive = `--ink-500`/600 text, no counts and no dots on any pill
  - [ ] `Step`, `StepMark`, `LABEL_INK`, and the `StepState` type are cut out of `UploadMatchSuccess.tsx` (currently file-local, ~lines 496–600) into `src/components/dashboard/shared/vertical-steps.tsx`, renamed `VerticalStep` and `StepMark` (keep `StepState` name), and re-imported into `UploadMatchSuccess.tsx` — no behavioral or visual change to that file
  - [ ] `colors.css` gains `--pilot-bg` and `--pilot-text` custom properties (light-mode values; edit with `sed`, not the Edit tool, per the file's `.prettierignore` exclusion and the "colors.css formatter hook" pitfall) sized/shaped consistently with the existing `--success`/`--warning` token pairs
  - [ ] `src/components/admin/plan-pills.tsx` exports `PilotPill` (uses `--pilot-bg`/`--pilot-text`, 22px height, 12px/500 text, `rounded-[var(--radius-pill)]` or the repo's equivalent full-radius token) and `ApproveChip` (uses the existing `--warning-bg`/`--warning-border`/`--warning-text` tokens, same 22px/12px sizing, clickable — accepts `onClick`)
  - [ ] `npm run dev` render check (or existing wizard Playwright spec) confirms `UploadMatchSuccess`'s stepper is visually unchanged
  - [ ] `node scripts/check-design-drift.mjs` shows no new drift beyond the seeds this task is expected to touch (none — this task adds tokens properly rather than inlining hex)

## T8 · Admin shell: layout, header, account menu

- **status:** done
- **model:** opus
- **needs:** T6, T7
- **files:** src/app/admin/layout.tsx, src/components/admin/admin-header.tsx, src/components/admin/admin-account-menu.tsx
- **done when:**
  - [ ] `admin/layout.tsx` keeps the current guard semantics — unauthenticated → `redirect("/login")`, authenticated non-admin → `notFound()` — now via `requireAdminOrNotFound()`/the layout's own session check from T6, and renders `AdminHeader` + `<main>` instead of the old inline header markup
  - [ ] `AdminHeader`: wordmark block copied from `src/components/dashboard/mobile-gate.tsx`'s `<Image src="/logos/logo4.svg">` usage, followed by a 1px × 14px `--border-medium` divider, then "Admin" at 12px `--ink-500`
  - [ ] Centred nav with four tabs — Teams, "Requests" (with a live count suffix, e.g. "Requests · 3", loaded server-side after the guard as `count: "exact", head: true` over `program_claims` in `pending_review`/`objected` plus open `program_requests`; the count is plain text in the label, never a numeric badge element — chrome.md bans badges), Conferences, Uploads — each a `Link`; the active tab uses `--surface-subtle` background + `--ink-900`/500 text at ~30px height with the repo's button radius token; inactive tabs are `--ink-600`
  - [ ] A 28px ghost Search trigger (icon + the word "Search", no bare-icon button) that will open `AdminSearch` (stubbed/wired in T12 — acceptable to leave as a no-op or `disabled` placeholder here if T12 hasn't landed yet, but the visual slot exists)
  - [ ] `AdminAccountMenu`: `PersonAvatar` + `FloatMenu`/`FloatMenuItem`/`FloatMenuDivider` (`src/components/ui/float-menu.tsx`) containing "Back to the dashboard" (→ `/dashboard`) and "Sign out" behind a `ConfirmDialog`, calling `createClient().auth.signOut({ scope: "local" })` exactly as `src/components/dashboard/logout-dialog.tsx` does
  - [ ] Body background is `--surface-page`; `<main>` capped at a reasonable max width (1200px) with standard page padding
  - [ ] All four tab routes (even as placeholders from T9) render inside this shell for a real admin session; a non-admin gets 404; radius written only as `rounded-[var(--radius-*)]`; no `focus-visible:ring-*` utilities

## T9 · Placeholders, redirects, deletions, MAP + drift seed

- **status:** done
- **model:** sonnet
- **needs:** T8
- **files:** src/app/admin/page.tsx, src/app/admin/conferences/page.tsx, src/app/admin/uploads/page.tsx, src/app/admin/claims/page.tsx, src/components/admin/review-rows.tsx, next.config.ts, scripts/check-design-drift.mjs, src/lib/services/email/index.ts, MAP.md
- **done when:**
  - [ ] `src/app/admin/page.tsx` is a server component that `redirect("/admin/teams")`
  - [ ] `src/app/admin/conferences/page.tsx` and `src/app/admin/uploads/page.tsx` render `ComingSoonPage` (`src/components/dashboard/coming-soon.tsx`) with an action pointing back to `/admin/teams`
  - [ ] `next.config.ts` adds a redirect from `/admin/claims` to `/admin/requests` (temporary, `permanent: false`)
  - [ ] `src/app/admin/claims/page.tsx` and `src/components/admin/review-rows.tsx` are deleted
  - [ ] `scripts/check-design-drift.mjs`'s `hex` check seed is lowered from 1 to 0 (the one hex value it tracked was in `review-rows.tsx`), with its comment updated to say why
  - [ ] `src/lib/services/email/index.ts`'s doc comment referencing `app/admin/claims/page.tsx` is updated to point at wherever the admin requests page now lives
  - [ ] `npm run map` was run and `MAP.md` reflects the new/removed routes
  - [ ] `npm test` passes, including `tests/generate-map.spec.ts` and the design-drift spec
  - [ ] `curl -I` (or an equivalent check) on `/admin/claims` shows a 307/308 to `/admin/requests`; `grep -rn review-rows src` is empty

## T10 · Teams list loader

- **status:** done
- **model:** sonnet
- **needs:** T6
- **files:** src/lib/data/admin-teams-server.ts
- **done when:**
  - [ ] Exports `listAdminTeams({ view, sort, after, limit = 50, filters }): Promise<{ rows: AdminTeamRow[]; nextCursor: string | null }>`, calling `requireAdminOrNotFound()` then reading with `createAdminClient()` (service role)
  - [ ] `view` is one of `'on_advantage' | 'in_pilot' | 'needs_review' | 'all'` mapped to: On Advantage = `status in ('active','claim_pending')`; In pilot = `status = 'active'`; Needs review = has a claim in `pending_review`/`objected` OR an open `program_requests` row for that program; Whole directory = no status filter
  - [ ] One PostgREST query on `programs` embedding the latest `program_claims` row and a `program_members` count; a second query grouping open `program_requests` counts by `program_id` for exactly the ids on the current page (no per-row N+1 query)
  - [ ] Keyset pagination on `(school_name, id)` — `after` is an opaque cursor string; a pure `cursorFor(row)` / `parseCursor(cursor)` pair is exported and unit-tested (e.g. in a co-located `.test.ts` or existing test convention)
  - [ ] `AdminTeamRow` shape includes: `id, name, team, orgType, division, conference, state, status, crestUrl, memberCount, ownerName, plan: 'pilot' | 'approve' | 'none', pendingClaim?: { id: string; claimantName: string; claimedEmail: string; createdAt: string }`
  - [ ] Reuses `programDisplayName`, `teamLabel`, `divisionLabel` from `src/lib/data/programs-server.ts` and `crestUrl` from `src/lib/data/teams-server.ts` — no re-implementation of program name/label formatting
  - [ ] Each of the four views returns sensible rows against the live database (verified via Supabase MCP or a throwaway script)

## T11 · Teams table component

- **status:** todo
- **model:** sonnet
- **needs:** T7, T10
- **files:** src/components/admin/teams-table-layout.ts, src/components/admin/teams-table.tsx
- **done when:**
  - [ ] `teams-table-layout.ts` exports grid track constants and column label constants following the exact pattern of `src/components/dashboard/team/roster-table-layout.ts` (`COL`/`ROW`/`*_COLUMNS`)
  - [ ] `teams-table.tsx` renders columns Team (crest + name 13px/500 + squad in `text-micro`) · Division · Conference · State · Members (tabular numerals) · Plan (fixed-width cell: `PilotPill`, `ApproveChip`, or a dash/`EmptyMark`) · Owner (fluid, 12px `--ink-600`)
  - [ ] Row height is 52px; a hairline separates the header row from the body, nothing separates individual rows
  - [ ] `ProgramCrest` (`src/components/dashboard/settings/teams/program-crest.tsx`) supports a 26px size (add to its size union if it doesn't already)
  - [ ] Each row is a `Link` to `/admin/teams/[id]` with a trailing 13px chevron (ink-300 → ink-900 on hover); the Plan cell's `ApproveChip`, when present, is a `<button>` that calls `event.stopPropagation()` so clicking it does not navigate
  - [ ] Empty state uses `TableEmptyBody` (`src/components/dashboard/shared/table-empty-body.tsx`)
  - [ ] Renders correctly against fixture/mock rows; `node scripts/check-design-drift.mjs` seeds unchanged from T7's baseline

## T12 · Teams page: content, approve-pilot popover, admin search

- **status:** todo
- **model:** opus
- **needs:** T8, T11
- **files:** src/app/admin/teams/page.tsx, src/components/admin/teams-page-content.tsx, src/components/admin/approve-pilot-popover.tsx, src/components/admin/admin-search.tsx, src/lib/data/admin-search-server.ts
- **done when:**
  - [ ] `src/app/admin/teams/page.tsx` is `force-dynamic`, reads `searchParams` for `view`/`sort`/`after`/filters, calls `listAdminTeams`, and renders `TeamsPageContent`
  - [ ] `TeamsPageContent` wires `ViewPills` (from T7) to the URL's `view` param, `FilterTrigger`/`SortTrigger` (`src/components/dashboard/shared/list-toolbar-trigger.tsx`) opening `FloatMenu` panels for filters/sort, a one-sentence grey summary strip stating the applied cut (never accumulating chips — tables.md rule), and a "Load more" control that appends the next keyset page
  - [ ] A "Create team" primary button sits in the page's title slot; it can open a stub/disabled dialog for now if T23 hasn't landed, but the button and its slot exist
  - [ ] `ApprovePilotPopover` (built on `src/components/ui/popover.tsx`): title "Start the pilot for {teamName}?"; three fact lines "Team pool {getMonthlyCapHours('program')} h every month", "Each member {getMonthlyCapHours('individual')} h", "Ends {formatPilotEnd()}"; a "Decline" ghost button calling `rejectClaim(claimId)` and an "Approve" primary button calling `approveClaim(claimId)`; failures surface via `DialogProblem` (`src/components/ui/dialog-problem.tsx`)
  - [ ] `admin-search-server.ts` exports `adminSearchTeams(term: string)`: service-role query on `programs` (`ilike('school_name', ...)`, limit 8) — deliberately not the `search_programs` RPC, which excludes custom orgs and returns keys rather than ids; `admin-search.tsx` is a client component wiring an input to this action and rendering results as links to `/admin/teams/[id]`
  - [ ] Switching view pills, sort, and filters updates the URL and the visible rows; approving a pilot flips that row's Plan cell to `PilotPill` after `router.refresh()`; the claimant's approval email still sends (the existing `transition()`/`claimApprovedEmail` path in `admin-actions.ts` is unchanged)

## T13 · Requests list loader

- **status:** todo
- **model:** sonnet
- **needs:** T3, T6
- **files:** src/lib/data/admin-requests-server.ts
- **done when:**
  - [ ] Exports `listAdminRequests({ view, after, limit }): Promise<{ rows: AdminRequestRow[]; nextCursor: string | null }>` behind `requireAdminOrNotFound()` + `createAdminClient()`
  - [ ] `view` is one of `'waiting' | 'verifying' | 'live' | 'closed'` mapped to: Waiting on you = claims `pending_review`/`objected` plus `program_requests.status = 'open'`; Verifying = claims with `verification_sent_at` set and `verified_at` null; Live = claims `objection_window`/`approved`; Closed = claims `rejected`/`objected` plus requests `resolved`/`dismissed` — note `objected` legitimately appears in both Waiting-on-you and Closed depending on whether it's still open for action; resolve any overlap by treating `objected` as Waiting-on-you (it needs a decision) and only fully `rejected` claims plus resolved/dismissed requests as Closed
  - [ ] Merges two queries — `program_claims` (selecting `id, status, claimed_email, claimant_name, claimant_role, domain_matched, skips_manual_review, contact_matched, match_reason, review_notes, claimant_message, verification_sent_at, verification_opened_at, verified_at, voucher_note, created_at`, embedding `programs(id, school_name, team, division, state, staff_page_url, review_reasons, primary_domain)`) and `program_requests` (`id, kind, email, name, role, note, school_name, team, status, created_at`, embedding `programs(...)` where present) — into one `AdminRequestRow` union: `{ id, source: 'claim' | 'request', date, team, for: string, from: { name, email }, emailCheck: 'verified' | 'opened' | 'sent' | 'contact' | 'domain' | 'none', status, detail }`
  - [ ] Rows sorted by `created_at desc`, cut to `limit`; a pure `mergeRequestRows(claims, requests, limit)` helper is exported and unit-tested for correct interleaving and cursor cutoff
  - [ ] Reuses `claimRoleLabel` (`src/lib/services/programs/claim-roles.ts`), `reviewReason` (`claim-state.ts`), `programDisplayName`
  - [ ] Each of the four views returns sensible rows against the live database

## T14 · Requests table + page shell

- **status:** todo
- **model:** sonnet
- **needs:** T7, T13
- **files:** src/components/admin/requests-table-layout.ts, src/components/admin/requests-table.tsx, src/app/admin/requests/page.tsx
- **done when:**
  - [ ] `requests-table-layout.ts` follows T11's layout-module pattern
  - [ ] `requests-table.tsx` renders columns Date (72px, 12px tabular, `--ink-700`, leads the row) · Team (crest + name) · For (12px role/kind label) · From (name 13px/500 + email 12px `--ink-600`, truncating) · Email check (a 13px glyph + word — "Verified · Approve" rendered as the `ApproveChip`-style filled chip, "Sent · not opened" as plain grey text, a dash otherwise — never a green fill for this column since it isn't an outcome)
  - [ ] Rows are 52px, container rows per tables.md rule 3: no trailing chevron, selection wash persists, click opens the drawer (wired in T15) rather than navigating
  - [ ] `src/app/admin/requests/page.tsx` reads `view`/`after` from `searchParams`, calls `listAdminRequests`, renders `RequestsTable` inside `RequestsPageContent` (built in T15) with `ViewPills` for Waiting on you / Verifying / Live / Closed
  - [ ] Empty state uses `TableEmptyBody`

## T15 · Requests drawer + selection state machine

- **status:** todo
- **model:** opus
- **needs:** T7, T14
- **files:** src/components/admin/requests-page-content.tsx, src/components/admin/request-drawer.tsx
- **done when:**
  - [ ] `RequestsPageContent` implements the three-state selection machine copied from `src/components/dashboard/team/roster-view.tsx` (~lines 88–196): `selectedId`/`drawerId`/`closing` state, `finishClose`, `select(row, viaKeyboard)`, `close(returnFocusTo)` with its 240ms fallback timer, `toggle`, `step(direction)`, and `?id=` URL sync via `history.replaceState`
  - [ ] Uses `PeekDrawerFrame` from `src/components/dashboard/matches/match-drawer.tsx` (props: `kind="Request"`, `label`, `index`, `total`, `canPrev`, `canNext`, `closing`, `autoFocus`, `focusKey`, `actions`, `footer`, `children`, `onPrev`, `onNext`, `onClose`, `onClosed`) rather than re-copying the drawer shell
  - [ ] `RequestDrawer` body: team crest/name/pills + a relative-age line ("Sep 13 · 1 day"); a light grey box with the claimant's `PersonAvatar`, name/role/email, and their `claimant_message` shown as a quote; a "What we know" list of checks built from `domain_matched`, `contact_matched`, `skips_manual_review`, `match_reason`, and `programs.review_reasons`, plus a link to `staff_page_url` when present
  - [ ] An "Email check" section rendered as `VerticalStep`s (from T7) with states derived from `verification_sent_at`/`verification_opened_at`/`verified_at` (Sent → Waiting to confirm → You approve); "Resend" button calls `sendClaimVerification(claimId)` (added in T16) and "Copy link" copies the URL it returns
  - [ ] An admin note textarea bound to `saveClaimNote(claimId, notes)` (added in T16), saving `review_notes` (never emailed — the UI says so)
  - [ ] A `⋯` `FloatMenu` offers Reject (opens a 440px `ConfirmDialog` with `tone="danger"` and a claimant-facing message field using `advField("underline")`/`SettingsUnderlineInput`, calling `rejectClaim(id, notes, claimantMessage)`), "Hand it back" for live claims (`handBackClaim`), and "Put back in the queue" for closed claims (`reopenClaim`) — destructive action last, grey at rest
  - [ ] Footer is one full-width button: ghost "Approve anyway" when the claim is a personal address and not yet verified, primary "Approve" when verified/contact-matched/domain-matched — both call `approveClaim(claimId)`; for `program_requests` rows the footer is "Done"/"Dismiss" calling `resolveRequest(id, 'resolved' | 'dismissed')`
  - [ ] Click opens the drawer and selects the row (wash persists); `↑`/`↓` step between rows; `Esc`, the `X`, or re-clicking the selected row closes with the width keyframe; a `?id=` deep link opens directly to that row
  - [ ] Every action (Approve, Reject, Hand back, Reopen, Resend, Copy link, save note, Done/Dismiss) round-trips and the corresponding row's visible state updates after refresh

## T16 · Claimant identity verification email + `/claim/verify-identity`

- **status:** todo
- **model:** opus
- **needs:** T3, T6
- **files:** src/lib/services/programs/claim-verification.ts, src/lib/services/programs/admin-actions.ts, src/lib/services/email/templates/claim.ts, src/lib/services/email/index.ts, src/app/claim/verify-identity/page.tsx, src/app/claim/verify-identity/actions.ts, tests/claim-verification.spec.ts
- **done when:**
  - [ ] `claim-verification.ts` uses `generateToken`/`hashToken`/`tokenMatches` (or the repo's exact equivalents in `src/lib/services/programs/tokens.ts`) to mint a token, store only its hash, and compute usability as `verification_sent_at + 7 days` via the existing `addHours` helper from `claim-state.ts` (no new expiry column)
  - [ ] `admin-actions.ts` gains `sendClaimVerification(claimId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }>` (calls `requireAdmin`, mints + stores the token hash, stamps `verification_sent_at`, sends `claimVerifyIdentityEmail`, returns the verify URL to the admin caller for "Copy link") and `saveClaimNote(claimId: string, notes: string): Promise<AdminOutcome>` (updates `review_notes` only)
  - [ ] `templates/claim.ts` adds `claimVerifyIdentityEmail({ to, programName, claimantTitle, token }): EmailContent`-shaped export built via `renderEmail`/`EmailContent` (preheader "Confirm it's you"; eyebrow "Verification"; heading "Are you {programName}'s {claimantTitle}?"; one-sentence body; a single CTA "Confirm it's me" linking to `${siteUrl()}/claim/verify-identity?token=...`; a note that ignoring the email is safe); it is exported from `src/lib/services/email/index.ts` with a new row added to that file's "what exists / what fires it" table (per `docs/email-system.md`'s 7-step checklist)
  - [ ] `src/app/claim/verify-identity/page.tsx` (GET, no side effects beyond stamping `verification_opened_at` once if null) hashes the incoming token, looks up the claim via the service-role client, and renders the question plus an optional "add a note" underline field, reusing the visual frame of `src/app/claim/review/page.tsx`; an expired/unknown token renders in the register of `/claim/verify/failed`
  - [ ] `src/app/claim/verify-identity/actions.ts` exports `confirmClaimIdentity(token: string, note?: string)` — a POST-only server action (never triggered by the GET, so a link-prefetcher cannot "confirm" it) — re-validates the token, sets `verified_at` and `voucher_note` (≤500 chars), and returns a success view
  - [ ] `tests/claim-verification.spec.ts` is a pure unit test covering mint → hash → match and the 7-day expiry boundary, with no live-DB dependency
  - [ ] End-to-end: clicking "Resend" in the T15 drawer writes `verification_sent_at`; visiting the emailed link stamps `verification_opened_at`; submitting the confirmation stamps `verified_at`; the Requests row's Email check column then shows "Confirmed"/the equivalent

## T17 · Admin "needs a decision" notification email

- **status:** todo
- **model:** sonnet
- **needs:** T6
- **files:** src/lib/services/email/templates/admin.ts, src/lib/services/email/index.ts, src/lib/services/notifications/admin-review-mail.ts, src/lib/services/programs/claim-actions.ts
- **done when:**
  - [ ] `templates/admin.ts` exports `adminReviewNeededEmail({ to, programName, claimantName, claimedEmail, reason, requestsUrl }): EmailContent`-shaped content with a single CTA "Open requests" linking to `${siteUrl()}/admin/requests?id=<id>`; exported from `email/index.ts` with a doc-table row added
  - [ ] `admin-review-mail.ts` exports `notifyAdminsReviewNeeded(db, { kind: 'claim' | 'request', id, ... })`: gated once per event via `claimSend("admin_review:<kind>:<id>")` (the existing idempotency helper in `src/lib/services/notifications/should-notify.ts`), then reads every admin's email with the service-role client filtered on `is_admin = true` (using the `users_admins_idx` partial index from T1) and sends one email per admin
  - [ ] Wired after the durable write completes (never before) in `claim-actions.ts`: `completeClaim()`/`completeClaimWithToken()` when the resulting status is `pending_review` and `!autoApproved`; `raiseObjection()` when the transition lands on `objected`; `requestInvite()` on a newly created open `program_requests` row; `submitUnlistedProgram()` on its own new open row
  - [ ] A pending-review claim produced on the live DB (or in mock/no-key mode) results in exactly one notification per admin, and re-triggering the same event sends nothing further (idempotency key holds)
  - [ ] Import discipline respected: only from `@/lib/services/email`, never `send.ts`/`shell.ts`/`templates/*` directly, and `sendEmail()` is never wrapped in a retry/try-catch

## T18 · Team page loader

- **status:** todo
- **model:** opus
- **needs:** T6
- **files:** src/lib/data/admin-team-server.ts
- **done when:**
  - [ ] Before writing the usage/seat logic, the LIVE bodies of `program_usage_total`, `program_usage_by_member`, and `program_seat_usage` were read via `pg_get_functiondef` (the repo's migration copies are stale) and their exact filtering conventions (`sum(coalesce(actual_seconds, reserved_seconds)) where not released`, the seat-count source column) are mirrored precisely
  - [ ] Exports `getAdminTeam(programId: string)`, wrapped in `React.cache()`, calling `requireAdminOrNotFound()` then reading everything with `createAdminClient()` (service role) — because the existing RPCs (`program_roster`, `program_seat_usage`, `program_usage_total`) all gate on `user_program_ids()` and return nothing/zero for a non-member admin
  - [ ] Returns `{ program: {...identity, status, orgType, primaryDomain, createdAt, claimedAt}, claim: latest claim row or null, members: TeamMember[], invites: TeamInvite[], joinRequests: (open program_requests where kind='invite_request'), seats: SeatUsage, usage: ProgramUsage, usageByMonth: (month: string) => Promise<ProgramUsage> }`
  - [ ] Reuses the `TeamMember`/`TeamInvite`/`MemberRole` types from `src/lib/data/team-settings-server.ts`, `SeatUsage` from `teams-server.ts`, and `getMemberAvatarUrls` from `src/lib/data/member-avatars-server.ts` (passed the admin client), plus `currentBillingMonth`/`monthlyCapSecondsFor` from the splitstep config/quota modules
  - [ ] Numbers returned for a program the tester actually belongs to match what Settings › Teams shows for that same program (manual spot-check against the live DB)

## T19 · Team page frame: header, tabs, coming-soon stubs

- **status:** todo
- **model:** sonnet
- **needs:** T7, T8, T18
- **files:** src/app/admin/teams/[programId]/layout.tsx, src/components/admin/team-page-header.tsx, src/components/admin/team-tabs.tsx, src/app/admin/teams/[programId]/people/page.tsx, src/app/admin/teams/[programId]/roster/page.tsx, src/app/admin/teams/[programId]/schedule/page.tsx, src/app/admin/teams/[programId]/activity/page.tsx
- **done when:**
  - [ ] `layout.tsx` calls `getAdminTeam(programId)` (from T18) once, calls `notFound()` for an unknown id, and renders `TeamPageHeader` + `TeamTabs` + `{children}`
  - [ ] `TeamPageHeader`: crest (`ProgramCrest` at 52px for now — T20 wires the upload control), team name, `StatePill` "Active" plus `PilotPill`/`ApproveChip` as appropriate from the claim/program status, a facts line built from `programSubtitle` (`src/lib/data/programs-server.ts`) joined with middots
  - [ ] `TeamTabs` renders Overview / People / Roster / Schedule & results / Usage / Activity log using the 2px blue underline "a tab is a choice" grammar (matching `src/components/dashboard/settings/settings-navigation.tsx`'s pattern), linking to `/admin/teams/[programId]`, `/people`, `/roster`, `/schedule`, `/usage`, `/activity` respectively
  - [ ] The four non-Phase-1 tab pages (`people`, `roster`, `schedule`, `activity`) each render `ComingSoonPage` with copy naming that specific section and an action back to Overview
  - [ ] Visiting `/admin/teams/<real-id>` shows the header and all six tabs with the correct one highlighted per route; an unknown id 404s

## T20 · Injectable actions on settings-team components + admin team actions

- **status:** todo
- **model:** opus
- **needs:** T4, T6
- **files:** src/lib/services/programs/admin-team-actions.ts, src/components/dashboard/settings/teams/role-menu.tsx, src/components/dashboard/settings/teams/transfer-ownership-dialog.tsx, src/components/dashboard/settings/teams/crest-control.tsx
- **done when:**
  - [ ] `RoleMenu` gains an optional `action?: typeof setProgramMemberRole` prop, defaulting to the existing imported action — no other change to its behavior or rendering when the prop is omitted
  - [ ] `TransferOwnershipDialog` gains an optional `action?: typeof transferProgramOwnership` prop with the same default-preserving behavior
  - [ ] `CrestControl` gains optional `upload?: typeof uploadProgramCrest` and `remove?: typeof removeProgramCrest` props with the same default-preserving behavior
  - [ ] `admin-team-actions.ts` exports, each starting with `requireAdmin()` and using the **session** client (not service role) for RPC calls so `auth.uid()` in audit rows is the admin: `adminSetProgramMemberRole` (calls `rpc('set_program_member_role')`, now admin-gated by T4), `adminTransferProgramOwnership` (calls `rpc('admin_transfer_program_ownership')` then emails the new owner via the existing `ownershipTransferredEmail` template, reading their address with the service-role client), `adminUploadProgramCrest`/`adminRemoveProgramCrest` (storage writes via the service-role client because the `program-crests` bucket policy is member-scoped, followed by `rpc('set_program_crest')`, mirroring the exact upload/rollback sequence in the existing `uploadProgramCrest` action), `adminInviteMember({ programId, email, role })` (mirrors `inviteMember`'s token + `create_program_invite` + `programInviteEmail` sequence), `adminRevokeInvite(inviteId)`, `adminResolveJoinRequest(id, 'invite' | 'dismiss')`
  - [ ] Every admin action calls `revalidatePath("/admin", "layout")` on success
  - [ ] `tests/teams-management.spec.ts` still passes unmodified (proves the injectable-prop change didn't alter default Settings behavior)
  - [ ] Each new admin action succeeds when called by an admin who is NOT a member of the target program, and returns a failure result for a non-admin caller

## T21 · Team Overview tab

- **status:** todo
- **model:** opus
- **needs:** T18, T19, T20
- **files:** src/app/admin/teams/[programId]/page.tsx, src/components/admin/admin-people-card.tsx, src/components/admin/admin-requests-card.tsx, src/components/admin/pilot-usage-card.tsx
- **done when:**
  - [ ] Overview page renders a two-column grid of top-level `SettingsCard`s (`src/components/dashboard/settings/settings-card.tsx`) — no nested cards
  - [ ] `AdminPeopleCard` lists members using the person-row grammar of `TeamMembersCard` (`PersonAvatar`, name 13px/500, email 12px `--ink-500`, `StatePill outline` for "Invited"); each row's role is a `RoleMenu` wired with `action={adminSetProgramMemberRole}` and the same `assignableRoles(...)` gating used in Settings; a "Make owner" action on eligible rows opens `TransferOwnershipDialog action={adminTransferProgramOwnership}` remounted with a fresh `key` per open (matching `team-detail.tsx`'s pattern); an "Invite someone" row at the card's foot has an underline email field and a role `MenuSelect`, calling `adminInviteMember`
  - [ ] `AdminRequestsCard` lists open invites (resend/revoke via `adminRevokeInvite` and the existing resend flow) and open join requests (Invite/Dismiss via `adminResolveJoinRequest`)
  - [ ] `PilotUsageCard` reuses the meter from `ProgramHoursSummary` (`src/components/dashboard/settings/teams/program-hours-summary.tsx`) or extracts its bar if direct reuse isn't feasible, with a footnote "Team pool 75 h every month · Each member 2 h · Pilot ends Dec 31, 2026" (using `formatPilotEnd()` from T6)
  - [ ] Role change, ownership transfer, invite, resend/revoke, and join-request invite/dismiss all work end-to-end for an admin who is not a program member, and each re-renders from the server after completing
  - [ ] A program with no members/invites/requests shows each card's own empty-state line rather than a blank card

## T22 · Usage tab

- **status:** todo
- **model:** sonnet
- **needs:** T18, T19, T20
- **files:** src/app/admin/teams/[programId]/usage/page.tsx, src/components/dashboard/settings/program-usage-card.tsx, src/lib/services/programs/admin-team-actions.ts
- **done when:**
  - [ ] `ProgramUsageCard` gains an optional `load?: (programId: string, month: string) => Promise<ProgramUsage>` prop defaulting to the existing `loadProgramUsage`, with no change to its default behavior
  - [ ] `admin-team-actions.ts` gains `adminLoadProgramUsage(programId, month)` built on T18's `usageByMonth`
  - [ ] The Usage tab page renders `ProgramUsageCard` with `load={adminLoadProgramUsage}` and a `program` shape built from T18's data
  - [ ] The month stepper walks back through prior months and shows correct per-member usage lines for a program the admin is not a member of

## T23 · Create team dialog + program-creation action

- **status:** todo
- **model:** opus
- **needs:** T4, T6, T12, T20
- **files:** src/components/admin/create-team-dialog.tsx, src/lib/services/programs/admin-program-actions.ts, src/lib/services/email/templates/claim.ts
- **done when:**
  - [ ] `CreateTeamDialog` is a 440px `Dialog`/`DialogContent` (per chrome.md's Dialog spec) with underline fields (`advField("underline")`, `data-focus-ring="none"`) for school/club name, type (College/Club/High school/Academy/Other via `MenuSelect`), team (Men's/Women's, hidden or disabled for non-college types), division, conference (options loaded via `getConferenceOptions` from `team-settings-server.ts`, refetched when division changes), city, state (2-letter `MenuSelect`), school email domain, owner's email, and an `AdvSwitch` labeled "Start the pilot"; a crest picker is offered after the program is created (via `adminUploadProgramCrest` + `ImageAdjustDialog`); footer has Cancel and a single primary "Create team" button disabled until name + type (+ team, for college) are filled
  - [ ] `programKeyFor(schoolName: string, team: string | null): string` is a pure, unit-tested helper generating the program key
  - [ ] `admin-program-actions.ts` exports `createProgram(input)`: calls `requireAdmin()`, then `rpc('admin_create_program', ...)` via the session client, then resolves the owner by email:
    - if a matching user exists (service-role `ilike` lookup with `[\%_]` escaped, the same pattern as `reopenClaim`): inserts a `program_claims` row (`claimant_user_id`, `claimed_email`, `claimant_role='head_coach'`, `match_reason='Created by admin'`) with status `approved` when "Start the pilot" is on, else `pending_review`; inserts the `program_members` owner row; updates `programs.owner_user_id`/`claimed_at`/`status` via `programStatusFor(...)`
    - if no user exists and `org_type='college'`: sends a new `programClaimInviteEmail` (added to `templates/claim.ts`) pointing at `/claim/[programKey]`; if the pilot switch is on, also inserts a matching row into `program_contacts` so the existing claim RPC's exact-match auto-approves on completion
    - if no user exists and it's a custom org (`program_key` is null, so `/claim/...` can't reach it): creates a `coach`-role invite via `create_program_invite` and the dialog's copy explains the admin will promote them to owner later via Team page's transfer action
  - [ ] A duplicate program (unique-key violation, `23505`) surfaces as a friendly "That program already exists" error via `DialogProblem`, not a raw Postgres error
  - [ ] `revalidatePath("/admin", "layout")` on success; the dialog navigates to `/admin/teams/<newId>` on success
  - [ ] All three owner branches were exercised against the live database (or in a live-gated test extending T5) and produce the rows described above; the new team appears in the Teams list with the correct Plan pill

## T24 · Surface pilot end date in existing usage meters

- **status:** todo
- **model:** sonnet
- **needs:** T6
- **files:** src/components/dashboard/settings/teams/program-hours-summary.tsx, src/components/dashboard/matches/new-match-wizard/FooterMeter.tsx
- **done when:**
  - [ ] Both components' existing footnote/suffix copy has " · Pilot ends Dec 31, 2026" appended via `formatPilotEnd()` (from T6) — copy-only change, no layout restructuring, consistent with `docs/ui-revamp-guardrails.md`'s framing of the meter as presentation rather than one of the five vendor-critical inputs
  - [ ] The new text renders in both places
  - [ ] Any existing Playwright/unit specs covering these components (e.g. usage-format or wizard specs) remain green

## T25 · Route smoke tests + final repo-wide verification

- **status:** todo
- **model:** sonnet
- **needs:** T9, T12, T15, T19, T21, T22, T23, T24
- **files:** tests/admin-routes.spec.ts, .env.example
- **done when:**
  - [ ] `admin-routes.spec.ts` is gated on an env var (e.g. `ADMIN_SMOKE_BASE_URL`) and skips with a stated reason when absent, following the `HAVE_ENV`-style pattern used elsewhere in `tests/`
  - [ ] Using two throwaway logins (one promoted to `is_admin=true` via the service role), it asserts: `/admin/teams`, `/admin/requests`, and `/admin/teams/<id>` return 200 for the admin session and 404 for the non-admin session; an unauthenticated request to any `/admin/*` route redirects (307) to `/login`; `/admin/claims` redirects to `/admin/requests`
  - [ ] The two required env vars are documented as comments in `.env.example` (not committed as real values)
  - [ ] `npm run lint && npx tsc --noEmit && npm run build && npm test && npm run map && node scripts/check-design-drift.mjs` all pass with zero new errors and matched drift seeds
  - [ ] `git grep -n "admin/claims"` in the repo returns only the redirect line in `next.config.ts`
  - [ ] A final manual walkthrough (recorded in the task's commit message or a short note) confirms: Teams' four view pills, approving a pilot from both the Teams popover and the Requests drawer, the full verification-email round trip, editing a team the admin doesn't belong to, and creating a team via all three owner branches all work against the live/dev environment
