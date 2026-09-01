# Tasks — claude/auth-redirect-cross-account-79c1db

> Scope: the `/join/[token]` invite-acceptance flow — send wrong-account and signed-out invitees through the real login page (password or Google) with a clamped return address, instead of a password-only dead end.

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

## T1 · Honor a clamped `next` on both login paths
- **status:** todo
- **model:** opus
- **files:** src/components/auth/login-form.tsx, src/app/(auth)/login/page.tsx, tests/safe-next.spec.ts (new) — guess
- **done when:**
  - [ ] On `/login?next=%2Fjoin%2Fabc`, a successful password sign-in calls `router.push("/join/abc")` instead of the unconditional `router.push("/dashboard")`; with no `next` param it still lands on `/dashboard`.
  - [ ] The Google button's `redirectTo` becomes `${window.location.origin}/callback?next=${encodeURIComponent(next)}` where `next` is the clamped value, replacing the hard-coded `?next=/dashboard`; with no `next` param the callback URL still carries `/dashboard`.
  - [ ] Both paths read the raw query value once and pass it through `safeNext()` from `@/lib/auth/safe-next` before use — `?next=https://evil.com` and `?next=//evil.com` each resolve to `/dashboard` on the password path and in the Google `redirectTo`; no unclamped query value reaches `router.push` or `redirectTo`.
  - [ ] `useSearchParams()` in the login page is wrapped in a `<Suspense>` boundary the way `src/app/(auth)/error/page.tsx` does it, and `npm run build` completes without a missing-Suspense error.
  - [ ] A new pure spec `tests/safe-next.spec.ts` asserts `safeNext` returns `/dashboard` for `null`, `"https://evil.com"`, `"//evil.com"`, `"/\\evil.com"` and `"javascript:alert(1)"`, and returns `"/join/abc?not-now=1"` unchanged; `npm test` passes.
- **notes:** `safeNext` is pure and already imported by `/callback` and `/confirm`; the client must clamp too because the password path navigates client-side. The login page must not receive or prefill the invitee's email — `next` carries a path only. Confirm in the Supabase dashboard (Authentication → URL Configuration) that the redirect allow-list entry for `/callback` tolerates an arbitrary `next` query value; it cannot be verified from the repo. Playwright here runs pure-logic specs with no browser or webServer (see `playwright.config.ts`), so the spec imports `safeNext` directly.

## T2 · Route join sign-in and wrong-account through `/login?next=`
- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** src/app/join/[token]/page.tsx, src/components/join/join-forms.tsx, src/lib/services/programs/join-actions.ts — guess
- **done when:**
  - [ ] In `page.tsx`, the `sign_in` case calls `redirect("/login?next=" + encodeURIComponent("/join/" + encodeURIComponent(token)))` for both the plain request and `?not-now=1` (no `NothingSent` branch there any more), and `JoinSignIn` is no longer imported; the `ready` and `sign_up` cases keep their existing declined → `NothingSent` branches.
  - [ ] `JoinSignIn` (join-forms.tsx) and `signInAndAccept` (join-actions.ts) are deleted — `grep -rn 'JoinSignIn\|signInAndAccept' src` returns nothing — and the two header comments describing the old path are rewritten for the login redirect: join-actions.ts ("an existing account is sent to a sign-in field and nowhere else") and page.tsx ("Seven states … Three carry a form"). `npm run lint` and `npx tsc --noEmit` pass.
  - [ ] `signOutForInvite` still signs out first, then redirects to `/login?next=<encoded /join/token>` when `loadInvite` finds the invite and to `/login` otherwise. `JoinWrongAccount`'s paragraph no longer contains "open the link again"; it says that after signing out they sign in as the invited address and return to this invitation (e.g. "Sign out, sign in as {invitedEmail}, and you'll come straight back here."), and the button reads "Sign out and sign in".
  - [ ] `JoinSignUp` renders exactly one new link with text "Sign in with Google instead" whose `href` is `/login?next=<encoded /join/token>`, placed inside its `ClaimActions` row after `NotNowLink` (where `JoinSignIn`'s "Forgot your password?" anchor sat) using the same `text-[12px] text-[var(--blue)] hover:underline` classes; the name/password form and `createAccountAndAccept` are otherwise unchanged.
  - [ ] The `ready` state is untouched: `JoinReady` still renders `JoinSharingTerms`, the `Join {programName}` button and `NotNowLink`; acceptance remains a POST through `acceptInvite` behind that button and nothing on `/join/[token]` accepts on GET. `NotNowLink` is rendered by `JoinReady` and `JoinSignUp` only.
- **notes:** Tokens are base64url (`tokens.ts`), so the double `encodeURIComponent` is belt-and-braces, not a fix. The one invariant to keep intact is the header of join-actions.ts: an invite link may create an account but never set an existing account's password — deleting `signInAndAccept` removes code, adds none. Do not pass the invited email to `/login` in any form. The stale "only the sign-in one carries Forgot your password?" remark in `join-terms.tsx` (~line 194) can be corrected in passing if touched.

## T3 · Stamp `onboarded_at` in `acceptInvite`
- **status:** todo
- **model:** sonnet
- **files:** src/lib/services/programs/join-actions.ts — guess
- **done when:**
  - [ ] `acceptInvite` reads the signed-in user's id from the server client's `auth.getUser()` — never from an argument — and after `acceptWithSession` returns `ok` runs `createAdminClient().from("users").update({ onboarded_at: <ISO now> }).eq("id", user.id).is("onboarded_at", null)`, the same shape `createAccountAndAccept` already uses.
  - [ ] A failed accept (`outcome.ok === false`) performs no update: the stamp runs only after the membership is confirmed, mirroring the existing comment's rule.
  - [ ] A stamp error is logged as `console.error("[join] could not mark the account onboarded", { message })` and does not change the returned result or the `redirect("/dashboard/team")` that follows — best effort, like the existing stamp.
  - [ ] `npm run lint` and `npx tsc --noEmit` pass; no other action in the file changes.
- **notes:** Closes the bounce at `src/app/dashboard/layout.tsx:45` for a Google-created account that joins via the link: it never passes through `/onboarding` before `/join`, so `onboarded_at` is null at accept time. Independent of T1/T2 but edits the same file as T2 — fine under the sequential runner.
