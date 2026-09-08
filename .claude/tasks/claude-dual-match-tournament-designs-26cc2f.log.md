# Run log — claude/dual-match-tournament-designs-26cc2f

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

> The T1–T25 log for this branch was deleted with the add-event-polish
> workspace; it is preserved in git history at `c4f896a`.

## T26 · Add the date libraries and the ISO conversion module — done
- **gate:** mechanical (lint, tsc, npm test) green — 668 specs, 7 of them new; `task-completion-reviewer` VERDICT: pass, all five criteria met and no scope creep. Guardrails skipped, both legitimately: the diff touches `package.json`, `package-lock.json`, `src/lib/ui/` and `tests/` only — no `src/app/dashboard/`, no `src/components/dashboard/`, no upload wizard, so `pipeline-guardrails-reviewer` had no surface; no `src/lib/supabase/`, `src/lib/data/`, `src/app/api/` or `supabase/migrations/` and no new table, view or query, so `rls-boundary-reviewer` had none either.
- **changed:** Added `react-aria-components ^1.21.1` and `@internationalized/date ^3.12.4`; `npm ci` verified from the updated lockfile. New `src/lib/ui/date-value.ts` holds the feature's only two string↔object conversions — `parseIsoDate` and `formatIsoDate` — React-free and with no `"use client"`, so a server-side caller can normalise a date without pulling react-aria into a Server Component. New `tests/date-value.spec.ts` covers round-trip, empty, malformed, the two impossible February dates and a real leap day.
- **follow-ups:**
  1. `src/lib/ui/date-format.ts` already does display-side formatting. Once the component lands, check the two are not growing overlapping parsers — a shared ISO regex may be the right consolidation.
  2. `npm audit` reports 3 moderate advisories. They pre-date this install; neither new package added one.

## T27 · Build the `DateField` primitive — done
- **gate:** mechanical (lint, tsc, 668 specs) green with the preview route gone; `task-completion-reviewer` VERDICT: pass, all six criteria met and scope exactly the one declared file. The reviewer independently confirmed the two token substitutions were grounded — `--radius-input` and `--ease-out` exist nowhere in `src/styles/design-system/`, so `rounded-[6px]` and `--ease-out-expo` are corrections, not inventions. Guardrails skipped, both legitimately: the diff is one new file under `src/components/ui/`, which is neither `src/app/dashboard/`, `src/components/dashboard/` nor the upload wizard, so `pipeline-guardrails-reviewer` had no surface — T32 carries the wizard and will face it — and nothing under `src/lib/supabase/`, `src/lib/data/`, `src/app/api/` or `supabase/migrations/` changed, so `rls-boundary-reviewer` had none.
- **changed:** New `src/components/ui/date-field.tsx`: the product's date primitive on react-aria's `DatePicker`, taking and emitting `YYYY-MM-DD` strings only through T26's converters. Three chromes — `underline` (34px, the family's height), `bare` (the parent row owns the rule), `boxed` (30px) — plus `min`/`max`, `disabled`, `required` and a `handleRef` exposing `focus()` for the match-edit dialog's focus-first-invalid map. The only focus code is `data-focus-ring="none"` on each segment, earned by the blue fill being a real on-focus change; the calendar button and day cells inherit `focus.css` untouched. The calendar popover wears `FloatMenu`'s surface by value and says in the header why it cannot import it: `role="menu"` will not hold a grid. Verified on a dev server through a throwaway route that was deleted before the gate.
- **follow-ups:**
  1. `validationBehavior="aria"` was needed: react-aria's native default only reports a bound violation on form submit, so a typed out-of-range date never set `data-invalid` without it. Measured, not assumed.
  2. The design document names `--radius-input` and `--ease-out`, neither of which exists. Worth correcting there, or adding the aliases, so the next reader does not chase them.
  3. T31's `FieldCell` focus pairing and T32's `spinbutton` case in `isFormControl` are both still outstanding and both already written into their task blocks — verified here only against a stand-in wrapper.
