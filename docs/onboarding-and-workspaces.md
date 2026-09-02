# Onboarding and workspaces — where the questions belong, and what a workspace is

**Status:** point-in-time (2026-08-18), branch `collegiate-workspaces`
**Read alongside:** [`ux-overhaul-brief.md`](ux-overhaul-brief.md) (personas and flows), [`ui-revamp-guardrails.md`](ui-revamp-guardrails.md) (what must not break)

> **Point-in-time.** §1 and §2 describe shipped behaviour and were verified
> against the code on the date above. §3 through §5 are open decisions with a
> recommendation, not a built design. If you implement one, supersede that
> section here rather than leaving it to drift.

Four questions came out of reviewing the collegiate claim flow. Two were
answered by the code as designed and are recorded here so they stop being
re-asked. Two are unresolved, and one of those has a prerequisite on a branch
that is not merged.

---

## 1. Where onboarding happens today

**A normal sign-up answers no questions at all.** `sign-up-form.tsx:66` sends
`emailRedirectTo: …/confirm?next=/dashboard`, so a new account lands on the
dashboard directly.

The one question set that exists — F2, *"How do you use Advantage?"* at
`/claim` — is reachable from exactly two places:

| Entry point | File |
|---|---|
| Sidebar → "Create team workspace" | `src/components/dashboard/sidebar/workspace-row.tsx:177` |
| Login page → "Bringing a team?" | `src/components/auth/login-form.tsx:183` |

So the persona question only fires for someone who has already decided to claim
a program. That is the wrong shape, and §3 is about fixing it.

---

## 2. Personal versus team workspaces — settled, keep team-only

**Only team workspaces are creatable, and that is correct.** A personal
workspace is *derived*, not created: `personalWorkspace()`
(`src/lib/workspace/active-workspace-server.ts:29`) builds one from the account,
so exactly one always exists and no UI can make a second.

The convention argument is that Slack, Linear, Notion and Vercel all work this
way — you *have* a personal space by virtue of having an account, and you *add*
organisations. That is true but not the binding reason.

**The binding reason is the usage ledger.** `processing_usage` keys an
individual's allowance by user id with `account_type = 'individual'`, so the
personal workspace id **is** the account id that ledger already uses — which is
why `personalWorkspace()` sets `id: viewer.id` rather than minting anything. A
second personal workspace would need a synthetic account id, and would then
either split one person's monthly allowance across two containers or silently
double it. Both are billing defects, and neither is visible on screen.

When someone asks for "another personal workspace" they almost always want
separate contexts, which is a filter problem, not a container problem.

Multiple *team* workspaces already work and are the real case: a coach at two
programs, or one who changes schools.

---

## 3. First-run onboarding — open, with a recommendation

F2 currently does two jobs at once: establish who you are, and enter the claim
flow. Those are different events. Deciding you are a coach happens once, at
first sign-in; claiming a program is an action taken later, possibly much later,
possibly never.

| Option | What it means | Cost |
|---|---|---|
| **A. Leave it** | Persona is only ever asked of people who claim | Everyone else is unclassified forever; the dashboard cannot adapt to a player vs a coach |
| **B. First-run step after `/confirm`** | `next=/welcome` instead of `/dashboard`; ask persona once, then route | One new route; needs a skip path so it is never a wall |
| **C. Ask lazily, in context** | No dedicated screen; infer from first meaningful action | No interruption, but the answer arrives too late to shape the first screen, which is the thing worth shaping |

**Recommended: B**, with F2 reduced to routing only. The persona question moves
to first sign-in and is answered once; `/claim` keeps just the program search.
B is also the only option that makes §4 worth doing, because a persona nobody
is asked for is a persona nobody can store.

Whatever is chosen, F2's copy already promises *"You can change this in
settings"* — so a settings control is part of the work, not a follow-up.

---

## 4. Persisting the persona — blocked on `plan-role-split`

**The F2 answer is currently persisted nowhere.** `role-choice.tsx` holds it in
`useState` and calls `router.push()`; it is gone the moment the route changes.

**Do not write it to `users.role` on this branch.** That column is still the Pro
entitlement marker here — `users.role === 'founder'` means paid, read at
`create-checkout-session/route.ts:34`, `webhooks/stripe/route.ts:69`,
`lib/user/roles.ts:20`, and `settings/subscription/page.tsx:247,288`. Writing a
persona over it **silently downgrades a paying customer**, with nothing on
screen looking wrong.

The `plan-role-split` branch (`69119d4`) is exactly the fix: it adds
`users.plan` with a trigger blocking client writes, moves the webhook and
checkout onto it, and makes `saveProfile` validate `role` against the persona
list. Only its *migration file* is tracked on `collegiate-workspaces`; the app
code is not. **Merging that branch is a hard prerequisite** for storing a
persona anywhere near `users.role`.

There are also already three role vocabularies, and a fourth should not be
invented:

| Vocabulary | Values | Means |
|---|---|---|
| `ProgramRole` (`workspace/types.ts:20`) | `owner` `coach` `staff` `player` | Standing *inside one program*, from `program_members.role` |
| Setup form (`setup-form.tsx:10-16`) | `head_coach` `associate_coach` `assistant_coach` `player` `other` | Job title claimed at setup, stored on the claim |
| `users.role` | `player` `coach` `parent` `academy` | Profile persona — and, today, `founder` for Pro |

The F2 answer belongs in the third once that column is safe to write.

---

## 5. Back and exit — open, and worth doing regardless

There is **no back control anywhere in the claim flow**. The only match in the
whole subtree is "Back to search" on the contact-owner form. Browser back works
between F2 → F3 → F3.2 → F4 because they are separate routes, but nothing on
screen says so.

There is also **no exit**. `ClaimShell`'s header logo links to `/`, so a
signed-in coach who entered from the sidebar's "Create team workspace" is
bounced to the marketing home rather than back to their dashboard.

Recommended, and small:

- A back link on F3, F3.2 and F4. It matters most on F4, which is the only
  genuinely one-way step — submitting sends mail and writes a `pending_claims`
  row.
- `ClaimShell` should target `/dashboard` when a session exists, `/` otherwise.

---

## 6. What this document does not decide

- Whether an invite request should carry a role/standing field. Today a
  reviewer cannot tell a player's request from a staff member's without reading
  the free-text note (`program_requests`, `kind='invite_request'`). Worth
  fixing; it changes the table and the admin queue.
- Anything about the *team* onboarding after a claim settles — roster import,
  invites, permissions. Only the pre-claim questions are covered here.
- The objection window's settle step. Nothing moves `objection_window` to
  `approved` today, and nothing needs to, since both derive to an `active`
  program.
