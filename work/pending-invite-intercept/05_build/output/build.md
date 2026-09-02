# Build — pending-invite-intercept

Queue: `.claude/tasks/claude-auth-redirect-cross-account-79c1db.md`. All seven
feature tasks are `done`; none blocked. Tree clean at `cb4c563`.

## Task statuses

| Task | Title | Model | Status | Commit | Gate |
|---|---|---|---|---|---|
| T4 | Add the pending-invite read and accept-by-id migration | fable | done | `8e311ad` | mechanical · completion pass · RLS reviewer clear · applied live |
| T5 | Server plumbing: pending-invite loader, outcome mapping, accept action | fable | done | `2af6fe4` | mechanical · completion pass · RLS reviewer clear |
| T6 | Live-database spec for the pending-invite functions | opus | done | `6f13d41` | mechanical (9 new live tests pass) · completion pass |
| T7 | Shared join components and the `InviteOffer` pane | opus | done | `267153c` | mechanical + build · completion pass |
| T8 | Add the `/invitations/[inviteId]` route | opus | done | `a196253` | mechanical + build · completion pass |
| T9 | Onboarding step zero | opus | done | `701b9d5` | mechanical + build · completion pass |
| T10 | Header activity tray invitation row | opus | done | `cb4c563` | mechanical + build · completion pass · guardrails reviewer clear |

Every task's per-stage verdicts, what changed, and its follow-up ideas are in
`.claude/tasks/claude-auth-redirect-cross-account-79c1db.log.md`. Two gate
calls worth knowing: T4's completion review read "no new advisor finding
naming either function" as excluding the lint class that the task's own
`security definer` + `grant execute to authenticated` requirement produces
(the delegate function carries the same lint); T6's first review attempt was
lost to a network error and re-run to a full verdict.

## Commit range

`a326151..cb4c563` — seven commits, one per task, on top of the stage 04
commit:

```
cb4c563 T10: Header activity tray invitation row
701b9d5 T9: Onboarding step zero
a196253 T8: Add the `/invitations/[inviteId]` route
267153c T7: Shared join components and the `InviteOffer` pane
6f13d41 T6: Live-database spec for the pending-invite functions
2af6fe4 T5: Server plumbing: pending-invite loader, outcome mapping, accept action
8e311ad T4: Add the pending-invite read and accept-by-id migration
```

The branch also carries T1–T3 (`3349333`, `7d3942c`, `7a3c429`), the
separate join-page redirect fix that preceded this feature's scaffold.

## Blocked items

None.

## Notes

**Unconfirmed-caller check, done by hand as the plan required.** On the live
project, inside a transaction that was rolled back: as the `authenticated`
role with a JWT claim for a non-existent user id (which the functions treat
exactly like an unconfirmed one, since `auth.users.email_confirmed_at`
resolves to null either way), `pending_program_invites()` returned 0 rows and
`accept_pending_invite(<a real open invitation id>)` returned
`status = 'unconfirmed'` with `program_id` null. Nothing was written.

**Test suite** now stands at 266 specs: 250 at the start of the feature,
plus 9 live-database tests (T6) and 7 pure `trayDetail` cases (T10).

**Live database drift noted by T4:** two migrations applied on 2026-09-01
(`account_deletion_retains_program_data`,
`program_audit_log_allow_account_deleted`) are not in this worktree's
`supabase/migrations/`; the integration branch should end up with their
files.

**For stage 06:** the plan's by-hand browser checks (a fresh Google account
with a live invitation sees step zero and lands on the team page; an
onboarded account sees the tray row on every dashboard page; Not now writes
nothing; two invitations both appear; the token link flow unchanged) were
deliberately kept out of subagent criteria and belong to the review.

## Also consulted

- Live database (Supabase MCP, project `pouxujkhtbvkdwbzfvka`): the
  rolled-back unconfirmed-caller check above.
- `git log --oneline a326151..HEAD` for the commit range.
