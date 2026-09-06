# Plan — nav-bar-redesign

Five brief items, six steps, five files plus one new spec. Nothing here reads
the database or adds a route, so every step is verifiable with lint, the node
spec register, and the unauthenticated preview harness.

Steps are sized for one fresh subagent context each: no step opens more than
two source files, and the two largest files in the feature
(`settings/account/page.tsx`, `sidebar/workspace-row.tsx`) get a step to
themselves.

---

## Step 1 — Nav data: icons and the `comingSoon` flag

**Files**
- `src/lib/dashboard/nav.ts`
- `tests/nav-icons.spec.ts` *(new)*

**Change**
- Import block: `BarChart3 → ChartLine`, `Users → UsersRound`. Remove the two
  old names — they have no other use in the file and lint will fail on them.
- `PERSONAL_NAV` Statistics and `TEAM_NAV` Statistics → `ChartLine`.
- `TEAM_NAV` Roster → `UsersRound`.
- Add `comingSoon?: true` to the `NavLink` type, with the doc comment from the
  design (what it means, where it surfaces, that the expanded label stays
  clean).
- Set `comingSoon: true` on exactly four entries: `PERSONAL_NAV` Statistics,
  `PERSONAL_NAV` Ask, `TEAM_NAV` Statistics, `TEAM_NAV` Ask. **Not** Opponents
  — the design leaves it unmarked deliberately.
- New spec asserts: Statistics carries `ChartLine` in both lists, Roster
  carries `UsersRound`, and the set of `comingSoon` hrefs is exactly those
  four. Follow the node-style register of the existing `tests/*.spec.ts`.

**Verification**
`npm run lint` (catches the dropped imports) and running the new spec alone.
No visual check — nothing renders differently yet; the flag has no reader
until Step 2.

---

## Step 2 — Rail row renders the marker

**Files**
- `src/components/dashboard/sidebar/rail-item.tsx`
- `src/components/dashboard/app-sidebar.tsx` (one prop passed in the
  `mainLinks` map — no other edit in this step)

**Change**
- `RailItem` gains `comingSoon?: boolean`.
- Pass `detail={comingSoon ? "Coming soon" : undefined}` to `RailTooltip`.
  Use the existing `detail` slot; do **not** touch `RailTooltip`,
  `ChromeTooltip`, tooltip timing, offset, or the `align` switch — the
  primitive already handles all of it.
- `aria-label` becomes `` `${label}, coming soon` `` when the flag is on, on
  both the `link` and `button` branches, at both widths. This is the
  accessibility half of the marker and is not optional.
- The visible expanded label, the 40px glyph column, and the row's classes are
  unchanged.
- `AppSidebar` passes `comingSoon={link.comingSoon}` for `mainLinks` only.
  `bottomLinks` and the toggle row do not get it.

**Verification**
`npm run lint`. Then the preview harness: collapsed rail, hover Statistics →
dark tooltip shows "Statistics" over a dimmed "Coming soon"; hover Matches →
single-line tooltip, unchanged; expanded panel → labels identical to before.
Inspect the Statistics row's `aria-label` at both widths.

**Depends on** Step 1 (the flag does not exist before it).

---

## Step 3 — Sign-out arrives on Settings → Account

**Files**
- `src/app/dashboard/settings/account/page.tsx`

**Change**
Section **02 · Where you're signed in** becomes two rows in one group,
following the design's table:

- new row — `Monitor`, "This device", "Ends this session only. Other devices
  stay signed in.", action `Sign out`
  (`SettingsButton variant="outline" size="sm"`), handler `useRequestLogout()`
  from `@/components/dashboard/logout-dialog`;
- existing row — switch its glyph to `MonitorSmartphone`, keep its copy, its
  `Sign out everywhere` button and `handleSignOutEverywhere` exactly as they
  are.

Rebuild the section as a `flex-col` sharing the file's existing hairline
rhythm — reuse `FactRow` if it fits the two-line-plus-button shape; do not
invent a third row shape. Update imports (`MonitorSmartphone`).

No change to `LogoutProvider`, the confirmation dialog, `handleDelete`, or any
other section.

**Verification**
`npm run lint`. Preview harness on `/dashboard/settings/account`: two rows
under heading 02, `Sign out` opens the existing confirmation dialog, `Sign out
everywhere` still runs its own global path, hairlines align with sections 01
and 03.

**Ordered before Step 4** so sign-out never has zero homes outside the header.

---

## Step 4 — Sign-out leaves the sidebar

**Files**
- `src/components/dashboard/app-sidebar.tsx`

**Change**
- Delete the `expanded && <button>` sign-out block from `ViewerFooter`, its
  `onSignOut` prop and the prop passed at the call site, the `requestLogout`
  const, and the now-unused `LogOut` / `useRequestLogout` imports.
- `ViewerFooter` takes only `expanded` and renders the profile `Link` alone.
- **Rewrite its doc comment.** "Sign-out and the workspace sub-label are the
  only things dropped on collapse" is false after this step; leaving it is a
  lie in the one file the next reader will trust.
- `LogoutProvider` stays mounted — `src/app/dashboard/header.tsx` is still a
  consumer of the context.

**Verification**
`npm run lint` (unused imports). Preview harness: no sign-out control anywhere
in the sidebar at either width; the profile link and its collapse fade still
behave; the header profile menu's `Sign out` still opens the dialog.

**Depends on** Step 3.

---

## Step 5 — Switcher opens focused on the current workspace

**Files**
- `src/components/dashboard/sidebar/workspace-row.tsx`

**Change**
- Hold row buttons in a `Map<string, HTMLButtonElement>` ref, populated by each
  button's `ref` callback and cleaned on unmount.
- `PopoverContent` gets `onOpenAutoFocus`: `preventDefault()` and focus the
  active workspace's button. If that ref is absent, do **not** preventDefault —
  fall through to Radix's own behaviour rather than opening a menu with focus
  nowhere.
- `onKeyDown` on the content: `ArrowDown` / `ArrowUp` move focus to the
  next/previous row button, clamped (no wrap), `preventDefault()` on both.
  Ignore both keys entirely while `pendingId !== null`, since the rows are
  disabled mid-switch.
- **Write no focus classes.** `src/styles/design-system/focus.css` already
  rings every `<button>` on `:focus-visible`; a `focus-visible:ring-*` utility
  here is silently discarded. The existing
  `focus-visible:bg-[var(--surface-subtle)]` wash on non-active rows stays; the
  active row keeps its bare treatment.
- Escape, click-outside, the trigger's tooltip, the `Create team workspace`
  link, and `switchTo` are untouched.

`src/components/dashboard/workspace-switcher.tsx` (the header's list) is
**not** touched — carried as design open question 2.

**Verification**
`npm run lint`. Preview harness with two workspaces available: Tab to the
workspace row, Enter → menu opens with a blue ring on the current workspace's
row; ↑/↓ move and stop at the ends; Enter switches; Escape closes and returns
focus to the trigger. Open the same menu by mouse click → focus is on the
current row but **no** ring is drawn.

**Independent** of Steps 1–4; can run in any order relative to them.

---

## Step 6 — Full verification pass

**Files** — none.

**Change** — none. This step exists because the preview harness is a throwaway
route that must be deleted before the suite runs, and because the per-step
checks are all partial.

**Verification**
1. Delete any preview-harness route and fixtures created during Steps 2–5.
2. `npm run lint`
3. `npm test`
4. `git status` clean of harness residue.

**Depends on** every other step.

---

## Test strategy

**Automated where the thing that can silently regress is data.** The nav lists
are a hand-maintained mapping between hrefs, glyphs and a coming-soon flag —
exactly the kind of table that drifts when a page ships and nobody updates its
entry. `tests/nav-icons.spec.ts` (Step 1) is the whole automated surface, and
it is worth having.

**Manual for everything visual and every focus behaviour.** The repo's `tests/`
are node-style specs over data and pure functions; there is no DOM or
component-render harness, and adding one for four rows of chrome is not in the
brief. Tooltip content, the absence of the sidebar sign-out, the Account row
pair, and the `:focus-visible` modality distinction are all verified through
the unauthenticated preview harness — which is also the only way to see these
components from a worktree with no browser session. The harness route and its
fixtures are throwaway and must be gone before Step 6 runs `npm test`.

**Lint carries more weight than usual here.** Three of six steps remove an
import as a side effect (`BarChart3`, `Users`, `LogOut`, `useRequestLogout`),
so `npm run lint` is the cheapest detector of an incomplete edit and should run
after every step, not only at the end.

**Not tested, deliberately:** `LogoutProvider`'s sign-out path and the global
sign-out action. Neither changes; Step 3 adds a second caller of an unchanged
hook and Step 4 removes one.

## Order dependencies

```
1 ──► 2 ──┐
3 ──► 4 ──┼──► 6
5 ────────┘
```
