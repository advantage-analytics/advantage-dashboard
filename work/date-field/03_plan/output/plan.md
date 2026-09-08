# Plan — date-field

Nine steps. Each is one surface, sized for a fresh subagent that has read only
the brief, the design and the files its own step names.

Steps 1 and 2 build the primitive; 3–8 migrate one call site each; 9 writes
the rule. Everything after step 2 depends on step 2 and on nothing else, so
3–8 could run in any order — but they must not run *concurrently*, because
several of them will want the same dev server and because step 5 deletes a
prop (`FieldCell`'s `glyph`) that step 4 is the last caller of. Run them in
the written order.

---

## Step 1 — The conversion module and its spec

**Files**
- `package.json`, `package-lock.json` — add `react-aria-components` and
  `@internationalized/date`
- `src/lib/ui/date-value.ts` (new)
- `tests/date-value.spec.ts` (new)

**Change**
Install the two dependencies (`npm install react-aria-components
@internationalized/date`), then write the pure module the design specifies:
`parseIsoDate(value: string): CalendarDate | null` and
`formatIsoDate(value: CalendarDate | null): string`. No React, no
`"use client"`, no component import — a server-side caller must be able to
normalise a date string without pulling react-aria.

`parseIsoDate` returns `null` for `""`, for anything not matching
`YYYY-MM-DD`, and for a well-formed-but-impossible date (`2026-02-30`,
`2025-02-29`). It never throws: a bad stored value must render an empty field,
not take down the dialog around it. `formatIsoDate(null)` returns `""` and
always pads to two digits.

**Verification**
`tests/date-value.spec.ts` covers: round-trip of a normal date; `""` both
ways; a malformed string; `2026-02-30` and `2025-02-29` rejected; `2024-02-29`
accepted; single-digit month and day formatting back to `09` / `06`. Then
`npx tsc --noEmit` and `npm test`.

**Depends on** nothing.

---

## Step 2 — The `DateField` primitive

**Files**
- `src/components/ui/date-field.tsx` (new)

**Change**
The component exactly as the design specifies: `"use client"`, wrapping
react-aria's `DatePicker` / `DateInput` / `DateSegment` / `Popover` /
`Dialog` / `Calendar`. Public contract is `YYYY-MM-DD` strings in and out —
never a `CalendarDate` — with `variant` (`underline` | `bare` | `boxed`),
`min`, `max`, `disabled`, `required`, `label`, `className` and the optional
`handleRef: DateFieldHandle`.

Three things this step must get right, because every later step inherits them:

1. **Every `DateSegment` carries `data-focus-ring="none"`.** A segment is a
   `[tabindex]` div, so `focus.css` would ring it blue on top of the blue fill
   that already marks it. The fill is the on-focus change that earns the
   opt-out. The calendar button keeps its ring; day cells keep theirs.
2. **The popover is not a `FloatMenu`.** It wears the surface by value —
   `rounded-[10px]`, hairline border, white, `p-[10px]`,
   `shadow-[var(--shadow-dropdown)]` — because `FloatMenu` wraps children in
   `role="menu"`, which cannot hold a grid. The component header says this and
   names `FloatMenu` as the thing it agrees with and does not import.
3. **Write no focus class.** The two opt-out attributes are the only focus
   code in the file.

Visual spec is the approved preview, listed in the design: 34px underline
row; segments `tabular-nums` 13px (12px boxed), `px-[2px] rounded-[3px]`,
placeholder `--ink-400`, focused segment filled `--blue` with white text;
28px calendar button with Lucide `calendar` at 13px `--ink-400`; month
heading 12px/500 with 28px ghost chevrons; weekday row 10px uppercase
`--ink-400`; 30px cells `rounded-[7px]`, hover `--surface-subtle`,
outside-month `opacity-[0.35]`, selected filled `--blue` with white text,
today a 3px `--blue` dot when it is not selected. Popover fades and lifts 2px
over `--duration-hover` on `--ease-out`; nothing animates inside the grid.

**Verification**
No call site exists yet, so this step verifies on a **throwaway preview
route** — `src/app/dev-preview/date-field/page.tsx`, deliberately outside
`/dashboard` so it needs no session — rendering all three variants empty,
filled, disabled, and one with `min`/`max`. Drive it on a dev server:

- keyboard: Tab in, type `09262026`, confirm the segments fill and advance and
  the value reads `2026-09-26`; arrows step; Backspace clears
- mouse: click the calendar button, pick a day, confirm the popover closes
  with the value set
- focus: walk the whole control and confirm **exactly one** indicator at every
  stop — blue fill on the segment with no ring, ring on the calendar button,
  ring on the focused day cell
- console clean, no hydration warning

**Then delete the preview route before finishing the step.**
`tests/generate-map.spec.ts` regenerates `MAP.md` and fails if it differs, so
an unlisted route left behind is a red suite. Confirm with `npm test` after
deleting.

**Depends on** step 1.

---

## Step 3 — Statistics from/to

**Files**
- `src/components/dashboard/statistics/match-selector.tsx`

**Change**
Replace the two boxed native inputs with `DateField variant="boxed"`, keeping
the `→` between them and the "N matches in range" count beside them. Add the
mutual bounds the design calls out: `max` on *from* is the *to* value, `min`
on *to* is the *from* value. That is a behaviour addition — the native inputs
allowed an inverted range — and it is flagged in the design's open questions,
so if review has struck it, drop the two props and change nothing else.

**Verification**
Dev server on the statistics page: set a range by keyboard and by calendar,
confirm the match count updates as before and that an inverted range cannot be
picked. Console clean.

**Depends on** step 2.

---

## Step 4 — Profile birthdate

**Files**
- `src/components/dashboard/settings/profile-form.tsx`

**Change**
`ProfileField` grows a `date` branch that renders `DateField
variant="underline"` inside the existing `SettingsField` instead of
`SettingsUnderlineInput`. `max` is today — a birthdate in the future is not a
date anyone has. The `mono` prop that the birthdate call passes stops being
meaningful for this branch (segments are `tabular-nums` already); leave the
prop for the other fields and just don't forward it here.

The `missing` marker and its emphasis rule must still work: an empty birthdate
still counts toward the strip above and still draws the 2px blue rule.

**Verification**
Dev server on `/dashboard/settings/profile`: empty field shows `mm / dd /
yyyy` in grey and the Missing marker; typing a date clears the marker; Save
persists the same `YYYY-MM-DD` the field showed. Console clean.

**Depends on** step 2.

---

## Step 5 — Dual facts Date

**Files**
- `src/components/dashboard/schedule/static/dual-build-step.tsx`

**Change**
Replace the native input with `DateField variant="bare"` inside the existing
`FieldCell`. Delete the whole webkit picker-indicator apparatus: the
stretched-invisible-indicator classes, the hidden clear button, the hidden
spin button.

`FieldCell`'s `glyph="calendar"` loses its only reason to exist — the
primitive draws its own calendar button, and two calendars in one row is one
too many. Remove the `glyph` prop and its `BOX`/render branch entirely, and
the `Calendar` import if nothing else in the file uses it.

Correct the file's doc comment at the top of `DualFactsStep` (around line 858),
which describes the native input and the picker-indicator trick as the design.
It should now describe `DateField`.

**Verification**
Dev server on the Add-an-Event dual flow, facts step: the row shows one
calendar glyph, clicking anywhere sensible opens the picker, the row's rule
goes 2px blue on focus and there is no ring stacked on it. Continue stays
disabled while the date is empty and enables when it is set — that gate reads
the same string it always did. Console clean.
Run `npm test` — `tests/schedule-static-copy.spec.ts` reads this file's
source; no drawn copy changes here, but confirm rather than assume.

**Depends on** step 2.

---

## Step 6 — Tournament builder Starts and Ends

**Files**
- `src/components/dashboard/schedule/static/static-tournament-builder.tsx`

**Change**
Replace both native inputs with `DateField variant="bare"` inside that file's
own `FieldCell`. `min` on Ends is the Starts value.

**This file's `FieldCell` must gain a focus rule in the same diff.** Its
hairline never changes today, which is exactly why its inputs keep the neutral
ring. After the swap the control inside it is a `DateField` whose segments opt
out of the ring, so without `focus-within:border-[var(--blue)]` on the cell's
rule the field would show **zero** focus indicators. Pair them, matching the
dual builder's cell.

Leave the title field alone. It sits under a standing 2px blue rule that never
changes and keeps its own ring; it is not part of this feature.

**Verification**
Dev server on the tournament builder: both dates typeable and pickable, Ends
cannot precede Starts, and a keyboard walk shows the cell rule answering focus
with nothing stacked on it. Console clean. `npm test` for the copy spec.

**Depends on** step 2.

---

## Step 7 — Upload wizard date cell

**Files**
- `src/components/dashboard/matches/new-match-wizard/DetailsStepContent.tsx`
- `src/components/dashboard/matches/new-match-wizard/useWizardKeys.ts`
- `tests/wizard-keys-form-control.spec.ts`

**Change**
Two things, and this is the step that most wants its own context.

**The popover goes.** `DateCell` renders `DateField variant="underline"` and
the native time input side by side in one labelled cell, instead of a
read-back button that opens a Radix popover holding both. Nesting react-aria's
popover inside Radix's would put two focus scopes and two dismiss layers on
one control. `max` on the date stays today's date, as the native input had it.
The time input stays native and is restyled to the same 34px height and 13px
`tabular-nums` type so the cell reads level.

Check whether `formatDateRead` still has callers after this; delete it if not,
leave it if so.

**`useWizardKeys.isFormControl` gains one test.** A date segment is a `<div
role="spinbutton">` and matches none of the existing branches, so Enter typed
inside a segment would advance the wizard step. Add
`node.getAttribute("role") === "spinbutton"` beside the `combobox` test, with
the reason in a comment, and a case in
`tests/wizard-keys-form-control.spec.ts`. The open calendar is already covered
— react-aria sets `aria-expanded="true"` and the capture-phase handler checks
for it.

**Guardrails.** This file is under `docs/ui-revamp-guardrails.md` §3.1. None of
the five vendor-required fields is touched; §3.5 marks the wizard's step
*presentation* explicitly safe to redesign. Say so in the commit, and let
`pipeline-guardrails-reviewer` gate the diff.

**Verification**
Dev server in the upload wizard's details step: date and time both editable in
place; Enter inside a date segment does **not** advance the step; Enter on the
step with focus elsewhere still does; Escape with the calendar open closes the
calendar and does not pop the step; ⌘/Ctrl+Enter still walks fields. The five
guardrailed fields still collect. Console clean. `npm test`.

**Depends on** step 2.

---

## Step 8 — Match edit dialog date

**Files**
- `src/components/dashboard/matches/match-actions/edit-match-dialog.tsx`

**Change**
Replace the native input with `DateField variant="bare"` inside the existing
`UnderlineField`, which already supplies the 2px-on-focus rule and the error
colour — so the primitive draws no rule of its own here.

`dateRef` is in the focus-first-invalid map, typed `RefObject<HTMLInputElement>`.
It becomes a `DateFieldHandle` (`{ focus() }`), and the map's type widens to
accept both shapes. Confirm that submitting with an empty date still focuses
the date field.

**Verification**
Dev server: open the dialog on a match, change the date by keyboard and by
calendar, save, confirm the stored value. Clear the date and submit: the
error appears, the rule goes red at 2px, and focus lands on the date field.
Console clean.

**Depends on** step 2.

---

## Step 9 — The design-system rule

**Files**
- `.skills/advantage-analytics-design/SKILL.md`

**Change**
Add a **Date field** entry under Component Patterns, in the same register as
"No native `<select>` in product UI" — a rule with its reason attached. It
states: every date is `DateField`; no native `<input type="date">` in product
UI; the three variants and which surfaces use each; that segments opt out of
the ring because their fill is the on-focus change, while the calendar button
and day cells keep theirs; and that the calendar popover shares `FloatMenu`'s
surface **by value** and must never be rendered inside `FloatMenu`, whose
`role="menu"` cannot contain a grid.

If the file's focus section lists the `data-focus-ring="none"` call sites in a
table, add the segment row to it.

**Verification**
Read the section back against the shipped component and confirm every claim is
true of the code as built, not of the design as written. `npm test`.

**Depends on** steps 2–8 (it documents what shipped).

---

## Test strategy

**The gates, run at the end of every step:** `npx tsc --noEmit`, `npm run
lint`, `npm test`. `npm test` is Playwright but nearly every spec is pure
logic over library code — no browser, no server — so it is fast and a step
that makes it slow has done something wrong.

**Two new pure specs**, both in the repo's existing style:
`tests/date-value.spec.ts` for the conversions (step 1), and a spinbutton case
added to `tests/wizard-keys-form-control.spec.ts` (step 7). Nothing else in
this feature has logic worth a unit test — the rest is chrome, and chrome is
verified by looking at it.

**`tests/schedule-static-copy.spec.ts` reads `static/*.tsx` source.** Steps 5
and 6 touch files it watches. Neither should change drawn copy; if one does,
its assertion moves in the same diff, retiring the old string per that file's
convention.

**`tests/generate-map.spec.ts` regenerates `MAP.md` and fails on any
difference.** Step 2's throwaway preview route must be deleted before that
step finishes, and `npm test` must be green with it gone. This is the single
most likely way this feature leaves a red suite behind.

**Visual verification is per-step and on a dev server**, never inferred from
the diff. Each migration step names what to look at; the recurring question at
every one of them is the focus walk, because the failure this feature can most
easily introduce — a field with no visible focus at all — is invisible unless
someone navigates by keyboard. Steps 6 and 7 are where it is most likely: step
6 because the cell's rule has to be taught to answer focus, step 7 because the
wizard's Enter handling changes underneath a new control.

**Guardrails review** runs on step 7's diff
(`pipeline-guardrails-reviewer`). No step touches Supabase, a migration, an
API route or a data loader, so `rls-boundary-reviewer` has no surface here.

**Order.** 1 → 2 → (3, 4, 5, 6, 7, 8 in that order) → 9. Steps 3–8 are
independent of each other in code, but run them serially: they share a dev
server, and running them concurrently in separate worktrees would put two
agents in `MAP.md` and `package-lock.json` at once for no gain.
