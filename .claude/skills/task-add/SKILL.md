---
name: task-add
description: Draft a well-formed task from a one-line intent and append it to this branch's queue. Use when adding work to .claude/tasks/, especially by voice or from a phone.
argument-hint: "<one-line description of the task>"
---

# Add one task

Turn a one-line intent — often dictated from a phone — into a task the gate can
actually judge, then append it to this branch's queue and commit.

`/task-next` skips any task whose `done when:` list is missing or empty, and
logs it as malformed. Dictation never produces one. This skill is the bridge
between how a task arrives and the shape the runner can execute.

## The asymmetry that governs everything below

A skipped task is visible in the log and costs one re-add.

A plausible-but-wrong criterion **gates real work**. `task-completion-reviewer`
judges the diff against the `done when:` list and nothing else, so an invented
criterion either passes the wrong thing or blocks correct work with a reason
that is not true — and it does so confidently, because the list is the contract
it was handed.

**Fabricating a criterion is worse than adding no task.** When the intent is
too thin to make observable, ask. Never pad the list to fill the slot.

## 1. Resolve the queue

```bash
git branch --show-current
```

Empty output means detached HEAD. **Stop and say so.** Do not guess a slug.

The slug is the branch with `/` replaced by `-`. Read
`.claude/tasks/<slug>.md`.

**If it does not exist**, create it with this header, filling in the branch
name and a one-line scope:

```markdown
# Tasks — <branch>

> Scope: <one line — what this branch owns>

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue, then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).
```

Create the `.log.md` sibling too, with its own header, so the runner has
somewhere to write:

```markdown
# Run log — <branch>

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.
```

A new queue file must be confirmed tracked before you commit — see step 4.

## 2. Draft

Produce a complete task block from the one-liner. Follow the drafting rules
below; they are the part that must not drift.

## Drafting rules

*Referenced by name from other skills. Change them here, not by copy.*

**Observability.** Every criterion must pass this test: *could a reviewer
holding only the diff verdict this met or not met?*

- ✅ "The badge reads 0 and the clear button is hidden once the last filter is removed"
- ❌ "The filter code is cleaner"
- ❌ "Performance is improved" — unless a number and a way to read it are named

Draft **three to five**. Fewer is usually under-specified. More usually means
the task should be two tasks — say so rather than writing a nine-item list.

**Refusal.** If the intent cannot be made observable, do not invent criteria.
Say what is missing, ask **exactly one** clarifying question, and stop without
writing. "Fix the matches page" and "make the dashboard better" are refusals,
not drafts.

**`files:` is a real guess, not a blank.** Consult `MAP.md`, and use the
`trace-route` skill for dashboard UI, to name a plausible target — it orients
the subagent the runner dispatches. Mark it as a guess; the runner already
treats it as one a subagent may correct.

**Numbering.** Take the next id above the highest ever used — **scan both
`.claude/tasks/<slug>.md` and `.claude/tasks/<slug>.log.md`**, and take the
higher of the two:

```bash
{ grep -ho '^## T[0-9]*' .claude/tasks/<slug>.md .claude/tasks/<slug>.log.md; } \
  | grep -o '[0-9]*' | sort -n | tail -1
```

The queue alone is not enough. A finished or abandoned task gets deleted from
the queue but stays in the log forever, so scanning only the queue silently
reclaims its id — which is precisely what this rule exists to prevent.

**Never reuse a number**, even one freed by a deletion: the run log references
tasks by id, and a reused id makes the log ambiguous about which work a line
describes.

**Duplicates.** If an existing task looks like the same work, name it and let
the author decide. Flag; never merge.

**Shape.** The heading separator is a middle dot (·, U+00B7). The field markers
are exact — the runner parses them:

```markdown
## T<n> · <short imperative title>
- **status:** todo
- **files:** <best guess>
- **done when:**
  - [ ] <observable criterion>
  - [ ] <observable criterion>
  - [ ] <observable criterion>
- **notes:** <context worth keeping, or omit the line>
```

## 3. Confirm

Show the drafted block and wait for a yes.

**One round trip in the happy case.** This is used from a phone; an interview
defeats the purpose. The author may amend in the same reply — "drop the third
one", "make it `next`", "that's two tasks".

**Write nothing before the yes.** If the author declines, leave the file and
the tree exactly as they were.

**No human turn, no write.** The yes has to come from a person. This skill is
model-invocable, so it can be reached where nobody is there to give one — an
autonomous `/loop` iteration, a scheduled fire, or the subagent `/task-next`
dispatches. In any of those, stop after showing the draft and say why. Silence
is not the yes, and an absent author cannot decline.

That clause is what replaces the old `disable-model-invocation` flag, which this
skill dropped so non-terminal front ends could reach it at all. The flag made the
no-human case unreachable; this makes it a refusal. Without it step 4 commits on
nobody's authority — and inside a `/task-next` dispatch it would commit to the
queue file the runner is concurrently rewriting, from a subagent that is
otherwise told not to commit.

## 4. Append and commit

Append at the end of the file. Default `status: todo`, or `next` if asked.

```bash
git add .claude/tasks/<slug>.md .claude/tasks/<slug>.log.md
git status --short
```

If you created the queue this run, `git status --short` must show it. If it
shows nothing, `.gitignore`'s `.claude/*` rule swallowed it and every task
added afterwards would be lost — stop and fix the re-include before going on.

```bash
git commit -m "task: add T<n> <title>"
```

Committing is not optional. An uncommitted task gets swept into the next
`/task-next` commit by its `git add -A`, and the dirty tree it leaves sends
`pr-check` down its "working tree dirty" branch — so `pr-check` reviews the
task file instead of the branch, which is the exact silent false pass that
section exists to prevent.

`git status --short` must come back empty afterwards.

## Do not

- Do not reorder, edit, or delete existing tasks. The queue file is the
  author's; you only append.
- Do not touch `.claude/tasks/<slug>.log.md` beyond creating it. It is the
  runner's.
- Do not promote or modify `later` tasks. That is a deliberate, by-hand act.
- Do not run the task. That is `/task-next`.
- Do not write anything before the author says yes — and never when there
  is no author present to ask.
