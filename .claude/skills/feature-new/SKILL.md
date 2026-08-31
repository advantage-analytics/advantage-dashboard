---
name: feature-new
description: Scaffold a new ICM feature-pipeline workspace under work/<slug> from the .claude/pipeline/ factory templates. Use when starting feature work that should run through the staged brief→design→plan→tasks→build→review pipeline.
argument-hint: "<feature-slug> (kebab-case)"
---

# Scaffold a feature workspace

One workspace per feature. The factory is `.claude/pipeline/`; read its
`CONTEXT.md` for the invariants before scaffolding your first workspace.

## 1. Validate

- The slug must be kebab-case (`[a-z0-9-]+`). Reject anything else — it
  becomes a folder name and a commit prefix.
- If `work/<slug>/` already exists, **stop and say so**. Never overwrite a
  workspace; resuming one is `/feature-next`, not `/feature-new`.

## 2. Scaffold

```bash
mkdir -p work/<slug>
cp -R .claude/pipeline/stages/. work/<slug>/
for d in work/<slug>/*/; do mkdir -p "$d/output" "$d/references"; touch "$d/references/.gitkeep"; done
```

Then write two files:

- `work/<slug>/CONTEXT.md` — three lines: the feature name, the branch it was
  scaffolded on, the date, and a pointer to `.claude/pipeline/CONTEXT.md` for
  the rules.
- `work/<slug>/BRIEF-SEED.md` — a placeholder telling the human to replace it
  with their raw intent in any form (prose, bullets, a pasted voice note),
  and that `/feature-next <slug>` starts the pipeline once they have.

Do NOT create any `output/` content. An empty `01_brief/output/` is what
tells the runner the pipeline hasn't started.

## 3. Commit

```bash
git add work/<slug> && git commit -m "pipeline(<slug>): scaffold workspace"
```

Tell the human: edit `work/<slug>/BRIEF-SEED.md`, then run
`/feature-next <slug>`.
