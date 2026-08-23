# Per-Branch Task Loop — Design

**Date:** 2026-08-23
**Status:** Design approved, not yet implemented
**Phase:** 1 of 3

## Goal

Run one task at a time from a per-branch task file, each in a fresh context
window, each gated before it commits — so a branch's work can be queued up
front and drained unattended without stacking unreviewed or broken work.

## What already exists (do not rebuild)

This repo already has most of a review apparatus. Phase 1 extends it; it does
not replace any of it.

| Exists | Where | Role in this design |
|---|---|---|
| `pr-check` skill | `.claude/skills/pr-check/` | Branch-end gate. Extended, not replaced |
| `pipeline-guardrails-reviewer` | `.claude/agents/` | Invoked by the per-task gate when UI surfaces change |
| `rls-boundary-reviewer` | `.claude/agents/` | Invoked by the per-task gate when data surfaces change |
| `trace-route` skill | `.claude/skills/trace-route/` | Handed to task subagents editing dashboard UI |
| 5 hooks | `.claude/hooks/` | Fire during task execution unchanged. A sixth is added (§7) |
| `docs/README.md` | `docs/` | The docs index. `MAP.md` is its code counterpart, not a duplicate |

**Branch policy:** all of this lands on `splitstep-integration`. `main` is
deployed and stays untouched until a full merge.

## Architecture

```
.claude/tasks/<branch-slug>.md       ← you own it; append tasks any time
.claude/tasks/<branch-slug>.log.md   ← agent owns it; you never edit it

/task-next  ──▶ pick task ──▶ dispatch ONE subagent (fresh context)
                                   │
                                   ▼
                     mechanical gates (lint / tsc / test)   ── red ──┐
                                   │ green                           │
                                   ▼                                 │
                        task-completion-reviewer  ── needs-work ──────┤
                                   │ pass                            │
                                   ▼                                 │
                     guardrail reviewers (by surface)  ── findings ──┤
                                   │ clear                           │
                                   ▼                                 ▼
                            commit + done              stash + mark blocked
                                   │                                 │
                                   └────────────┬────────────────────┘
                                                ▼
                                         next task (loop)
```

`/loop /task-next` — no interval — self-paces: it waits for a task to finish
rather than firing on a wall clock.

---

## 1. The task file pair

### Naming

The slug is the current branch with `/` replaced by `-`:

```
claude/workspace-setup-repo-1389c6  →  claude-workspace-setup-repo-1389c6.md
```

Distinct filenames per branch mean **merge conflicts on task files are
structurally impossible**. Merging two branches brings in two differently-named
files, never a conflict.

If `git branch --show-current` returns empty (detached HEAD — one worktree
currently is), `/task-next` stops with that as the reason. It does not guess.

### Split ownership

Both files are committed. The split exists to solve a write race: the loop
updates status while you are typing new tasks into the same file, and a plain
editor save would silently clobber one side.

| File | Written by | Contents |
|---|---|---|
| `<slug>.md` | **You.** Agent touches exactly one line per task — the `status:` field | The queue |
| `<slug>.log.md` | **Agent only** | Stash refs, failure reasons, reviewer findings, commit SHAs |

Confining the agent to a single line per task shrinks the collision window to
near nothing, and the log gives an audit trail without polluting the queue.

### Schema

```markdown
# Tasks — claude/workspace-setup-repo-1389c6

> Scope: one line naming the area of the site this branch owns.

## T1 · Short imperative title
- **status:** todo
- **files:** src/components/dashboard/matches/...
- **done when:**
  - [ ] observable criterion
  - [ ] observable criterion
- **notes:** context, prior findings, links
```

**`status:`** is one of `todo`, `next`, `doing`, `done`, `blocked`.

**`done when:`** is mandatory and is the contract the completion reviewer
judges against. A task without it is skipped and logged as malformed — not
guessed at. This is the single most important field in the design: without
machine-checkable criteria the reviewer degrades into a fourth generic code
reviewer, which the repo does not need.

**`files:`** is a best guess that orients the subagent. The subagent may
correct it; a correction is a note in the log, not a failure.

### Selection order

1. Any task marked `next`, in file order — the queue-jump escape hatch.
2. Otherwise the first `todo` in file order.

The file is re-read at the **start of every iteration**. Edits saved while a
task is mid-flight are picked up when that task finishes, not during it.

### Gitignore

`.claude/*` is ignored with explicit re-includes. Add one line:

```gitignore
!.claude/tasks/
```

---

## 2. `/task-next`

A skill at `.claude/skills/task-next/`, `disable-model-invocation: true` — it
commits, so it runs only when explicitly typed.

**Steps:**

1. Resolve the branch slug. No branch → stop with the reason.
2. Read the queue. No eligible task → report "queue drained" and stop cleanly
   (this is what lets `/loop` idle rather than spin).
3. Mark the task `doing`.
4. **Dispatch exactly one subagent** with: the task block, `MAP.md`,
   `CLAUDE.md`, and the guardrail docs matching the task's surfaces. One
   subagent per task is what gives each task a fresh context window.
5. Run the per-task gate (§4) **in cost order, stopping at the first
   failure**: mechanical checks, then `task-completion-reviewer`, then the
   guardrail reviewers that the changed surfaces trigger. Mechanical runs first
   because it is by far the cheapest, and every review below a red build is
   noise about code that does not compile.
6. All three clear → commit `T<n>: <title>`, mark `done`, append the SHA to the
   log.
7. Any stage fails → `git stash push -m "blocked: T<n>"`, mark `blocked`, write
   the failing stage and the stash ref to the log, continue to the next task.

**Nothing is ever auto-reverted.** Blocked work goes to a named stash so the
tree is clean for the next task and the work stays recoverable.

**Pre-flight:** if `node_modules` is absent the gate cannot run, so `/task-next`
reports that and stops rather than committing ungated work. The bootstrap
hook (§7) supplies `.env.local` automatically and flags a missing
`node_modules`, but `npm ci` remains a manual step.

---

## 3. `task-completion-reviewer`

A subagent at `.claude/agents/task-completion-reviewer.md`. Tools `Read, Grep,
Glob, Bash`; model `sonnet`, matching the existing two reviewers.

It owns two questions no other reviewer in this repo asks:

1. **Criteria** — for each `done when` line: met, not met, or unverifiable,
   each with evidence from the diff.
2. **Scope** — files changed that the task did not call for.

It returns `pass` or `needs-work` plus specific findings.

**Explicitly out of scope:** general correctness, style, naming, architecture.
`code-review`, `simplify` and the two guardrail reviewers already cover those.
Overlapping reviewers produce noise, and noise is what makes a loop's output
unreadable.

---

## 4. Per-task gate vs. branch-end `pr-check`

**This is a refinement of the approved design and is called out as such.**

Running all four `pr-check` stages after every task means `simplify` plus
`code-review` plus both guardrail subagents on every checkbox. That cost is
paid per task and most of it re-reviews unchanged code.

**Per-task gate** — what `/task-next` runs, in this order, stopping at the
first failure. All three block a commit:

1. Mechanical, always: `npm run lint`, `npx tsc --noEmit`, `npm test`.
2. `task-completion-reviewer`, always.
3. `pipeline-guardrails-reviewer` / `rls-boundary-reviewer`, conditionally, on
   the same surface triggers `pr-check` already defines. These are the
  silent-failure catchers — statistics attributed to the wrong player, a query
  crossing an account boundary — and are too important to defer.

**Branch-end** — you run `/pr-check` before merging, unchanged in role. It adds
`simplify` and `code-review` over the whole branch diff, where whole-branch
altitude and reuse findings actually make sense.

**`pr-check` change:** add `supabase-postgres-best-practices` to Stage 3 when
the diff touches `supabase/migrations/` or SQL. That completes the requirements
list (`simplify` + `vercel-react-best-practices` + postgres) already largely
present.

`pr-check` keeps its "do not commit" rule. `/task-next` owns committing.

### What each gate diffs against

These differ, and getting it wrong produces a silent false pass — the worst
possible failure for a gate.

**Per-task:** the subagent's work is still uncommitted when it is reviewed, so
the target is the working tree — `git diff HEAD`. This is the normal case and
needs no special handling.

**Branch-end:** because `/task-next` commits every task, the working tree is
**clean** by the time you run `/pr-check`. A review of "the current diff" would
find nothing and report green over an entire branch of unreviewed work.

The branch-end gate must therefore target the merge base explicitly:

```bash
git diff $(git merge-base HEAD splitstep-integration)...HEAD
```

`code-review` already accepts a branch target, so it can be pointed at the same
range. `pr-check` gains an explicit instruction: **when the working tree is
clean, review the branch range, never the working tree.** A clean tree means
the work is committed, not that there is nothing to review.

---

## 5. `MAP.md`

A repo-root code directory: 419 TypeScript files and 71k lines is more than a
subagent can orient in from `CLAUDE.md` alone.

**Contains:** the route table (URL → route file → component that actually
renders it), a directory map of `src/`, the data-layer map, and the
ambiguous-names table (`trace-route` already documents serve placement existing
four times).

**Does not contain:** conventions, workflow, or how to work here. That is
`CLAUDE.md`'s job. `MAP.md` answers *where*, `CLAUDE.md` answers *how*.

**Staleness.** `docs/README.md` already states the house rule that a doc
drifting silently is worse than no doc. The route table is the part that rots,
and it is derivable, so it is generated:

- `scripts/generate-map.mjs` walks `src/app/**/page.tsx` and rewrites the table
  between `<!-- ROUTES:START -->` / `<!-- ROUTES:END -->` markers.
- `npm run map` runs it.
- Everything outside the markers is hand-written and stays hand-written.

This is the only deterministic guarantee in the design; every other piece
depends on an agent doing the right thing.

---

## 6. `CLAUDE.md` pass

`CLAUDE.md` loads into every context window **and every dispatched subagent**,
so the loop pays its cost on every task. Scope of the pass:

- Reconcile against `splitstep-integration` (it diverges from `main` by 154
  insertions / 106 deletions; the `main` version is stale).
- Add a `MAP.md` pointer and a `.claude/tasks/` pointer.
- Correct the `DATABASE_PRD.md` reference: it is currently cited as "Schema
  reference" without qualification, and it is stale (§8).

Not a rewrite. Accuracy and the two new pointers.

---

## 7. Worktree bootstrap hook

A worktree is a fresh checkout: `.env.local` is gitignored so it does not come
along, and without it the dev server and every gate that needs env vars fail
with errors that do not name the cause.

**This has to be a hook, not something `/task-next` does.**
`guard-secrets.sh` lists `cp`, `scp` and `rsync` among its content-reading
verbs, so `cp .env.local <dest>` issued by the agent is denied — correctly.
Hooks run outside the tool layer, so the hook can do what the agent must not.

**Trigger:** `SessionStart`. There is no worktree-creation event, and matching
`git worktree add` in a `PostToolUse` Bash hook would miss worktrees made by
the `EnterWorktree` tool. Every worktree session starts, so `SessionStart` is
both the reliable trigger and self-healing for worktrees that already exist.

**File:** `.claude/hooks/bootstrap-worktree.sh`, wired in `settings.json`.

**Behaviour:**

1. Resolve the main checkout: `dirname "$(git rev-parse --git-common-dir)"`.
   If that equals the current toplevel, this is not a worktree — exit silently.
2. If `.env.local` is absent here and present there, **symlink** it.
   `.env.local` is gitignored, so it is not per-branch: exactly one exists, in
   the main checkout, and the symlink keeps it that way. Rotating a key
   propagates to every worktree at once; there is never a second copy of the
   service-role key on disk to drift or leak.
3. Report `node_modules` if absent — **do not** run `npm ci`. It takes minutes
   and `SessionStart` hooks block the session.
4. Print only what it did. Never read, echo, or interpolate file contents.

**Constraints:** exit 0 on every path, including missing source — a bootstrap
convenience must never be able to stop a session from starting. Never `rm` an
existing `.env.local`; if one is already present, leave it and say so.

---

## 8. Seeded tasks

These are queued in the task file rather than done during implementation — the
docs cleanup dogfoods the loop on low-risk work and surfaces where `/task-next`
is wrong before it is pointed at real code.

- **`README.md`** — 36 lines, untouched since 2025-09-06, still raw
  `create-next-app` boilerplate. It is the repo's front door.
- **`DATABASE_PRD.md`** — 778 lines stamped "Last Updated: February 2026", and
  `supabase/migrations/` is roughly 100 migrations behind the live database.
  Verify against the live schema via the Supabase MCP, then either correct it or
  give it a point-in-time header per the `docs/README.md` convention.

Not touched: `DESIGN.md` (already self-flags that v3 supersedes it),
`PRODUCT.md` (ages slowly), `docs/*` (the best-maintained docs here).

## Out of scope — later phases

**Phase 2:** docs-freshness agent; Vitest over the pure logic layer
(`src/lib/services/upload/` parsers, `src/lib/data/statistics-*`, the derivation
engine). Blanket unit tests across all 419 files are explicitly rejected — the
runner is Playwright, most files are React components, and the cost/benefit does
not hold.

**Phase 3:** Notion task ingestion and classification into this schema.

## Failure modes

| Failure | Handling |
|---|---|
| Detached HEAD | Stop with the reason; do not guess a slug |
| Task missing `done when` | Skip, log as malformed; do not invent criteria |
| Gate red | Stash named `blocked: T<n>`, mark blocked, continue to next task |
| Reviewer `needs-work` | Same as gate red |
| `node_modules` absent | Stop before dispatch; ungated commits are worse than no progress |
| Queue drained | Report and stop cleanly so `/loop` idles instead of spinning |
| Clean tree at branch end | Review the merge-base range, never the working tree — a clean tree is committed work, not an empty diff |
| You edit mid-task | Picked up at the next iteration; agent only ever writes the `status:` line |

## Verification

1. `.claude/hooks/guard-secrets.test.sh` still passes.
2. `npm run map` twice in a row produces no diff on the second run.
3. A seeded task with a deliberately failing criterion produces `blocked`, a
   named stash, a log entry, and **no commit**.
4. A seeded task that passes produces exactly one commit and `status: done`.
5. `/loop /task-next` on a drained queue idles rather than spinning.
6. A worktree without `.env.local` gets a symlink on session start; one that
   already has a real file keeps it untouched.
7. The bootstrap hook exits 0 in the main checkout, in a worktree, and when the
   source `.env.local` is missing — no path blocks a session from starting.
