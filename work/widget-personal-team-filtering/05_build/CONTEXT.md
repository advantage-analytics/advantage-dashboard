# Stage 05 — Build

## Inputs
- working: `.claude/tasks/<branch-slug>.md` and `.claude/tasks/<branch-slug>.log.md`
- working: `../04_tasks/output/tasks.md` (which tasks belong to this feature)

## Process
Mechanical stage — no design or coding happens here; the queue machinery owns
execution. If any of this feature's tasks are still `todo`/`next`/`doing`:
report the queue state and remind the human to drain it —

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

— then stop WITHOUT writing the primary output (the stage stays current until
the queue is drained). When every feature task is `done` or `blocked`: write
the build report — per-task status, the commit range (`git log --oneline`),
and each blocked task's reason.

## Outputs
- `output/build.md` — task statuses · commit range · blocked items
