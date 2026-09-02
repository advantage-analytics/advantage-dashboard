# Review — pending-invite-intercept

Sign-off: approved — by the author, 2026-09-02, in chat ("set it to approved and land it"), recorded here by Claude on their
instruction. The by-hand browser checks under "Left for the human" were
not run before this approval.

Reviewed range: the branch against `splitstep-integration`, `1b9a2c3...HEAD`,
which carries T1–T3 (the join-page redirect fix), T4–T10 (this feature) and
three review commits made in this stage. `/pr-check` ran in full; its receipt
is quoted at the end. Verdict: **ready**, subject to the sign-off above and
the by-hand checks listed under "Left for the human".

## Success criteria, one by one

| # | Criterion (brief) | Status | Evidence |
|---|---|---|---|
| 1 | New account with a live invitation sees it before the first onboarding question; Join lands them on the team page as a member, onboarded, program active, on the roster | Met in code; browser check pending | `src/app/onboarding/page.tsx` step zero; `adoptMembership()` stamps onboarding and persona; `finishJoin()` sets the workspace cookie and redirects; the live spec proves membership, `accepted_at` and the audit row |
| 2 | Not now on step zero continues to the questions, writes nothing, sends nothing, invitation stays open | Met | `?not-now=1` is a GET flag read by `isNotNow()`; the page skips the query and renders `OnboardingFlow`; no action runs |
| 3 | Onboarded account with a live invitation sees a tray row on every dashboard page, dot lit, tooltip counting it; opening the row and pressing Join gives the same outcome | Met in code; browser check pending | `activity-tray-loader.tsx` fetches invitations beside the feed on every page; `InviteRow` links to `/invitations/<id>`; `trayDetail()` feeds tooltip and `aria-label` (7 pure tests) |
| 4 | Accept by id with a non-matching or unconfirmed email is refused with a status and no membership | Met, proven | `tests/pending-invites.spec.ts`: stranger's accept → `wrong_address`, no seat. Unconfirmed: rolled-back live check in stage 05 → read returns 0 rows, accept returns `unconfirmed`, `program_id` null |
| 5 | Invited new account completes onboarding without being sent to the program search or Request an invite | Met | Step zero precedes the persona question and Join redirects to `/dashboard/team`; the request flow is untouched |
| 6 | Two live invitations both appear; accepting one leaves the other | Met in code; browser check pending | The read returns all live rows; the tray renders one row each; `InviteOffer`'s multi-row shape (now with per-row allowances); the accept function stamps only the row it was given |
| 7 | Token link flow unchanged: same screens, same accept function, same results | Met, proven | `accept_pending_invite` delegates to `accept_program_invite`; the live spec's token-path regression passes; `/join/[token]`'s states are unchanged apart from the redirect fix that preceded this feature |
| 8 | Migration in `supabase/migrations/` and both functions live | Met | `20260902032248_pending_invites.sql`; live `pg_proc` shows both with `prosecdef` and an empty search path; the spec runs against them |
| 9 | Lint, type-check and tests pass; guardrails raise nothing on the tray | Met | Final run: lint 0 errors, tsc clean, 266 specs, build clean; `pipeline-guardrails-reviewer` clear on the final range |

## What the gate found, and what was done

**Stage 1, mechanical.** Lint, tsc and 266 tests green before and after every
change in this stage.

**Stage 2, simplify (`6daba22`).** Four cleanup agents; applied: one
`acceptVia()` mapping behind both accept functions; the onboarding stamp
written once; leaf modules `join-links.ts` (URLs and the decline flag) and
`join-role.ts` (role nouns, invitation sentence) so dashboard chrome stopped
importing the terms module (2.4 KB out of every dashboard page's chunk); the
`sign_in` state's unrendered payload and `PendingInvite`'s unused fields
dropped; `JoinPane` on `ClaimShell`'s session-resolving exit, which let the
invitations page stop rebuilding the shell and made its decline pane land on
the dashboard; `/login` server-rendered so its form is in the first paint
again (the Suspense wrapper had prerendered an empty panel). The React
best-practices skill's triggers fired and its checks were folded in.

**Stage 3, code review at medium (`6bebaaa`, `63cd8e2`).** Eight finder
angles, one verifier per candidate. Fixed, all CONFIRMED unless noted:

1. The invitation token rode into Supabase's OAuth `redirect_to` URL through
   `/login?next=`. A first-party cookie now carries the destination across
   the Google round trip; `redirectTo` is the fixed value the allow-list
   already knows; `/callback` reads, clamps and clears the cookie on every
   exit, and the form clears it on attempts with nothing to carry.
2. "Sign out and continue" sent an invited address with no account to a
   login it could not use; it now goes back to the link's sign-up form.
3. The multi-invitation footer quoted one program's allowance for a list
   that can mix a college (75 h) and a club (2 h); figures are per row now.
4. A database failure on `/invitations/[inviteId]` read as "invitation isn't
   available"; it now has its own pane with a retry.
5. Only the id door set the persona; all three doors now adopt the
   membership the same way.
6. Refusal copy told tray and onboarding readers to open a link.
7. (PLAUSIBLE) The decline flag ignored a repeated query key.

Also fixed in passing: the tray used a hand-spelled link and its own
subtitle; two stale "three screens" comments; the persona backfill's
user lookup now overlaps the accept.

**Stage 3, project reviewers.** The range is not all task-gated (it carries
pipeline and review commits), so both guardrail reviewers ran over the whole
range, twice: before the review fixes and again on the final tree. Both
found nothing both times. The Postgres best-practices check found no defect
in the migration and three non-blocking improvements (below).

## Consciously left

- **`pending_program_invites()` is volatile** though it only reads; the
  repo's sibling read helpers are `stable`. The applied migration must not
  be edited; a follow-up migration re-creating it with `stable` (and, if
  wanted, as `language sql`) is the fix. The same follow-up could mark the
  index `if not exists` for environment rebuilds.
- **The tray's dot stays lit while a declined invitation is live.** A
  design decision recorded in stage 02 (open question 2); the removed-
  behaviour angle flagged it as a change from "the dot always drains". Left
  as designed, worth revisiting if people find it nagging.
- **`ClaimShell` has no "no exit" mode**, so the onboarding intercept
  re-types the shell's outer frame (the third copy). Fixing it means
  changing the shared shell used across `/claim`; a separate change.
- **`InviteOffer` still accepts an empty list** and would render terms with
  nothing to accept; both pages guard against it. A guard inside the
  component is a small later tidy-up.
- **`/invitations/[inviteId]` loads every pending invitation** and keeps one;
  the list is tiny, and filtering in the function means a signature change.
- **Two updates to the same `users` row on accept** (stamp, then persona);
  collapsing them needs a database function.
- **The UUID check duplicates a private regex** in the splitstep integration,
  which is deliberately untouched.
- **`invited_by` (the inviter's user id) is returned by the read function**
  beside the name; not a credential, and the invitee was deliberately
  contacted, but a conscious decision rather than an accident.
- **The unconfirmed-caller sentence is unreachable through the UI.** By
  design: the read hides unconfirmed callers so the invitation list cannot
  be used to enumerate which addresses a program invited; the sentence is
  defence in depth for raw callers of the action.

## Left for the human

The plan kept these out of subagent criteria because a queued task cannot
drive a browser. They belong to this sign-off, on a preview deployment:

- A fresh Google account holding a live invitation sees step zero and lands
  on the team page after Join, onboarded and inside the program, with the
  persona set.
- An onboarded account sees the tray row on every dashboard page with the
  dot and the tooltip count; the row opens the offer; Join works.
- Not now on both surfaces writes nothing and the row persists.
- Two live invitations both appear; accepting one leaves the other.
- The Google sign-in from `/login?next=/join/<token>` lands back on the
  invitation (the cookie handoff), and a plain Google sign-in still lands on
  the dashboard.
- The `/join/[token]` link flow end to end.

Two live migrations from 2026-09-01 are missing from this worktree's
`supabase/migrations/` (noted by T4); the integration branch should carry
their files.

## Receipt

Recorded at the code tip, `63cd8e2`. The one commit after it is this
review file, which touches nothing under `src/`.

```
63cd8e2  ready      2026-09-02T06:44:40Z  claude/auth-redirect-cross-account-79c1db
    reviewed: the branch range up to that commit
    base: 1b9a2c3
    note: pending-invite-intercept + join redirect: simplify applied (6daba22), 7 confirmed review findings fixed (6bebaaa, 63cd8e2); guardrail reviewers clear on the final range
    ran: lint, tsc, test, build, simplify, vercel-react-best-practices, code-review, pipeline-guardrails-reviewer, rls-boundary-reviewer, supabase-postgres-best-practices
    skipped: none
```

## Also consulted

Beyond the stage's inputs (build report, the range diff, the brief, the
pr-check skill): `.claude/skills/simplify` and `code-review` procedures as
loaded by the Skill tool; `~/.claude/skills/vercel-react-best-practices`
and the `supabase:supabase-postgres-best-practices` rule files; every
source file in the range, read by the finder and verifier agents;
`node_modules/@supabase/auth-js` (how `redirectTo` travels) and
`node_modules/next/dist/compiled/@edge-runtime/cookies` (cookie decoding),
read by the verifiers; the live database once, for the stage 05 unconfirmed
check quoted above.
