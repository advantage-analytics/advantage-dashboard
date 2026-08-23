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

Skip and log any task whose `done when:` list is missing or empty. **Do not
invent criteria for it** — a task without criteria cannot be gated, and gating
is the entire point.

Nothing eligible → report `queue drained` and stop cleanly. This is a success,
not an error; it is what lets `/loop` idle instead of spinning.

## 3. Pre-flight

```bash
[ -d node_modules ] && echo ok || echo missing
```

Missing → **stop.** The gate cannot run, and an ungated commit is worse than no
progress. Tell the user to run `npm ci`. The bootstrap hook supplies
`.env.local` automatically but deliberately does not install.

Then set the task's `status:` to `doing`. Change that line only.

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

All three must clear. `simplify` and `code-review` are **not** run here — they
belong to `/pr-check` at branch end, over the whole branch diff, where reuse
and altitude findings can actually be made.

## 6a. All clear — commit

```bash
git add -A
git commit -m "T<n>: <title>"
```

Set `status:` to `done`. Append to `.claude/tasks/<slug>.log.md`: the task id,
the commit SHA, and one line on what changed.

## 6b. Anything failed — stash

```bash
git stash push -u -m "blocked: T<n>"
```

Set `status:` to `blocked`. Append to the log: which stage failed, the specific
reason, and the stash ref.

**Never revert, never `git checkout --`, never discard.** The stash exists so
the tree is clean for the next task while the work stays recoverable.

## 7. Report and stop

Say which task ran, the verdict per gate stage, and what landed — a commit SHA
or a stash ref. Then stop, even if more tasks are eligible. The loop re-enters
for the next one.

## Do not

- Do not run more than one task per invocation.
- Do not write anywhere in the queue file except a `status:` line. The user is
  typing in that file while you run.
- Do not hand-edit the log's history; append only.
- Do not commit when any gate stage failed, however small the failure looks.
