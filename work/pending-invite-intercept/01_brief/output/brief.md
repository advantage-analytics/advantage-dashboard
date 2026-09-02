# Brief — pending-invite-intercept

## Goal

An invited person who reaches the app without ever clicking the email link is
shown their invitation and can accept it where they are. Today the app only
recognises an invitation through its token, so anyone who signs up on their
own, or who already had an account when the invitation arrived, walks past it:
new accounts go through onboarding and end up asking a coach for an invite
they already have, and existing accounts have no way in except finding the
email. The invitation row sits unused until it expires two weeks later.

After this feature, no live invitation goes unnoticed by a signed-in account
that holds the invited address, and no coach receives a join request from
someone they already invited.

## Scope

1. **Lookup.** The app can find the live invitations (unaccepted, unexpired)
   addressed to the signed-in account's email, with enough to render an
   offer: program name, role, inviter name, invitation id.
2. **Onboarding step zero.** A new account with at least one live invitation
   sees it before the first onboarding question, as "You've been invited to
   <program> as <role>[, by <inviter>]", with the sharing terms and a Join
   button, and a "Not now" that continues into the normal questions.
3. **Header activity tray row.** Any signed-in account with a live invitation
   sees it as a row in the header activity tray ("Notifications"), on every
   dashboard page, contributing to the tray's dot. The row opens the offer;
   it does not accept inline.
4. **One offer pane** shared by both surfaces: terms, Join, Not now.
5. **Accepting without a token.** A database path that accepts an invitation
   by its id for the signed-in caller, bound to the invited email and gated
   on a confirmed email, sharing the existing accept logic (seats, roster
   claim, membership, audit). Joining from the offer sets the account's role
   from the invitation, stamps onboarding if unset, switches the active
   workspace to the program, and lands on the team page.
6. **Migration** for the new database functions, committed to the repo and
   applied to the live project.
7. Several live invitations for one address are all shown.

## Non-goals

- The `/join/[token]` link flow itself. Its sign-out and Google redirect fix
  landed separately (branch `claude/auth-redirect-cross-account-79c1db`,
  T1–T3). The token path is not changed by this feature.
- Expired invitations. They are not surfaced here; the email link's expired
  screen already offers to nudge the coach.
- A dashboard-home banner or a first-entry dialog. Both were considered and
  rejected in favour of the tray; see Constraints.
- Changing the "Request an invite" flow under `/claim`. The intercept makes
  the duplicate request unlikely; the request flow itself stays as is.
- Server-side, durable dismissal state. Invitations expire in two weeks.
- Notifying the coach when someone presses "Not now". Consistent with the
  link flow's "Nothing was sent" promise.
- Re-minting or reconstructing a token. Only the hash is stored, and that
  stays true.

## Constraints

**Data access and safety**
- The invitee has no row-level access to `program_invites`, and keeps none.
  The lookup is a caller-scoped read that returns only invitations addressed
  to the caller's own email.
- Accepting by id requires the invitation's email to equal the caller's
  email, case-insensitively (`program_invites.email` is not stored
  lowercased), **and** the caller's `auth.users.email_confirmed_at` to be
  set. An unconfirmed password sign-up with somebody else's address must not
  be able to take their seat. Google-created accounts arrive confirmed.
- The by-id path shares `accept_program_invite`'s body rather than copying it,
  so seat locking, roster-profile claiming, the membership insert, the
  `accepted_at` stamp and the audit rows stay in one place.
- Acceptance remains a POST behind a button. Nothing accepts on a page load.
- The migration is committed under `supabase/migrations/` and applied to the
  live project; the live database is the source of truth.

**Onboarding**
- Step zero runs before the persona question. Reasons: a coach invitee never
  reaches the college question, the invitation already answers both
  questions, and invitations also come from non-college programs.
- Joining from step zero stamps `users.onboarded_at`, sets `users.role` from
  the invitation's role, writes the workspace cookie for the program (the
  existing `activate()` behaviour), and lands on `/dashboard/team`.
- "Not now" writes nothing and continues into the normal questions.

**Header activity tray**
- The tray renders on every dashboard page, so the lookup's cost is paid on
  every navigation; it must be cheap and must not open sockets.
- Today every row is a link to a match and the feed carries one item shape.
  An invitation is a second item kind; the feed type becomes a discriminated
  union and the tray gets a second row component.
- The popover is 326px wide and cannot host the sharing terms and a Join
  button. The row links out to the offer pane.
- The feed is workspace-scoped; invitations are per email and must appear
  whichever workspace is active.
- The dot counts live invitations alongside in-flight jobs, and the tooltip
  detail names both ("1 invitation · 2 in flight"). The tray's rule stands:
  no mark-all-read; the dot clears itself when the last item resolves, and an
  invitation resolves by being accepted or expiring.

**Product rules**
- Nobody reaches a Join button without passing the sharing terms and the
  quota footer (`src/components/join/join-terms.tsx`), same as the link flow.
- The provider is "Advantage Intelligence" in every user-visible string.
- Dashboard UI changes follow `docs/ui-revamp-guardrails.md` and the design
  system skill; the tray is dashboard chrome and gets the guardrails review.
- The invitee's email is never put in a URL.

## Success criteria

1. A new account whose email holds a live invitation sees that invitation
   before the first onboarding question. Pressing Join makes them a member of
   the program with the invitation's role, marks the invitation accepted,
   stamps onboarding, and lands them on `/dashboard/team` with that program
   active. The coach's roster shows them.
2. Pressing "Not now" on step zero continues to the normal questions, writes
   nothing, sends nothing, and the invitation stays open.
3. An already-onboarded account whose email holds a live invitation sees a
   row for it in the header activity tray on every dashboard page, with the
   tray's dot showing and the tooltip counting it. Opening the row and
   pressing Join produces the same outcome as criterion 1.
4. Accepting by id with a non-matching email, or with an unconfirmed email,
   is refused with a status and creates no membership. The refusal reads as
   an ordinary outcome, not an error.
5. An invited new account completes onboarding without being sent to the
   program search or "Request an invite" for that program.
6. Two live invitations for the same address both appear, and accepting one
   leaves the other live.
7. The token link flow behaves exactly as before: same screens, same accept
   function, same results.
8. The migration exists in `supabase/migrations/` and both functions exist on
   the live project.
9. Lint, type-check and the test suite pass, and the guardrails reviewers
   raise nothing on the tray change.

## Open questions

1. **Where the offer pane lives for an existing account.** A small route
   (linkable from the tray row, decline as a query flag the way
   `/join/[token]?not-now=1` works) or a dialog opened from the tray. Seed
   lean: route. Stage 02 decides.
2. **The dot after "Not now".** The row stays while the invitation is live,
   because it is. Whether the dot is suppressed per browser after a decline
   is open.
3. **Guardian accounts.** Step zero runs before the persona is known, and Join
   sets the role from the invitation. A parent whose address was invited "as
   a player" for a junior would skip the guardian consent screen, which
   onboarding says cannot be deferred. Should the offer be withheld until the
   persona is chosen, or should an invited account that identifies as a
   guardian still pass through consent before Join?
4. **Unconfirmed accounts.** Hide the invitation until the email is confirmed
   (fail closed, silent), or show it with "confirm your email to join"?
5. **An invitation addressed to an account already on the roster** (a coach
   re-inviting a member). The accept function tolerates it; should the
   surfaces hide it?

## Also consulted

None beyond the seed. Every code fact above was established in the
discussion that produced the seed and is recorded there.
