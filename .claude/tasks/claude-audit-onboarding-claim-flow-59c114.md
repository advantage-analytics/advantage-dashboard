# Tasks — claude/audit-onboarding-claim-flow-59c114

> Scope: Onboarding & collegiate claim flow — close the gaps against `Onboarding & Team Setup.dc.html` (first-login onboarding gate, team-workspace fork, guardian step, sharing terms, claim-flow defects).

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

## T1 · Gate first login into two-question onboarding
- **status:** blocked
- **model:** fable
- **files:** src/app/onboarding/ (new), src/app/dashboard/layout.tsx, src/components/claim/role-choice.tsx (copy source), supabase/migrations/ (new, applied to live DB), src/lib/services/programs/invite-acceptance.ts (guess)
- **done when:**
  - [ ] A signed-in user whose `users.onboarded_at` is null is redirected from any /dashboard route to the onboarding flow, and a user with it set can never reach the onboarding route again — the gate lives in the dashboard Server Component layout, not src/proxy.ts.
  - [ ] A migration adds `users.onboarded_at timestamptz` and backfills every existing row (e.g. with created_at), applied to the live database via the Supabase MCP with get_advisors clean — no existing user is re-onboarded.
  - [ ] Step 1 of 2 shows "How do you use Advantage?" with the three design cards (I play / I coach / I manage a junior's account, with the 1.2 sublines), and the chosen persona persists to `users.role` using the Settings profile vocabulary (play→player, coach→coach, junior→parent).
  - [ ] "I play" leads to Step 2 of 2 "Do you play for a college program?" with the three 1.3 options plus a Skip link; "Yes" lands on /claim/program?intent=join, while "No", "Not yet" and Skip land on /dashboard with onboarded_at set.
  - [ ] "I coach" (interim: /claim/program) and "I manage a junior's account" (interim: /dashboard) both set onboarded_at, and accounts created via invite acceptance (/join/[token]) or claim verify get onboarded_at set at creation so invited users and claimants are never bounced into onboarding — matching the design rule "an account that already exists never re-onboards".
- **notes:** Design: Onboarding & Team Setup.dc.html Stage 1 (screens 1.2, 1.3 — 1.1 is explicitly out of scope). /claim's RoleChoice carries the exact card copy to reuse. `users.role` is persona-only (migration 20260806144035 split entitlement into users.plan) — do not touch plan. The junior→parent mapping is a judgment call; profile settings can refine to academy later. T3 re-points the coach route, T5 the junior route. Full-screen pane style per design (no dashboard chrome). Read .skills/advantage-analytics-design/SKILL.md first.

## T2 · Non-college team workspace: schema + creation action
- **status:** todo
- **model:** fable
- **files:** supabase/migrations/ (new, applied to live DB), src/lib/services/programs/ (new create action), src/lib/workspace/active-workspace-server.ts, src/lib/workspace/types.ts (guess)
- **done when:**
  - [ ] The live database can hold a non-collegiate program (club / high school / academy / other): an org-type discriminator exists, collegiate-only fields (ITA program_key, division, conference, school_group) are nullable or defaulted for these rows, and get_advisors reports no new RLS gaps.
  - [ ] A server action creates such a program with the caller as owner in one atomic step (program row status active + program_members role owner, upload_enabled true) — no email confirmation, no pending_claims, no admin review — and sets the workspace cookie so the next render opens the new workspace.
  - [ ] The new workspace resolves through getWorkspaceContext() with canSubmitVideo true immediately, appears in the sidebar switcher, and /dashboard/team renders for it without collegiate assumptions breaking (no crash on null division/conference).
  - [ ] Program search (search_programs RPC and /api/programs/search) still returns only collegiate directory rows — custom orgs never appear in the public claim search.
  - [ ] Existing collegiate claim flow behavior is untouched: a Playwright or manual pass of /claim/[programKey] states is recorded in the task log.
- **notes:** Design: Stage 7 rationale — "no external record to verify against, so the creator simply owns it." Decide row-vs-new-table in the task (adding org_type to programs and relaxing constraints is the likely shape since program_members/budgets/RLS all hang off programs). Verify schema against the live DB, not supabase/migrations/ (repo is ~100 behind). Budget: same 75h shared default per design 7.2/7.3.

## T3 · Team-workspace fork screens and entry re-points
- **status:** todo
- **model:** opus
- **needs:** T1, T2
- **files:** src/app/claim/ or src/app/onboarding/ (fork + org screens, new), src/components/dashboard/sidebar/workspace-row.tsx, src/components/claim/ (guess)
- **done when:**
  - [ ] A signed-in "What kind of team is this?" fork screen exists with the two 5.1 cards (college program: "You'll claim it from the list; recorded staff confirm it" / club-high-school-academy: "You name it and it's yours — nothing to confirm"); college continues to /claim/program, other continues to the org-type screen.
  - [ ] The org-type screen (7.1: Tennis club / High school / Academy / Something else radio) and the setup screen (7.2: team name, your name, your role, with the "How this differs from a college team" aside) match the design copy and call T2's create action, landing inside the new team workspace.
  - [ ] The sidebar "Create team workspace" entry opens the fork directly — a signed-in user is never shown the /claim persona question from the sidebar.
  - [ ] Onboarding's "I coach" answer lands on the fork (replacing T1's interim route).
  - [ ] Every fork/setup step carries back (top-left) and ✕ (top-right → /claim/exit) per the Stage 6 chrome convention.
- **notes:** Design: screens 5.0, 5.1, 7.1, 7.2 (7.3's empty home already exists as /dashboard/team's first-steps). Public /claim URLs stay reachable for signed-out coaches arriving via referral links — the fork is the signed-in front door, not a replacement. Read docs/ui-revamp-guardrails.md and the design skill before touching sidebar chrome.

## T4 · Bind program claims to the signed-in account
- **status:** todo
- **model:** fable
- **files:** src/lib/services/programs/claim-actions.ts, src/app/claim/verify/route.ts, src/components/claim/setup-form.tsx (guess)
- **done when:**
  - [ ] A signed-in user who completes /claim/[key]/setup with a school email different from their login email ends up owning the program on their existing account — at no point is a second identity created or the session switched to another user.
  - [ ] The school address is still proven by a link sent to that address before the claim completes (the 6.8 email gate stays for both signed-in and signed-out claimants).
  - [ ] The signed-out public claim path (OTP signup via shouldCreateUser) behaves exactly as today — verified by re-running its existing tests or a manual pass recorded in the log.
  - [ ] The signed-in path is exercised end-to-end (start → email link → /claim/ready or /claim/review) with the workspace cookie set to the program, and evidence (test or transcript) is in the task log.
  - [ ] pending_claims verification still keys on proof the verifier controls the claimed mailbox — never on a URL parameter — for both paths.
- **notes:** Today startClaim always calls signInWithOtp(shouldCreateUser:true); with onboarding (T1/T3) routing signed-in coaches into the claim flow, that would mint duplicate identities. Likely shape: record claimant_user_id on pending_claims for signed-in starts and verify mailbox ownership without exchanging the session — design the mechanism in-task. Security-sensitive: rls-boundary-reviewer should look at the diff.

## T5 · Guardian step for junior accounts
- **status:** todo
- **model:** fable
- **needs:** T1
- **files:** src/app/onboarding/ (guardian screen, new), supabase/migrations/ (new, applied to live DB), src/components/dashboard/settings/profile-form.tsx (guess)
- **done when:**
  - [ ] Choosing "I manage a junior's account" in onboarding leads to the "Who's playing?" screen with player name, graduating class, the three under-18 acknowledgment rows, the consent checkbox and guardian-terms link, matching 3.1 copy.
  - [ ] Continue is disabled until the checkbox is ticked; submitting records player name, class year and a guardian-consent timestamp in the database (migration applied to the live DB, column names stated in the task log).
  - [ ] Completing the step sets onboarded_at and lands on /dashboard.
  - [ ] A non-junior persona never sees the screen, and re-visiting the onboarding route after completion is impossible (T1's gate covers it — verified once here).
- **notes:** Design: screen 3.1 — consent upfront because a guardian acting for a minor is the compliance case that shouldn't be progressive. Keep the model minimal (columns on users or one small table — decide in-task); the full "hand the account to the player later" transfer is out of scope. Academy staff take the same path per the design caption.

## T6 · Player join-intent polish — redacted status, sharing rows, referral exit
- **status:** todo
- **model:** opus
- **files:** src/components/claim/program-search.tsx, src/components/claim/contact-owner-form.tsx, src/app/claim/[programKey]/request/page.tsx, src/app/claim/ (referral screen, new) (guess)
- **done when:**
  - [ ] In ?intent=join, search result rows show only "On Advantage" for claimed programs and nothing revealing for the rest — an owner's name or claim state is never rendered to the player intent (claim intent unchanged).
  - [ ] /claim/[key]/request prefills the signed-in user's name from their profile with the "From your profile" note, and shows the three 4.2 sharing rows (coach approves / already-uploaded stays personal / team matches run on program hours) in the same order as the design, plus a "Keep it personal" secondary returning to /dashboard.
  - [ ] "My school isn't listed" under the join intent lands on the 4.3 referral screen — copyable app.advantage-analytics.com/claim?ref=<school> link with a working Copy button and "Continue to my account" → /dashboard — not the unlisted-program form (which the coach intent keeps).
  - [ ] Signed-out visitors on the join intent still work as today (name field editable, no prefill).
- **notes:** Design: screens 4.1–4.3. 4.1's caption is the rule for criterion 1: "'On Advantage' is the only status a player is allowed to see about a program they don't belong to." The 4.2 rows are the same trio as 8.2 (T10) — keep the copy in one shared place if practical. ?ref is a display/campaign parameter, not a program key — no lookup required.

## T7 · Structured role on invite requests
- **status:** todo
- **model:** fable
- **files:** supabase/migrations/ (new, applied to live DB), src/components/claim/contact-owner-form.tsx, src/lib/services/programs/claim-actions.ts, src/components/admin/review-rows.tsx (guess)
- **done when:**
  - [ ] The claimed-program request screen (6.4) shows an optional "Your role" select alongside name and note, with role values matching the claim setup vocabulary.
  - [ ] program_requests carries the role in its own nullable column, applied to the live DB with get_advisors clean, and requestInvite() writes it.
  - [ ] /admin/claims request rows display the role when present.
  - [ ] A request submitted without a role files exactly as today (no regression in the duplicate-request 23505 handling).
- **notes:** Design 6.4: "a request that arrives with a name and a reason gets answered." Name is already required; only the structured role is missing (today the note placeholder asks for it in prose).

## T8 · Wire the claim check-email resend button
- **status:** todo
- **model:** sonnet
- **files:** src/components/claim/resend-timer.tsx, src/lib/services/programs/claim-actions.ts
- **done when:**
  - [ ] The Resend button on /claim/check-email invokes a server action that re-sends the confirmation link for the pending claim (reusing startClaim's OTP send path and its rate-limit-friendly ordering) instead of only resetting the countdown.
  - [ ] The button disables for the 60-second cooldown after every send, and a send failure surfaces an inline error without clearing the countdown.
  - [ ] A link delivered by resend completes the claim exactly like the original (pending_claims row still matches; single-use behavior preserved).
- **notes:** Known defect: resend-timer.tsx's button only calls setLeft(60) today. The action needs program key + email context the page already has in its URL params.

## T9 · Wire the claim lifecycle emails
- **status:** todo
- **model:** opus
- **files:** src/lib/services/programs/admin-actions.ts, src/lib/services/programs/claim-actions.ts, src/lib/services/email/index.ts, src/lib/services/email/templates/claim.ts, src/lib/services/email/templates/invite-request.ts
- **done when:**
  - [ ] approveClaim sends claimApprovedEmail to the claimant, and rejectClaim / handBackClaim send the declined email — making /claim/review's "We'll email {email} either way" true.
  - [ ] requestInvite sends inviteRequestReceivedEmail to the program owner, and resolveRequest with a decline sends the decline email to the requester.
  - [ ] An email send failure never fails the underlying action — it logs and the action still succeeds, matching inviteMember's warning pattern.
  - [ ] The wiring table in src/lib/services/email/index.ts is updated to reflect what is now wired.
- **notes:** Templates are written and reviewed; only trigger points are missing (the index.ts table names each one). Do NOT wire the "objection notice to each contact" row — the announced claim was deliberately cut (see /admin/claims page header). Resend key unset = console-print mode, fine for dev.

## T10 · Sharing terms and Not-now on invite acceptance
- **status:** todo
- **model:** opus
- **files:** src/app/join/[token]/page.tsx, src/lib/services/programs/invite-acceptance.ts, src/lib/services/programs/join-actions.ts (guess)
- **done when:**
  - [ ] The ready, sign_in and sign_up states of /join/[token] show the 8.2 two-column sharing rows ("Your coaches will see": team-uploaded matches / trends / personal matches you choose to share · "Stays yours": everything uploaded so far / later personal matches / your account if you leave) before any Join button.
  - [ ] The footer states that team matches run on the program's budget, not the player's personal hours, using the program's real monthly figure.
  - [ ] A "Not now" action shows the 8.3a "Nothing was sent" state — the inviter is not notified, the invite is not consumed, and reopening the same link still offers Join until expiry.
  - [ ] The expired state gains an "Ask for a new invite" action that notifies the inviter (email via inviteMember's send path or a visible request) and confirms to the player, per 9.2a.
- **notes:** Design calls 8.2 "the most important screen in the document" — today the join page shows zero sharing copy. The three "coaches will see" rows are the same trio as 4.2 (T6). Invite tokens are hashed and single-use; "Not now" must not touch accepted_at.

## T11 · Getting-set-up checklist on the personal home empty state
- **status:** todo
- **model:** opus
- **files:** src/components/dashboard/home/empty-dashboard.tsx, src/app/dashboard/(home)/home-content.tsx, src/components/dashboard/team/first-steps.tsx (pattern source)
- **done when:**
  - [ ] The zero-match personal home shows a "Getting set up · n of 3" checklist modeled on the team first-steps pattern: "Account and playing profile" (done when hand/backhand are set), "Get your first match in" (link to /dashboard/matches/new), "Choose how you're notified when analysis lands" (link to /dashboard/settings/preferences).
  - [ ] Rows flip to done from real state without layout shift, the count in the header tracks them, and the whole block unmounts at 3 of 3 and never returns.
  - [ ] The existing two door cards (send a match / SwingVision import) remain — this task adds the checklist state without redesigning the rest of the empty home.
  - [ ] npm run lint and npm test pass, and the pipeline-guardrails-reviewer finds no violation for the dashboard change.
- **notes:** This is the "setting up state" the author asked to keep from the otherwise-ignored 2.1. If no real notification preference exists in settings/preferences, the implementer substitutes the closest real saved preference for row 3's done-state and says so in the log — do not invent a fake pref. Restraint applies (no amplification of the rest of the home). The "how did you hear" card is out of scope with 2.1.
