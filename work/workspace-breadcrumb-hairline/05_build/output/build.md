# Build report — workspace-breadcrumb-hairline

Queue drained. All three tasks `done`, none blocked, nothing stashed.

## Task statuses

| Task | Model | Status | Commit |
|---|---|---|---|
| T1 · Add the destination predicate to nav.ts, with its spec | `sonnet` | **done** | `52b9e75` |
| T2 · Switch the header's leading slot to the destination rule | `opus` | **done** | `2f27d88` |
| T3 · Make the header's bottom edge permanent | `sonnet` | **done** | `3b533b1` |

## Commit range

```
52b9e75..3b533b1   (3 commits, on top of 3afddc6 — the stage 04 tasks commit)
```

```
3b533b1 T3: Make the header's bottom edge permanent
2f27d88 T2: Switch the header's leading slot to the destination rule
52b9e75 T1: Add the destination predicate to nav.ts, with its spec
```

Code touched across the three (excluding queue and log bookkeeping):

```
 src/app/dashboard/header.tsx | 114 ++++++++++-----------------
 src/lib/dashboard/nav.ts     |  29 +++++++++
 tests/header-slot.spec.ts    |  77 +++++++++++++++++++
 3 files changed, 154 insertions(+), 66 deletions(-)
```

`header.tsx` is net **−26 lines**: the slot rule replaced a 35-line comment
plus a three-path `Set` with a 23-line comment plus one predicate call, and
the hairline change deleted the whole scroll apparatus.

## Blocked items

**None.** No task was stashed, and `.claude/tasks/…log.md` records no
`blocked` entry. Every task passed all three gate stages on its first
dispatch.

## Gate record

Each task was gated independently before its commit. Mechanical gates were
re-run by the runner rather than taken from the subagent's report.

| Task | Mechanical | Completion review | `pipeline-guardrails` | `rls-boundary` |
|---|---|---|---|---|
| T1 | lint 0 err · tsc clean · **442 passed / 0 failed** | `VERDICT: pass` | skipped — no surface | skipped — no surface |
| T2 | lint 0 err · tsc clean · build pass · **442 / 0** | `VERDICT: pass` | **ran — no findings** | skipped — no surface |
| T3 | lint 0 err · tsc clean · build pass · **442 / 0** | `VERDICT: pass` | **ran — no findings** | skipped — no surface |

Guardrail applicability was determined from `git diff HEAD --name-only`
**and** `git ls-files --others --exclude-standard` on each task, so T1's new
untracked spec could not fall through the check. `pipeline-guardrails-reviewer`
ran on T2 and T3 because both touch `src/app/dashboard/`; it skipped T1, whose
diff is `src/lib/dashboard/` (a route-label register) and `tests/`.
`rls-boundary-reviewer` skipped all three — no task touched
`src/lib/supabase/`, `src/lib/data/`, `src/app/api/` or a migration.

Two findings from the reviewers are worth carrying forward, both of which
cleared:

- On T2, the guardrails reviewer independently verified that `isDestination`
  cannot match `/dashboard/matches/[matchId]`, so the match-detail page keeps
  its trail and §3.3's short-circuit is unaffected.
- On T3, it grepped `src/` for `scrollTop`, `addEventListener("scroll")` and
  `onScroll` and found only Tailwind `scroll-mt-*` utilities in `help/page.tsx`
  — nothing else observed the shell's scrolling column, so deleting the
  listener has no side effect beyond removing dead weight.

## One deviation from the task text

T2's subagent made a single edit the task did not name: a comment inside
`getStaticBreadcrumbs` read *"same philosophy as `WORKSPACE_TITLE_PATHS`
above"* — a reference to the const that task deletes — and was repointed to
*"the destination rule below"*. It was put to `task-completion-reviewer`
explicitly, which ruled it load-bearing fallout of the mandated deletion
rather than scope creep. Recorded here because a deviation that only lives in
a reviewer's transcript is a deviation nobody will find later.

## Follow-up recorded, not queued

`/dashboard/settings/subscription` is a real route absent from
`SETTINGS_SECTIONS`, so `settingsSection()` misses it and its crumb falls back
to a bare "Settings" with no leaf. Pre-existing, unrelated to either defect
here, and per the branch-scope rule it belongs on its own branch. It lives in
the run log's `follow-ups:` field for T2 — an idea, not an eligible task.

## What this stage did NOT verify

**Nothing has been looked at.** The plan's Step 4 — the by-eye walk of both
workspaces, and the judgment on whether `--border-medium` at 1.26:1 actually
reads as a visible edge — is the one gate no automated check here reaches, and
it is deliberately not a queue task (a verification-only task produces no diff
for `task-completion-reviewer` to judge). Brief criteria 1–5 remain unverified
and are stage 06's to close:

1. Personal rail walk: Home → Matches → Statistics → Ask — greeting on Home,
   workspace title on the rest.
2. Team rail walk: Team Home → Schedule → Matches → Roster → Opponents →
   Statistics → Ask — program name on all seven.
3. Flow paths still show trails: match detail, `matches/new`, a schedule
   create screen, `settings/usage`.
4. Every page that gained the title still names itself in its body.
5. The bottom edge is visible unscrolled, and unchanged on scroll.

Criterion 5 is the one that could still send this back: if `#E5E5EA` reads as
absent, the design's stated fix is a **new token**, not a bare hex in the
header.

## Also consulted

Beyond this stage's declared inputs (the branch queue, its run log, and
`04_tasks/output/tasks.md`):

- `git log --oneline` / `git diff --stat` on the task commit range — the
  commit range and diffstat this report is required to carry
