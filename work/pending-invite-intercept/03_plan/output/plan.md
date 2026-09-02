# Plan — pending-invite-intercept

Seven steps, each one surface and one fresh subagent context. Order is a
dependency order: nothing in a step assumes a later step exists. Steps 3
and 4 are independent of each other and could run in either order; the
sequential queue runner will simply take them as listed.

Scope guard: every step below maps to an item in the brief's Scope (1–7).
Nothing touches the brief's Non-goals: `/join/[token]`'s behaviour, the
`/claim` request flow, expired invitations, or a home banner.

## Step 1 — Migration: read and accept-by-id functions

**Files.** New `supabase/migrations/<stamp>_pending_invites.sql`. Nothing
in `src/`.

**Change.** Follow `.claude/skills/create-migration/SKILL.md` for the
stamp, the live-schema check and the apply. Three objects:

- `public.pending_program_invites()` returning
  `table(invite_id uuid, program_id uuid, school_name text, team text,
  org_type text, role text, invited_by uuid, inviter_first_name text,
  inviter_last_name text, expires_at timestamptz)`. `security definer`,
  `set search_path = ''`. Rows from `program_invites i join programs p`
  (left join `users` on `invited_by`) where `lower(i.email)` equals the
  caller's lowercased `auth.users.email`, `i.accepted_at is null`,
  `i.expires_at > now()`, and no `program_members` row exists for
  `(i.program_id, auth.uid())`. Returns no rows when `auth.uid()` is null
  or `auth.users.email_confirmed_at` is null. Ordered by `created_at desc`.
- `public.accept_pending_invite(p_invite_id uuid)` returning
  `table(status text, program_id uuid)`, `security definer`,
  `set search_path = ''`, `#variable_conflict use_column`. Checks in order:
  null `auth.uid()` → `raise exception 'not authenticated' using errcode =
  '28000'`; row not found → `'not_found'`; caller's
  `email_confirmed_at is null` → `'unconfirmed'`; `lower(i.email) is
  distinct from` caller email → `'wrong_address'`; else `return query
  select * from public.accept_program_invite(i.token_hash)`.
- `create index program_invites_open_lower_email_idx on
  public.program_invites (lower(email)) where accepted_at is null`.

Grants: `revoke all on function … from public, anon; grant execute … to
authenticated` for both functions. No table policy changes;
`program_invites` stays staff-read only.

**Verification.** Applied to the live project through the MCP and the file
committed. `select proname, prosecdef from pg_proc` shows both functions
with `security definer`; `pg_indexes` shows the new index. Smoke via
`execute_sql`: calling `pending_program_invites()` as `anon` is refused;
`accept_pending_invite(gen_random_uuid())` as an authenticated test user
returns `not_found`. `rls-boundary-reviewer` runs on the diff.

## Step 2 — Server plumbing: loader, outcome mapping, action

**Files.** New `src/lib/data/pending-invites-server.ts`. Edit
`src/lib/services/programs/invite-acceptance.ts` and
`src/lib/services/programs/join-actions.ts`.

**Change.**
- `invite-acceptance.ts`: export `displayName`; add `'unconfirmed'` to the
  non-error `AcceptOutcome.status` union; add
  `acceptPendingWithSession(inviteId, client?)` beside
  `acceptWithSession`, calling `.rpc('accept_pending_invite', {
  p_invite_id })` and mapping the row through the same outcome shape and
  the same never-log-the-credential rule.
- `pending-invites-server.ts`: `PendingInvite` interface (id, programId,
  programName via `programDisplayName(school_name, team)`, programOrgType,
  role as `JoinRole`, inviterName via `displayName`, expiresAt) and
  `getPendingInvites(supabase)` calling `.rpc('pending_program_invites')`;
  on error log `[invites] could not load pending invitations` and return
  `[]`.
- `join-actions.ts`: `describe()` gains the `unconfirmed` sentence
  ("Confirm your email address, then open this invitation again.");
  new `acceptPendingInvite(inviteId)`: refuse a non-UUID string before any
  database call; `createClient()`; `acceptPendingWithSession(id, supabase)`;
  on `ok`, with the admin client, stamp `onboarded_at` where null (the
  existing shape) and set `role` where null from
  `{ player: 'player', coach: 'coach', staff: 'coach' }`, each best effort
  and logged; `activate(programId)`; `redirect('/dashboard/team')`.

**Verification.** `npm run lint`, `npx tsc --noEmit`. `grep` confirms no
`console.*` in the new code prints an email or an invitation id alongside
an error. `rls-boundary-reviewer` runs (new query in `src/lib/data/`).

Depends on: Step 1 (function names and return shapes).

## Step 3 — Live-database spec for the two functions

**Files.** New `tests/pending-invites.spec.ts`.

**Change.** Modelled on `tests/join-requests-staff-read.spec.ts`, using
`tests/fixtures/live-db.ts` (`HAVE_ENV` skip, `runMarker`,
`createLogins`, `createAdminClient`, `deleteAuthUsers`). Setup: one program
owned by a test owner, two confirmed test users A and B, an invitation row
for A's address inserted with the admin client (random `token_hash`, role
`player`, 14-day expiry), plus an expired row for A and a row for A on a
program A already belongs to. Assertions, in the design's order: A's read
returns exactly the live row with the expected columns and B's returns
none; anon is refused; B's accept → `wrong_address` and no membership;
A's accept → `ok`, membership row with role `player`, `accepted_at` and
`accepted_user_id` set, an `invite.accepted` audit row; A's second accept →
`already_used`; A's read now empty; the expired and already-member rows
were never listed; the token function still accepts a fresh row by hash.
Cleanup deletes what the marker created.

**Verification.** `npm test` passes with the live env present, and the
spec reports skipped without it. The unconfirmed branch is not covered
here (see Test strategy).

Depends on: Step 1.

## Step 4 — Shared join components and the offer pane

**Files.** Edit `src/components/join/join-terms.tsx`,
`src/components/join/join-forms.tsx`, `src/app/join/[token]/page.tsx`. New
`src/components/join/nothing-sent.tsx`,
`src/components/join/invite-offer.tsx`,
`src/lib/services/programs/join-quota.ts`.

**Change.**
- `NotNowLink` takes `href` instead of `token`; both call sites in
  `join-forms.tsx` pass the join URL they built before.
- `NothingSent` moves out of the join page into `nothing-sent.tsx` with a
  `reviewHref` prop; the join page imports it and passes its review link.
- `quotaHours(orgType)` moves out of the join page into `join-quota.ts`
  (server-only; it imports `splitstep/config`); the join page imports it.
- `invite-offer.tsx` (`"use client"`): `InviteOffer({ invites,
  programHours, personalHours, notNowHref })`. One invitation: body line
  naming inviter, program and role; `JoinSharingTerms`; `ClaimActions` with
  the primary `Join <program>` calling `acceptPendingInvite(id)` in a
  transition, `NotNowLink`, `JoinQuotaFooter`; errors under the button via
  the same `Problem` pattern as the join forms. Several invitations: terms
  once, then a row per invitation (program, "as a player · from Elena")
  each with an `advButton("outline", "sm")` Join, no primary, then Not now
  and the footer. Copy uses "Advantage Intelligence" nowhere and the
  provider's internal name nowhere.

**Verification.** `npm run lint`, `npx tsc --noEmit`. `/join/[token]`
renders the same states as before: `grep` shows `NotNowLink` rendered by
`JoinReady` and `JoinSignUp` only, and `NothingSent` still reached from the
`ready` and `sign_up` declined branches. `InviteOffer` has no import from
`splitstep/`.

Depends on: Step 2 (`PendingInvite`, `acceptPendingInvite`).

## Step 5 — The `/invitations/[inviteId]` route

**Files.** New `src/app/invitations/[inviteId]/page.tsx`. Regenerated
`MAP.md` via `npm run map`.

**Change.** Server component, `dynamic = "force-dynamic"`, no layout. No
session → `redirect('/login?next=/invitations/<id>')` (encoded). Load
`getPendingInvites()` and pick the id: absent → a 440-wide pane titled
"That invitation isn't available" with one body sentence covering every
reason and a `Go to dashboard` button; `?not-now=1` → `NothingSent` with
`reviewHref` back to this page; otherwise `ClaimShell` (720,
`exitHref="/dashboard"`, `exitLabel="Back to dashboard"`) → `ClaimHeading`
→ `InviteOffer` with `notNowHref="/invitations/<id>?not-now=1"` and the
quota hours from `quotaHours(invite.programOrgType)`. The invitee's email
appears nowhere in the page's URLs.

**Verification.** `npm run build` succeeds; `npm test` passes, including
the generated-map spec, so `MAP.md` lists the route. `npm run lint`,
`npx tsc --noEmit`.

Depends on: Steps 2 and 4.

## Step 6 — Onboarding step zero

**Files.** Edit `src/app/onboarding/page.tsx`. `onboarding-flow.tsx` and
`actions.ts` untouched.

**Change.** After the existing signed-out and already-onboarded redirects:
read `searchParams`, call `getPendingInvites(supabase)`; when at least one
invitation exists and `not-now` is not `1`, render the step-zero pane —
the same centred, chrome-less container `OnboardingFlow` uses, with
`ClaimHeading` and `InviteOffer` (`notNowHref="/onboarding?not-now=1"`,
quota hours from `quotaHours`). Otherwise render `<OnboardingFlow />`
exactly as today. The page's header comment gains the step-zero rule and
why it precedes the persona question.

**Verification.** `npm run lint`, `npx tsc --noEmit`, `npm run build`.
`git diff` shows `onboarding-flow.tsx` and `actions.ts` unchanged.

Depends on: Steps 2 and 4.

## Step 7 — Header activity tray row

**Files.** Edit
`src/components/dashboard/activity/activity-tray-loader.tsx`,
`src/components/dashboard/activity/activity-tray.tsx`. New
`src/components/dashboard/activity/tray-detail.ts`, new
`tests/activity-tray-detail.spec.ts`.

**Change.**
- Loader: `Promise.all([getActivityFeed(...), getPendingInvites(supabase)])`;
  pass `invites` as a second prop. `getActivityFeed` and `ActivityFeed` are
  not modified.
- `tray-detail.ts`: pure `trayDetail(inviteCount, inFlightCount)` returning
  "1 invitation · 2 in flight", "2 invitations", "2 in flight" or
  "Nothing in flight".
- Tray: `InviteRow` — a `Link` to `/invitations/<id>` with the unread dot,
  12px "Invitation — **<program name>**", 11px ink-500 sub-line "Join as a
  player · from Elena Vasquez" (second clause dropped without an inviter);
  rendered before in-flight rows. `unread = inFlight.length +
  invites.length`; tooltip detail and `aria-label` from `trayDetail`. The
  empty state shows only when both lists are empty. No new socket, no
  polling, no numeric badge.

**Verification.** `tests/activity-tray-detail.spec.ts` passes via
`npm test`. `npm run lint`, `npx tsc --noEmit`, `npm run build`.
`pipeline-guardrails-reviewer` runs (dashboard chrome). `git diff` shows
`src/lib/data/activity-server.ts` unchanged.

Depends on: Steps 2 (loader) and 5 (the link target exists).

## Test strategy

**Per step, mechanically.** Every step ends with `npm run lint` and
`npx tsc --noEmit`; steps 5, 6 and 7 also require `npm run build`, and
steps 3, 5 and 7 add or exercise Playwright specs through `npm test`. The
task runner's completion review judges each step against its own
verification list.

**Database behaviour** is proven by the live-database spec in step 3,
against real signed-in sessions, the way `join-requests-staff-read.spec.ts`
proves the join-request functions. It covers both functions' happy and
refused paths and the token function's regression. The one branch a
password login cannot reach, an unconfirmed caller, is verified once by
hand with `execute_sql` under `set local role authenticated` and a JWT
claim for an unconfirmed test user, expecting an empty read and
`unconfirmed` from accept; the result is recorded in stage 05's notes.

**Pure logic** — the tooltip string — has its own spec in step 7.

**Guardrail reviewers.** `rls-boundary-reviewer` on steps 1 and 2;
`pipeline-guardrails-reviewer` on step 7. Steps 4, 5 and 6 touch no
guarded surface.

**By hand, at stage 06 on a preview deployment**, not as subagent
criteria (a queued task cannot drive a browser): a fresh Google account
holding a live invitation sees step zero and lands on the team page after
Join, onboarded and inside the program; an onboarded account sees the tray
row on every dashboard page with the dot and the tooltip count, and the
row opens the offer; Not now on both surfaces writes nothing and the row
persists; two live invitations both appear in the tray and accepting one
leaves the other; the `/join/[token]` link flow is unchanged end to end.

## Also consulted

- `.claude/skills/create-migration/SKILL.md` — confirmed present; its
  filename stamp, live-schema check and apply procedure are what step 1
  follows.
