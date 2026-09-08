# Design — date-field

One `DateField` primitive on react-aria-components, replacing every native
`<input type="date">` in the product.

## A correction to the brief's inventory

The brief counts "ten native date fields in seven files". Two of those ten
grep hits are prose, not code — `dual-build-step.tsx:858` and
`new-dual-flow.tsx:55` are doc comments that mention `<input type="date">`.
The real inventory is **eight fields in six files**:

| # | Surface | File | Field | Chrome today | Notes |
|---|---|---|---|---|---|
| 1–2 | Statistics filter | `statistics/match-selector.tsx:101,109` | from, to | boxed: `bg-[#F7F7F7]`, 1px border, `rounded-lg`, 12px | side by side with a `→` |
| 3 | Profile | `settings/profile-form.tsx:219` | birthdate | `SettingsUnderlineInput` via `ProfileField type="date" mono` | 34px underline, already opts out of the ring |
| 4 | Add a dual — facts | `schedule/static/dual-build-step.tsx:892` | Date | bare input inside `FieldCell` (the row draws the rule) | carries the stretched invisible picker-indicator hack |
| 5–6 | Tournament builder | `schedule/static/static-tournament-builder.tsx:551,559` | Starts, Ends | bare input inside that file's own `FieldCell` | keeps the neutral ring today (its rule never changes) |
| 7 | Upload wizard — details | `new-match-wizard/DetailsStepContent.tsx:435` | date | boxed input **inside a Radix popover** beside the one `type="time"` | `max` = today |
| 8 | Match edit dialog | `matches/match-actions/edit-match-dialog.tsx:571` | date | bare input inside `UnderlineField` | `required`; `dateRef` is in the focus-first-invalid map |

Both prose mentions get corrected in the same diff as their file's migration.
Success criterion 1 (`grep 'type="date"' src` returns nothing) still holds
exactly as written — it just means eight edits and two comment rewrites.

## Approaches considered

### A — One primitive with chrome variants, react-aria inside (recommended)

`src/components/ui/date-field.tsx` exports `DateField`, wrapping react-aria's
`DatePicker` + `DateInput`/`DateSegment` + `Popover`/`Dialog`/`Calendar`. Its
public contract is the product's, not the library's: a `YYYY-MM-DD` string in,
a `YYYY-MM-DD` string out, plus `variant` for the three chromes that already
exist in the six files.

*For:* one place where segments, the popover surface, focus and bounds are
decided — the same shape `MenuSelect` has for selects, and the reason the DS
can gain a single rule. Call sites shrink to five or six lines each. The
library's ARIA, keyboard model and month arithmetic are not ours to maintain.

*Against:* two new dependencies (`react-aria-components`, and its peer
`@internationalized/date`), and a wrapper that must translate between an ISO
string and `CalendarDate` at every boundary.

### B — Compose react-aria at each call site

Import `DatePicker` and friends directly in each of the six files, styling
per site.

*For:* no abstraction to design; each site keeps exactly the chrome it has.

*Against:* six copies of the segment styling, the popover surface, the
string↔`CalendarDate` conversion and the focus opt-outs. This is precisely
the state the selects were in before `MenuSelect` (six near-identical
wrappers), and the DS rule would have nothing to name. Rejected.

### C — Hand-roll segments and a calendar over Radix Popover

No new dependency: build `role="spinbutton"` segments and a month grid on the
`Popover` primitive already in `ui/`.

*For:* zero dependencies; total control; no risk of a third-party stylesheet
(react-aria ships none, so that risk is already nil).

*Against:* the segment keyboard model (digit accumulation, overflow to the
next segment, arrow stepping, backspace, locale order) and calendar grid ARIA
(`role="grid"`, roving tabindex, month boundaries, `aria-activedescendant`)
are a large surface to write and to keep correct, and the author already chose
react-aria over the alternatives after seeing all three rendered. Rejected as
re-litigating a settled decision.

**Recommendation: A.**

## Chosen design

### Architecture

Three new files, one changed hook, six changed call sites, one skill entry.

```
src/lib/ui/date-value.ts        pure: ISO string ↔ CalendarDate, no React
src/components/ui/date-field.tsx  "use client" — the primitive
tests/date-value.spec.ts        pure-logic spec for the conversions
```

`date-value.ts` holds the only two functions that know the wire format:

```ts
export function parseIsoDate(value: string): CalendarDate | null
export function formatIsoDate(value: CalendarDate | null): string
```

`parseIsoDate` returns `null` for `""`, for a malformed string, and for a
real-looking-but-invalid date (`2026-02-30`) — a stored bad value must render
an empty field, never throw inside a render. `formatIsoDate(null)` returns
`""`. Both are pure and get the spec; every string↔object conversion in the
product goes through them.

Keeping them out of the component matters for one concrete reason: the
component is `"use client"` and pulls react-aria, and a server-side caller
that only needs to normalise a date string must not.

### The component

```tsx
export type DateFieldHandle = { focus: () => void };

export function DateField({
  label,            // accessible name; the visible eyebrow sits outside
  value,            // "YYYY-MM-DD" | ""
  onChange,         // (next: "YYYY-MM-DD" | "") => void
  variant = "underline",   // "underline" | "bare" | "boxed"
  min, max,         // "YYYY-MM-DD", optional
  disabled, required,
  className,
  handleRef,        // optional DateFieldHandle for focus-first-invalid
}): JSX.Element
```

**The three chromes**, each matching what the call sites already draw so no
surface changes shape:

| variant | Drawn | Used by |
|---|---|---|
| `underline` | 34px row, `border-b border-[var(--border-field)]`, `focus-within:border-b-2 focus-within:border-[var(--blue)]` — the underline family's one height, identical to `MenuSelect variant="underline"` and `SettingsUnderlineInput` | profile birthdate, the wizard cell |
| `bare` | no rule, no height of its own; the parent row (`FieldCell`, `UnderlineField`) owns both | dual facts Date, tournament Starts/Ends, match-edit dialog |
| `boxed` | `h-[30px] rounded-[var(--radius-input)] border border-[var(--border-field)] bg-[var(--surface-field)] px-2.5 text-[12px]` | statistics from/to |

Internally every variant renders the same three parts: the segment group, the
calendar button, and the popover.

**Segments.** `<DateInput>` renders `<DateSegment>` per part; each is a
`<div role="spinbutton" tabindex="0">`. Styling is the approved preview's:
`tabular-nums`, 13px (12px in `boxed`), `px-[2px] rounded-[3px]`, placeholder
`--ink-400`, and the focused segment filled `--blue` with white text.

> **The focus trap this design exists to avoid.** A segment is a
> `[tabindex]:not([tabindex="-1"])`, so `focus.css` gives it `--focus-ring` —
> a blue 2px box around a two-character segment, *on top of* the blue fill
> that already says which segment is live. Every segment therefore carries
> `data-focus-ring="none"`. That opt-out is earned exactly the way the skill
> requires: the fill is a real on-focus change (`data-[focused]` from
> react-aria), not a standing colour.

The calendar button keeps its ring — it is a plain `<button>` whose
appearance does not change on focus, so removing it would take it from one
indicator to zero. Calendar day cells are `role="gridcell"` with a roving
tabindex, so they take `--focus-ring` too, which is `0 0 0 2px
var(--blue-ring-40)` — exactly the ring the preview drew. **We write no focus
class anywhere in this component**, only the two `data-focus-ring="none"`
attributes.

**The popover is not a `FloatMenu`.** It is react-aria's `<Popover><Dialog>`
holding `<Calendar>`, wearing the surface *by value*: `rounded-[10px]`,
`border-[var(--border-hairline)]`, `bg-white`, `p-[10px]`,
`shadow-[var(--shadow-dropdown)]`. `FloatMenu` wraps its children in
`role="menu"`, which cannot contain a grid; sharing the component would be an
ARIA error that no reviewer sees on screen. The classes are duplicated
deliberately, and the component's header says so, naming `FloatMenu` as the
thing it agrees with and why it does not import it.

Calendar internals, all from the approved preview: month heading 12px/500
with 28px ghost chevrons (Lucide `chevron-left`/`chevron-right` at 14px);
weekday row 10px uppercase `--ink-400`; 30px cells at `rounded-[7px]`, hover
`--surface-subtle`, outside-month at `opacity-[0.35]`, selected filled
`--blue` with white text; today marked with a 3px `--blue` dot under the
numeral when it is not the selected day. Motion: the popover fades and lifts
2px over `--duration-hover` on `--ease-out` — the sanctioned curve, no
bounce, and nothing animates inside the grid.

**Bounds** (brief Q2, resolved: **both, from one prop**). `min`/`max` pass
straight to `DatePicker`'s `minValue`/`maxValue`. react-aria then does both
halves for free: days outside the range render `data-disabled` in the
calendar, and an out-of-range typed value sets `data-invalid` on the group.
`data-invalid` draws the rule `--error` at the same 2px weight — the pattern
`UnderlineField` already uses, where error owns the colour and focus owns the
weight.

**Resting display** (brief Q3, resolved: **segments**). The field shows
`09 / 26 / 2026` at rest, not `Sep 26, 2026`. Two reasons beyond "it is what
the author saw": a formatted string that becomes segments on focus is a
layout shift on every focus, and segments at rest are what tell a keyboard
user they can type here at all.

**Empty state** (brief Q4, resolved). Empty renders the placeholder segments
`mm / dd / yyyy` in `--ink-400`, and the primitive's empty value is always
`""` — never `null`, never `undefined`. Call sites that store `null` convert
at their own boundary, which is where that difference already lives.

**Imperative focus.** `handleRef` receives `{ focus() }`, which focuses the
first segment. This exists for exactly one caller: the match-edit dialog's
focus-first-invalid map, which is typed `RefObject<HTMLInputElement>` today
and gets a small union so a `DateField` can sit in it. No other call site
passes it.

### Call-site migrations

Each is a swap of the input for the primitive; none changes what the surface
stores, validates or submits.

1. **Statistics from/to** — `variant="boxed"`, `max` on `from` is the `to`
   value and `min` on `to` is the `from` value, which the native inputs never
   enforced. That is a behaviour *addition*; it is one prop, it makes an
   impossible range unpickable rather than silently empty, and it is called
   out here so review can reject it if unwanted.
2. **Profile birthdate** — `ProfileField` grows a `date` branch rendering
   `DateField variant="underline"` in place of `SettingsUnderlineInput`.
   `max` is today: a birthdate in the future is not a date anyone has.
3. **Dual facts Date** — `variant="bare"` inside the existing `FieldCell
   glyph="calendar"`. The stretched invisible picker-indicator hack and the
   webkit pseudo-element classes go; the cell's drawn calendar glyph becomes
   the primitive's own calendar button, so the row keeps exactly one glyph
   and it is now the thing that opens the picker rather than a decoration
   sitting beside an invisible one. `FieldCell`'s `glyph` prop loses its only
   caller and is deleted with it.
4. **Tournament Starts/Ends** — `variant="bare"` inside that file's
   `FieldCell`. `min` on Ends is the Starts value. That file's `FieldCell`
   draws a hairline that never changes and therefore keeps its ring today;
   after this change the cell holds a control whose *segments* opt out, so
   the cell must gain `focus-within:border-[var(--blue)]` on its rule, matching
   the dual builder's. Without that pairing the field would drop to zero
   indicators — the exact failure `focus.css` exists to prevent.
5. **Upload wizard date** — see below.
6. **Match edit dialog** — `variant="bare"` inside `UnderlineField`, which
   already supplies the 2px-on-focus rule and the error colour. `dateRef`
   becomes a `DateFieldHandle`.

### The upload wizard, specifically

`DateCell` today is a Radix `Popover`: the cell reads back
`formatDateRead(date, time)`, and clicking it opens a small panel holding a
native date input and a native time input.

Putting a `DateField` inside that panel would nest react-aria's popover
inside Radix's — two focus scopes, two dismiss layers, and the outer one
modal. That is the kind of interaction that works in a screenshot and fails
on the second Escape.

**The popover goes.** The cell renders the `DateField` (`variant="underline"`)
and the time input side by side, in one labelled cell — the composition the
brief's Q1 reading (b) described, arrived at because it is the only clean
answer here rather than because it was requested. This removes a click from
the wizard's most-used step and is `docs/ui-revamp-guardrails.md` §3.5
territory: the wizard's step *presentation* is explicitly safe to redesign, and
none of §3.1's five vendor-required fields is touched. `formatDateRead` loses
this caller; it stays if anything else calls it and goes if not.

**The time input stays native** (brief Q5, resolved: restyle, don't replace).
It gets the same 34px height and 13px `tabular-nums` type as the date field
beside it so the cell reads level. A time primitive is a separate decision.

**`useWizardKeys` needs one line.** `isFormControl` tests for `INPUT`,
`TEXTAREA`, `SELECT`, `contentEditable`, `role="combobox"` and
`aria-haspopup`. A date segment is a `<div role="spinbutton">` and matches
none of them, so Enter typed inside a date segment would advance the wizard
step. The fix is `node.getAttribute("role") === "spinbutton"`, alongside the
existing `combobox` test, with a spec beside the existing
`tests/wizard-keys-form-control.spec.ts`. The open calendar is already
covered: react-aria sets `aria-expanded="true"` on the trigger, which the
capture-phase handler already checks.

### Data flow

```
call site state ("YYYY-MM-DD" | "")
        │  value
        ▼
   DateField ── parseIsoDate ──► CalendarDate | null ──► DatePicker
        ▲                                                    │
        │  onChange("YYYY-MM-DD" | "")                        │ onChange(CalendarDate | null)
        └────────────── formatIsoDate ◄───────────────────────┘
```

Nothing downstream changes: no loader, no server action, no payload, no
column. The dual draft still carries `date: string`, the wizard still submits
the same ISO string, `createDual` and `recordResult` are untouched.

The one shape worth stating: `DatePicker` is controlled here, and a `null`
from it (the field cleared) becomes `""`, never a dropped update. A call site
that treats `""` as "no date" keeps working; the dual flow's Continue gate,
which is disabled on an empty date, keeps working for the same reason.

### Error handling

- **Bad stored value.** `parseIsoDate` returns `null` rather than throwing, so
  a malformed row renders an empty field and the user can fix it. A throw
  inside render would take down the whole dialog.
- **Out-of-range typed value.** react-aria marks the group `data-invalid`; the
  rule goes red at 2px and the value is still reported upward, so the call
  site's own validation (the edit dialog's `fieldErrors`, the wizard's step
  gate) stays the authority on whether it may be submitted. The primitive
  never silently rewrites what someone typed.
- **Cleared required field.** `required` sets `aria-required`; refusing the
  submit stays the call site's job, unchanged.
- **No date library at runtime on the server.** Both new packages are
  client-only here. `date-field.tsx` is `"use client"` and no Server Component
  imports it.

### Testing

| What | How |
|---|---|
| `parseIsoDate` / `formatIsoDate` | `tests/date-value.spec.ts` — round-trip, `""`, malformed, `2026-02-30`, leap day, year boundaries |
| `isFormControl` on a spinbutton | added case in `tests/wizard-keys-form-control.spec.ts` |
| Drawn copy in `static/*.tsx` | `tests/schedule-static-copy.spec.ts` reads source; the dual and tournament migrations change no drawn copy, but if a label moves the assertion moves in the same diff |
| The eight fields render and round-trip | dev server, one pass per surface: type a date by keyboard, pick one by mouse, confirm the stored value and that focus shows exactly one indicator at each step |
| Guardrails | `pipeline-guardrails-reviewer` on the wizard diff |
| Gates | `npm run lint`, `npx tsc --noEmit`, `npm test`; `npm run map` unchanged (no route added) |

Bundle: react-aria-components is tree-shaken per import, and only the six
files that render a date pull it. Nothing goes in `serverExternalPackages` —
that list is for packages that must not reach a client bundle, which is the
opposite of this one.

### The design-system entry

`.skills/advantage-analytics-design/SKILL.md` gains a **Date field** section
under Component Patterns, stating: every date is `DateField`; no native
`<input type="date">` in product UI; the three variants and where each is
used; that segments opt out of the ring and the calendar button does not; and
that the calendar popover shares `FloatMenu`'s surface by value and must never
be rendered inside `FloatMenu` itself. Same register as "No native `<select>`
in product UI" — a rule with the reason attached.

## Open questions

1. **The statistics range gains mutual bounds** (`from ≤ to`), which the
   native inputs never enforced. Called out under call site 1; drop the two
   props if that is unwanted.
2. **`formatDateRead`'s fate** in the wizard. It loses the `DateCell` caller;
   whether it survives depends on other callers, which the build step will
   check rather than the design guessing.
3. **Mobile.** Losing the native input loses the OS date wheel on a phone.
   The brief accepts this ("desktop-first"); recorded here because it is the
   one user-visible regression in the feature and nothing later re-asks it.

## Also consulted

Beyond the declared inputs (`brief.md`, `MAP.md`,
`docs/ui-revamp-guardrails.md`, `.skills/advantage-analytics-design/SKILL.md`):

- `grep -rn 'type="date"' src` — corrected the inventory from ten to eight.
- The six call-site files listed in the inventory table, to record the chrome
  each draws today and what wraps it.
- `src/components/ui/float-menu.tsx` and
  `src/components/dashboard/matches/new-match-wizard/styles.ts` — for the
  popover surface values the calendar agrees with by value.
- `src/components/dashboard/settings/settings-card.tsx`
  (`SettingsUnderlineInput`) — the 34px underline geometry the `underline`
  variant matches.
- `src/components/ui/menu-select.tsx` — the trigger height and focus
  treatment the family shares.
- `src/components/dashboard/matches/new-match-wizard/useWizardKeys.ts` — to
  find the `isFormControl` gap a spinbutton falls through.
- `package.json` and `npm view` — React 19.1.0; `react-aria-components@1.21.1`
  and `@internationalized/date@3.12.4` are the current published versions.
