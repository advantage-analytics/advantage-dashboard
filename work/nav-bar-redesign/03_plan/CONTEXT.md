# Stage 03 — Plan

## Inputs
- working: `../02_design/output/design.md` (as the human left it)
- working: `../01_brief/output/brief.md` (scope guard — the plan must not
  exceed the brief)
- `references/` — anything the human dropped there

## Process
Turn the design into an ordered implementation plan. Size every step for one
fresh subagent context: one surface per step — a step that sweeps several
large files must be split. For each step: files touched, what changes, how it
is verified. State the overall test strategy and the order dependencies
between steps. No code here — the plan is the deliverable.

## Outputs
- `output/plan.md` — ordered steps, each with files · change · verification;
  closing section: Test strategy
