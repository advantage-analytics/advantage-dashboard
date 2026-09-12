# Component Patterns

> Part of the Advantage Analytics design system. Read
> `.skills/advantage-analytics-design/SKILL.md` first — it carries the Banned
> list, the precedence rule and the routing table into this directory.

### Card

```
bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)]
```

With header:

```
// Header row
flex items-center justify-between h-14 px-5
// Header label
text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]
```

### Section Label

```
text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]
```

### Action button — the variant set

`advButton()` in [`src/lib/ui/adv-button.ts`](../../../src/lib/ui/adv-button.ts) is
the transcription. Use it; do not hand-roll a near-miss.

| Variant        | Rest                                        | Hover                 |
| -------------- | ------------------------------------------- | --------------------- |
| `primary`      | Signal Blue fill, white label, CTA glow     | `--blue-hover`        |
| `outline`      | card surface, `--border-field`, `--ink-700` | **surface wash only** |
| `ghost`        | transparent, `--border-field`, `--ink-700`  | **surface wash only** |
| `danger`       | transparent, danger-tinted border and label | danger tint fill      |
| `danger-solid` | danger fill, white label                    | `--danger-hover`      |

Sizes sm/md/lg = 32/36/44px. Press is `scale(0.97)`, suppressed under reduced
motion. Focus is `--focus-ring`. One primary per surface — a dialog carries one,
never two.

`secondary` is not a variant — a design doc that writes `variant="secondary"`
means `outline`. **(v3)** A page header carries at most one primary; its
companion is `ghost`, never `outline` (on the white page an outline's box
reads as a second card, and its fill says nothing). Task footers use a text-only secondary. `pill`
switches to the 10px uppercase chip form below — filters and "Recommended"
tags, never a CTA.

> **Hover on a secondary button is a wash, never blue.** `outline` and `ghost`
> both shipped turning their border and label blue on hover, which made every
> secondary control read as a second primary sitting beside the real one. Blue
> is the single accent and should stay under ~10% of a screen; spending it on a
> hover state is exactly the leak that rule exists to prevent. The same
> correction applies to `SettingsButton`'s outline variant and to any
> hand-rolled bordered button — grep for `hover:border-[var(--blue` before
> adding one.
>
> The same principle governs elsewhere: nav active state is a neutral wash, not
> blue; people-state chips are grey, never blue — with one sanctioned exception,
> the **`You` pill**, see **Settings Pages › Person row in a card**
> (`reference/settings.md`).

### Button (Primary, CTA)

```
text-[13px] font-medium
rounded-[6px] h-9 px-4
bg-[#3B82F6] hover:bg-[#2563EB] text-white
transition-colors duration-200
shadow-[0_1px_3px_rgba(57,134,243,0.25)]
```

### Button (Primary, Small)

```
text-[10px] font-medium uppercase tracking-[1.5px]
rounded-full px-3 py-1.5
bg-[#3B82F6] hover:bg-[#2563EB] text-white
transition-colors duration-200 shadow-none
```

### Button (Ghost, pill)

The uppercase pill form, for filters and tags — not a standard CTA.

```
text-[10px] font-medium uppercase tracking-[1.5px]
rounded-full px-3 py-1.5
border border-[#EAECF0] text-[#525252]
hover:bg-[#F5F5F5] transition-colors duration-200
```

### Button (Secondary / outline)

```
text-[13px] font-medium
rounded-[6px] h-9 px-4
bg-[var(--surface-card)] border border-[var(--border-field)] text-[var(--ink-700)]
hover:bg-[var(--surface-subtle)]
transition-colors duration-200
```

### Chrome Icon Button

Square icon-only buttons used for header, modal, and popover chrome — sidebar toggle, search trigger, profile menu, modal/popover back, modal/popover close. Always `rounded-lg` (radius-element); never `rounded-full` (per the radius-pill rule, full-round is reserved for non-button pills, avatars, dots, and indicators).

**Sizes**

- `h-7 w-7` (28×28) — modal chrome (back arrow, close X)
- `h-8 w-8` (32×32) — dashboard header chrome (sidebar toggle, profile, search trigger when expanded)

**Pattern (modal chrome — paired back/close in top bar)**

```
h-7 w-7 rounded-lg flex items-center justify-center
text-[#888888] hover:text-[#0D0D0D] hover:bg-[#F5F5F5]
transition-colors duration-200
```

**Pattern (dashboard header chrome — slightly cooler greys + press feedback)**

```
h-8 w-8 rounded-lg flex items-center justify-center
text-[#8A8A8E] hover:text-[#3C3C43] hover:bg-[#F5F5F5]
active:scale-[0.97]
transition-colors duration-150
```

Neither pattern carries a focus class, deliberately. `focus.css` already rings a
`<button>` in blue, and a `focus-visible:ring-*` utility here would be silently
discarded rather than applied — see **Focus** (`reference/focus.md`).

**Icon**: `size-3.5` (14px) at `strokeWidth={1.5}` for h-7 buttons; `h-[15px] w-[15px]` for h-8 buttons. Always Lucide.

**Pairing rule**: when a back/close pair appears in modal chrome, both buttons must share size, shape, hover, and focus treatment. Mixing a labeled chip with an icon circle is forbidden — the eye reads them as unrelated controls.

**Close (X) buttons**: Any dismissible surface that renders an explicit close affordance — modals, popovers with form fields or multi-step content, side panels — MUST use the `h-7 w-7` modal-chrome pattern above with a Lucide `X` icon at `size-3.5` `strokeWidth={1.5}`. Do not invent variants per surface; the X on a popover must be visually identical to the X on a modal. Popovers that only contain a single quick action or readout (tooltip-style) should continue to rely on click-outside dismissal — no X needed there.

### List Item (Hoverable Row)

```
hover:bg-[#FAFAFA] active:scale-[0.998]
transition-[background-color,transform] duration-200 ease-out
```

### Stat Display

```
// Label
text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2.5px]
// Value
text-[13px] font-light text-[#0D0D0D] tabular-nums
```

### Outcome Mark (`ResultMark`) — the one register

`circle-check` / `circle-x` / `circle-minus` at 14px stroke 1.5, in
`--success` / `--danger` / `--ink-500`, with "Won" / "Lost" / "Level" carried
as the accessible name. `src/components/dashboard/result-mark.tsx`.

**There is one outcome register and this is it** — under a labelled Result
header or in a headerless dense row alike. The system used to run two, the
word (`Badge`) under a labelled column and the glyph without one; see Data
Table rule 2 for why that split was retired and what it cost.

The mark takes **no alignment of its own** — it inherits its cell's, exactly as
`EmptyMark` does, because a Result column shows the glyph on a decided row and
the em dash on an undecided one and the two must sit on the same x. Never
centred. Never a bare W/L letter (standings shorthand; it does not translate).
The result cell takes **no container**: the tinted banner was built, evaluated
and rejected (**Data Table rule 2**, `reference/tables.md`), and that
rejection stands for the glyph too.

`Badge` (`src/components/ui/badge.tsx`) survives only as a non-outcome label —
`<Badge variant="blue">Pro</Badge>`. Its `win` and `loss` variants are gone
**from the type**, so a future `variant="win"` does not compile. Green and red
do not belong in it at all; they are reserved for winning and losing, which it
no longer says.

### Form Ticks (`FormPills`)

**(v3)** The last five results as bars, not lettered squares: 2.5×12px, 3px
gap, 1px radius, oldest left, `--viz-good` / `--viz-bad`. Shipped as
`FormTicks` in `shared/form-ticks.tsx` (the roster table and the player profile's line history both draw it); pair with a muted summary ("5–2 last
7") where there is room. The pre-v3 treatment — a 20px `rounded-[3px]` square
with a 9px semibold letter on the 15% tint — is retired.

### Activity Indicator Line

```
w-px h-10 rounded-full shrink-0
// Win: bg-[#5DB955]
// Loss: bg-[#E51837]
// Milestone: bg-[#3B82F6]
// System: bg-[#AAAAAA]
```

### Circular Progress Ring

```tsx
// SVG circle, radius = 46, strokeWidth = 8
// Background: stroke-[#D9D9D9]
// Progress: stroke-[#3B82F6], animated strokeDashoffset
```

### Data Tooltip

Tooltips over visualizations (court dots, heatmap cells, serve zones) use a consistent floating box — no caret/arrow. This is the chart-hover box only: every icon-only _control_ answers hover with the dark `Tooltip` (Navigation → Dark Tooltip), never this one.

**Ratified 2026-09-07 (design owner), supersedes the white box below for chart marks:** a hovered chart mark — a bar segment, a heatmap or mosaic cell, a sparkline point — opens the **dark readout** the report page's chart cards draw (`matches/match-detail/chart-tooltip.tsx`: `--ink-900`, 12px radius, `--shadow-dropdown`, `px-3 py-2.5`, a 12px white medium title over 11px lines at 64% white; export `DARK_READOUT_CLASS` / `DARK_READOUT_STYLE` for a box that positions itself). _Shipped:_ Team Home's court record, the KPI detail chart. _Still white, to be brought in line:_ the court-dot and radar tooltips on match detail. The white box below remains the spec for a popover that carries controls or a legend, not for a hover readout.

```
bg-white border border-[#F3F3F3] rounded-xl
shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)]
py-2.5 px-3
// No caret. The interaction highlight (ring, hover scale) anchors the tooltip.
// Fixed width per context: w-[168px] (compact), w-[200px] (standard), w-[230px] (wide)
```

When used with Radix `<TooltipContent>`, override defaults with `!` utilities:

```
!bg-white !rounded-xl !px-0 !py-0 !border !border-[#F3F3F3]
!shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] !text-left !w-auto
// Apply padding inside inner wrapper, not on TooltipContent
```

### Keyboard Shortcut Chip (`Kbd`)

`ui/kbd.tsx` is the only keyboard chip in the product. It is a **keycap, not
a code tag**: `--surface-raised` fill, 1px `--ink-200` border, and a 1px
bottom shadow (`--shadow-keycap`) so it reads as a key you could press. Two
fixed sizes, and nothing else:

| Size           | Geometry                                               | Where                                                     |
| -------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| `sm`           | 16px tall, min-width 16, `px-1`, 10px text, radius 3   | inside a sentence — a mode banner, an inline hint         |
| `md` (default) | 24px tall, min-width 24, `px-1.5`, 11px text, radius 5 | a shortcut table or legend, where the chip is the content |

Always a semantic `<kbd>`, `aria-hidden="true"` where an `aria-label` already
says the shortcut. `inline-flex`, so a chip sits on the text baseline beside
the words around it. Combos are separate adjacent chips with a 4px gap
(`⌘` `K`), never one chip containing both — the gap is what makes them read
as two keys.

_This retires the earlier flat recipe_ (`bg-[#F0F0F0]`, no border, no shadow,
auto-height, small-caps for lowercase word keys), along with the argument
that fixed heights make `esc` sit low. The keycap centres its legend in a
fixed box and needs no variant trick, and the flat chip had no call sites
left when this was written — `src/` carries `Kbd` alone. Do not reintroduce
a second chip: a keyboard hint that looks like inline code reads as a value
to type rather than a key to press.

**A keyboard path is stated once, where the mode is stated** — in the mode
banner (`Notice` → mode register), never as a hint repeated on every row it
applies to. Sentence and chips share one line: "Drag a row, or focus one and
press `space` then `↑` `↓`".

**Inline (in body copy)** — for "or press ⌘S" style hints where a chip would
be too heavy, no background:

```
text-[#525252] font-medium
```

**Symbol conventions**

- macOS modifiers: `⌘` (⌘), `⌥` (⌥), `⌃` (⌃), `⇧` (⇧). Concatenate without a `+` (`⌘K`, not `⌘+K`).
- Windows/Linux modifiers: spell out and join with `+` (`Ctrl+S`, `Alt+K`).
- **Letter keys in modifier combos stay UPPERCASE** (`⌘U`, `⌘K`, `⌘S`, `Ctrl+S`). They read as a hotkey, not a label.
- **Standalone word-named keys are lowercase** (`esc`, `enter`, `tab`, `space`). They read as a label, not a glyph.
- **Arrow keys are glyphs, never words** (`↑`, `↓`, `←`, `→`).
- Punctuation keys render as-is (`/`, `?`).
- Detect platform via `navigator.userAgentData?.platform ?? navigator.platform` and gate render behind `if (isMac !== null)` to avoid SSR mismatches.

### Date field (`DateField`)

**Every date is `DateField`** (`ui/date-field.tsx`), and **no native
`<input type="date">` belongs in product UI.** The native control draws the
browser's picker rather than ours, and its resting text cannot be typed into
segment by segment. `DateField` is built on react-aria's `DatePicker`, which
owns the segment keyboard model, the month arithmetic and the grid's ARIA; the
file owns the chrome. The wire format is the product's, not the library's: a
`YYYY-MM-DD` string in and a `YYYY-MM-DD` string out, `""` for empty, and
`min`/`max` in the same shape. A rendered page does still contain one
`input type="date"` — react-aria's visually-hidden, `tabindex="-1"` input for
form submission. That one is the library's; finding it is not licence to write
another.

**Three variants, each matching what its call sites already drew** so no
surface changed shape when it landed:

| Variant               | Chrome                                                                                                                                                   | Shipped on                                                                                                                                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `underline` (default) | 34px, the caption's hairline beneath, 2px `--blue` on focus and for as long as the calendar is open — the same field as `MenuSelect variant="underline"` | the profile page's date of birth (`settings/profile-form.tsx`), the upload wizard's date-and-time cell (`matches/new-match-wizard/DetailsStepContent.tsx`)                                                                                                                                          |
| `bare`                | no rule and no height of its own                                                                                                                         | the dual builder's Date cell and the tournament builder's Starts/Ends, each inside a `FieldCell` row (`schedule/static/dual-build-step.tsx`, `schedule/static/static-tournament-builder.tsx`); the match-edit dialog's Date inside `UnderlineField` (`matches/match-actions/edit-match-dialog.tsx`) |
| `boxed`               | 30px, radius 6, `--border-field` on `--surface-field`, 12px text                                                                                         | the statistics match selector's From/To date filter (`statistics/match-selector.tsx`)                                                                                                                                                                                                               |

On `underline` and `boxed`, error owns the colour and focus owns the weight:
the rule goes red on `data-invalid` and stays red while focused.

`bare` is a contract with the row above it. **The parent owns the rule and the
height, and the parent answers focus** — 2px blue on `focus-within`, which
every shipped `bare` row draws (`FieldCell` in both schedule builders,
`UnderlineField` in the match-edit dialog). Keep the pair: the segments opt out
of the ring whatever the row does, so a `bare` field dropped into a row that
does not change on focus leaves the field itself unmarked, with only the live
segment's fill inside it.

**The segments opt out of the focus ring; the buttons keep theirs.** Every
`DateSegment` carries `data-focus-ring="none"`, earned the way Focus → "the
underline opt-out" requires: the focused segment fills Signal Blue with white
text off react-aria's `data-focused` — a real on-focus change, not a standing
colour, and already the mark that says which segment is live. The calendar
trigger is a plain `<button>` whose appearance does not change on focus, and a
day cell is a `[role="button"]` with a roving tabindex; both keep the ring the
system gives them, and the file writes no focus class of its own.

**Never wrap a `DateField` in a `<label>`.** A `DateSegment` renders as a
tabbable `role="spinbutton"` span — not a labelable element — while the
calendar trigger is a real `<button>`. A wrapping `<label>` therefore forwards
every click on a segment to that button, and the segments become unreachable
by mouse with nothing looking broken on screen. `DateField` takes its own
`label` prop and sets it as `aria-label`, so the accessible name survives
dropping the wrapper. Three shipped rows had to stop being one — `FieldCell`
in both schedule builders, `SettingsField` in settings (a `labelless` branch,
since its other fields are still inputs) — and where that `<label>` was also
naming a sibling control, the sibling takes an `aria-label` of its own, or it
ships unnamed with, again, nothing visibly wrong.

**The calendar popover is not a `FloatMenu`, and must never be rendered inside
one.** It agrees with `ui/float-menu.tsx` by value — `rounded-[10px]`, the
hairline border, white, `--shadow-dropdown` — so a date picker and a select on
the same page read as one family. It does not import it, because `FloatMenu`
wraps its children in `role="menu"` and a menu cannot contain a grid: the
calendar would be an ARIA error that no reviewer sees on screen. The classes
are duplicated on purpose; keep them in step if either moves. The popover
portals to `document.body`, and a Radix `Dialog` puts `pointer-events: none`
there for as long as it is open — so the popover carries `pointer-events-auto`.
Without it every day cell inside a dialog was mouse-dead while looking
perfectly normal. Measured, not assumed.

Validation is ARIA-only. `validationBehavior="aria"` marks the group
`data-invalid` the moment a typed date falls outside `min`/`max`, rather than
waiting for a form submit; the value is still reported upward, so the call site
stays the authority on whether it may be submitted. `handleRef`
(`DateFieldHandle`) focuses the first segment, which is how a dialog sends
focus here as its first invalid field — a segment, not an input, so an
`HTMLInputElement` ref will not do.

---
