# Brief — date-field

One date primitive for the product, replacing every native `<input type="date">`,
built on react-aria-components' `DatePicker`. Refined from `BRIEF-SEED.md` and
one steer given with the stage invocation on 2026-09-08:

> date-field add all over the website like in the upload wizard

Read as: the rollout is product-wide, the upload wizard included, not a
schedule-only change. What "like in the upload wizard" points at is recorded
under Open questions rather than guessed.

## Goal

Every place a person enters a date gets the same field: typed segments
(`mm / dd / yyyy`) that keyboard users can fill without a mouse, plus a
calendar button that opens a month grid drawn in the design system's own
surface. The OS date popup, and the hidden-picker-indicator hacks that today
stretch an invisible native control over a row to open it, go away.

The author chose this over the native input (today) and over react-day-picker
after seeing all three on a dev server. The decision is made; this brief
scopes the work of honouring it.

## Scope

**One primitive**, in `src/components/ui/`, with the underline chrome the
rest of the field family already draws, and a calendar popover that shares
`FloatMenu`'s *surface* (radius, inset, wash, shadow) without being a
`FloatMenu`.

**Ten call sites migrated** — the complete inventory of native date inputs
(verified by grep on 2026-09-08; 10 occurrences in 7 files):

| Surface | File | Fields |
|---|---|---|
| Statistics range | `statistics/match-selector.tsx` | from, to |
| Profile | `settings/profile-form.tsx` | birthdate |
| Add a dual — facts step | `schedule/static/dual-build-step.tsx` | Date (2 occurrences) |
| Add a dual — flow | `schedule/static/new-dual-flow.tsx` | date |
| Tournament builder | `schedule/static/static-tournament-builder.tsx` | Starts, Ends |
| Match edit dialog | `matches/match-actions/edit-match-dialog.tsx` | date |
| Upload wizard — details | `new-match-wizard/DetailsStepContent.tsx` | date (beside the one `type="time"` in the product) |

Every one of these holds a `YYYY-MM-DD` string today. The primitive's value
contract stays a `YYYY-MM-DD` string (or empty/null), so no loader, action or
payload shape changes.

**The styling the author saw and approved** on the preview is the visual
spec for stage 02 to detail, not reinvent: 34px underline trigger; segments
`tabular-nums`, focused segment filled `--blue` with white text, placeholders
`--ink-400`; 28px calendar button with Lucide `calendar` at 13px `--ink-400`;
popover 10px radius, hairline border, the dropdown shadow; month heading
12px/500 with 28px ghost chevrons; weekday row 10px uppercase `--ink-400`;
30px cells radius 7, hover `--surface-subtle`, outside-month at 0.35, chosen
day filled `--blue` with white text, focus-visible ring `--blue-ring-40`.

**A design-system rule.** The DS has no date-picker entry today. The skill
file gains one so the next screen inherits the answer instead of reaching for
the native input.

## Non-goals

- A time picker. The wizard's `type="time"` stays native; this feature only
  replaces the date half of that cell. A time primitive is its own decision.
- Date-range selection as a single control. The statistics range stays two
  fields (from, to); a range-mode calendar is not in scope.
- Changing what any surface *does* with the date — validation rules, default
  values, server actions and the `YYYY-MM-DD` wire format are untouched.
- Retiring `MenuSelect`, `AdvSelect` or any other field primitive. This adds
  one; it does not consolidate the others.
- Locale work beyond what react-aria gives for free. The product is en-US;
  the segment order is `mm / dd / yyyy`.
- Mobile-specific behaviour. The dashboard is desktop-first; the native
  mobile date wheel is lost with the native input, and that is accepted.

## Constraints

- **Library:** react-aria-components (plus its `@internationalized/date`
  peer). Neither is installed yet; this feature adds them. It ships no
  stylesheet, which is why it fits — every class is ours, and nothing
  unlayered arrives to beat Tailwind (the `focus.css` lesson).
- **ARIA:** the calendar grid must not be rendered inside `FloatMenu`, whose
  `role="menu"` wrapper is the wrong container for a grid. Share the surface
  classes, not the component.
- **Focus:** the underline trigger answers focus the way the family does —
  rule goes 2px `--blue` and the control carries `data-focus-ring="none"`.
  Inside the popover, focus is the cell ring; no second indicator anywhere.
- **Design system:** Inter only, Lucide only, Signal Blue is the one colour
  that means "chosen", `--surface-subtle` for hover, the three sanctioned
  motion curves, no bounce. Read `.skills/advantage-analytics-design/SKILL.md`
  before drawing anything.
- **Guardrails:** `DetailsStepContent.tsx` is a guardrailed file
  (`docs/ui-revamp-guardrails.md` §3.1, §4). Dates are not among the five
  vendor-required fields, but the file is under guard: the migration there
  changes the date control and nothing else, and `pipeline-guardrails-reviewer`
  gates it.
- **Wizard keys:** `useWizardKeys` advances on plain Enter unless the target
  is a form control; an open `[aria-expanded="true"]` owns keys. The new
  field's segments and its open popover must both be recognised, or Enter in
  a date segment submits the step.
- **Tests:** `tests/schedule-static-copy.spec.ts` reads `static/*.tsx`
  source; drawn copy changed there is updated in the same diff. Any new
  helper gets a pure-logic spec under `tests/`.
- **Bundle:** the primitive is client-only (`"use client"`) by nature; it must
  not pull react-aria into a Server Component boundary or a page that has no
  date field.

## Success criteria

1. `grep 'type="date"' src` returns nothing; all ten fields render the new
   primitive and still read and write `YYYY-MM-DD`.
2. Each field can be filled entirely from the keyboard: Tab into it, type
   digits, arrows move between segments; and entirely from the mouse: click
   the calendar button, pick a day, the popover closes with the value set.
3. The rendered field matches the approved preview styling (the list under
   Scope) in every one of the seven files, measured on a dev server, not
   assumed.
4. Focus shows exactly one indicator at every step — the 2px blue rule on the
   trigger, the cell ring inside the grid — verified by keyboard walk.
5. In the upload wizard, Enter inside a date segment does not advance the
   step, and the open calendar owns arrow keys; the five guardrailed fields
   are untouched and the guardrails reviewer passes.
6. The design skill carries a date-picker rule naming the primitive.
7. `npm run lint`, `npx tsc --noEmit`, `npm test` green; `npm run map`
   unchanged (no new route).

## Open questions

1. **What "like in the upload wizard" means.** The wizard's date cell is
   native today, so it cannot be the visual reference. Two readings: (a) the
   wizard is simply the surface the author had in mind as one that must be
   covered — already in scope; (b) the wizard's date+time cell layout (date
   and time side by side in one labelled cell) is the composition the other
   surfaces should adopt where a time is present. Nowhere else has a time, so
   (b) collapses to (a) in practice. Assumed (a); confirm or correct.
2. **Bounds.** The statistics range and the wizard's "not in the future" rule
   use `min`/`max` today. Enforce in the segments (react-aria clamps and marks
   invalid), in the calendar (days outside the range disabled), or both? The
   preview did not exercise this.
3. **Resting display.** Segments visible at rest (`09 / 26 / 2026`) or a
   formatted date (`Sep 26, 2026`) that becomes segments on focus? The
   preview showed segments at rest; the author did not object, but did not
   choose either.
4. **Empty state.** The native input shows `mm/dd/yyyy` in the UA's grey.
   Placeholders in `--ink-400` were previewed; confirm that is the empty
   state, and whether a cleared field is `""` or `null` at each call site
   (both exist today).
5. **The wizard's time input.** Left native by this brief. Should stage 02
   at least restyle it to sit level with the new date field in the same cell,
   or leave the cell visually uneven until a time primitive exists?

## Also consulted

- `grep -rn 'type="date"' src` and `grep -rn 'type="time"' src` — to confirm
  the seed's count of ten and the single time input.
- `package.json` — to confirm react-aria-components, `@internationalized/date`,
  react-day-picker and date-fns are all absent today.
- `docs/ui-revamp-guardrails.md` section headings — to cite §3.1 and §4 by
  the right numbers.
