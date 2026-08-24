# `/task-add` — Design

**Date:** 2026-08-24
**Status:** Design, not yet implemented
**Related:** [`2026-08-23-task-loop-workspace-design.md`](2026-08-23-task-loop-workspace-design.md)

## Goal

Turn a one-line intent — usually dictated from a phone over Remote Control —
into a well-formed task appended to the current branch's queue, with
observable `done when:` criteria the author confirms before it lands.

## Why it exists

`/task-next` skips any task whose `done when:` list is missing or empty, and
logs it as malformed. That is deliberate: a task without acceptance criteria
cannot be gated, and gating is the point.

But dictation never produces a `done when:` list. So today a task added from a
phone is either malformed — skipped, logged, and invisible until someone reads
the log — or it requires composing structured markdown on a phone keyboard.
`/task-add` is the bridge between how a task arrives and the shape the runner
can actually execute.

**Plain conversation still works and is not being replaced.** Telling any
session "add a task to the queue: …" edits the file directly. `/task-add` is
the structured path: it drafts criteria, self-checks them, commits, and leaves
a clean tree.

## The one thing that must not go wrong

**Fabricated criteria are worse than a skipped task.** A skipped task is
visible in the log and costs a re-add. A plausible-but-wrong criterion gates
real work: it passes on the wrong thing, or blocks correct work with a false
reason, and `task-completion-reviewer` will faithfully enforce it because the
criteria list is the contract it judges against.

Every other decision below follows from that.

## Behaviour

### 1. Resolve the queue

Same slug rule as `/task-next`: current branch with `/` replaced by `-`, at
`.claude/tasks/<slug>.md`. Detached HEAD → stop, do not guess.

If the queue does not exist, create it with the standard header and say so.
`.gitignore` already re-includes `.claude/tasks/`, so no ignore change is
needed — but a new queue file must be confirmed present in `git status` before
committing, because `.claude/*` is ignored by default and a silent
non-tracking here would lose every task added afterwards.

### 2. Draft

From the one-liner, produce a complete task block: title, `files:`,
`done when:`, `notes:`.

**Criteria must be observable.** The bar is: *could a reviewer holding only
the diff verdict this met or not met?* "The code is clean" fails. "The badge
reads 0 and the clear button is hidden once the last filter is removed"
passes. Draft three to five; fewer is usually under-specified, more usually
means the task should be split.

**`files:` is a real guess, not a blank.** Use `MAP.md`, and `trace-route` for
dashboard UI, to name a plausible target — it orients the dispatched subagent.
The runner already treats the field as a guess a subagent may correct.

**Refuse to guess when the intent is too vague to make observable.** "Fix the
matches page" has no criteria. Say so, ask exactly one clarifying question, and
stop. Never pad the list to fill the slot.

**Flag a likely duplicate, do not merge it.** If an existing task looks like
the same work, name it and let the author decide.

### 3. Confirm

Show the drafted block and wait for a yes. **One round trip in the happy
case** — phone use dies on interviews. The author may amend in the same reply
("drop the third criterion", "make it `next`").

Nothing is written before the yes.

### 4. Append and commit

Append only. Never reorder, never edit an existing task, never touch the log —
that is the runner's file.

Number as the next free `T<n>`, scanning existing headings. **Never reuse a
number**, even for a deleted task: the run log references tasks by id, and
reuse makes the log ambiguous about which work a line describes.

Default `status: todo`; `next` if the author asked.

Then commit:

```bash
git add .claude/tasks/<slug>.md
git commit -m "task: add T<n> <title>"
```

Committing is not optional. An uncommitted task gets swept into the first
subsequent `/task-next` commit by its `git add -A`, and — worse — leaves the
tree dirty, which sends `pr-check` down its "working tree dirty" branch and
makes it review the task file instead of the branch.

## Frontmatter

```yaml
name: task-add
description: Draft a well-formed task from a one-line intent and append it to this branch's queue. Use when adding work to .claude/tasks/, especially by voice or from a phone.
argument-hint: "<one-line description of the task>"
```

**No `disable-model-invocation`, unlike `pr-check` and `task-next`.** It carried
the flag at first, on the reasoning that a skill which writes and commits should
not fire on an ambiguous sentence. That reasoning held while every invocation was
typed into a terminal, where it cost nothing.

It stops holding anywhere else. The flag removes a skill from the model-facing
catalog outright, leaving it reachable only when a front end expands a typed
`/task-add` into an invocation. Cloud sessions, scheduled fires and remote
triggers all reach the model as plain text instead, so the slash command arrives
as literal characters matching nothing — the same failure `task-next` documents
for `/loop /task-next`.

Step 3 is what keeps this skill safe without the flag, not the frontmatter: it
drafts, shows the block, and writes nothing before a yes — and refuses outright
when there is no human turn to supply one, which is precisely the case the flag
used to make unreachable.

Both halves are load-bearing. A confirm gate on its own still commits on
nobody's authority in an autonomous loop, a scheduled fire, or the subagent
`/task-next` dispatches. `task-next` keeps its flag, because `git add -A`,
subagent dispatch and stashing have no equivalent gate — it is driven from
non-terminal front ends by plain text instead.

## Out of scope

- Running the task. That is `/task-next`.
- Reordering, editing, or deleting existing tasks. The queue file is the
  author's; the skill only appends.
- Merging duplicates. It flags; the author decides.
- Touching `later` tasks or promoting them. By hand, deliberately.

## Failure modes

| Failure | Handling |
|---|---|
| Detached HEAD | Stop with the reason; never guess a slug |
| Queue file absent | Create with the standard header, confirm it is tracked before committing |
| Intent too vague for observable criteria | One clarifying question, then stop. Never fabricate |
| Looks like an existing task | Name the suspected duplicate; author decides |
| Author declines the draft | Write nothing, leave the tree clean |
| Number collision after a manual delete | Take the next free id above the highest ever used, never a reclaimed one |

## Relationship to T5 (Notion ingestion)

T5's core job is the same engine: rewrite an unstructured line into this schema
with observable criteria, and report rather than guess when an item is too
vague. **T5 should invoke `/task-add`'s drafting rules, not reimplement them.**
Two independent drafters would drift, and the criteria bar is the part that
must not drift.

The practical consequence for implementation: keep the drafting rules —
observability bar, refusal rule, numbering rule — in a section of the skill
file that T5 can reference by name, rather than woven through its procedure.

## Verification

1. A clear one-liner produces a block with three to five observable criteria,
   and appends only after a yes.
2. Declining the draft leaves the file and the tree untouched.
3. A deliberately vague one-liner ("make the dashboard better") produces a
   clarifying question and no file write.
4. Two adds in a row produce `T<n>` and `T<n+1>`, never a reused id.
5. On a branch with no queue, the first add creates the file **and**
   `git ls-files` lists it afterwards.
6. `git status --short` is empty after every successful add.
7. `/task-next` picks up a task added this way without reporting it malformed —
   the round trip that proves the two halves agree on the schema.
