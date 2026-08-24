---
name: task-next
description: Run the next task from this branch's queue in .claude/tasks/ — one task, one subagent, gated, then committed. Use when working through a queued task file. Drain the whole queue with /loop /task-next.
disable-model-invocation: true
argument-hint: "[optional: a task id like T3, to run that one instead of the next]"
---

# Run one task

One task. One subagent. One commit, or one stash. Then stop.

Stopping is what makes `/loop /task-next` safe: the loop re-enters this skill
for the next task rather than letting one context accumulate all of them.

## 1. Locate the queue

```bash
git branch --show-current
```

Empty output means detached HEAD. **Stop and say so.** Do not guess a slug and
do not fall back to another file.

The slug is the branch with `/` replaced by `-`:
`claude/workspace-setup-repo-1389c6` → `claude-workspace-setup-repo-1389c6`.

Read `.claude/tasks/<slug>.md`. If it does not exist, say so and stop — offer
to create one, do not invent tasks.

**Re-read this file every run.** The user appends to it while the loop runs.

## 2. Pick the task

If the user passed a task id, use that one. Otherwise:

1. The first task with `status: next`, in file order — the queue-jump.
2. Otherwise the first with `status: todo`.

`status: later` is never picked by either rule above — it marks a task
deferred until someone promotes it to `todo` by hand. It is not malformed and
is not skipped-and-logged; it is simply invisible to the picker.

Skip and log any task whose `done when:` list is missing or empty, then
**keep scanning past it** to the next candidate in file order — a skip never
ends the search. Log target is `.claude/tasks/<slug>.log.md`, the same file
steps 6a/6b append to. **Do not invent criteria for it** — a task without
criteria cannot be gated, and gating is the entire point.

Nothing eligible → report `queue drained` and stop cleanly. This is a success,
not an error; it is what lets `/loop` idle instead of spinning. If this scan
wrote a skip-log entry along the way, commit it before stopping:

```bash
git add .claude/tasks/<slug>.log.md
git commit -m "skip: <task id>"
```

Otherwise a drained run that skipped a malformed task leaves that entry
uncommitted in the tree. `/loop` re-enters, finds the same malformed task,
skips and logs it again, and stops dirty again — a permanent dirty tree that
never surfaces as a failure, just a queue that quietly never drains and sends
`/pr-check` down its "working tree dirty" branch forever.

## 3. Pre-flight

```bash
[ -d node_modules ] || npm ci
```

A fresh worktree never has `node_modules` — the bootstrap hook supplies
`.env.local` but deliberately does not install, because a `SessionStart` hook
must not block a session for minutes. So install here and carry on; this skill
is already a multi-minute operation.

**If the install itself fails, stop.** The gate cannot run without it, and an
ungated commit is worse than no progress. Report the install error rather than
proceeding to dispatch.

Then set the task's `status:` to `doing`. Change that line only.

If this run is interrupted before step 6 (crash, cancel, context loss), the
task is left stuck at `doing` — step 2's pick logic only matches `next` and
`todo`, so no future invocation will pick it back up. The user will notice it
as a task sitting at `doing` in `.claude/tasks/<slug>.md` with no matching
commit or log entry; reset the line to `todo` by hand to make it eligible
again.

## 4. Dispatch exactly one subagent

One task, one subagent — that is what gives each task a fresh context window,
and it is why this skill does not do the work itself.

Give the subagent:

- The task block verbatim, `done when:` list included.
- `MAP.md` — where things are.
- `CLAUDE.md` — how to work here.
- `docs/ui-revamp-guardrails.md` if the task touches `src/app/dashboard/`,
  `src/components/dashboard/`, or the upload wizard.
- The `trace-route` skill if the task touches dashboard UI, so it resolves the
  route before editing rather than picking by filename.

Tell it: satisfy every `done when:` line, stay inside `files:` unless the work
genuinely requires more, and **do not commit** — this skill owns committing.
If the task creates a new skill under `.claude/skills/`, also tell it to add a
matching `!.claude/skills/<name>/` line to `.gitignore` — that directory is
deny-by-default (see the comment block above the existing entries), so a new
skill nobody re-includes there cannot be staged, cannot appear in a diff, and
cannot be committed no matter how correct the skill itself is.

## 5. Gate, in cost order, stopping at the first failure

Mechanical first. It is by far the cheapest, and every review below a red build
is noise about code that does not compile.

**a. Mechanical**

```bash
npm run lint
npx tsc --noEmit
npm test
```

**b. Completion review** — dispatch `task-completion-reviewer` with the task
block. Its first line is `VERDICT: pass` or `VERDICT: needs-work`.

**c. Guardrails**, only for the surfaces the diff touches, both in one message
so they run concurrently:

- `pipeline-guardrails-reviewer` — `src/app/dashboard/`,
  `src/components/dashboard/`, or the upload wizard.
- `rls-boundary-reviewer` — `src/lib/supabase/`, `src/lib/data/`,
  `src/app/api/`, `supabase/migrations/`, or any new table, view or query.

Determine which surfaces the diff touches from both `git diff HEAD --stat`
**and** `git ls-files --others --exclude-standard` — a task whose new files
land entirely under one of the surfaces above must not skip that surface's
reviewer just because those files are untracked and so absent from
`git diff HEAD --stat` alone.

`HEAD` is not optional there. Bare `git diff` shows unstaged changes only, and
`git ls-files --others` stops listing a file the moment it is staged — so a
subagent that ran `git add` without committing (it is told not to commit, not
told not to stage) would fall through *both* halves of that check, and a
dashboard or migration change would silently skip its reviewer while step 7
reports the skip as legitimate.

**Fail-closed:** a stage that does not return something explicitly parseable
as clear is a **failure**, not a pass — go to 6b. A crashed subagent,
truncated output, or a report with prose but no verdict all count. For 5b that
means anything other than a literal `VERDICT: pass` — including
`VERDICT: needs-work` or no verdict line at all. Neither guardrail agent in 5c
emits a verdict literal; they return prose findings only, so their "clear" is
an explicit statement that they found nothing. Any finding at all from either
one blocks — there is no severity triage at this gate, and don't invent one.
(That triage is `code-review`'s job, at `/pr-check`, over the whole branch.)

All three must clear under that standard. `simplify` and `code-review` are
**not** run here — they belong to `/pr-check` at branch end, over the whole
branch diff, where reuse and altitude findings can actually be made.

## 6a. All clear — commit

Set the task's `status:` to `done`. Append to `.claude/tasks/<slug>.log.md`:
a heading naming the task id, title and status (`## T<n> · <title> — done`),
then two fields — `**gate:**` (the verdict per stage, and which guardrails ran
versus were skipped and why, matching step 7) and `**changed:**` (what
changed, a line or short paragraph). Do **not** add a `**commit:**` field:
write both **before** committing, because a commit can't record its own SHA
inside its own content, so the log entry is never in a position to carry one —
`git rev-parse HEAD` after the commit is where that comes from, for step 7's
report.

```bash
git add -A
git commit -m "T<n>: <title>"
```

One commit now carries all three together: the task's code changes, `status:
done`, and the log entry. `git status --short` must come back empty
immediately after — if it isn't, the bookkeeping got left behind again.

## 6b. Anything failed — stash

```bash
git stash push -u -m "blocked: T<n>" -- ':(exclude).claude/tasks/'
```

The `-- ':(exclude).claude/tasks/'` pathspec is load-bearing — do not drop it.
Without it, `git stash push -u` sweeps up *everything* in the tree, bookkeeping
included: step 3 already wrote `status: doing` into the queue file before
dispatch, so an unscoped stash captures that `todo → doing` hunk, and after
this section rewrites the line to `blocked` the mismatch makes `git stash pop`
conflict on the queue file later — on the one path where the user is already
dealing with a failure. Excluding `.claude/tasks/` keeps the stash to the
task's actual (failed) code changes and leaves the queue and log files sitting
modified in the tree, ready for this section to edit and commit normally.

**Check whether a stash was actually created before recording one.** Because
the pathspec excludes `.claude/tasks/`, a task that failed without leaving
anything dirty outside it — a crashed subagent, truncated output, a run that
died before writing a file, all of which the fail-closed rule in step 5 routes
straight here — gives `git stash push` nothing to save. It prints `No local
changes to save`, exits 0, and creates no entry.

`git rev-parse stash@{0}` does **not** fail helpfully in that case: if any
earlier stash exists it returns *that* one's SHA with exit 0, and the log then
durably records another task's stashed work as this task's recoverable work.
False provenance in the run log is worse than no provenance, because the log
is the only durable record of what the loop did.

So: if the stash command reported `No local changes to save`, there is no
stash. Log `no stash — the task produced no changes` in place of a ref. Only
when a stash was really created, resolve it to a SHA with
`git rev-parse stash@{0}` and record that — a SHA, not `stash@{0}`, because
`refs/stash` is shared across worktrees and the index shifts the moment
anything else stashes.

Then set `status:` to `blocked` and append to the log: which stage failed, the
specific reason, and the stash SHA or the no-stash note.

```bash
git add -A
git commit -m "T<n>: blocked"
```

The failed work stays out of history on purpose — that's what the stash is
for — but the bookkeeping still needs to land somewhere durable, and this
commit is the only vehicle for that. `git status --short` must come back
empty immediately after.

**Never revert, never `git checkout --`, never discard.** The stash exists so
the tree is clean for the next task while the work stays recoverable.

## 7. Report and stop

Say which task ran, the verdict per gate stage — including which guardrails
ran and which were skipped, and why, the same detail `/pr-check` Stage 4.3
reports — and what landed: a commit SHA or a stash ref. Then stop, even if
more tasks are eligible. The loop re-enters for the next one.

## Do not

- Do not run more than one task per invocation.
- Do not write anywhere in the queue file except a `status:` line. The user is
  typing in that file while you run.
- Do not hand-edit the log's history; append only.
- Do not commit the task's code changes when any gate stage failed, however
  small the failure looks — stash them in 6b instead. 6b's bookkeeping commit
  is a separate, deliberate exception: it carries only the `status:` line and
  the log entry, never the stashed work.
- Do not run `git add -A` (in 6a or 6b) without checking `git status` first —
  it stages every unrelated change sitting in the tree, not just this task's,
  including anything the user has in progress alongside the loop. If
  unrelated changes are present, stop and ask the user how to handle them
  rather than folding them into this task's commit or stash.
