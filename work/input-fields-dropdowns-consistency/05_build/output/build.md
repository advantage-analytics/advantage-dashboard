# Build — input-fields-dropdowns-consistency

Queue: `.claude/tasks/claude-input-fields-dropdowns-consistency-41813d.md`.
Run log: the `.log.md` sibling, which carries the per-task gate verdicts.

## The one thing stage 06 must know first

**The author narrowed this feature's scope mid-build, on 2026-09-02, after
stage 04.** Stages 01–04 describe an app-wide pass over roughly 35 files.
The build delivered a deliberate subset: the nine pages that share one field
constant. Twelve of the fifteen queued tasks were set to `later` — deferred
by the author, not attempted and not failed.

The trigger was a question the author asked while T2 was dispatched: whether
the change was only for the onboarding flow. Investigating it produced the
fact that settled the scope — **onboarding has no field styling of its own.**
Its inputs come from `CLAIM_FIELD`, one exported constant in
`claim/claim-shell.tsx` that six components and nine pages share. "Just
onboarding" was therefore not available as a narrower option: the constant
either changes for all nine or onboarding forks away from siblings it
currently matches exactly. Offered those alternatives, the author chose the
nine-page family.

So: read stages 01–04 as the full survey of the drift, which remains accurate
and is why the deferred tasks are worth keeping. Read this report as what was
actually built.

## Task status

| Task | Status | Model | Commit |
|---|---|---|---|
| T1 · Add the `advField()` class helper | **done** | opus | `d526ab2` |
| T2 · Shared primitives and `ScoreCell` | *later* | — | stashed, see below |
| T3 · Convert `CLAIM_FIELD` and the program-search box | **done** | sonnet | `1bf09c1` |
| T4 · Verify the six `CLAIM_FIELD` consumers | **done** | sonnet | `bd2c700` |
| T5 · Settings fields | *later* | — | — |
| T6 · Schedule score cells | *later* | — | — |
| T7 · Statistics match selector | *later* | — | — |
| T8 · `FieldCell` geometry | *later* | — | — |
| T9 · Matches-page float panels | *later* | — | — |
| T10 · Admin review-row inputs | *later* | — | — |
| T11 · Underline family audit | *later* | — | — |
| T12 · Non-guarded underline fields | *later* | — | — |
| T13 · `edit-match-dialog.tsx` underline geometry | *later* | — | — |
| T14 · `DetailsContent.tsx` underline geometry | *later* | — | — |
| T15 · Field-geometry invariant test | *later* | — | — |

**Nothing is `blocked`.** Every task that ran passed every gate on its first
attempt; no task was stashed for failure and no gate was overridden.

## Commit range

```
bd2c700 T4: Verify the six CLAIM_FIELD consumers inherit T3 unchanged
1bf09c1 T3: Convert CLAIM_FIELD and the program-search box to advField("boxed")
8680798 task: narrow the queue to the CLAIM_FIELD family
d526ab2 T1: Add the advField() class helper
```

`8680798` is bookkeeping, not build output: it records the scope decision,
sets twelve tasks to `later`, corrects the queue header, and removes T2 from
T3's `needs:` line — that dependency was sequencing, not need, since none of
these nine pages consumes the shadcn primitives.

## What shipped

**`src/lib/ui/adv-field.ts`** (T1) — the canonical field definition, a
deliberate sibling of `src/lib/ui/adv-button.ts`. `advField(kind, size)`
returns boxed or underline field classes: 6px radius via
`var(--radius-button)`, 36/32px heights at 13/12px text mirroring
`advButton`'s own md/sm tiers, the `--border-field` hairline, and no focus
utility at all. Its header records why there is no focus treatment
(`focus.css` is unlayered and silently discards `focus-visible:*` utilities
while already supplying `--focus-ring-field`) and the two-radius-scale trap
that made the drift systemic.

**`CLAIM_FIELD`** (T3) — now `advField("boxed")` plus `w-full`. One constant,
nine pages: `/onboarding`, `/join/[token]`, `/claim/program`,
`/claim/program/new`, `/claim/[programKey]`, `/claim/[programKey]/request`,
`/claim/[programKey]/object`, `/claim/[programKey]/setup`,
`/claim/team/setup`. Fields went 38px → 36px tall and 8px → 6px radius.
`claim/program-search.tsx`'s composite search box took the same geometry.

**Nothing** (T4), which was that task's contracted outcome. All six consuming
components inherit the constant cleanly; every class they append is a
deliberate override rather than a duplicate of a value the helper now
supplies, so there was nothing to remove.

## Two decisions made during the build that a reviewer should check

1. **`CLAIM_FIELD`'s trailing `outline-none` was dropped** (T3). The reasoning:
   `focus.css`'s unlayered `:focus-visible` rule already sets `outline: none`
   beside the field ring, and author CSS beats the UA stylesheet regardless of
   specificity, so the utility only suppressed something already suppressed.
   `task-completion-reviewer` verified this independently against `focus.css`
   and agreed.
2. **The disabled-background token `--bg-field` was not created** (T1). It does
   not exist anywhere in the repo — the design system names it only as the
   literal `#F7F7F7` in a documentation table. The helper substitutes the
   existing `--surface-subtle` (`#F5F5F5`) and says why in its header: a new
   token would owe an unreviewed hex in a measured, WCAG-verified `.dark`
   block, which is a design decision rather than a styling pass, and
   `colors.css` has merged near-twins on that same precedent before.

## Gate results

Every task cleared, in cost order, on the first attempt:

| Stage | T1 | T3 | T4 |
|---|---|---|---|
| lint | 0 errors | 0 errors | 0 errors |
| `tsc --noEmit` | clean | clean | clean |
| `npm test` | 301 passed | 301 passed | 301 passed |
| `task-completion-reviewer` | pass | pass | pass |

Thirty-seven lint warnings are pre-existing and unrelated; none names a file
this branch touched. No `.next/` type staleness needed clearing on any run.

**Both guardrail reviewers were skipped on all three tasks, legitimately.**
The diffs live in `src/lib/ui/` and `src/components/claim/`, which is neither
a `pipeline-guardrails-reviewer` surface (`src/app/dashboard/`,
`src/components/dashboard/`, the upload wizard) nor an `rls-boundary-reviewer`
one (`src/lib/supabase/`, `src/lib/data/`, `src/app/api/`,
`supabase/migrations/`, any new table, view or query). Surfaces were
determined from `git diff HEAD --stat` **and**
`git ls-files --others --exclude-standard` each time, because T1's only file
was untracked and would not have appeared in the diff alone.

Beyond the gates, T3 and T4 were both confirmed in a real browser: computed
style on `/claim/program/new` reads 36px tall, 6px radius, 13px text, matching
the helper's md tier. `/onboarding`, `/claim/team/setup` and `/join/[token]`
are session- or token-gated and were not forced open; they consume the same
constant already verified rendering correctly.

## Recoverable work set aside

T2 was dispatched before the scope narrowed and was interrupted mid-run. It
had already written substantial, good-quality changes to the three shadcn
primitives and `ScoreCell`. That work **never passed a gate** and is now out
of scope, so it was stashed rather than committed or discarded:

```
git stash apply 11b918a461f21591336a6ca93f54fd3ca15c7872
```

Anyone promoting T2 back to `todo` should treat that stash as a starting
point to re-gate, not as reviewed work.

## What stage 06 should NOT expect to find

The brief's seven success criteria were written for the app-wide scope. Under
the narrowed scope, four of them are out of reach by construction and should
not be read as failures:

- Criterion 1 (every boxed field at 6px, and a clean grep) — true for the nine
  pages; the deferred surfaces still carry `rounded-md` / `rounded-lg`.
- Criterion 2 (the underline family aligned) — untouched; that was T11–T14.
- Criterion 3 (the three primitives agree) — untouched; that was T2.
- Criterion 4 (opened select panels match the Dropdown spec) — untouched.
- Criterion 6 (the wizard's guarded inputs unchanged) — trivially true; no
  guarded file was opened.
- Criteria 5 (no control loses its focus indicator) and 7 (lint and tests
  green) hold, and were checked.

## Also consulted

Beyond the declared inputs (the queue, its run log, and
`../04_tasks/output/tasks.md`): `git log` for the commit range, and the
working tree's `git status` to confirm it is clean.
