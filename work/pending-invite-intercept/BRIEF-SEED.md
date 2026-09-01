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

## The gap this closes

Nothing in the app looks up `program_invites` by the signed-in person's
email. An invitee who never clicks the email link and signs up on their own
walks through onboarding, answers "I play" / "Yes, college roster", searches
for the program and presses "Request an invite" — so the coach receives a
join request from someone they already invited, and the invitation row sits
unused until it expires. An existing, already-onboarded account that is
invited later has no way in except the email.

## Agreed in discussion (2026-09-01) — edit freely

- **Option B, two surfaces, one shared component and one lookup.**
  1. Onboarding **step zero**, before the persona question in
     `src/app/onboarding/onboarding-flow.tsx`: "You've been invited to
     <program> as <role>[, by <inviter>]" with the sharing terms and a Join
     button, plus "Not now" which continues into the normal questions.
  2. A dismissable **banner** at the top of the personal dashboard home
     (`src/app/dashboard/(home)/home-content.tsx`) for anyone with a live
     invitation — covers accounts invited after onboarding, and anyone who
     pressed Not now and changed their mind.
- **Why a banner, not a dialog or the activity feed.** A dialog blocks, and
  step zero already is the first-entry prompt for new accounts. The personal
  home's "Activity" widget is a 52-week heatmap of match days, not an event
  feed, and the invitee is not on the team yet so the team-home feed is
  unreachable to them. Banner is a recommendation, not a decision — change it
  here if you disagree.
- **Why step zero, not after the college question.** A coach invitee never
  reaches the college question (step 1 "I coach" finishes onboarding); the
  invitation already answers both questions; invites also come from
  non-college (custom org) programs.
- **Join from the intercept** sets `users.role` from the invite's role,
  stamps `onboarded_at`, sets the workspace cookie to the program (see
  `activate()` in `src/lib/services/programs/join-actions.ts`) and lands on
  `/dashboard/team`. The sharing terms and quota footer
  (`src/components/join/join-terms.tsx`) are shown before Join, same rule as
  `/join/[token]`: nobody reaches a Join button without passing them.
- **Not now / dismiss.** Onboarding: continue as today. Banner: remembered
  per invitation per browser (invites expire in 14 days, so nothing durable
  is needed).
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
