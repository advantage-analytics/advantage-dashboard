# Tasks — claude/dual-match-tournament-designs-26cc2f

> Scope: the Add-an-Event dual/tournament flow and the shared field primitives it drew out — currently the `date-field` feature (`work/date-field/`).

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

> Numbering starts at T26: this branch's first queue (T1–T25, the
> add-event-polish drain) was deleted by that feature's stage 07 and lives in
> git history at `c4f896a`. Ids are never reused.

## T26 · Add the date libraries and the ISO conversion module
- **status:** done
- **model:** opus
- **files:** `package.json`, `package-lock.json`, `src/lib/ui/date-value.ts` (new), `tests/date-value.spec.ts` (new)
- **done when:**
  - [ ] `react-aria-components` and `@internationalized/date` appear in `package.json` dependencies and `npm ci` succeeds from the lockfile
  - [ ] `src/lib/ui/date-value.ts` exports `parseIsoDate(value: string): CalendarDate | null` and `formatIsoDate(value: CalendarDate | null): string`, contains no `"use client"` and imports no React
  - [ ] `parseIsoDate` returns `null` — never throws — for `""`, for a string not matching `YYYY-MM-DD`, and for `2026-02-30` and `2025-02-29`; it returns a date for `2024-02-29`
  - [ ] `formatIsoDate` round-trips every value `parseIsoDate` accepts, zero-padding month and day to two digits, and returns `""` for `null`
  - [ ] `tests/date-value.spec.ts` covers each case above and `npm test`, `npx tsc --noEmit` and `npm run lint` are green
- **notes:** Plan step 1. The module is deliberately React-free so a server-side caller can normalise a date string without pulling react-aria into a Server Component.

## T27 · Build the `DateField` primitive
- **status:** done
- **model:** fable
- **needs:** T26
- **files:** `src/components/ui/date-field.tsx` (new)
- **done when:**
  - [ ] `DateField` renders react-aria's `DatePicker`/`DateInput`/`DateSegment`/`Popover`/`Dialog`/`Calendar`, takes and emits `YYYY-MM-DD` strings only (never a `CalendarDate`), and accepts `variant` (`underline` | `bare` | `boxed`), `min`, `max`, `disabled`, `required`, `label`, `className` and an optional `handleRef` exposing `{ focus() }` that focuses the first segment
  - [ ] Every `DateSegment` carries `data-focus-ring="none"`; the calendar button and the day cells carry no focus class at all, and the file contains no other focus styling
  - [ ] The calendar popover is not rendered inside `FloatMenu`: it wears the surface by value (`rounded-[10px]`, hairline border, white, `p-[10px]`, `shadow-[var(--shadow-dropdown)]`) and the file's header says why it agrees with `FloatMenu` rather than importing it
  - [ ] All three variants, empty and filled, match the approved preview spec listed in `work/date-field/02_design/output/design.md`, verified on a dev server through a throwaway route outside `/dashboard`
  - [ ] A keyboard walk of the control shows exactly one focus indicator at every stop (blue segment fill with no ring, ring on the calendar button, ring on the focused day cell), typing `09262026` yields `2026-09-26`, and picking a day by mouse closes the popover with the value set
  - [ ] The throwaway preview route is deleted and `npm test`, `npx tsc --noEmit` and `npm run lint` are green with it gone
- **notes:** Plan step 2. The segment opt-out is earned by the blue fill being a real on-focus change, not by the field looking like an underline — see `focus.css` and the design skill's "underline opt-out". `tests/generate-map.spec.ts` fails on any route not in `MAP.md`, which is why the preview route must go before the gate.

## T28 · Migrate the statistics from/to dates
- **status:** done
- **model:** sonnet
- **needs:** T27
- **files:** `src/components/dashboard/statistics/match-selector.tsx`
- **done when:**
  - [ ] Both date inputs are `DateField variant="boxed"`; no `type="date"` remains in the file
  - [ ] The `→` between them and the "N matches in range" count still render, and filtering still narrows the list on the same `YYYY-MM-DD` values
  - [ ] `max` on *from* is the current *to* value and `min` on *to* is the current *from* value, so an inverted range cannot be picked
  - [ ] Verified on a dev server: a range set by keyboard and a range set from the calendar both update the match count, console clean
- **notes:** Plan step 3. The mutual bounds are a behaviour addition — the native inputs allowed an inverted range. It is flagged in the design's open questions; if review struck it, drop those two props and change nothing else.

## T29 · Migrate the profile birthdate
- **status:** blocked
- **model:** sonnet
- **needs:** T27
- **files:** `src/components/dashboard/settings/profile-form.tsx`
- **done when:**
  - [ ] `ProfileField` renders `DateField variant="underline"` for its `date` branch instead of `SettingsUnderlineInput`; no `type="date"` remains in the file
  - [ ] `max` is today, so a future birthdate cannot be picked
  - [ ] The `missing` marker still appears for an empty birthdate and the field still draws the 2px blue emphasis rule in that state
  - [ ] Verified on a dev server at `/dashboard/settings/profile`: empty shows `mm / dd / yyyy` in `--ink-400`, typing a date clears the marker, and Save persists the same `YYYY-MM-DD` the field showed; console clean
- **notes:** Plan step 4. `mono` stops being meaningful on this branch — segments are `tabular-nums` already — so don't forward it; the prop stays for the other fields.

## T30 · Migrate the dual facts Date cell
- **status:** blocked
- **model:** opus
- **needs:** T27
- **files:** `src/components/dashboard/schedule/static/dual-build-step.tsx`
- **done when:**
  - [ ] The Date cell renders `DateField variant="bare"` inside `FieldCell`; no `type="date"` and none of the `-webkit-calendar-picker-indicator` / `-webkit-clear-button` / `-webkit-inner-spin-button` classes remain in the file
  - [ ] `FieldCell`'s `glyph` prop, its render branch and any now-unused `Calendar` import are deleted — the primitive draws the only calendar in the row
  - [ ] The `DualFactsStep` doc comment describing the native input and the stretched picker-indicator trick is rewritten to describe `DateField`
  - [ ] Verified on a dev server in the dual flow's facts step: one calendar glyph, the picker opens from it, the row's rule goes 2px blue on focus with no ring stacked on it, and Continue stays disabled until the date is set
  - [ ] `npm test` green, including `tests/schedule-static-copy.spec.ts`
- **notes:** Plan step 5. This task is the last caller of `FieldCell`'s `glyph`, so the prop dies here rather than lingering with no callers.

## T31 · Migrate the tournament builder's Starts and Ends
- **status:** done
- **model:** opus
- **needs:** T27
- **files:** `src/components/dashboard/schedule/static/static-tournament-builder.tsx`
- **done when:**
  - [ ] Both dates render `DateField variant="bare"` inside this file's `FieldCell`; no `type="date"` remains in the file
  - [ ] `min` on Ends is the Starts value, so Ends cannot precede Starts
  - [ ] This file's `FieldCell` rule answers focus (`focus-within:border-[var(--blue)]`, matching the dual builder's), so the field shows exactly one indicator rather than none
  - [ ] The title field is untouched and keeps its own ring
  - [ ] Verified on a dev server: both dates typeable and pickable, and a keyboard walk shows the cell rule changing on focus with nothing stacked on it; `npm test` green
- **notes:** Plan step 6. The focus pairing is not optional: this cell's hairline never changed, which is why its inputs kept the neutral ring today. Swapping in a control whose segments opt out without teaching the cell to answer focus takes the field from one indicator to zero.

## T32 · Migrate the upload wizard's date cell
- **status:** done
- **model:** fable
- **needs:** T27
- **files:** `src/components/dashboard/matches/new-match-wizard/DetailsStepContent.tsx`, `src/components/dashboard/matches/new-match-wizard/useWizardKeys.ts`, `tests/wizard-keys-form-control.spec.ts`
- **done when:**
  - [ ] `DateCell` renders `DateField variant="underline"` and the native time input side by side in one labelled cell; the Radix popover that wrapped them is gone and no `type="date"` remains in the file
  - [ ] `max` on the date is still today's date, and the time input is restyled to the same 34px height and 13px `tabular-nums` type so the cell reads level
  - [ ] `isFormControl` treats `role="spinbutton"` as a form control, with the reason in a comment and a case added to `tests/wizard-keys-form-control.spec.ts`
  - [ ] Verified on a dev server in the details step: Enter inside a date segment does not advance the step, Enter with focus elsewhere still does, Escape with the calendar open closes the calendar without popping the step, and ⌘/Ctrl+Enter still walks fields
  - [ ] The five vendor-required fields of `docs/ui-revamp-guardrails.md` §3.1 are untouched and `pipeline-guardrails-reviewer` passes on the diff
- **notes:** Plan step 7. The popover goes because nesting react-aria's popover inside Radix's would stack two focus scopes and two dismiss layers on one control. Guardrails §3.5 marks the wizard's step *presentation* explicitly safe to redesign. Check whether `formatDateRead` still has callers afterwards; delete it only if it does not.

## T33 · Migrate the match-edit dialog's date
- **status:** done
- **model:** opus
- **needs:** T27
- **files:** `src/components/dashboard/matches/match-actions/edit-match-dialog.tsx`
- **done when:**
  - [ ] The date renders `DateField variant="bare"` inside the existing `UnderlineField`, which keeps supplying the rule and the error colour; no `type="date"` remains in the file
  - [ ] `dateRef` is a `DateFieldHandle` and the focus-first-invalid map's type accepts both it and the input refs beside it
  - [ ] Submitting with the date cleared still shows the field error, draws the rule red at 2px, and moves focus to the date field
  - [ ] Verified on a dev server: changing the date by keyboard and from the calendar both save the same `YYYY-MM-DD`; console clean
- **notes:** Plan step 8. `UnderlineField` already draws the 2px-on-focus rule for children that opt out of the ring, so the primitive draws no rule of its own here — that is what `variant="bare"` is for.

## T34 · Write the design system's date-field rule
- **status:** todo
- **model:** opus
- **needs:** T28, T29, T30, T31, T32, T33
- **files:** `.skills/advantage-analytics-design/SKILL.md`
- **done when:**
  - [ ] A **Date field** entry exists under Component Patterns stating that every date is `DateField` and that no native `<input type="date">` belongs in product UI, with the reason attached — the same register as the existing "No native `<select>`" rule
  - [ ] It names the three variants and which shipped surfaces use each, and states that segments opt out of the focus ring because their fill is the on-focus change while the calendar button and day cells keep theirs
  - [ ] It states that the calendar popover shares `FloatMenu`'s surface by value and must never be rendered inside `FloatMenu`, whose `role="menu"` cannot contain a grid
  - [ ] The focus section's `data-focus-ring="none"` call-site table gains the segment row
  - [ ] Every claim in the new section is true of the shipped component as built, checked against the code rather than against the design document; `npm test` green
- **notes:** Plan step 9. Runs last on purpose: it documents what shipped, not what was planned.
