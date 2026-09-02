# Review — input-fields-dropdowns-consistency

Sign-off: pending

*Edit that line to `approved` — or annotate it — to clear the pipeline's final
gate. Stage 07 will not land a workspace whose sign-off still reads pending.*

Gate: `/pr-check` over the branch range, per
`.claude/skills/pr-check/SKILL.md`. Receipt recorded at `2557c8e`,
verdict **ready**.

## What was reviewed

Working tree was clean, so the target is the branch range against the
integration branch — not "the current diff", which would have found nothing
and reported green over the whole branch.

```
base = fd13c75 (merge-base with splitstep-integration)
```

Thirteen commits. The net **source** diff is three files, because the two
hand-made geometry commits cancel each other out exactly:

| File | Change |
|---|---|
| `src/lib/ui/adv-field.ts` | new, 112 lines — the field helper |
| `src/components/claim/claim-shell.tsx` | `CLAIM_FIELD` delegates to it |
| `src/components/claim/program-search.tsx` | search box calls it |

Everything else in the range is the pipeline workspace and the branch queue.

**The range is not all task-gated.** Two hand-made commits and the pipeline's
own commits are in it, so the guardrail reviewers could not be reported as
covered per-task and had to be considered fail-closed. They are still skipped
below, but for the other reason — the surfaces genuinely are not touched.

## Success criteria, one by one

From `../01_brief/output/brief.md`. The brief was written for an app-wide
scope; the author narrowed the build to nine pages after stage 04, so four
criteria are out of reach **by decision, not by failure**. Marked accordingly.

| # | Criterion | Verdict |
|---|---|---|
| 1 | Every boxed field at the DS radius, clean grep | **Met, in scope.** The nine pages read one constant, measured live at 6px / 36px. Out of scope: the deferred surfaces still carry `rounded-lg` and `rounded-[8px]`. |
| 2 | Underline family aligned | **Not attempted** — T11–T14 deferred. |
| 3 | The three primitives agree | **Not attempted** — T2 deferred; its partial work is stashed at `11b918a4`. |
| 4 | Opened select panels match the Dropdown spec | **Not attempted** — the `SelectContent` change lived in T2. |
| 5 | No control loses its focus indicator | **Met, and verified empirically** — see below. |
| 6 | The wizard's guarded inputs unchanged | **Met, trivially** — no guarded file was opened. |
| 7 | `npm run lint` and `npm test` pass | **Met** — 0 lint errors, `tsc` clean, 301 tests pass. |

Criterion 5 was the one worth proving rather than asserting, because `T3`
dropped `outline-none` from `CLAIM_FIELD` on the theory that `focus.css`
already covers it. Tested in a real browser on the running app, with a real
mouse click and a real Tab keypress rather than a programmatic `.focus()`:

- clicked input → `:focus-visible` matches, `outline-style: none`, box-shadow
  is the neutral field ring
- tabbed to button → `:focus-visible` matches, blue actionable ring

No browser default outline leaks in either case. The theory holds.

## Findings and resolutions

### Stage 1 — mechanical

All three green on the first run. No `.next/` type staleness needed clearing.
The 37 lint warnings are pre-existing and none names a file in this range.

### Stage 2 — quality (`/simplify`)

Four agents ran in parallel. **One finding, fixed.** Two agents converged on
it independently and a third dissented, which is worth recording because the
dissent was reasonable.

**Fixed — `program-search.tsx` copied the helper instead of calling it**
(commit `2557c8e`). The wrapper restated `advField("boxed")`'s four token
values by hand. The altitude agent's argument was empirical rather than
theoretical: the geometry moved three times on this branch, and each move
required this file and `adv-field.ts` to be edited in lockstep, kept in sync
by nothing but the author noticing. That is precisely the drift the helper
exists to prevent, reproduced inside the commit that introduced it.

**The dissent, overruled deliberately.** The reuse agent argued that calling
the helper on a `<div>` is a misuse, because `placeholder:` and `disabled:`
utilities can never match on a non-control. That is true and it is inert: no
runtime cost, no visual effect. Two copies that drift silently cost more than
a few dead utility classes. Rendering was confirmed identical after the
change — 36px, 6px, same border, same flex layout, focus ring intact.

Not flagged, judged and left: the `sm` size tier has no consumer yet, and the
`size` parameter is accepted but ignored for the `underline` kind. Both agents
that raised these called them low-stakes; removing either would churn the API
that the twelve deferred tasks already reference.

**`vercel-react-best-practices` skipped** — none of its three triggers fire.
No `"use client"` was added in the range, no new `.tsx` component file
appeared, and no data fetching changed. The new module is a plain `.ts` file
of class strings.

### Stage 3 — correctness (`code-review medium`)

**No findings.** Four candidate risks were checked and each was cleared with
evidence rather than reasoning:

1. **`text-[var(--ink-900)]` is an ambiguous arbitrary value** — Tailwind
   cannot infer from `var(--ink-900)` alone whether it is a colour or a
   length. Measured on the running page: resolves to `rgb(13, 13, 13)`, the
   token's value, with `font-size` still 13px. Correctly classified.
2. **The class string's internal order changed** — `text-[var(--ink-900)]`
   now precedes `text-[13px]`, where before it followed. `cn()` is
   tailwind-merge, which resolves same-group conflicts by position, so a
   mis-grouping would silently drop one of them. Ran both the old and new
   strings through the project's own `tailwind-merge` with the real call from
   `onboarding-flow.tsx`: identical outcomes, font size kept, the
   placeholder-state colour correctly winning over the base ink.
3. **`disabled:bg-[var(--surface-subtle)]` is new** to `CLAIM_FIELD`. Checked
   every consumer: no control carrying `CLAIM_FIELD` is ever disabled, so the
   rule is inert today rather than a silent visual change.
4. **The wrapper now inherits `text-*` to its children.** Every child — the
   search icon, the input, the spinner — sets its own colour explicitly, so
   nothing inherits. Confirmed visually.

### Stage 3 — project reviewers

Both skipped, for **surface not touched** — a different reason from covered
per-task, and the honest one here. The net diff lives in
`src/components/claim/` and `src/lib/ui/`:

- **`pipeline-guardrails-reviewer`** — nothing under `src/app/dashboard/`,
  `src/components/dashboard/`, or the upload wizard changed.
- **`rls-boundary-reviewer`** — nothing under `src/lib/supabase/`,
  `src/lib/data/`, `src/app/api/` or `supabase/migrations/` changed, and no
  table, view or query appeared.
- **`supabase:supabase-postgres-best-practices`** — no SQL in the range.

Both reviewers *did* run per-task on T1, T3 and T4 during the build and
reported clear each time; see the `T<n>` entries in the branch run log.

## Consciously left

1. **Twelve deferred tasks.** T2 and T5–T15 are `later`, not cancelled. They
   describe real, measured drift in dashboard settings, statistics, the match
   wizard, the roster and the shared primitives — the statistics match
   selector is the worst at 10px. Promoting any to `todo` by hand makes it
   eligible again.
2. **T2's partial work is stashed**, not committed and not discarded:
   `git stash apply 11b918a461f21591336a6ca93f54fd3ca15c7872`. It never passed
   a gate and should be re-gated, not trusted.
3. **The design system's Border Radius table is wrong for this codebase.**
   `radius-element → rounded-lg` and `radius-dropdown → rounded-xl` are
   stock-Tailwind mappings; the `@theme inline` block in `globals.css` makes
   them render 10px and 14px here. This is the root cause of the whole
   feature and it is still unfixed in the docs. `adv-field.ts`'s header
   records the trap, but the design system itself still misleads.
4. **`focus.css:48` and `SKILL.md:1109` cite two files that do not exist** —
   `schedule/lineup-editor.tsx` and `schedule/field-row.tsx`. The second is
   the load-bearing counter-example for when *not* to suppress a focus ring,
   so that rule now has no live illustration.
5. **Radix `SelectTrigger` focuses blue while native fields focus neutral.**
   A known, documented split in `focus.css`, deliberately deferred. One
   consumer today.
6. **The `sm` field tier is unused**, and `size` is inert for the `underline`
   kind. Both are documented in the helper's header.

Items 3 and 4 are documentation defects in the design system rather than
field styling, and per the branch-scope-discipline rule they belong on their
own branch. They are cheap and worth filing.

## Also consulted

Beyond the declared inputs (`build.md`, the range diff, `brief.md`,
`pr-check/SKILL.md`): `src/lib/ui/adv-field.ts`, `adv-button.ts`,
`src/components/claim/claim-shell.tsx`, `program-search.tsx`,
`src/lib/utils.ts` (to confirm `cn()` is tailwind-merge),
`src/styles/design-system/focus.css`, `src/app/onboarding/onboarding-flow.tsx`
and the other five `CLAIM_FIELD` consumers (to check for a disabled control
and for the `cn()` call site), `.claude/hooks/pr-check-receipt.sh`, and the
running app at `http://localhost:3000` for the live measurements above.
