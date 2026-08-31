# ICM Feature Pipeline — Design

Date: 2026-08-30
Status: approved (brainstorm 2026-08-30)
Amended 2026-08-31, after the pilot: stage `07_land` added — merge gated on
the sign-off, then delete the branch's queue pair and workspace on the
integration branch. Six stages below reads as seven now.
Source: "Interpretable Context Methodology: Folder Structure as Agentic
Architecture" (Van Clief & McDermott, arXiv:2603.16021) — the Model Workspace
Protocol (MWP).

## What this is

A staged, file-driven feature-development pipeline for this repo's Claude
workflow. It replaces chat-only design/plan approvals with numbered stage
folders whose outputs are markdown files the human edits between stages.
Execution (build) and review reuse the existing task-queue and pr-check
machinery — the pipeline wraps them, it does not replace them.

ICM principles adopted:

1. One stage, one job.
2. Plain text as the interface — every handoff is markdown.
3. Layered context loading — a stage loads only its contract plus declared
   inputs, nothing else.
4. Every output is an edit surface — the next stage reads whatever the human
   left in `output/`.
5. Configure the factory, not the product — templates live once in
   `.claude/pipeline/`; each feature is a run.

## Decisions (from brainstorm)

- Target: the dev workflow with Claude, not a product feature.
- Scope: full staged pipeline (not contracts-only).
- Stages: six — brief, design, plan, tasks, build, review.
- Review gate: **next invocation = approval**. The runner executes exactly one
  stage per invocation and stops. Re-invoking after reading/editing the output
  is the approval. No status frontmatter, no loop-driving the pipeline.
- Approach: skill-driven runner (mirrors `/task-next`), no orchestration
  scripts.

## Layout

Factory (set up once, committed):

    .claude/pipeline/
    ├── CONTEXT.md              # Layer 1: pipeline rules and stage order
    └── stages/NN_<name>/CONTEXT.md   # Layer 2: per-stage contracts (6)

Per-feature run (scaffolded by /feature-new, committed):

    work/<slug>/
    ├── CONTEXT.md              # feature name, branch, scaffold date
    ├── BRIEF-SEED.md           # human's raw intent, any form
    └── NN_<stage>/
        ├── CONTEXT.md          # copied from factory; per-feature edits allowed
        ├── references/         # human-dropped extras; always in-scope inputs
        └── output/             # the stage's edit surface

Committing `work/` makes between-stage human edits visible as diffs. Distinct
per-feature folders keep worktree merges conflict-free (same property as the
task queues).

## Stage contracts (summary)

Each stage `CONTEXT.md` is a three-part contract: **Inputs** (exact files to
load), **Process** (the job), **Outputs** (files written to `output/`).

| Stage | Job | Primary output |
|---|---|---|
| 01_brief | Refine BRIEF-SEED.md into goal/scope/non-goals/constraints/success criteria; ask the human when ambiguous | output/brief.md |
| 02_design | 2–3 approaches + recommendation, then the full design; trace routes first; guardrails doc when UI is touched | output/design.md |
| 03_plan | Ordered implementation plan; steps sized for one subagent context (split by surface) | output/plan.md |
| 04_tasks | Decompose plan into queue tasks per task-add conventions; append to `.claude/tasks/<branch-slug>.md` | output/tasks.md + queue append |
| 05_build | Mechanical: point at the loop drain if tasks remain; when drained, record task statuses + commit range | output/build.md |
| 06_review | Run pr-check; capture findings and resolutions; human sign-off edit | output/review.md |

## Runner — /feature-next <slug>

1. Resolve `work/<slug>` (arg optional when exactly one feature is active).
2. Current stage = lowest-numbered folder whose contracted primary output is
   missing. A `BLOCKED.md` in any `output/` halts the pipeline until resolved.
3. Load ONLY: workspace CONTEXT.md, the stage's CONTEXT.md, its declared
   inputs, and its `references/`.
4. Execute the contract. Write `output/`. Never modify earlier stages' outputs.
5. Commit `pipeline(<slug>): stage NN <name>`, tell the human what to review,
   and STOP. One stage per invocation — never two.

`disable-model-invocation: true` on the runner: a scheduled `/loop` fire must
never advance the pipeline past a human gate.

## Scaffolder — /feature-new <slug>

Validates the slug, refuses an existing workspace, copies factory stage
folders, creates `output/` + `references/`, writes workspace CONTEXT.md and a
BRIEF-SEED.md placeholder, commits.

## Failure handling

A stage that cannot complete writes `output/BLOCKED.md` (why + what would
unblock) and stops — the pipeline analogue of a `blocked` task. Stage 04 must
never fabricate done-when criteria (task-add's rule); too-thin intent means
stop and ask, not pad.

## Out of scope

- No changes to `/task-next`, `/task-add`, `/pr-check`, or the queue format.
- No product/app code. No scripts, no status frontmatter, no concurrency.
- Retrofitting the Inputs/Process/Outputs contract into standalone (non-
  pipeline) queue tasks — possible later, not part of this build.
