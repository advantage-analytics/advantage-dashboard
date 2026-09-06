# Build report — player-dialogs-ui

Queue: `.claude/tasks/claude-player-dialogs-ui-1a007f.md` — **drained, all 8
tasks `done`.** Per-task gate detail lives in the run log beside it; this is
the summary.

## Task statuses

| Task | Model | Status | Commit |
|---|---|---|---|
| T1 · `playedSets()` display-only trim helper | sonnet | done | `db4831d` |
| T2 · Drawer recent-match score: trim and unclip | opus | done | `69c9d04` |
| T3 · Bench divider: symmetric dash gap | sonnet | done | `af86a6e` |
| T4 · Dialog shell default width 440 → 520 | sonnet | done | `1c61f44` |
| T5 · Add Player: occupied-spot acknowledgement gate | opus | done | `e5850c8` |
| T6 · Add Player: `initial` prefill prop + header wiring | opus | done | `4c55cfa` |
| T7 · Invite → Add Player email hand-off | opus | done | `01ecd5e` |
| T8 · Branch verification sweep + score persistence check | opus | done | `474c613` |

## Commit range

`8e8d017..HEAD` (17 commits). `8e8d017` is the parent of this pipeline's first
commit — **not** `main`, which is far behind this branch: the merge-base is
`f24975e` and `main...HEAD` sweeps in roughly 100 unrelated files. Every
verification in T8 used the corrected scope.

```
85c12e3 pipeline(player-dialogs-ui): scaffold workspace
7cd37c2 pipeline(player-dialogs-ui): stage 01 brief
6e56cb1 pipeline(player-dialogs-ui): stage 02 design
32eecdd pipeline(player-dialogs-ui): stage 03 plan
3e8d391 pipeline(player-dialogs-ui): stage 04 tasks
db4831d T1: Add playedSets() display-only trim helper
69c9d04 T2: Drawer recent-match score: trim and unclip
af86a6e T3: Bench divider: symmetric dash gap
1c61f44 T4: Dialog shell default width 440 to 520
b3bc8ae T5: blocked
2e16a81 task: amend T5 criterion 4 to accept the source-pin + replica test pair
e5850c8 T5: Add Player occupied-spot acknowledgement gate
4c55cfa T6: Add Player initial prefill prop and header wiring
01ecd5e T7: Invite to Add Player email hand-off
70f0df5 T8: blocked
c529d04 task: amend T8 criteria 2 and 3
474c613 T8: Branch verification sweep and score persistence check
```

Feature diff: 8 source files, 5 spec files (4 new), plus the pipeline
workspace and queue.

## Blocked items — both resolved, neither silently

No task is blocked now. Two were, and both were resolved by an explicit
author decision rather than by a retry, so the history carries `T5: blocked`
and `T8: blocked` commits and a separate `task: amend …` commit for each. That
separation is deliberate: the amendment is visible as the human's call, not
buried inside the task commit that benefited from it.

**T5 — blocked on criterion 4 (test strength).** Everything else passed;
`task-completion-reviewer` verified the implementation on every other count.
The blocker was environmental: this repo cannot render a real client component
in a test, because `@playwright/test` rewrites JSX in repo `.tsx` files. The
author chose to amend the criterion to accept the source-pin + replica pair
rather than build a harness mid-branch (`2e16a81`), with the residual risk
recorded in the queue. A second review pass still failed — the amended text
requires the spec to state what it cannot catch, and the docstring did not —
so that disclosure was added before the task landed.

**T8 — blocked on criterion 3 (score persistence).** The criterion asked for a
read either side of an actual roster-drawer load, which needs an authenticated
dashboard session this environment cannot drive. Amended (`c529d04`) to accept
structural proof plus a real before/after row comparison. The first pass on the
amended criteria ALSO failed, catching a factual error in the runner's own
evidence: the "before" was claimed to come from `design.md`, which records value
patterns in prose and no row ids. The claim was corrected rather than the
criterion amended again, and it passed on accurate facts.

## What the gates actually established

- **Mechanical**, every task: `npm run lint` (0 errors), `npx tsc --noEmit`,
  `npm test`, plus `npm run build` where the criteria called for it.
- **`pipeline-guardrails-reviewer`** ran on every task touching
  `src/components/dashboard/` — T2, T3, T4, T5, T6, T7 — and once more in T8
  over the whole feature diff, reading all six changes together. No blocking
  finding at any point.
- **`rls-boundary-reviewer`** was skipped throughout, legitimately and for the
  same reason each time: nothing in this branch touches `src/lib/data/`,
  `src/app/api/`, `src/lib/supabase/`, `supabase/migrations/`, and it adds no
  table, view or query. T8 verified that by grep rather than by assertion.
- **Persistence**, the brief's success criterion 6: no added line writes to
  `matches.score`, no loader or route handler changed, and the stage-02 values
  the design was derived from are unchanged in the live database.

## Carried forward to stage 06

Three things the review stage should weigh, all recorded in the run log:

1. **An all-zero score now renders as a blank score cell** — six live rows.
   Traced through `matchOutcome`, which already returns `null` for such a row so
   the drawer already shows a neutral dash rather than a W/L mark; the guardrails
   reviewer judged a blank cell not worse than the prior `0-0 0-0 0-0`, which
   actively asserted a tied, fully-played match. It is still a real rendering
   change and deserves a human eye.
2. **Tests approximate in four places.** T2, T5, T6 and T7 all pin source text
   and drive replicas rather than real components, and each spec's docstring
   states what it cannot catch. Concretely: a control wired to the wrong state,
   rendered outside its guard, or shipped with wrong copy or classes would pass.
   Those aspects rest on review, and two reviewers checked them by hand where it
   mattered most (T5's checkbox).
3. **Nothing exercises `inviteMember`, seat accounting or mail.** T7's hand-off
   leaves the invite path byte-untouched and the guardrails reviewer confirmed
   it, but "the tests pass" must not be read as "the invite behaviour was
   exercised end to end". That needs a real click-through.

## The one piece of infrastructure this branch surfaced

Every approximation above has a single cause: **this repo cannot render a real
client component, or drive an authenticated dashboard session, in a test.** It
blocked two tasks outright and weakened three more. One harness branch —
`@playwright/experimental-ct-react` or a jsdom runner, plus the throwaway-user
login already sketched in the project's memory notes — would close all five
gaps at once. It is deliberately not done here: it is infrastructure work with
nothing to do with player dialogs, and wedging it in would have made this
branch about something else.
