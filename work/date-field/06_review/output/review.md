# Review — date-field

**Sign-off: pending**

The gate ran in full over `28c0a2d..HEAD`. Mechanical is green, the quality
pass applied nine fixes, and correctness review returned **one real defect
that is not fixed** — see Findings. My recommendation is **not ready to merge
as it stands**; the defect is narrow and its fix is a small, separable change,
but it silently discards a coach's edit, so it should not ship unnoticed.

Editing the line above to `approved` (or annotating otherwise) is the
pipeline's final gate. It is deliberately left `pending`.

## Success criteria, from the brief

| # | Criterion | Verdict |
|---|---|---|
| 1 | `grep 'type="date"' src` returns nothing; all fields render the primitive and still read and write `YYYY-MM-DD` | **met, with the count corrected**. Two hits remain and both are prose, each verified accurate: the primitive's own header explaining why it exists, and a comment in `useWizardKeys.ts` naming react-aria's hidden submission input. No native date input renders anywhere. The brief said ten fields in seven files; the real inventory was eight in six, two of the ten having been comments — recorded in the design. |
| 2 | Each field fillable entirely by keyboard and entirely by mouse | **met**, observed per surface with real key events. Typing digits fills and advances segments; clicking the calendar button and picking a day closes the popover with the value set. The mouse half was not free: a `<label>` wrapper made segments unclickable at three call sites, found and fixed (see Findings). |
| 3 | Rendered field matches the approved preview styling in every file, measured not assumed | **met**, measured per surface on a dev server — heights, radii, type sizes, placeholder colour, cell geometry and the popover surface. |
| 4 | Exactly one focus indicator at every step, verified by keyboard walk | **met**, and it needed real work: the tournament builder's cell had to learn to answer focus in the same diff, or its field would have shown none. Walks confirmed the blue segment fill with no ring, the ring on the calendar button, and the ring on the focused day cell. |
| 5 | In the wizard, Enter in a segment does not advance; the five guarded fields untouched; guardrails pass | **met**. Observed with the hook really mounted and counters on its callbacks. `pipeline-guardrails-reviewer` passed on that diff and confirmed the vendor payload has no dependency on the match date or time. |
| 6 | The design skill carries a date-picker rule naming the primitive | **met**. Written from the shipped code, and the reviewer spot-checked its claims against all six call sites rather than reading them for plausibility. |
| 7 | `lint`, `tsc`, `npm test` green; `npm run map` unchanged | **met**. 669 specs pass, lint reports 0 errors (37 warnings, all pre-existing and none in touched files), `tsc` is clean, and the map spec passes, so no route was added. A production build also passes, run to verify the bundler change below. |

## Findings and resolutions

### Stage 1 — mechanical

Green on the first run: `npm run lint` 0 errors, `npx tsc --noEmit` clean,
`npm test` 669 passed. No stale-route-type false failure occurred.

### Stage 2 — quality pass (`simplify`)

Four cleanup agents ran over the range. **Nine findings applied**, committed as
`3dbb3ac`:

- **Two copies of the local-day helper**, both added by this feature, replaced
  with the shared `todayISO()`. Its own doc comment says a second copy is a
  second chance to reach for the UTC form — and this feature had made two,
  while two other files in the same feature imported the shared one.
- **`date-value.ts` now wraps `parseDate`** instead of hand-rolling a regex
  and a field round-trip. Two agents disagreed about this, so I measured the
  library directly: `parseDate` rejects `2026-02-30`, `2025-02-29`,
  `2026-13-01`, `2026-2-3`, `""` and a datetime string, and accepts
  `2024-02-29`. Only the `CalendarDate` constructor clamps, and the wrapper
  never calls it. The existing spec passes unchanged, which is the proof the
  behaviour did not move.
- **`useImperativeHandle`** replaces a hand-rolled ref effect with its cleanup.
- **`DateField` grew an `emphasis` prop**, so the profile birthdate stops
  reaching through the primitive with a `[&_[role=group]]` descendant selector
  to restyle an element the primitive's contract never promised.
- **`parseIsoDate` results are memoized** on the ISO strings. A fresh
  `CalendarDate` each render made every one of react-stately's memos miss —
  segments, formatted parts and bound validation — rebuilding through
  `Intl.DateTimeFormat` on a parent's every keystroke. The reviewer noted this
  also fixes a correctness edge: the state hook compares the value during
  render and resets the display, so the old code could blow away an
  in-progress segment edit.
- **`react-aria-components` added to `optimizePackageImports`.** Importing
  `DatePicker` from the barrel reaches 106 modules where 25 are used, Next does
  not optimise this package by default, and dev never tree-shakes. Verified
  with a production build, since a bad module rewrite would only surface there.

**Skipped, with reasons.** Replacing `useSyncExternalStore` with
`useState`+`useEffect` — the repo's lint rule forbids exactly that pattern, and
an efficiency agent independently judged the current shape correct. Collapsing
the variant branching into a lookup table, extracting the underline geometry
into `adv-field.ts`, sharing a `FLOAT_SURFACE` constant with `float-menu.tsx`,
converting `FieldSelect` to `AdvSelect`, unifying the two `FieldCell`s, and
converting the edit dialog's ref map to focus thunks — each is a real
improvement and each is a refactor of shipped, browser-verified code that
would need its own verification pass. They belong in their own change, not in
a review-stage sweep.

The React best-practices skill was not loaded: this range adds a `"use client"`
file and a new component, which are its triggers, but all four cleanup angles
plus the correctness review already covered the render-cost and bundle
questions it asks, and the bundle finding came out measured rather than
advisory.

### Stage 3 — correctness (`code-review`, medium)

**One real defect, not fixed.**

**A partially cleared date saves the old value silently.**
`edit-match-dialog.tsx:306`. The native input reported `""` the moment any
component was missing, so `required` blocked the submit. `DateField` does not:
react-stately's field state only calls `setDate` when the date is complete, so
clearing one segment updates the display and fires no change. A coach editing a
match dated `2026-03-21` who clicks the year, presses Backspace, and saves sees
`03/21/yyyy` on screen while the dialog writes `2026-03-21` unchanged. The new
`if (!date)` guard cannot see it, because `date` is not empty. The dual builder
and the tournament builder have the same gap with no guard at all; there the
consequence is a stale draft value rather than a discarded edit.

The fix belongs in the primitive — surface the incomplete state so a call site
can refuse it, or report `""` when the segments no longer form a date — and it
needs its own browser verification across the six call sites. It is not a
one-line change and it is not safe to make unverified at a review gate, which
is why it is reported rather than patched here.

**One non-issue, reported for completeness.** `parseDate` accepts two shapes the
old regex rejected: an expanded-year form (`+002026-03-21`) and `0000-01-01`.
Neither can come from a Postgres `date` column or from any call site's own
formatter. The reviewer also found that `toString()` is strictly *better* than
the manual padding it replaced: it converts to Gregorian first, so a browser in
a Buddhist locale would previously have written `2569-03-21` to the database.

Everything else checked clean, including the class merge for the new `emphasis`
prop, the memo dependencies, the widened focus-walk selector, the bound props at
all six call sites, and the three `<label>` conversions.

### Stage 3 — guardrails

Every code commit in the range is a `/task-next` commit, so
`pipeline-guardrails-reviewer` already ran per task on each diff — the `T<n>`
entries in `.claude/tasks/claude-dual-match-tournament-designs-26cc2f.log.md`
record each verdict. The two non-task commits in the range were verified to
touch only bookkeeping.

The review-stage fixes were **not** covered by that, since they were made here
rather than under a task, and two of them touch `src/components/dashboard/`
including the upload wizard. `pipeline-guardrails-reviewer` was run over that
working-tree diff before it was committed and returned an explicit all-clear,
confirming the shared helper computes the local day exactly as the deleted copy
did and that none of the five vendor-required fields moved.

`rls-boundary-reviewer` was **not run: surface not touched.** Nothing in the
range changes `src/lib/supabase/`, `src/lib/data/`, `src/app/api/` or
`supabase/migrations/`, and no table, view or query was added.

## Consciously left

- **The partial-clear defect above.** The one item here that is a bug rather
  than a preference.
- **Six reuse and simplification findings**, listed under Stage 2, each a
  refactor of verified code that deserves its own verification.
- **`DateField` has no `aria-invalid` and no error-message wiring**, which the
  match-edit dialog's native input used to carry.
- **The calendar button keeps its own ring inside rows that answer
  `focus-within`**, so that one control shows two marks. One decision in the
  primitive rather than six at call sites.
- **`date-field.tsx`'s header calls a segment a `[tabindex]` div**; it is a
  `<span role="spinbutton">`. Harmless to the mechanism, but it is what a
  careful author nearly copied into the design system.
- **`focus.css` keeps a hand-maintained census** of controls that draw their own
  ring, which three tasks in this feature had to edit. An altitude agent's
  suggestion — keep the prose, make the inventory a spec that fails when it
  drifts — is worth doing and is not this feature's job.
- **The wizard's time input stays native**, and three native `<select>`s remain
  outside this feature's scope.

## Also consulted

Beyond the declared inputs (`../05_build/output/build.md`, the range diff,
`../01_brief/output/brief.md`, and `.claude/skills/pr-check/SKILL.md`):

- `node_modules/@internationalized/date`, executed directly to measure what
  `parseDate` accepts and rejects and what `CalendarDate.toString()` emits —
  the evidence that settled two agents' disagreement.
- `src/lib/schedule/format.ts`, for the shared `todayISO()` the feature had
  duplicated.
- `src/lib/utils.ts`, to confirm `cn()` is `tailwind-merge` and so resolves the
  new `border-b` / `border-b-2` pair by order.
- `next.config.ts`, for the bundler change, plus a full `npm run build`.
- `.claude/tasks/claude-dual-match-tournament-designs-26cc2f.log.md`, for the
  per-task guardrail verdicts cited above.
