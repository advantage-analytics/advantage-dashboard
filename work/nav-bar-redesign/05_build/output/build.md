# Build report — nav-bar-redesign

The queue drained. All five tasks are `done`; one of them took two runs.

## Task statuses

| task | model | status | commit |
|---|---|---|---|
| T1 · Nav data: ChartLine, UsersRound, comingSoon flag + spec | sonnet | done | `f2beb5f` |
| T2 · Rail row renders the coming-soon marker | sonnet | done | `f5d95d1` |
| T3 · Sign-out row on Settings → Account | opus | done (2nd run) | `9ab4838` |
| T4 · Remove sign-out from the sidebar footer | sonnet | done | `e16249a` |
| T5 · Workspace switcher opens focused on the current row | opus | done | `1d64891` |

Per-task gate verdicts, the guardrails that ran versus were skipped, and the
follow-ups each run surfaced are in
`.claude/tasks/claude-nav-bar-redesign-d02f37.log.md`.

## Commit range

`8e8d017..HEAD` — 14 commits, oldest first:

```
bd8b3e4 pipeline(nav-bar-redesign): scaffold workspace
746f162 pipeline(nav-bar-redesign): stage 01 brief
7e008df pipeline(nav-bar-redesign): stage 02 design
af843a1 pipeline(nav-bar-redesign): stage 03 plan
acaec72 pipeline(nav-bar-redesign): stage 04 tasks
f2beb5f T1: Nav data: ChartLine, UsersRound, comingSoon flag + spec
f5d95d1 T2: Rail row renders the coming-soon marker
e67c131 T3: blocked
1d64891 T5: Workspace switcher opens focused on the current row
2c7e212 task: amend T3 for local sign-out and requeue
9ab4838 T3: Sign-out row on Settings → Account
e16249a T4: Remove sign-out from the sidebar footer
33b80a1 Quality pass: dedupe session rows and aria-label, stop focus opening switcher tooltips
3d2bb50 Quality pass: use LucideIcon and move the session-row divider onto the row
```

Seven source files plus one new spec; `work/` and `.claude/tasks/` carry the
rest.

## Blocked items

**None outstanding.** One task blocked and was resolved:

**T3 · Sign-out row on Settings → Account** blocked on its first run
(`e67c131`, work stashed at `7b9a3ec`). Not a failure of the work — the diff
satisfied every criterion and passed lint, typecheck, completion review and
guardrails. The *criteria* were wrong: criterion 1 gave the new "This device"
row the copy "Ends this session only. Other devices stay signed in." while
criterion 2 wired it to `useRequestLogout()` and forbade touching
`logout-dialog.tsx` — but that dialog called `supabase.auth.signOut()` bare,
and `@supabase/auth-js` defaults that to `scope: "global"`. The row would have
revoked every session while promising the opposite, and both rows on the page
would have been the same action under two labels.

The human chose to make the shared dialog local, deliberately changing the
header profile menu's sign-out along with it — on the reasoning that the
global default was an accident and the header's label already implied local.
T3 was amended (`2c7e212`), the stash was reapplied and dropped, and the rerun
passed (`9ab4838`).

Worth keeping: the block came from the completion reviewer *passing* and a
guardrail reviewer raising something explicitly outside its own scope. The
criteria were internally contradictory, and only reading the dependency's
default caught it.

## After the queue

`/pr-check` ran twice over the branch range.

- **First run — not ready.** Mechanical gates green. `simplify` applied two
  fixes (a `SessionRow` extraction, an `aria-label` hoist) and deferred three
  findings. `code-review medium` found one real bug: T5's focus work made every
  switcher row's `ChromeTooltip` open on focus — Radix opens tooltips with no
  delay on focus — so a dark label covered the menu on open and on every arrow
  press, and each open tooltip swallowed an Escape meant for the menu.
- **Fix.** Verified in a browser with the pointer parked away from the menu, so
  hover was impossible: all three symptoms reproduced, and one of them explains
  the two-press Escape T5's own run had logged as pre-existing. Fixed with
  `onFocus` preventDefault on the row button; hover still opens the tooltip, so
  the squad and role it carries are not lost (`33b80a1`).
- **Second run — ready.** Gates green, no correctness findings, both guardrail
  reviewers clear, two more quality fixes (`3d2bb50`). Receipt recorded on
  `3d2bb50` as `ready`, reviewed as the branch range with a clean tree.

## Carried forward for stage 06

Adjacent findings, none blocking, none queued — this repo's convention is that
these get their own branch rather than a follow-on task here:

1. **`src/lib/services/programs/join-actions.ts:480`** — `signOutForInvite()`
   still relies on auth-js's global default, the same class of accident this
   branch fixed. Found independently by the altitude reviewer and
   `rls-boundary-reviewer`.
2. **Radix `hidden` tooltips swallow Escape.** `hidden` on a `TooltipContent`
   hides it visually but leaves its dismissable layer live. Resting the pointer
   on the sidebar trigger while the switcher is open eats *every* Escape. Since
   `RailItem` passes `hidden={expanded}` to every nav row, this probably
   reaches beyond the switcher. Pre-existing; found while verifying the fix
   above.
3. **`/dashboard/opponents` renders `ComingSoonPage` but carries no
   `comingSoon` flag** — so team users get a cue on Statistics and Ask but not
   Opponents. This is design open question 1, deliberately deferred, and it is
   now live in the UI rather than hypothetical.
4. **Five hand-rolled copies of clamped arrow navigation** across the repo
   (`recent-matches`, `roster-table`, `search-command-palette`,
   `static-schedule`, and now `workspace-row`), each with its own wrap-or-clamp
   decision. `src/hooks/use-listbox-nav.ts` exists to prevent exactly this but
   is virtual-focus only.
5. **Copy drift** — the logout dialog says "Log out" while every surface around
   it says "Sign out".
6. **The header's `WorkspaceOptionList`** declares `role="listbox"` with no
   arrow-key handling, so it promises an ARIA contract it does not keep. Design
   open question 2 is whether the two switchers converge.

## Also consulted

Beyond the declared inputs:

- `git log`/`git merge-base` against `splitstep-integration` for the range
- `.claude/hooks/pr-check-receipt.sh show` for the recorded verdicts
