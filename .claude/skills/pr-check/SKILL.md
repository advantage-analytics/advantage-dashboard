---
name: pr-check
description: Run the full pre-merge gate on the current branch — lint, typecheck, tests, then quality and safety review via /simplify, the vercel-react-best-practices skill, and this project's guardrail subagents. Use before opening a PR or merging to main. There is no CI in this repo, so this is the only gate.
disable-model-invocation: true
argument-hint: "[optional: scope, e.g. 'ui only']"
---

# Pre-merge check

**This repo has no `.github/` workflows.** Nothing runs on push, nothing runs
on a PR. Every check is this one. Do not skip a stage because the diff "looks
small" — the failure modes this catches are the silent kind.

## What to review — read this before stage 1

**A clean working tree means the work is committed, not that there is nothing
to review.** `/task-next` commits every task it completes, so by the time you
run this the tree is usually clean. Reviewing "the current diff" would then
find nothing and report green over a whole branch of unreviewed work — the
worst failure a gate can have.

Pick the target before you start, and say which you picked:

- **Working tree dirty** — review `git diff HEAD`. Uncommitted work in progress.
- **Working tree clean** — review the branch range:

```bash
git diff $(git merge-base HEAD splitstep-integration)...HEAD --stat
```

  Pass that same range to `code-review`, which accepts a branch target, and
  scope `simplify` to the files it lists.

`splitstep-integration` is the integration branch and the correct base. `main`
is deployed and is not the merge target until the whole branch lands.

## Stage 1 — mechanical gates

Run all three. Report actual output, not a summary of it.

```bash
npm run lint
```

```bash
npx tsc --noEmit
```

```bash
npm test
```

Note on `npm test`: Playwright is the runner but most specs are pure logic
tests over library code — no browser, no dev server. They should run fast. If
one wants a browser, that is a change worth mentioning.

**If any stage fails, stop and fix it.** Do not proceed to review with a red
build; you will spend the review reading around the failure.

## Stage 2 — quality pass

Invoke the `simplify` skill. It reviews the changed code for reuse,
simplification, efficiency and altitude, and applies the fixes. It does not
hunt for bugs — that is stage 3.

If the diff touches `.tsx` under `src/app` or `src/components`, also load the
`vercel-react-best-practices` skill and check the changed components against
it: Server vs Client Component boundaries, data fetching, and what got pulled
into the client bundle. This project is React 19 on Next 16 — a `"use client"`
added without cause is the most common regression, and it costs bundle size on
every dashboard page.

## Stage 3 — correctness and safety

Run the general review:

- The `code-review` skill for correctness bugs in the diff.

Then run the project-specific reviewers, **in parallel**, for whichever
surfaces the diff touches:

- **`pipeline-guardrails-reviewer`** — if anything under
  `src/app/dashboard/`, `src/components/dashboard/`, or the upload wizard
  changed. This is the reviewer that checks the three wizard inputs which
  misattribute every statistic to the wrong player while every screen still
  looks correct.
- **`rls-boundary-reviewer`** — if anything under `src/lib/supabase/`,
  `src/lib/data/`, `src/app/api/`, or `supabase/migrations/` changed, or if
  any new table, view or query appeared.
- **`supabase-postgres-best-practices` skill** — if anything under
  `supabase/migrations/` changed, or the diff adds or alters SQL, a table, a
  column type, an index, an RLS policy, or a database function. This is the
  schema-and-query counterpart to the React skill in stage 2; `rls-boundary-reviewer`
  asks who may read a row, this asks whether the table is built right.

Send the two reviewer subagents in one message so they run concurrently.
Invoke the `supabase-postgres-best-practices` skill separately if its
trigger applies.

## Stage 4 — report

Give the user:

1. Pass/fail per mechanical gate, with real output for anything that failed.
2. What `simplify` changed, if anything.
3. Findings from each reviewer that ran, worst first — and which reviewers you
   skipped, with the reason.
4. A plain verdict: ready to merge, or the specific list of what is not.

Do not soften a failure into "mostly passing". If it is not ready, say what
blocks it.

## Do not

- Do not commit or push unless the user asks. Report the verdict and stop.
- Do not skip stage 3 because stage 1 was green. Lint and tsc do not know what
  a workspace is, and cannot tell you a query crossed an account boundary.
