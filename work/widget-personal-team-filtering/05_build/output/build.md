# Build report — widget-personal-team-filtering

Queue drained. Five tasks, all `done`. One of them (T5) was blocked once and
re-run after the human amended its acceptance criteria; nothing was blocked at
the end.

## Task statuses

| Task | Title | Model | Verdict | Commit |
|---|---|---|---|---|
| T1 | Scope home performance read to personal matches | sonnet | done | `f7b1426` |
| T2 | Scope Recent Matches card to personal matches | sonnet | done | `e9cb51d` |
| T3 | Scope home Serve Placement widget to personal matches | sonnet | done | `b0a843a` |
| T4 | Add program clause to the personal activity-tray branch | opus | done | `7ba6373` |
| T5 | Add personal-home-scope regression spec | opus | done (2nd run) | `7db0b3f` |

Every task cleared the same three-stage gate: lint + `tsc --noEmit` + the full
`npm test` (430 passing at the end), then `task-completion-reviewer`, then
whichever guardrail reviewers the diff's surfaces called for. No stage was
waived, and no task committed on a partial gate.

Guardrail coverage, per task, matching what the log records:

- `rls-boundary-reviewer` ran on **all five** — every task changed a Supabase
  query or, for T5, wrote to the live database through the service-role client.
- `pipeline-guardrails-reviewer` ran on **T2 and T3** — the two that touch
  `src/app/dashboard/` and `src/components/dashboard/`. Skipped on T1 and T4
  (`src/lib/data/` only) and on T5 (`tests/` only).

## Commit range

`0c8411e..7db0b3f` — 12 commits: 6 pipeline/bookkeeping, 6 task commits
(including `7f61c44`, T5's blocked-bookkeeping commit).

```
7db0b3f T5: Add personal-home-scope regression spec
7f61c44 T5: blocked
7ba6373 T4: Add program clause to the personal activity-tray branch
b0a843a T3: Scope home Serve Placement widget to personal matches
e9cb51d T2: Scope Recent Matches card to personal matches
f7b1426 T1: Scope home performance read to personal matches
de499a5 pipeline(widget-personal-team-filtering): stage 04 tasks
3332fdd pipeline(widget-personal-team-filtering): stage 03 plan
26a7595 pipeline(widget-personal-team-filtering): fold the activity tray into the design
e897a8e pipeline(widget-personal-team-filtering): stage 02 design
62d7592 pipeline(widget-personal-team-filtering): stage 01 brief
4812e50 pipeline(widget-personal-team-filtering): scaffold workspace
```

Code and test changes across the branch — four one-clause fixes and one new
spec, and nothing else:

```
 src/app/dashboard/(home)/recent-activity.tsx          |   5 +
 src/components/dashboard/home/serve-placement-home.tsx|   5 +
 src/lib/data/activity-server.ts                       |  13 +-
 src/lib/data/performance-server.ts                    |   5 +
 tests/personal-home-scope.spec.ts                     | 285 +++++++++++++++
 5 files changed, 308 insertions(+), 5 deletions(-)
```

The 13 lines on `activity-server.ts` are the only ones with deletions: 8 added,
5 removed, being the stale comment replaced. Every other source change is
purely additive — one predicate and its comment.

## Blocked items

**None outstanding.** One task was blocked mid-run and is recorded here because
the reason was a defect in the task contract, not in the code:

**T5, first run — `task-completion-reviewer: VERDICT: needs-work`.** Four of
five criteria met; lint, tsc and the full suite were clean and the spec passed
6/6 live. Criterion 5 as originally drafted asked for two impossible things:

1. that "temporarily removing one predicate **from source** turned the matching
   assertion red" — structurally impossible, because the spec is a query-shape
   mirror that issues its own copy of each query rather than calling the loader,
   which is also why it could not be written red-first; and
2. that "**the runner's notes** record" it — the runner's notes are the log
   entry written *after* the gate, so a reviewer can never see them at review
   time.

The runner stashed (`17afbb1705ead31726e90dd8fa9a59c317534ce4`) and marked the
task `blocked` rather than triaging, which is correct fail-closed behaviour —
anything other than `VERDICT: pass` blocks, and the runner does not get to
decide a criterion is wrong. The human then amended criterion 5 to ask for what
the file can actually demonstrate, restored the stash, and reset the task to
`todo`. The re-run's subagent was dispatched to *verify* rather than rebuild and
changed nothing; the gate passed on the amended wording. The stash is now
redundant and can be dropped.

Worth carrying into stage 06: this is the failure mode `task-add` warns about —
a plausible-but-wrong criterion gating correct work. It cost one cycle and
caught nothing real.

## Verification still owed before merge

The queue file's header carries it, and it is the thing no automated stage in
this pipeline asserts:

> Sign in as `clajersongimena@gmail.com` (3 personal, 16 program-attached
> matches — the only account that reproduces this) and open `/dashboard` in the
> **personal** workspace. Season title and KPI counts must read **3**, not 19;
> Recent Matches and Serve Placement must draw from those three; the header
> tray must show only jobs on non-program matches. Then switch to the team
> workspace and confirm `/dashboard/team` and the tray are unchanged.

A green suite does not prove this bug fixed — `03_plan/output/plan.md`'s "Test
strategy" says so explicitly, and the new spec is a predicate guard, not an
end-to-end assertion.

## Follow-ups the runs surfaced (logged, not queued)

1. **The regression spec's structural weakness is documented, not fixed.**
   Because it mirrors query shapes rather than calling the loaders, editing a
   source predicate alone cannot turn it red. The durable version is a shared
   `personalMatchesQuery(client, userId)` helper that both the call sites and
   the spec use. That is a refactor across four files — its own branch, per the
   branch-scope rule.
2. **The tray's team-branch test cannot distinguish two explanations.** The
   `rls-boundary-reviewer` flagged this as an observation, not a defect: the
   fixture athlete created both jobs, and `processing_jobs` RLS is
   `created_by`-only by design (the row carries a live video token), so the test
   cannot tell "correctly program-scoped" from "RLS let the creator see their
   own row anyway". Proving it needs a second member — a coach or staff user —
   in the fixture.
3. **Nothing tests `getActivityFeed()`'s workspace scoping at all.**
   `tests/activity-tray-detail.spec.ts` covers only `trayDetail`'s
   pluralization. A future substitution of `created_by` for the program clause —
   the exact trap T4 was written around — would be caught by a human reading
   the query and by nothing else.
4. **`/api/home-insight/route.ts`** is a second consumer of
   `getOverallPerformance()`. It inherits T1's fix with no edit of its own;
   worth a glance at `/pr-check` to confirm the insight prose now narrates
   personal-only figures.

## Also consulted

Beyond the declared inputs (the branch queue, its log, and
`04_tasks/output/tasks.md`):

- `git log --oneline 0c8411e..HEAD` and `git diff --stat 0c8411e..HEAD -- src/ tests/`
  for the commit range and the change surface.
