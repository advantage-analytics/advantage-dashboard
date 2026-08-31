---
name: feature-next
description: Run the next stage of an ICM feature-pipeline workspace in work/ — one stage, scoped context, then stop for human review. Re-invoking after reviewing the output is the approval.
argument-hint: "<feature-slug> (optional when only one workspace is active)"
disable-model-invocation: true
---

# Run one pipeline stage

One stage. Its declared inputs only. One output, one commit. Then stop.

Stopping is the review gate: the human reads — and freely edits — the
stage's `output/` files, and invoking this skill again is the approval. That
is why this skill sets `disable-model-invocation: true` and must never be
driven by `/loop` or a scheduled fire: an unattended invocation would count
as an approval no human gave.

## 1. Resolve the workspace

- With an argument: `work/<slug>/`. Missing → stop and say so.
- Without: if `work/` holds exactly one workspace, use it; otherwise list
  them and stop. Never guess.

Read `work/<slug>/CONTEXT.md` and `.claude/pipeline/CONTEXT.md` (the
invariants). Both are short; they are Layer 0/1 for everything below.

## 2. Find the current stage

Walk the numbered stage folders in order. The current stage is the first one
whose primary output (named in its CONTEXT.md `## Outputs`) is missing from
`output/`.

- Any `output/BLOCKED.md` in an earlier-or-current stage: **stop**, surface
  its contents, and go no further. The human resolves or deletes it.
- All six primary outputs present: the pipeline is complete — say so and
  point at `06_review/output/review.md`'s sign-off line.
- Special case, stage 05: its contract deliberately withholds the primary
  output while queue tasks remain. Re-running 05 until the queue drains is
  correct, not a stall.

Announce the stage before doing anything: "Running stage NN (<name>) of
<slug>."

## 3. Load the contract — and only the contract

Read the stage's own `CONTEXT.md` (the copy inside `work/<slug>/`, which the
human may have tuned — never the factory template). Load exactly:

1. its `## Inputs` list, as the human left those files,
2. every file in that stage's `references/`,
3. nothing else.

Reading a further file to verify a specific fact is allowed; every such file
must appear in the output under "Also consulted". If the pull is broader than
a few files, the contract's input list is wrong — stop and tell the human
instead of silently widening.

## 4. Execute and write

Do the contract's `## Process`. Asking the human questions in chat is normal
in stages 01–02 and a smell in 04–06. Write the contracted files into
`output/`. Never touch an earlier stage's `output/`, and never edit the
stage's `CONTEXT.md` yourself.

Cannot complete honestly? Write `output/BLOCKED.md` — why, and what would
unblock — and proceed to the commit step. Blocked is a result.

## 5. Commit and stop

A stage that deliberately stopped **without writing anything** — stage 05
waiting on the queue drain — has nothing to commit: skip the commit, report,
and stop. Otherwise:

```bash
git add work/<slug> .claude/tasks && git commit -m "pipeline(<slug>): stage NN <name>"
```

(`.claude/tasks` is included because stage 04's contract appends to the
branch queue.)

Then tell the human, in one or two lines: which files to review, and that
`/feature-next <slug>` continues once they're satisfied. **Do not run the
next stage. Do not summarize the whole pipeline. Stop.**
