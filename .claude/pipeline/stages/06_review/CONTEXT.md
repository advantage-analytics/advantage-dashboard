# Stage 06 — Review

## Inputs
- working: `../05_build/output/build.md` (the commit range under review)
- working: the diff of that commit range
- working: `../01_brief/output/brief.md` (the success criteria to check)
- reference: `.claude/skills/pr-check/SKILL.md` — the gate this stage runs

## Process
Run the pr-check skill (`.claude/skills/pr-check/SKILL.md`) over the
feature's commit range. Record what it found, what was fixed in response, and
what was consciously left. Open the report with a `Sign-off:` line left as
`pending` — the human editing it to `approved` (or annotating otherwise) is
the pipeline's final gate. Check the brief's success criteria one by one.

## Outputs
- `output/review.md` — Sign-off line · success criteria check ·
  findings and resolutions · consciously left · Also consulted (any file
  read beyond the inputs above)
