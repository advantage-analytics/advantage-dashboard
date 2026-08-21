# The pilot branch — what it does, and what it leaves you

**Status:** current as of 2026-08-21, branch `claude/pilot-program-roadmap-724bdb` @ `806f069`
**Read alongside:** [`ui-revamp-guardrails.md`](ui-revamp-guardrails.md) (what the pipeline needs from the UI), [`r2-and-webhook-overview.md`](r2-and-webhook-overview.md) (how the pipeline works), [`onboarding-and-workspaces.md`](onboarding-and-workspaces.md) (why only team workspaces are creatable)

Thirteen commits, 54 files. Written for whoever merges this or picks up what is
left. It assumes you have read neither the branch nor the session that produced
it.

The short version: **the collegiate pilot's user-facing loop now runs end to
end** — a coach invites, the invitation arrives, the person joins, matches are
visible to the program, and the analysis that comes back has a page, a video and
a comparison to sit in. What remains is listed in §6, and none of it is a
half-finished thing on this branch; each is either owned by another branch or
gated on a decision.

---

## 1. What was actually broken

The pilot's blocker was never the vendor integration. That was the most finished
part of the codebase — 1.54 GB uploaded, HMAC verified, results stored, source
reclaimed, on a real 86-minute match. The blockers were on either side of it:

**Nobody could join a team.** `inviteMember()` called
`hashToken(generateToken())` — creating an invitation token and discarding it in
the same expression. No mail was sent, because the app had no sender at all, and
no acceptance page existed. A coach could press Invite, watch the row read
"outstanding" forever, and the person named would never hear anything and could
not have accepted if they had.

**Inside a program, nobody had a route to a match list.** `/dashboard/matches`
filtered on `created_by = auth.uid()`, so `TEAM_NAV` deliberately carried no
Matches entry rather than show a coach their own uploads presented as the
program's.

**Four of the rail's destinations were placeholders** — Roster, Compare,
Statistics, Ask.

---

## 2. What this branch adds

| Area | What landed |
|---|---|
| **Transactional email** | `lib/services/email/` — Resend over `fetch`, a shell shared with the auth templates, nine templates |
| **Invitations** | The token now reaches the recipient; `/join/[token]` accepts it; `accept_program_invite()` writes the membership |
| **Roster** | `/dashboard/team/roster` — members, roles, per-person upload permission, per-person analysis time, outstanding invites |
| **Compare** | `/dashboard/team/compare` — two players, rates not totals, selection in the URL |
| **Statistics** | Reconnected. Nothing had been deleted; only the page was missing |
| **Matches** | Workspace-scoped, and back in the team rail |
| **Toasts** | The listener `match-upload-failed` never had |
| **Playback** | The trimmed video, which had been stored and rendered nowhere |
| **Retry** | A submission that never happened now says so and offers a retry |

Two migrations, **both applied to the live database**:

- `20260820151500_accept_program_invite.sql`
- `20260821070000_program_roster_membership_only.sql`

---

## 3. Merging: three files another branch also touches

Everything else on this branch is new files or files nobody else edits.

### `src/lib/dashboard/nav.ts` — also on `claude/events-lineups-design-5c68a3`

Both branches add an entry to `TEAM_NAV`. **Keep both.** They are not
alternatives:

- **Schedule** reads `program_events` — "what is this program playing"
- **Matches** reads `matches` — "what has been analysed"

The comment that used to explain why Matches was absent has been replaced with
one explaining why it is back. Take this branch's version of that comment and
add the events branch's Schedule entry to the array.

### `src/lib/data/match-analysis.ts` — also on `splitstep-derivation`

Purely additive on both sides, so the merge is mechanical:

- **this branch** adds `jobId`, `updatedAt` and `isSubmitStalled()`
- **derivation** adds a `timeline` status and its rationale

Keep both. Nothing either side adds is read by the other.

### `src/app/dashboard/matches/[matchId]/page.tsx` — also on `splitstep-derivation`

The real conflict, and the derivation branch's change is the structural one:
it renames `analysis` to `jobAnalysis`, adds `withStatsPublished()`, and splits
the sections on whether statistics were published. This branch only adds a
`getMatchVideo()` call to the existing `Promise.all` and renders
`<MatchVideoCard>` above `PerformanceTrackerCard`.

**Take the derivation branch's structure and re-apply this branch's two
additions on top.** They do not interact — the video does not care whether stats
were published.

---

## 4. Invariants this branch introduces

Things that look incidental and are not. Each cost something to learn.

**An invitation link may create an account. It may never change the password of
one that exists.** Those render as the same "set your password" box, and the
second is a password reset triggered by anyone who can read the invited
person's mail — forwarded mail included. So an existing account is sent to a
sign-in field and a link to the real reset flow, which proves control of the
mailbox *now* rather than up to fourteen days ago. See the header of
`services/programs/join-actions.ts`.

**`/join` is a page, not a route handler.** A GET that accepted on sight would
be consumed by mail scanners and security software before a person ever saw it,
sometimes against the wrong account.

**`accept_program_invite` compares addresses with `is distinct from`, never
`<>`.** When the session's `auth.users` row cannot be read, `lower(email) <>
NULL` is NULL, plpgsql treats NULL as false, and the address check falls through
to grant the membership. A deleted user holding an unexpired JWT reaches that.

**The email sender checks the suppression list before sending.** Sending to a
suppressed address does not fail: Resend answers 200, returns an id, and drops
the message. Without the check, `sendEmail` reports success for mail that was
never delivered — the exact failure the warning path exists to prevent. The
check **fails open** on purpose: a 429 or a 5xx returns "not suppressed" and the
send proceeds, because this exists to make a silent drop visible, not to become
a new reason mail cannot leave.

**`shell.ts` is a hand-kept copy of `supabase/email-templates/*.html`.** Those
are uploaded to Supabase and filled by its template engine, so they cannot be
imported at runtime. Change one, change the other, or product mail stops looking
like auth mail. Routing auth mail through this sender instead would mean owning
delivery for password resets, and a reset that does not arrive is an account
nobody can recover.

**`isSubmitStalled` reads `updated_at`, never `created_at`.** A job row is
created before the transfer starts; on a 4 GB upload those are an hour apart, so
`created_at` would call a healthy job stalled the moment it landed.

**The submit route resolves its three vendor answers body → job → match.** The
job columns are null for exactly the jobs a retry is for — this route only
writes them at submit, and a failed submit is marked `failed`, not `uploaded`.
The match row carries the answers from before the upload began.

**`roster_visible` no longer gates the member list**, only match data. One flag
was answering two questions, so a coach who wanted a team roster had to publish
everyone's statistics to get one.

**Tailwind's arbitrary animation utility cannot carry a `cubic-bezier(...)`.**
The commas inside the parens end the arbitrary value and the utility is dropped
entirely — no error, no class, a green build. That is why the toast animation is
a `.toast-enter` class in `globals.css` rather than `animate-[...]`.

---

## 5. Verification

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Expect **0 errors, 38 warnings** — all pre-existing. It was 39 before this
branch; deleting the dead `match-video-panel.tsx` removed one.

What was actually exercised, so you know what was not:

| | |
|---|---|
| `accept_program_invite` | all five outcomes, against real fixtures in a rolled-back transaction |
| `/join` unauthenticated states | in a browser — sign-up, expired, already-used, unknown token |
| The join server actions | real round trips; empty and weak-password refusals |
| `sendEmail` | one live delivery, plus both suppression branches |
| Ten email templates | delivered to a real inbox and read |
| `program_roster` | against the live program: member sees all, matches stay closed, non-member sees nothing |
| `isSubmitStalled` | nine boundary cases |

**Not exercised.** `/join`'s `ready` and `wrong_account` states, and the coach's
invite UI in Settings › Team — all three need a signed-in session. The retry
button's click path: locally `resolveDeploymentConfig()` returns 503 because
`SPLITSTEP_API_KEY` is Preview-only, so no retry has reached the vendor. There
is a genuinely stalled job in the database (`85518306-2baf-427e-ad6c-79555041a523`)
waiting to be that test on a Preview deploy.

---

## 6. What is left

### Blocked on another branch

**First-run persona.** `/claim`'s F2 asks "How do you use Advantage?" and throws
the answer away in `useState`. It cannot be stored because `users.role` is still
the paid-entitlement marker — `role === 'founder'` means Pro, read by checkout
and the Stripe webhook — so writing a persona over it silently downgrades a
paying customer. The `users.plan` migration is **already applied**; the code half
is on `plan-role-split` (one commit, nine files). Merge that first. Then:
`/welcome` after `/confirm`, one question, a skip path, and a settings control —
F2's copy already promises "You can change this in settings", so that control is
part of the work, not a follow-up.

**Analysis notifications.** `analysisReadyEmail` and `analysisFailedEmail` are
written and unused. They need one call at the point a job becomes readable,
which lives in the derivation publish step on `splitstep-derivation`. Both
guards are already in place: `user_preferences` has zero rows and the data layer
treats absent as defaults (ready on, failed on, digest off), and the suppression
check landed here. The templates take a `statsPending` flag; with derivation's
new `timeline` status that flag is what distinguishes "your report is ready"
from "processing finished, numbers to follow".

### Gated on a decision, not on code

**Retry after a vendor failure.** This branch handles the cheap case: a job
stuck at `uploaded`, no vendor job, bytes already in Azure. A job the vendor
returned `job_failed` on is different — the route refuses when `external_job_id`
is set, and retrying means re-reserving quota and creating a second vendor job
for one match. Whether a re-run should cost the program's 75 hours twice is a
budget question, and it should be answered before it is coded.

**The weekly team digest.** `teamDigestEmail` and `digestIsWorthSending` exist;
nothing schedules them. Needs a Monday cron, which on Vercel runs Production
only — see §7.

### Genuinely new work

**Ask.** Still a placeholder, and unlike Statistics nothing survives behind it:
no chat UI ever existed, and `/api/chat` requires a single `matchContext`, so
answering across a season means changing that contract. A real feature.

**A separate sending subdomain.** `advantage-analytics.com` currently sends both
cold outreach to college staff and transactional pilot invitations. The
suppression list already holds about twenty `.edu` addresses from the outreach.
Complaints against outreach damage the reputation the invitations depend on, and
the one email that must arrive is riding on the one most likely to be marked as
spam. Splitting transactional mail onto its own subdomain is a Resend domain add
plus three DNS records and one line in `email/config.ts`.

---

## 7. Environment and ops

**`RESEND_API_KEY` is set** — locally, and on Vercel for **Production and
Preview**. Preview is the one that matters: it deploys this branch, so a preview
deployment sends real mail to real people.

**`NEXT_PUBLIC_SITE_URL` is not set locally**, so `siteUrl()` falls back to
`http://localhost:3000`. On a dev server running any other port, every emailed
link points at the wrong one. Set it per checkout. Do **not** be tempted to
derive the origin from the request's `Host` header — an attacker who can set
`Host` gets invitation links pointing at their own host, and the recipient hands
over a valid token by clicking something that looks legitimate. Email links come
from configuration.

**`SPLITSTEP_API_KEY` and `CRON_SECRET` are Preview-only.** Production
submissions 503 and the reclaim cron never fires there. Unchanged by this branch
and still true.

**The live database is ahead of `main` by more than this branch.** Four
migrations from the events/lineups branch are applied (`program_events`,
`program_event_entries`, `matches_event_entry`, `program_member_ladder`), plus
`splitstep_derivation_quality`. `main` has no programs schema and no video
pipeline at all — it is roughly 100 commits behind `collegiate-workspaces`.
Branch new work off `collegiate-workspaces`, never `main`.

---

## 8. One correction to carry forward

An earlier reading of this project held that video-derived matches could not
produce `result_type`, and that the match page would therefore need permanently
blank Winners and Unforced Errors cells. **That is out of date.**
`splitstep-derivation` now derives point winners and `result_type`, and handles
the remaining uncertainty per statistic rather than per card: winners and errors
are published and marked approximate, aces are withheld entirely because an ace
cannot be distinguished from a service winner.

The Compare screen on this branch was built against that reality — its measure
list is deliberately serve, return and pressure rates only, all of which
derivation can produce cleanly, so an imported match and a video match compare
on equally populated columns. If you extend Compare, keep that rule.
