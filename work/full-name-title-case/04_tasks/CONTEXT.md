# Stage 04 — Tasks

## Inputs
- working: `../03_plan/output/plan.md` (as the human left it)
- reference: `.claude/skills/task-add/SKILL.md` — the format and routing
  authority; follow it, do not reinvent it
- `references/` — anything the human dropped there

## Process
Decompose the plan into tasks for this branch's queue,
`.claude/tasks/<branch-slug>.md`, per task-add's conventions: `## T<n> ·
<title>` entries with `status: todo`, `files:`, an observable `done when:`
checklist, and `notes:`. task-add's rule binds here: **never fabricate a
done-when criterion** — if a plan step is too thin to make observable, stop
and ask instead of padding. Append to the queue (create it with task-add's
header if absent), and mirror the appended block verbatim into this stage's
output so the pipeline chain stays inspectable.

## Outputs
- `output/tasks.md` — copy of the block appended to the queue
- side effect: tasks appended to `.claude/tasks/<branch-slug>.md`
