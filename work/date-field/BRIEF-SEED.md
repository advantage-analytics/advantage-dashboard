# Brief seed — date-field

Captured from the conversation on 2026-09-08. The author asked to "find a
better calendar primitive to use", saw three options side by side on a dev
server, and chose option 3.

## The decision

> I like option 3

Option 3 was **react-aria-components**' `DatePicker`: a field made of typed
segments (`mm / dd / yyyy`, arrow keys move between them, digits advance)
plus a calendar button opening a month grid. The alternatives were the native
`<input type="date">` (today's; the OS popup, hidden-picker-icon hacks) and
`react-day-picker` in the product's popover surface (a good grid, no typed
segments).

## What the preview taught us (carry into the brief)

- Ten native date fields exist today: statistics range (from/to), profile
  birthdate, the dual flow's Date cell and the edit flow, the tournament
  builder's Starts/Ends, the match-edit dialog, and the upload wizard's
  date+time cell. All hold `YYYY-MM-DD` strings.
- The design system has no date-picker rule; it does have the rules a picker
  must obey: every dropdown draws from `FloatMenu`'s surface geometry (10px
  radius, 5px inset, `--surface-subtle` wash, Signal Blue is the one colour
  that means "chosen"), underline fields answer focus with their rule going
  2px blue and opt out of the ring, Inter only, Lucide only.
- A calendar grid must NOT live inside `FloatMenu` itself — its `role="menu"`
  wrapper is the wrong ARIA container for a grid. Share the surface classes,
  not the component.
- Third-party stylesheets are unlayered and beat Tailwind utilities (the
  `focus.css` trap). react-aria-components ships no stylesheet, which is one
  reason it fit; every class is ours.
- The preview's styling, which the author saw and liked: 34px underline
  trigger; segments `tabular-nums`, focused segment filled `--blue` with
  white text, placeholders `--ink-400`; calendar button 28px, Lucide
  `calendar` 13px `--ink-400`; popover 10px radius, hairline border, the
  dropdown shadow; month heading 12px/500 with 28px ghost chevrons; weekday
  row 10px uppercase `--ink-400`; 30px cells radius 7, hover
  `--surface-subtle`, outside-month at 0.35, chosen day filled `--blue`
  white text, focus-visible ring `--blue-ring-40`.
- The wizard's date cell also holds a time; the upload wizard is a guardrailed
  surface (`docs/ui-revamp-guardrails.md` §3.1/§4 — dates are not among the
  five fields but the file is).
- Open: whether `min`/`max` (statistics range, the wizard's "not in the
  future") are enforced in the segments, the calendar, or both; and whether
  the trigger prints "Sep 26, 2026" or keeps segments visible at rest.
