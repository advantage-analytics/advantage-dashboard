# Review — nav-bar-redesign

**Sign-off:** approved — 2026-09-06, by Clajerson Gimena, who read this
report and instructed the change in session ("approve the sign-off and
continue"). Recorded on their behalf, not self-approved.

## The gate that ran

`/pr-check` ran twice over the branch range `8e8d017...HEAD`, before this
stage rather than inside it, and both runs recorded receipts:

| commit | verdict | what it said |
|---|---|---|
| `e16249a` | **not-ready** | gates green; one correctness finding open; quality fixes uncommitted |
| `3d2bb50` | **ready** | gates green; no findings; both guardrail reviewers clear; clean tree |

Only one commit has landed since the `ready` receipt — `99b0f82`, the stage 05
build report, which is markdown under `work/`. `git diff 3d2bb50..HEAD -- src
tests` is **empty**, so the reviewed code is byte-identical to what the `ready`
receipt attests. I re-ran the mechanical gates fresh for this stage rather
than citing the old ones (lint 0 errors, `tsc --noEmit` clean, `npm test` 427
passed) and did **not** re-dispatch `simplify`, `code-review` or the two
guardrail reviewers over an unchanged diff — that would spend a multi-agent
review to reach a conclusion already recorded. If you would rather see a fresh
full pass before signing off, say so and it is one `/pr-check` away.

## Success criteria, from the brief

The brief's five criteria, checked one at a time. Where a check was made by
reading code rather than by looking at the running app, it says so — the
distinction matters, and three of these were also verified in a browser during
the task runs.

1. **"Statistics shows `chart-line` and Roster shows `users-round` in both the
   collapsed rail and the expanded panel, in every workspace kind that has
   them."** — **met.** `nav.ts:46` and `:110` carry `ChartLine` on the personal
   and team Statistics entries; `:105` carries `UsersRound` on Roster.
   `tests/nav-icons.spec.ts` asserts all three by identity. Both widths render
   the same `link.icon` through one `RailItem`, so there is no width-specific
   path that could diverge.

2. **"Hovering a coming-soon item in the collapsed rail shows the item name
   plus a 'Coming soon' marker; the expanded label is unchanged; built items
   are unmarked."** — **met**, and browser-verified during T2: collapsed
   Statistics showed the two-line tooltip, Matches stayed one line, and the
   expanded label was unchanged. `rail-item.tsx:129` passes the marker through
   the tooltip's pre-existing `detail` slot only when the flag is set.

3. **"No sign-out control anywhere in the sidebar; a working sign-out exists on
   Settings → Account and still confirms before signing out."** — **met.**
   `grep` for `LogOut|useRequestLogout|Sign out` in `app-sidebar.tsx` returns
   nothing. `account/page.tsx:166` wires the "This device" row to
   `requestLogout`, which opens the shared confirmation dialog — browser-
   verified in T3 to open the dialog rather than sign out directly. The header
   profile menu keeps its own sign-out, so the action has two homes.

   Worth recording against this criterion: satisfying it correctly required
   changing behaviour the brief did not anticipate. See "Findings" below.

4. **"Opening the workspace switcher by keyboard puts a visible focus ring on
   the current workspace's row; ↑/↓ moves from there and Enter selects."** —
   **met**, browser-verified twice. T5 saw the blue `--focus-ring` on the
   active row after a keyboard open, arrows moving and clamping at both ends,
   and no ring after a mouse open. The `/pr-check` fix run re-verified all of
   that still held afterwards.

5. **"`npm run lint` and `npm test` pass."** — **met**, re-run for this stage:
   lint 0 errors (32 pre-existing warnings in untouched files), 427 tests
   passed.

**All five met.** Two of the brief's own "Open questions" were resolved in
design and one was deliberately left — see "Consciously left".

## Findings and resolutions

**1. The shared logout dialog signed out globally.** *(T3, first run — the one
blocked task.)* The brief and design both had the "This device" row calling
the existing shared dialog while promising "Ends this session only." But
`logout-dialog.tsx` called `supabase.auth.signOut()` bare, and
`@supabase/auth-js` defaults that to `scope: "global"`. The row would have
revoked every device's session while saying it would not, and the page's two
rows would have been one action under two labels. **Resolved:** blocked rather
than shipped, escalated, and the human chose to make the shared dialog local —
knowingly changing the header profile menu's sign-out too, on the reasoning
that the global default was an accident and the header's label already implied
local. T3 amended and rerun.

**2. Row tooltips opened on focus, covering the menu and eating Escape.**
*(`/pr-check` run 1, `code-review medium`.)* T5's focus work made each
switcher row's `ChromeTooltip` open on focus — Radix opens tooltips with no
delay on focus — so a dark label covered the menu on open and on every arrow
press, and each open tooltip swallowed an Escape meant for the menu.
**Resolved** in `33b80a1`: `onFocus` preventDefault on the row button, which
Radix composes ahead of its own handler, leaving hover intact so the squad and
role the tooltip carries are not lost. Reproduced in a browser first, with the
pointer parked away from the menu so hover was impossible, and re-verified
after. This also explains the two-press Escape T5's own run had observed and
logged as pre-existing — it was not.

**3. Quality findings.** `simplify` applied four fixes across the two runs: a
`SessionRow` extraction from two copy-pasted rows, an `aria-label` hoist in
`rail-item.tsx`, lucide's `LucideIcon` type in place of a third hand-rolled
copy, and the session-row divider moved onto the row to match `FactRow`'s
convention in the same file.

## Consciously left

Nothing blocking. Each of these is a deliberate call, not an oversight.

**Deferred by decision:**

- **`/dashboard/opponents` renders `ComingSoonPage` but carries no `comingSoon`
  flag**, so team users get a cue on Statistics and Ask but not Opponents.
  Design open question 1, deliberately left unmarked because `nav.ts`'s own
  comment treats that entry's placement as considered rather than a stub. It is
  now live in the UI rather than hypothetical, which is the one thing that has
  changed since the decision was made — worth a second look at sign-off.
- **The header's `WorkspaceOptionList` got none of the switcher's focus work.**
  Design open question 2. It declares `role="listbox"` while having no
  arrow-key handling, so it promises an ARIA contract it does not keep — a
  pre-existing gap this branch neither caused nor closed.
- **The second Account row's title, "Every device",** was not specified by the
  brief or design; it became necessary once "This device" moved up. Flagged in
  T3's notes as wording worth a human read.

**Adjacent, belonging on their own branch** (this repo's convention is that
findings outside the branch's surface get their own branch, not a follow-on
task):

- **`src/lib/services/programs/join-actions.ts:480`** — `signOutForInvite()`
  still relies on auth-js's global default: the same class of accident finding
  1 fixed, one file over. Found independently by two reviewers.
- **Radix `hidden` tooltips swallow Escape.** `hidden` on a `TooltipContent`
  hides it visually but leaves its dismissable layer live, so resting the
  pointer on the sidebar trigger while the switcher is open eats *every*
  Escape. `RailItem` passes `hidden={expanded}` to every nav row, so this
  likely reaches well beyond the switcher. Pre-existing; found while verifying
  finding 2.
- **Five hand-rolled copies of clamped arrow navigation** across the repo, each
  with its own wrap-or-clamp decision. `src/hooks/use-listbox-nav.ts` exists to
  prevent exactly this but is virtual-focus only.
- **Copy drift** — the logout dialog says "Log out" while every surface around
  it says "Sign out".

**Rejected during review, with reasons:** replacing `workspace-row.tsx`'s ref
`Map` with a DOM query (T5's accepted criteria specified the Map; rewriting
gated code against its own contract is not a quality pass's call); reusing the
shared `SettingsCardRow` instead of the local `SessionRow` (needs a new prop on
a primitive other settings pages share).

## Also consulted

Beyond the declared inputs:

- `.claude/hooks/pr-check-receipt.sh show` — the two recorded receipts
- `git diff 3d2bb50..HEAD -- src tests` — to establish the reviewed code is
  unchanged since the `ready` receipt
- `src/lib/dashboard/nav.ts`, `src/components/dashboard/app-sidebar.tsx`,
  `src/components/dashboard/sidebar/rail-item.tsx`,
  `src/app/dashboard/settings/account/page.tsx` — to check criteria 1–3 against
  the code rather than against the task log
- `.claude/tasks/claude-nav-bar-redesign-d02f37.log.md` — per-task gate
  verdicts and the follow-ups each run surfaced
