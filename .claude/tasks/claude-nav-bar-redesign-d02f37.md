# Tasks — claude/nav-bar-redesign-d02f37

> Scope: dashboard sidebar refinements — nav icons, coming-soon marker, sign-out relocation, workspace-switcher focus.

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

## T1 · Nav data: ChartLine, UsersRound, comingSoon flag + spec
- **status:** done
- **model:** sonnet
- **files:** src/lib/dashboard/nav.ts, tests/nav-icons.spec.ts (new) — guess
- **done when:**
  - [ ] In `src/lib/dashboard/nav.ts` the `lucide-react` import block no longer contains `BarChart3` or `Users`; `PERSONAL_NAV` Statistics and `TEAM_NAV` Statistics carry `icon: ChartLine`, and `TEAM_NAV` Roster carries `icon: UsersRound`. No other entry's `name`, `href` or `icon` changes.
  - [ ] `NavLink` gains an optional `comingSoon?: true` field with a doc comment stating that the route's page renders `ComingSoonPage`, that the flag surfaces in the collapsed rail's tooltip and the row's `aria-label`, and that the expanded label stays clean.
  - [ ] Exactly four entries set `comingSoon: true`: `PERSONAL_NAV` Statistics (`/dashboard/statistics`), `PERSONAL_NAV` Ask (`/dashboard/ask`), `TEAM_NAV` Statistics (`/dashboard/team/statistics`), `TEAM_NAV` Ask (`/dashboard/team/ask`). Opponents (`/dashboard/opponents`) is NOT flagged.
  - [ ] New `tests/nav-icons.spec.ts` (same `@playwright/test` import-the-module register as `tests/activity-tray-detail.spec.ts`) asserts: both Statistics entries have `icon === ChartLine`, Roster has `icon === UsersRound`, and the set of hrefs with `comingSoon` across `PERSONAL_NAV` and `TEAM_NAV` equals exactly those four hrefs. `npx playwright test tests/nav-icons.spec.ts` passes.
  - [ ] `npm run lint` exits 0. No file other than the two above is modified.
- **notes:** Plan Step 1. `ChartLine` and `UsersRound` are exported by the installed `lucide-react` ^0.562 (verified in design). Opponents is deliberately unmarked — design open question 1; do not "fix" it. Nothing renders the flag until T2, so no visual check here.

## T2 · Rail row renders the coming-soon marker
- **status:** done
- **model:** sonnet
- **needs:** T1
- **files:** src/components/dashboard/sidebar/rail-item.tsx, src/components/dashboard/app-sidebar.tsx (one prop in the `mainLinks` map only) — guess
- **done when:**
  - [ ] `RailItem` accepts a new `comingSoon?: boolean` prop and passes `detail={comingSoon ? "Coming soon" : undefined}` to the existing `RailTooltip`; `rail-tooltip.tsx` and `ChromeTooltip` are not modified (no timing, offset, width or `align` edits).
  - [ ] When `comingSoon` is true the `aria-label` on both the `<Link>` branch and the `<button>` branch is `` `${label}, coming soon` ``; when false/undefined it is `label` exactly as before. The visible expanded-label text, the 40px glyph column and the row's class string are unchanged.
  - [ ] `app-sidebar.tsx` passes `comingSoon={link.comingSoon}` inside the `mainLinks.map(...)` only; the `bottomLinks` map and the toggle row receive no such prop, and no other line in that file changes.
  - [ ] Preview-harness check (per `reference_unauth_preview_harness`): collapsed rail, hover Statistics → tooltip shows "Statistics" with a dimmed "Coming soon" second line; hover Matches → single-line tooltip; expanded panel → labels identical to before. Report the observed `aria-label` of the Statistics row at both widths.
  - [ ] `npm run lint` exits 0, and any harness route/fixtures created for the check are deleted before commit (`git status` shows only the two files above).
- **notes:** Plan Step 2. The `detail` slot already exists on `RailTooltip` and flips `align` to `start` on its own. The `aria-label` widening is the accessibility half of the marker and is not optional.

## T3 · Sign-out row on Settings → Account
- **status:** done
- **model:** opus
- **files:** src/app/dashboard/settings/account/page.tsx, src/components/dashboard/logout-dialog.tsx — guess
- **done when:**
  - [ ] `logout-dialog.tsx`'s `handleLogout` calls `supabase.auth.signOut({ scope: "local" })` rather than the bare `signOut()`, whose auth-js default is `scope: "global"`. A comment states why: the shared dialog is the "sign out here" action, and revoking every device's refresh token is a separate, explicitly-labelled control. Nothing else in that file changes — the context, the confirmation dialog, the unsaved-changes warning and the error state are untouched.
  - [ ] Section `02 · Where you're signed in` renders two rows in one hairline-bordered group (a `flex-col`, not the current single `flex` row): first row glyph `Monitor`, title "This device", copy "Ends this session only. Other devices stay signed in.", action button `Sign out` (`SettingsButton variant="outline" size="sm"`); second row glyph `MonitorSmartphone`, existing copy "Signing out everywhere ends every other session too — phones included." and the existing `Sign out everywhere` button wired to the unchanged `handleSignOutEverywhere` / `isSigningOut`.
  - [ ] The new `Sign out` button's `onClick` is the value of `useRequestLogout()` imported from `@/components/dashboard/logout-dialog`, so it opens the existing shared confirmation dialog rather than signing out directly — verified in the preview harness. The two rows are now genuinely different actions: local for the first, `scope: "global"` via the untouched `handleSignOutEverywhere` for the second.
  - [ ] The two rows share one row shape (either `FactRow` reused or the existing section-02 row markup repeated) — the diff introduces no third bespoke row component; the section's top and bottom hairlines align with sections 01 and 03 in the harness screenshot.
  - [ ] The `lucide-react` import gains `MonitorSmartphone`; sections 01 and 03, the section-02 comment's intent (no device list is recorded), `handleDelete`, and every other section are unchanged. `npm run lint` exits 0 and any preview-harness route/fixtures are deleted before commit, so `git status` shows only the two files above.
- **notes:** Plan Step 3; design §4 table. Ordered before T4 so sign-out never has zero homes outside the header.

  **Amended 2026-09-06 after the first run was blocked.** The original criteria wired the "This device" row to `useRequestLogout()` while forbidding any change to `logout-dialog.tsx` — but that dialog calls `supabase.auth.signOut()` bare, and `@supabase/auth-js` defaults it to `scope: "global"`. The row would have revoked every session while its copy promised the opposite, and both rows would have been the same action. The human's decision: make the shared dialog local. That deliberately changes the header profile menu's sign-out too, since both share the dialog — it makes the header behave the way its label already implied, and that is the point, not a side effect.

  A reviewed implementation of everything except the `scope` change is stashed at `7b9a3ec` (`git stash apply 7b9a3ec`) — it passed lint, typecheck, completion review and guardrails, and was blocked only on the semantics above. Applying it as a starting point is expected but not required; if you do, drop the stash entry afterwards.

  `FactRow` has a 130px label column and did not fit the glyph + two-line + button shape on the first attempt, so that run repeated the existing section-02 row markup instead — allowed by the plan. Update the section comment's "One row, not a device list" wording to match two rows. The second row needs a title of its own once "This device" moves up; the first attempt used "Every device".

## T4 · Remove sign-out from the sidebar footer
- **status:** todo
- **model:** sonnet
- **needs:** T2, T3
- **files:** src/components/dashboard/app-sidebar.tsx — guess
- **done when:**
  - [ ] `ViewerFooter` renders only the profile `<Link>` to `/dashboard/settings/profile`; the `{expanded && <button …aria-label="Sign out">}` block, the `onSignOut` prop in its signature, and the `onSignOut={requestLogout}` argument at the call site are all gone. Its props type is exactly `{ expanded: boolean }`.
  - [ ] The `requestLogout` const and the `LogOut` (lucide) and `useRequestLogout` imports are removed from `app-sidebar.tsx`; `grep -n "LogOut\|useRequestLogout\|onSignOut" src/components/dashboard/app-sidebar.tsx` returns nothing.
  - [ ] The `ViewerFooter` doc comment no longer claims "Sign-out and the workspace sub-label are the only things dropped on collapse"; it is rewritten to describe what the footer now is (profile link whose label fades on collapse) and that sign-out lives in Settings → Account and the header profile menu.
  - [ ] `src/components/dashboard/logout-dialog.tsx`, `src/app/dashboard/layout.tsx` (where `LogoutProvider` mounts) and `src/app/dashboard/header.tsx` are not modified; the header profile menu's `Sign out` still opens the dialog in the harness.
  - [ ] `npm run lint` exits 0; preview harness shows no sign-out control in the sidebar at either width and the profile link's collapse fade still works; harness files deleted before commit.
- **notes:** Plan Step 4. Needs T2 because both tasks edit `app-sidebar.tsx`; needs T3 so a working non-header sign-out exists before this one is removed. `LogoutProvider` stays mounted — `header.tsx` is still a consumer.

## T5 · Workspace switcher opens focused on the current row
- **status:** done
- **model:** opus
- **files:** src/components/dashboard/sidebar/workspace-row.tsx — guess
- **done when:**
  - [ ] Row `<button>`s register into a `useRef<Map<string, HTMLButtonElement>>` via each button's `ref` callback (entry removed when the callback receives `null`); `PopoverContent` gets `onOpenAutoFocus` that, when the active workspace's button is in the map, calls `event.preventDefault()` and focuses that button — and when it is absent does NOT call `preventDefault()`, so Radix's default focus applies.
  - [ ] `PopoverContent` gets an `onKeyDown` handler: `ArrowDown` / `ArrowUp` call `preventDefault()` and move focus to the next / previous row button in `available` order, clamped at the ends (no wrap); both keys are ignored entirely (no preventDefault, no focus move) while `pendingId !== null`.
  - [ ] The diff adds no `focus-visible:ring*`, `ring-*`, `outline*` or other focus-styling class; the existing `focus-visible:bg-[var(--surface-subtle)]` on non-active rows and the bare active-row treatment are unchanged. `switchTo`, the trigger tooltip, `Escape`/click-outside handling and the `Create team workspace` link are untouched, and `src/components/dashboard/workspace-switcher.tsx` is not modified.
  - [ ] Preview harness with two workspaces: Tab to the row, Enter → menu opens with the blue focus ring on the current workspace's row; ↑/↓ move and stop at the ends; Enter switches; Escape closes and returns focus to the trigger. Opening by mouse click → the current row is `document.activeElement` but no ring is drawn.
  - [ ] `npm run lint` exits 0; harness route/fixtures deleted before commit so `git status` shows only this file.
- **notes:** Plan Step 5; independent of T1–T4. `src/styles/design-system/focus.css` already rings every `<button>` on `:focus-visible`, which is why no focus class may be written. Programmatic `.focus()` inherits the browser's modality heuristic, so keyboard-vs-mouse ring behaviour needs no extra state. Header list (`WorkspaceOptionList`) is design open question 2 — out of scope.
