---
name: task-add
description: Plan one intent — or a batch — into right-sized, model-routed tasks and append them to this branch's queue. Use when adding work to .claude/tasks/, especially by voice or from a phone.
argument-hint: "<one or more one-line descriptions of work>"
---

# Add tasks

Turn an intent — or a batch of them, often dictated from a phone — into tasks
the gate can actually judge, then append them to this branch's queue and
commit.

Planning is routed, not inlined: a Fable subagent shapes and drafts (step 2),
and `/task-next` executes each task on the smallest model the work deserves.
This session only resolves the queue, relays the draft for confirmation, and
commits.

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

A new queue file must be confirmed tracked before you commit — see step 4.

## 2. Plan on Fable

Do not draft in this session. Dispatch **one** planner subagent via the Agent
tool with `model: "fable"` — shaping and routing is frontier-model work even
when this session runs on something smaller. Hand it:

- The intent(s) verbatim.
- The **Drafting rules** section below, verbatim.
- `MAP.md`, the current queue file (for duplicates and used ids), and the last
  ~80 lines of `.claude/tasks/<slug>.log.md` if it exists — the log is where
  blocked history lives.

The planner returns finished task blocks as text. It must not write files or
start the work. Its instructions, beyond the drafting rules:

**Shape.** Split an intent that spans multiple surfaces, that would need more
than five honest `done when:` criteria, or that mixes judgment work with
mechanical work — split so the mechanical half can route to `sonnet`. Merge
intents that touch the same file or surface and together still fit five
criteria. Target: one task is one comfortable subagent context.

**Route.** Assign each task a `- **model:**` line:

- `sonnet` — mechanical and fully specified: copy changes, renames, config
  edits, style tweaks, a single-component change with an exact spec, roughly
  two files or fewer.
- `opus` — standard feature work: multi-file, clear criteria, moderate
  judgment.
- `fable` — cross-cutting or architectural work, criteria that need
  interpretation, security or RLS, migrations and data-model changes, or
  edits to this task automation itself.

When in doubt, route one tier up: a wrong-low route costs a failed gate, a
stash and a re-run — more than the tier difference saves.

**Dependencies.** When one task builds on another's outcome — its criteria
assume the other's change exists, or both rewrite the same code — give the
dependent a `- **needs:** T<n>` line naming what must finish first
(comma-separate several). Independent tasks carry no line; independence is
what lets them run in any order. Point only at tasks that are not yet done.

**Escalation.** If the log shows the same work blocked before, propose one
tier above the model that failed and flag the bump in the draft. Never
escalate silently.

The Refusal rule binds the planner too: an intent that cannot be made
observable comes back as exactly one clarifying question, not a padded draft —
and this session relays that question instead of writing anything.

If the planner cannot be dispatched at all (no Agent tool, spend limit), say
so and draft inline under the same rules rather than failing the add — the
draft still goes through step 3's confirmation either way.

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
- **model:** sonnet
- **needs:** <T-ids that must finish first, or omit the line>
- **files:** <best guess>
- **done when:**
  - [ ] <observable criterion>
  - [ ] <observable criterion>
  - [ ] <observable criterion>
- **notes:** <context worth keeping, or omit the line>
```

**`model:`** is the execution route — `sonnet`, `opus`, or `fable`. New drafts
always carry the line so the routing decision is visible in the queue;
`/task-next` treats an absent line (legacy tasks) as `sonnet`.

**`needs:`** names tasks that must be `done` before this one is eligible —
`/task-next` passes over a task whose `needs:` are unmet. Omit the line for
independent tasks.

## 3. Confirm

Show the drafted block and wait for a yes. For a batch, lead with a compact
routing table — `T<n> · title · model · needs · split from / merged from` —
above the full blocks, so the whole plan can be approved or amended at a
glance.

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

For a batch, one commit carries the whole append:
`task: add T<n>–T<m> <summary>`.

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
