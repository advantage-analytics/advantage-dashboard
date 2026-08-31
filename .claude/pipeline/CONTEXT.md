# Feature pipeline — Layer 1

Staged, file-driven feature development per the Model Workspace Protocol
(arXiv:2603.16021). Spec: docs/superpowers/specs/2026-08-30-icm-feature-pipeline-design.md.

Stage order: `01_brief → 02_design → 03_plan → 04_tasks → 05_build →
06_review → 07_land`.
Each run lives in `work/<slug>/`, scaffolded by `/feature-new`, advanced by
`/feature-next`.

## Invariants — these are the architecture

1. **One stage per invocation, then stop.** The human reading (and possibly
   editing) `output/` between invocations IS the review gate. Never run two
   stages in one go; never loop this pipeline.
2. **Outputs are edit surfaces.** A stage reads its inputs exactly as the
   human left them — never "correct" an upstream output, and never modify an
   earlier stage's `output/`.
3. **Load only declared inputs.** Each stage's CONTEXT.md lists its inputs;
   plus anything in that stage's `references/`. Reading beyond the list is
   allowed only to verify a specific fact, and each such file must be named
   in the stage output under "Also consulted".
4. **Blocked stops everything.** A stage that cannot complete writes
   `output/BLOCKED.md` — why, and what would unblock — and stops. The runner
   refuses to advance past it until the human deletes or resolves it.
5. **Plain markdown between stages.** No state files, no frontmatter status,
   no scripts deciding what runs next. The folder numbering is the
   orchestration.

A landed pipeline leaves no residue: stage 07 merges the branch and then
deletes its queue pair and workspace on the integration branch — git history
is the archive. Only a workspace kept deliberately as the current worked
example survives, and only one such example at a time.

Per-feature contract edits are legitimate: the copies in `work/<slug>/` may be
tuned for that feature. The factory templates here stay generic.
