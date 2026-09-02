# Brief seed — pending-invite-intercept

Replace or extend this with your raw intent in any form. `/feature-next
pending-invite-intercept` starts the pipeline once you're happy with it.

## Captured from the invocation (author's words, verbatim)

> Why don't we just have a signal or flag that if the email that was invited
> makes a new account that they go through the onboarding flow but they have
> an alert that they have already been invited. Or they are immediately
> prompted with a "You've been invited to <school>" or if they state that they
> play/coach for the school that it will say that they have already been
> invited and just have to accept to join.

> Yes, go with B and set both up, should it be a dashboard banner or show up
> in the activity feed? or a dialog when a user first enters?

> I meant the activity button on the header at the top right of the screen

## The gap this closes

Nothing in the app looks up `program_invites` by the signed-in person's
email. An invitee who never clicks the email link and signs up on their own
walks through onboarding, answers "I play" / "Yes, college roster", searches
for the program and presses "Request an invite" — so the coach receives a
join request from someone they already invited, and the invitation row sits
unused until it expires. An existing, already-onboarded account that is
invited later has no way in except the email.

## Agreed in discussion (2026-09-01) — edit freely

- **Option B, two surfaces, one shared offer pane and one lookup.**
  1. Onboarding **step zero**, before the persona question in
     `src/app/onboarding/onboarding-flow.tsx`: "You've been invited to
     <program> as <role>[, by <inviter>]" with the sharing terms and a Join
     button, plus "Not now" which continues into the normal questions.
  2. A row in the header **activity tray**
     (`src/components/dashboard/activity/activity-tray.tsx`, the popover
     titled "Notifications", fed by `getActivityFeed` in
     `src/lib/data/activity-server.ts`) for anyone with a live invitation —
     covers accounts invited after onboarding, and anyone who pressed Not
     now and changed their mind. The row links to the same offer pane step
     zero uses; it does not accept inline.
- **Why the tray, not a home banner or a dialog.** The tray is the app's one
  notification surface and renders on every dashboard page, where a banner
  would live on the home page only. Its blue dot already means "something
  needs you", and its rule that the dot clears itself with no mark-all-read
  holds for an invitation, which clears when accepted or expired. A dialog
  blocks, and step zero already is the first-entry prompt for new accounts.
  (The personal home's "Activity" widget is a heatmap of match days, not a
  feed, and was never a candidate.)
- **Tray constraints to design around.** Every row today is a `Link` to a
  match and the feed item is one shape (`ActivityItem`: matchId, title,
  analysis, at). An invitation is a second item kind, so `ActivityFeed`
  becomes a discriminated union and the tray gets a second row component.
  The 326px popover cannot host the sharing terms and a Join button, hence
  the link-out. The feed is workspace-scoped; invitations are per-email and
  must show whichever workspace is active. The dot count adds live
  invitations to in-flight jobs, and the tooltip detail names both
  ("1 invitation · 2 in flight").
- **Where the offer pane lives for an existing account** is a stage-02
  decision: a small route (linkable from the tray row, decline as a query
  flag the way `/join/[token]?not-now=1` works) or a dialog. Lean: route.
- **Why step zero, not after the college question.** A coach invitee never
  reaches the college question (step 1 "I coach" finishes onboarding); the
  invitation already answers both questions; invites also come from
  non-college (custom org) programs.
- **Join from the offer pane** sets `users.role` from the invite's role,
  stamps `onboarded_at` if null, sets the workspace cookie to the program
  (see `activate()` in `src/lib/services/programs/join-actions.ts`) and
  lands on `/dashboard/team`. The sharing terms and quota footer
  (`src/components/join/join-terms.tsx`) are shown before Join, same rule as
  `/join/[token]`: nobody reaches a Join button without passing them.
- **Not now.** Onboarding: continue as today. From the tray: the row stays
  while the invitation is live, because it is; whether the dot is suppressed
  per browser after a decline is a stage-02 call.
- **Database (the one required piece).** The accept function
  `accept_program_invite(p_token_hash)` needs the token, and only the hash is
  stored, so the app cannot rebuild a join link. Add:
  - a read function scoped to the caller returning their live invitations
    (unaccepted, unexpired) with program name, role, inviter name and invite
    id — the invitee has no RLS access to `program_invites`, and that stays;
  - an accept-by-invite-id function sharing `accept_program_invite`'s body,
    requiring `lower(invite.email) = lower(caller email)` **and**
    `auth.users.email_confirmed_at is not null`, so an unconfirmed password
    sign-up with someone else's address cannot take their seat. Google
    accounts arrive confirmed. The token path is unchanged.
  - Email match is case-insensitive: `program_invites.email` is not stored
    lowercased.
  - Migration committed to `supabase/migrations/` and applied to the live
    project (repo convention: the live database is the source of truth).
- **Several live invitations** for one address: list them all.
- **Out of scope here:** the `/join/[token]` sign-out/Google redirect fix.
  That is its own task on branch `claude/auth-redirect-cross-account-79c1db`.
