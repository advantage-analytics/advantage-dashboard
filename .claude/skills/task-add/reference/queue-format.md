# Queue format

Shared by `task-add` and `task-next`. Change it here, not by copy — both
skills consult this file rather than restating it, and the `/loop`
incantation below in particular must stay byte-identical everywhere it is
quoted.

## Locating the queue

```bash
git branch --show-current
```

Empty output means detached HEAD. **Stop and say so.** Do not guess a slug and
do not fall back to another file.

The slug is the branch with `/` replaced by `-`:
`claude/workspace-setup-repo-1389c6` → `claude-workspace-setup-repo-1389c6`.

The queue file is `.claude/tasks/<slug>.md`; its run-log sibling is
`.claude/tasks/<slug>.log.md`. The two always exist as a pair.

## Creating a new queue

If the queue file does not exist, create it with this header, filling in the
branch name and a one-line scope:

```markdown
# Tasks — <branch>

> Scope: <one line — what this branch owns>

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

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

A new queue file must be confirmed tracked (`git status --short` shows it)
before it is committed — `.claude/tasks/` is not gitignored, but a mistake
elsewhere in `.gitignore` would silently swallow it, and every task added
afterwards would be lost.

## The `/loop` incantation

Draining the queue is never `/loop /task-next`. `task-next` sets
`disable-model-invocation: true` because it commits, dispatches subagents, and
can stash work, and Claude Code's scheduled-tasks documentation is explicit
that a scheduled fire only runs skills the model may invoke on its own — a
skill marked `disable-model-invocation: true` "reaches Claude as plain text
instead of executing." So `/loop /task-next` runs exactly once — the time it
was typed — and then silently does nothing on every fire after. It does not
error; it just stops draining.

Loop a plain-text instruction instead — the exact wording, quoted above in the
new-queue header and never paraphrased:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

## Status vocabulary

- `todo` — eligible to run, in file order.
- `next` — jumps the queue; `task-next` picks the first `next` before any
  `todo`.
- `doing` — written by `task-next` at pre-flight, before dispatch.
- `done` — written by `task-next` after a clean gate and commit.
- `blocked` — written by `task-next` when the gate failed; the code changes
  are stashed, not committed.
- `later` — deferred. `task-next`'s picker never selects it — not malformed,
  not skipped-and-logged, simply invisible to the picker. Promote it to
  `todo` by hand once it is actually ready. Only a person does this; the
  runner never touches a `later` task.

## `needs:` semantics

A task with a `- **needs:** T<n>` line is eligible only once every task it
names is finished — `done` in the queue, or gone from the queue but recorded
`— done` in the log. Anything else (`todo`, `doing`, `blocked`, an id that
resolves to nothing anywhere) leaves it waiting: `task-next` passes over it
silently, like `later`, and keeps scanning. A waiting task is not logged as
skipped — waiting is normal, not malformed. Point only at tasks that are not
yet done; comma-separate several ids. Independent tasks carry no `needs:`
line — that absence is what lets them run in any order.

## `model:` routing

Each task carries a `- **model:**` line: `sonnet`, `opus`, or `fable`.
`task-next` dispatches on this value and treats an absent line (legacy tasks)
as `sonnet`. Routing above `sonnet` is `task-add`'s planner's call, never
`task-next`'s.

## Task-block shape

The heading separator is a middle dot (`·`, U+00B7). The field markers are
exact — `task-next` parses them:

```markdown
## T<n> · <short imperative title>

- **status:** todo
- **model:** sonnet
- **needs:** <T-ids that must finish first, or omit the line>
- **files:** <best guess>
- **done when:**
  - [ ] <observable criterion>
  - [ ] <observable criterion>
  - [ ] <observable criterion>
- **notes:** <context worth keeping, or omit the line>
```

## Id numbering

Take the next id above the highest ever used — scan **both** the queue file
and its log sibling, and take the higher of the two:

```bash
{ grep -ho '^## T[0-9]*' .claude/tasks/<slug>.md .claude/tasks/<slug>.log.md; } \
  | grep -o '[0-9]*' | sort -n | tail -1
```

The queue alone is not enough: a finished or abandoned task gets deleted from
the queue but stays in the log forever, so scanning only the queue silently
reclaims its id. **Never reuse a number**, even one freed by a deletion — the
run log references tasks by id, and a reused id makes the log ambiguous about
which work a line describes.

## Who writes what

The queue file is append-only from `task-add`'s side and status-only from
`task-next`'s: `task-add` appends new task blocks and never edits, reorders,
or deletes an existing one; `task-next` only ever rewrites a task's `status:`
line, never the rest of the block. The log file is the runner's — `task-add`
creates it once (empty, header only) and never writes to it again; only
`task-next` appends run entries.
