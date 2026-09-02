# Tasks — pending-invite-intercept (stage 04)

Appended verbatim to `.claude/tasks/claude-auth-redirect-cross-account-79c1db.md`
on 2026-09-01 as T4–T10, one task per plan step, drafted by the task-add
planner on Fable. Dependencies follow the plan: T5, T6 need T4; T7 needs T5;
T8, T9 need T5 and T7; T10 needs T5 and T8. Routing: T4 and T5 on `fable`
(migration, SECURITY DEFINER delegation, admin-client writes); the rest on
`opus`.

| id | title | model | needs | plan step |
|---|---|---|---|---|
| T4 | Add the pending-invite read and accept-by-id migration | fable | — | 1 |
| T5 | Server plumbing: pending-invite loader, outcome mapping, accept action | fable | T4 | 2 |
| T6 | Live-database spec for the pending-invite functions | opus | T4 | 3 |
| T7 | Shared join components and the `InviteOffer` pane | opus | T5 | 4 |
| T8 | Add the `/invitations/[inviteId]` route | opus | T5, T7 | 5 |
| T9 | Onboarding step zero | opus | T5, T7 | 6 |
| T10 | Header activity tray invitation row | opus | T5, T8 | 7 |

Two planner interpretations are flagged in task notes for the author to
overrule: the inviter is printed as the whole name (the type has no first
name), and with several invitations the onboarding pane quotes the first
one's allowance.

## Appended block

## T4 · Add the pending-invite read and accept-by-id migration
- **status:** todo
- **model:** fable
- **files:** supabase/migrations/<stamp>_pending_invites.sql (new) — guess
- **done when:**
  - [ ] A new `supabase/migrations/<YYYYMMDDHHMMSS>_pending_invites.sql` whose stamp sorts after `20260830140001_drop_roster_visible.sql` is committed. It creates `public.pending_program_invites()` returning `table(invite_id uuid, program_id uuid, school_name text, team text, org_type text, role text, invited_by uuid, inviter_first_name text, inviter_last_name text, expires_at timestamptz)` and `public.accept_pending_invite(p_invite_id uuid)` returning `table(status text, program_id uuid)`; both are `security definer` with `set search_path = ''`, the accept function carries `#variable_conflict use_column`, and for each function the file has `revoke all on function … from public, anon` and `grant execute … to authenticated`. It also creates `program_invites_open_lower_email_idx on public.program_invites (lower(email)) where accepted_at is null`. The file contains no `create policy`, no `enable row level security`, and no `grant` on any table.
  - [ ] The read function selects from `program_invites i join programs p` with a `left join` on `users` for `invited_by`, filtered by `lower(i.email)` = the caller's lowercased `auth.users.email`, `i.accepted_at is null`, `i.expires_at > now()`, and `not exists` a `program_members` row for `(i.program_id, auth.uid())`; it returns no rows when `auth.uid()` is null or the caller's `auth.users.email_confirmed_at` is null; `order by i.created_at desc`.
  - [ ] The accept function checks, in this order: `auth.uid()` null → `raise exception 'not authenticated' using errcode = '28000'`; no `program_invites` row for `p_invite_id` → `('not_found', null)`; caller's `email_confirmed_at` null → `'unconfirmed'`; `lower(i.email) is distinct from` the caller's lowercased email → `'wrong_address'`; otherwise `return query select * from public.accept_program_invite(i.token_hash)` — it performs no membership insert, `accepted_at` stamp or audit write of its own.
  - [ ] Applied to live project `pouxujkhtbvkdwbzfvka` with `apply_migration`, then verified with `execute_sql`: `select proname, prosecdef, proconfig from pg_proc where proname in ('pending_program_invites','accept_pending_invite')` returns both rows with `prosecdef = true` and a `search_path=` entry in `proconfig`; `select indexname from pg_indexes where indexname = 'program_invites_open_lower_email_idx'` returns one row; `get_advisors` (security) is run and its output quoted in the completion report, with no new finding naming either function.
  - [ ] Smoke via `execute_sql`, results quoted in the report: `set local role anon; select * from public.pending_program_invites();` fails with permission denied (`42501`); under `set local role authenticated` with `request.jwt.claims` carrying an existing test user's `sub`, `select * from public.accept_pending_invite(gen_random_uuid());` returns one row with `status = 'not_found'` (wrap each in `begin … rollback` if the tool does not).
- **notes:** Plan step 1. Read `.claude/skills/create-migration/SKILL.md` first and follow its stamp, live-schema check (`list_tables` — the folder runs ~100 migrations behind) and apply steps. `program_invites` already carries `player_id` and `upload_enabled`, which the token function consumes — that is why the accept path delegates instead of re-implementing. No table policy changes: `program_invites` stays staff-read only. If the Supabase MCP is unreachable during the run, mark the task blocked rather than committing an unapplied file. The unconfirmed-caller branch is checked by hand at stage 05, not here. `rls-boundary-reviewer` runs on this diff.

## T5 · Server plumbing: pending-invite loader, outcome mapping, accept action
- **status:** todo
- **model:** fable
- **needs:** T4
- **files:** src/lib/data/pending-invites-server.ts (new), src/lib/services/programs/invite-acceptance.ts, src/lib/services/programs/join-actions.ts — guess
- **done when:**
  - [ ] `invite-acceptance.ts`: `displayName` is exported; the non-error branch of `AcceptOutcome.status` gains `"unconfirmed"`; a new exported `acceptPendingWithSession(inviteId: string, client?)` sits beside `acceptWithSession`, calls `.rpc("accept_pending_invite", { p_invite_id: inviteId }).maybeSingle()`, and maps `{ status, program_id }` to `AcceptOutcome` exactly as `acceptWithSession` does (`ok` + `program_id` → `{ ok: true, programId }`; RPC error or null row → the `"error"` outcome with the same "We couldn't finish that. Try again." message; any other status passed through). `acceptWithSession`'s behaviour is unchanged.
  - [ ] New `src/lib/data/pending-invites-server.ts` exports `interface PendingInvite { id: string; programId: string; programName: string; programOrgType: ProgramOrgType; role: JoinRole; inviterName: InviterName; expiresAt: string }` and `getPendingInvites(supabase): Promise<PendingInvite[]>`, which calls `.rpc("pending_program_invites")`, maps `programName` through `programDisplayName(school_name, team)` from `@/lib/data/programs-server` and `inviterName` through `displayName(inviter_first_name, inviter_last_name)`, and on an RPC error logs `console.error("[invites] could not load pending invitations", { message: error.message })` and returns `[]`.
  - [ ] `join-actions.ts`: `describe()` returns "Confirm your email address, then open this invitation again." for `unconfirmed`; a new exported `acceptPendingInvite(inviteId: string): Promise<JoinActionResult>` returns `{ ok: false, error: "That invitation isn't available." }` before any Supabase call when `inviteId` fails a UUID regex; otherwise it calls `createClient()`, then `acceptPendingWithSession(inviteId, supabase)`, returns `{ ok: false, error: describe(outcome) }` on failure, and on `ok` reads the session user, stamps `users.onboarded_at` where null via the admin client in `acceptInvite`'s exact shape, sets `users.role` where null to `{ player: "player", coach: "coach", staff: "coach" }[role]` where `role` is read back server-side from the accepted invitation or membership row (never from an action argument), logs each stamp failure with `console.error` without changing the result, then `activate(outcome.programId)` and `redirect("/dashboard/team")`.
  - [ ] `grep -n "console\." src/lib/data/pending-invites-server.ts src/lib/services/programs/invite-acceptance.ts src/lib/services/programs/join-actions.ts` shows no call whose arguments include an email, an invite id or a token — each logs `{ message }` only; `git diff -- src/lib/services/programs/join-actions.ts` touches only imports, `describe()` and the new action (no hunk inside `acceptInvite`, `createAccountAndAccept`, `requestFreshInvite` or `signOutForInvite`).
  - [ ] `npm run lint` and `npx tsc --noEmit` exit 0.
- **notes:** Plan step 2. Function names and return shapes are T4's. The action takes one argument on purpose: the role and program come from the database after the SECURITY DEFINER function has bound the row to the caller's confirmed address, and a `role` argument would let a raw-RPC caller pick their own persona. `rls-boundary-reviewer` runs (new query under `src/lib/data/`).

## T6 · Live-database spec for the pending-invite functions
- **status:** todo
- **model:** opus
- **needs:** T4
- **files:** tests/pending-invites.spec.ts (new) — guess
- **done when:**
  - [ ] New `tests/pending-invites.spec.ts`, modelled on `tests/join-requests-staff-read.spec.ts`: imports `HAVE_ENV`, `SKIP_REASON`, `INSUFFICIENT_PRIVILEGE`, `runMarker`, `createLogins`, `createAdminClient`, `deleteAuthUsers` from `./fixtures/live-db`; `test.describe.configure({ mode: 'serial' })`; `test.skip(!HAVE_ENV, SKIP_REASON)`; a `beforeAll` that, with the admin client under the run marker, creates one program owned by a test owner, two confirmed logins A and B, and three `program_invites` rows for A's generated address — one live (random `token_hash`, role `player`, `expires_at` 14 days out), one expired, one on a second program A is already a member of; an `afterAll` that deletes every row and auth user the marker created.
  - [ ] Tests, in this order: A's `rpc('pending_program_invites')` returns exactly one row whose `invite_id` is the live row's id and which has the ten columns named in T4; B's call returns zero rows; the anon client's call is refused with `INSUFFICIENT_PRIVILEGE`; B's `rpc('accept_pending_invite', { p_invite_id })` on the live id returns `status = 'wrong_address'` and no `program_members` row exists for (program, B).
  - [ ] Then: A's accept returns `status = 'ok'` with the program id, after which `program_members` has (program, A, role `player`), the invite row has non-null `accepted_at` and `accepted_user_id` = A, and `program_audit_log` has a row with `action = 'invite.accepted'` and `subject_id` = the live id; A's second accept returns `already_used`; A's read now returns zero rows.
  - [ ] Two regression tests: the expired and already-member rows' ids never appeared in A's first read; and a fresh invite row inserted with `token_hash = hashToken(token)` (import `hashToken` from `@/lib/services/programs/tokens`) is still accepted through `rpc('accept_program_invite', { p_token_hash })` returning `ok`.
  - [ ] `npm test` exits 0 with `.env.local` present and every test in the new spec reported as passed (none skipped); the spec's header comment names the migration it locks and the on-demand run command, like its model.
- **notes:** Plan step 3. `createLogins` creates confirmed users (`email_confirm: true`) and derives each address from the marker — read it back from the login, never hard-code one. `accept_program_invite` refuses with `no_seats` when a program is full, so build the program the way `tests/team-roster-progress.spec.ts` does. The unconfirmed branch is deliberately not covered here (a password login cannot reach it); stage 05 checks it by hand.

## T7 · Shared join components and the `InviteOffer` pane
- **status:** todo
- **model:** opus
- **needs:** T5
- **files:** src/components/join/join-terms.tsx, src/components/join/join-forms.tsx, src/app/join/[token]/page.tsx, src/components/join/nothing-sent.tsx (new), src/components/join/invite-offer.tsx (new), src/lib/services/programs/join-quota.ts (new) — guess
- **done when:**
  - [ ] `NotNowLink` in `join-terms.tsx` takes `{ href: string }` and renders `<Link href={href}>`; `grep -rn "NotNowLink" src` shows its definition plus exactly two render sites, `JoinReady` and `JoinSignUp` in `join-forms.tsx`, each passing the `/join/<encoded token>?not-now=1` URL they built before; no `token` prop remains on it.
  - [ ] `NothingSent` is exported from new `src/components/join/nothing-sent.tsx` with `{ reviewHref: string; programName: string; inviterName: InviterName }` (taking `JoinPane`, or an equivalent 440-wide shell, with it since that was private to the page) and is no longer defined in `src/app/join/[token]/page.tsx`; the page imports it and its `ready` and `sign_up` declined branches still render it (`grep -n "NothingSent" "src/app/join/[token]/page.tsx"` shows the import and those two uses), passing the token page URL as `reviewHref`.
  - [ ] `quotaHours(orgType)` is exported from new `src/lib/services/programs/join-quota.ts` (importing `getMonthlyCapSeconds` from `@/lib/services/splitstep/config` and `monthlyCapSecondsFor` from `@/lib/services/splitstep/quota`, its doc comment moved with it) and deleted from the join page, which now imports it; `grep -rn "splitstep" src/components/join` returns nothing.
  - [ ] New `src/components/join/invite-offer.tsx` begins with `"use client"` and exports `InviteOffer({ invites, programHours, personalHours, notNowHref })`. With one invite: `JoinSharingTerms`, then `ClaimActions` holding a primary `advButton()` "Join <programName>" button that calls `acceptPendingInvite(invite.id)` inside `useTransition`, `NotNowLink href={notNowHref}`, and `JoinQuotaFooter`; a failed accept's `error` renders under the button through the same `Problem` pattern `join-forms.tsx` uses. With several: `JoinSharingTerms` once, one row per invite showing the program name and "as <ROLE_NOUN[role]> · from <inviterName>" (the second clause omitted when `inviterName` is null), each with an `advButton("outline", "sm")` "Join" button and its own pending/error state, no primary button, then `NotNowLink` and the footer. `grep -in "intelligence\|splitstep" src/components/join/invite-offer.tsx` returns nothing.
  - [ ] `npm run lint` and `npx tsc --noEmit` exit 0; `git diff` shows no change to `resolveJoinState` in `invite-acceptance.ts` and none to `join-actions.ts`.
- **notes:** Plan step 4. `ROLE_NOUN` is private in `join-forms.tsx` — export it (or move it to `join-terms.tsx`) rather than duplicating. The design's "from Elena" is illustrative: `InviterName` is one string, so print it whole. `ClaimHeading` is rendered by the pages that host `InviteOffer`, not by the component.

## T8 · Add the `/invitations/[inviteId]` route
- **status:** todo
- **model:** opus
- **needs:** T5, T7
- **files:** src/app/invitations/[inviteId]/page.tsx (new), MAP.md (regenerated) — guess
- **done when:**
  - [ ] New `src/app/invitations/[inviteId]/page.tsx` is a server component with `export const dynamic = "force-dynamic"` and no `layout.tsx` beside it; it awaits `params` and `searchParams` (both Promises in this Next version); with no session it calls `redirect("/login?next=" + encodeURIComponent("/invitations/" + inviteId))`.
  - [ ] It calls `getPendingInvites(supabase)` and picks the row whose `id` equals `inviteId`. Absent → a 440-wide pane titled "That invitation isn't available", body "It may have been accepted, withdrawn, or sent to a different address.", and a "Go to dashboard" `Link` to `/dashboard` styled with `advButton()`. Present with `searchParams["not-now"] === "1"` → `NothingSent` with `reviewHref` = `/invitations/<id>`. Present otherwise → `ClaimShell` (`width={720}`, `exitHref="/dashboard"`, `exitLabel="Back to dashboard"`) → `ClaimHeading` (eyebrow = program name, title "You've been invited", body "<inviterName> invited you to join <programName> as <role noun>." or "You've been invited to join <programName> as <role noun>." without an inviter) → `InviteOffer` with `invites={[invite]}`, `notNowHref` = `/invitations/<id>?not-now=1`, and hours from `quotaHours(invite.programOrgType)`.
  - [ ] No `redirect(...)`, `href` or `Link` in the file interpolates an email address; `grep -n "email" "src/app/invitations/[inviteId]/page.tsx"` matches nothing outside comments.
  - [ ] `npm run map` has been run and `MAP.md`'s route table contains a `/invitations/[inviteId]` row pointing at the page file; `npm test` exits 0, including `tests/generate-map.spec.ts`.
  - [ ] `npm run lint`, `npx tsc --noEmit` and `npm run build` exit 0.
- **notes:** Plan step 5. The absent-id pane is one sentence on purpose — it must not distinguish "someone else's" from "accepted" or "expired". The dashboard's onboarding gate does not apply here (outside `/dashboard`); the action stamps onboarding either way. The header comment should say why this is a page and not a route handler — the same reason as `/join/[token]`: acceptance is a POST behind a button.

## T9 · Onboarding step zero
- **status:** todo
- **model:** opus
- **needs:** T5, T7
- **files:** src/app/onboarding/page.tsx — guess
- **done when:**
  - [ ] `OnboardingPage` accepts `{ searchParams }` (a Promise, awaited) and, after the existing `if (!user) redirect("/login")` and `if (row?.onboarded_at) redirect("/dashboard")` lines, calls `getPendingInvites(supabase)`; when `invites.length > 0` and `searchParams["not-now"] !== "1"` it renders the step-zero pane, otherwise `<OnboardingFlow />` exactly as before.
  - [ ] The step-zero pane reuses `OnboardingFlow`'s outer wrapper (`flex min-h-screen items-center bg-[var(--surface-card)] px-6 py-24 sm:px-10` around an `mx-auto w-full` column with a fixed max width) — no `ClaimShell`, no exit control — and inside it `ClaimHeading` (eyebrow = program name for one invitation, "Invitations" for several; title "You've been invited") followed by `InviteOffer` with `invites`, `notNowHref="/onboarding?not-now=1"`, and hours from `quotaHours(invites[0].programOrgType)`.
  - [ ] The page's header comment gains the step-zero rule (a live invitation is offered before the persona question) and why: the invitation already answers what those questions ask.
  - [ ] `git diff --stat` lists neither `src/app/onboarding/onboarding-flow.tsx` nor `src/app/onboarding/actions.ts`; `npm run lint`, `npx tsc --noEmit` and `npm run build` exit 0.
- **notes:** Plan step 6. "Not now" writes nothing; the next visit without the flag offers again, which is right while the account is still un-onboarded. `quotaHours` is server-only — call it in the page, never inside `InviteOffer`.

## T10 · Header activity tray invitation row
- **status:** todo
- **model:** opus
- **needs:** T5, T8
- **files:** src/components/dashboard/activity/activity-tray-loader.tsx, src/components/dashboard/activity/activity-tray.tsx, src/components/dashboard/activity/tray-detail.ts (new), tests/activity-tray-detail.spec.ts (new) — guess
- **done when:**
  - [ ] `activity-tray-loader.tsx` fetches with `Promise.all([getActivityFeed(supabase, workspace.active), getPendingInvites(supabase)])` and renders `<ActivityTray feed={feed} invites={invites} />`; `git diff --stat` does not list `src/lib/data/activity-server.ts`.
  - [ ] New `tray-detail.ts` exports pure `trayDetail(inviteCount: number, inFlightCount: number): string` with no React or Next imports, returning "Nothing in flight" for (0, 0), "N in flight" for (0, N), "1 invitation" / "N invitations" for (N, 0), and the two joined with " · " (invitations first) when both are non-zero. New `tests/activity-tray-detail.spec.ts` asserts the exact strings for at least (0,0), (0,2), (1,0), (2,0), (1,2) and (2,1); `npm test` exits 0.
  - [ ] `activity-tray.tsx`: `ActivityTray({ feed, invites }: { feed: ActivityFeed; invites: PendingInvite[] })`; a new `InviteRow` renders a `Link` to `/invitations/${invite.id}` with the unread dot, a 12px line "Invitation — <program name>" (name in the medium weight) and an 11px `text-[var(--ink-500)]` sub-line "Join as <role noun> · from <inviterName>" (the " · from …" clause omitted when `inviterName` is null); invite rows are rendered before the `inFlight` rows; `unread` becomes `inFlight.length + invites.length`; the trigger's `detail` and `aria-label` read from `trayDetail(invites.length, inFlight.length)`; the "Nothing in flight." empty state renders only when `feed.items.length === 0 && invites.length === 0`.
  - [ ] No numeric badge is added to the trigger — the only count text in the diff is inside `trayDetail` — and `git diff -- src/components/dashboard/activity | grep -n "channel(\|setInterval\|\.subscribe("` returns nothing (no new socket or polling).
  - [ ] `npm run lint`, `npx tsc --noEmit` and `npm run build` exit 0.
- **notes:** Plan step 7. This tray renders on every dashboard page, so `pipeline-guardrails-reviewer` runs on the diff; the existing `isLiveUpdating` gate and the live-patch merge over `feed.items` must not learn about invitations. `getPendingInvites` returns `[]` on error, so the chrome cannot break on a read failure. The role noun map is exported by T7.

## Also consulted

By the planner, beyond the plan, MAP.md, the queue and the log:
`work/pending-invite-intercept/02_design/output/design.md`,
`.claude/skills/create-migration/SKILL.md`,
`src/lib/services/programs/invite-acceptance.ts`,
`src/lib/services/programs/join-actions.ts`,
`src/components/join/join-forms.tsx`, `src/components/join/join-terms.tsx`,
`src/app/join/[token]/page.tsx`, `src/app/onboarding/page.tsx`,
`src/app/onboarding/onboarding-flow.tsx`,
`src/components/claim/claim-shell.tsx`,
`src/components/dashboard/activity/activity-tray-loader.tsx`,
`src/components/dashboard/activity/activity-tray.tsx`,
`src/lib/data/programs-server.ts`, `tests/join-requests-staff-read.spec.ts`,
`tests/fixtures/live-db.ts`, `tests/generate-map.spec.ts`,
`playwright.config.ts`,
`supabase/migrations/20260817073957_program_invites.sql`,
`supabase/migrations/20260822120100_accept_invite_claims_profile.sql`;
grep-only: `src/lib/services/programs/tokens.ts`,
`tests/team-roster-progress.spec.ts`. This session read nothing beyond the
stage's declared inputs.
