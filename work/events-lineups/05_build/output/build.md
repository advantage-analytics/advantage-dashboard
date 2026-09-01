# Build — events-lineups

The queue is drained: **12 of 12 tasks `done`, none `blocked`**. Stage 04's
thirteen-row routing table maps one-to-one onto these twelve tasks plus its own
header row.

## Task statuses

| Task | Model | Status | Landed as |
|---|---|---|---|
| T1 · Build the schedule fixtures module | opus | **done** | `02ba5ee` |
| T2 · Rebuild 3b — the event-type chooser | opus | **done** (re-run) | `4e4540a` |
| T3 · Rebuild 7e and 7d — the schedule shell and drawer | opus | **done** | `36cbc0e` |
| T4 · Rebuild 7c and 4c — the dual widget | opus | **done** (re-run) | `a3001c7` |
| T5 · Rebuild 2c — find the school | opus | **done** | `c9bde59` |
| T6 · Rebuild 2b — the master-detail dual builder | opus | **done** (re-run) | `612a3b8` |
| T7 · Rebuild 2d and 2e — the add-opponent popup | opus | **done** | `0ed624a` |
| T8 · Rebuild 3c — the tournament builder | opus | **done** | `4186a5f` |
| T9 · Label the dormant schedule tree | opus | **done** | `25dcb69` |
| T10 · Add the copy-fidelity spec | opus | **done** | `103994c` |
| T11 · Full-set fidelity pass and gates | fable | **done** | `b619dd5` |
| T12 · Write the regression note and the flagged-copy list | opus | **done** | `4246c41` |

## Commit range

`02ba5ee..4246c41` — 15 task commits (12 completions plus 3 `blocked`
bookkeeping commits). Net across the range: **28 source files, 5,497
insertions, 125 deletions** under `src/` and `tests/`; 32 files and 7,469
insertions counting the workspace and queue files.

```
02ba5ee T1: Build the schedule fixtures module
c507430 T2: blocked
36cbc0e T3: Rebuild 7e and 7d — the schedule shell and drawer
1b3badb T4: blocked
c9bde59 T5: Rebuild 2c — find the school
af119e7 T6: blocked
4186a5f T8: Rebuild 3c — the tournament builder
4e4540a T2: Rebuild 3b — the event-type chooser
a3001c7 T4: Rebuild 7c and 4c — the dual widget
612a3b8 T6: Rebuild 2b — the master-detail dual builder
0ed624a T7: Rebuild 2d and 2e — the add-opponent popup
25dcb69 T9: Label the dormant schedule tree
103994c T10: Add the copy-fidelity spec
b619dd5 T11: Full-set fidelity pass and gates
4246c41 T12: Write the regression note and the flagged-copy list
```

## Blocked items

**None outstanding.** Three tasks were blocked mid-run, stashed, fixed and
re-run; all three are now `done` and the stashed work is committed. They are
recorded here because the block is the substantive part of this build — each
caught something a straight-through run would have shipped.

| Task | Gate stage that failed | Reason | Stash (now redundant) |
|---|---|---|---|
| T2 | 5b completion review | Three fidelity misses: a placeholder `#` link wired to `/dashboard/matches/new`, a live route outside the rebuilt set; `--blue-tint-12` (0.12) used where `--blue-glow` carries the artboard's exact `rgba(59,130,246,0.15)`; and `EventShell`'s `pb-8` left standing against the artboard's `padding-bottom: 0` with nothing in the code saying so. | `29062bef5efd3795ad1e071e5ebad613936d9b95` |
| T4 | 5b completion review | Rendered the header's outcome rails **derived from the data** rather than as drawn. The analysis was verified *correct* — the artboard genuinely contradicts itself — but the brief says the design wins and rule 4's remedy is reproduce **and** report. T3 had already reproduced the same class of contradiction literally. | `3101b4e047178721fc939ec4f89ded8733b5d3d2` |
| T6 | 5c `pipeline-guardrails-reviewer` | One school's data under another school's name: `2c` offers five schools, `2b`'s date/format/nine lines were unconditional Ridgeline fixtures, so picking "Ridgemont Tech" rendered that name over Ridgeline's data — reachable four of five ways. | `3e857ab68c9f6ee870afbda39e3dfaae2ad09877` |

The three stash entries are now dead weight, their content committed. The stash
stack is shared across this repo's worktrees, so they are worth dropping:

```bash
git stash drop 3e857ab68c9f6ee870afbda39e3dfaae2ad09877 && git stash drop 3101b4e047178721fc939ec4f89ded8733b5d3d2 && git stash drop 29062bef5efd3795ad1e071e5ebad613936d9b95
```

## Gate coverage

Every task passed mechanical (`lint`, `tsc`, `test`), a `task-completion-reviewer`
verdict, and the guardrail reviewers its diff's surfaces called for.

- `pipeline-guardrails-reviewer` **ran 10 times** — every task whose diff
  touched `src/app/dashboard/` or `src/components/dashboard/`.
- `rls-boundary-reviewer` **skipped 11 times**, never ran. Correct throughout:
  no task modified a file under `src/lib/supabase/`, `src/lib/data/`,
  `src/app/api/` or `supabase/migrations/`, and none added a query, table or
  view. The run *removes* loader calls, which cannot open an RLS hole.
- Two tasks added a **production build** to their own gate beyond the contract:
  T7, because `fixtures.ts` began type-importing from a `"use server"` module
  and `tsc` alone cannot catch a server action reaching a client bundle; and
  T11, whose criteria require it.

## Gates at HEAD

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors, **37 warnings** |
| `npm test` | **244 passed** (227 pre-existing + 17 from T10) |
| `npm run build` | green |

**The 43-warning baseline quoted in the brief, the plan, this branch's queue
preamble and `docs/ui-revamp-guardrails.md` §7 is stale.** The real figure in
this worktree is 37, and it held at 37 for the whole run — no task added a
warning. Four documents carry the wrong number; one correction pass would
retire it.

## What stage 06 should read first

- `work/events-lineups/REGRESSION-NOTE.md` (T12) — the PR body. Opens by naming
  the regression; carries 50 flagged-copy items grouped by artboard and three
  re-wiring traps that would ship silently wrong data.
- `work/events-lineups/FIDELITY-PASS.md` (T11) — eight cross-screen findings.
  **N8 corrects this run's own record**: at 620px the nine rows fit, so `7c`'s
  stop after S1–S3 is whitespace in the artboard rather than clipping, which
  makes the drawn `7c` a state the build cannot produce.
- `src/components/dashboard/schedule/README.md` (T9) — the live / dormant /
  partly-dormant map. Two files are unreachable at runtime yet undeletable,
  because live files type-import from them.
- `.claude/tasks/claude-new-session-c3f1ab.log.md` — 1,300 lines of per-task
  gate results, decisions and follow-ups. The durable record; the regression
  note deliberately excludes its process history.

## One hazard that outlives this build

A **stale capture of `Events & Lineups.dc.html` is on this machine** — md5
`5cb178cd252bffbd4dc8b3d2cf88f31d`, 87,329 bytes — carrying the `5a`/`5b`
artboards from the run this workspace supersedes, and missing `7e`, `7d` and
`7c`. It caused one reviewer to produce two confidently-wrong findings and cost
a full cycle. Every task used the correct capture
(`045f55b3a44cfa304c7772fd6bddcdaf`, 125,343 bytes), so no delivered work rests
on it — but anything that globs for `*.dc.html` will find it.

## Also consulted

Beyond the declared inputs (`.claude/tasks/claude-new-session-c3f1ab.md` and
its `.log.md`, `../04_tasks/output/tasks.md`):

- `git log`, `git diff --shortstat` and `git stash list` over the branch — to
  establish the commit range, the net change and the stash SHAs.
- `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` — run at HEAD
  to state the gate results as fact rather than quoting the last task's report.
