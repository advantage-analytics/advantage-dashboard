# Design — pending-invite-intercept

Route traces (trace-route, step 5): the header tray renders from
`src/components/dashboard/activity/activity-tray.tsx`, mounted by
`src/app/dashboard/layout.tsx` through `ActivityTrayLoader` inside a
`<Suspense>`. Onboarding renders from `src/app/onboarding/onboarding-flow.tsx`
via `src/app/onboarding/page.tsx`. The token flow renders from
`src/app/join/[token]/page.tsx` and is not changed.

## Approaches considered

**A. Offer route + delegating accept function + a second tray prop
(recommended).** One `InviteOffer` pane, rendered inline on `/onboarding`
for new accounts and on a new `/invitations/[inviteId]` route for everyone
else. The tray gets an `invites` prop beside its existing feed, each row a
link to that route. The database gains a caller-scoped read function and an
accept-by-id function that delegates to the existing token function with the
row's own hash. Nothing existing is refactored.

- For: reuses `ClaimShell`, `JoinSharingTerms`, `JoinQuotaFooter`,
  `describe()`, `activate()` and the T3 onboarding stamp verbatim; the
  accept body stays in one place because the new SQL function calls the old
  one; the tray's row-is-a-link rule and 326px width are respected; decline
  stays a GET flag that cannot write, the same guarantee `/join` makes.
- Against: one new route and one new page shell; the tray carries two
  props instead of one feed.

**B. Accept inline, in the tray popover and in onboarding, no offer pane.**
Rejected. The popover cannot hold the two-column sharing terms and a Join
button, and the product rule is that nobody reaches Join without the terms.
It would also create two accept surfaces with two copies of the error copy.

**C. Re-mint a token on lookup and reuse `/join/[token]` wholesale.**
Rejected. Only the hash is stored, so "re-mint" means writing a new
`token_hash` onto a row the coach owns, or inserting a second row, which the
unique open-invite index forbids. A token is proof of mailbox possession at
send time; minting one from a session inverts what it means. And
`create_program_invite` is a staff function.

**D. Auto-accept during onboarding with no screen.** Rejected for the same
two reasons as B, plus the page-header rule on `/join`: acceptance is a POST
behind a button, never something a page load does.

## Chosen design

### Architecture

Three layers, each additive:

1. **Database** (one migration): `pending_program_invites()` to read, and
   `accept_pending_invite(p_invite_id)` to accept by delegating to
   `accept_program_invite(p_token_hash)`. One partial index on
   `lower(email)`.
2. **Server side**: a data loader `getPendingInvites()`, a server action
   `acceptPendingInvite()`, and two page routes that render the offer.
3. **UI**: `InviteOffer` (the pane), an `InviteRow` in the tray, and a
   branch at the top of the onboarding page.

The invitee still has no row-level access to `program_invites`. Both new SQL
functions are `security definer` with `set search_path = ''`, read the
caller from `auth.uid()`, and return only rows addressed to that caller's
confirmed email. The service-role client is not used for any read; the
existing admin-client writes on accept (onboarding stamp, and now the role)
stay where they are, in `join-actions.ts`.

### Components

**Migration** `supabase/migrations/<timestamp>_pending_invites.sql`, applied
to the live project and committed, never edited afterwards.

- `pending_program_invites()` → `table(invite_id uuid, program_id uuid,
  school_name text, team text, org_type text, role text, invited_by uuid,
  inviter_first_name text, inviter_last_name text, expires_at timestamptz)`.
  Rows where `lower(i.email) = lower(auth user email)`, `accepted_at is
  null`, `expires_at > now()`, and the caller is not already in
  `program_members` for that program. Returns nothing when `auth.uid()` is
  null or `auth.users.email_confirmed_at` is null. Raw program columns come
  back so TypeScript formats the name with the existing
  `programDisplayName()`; the SQL does not learn a display rule. Ordered
  newest first. `grant execute to authenticated`, `revoke from public, anon`.
- `accept_pending_invite(p_invite_id uuid)` → `table(status text,
  program_id uuid)`, the same shape as the token function so the TypeScript
  mapping is shared. In order: no `auth.uid()` → raise `28000` like the
  token function; row not found → `'not_found'`; caller unconfirmed →
  `'unconfirmed'` (new status); `lower(i.email) is distinct from` caller
  email → `'wrong_address'`; otherwise `return query select * from
  public.accept_program_invite(i.token_hash)`. The delegate re-runs its own
  used/expired/address/seat/claim checks and writes membership, the
  `accepted_at` stamp and the audit rows, so there is exactly one accept
  body. `#variable_conflict use_column` as in the delegate; same grants.
- Index `program_invites_open_lower_email_idx on program_invites
  (lower(email)) where accepted_at is null`. The existing unique index is on
  `(program_id, lower(email))` and does not serve an email-only lookup.

**Data loader** `src/lib/data/pending-invites-server.ts`

```ts
export interface PendingInvite {
  id: string;
  programId: string;
  programName: string;          // programDisplayName(school_name, team)
  programOrgType: ProgramOrgType;
  role: JoinRole;               // 'coach' | 'staff' | 'player'
  inviterName: InviterName;     // displayName(first, last) or null
  expiresAt: string;
}
export async function getPendingInvites(supabase): Promise<PendingInvite[]>
```

Calls `.rpc('pending_program_invites')` through the caller's session. Never
fatal: on error, log `[invites] could not load pending invitations` and
return `[]`. `JoinRole`, `InviterName` and the name helper come from
`invite-acceptance.ts` (export `displayName` there rather than copy it).

**Server action** `acceptPendingInvite(inviteId: string)` in
`src/lib/services/programs/join-actions.ts`, beside `acceptInvite` so it
shares `describe()`, `activate()` and the stamp.

1. Reject anything that is not a UUID string with `"That invitation isn't
   available."` before touching the database (raw-RPC callers can pass
   anything).
2. `createClient()`; `acceptPendingWithSession(inviteId, supabase)` — a
   sibling of `acceptWithSession` in `invite-acceptance.ts` that calls
   `.rpc('accept_pending_invite', { p_invite_id })` and maps the row through
   the same `AcceptOutcome` shape. `AcceptOutcome.status` gains
   `'unconfirmed'`; `describe()` gains "Confirm your email address, then open
   this invitation again."
3. On `ok`: read the session user; with the admin client, stamp
   `onboarded_at` where null (T3's shape), and set `users.role` where null
   from `{ player: 'player', coach: 'coach', staff: 'coach' }` — the
   persona vocabulary `PERSONA_ROLES` accepts. Only where null: an existing
   account's chosen persona is never overwritten. Two small best-effort
   updates, each logged on failure, neither changing the result.
4. `activate(programId)`; `redirect('/dashboard/team')`.

**Shared server helper** `quotaHours(orgType)` moves out of
`src/app/join/[token]/page.tsx` into
`src/lib/services/programs/join-quota.ts` (server-only; it imports
`splitstep/config`). The join page imports it from there. Both new pages
call it so the footer quotes the enforced allowance, as the join page's own
comment requires.

**`InviteOffer`** `src/components/join/invite-offer.tsx`, `"use client"`.

Props: `invites: PendingInvite[]`, `programHours`, `personalHours`,
`notNowHref`. Layout mirrors `JoinReady`:

- Heading (rendered by the page, `ClaimHeading`): eyebrow = program name for
  a single invitation, "Invitations" for several; title "You've been
  invited"; body "Elena Vasquez invited you to join Bakersfield College
  Men's Tennis as a player." or, with no inviter, "You've been invited to
  join … as a player."
- `JoinSharingTerms` once. The rows are program-agnostic, so one block
  serves several invitations.
- One invitation: `ClaimActions` with the primary `Join <program>` button
  calling `acceptPendingInvite(id)` in a transition, `NotNowLink`, and
  `JoinQuotaFooter`.
- Several: a list of rows (program name, "as a player · from Elena") each
  with an `advButton("outline", "sm")` Join; no primary, because one
  primary per surface. Then Not now and the footer.
- Errors render through the same `Problem` pattern as the join forms.

`NotNowLink` in `join-terms.tsx` takes an `href` instead of a `token`; its
two call sites in `join-forms.tsx` pass the join URL. `NothingSent` moves
out of the join page into `src/components/join/nothing-sent.tsx` with a
`reviewHref` prop; the join page and the invitations page both use it.

**Route** `src/app/invitations/[inviteId]/page.tsx`, `dynamic =
"force-dynamic"`, no layout of its own. Run `npm run map` after adding it.

- No session → `redirect('/login?next=/invitations/<id>')` (T1 made the
  login page honor and clamp that).
- `getPendingInvites()` and pick the id. Not present → a `JoinPane`-style
  "That invitation isn't available" pane: "It may have been accepted,
  withdrawn, or sent to a different address." with a `Go to dashboard`
  button. One sentence for every reason, so the page confirms nothing about
  other people's invitations.
- `?not-now=1` → `NothingSent` with `reviewHref` back to this page.
- Otherwise `ClaimShell` (width 720, `exitHref="/dashboard"`, `exitLabel="Back
  to dashboard"`) → `ClaimHeading` → `InviteOffer` with
  `notNowHref="/invitations/<id>?not-now=1"`.

The onboarding gate in the dashboard layout does not apply here (this route
is outside `/dashboard`), so an un-onboarded account can accept from a tray
link too; the action stamps onboarding either way.

**Onboarding branch** in `src/app/onboarding/page.tsx`, after the existing
signed-out and already-onboarded redirects:

```
invites = await getPendingInvites(supabase)
declined = searchParams['not-now'] === '1'
if (invites.length > 0 && !declined) render step-zero pane
else render <OnboardingFlow />
```

The step-zero pane uses the same centred, chrome-less container
`OnboardingFlow` uses (no `ClaimShell`, no exit control: onboarding has none
by design), with `ClaimHeading` and `InviteOffer`,
`notNowHref="/onboarding?not-now=1"`. `OnboardingFlow` itself is untouched.
"Not now" writes nothing; the next visit to `/onboarding` without the flag
offers again, which is right while the account is still un-onboarded.

**Tray** — `src/components/dashboard/activity/activity-tray-loader.tsx`
fetches `getActivityFeed()` and `getPendingInvites()` with `Promise.all`
and passes `invites` as a second prop. `getActivityFeed` and `ActivityFeed`
are unchanged; a separate prop beats a discriminated union because the
tray's live-patch merge iterates `feed.items` as jobs and every consumer
would otherwise have to narrow.

`activity-tray.tsx` changes:

- `InviteRow` (new): a `Link` to `/invitations/<id>` with the unread dot
  marked, 12px "Invitation — **<program name>**" and an 11px ink-500
  sub-line "Join as a player · from Elena Vasquez" (drop the second clause
  when there is no inviter). Rendered first, before in-flight rows: it is
  the only row asking for a decision.
- `unread = inFlight.length + invites.length`.
- The tooltip and `aria-label` detail comes from a pure helper
  `trayDetail(inviteCount, inFlightCount)` in
  `src/components/dashboard/activity/tray-detail.ts`: "1 invitation · 2 in
  flight", "1 invitation", "2 in flight", or "Nothing in flight". Counts
  live in the tooltip only; the chrome keeps its no-numeric-badge rule.
- Empty state stays "Nothing in flight." and shows only when both lists are
  empty.
- No socket, no polling for invitations: the list refreshes with the next
  server render, which is every navigation. The dot rule is unchanged: it
  marks things still needing you, and an open invitation still does, so it
  stays after Not now (open question 2, resolved).

### Data flow

Navigation → `dashboard/layout.tsx` → `<Suspense>` → `ActivityTrayLoader` →
`[getActivityFeed(), getPendingInvites()]` through the user's cookie session
→ `ActivityTray` renders jobs and invitations → click `InviteRow` →
`/invitations/[inviteId]` → page calls `getPendingInvites()` again (one
cheap RPC; the list is tiny) → `InviteOffer` → Join →
`acceptPendingInvite(id)` → `accept_pending_invite` → delegates to
`accept_program_invite(token_hash)` → membership, `accepted_at`, audit →
back in the action: stamps, workspace cookie → `/dashboard/team`. On the
next render the tray's RPC no longer returns that row, so the row and its
share of the dot disappear on their own.

New account: `/login` Google → `/callback` → `/dashboard` → layout sees
`onboarded_at` null → `/onboarding` → page calls `getPendingInvites()` →
step-zero pane → Join → same action → `/dashboard/team`, now onboarded and
inside the program. "Not now" → `/onboarding?not-now=1` → `OnboardingFlow`.

The invitee's email never travels in a URL; the invitation id (a UUID that
resolves to nothing unless the session's confirmed email matches) is the
only identifier on the wire.

### Error handling

| Where | Case | Behaviour |
|---|---|---|
| Tray loader | read RPC error | log, render tray without invitations; chrome is never fatal |
| Onboarding page | read RPC error | log, render `OnboardingFlow` as today |
| Invitations page | id not in the caller's list (other person's, accepted, expired, revoked) | one "isn't available" pane, no distinction |
| Action | non-UUID id | refused before the database is touched |
| Action | `not_found`, `already_used`, `expired`, `wrong_address`, `no_seats`, `already_claimed`, `player_gone`, `error` | existing `describe()` sentences, shown inline under the button |
| Action | `unconfirmed` | new sentence; unreachable through the UI because the read hides unconfirmed callers, but the action fails closed on its own |
| Action | accepted in another tab first | `already_used` sentence; the row is gone on the next navigation |
| Action | stamp or role update fails | logged, membership stands, redirect proceeds |
| Database | caller not authenticated | `28000`, mapped to the generic "couldn't finish" message like the token path |

Refusals are statuses, not exceptions, matching the token function's
contract and its `AcceptOutcome` mapping.

### Testing

**Live-database spec** `tests/pending-invites.spec.ts`, using
`tests/fixtures/live-db.ts` (`HAVE_ENV` skip guard, `createLogins`,
`runMarker`, `deleteAuthUsers`), modelled on
`tests/join-requests-staff-read.spec.ts`:

1. Setup: a program, an owner session, two confirmed sessions A and B,
   and an invitation row for A's address inserted with the admin client
   (random `token_hash`, role `player`, 14-day expiry).
2. A's `pending_program_invites()` returns exactly that row with the
   expected columns; B's returns none; anon is refused.
3. B's `accept_pending_invite(id)` → `wrong_address`, no membership.
4. A's → `ok` with the program id; `program_members` has A as `player`;
   `accepted_at` and `accepted_user_id` are set; the audit log carries
   `invite.accepted`.
5. A's second call → `already_used`; A's read now returns none.
6. An expired row and a row for a program A already belongs to are not
   listed; an invalid uuid raises and the action layer's guard is covered
   separately.
7. The token function still accepts the same shape of row (regression on
   the delegate): one `accept_program_invite(hash)` happy path.

The unconfirmed-caller branch cannot be driven through a password login
when confirmation is required, so it is verified once by hand with
`execute_sql` under `set local role authenticated` and a JWT claim for an
unconfirmed user, and recorded in the build stage's notes.

**Pure spec** `tests/activity-tray-detail.spec.ts` for `trayDetail()`: the
four strings above and pluralisation ("2 invitations").

**Gates**: lint, `tsc`, `npm test`, `npm run build`; `npm run map` after
the route; `pipeline-guardrails-reviewer` for the tray (dashboard chrome)
and `rls-boundary-reviewer` for the migration and the new loader.

**By hand, on a preview**: a fresh Google account with a live invitation
sees step zero and lands on the team page after Join; an onboarded account
sees the tray row on every dashboard page, with the tooltip count, and the
row opens the offer; Not now on both surfaces writes nothing and the row
persists.

## Open questions

Resolved here:

1. **Offer pane location** — a route, `/invitations/[inviteId]`. Linkable
   from a tray row (rows are links), decline is a GET flag that cannot
   write, and `ClaimShell` already is this pane.
2. **The dot after Not now** — stays. The tray marks things still needing
   you; an open invitation still does. No per-browser suppression.
3. **Guardian accounts** — behaves exactly as the token link does today: a
   parent whose address was invited as a player who presses Join becomes
   the program's player on their own account, and the guardian consent
   screen is reached only through Not now → normal onboarding. This feature
   does not make that worse. A guardian-aware invitation (inviting the
   junior, consent before Join) is separate work; carried forward to the
   brief's author as a product note, not a blocker.
4. **Unconfirmed accounts** — hidden. The read function returns nothing
   until `email_confirmed_at` is set, and the accept function refuses with
   `unconfirmed` regardless. Google accounts arrive confirmed.
5. **Already a member** — excluded by the read function, so neither
   surface offers it.

Carried forward (not this feature):

- The `sign_in` variant of `JoinState` still carries fields nothing renders
  since T2; unrelated tidy-up.
- Whether the coach's roster should distinguish "accepted via the app" from
  "accepted via the link": the audit row is identical today and nothing
  asked for the distinction.

## Also consulted

Read during this stage to verify specific facts:

- `src/lib/data/activity-server.ts` (the feed builder, lines 60–end) —
  feed shape and workspace scoping.
- `src/app/dashboard/layout.tsx` — where the tray mounts and the
  onboarding gate.
- `src/components/join/join-terms.tsx` — `JoinSharingTerms`,
  `JoinQuotaFooter`, `NotNowLink` signatures.
- `src/components/claim/claim-shell.tsx` — exported shell pieces.
- `src/lib/workspace/types.ts`, `src/lib/workspace/active-workspace-server.ts`
  — `Viewer` carries `email` and `onboardedAt`; `WORKSPACE_COOKIE`.
- `src/lib/data/programs-server.ts` — `programDisplayName()`.
- `src/components/dashboard/settings/actions.ts` — `PERSONA_ROLES`.
- `supabase/migrations/20260822120100_accept_invite_claims_profile.sql` —
  migration conventions and `#variable_conflict use_column`.
- `tests/join-requests-staff-read.spec.ts`, `tests/fixtures/live-db.ts` —
  live-database spec pattern.
- `.claude/skills/trace-route/SKILL.md` — route-trace procedure.
- Live database (Supabase MCP, project `pouxujkhtbvkdwbzfvka`):
  `program_invites` columns, RLS (enabled; one policy, staff read via
  `is_program_staff`), grants, indexes (`program_invites_open_email_key`
  on `(program_id, lower(email))` partial); `users` and `program_members`
  columns; the four invite functions in `public`; the full definition of
  `accept_program_invite`.

Read earlier in the same session and relied on here:
`src/components/dashboard/activity/activity-tray.tsx`,
`activity-tray-loader.tsx`, `src/app/onboarding/{page,onboarding-flow,
actions}.tsx`, `src/app/join/[token]/page.tsx`,
`src/components/join/join-forms.tsx`,
`src/lib/services/programs/{join-actions,invite-acceptance}.ts`,
`src/components/auth/login-form.tsx`, `src/app/(auth)/callback/route.ts`,
`src/lib/auth/safe-next.ts`, and the live `auth.users` provider split
(10 of 14 accounts Google-only).
