# Brief — input-fields-dropdowns-consistency

Seed (verbatim): *"make sure that the input fields and input dropdown menus are
consistent with look especially rounding and sizing"*

## Goal

Every text input, select-style dropdown and textarea in the app should look like
the same family of control: one corner radius, one height (per size tier, if
tiers exist), one text size, one border and padding rhythm. Today they don't.
The shared primitives disagree with each other, and most screens don't use the
primitives at all — they hand-roll the control and pick their own radius and
height.

What "consistent" is measured against: the design system
(`.skills/advantage-analytics-design/SKILL.md`), which already prescribes
`radius-input` = `rounded-[6px]` for form inputs, selects and textareas, matching
the button radius. Consistency means converging on that, not picking whichever
variant is most common today.

## Scope

Form-input controls and the dropdown surfaces that belong to them, across every
user-facing surface of the app:

- **Boxed fields** — bordered text inputs, native `<select>`s, Radix `Select`
  triggers, textareas. This is the bulk of the drift.
- **Underline fields** — the design system's second sanctioned vocabulary
  (dialogs and settings; the seven components in the Focus → "underline
  opt-out" table). These stay underline, but must be consistent *among
  themselves*: same rule weight, height, text size, focus thickening.
- **Opened dropdown panels** that belong to a select-style control — Radix
  `SelectContent`, custom float menus such as `EntitySelect` — so the panel
  radius/padding/row height matches the design system's Dropdown/Menu spec
  (container 12px, rows 8px) rather than each control's own guess.
- **The shared primitives** in `src/components/ui/` (`input.tsx`, `select.tsx`,
  `textarea.tsx`), which currently render at 8px radius (shadcn's `rounded-md`
  via `--radius: 0.625rem` in `globals.css`), not the design system's 6px, and
  disagree on height and text size between input (36px / 12px text) and select
  trigger (28px default, 32px "sm" / 14px text).

Surfaces where raw `<input>`/`<select>`/`<textarea>` appear today (census by
grep, ~35 files): dashboard schedule (static tournament builder, dual build
step, score entry rows), the new-match wizard, the edit-match dialog, team
roster/player dialogs, settings, statistics match selector, matches page
filters, search palette, the claim / join / onboarding forms, admin review
rows, and the auth form field.

## Non-goals

- No new form features, validation, or behaviour changes — this is look only.
- No changes to action menus that are not form controls (profile menu, row "…"
  menus, command palette results), except where one masquerades as a select.
- No colour, typography or token redesign beyond what alignment requires.
- No dark mode (deliberately deferred per `DESIGN.md`).
- Checkboxes, radios, toggles, filter pills and tab pills are out; the design
  system gives them their own rules (`radius-pill`, neutral focus ring).
- Not a rewrite of every form onto the shared primitives *unless* stage 02
  decides that is the cheapest route to consistency (see Open questions).

## Constraints

- The design system SKILL.md is authoritative. Radius for inputs/selects/
  textareas is `rounded-[6px]`; dropdown containers `rounded-xl` (12px), rows
  `rounded-lg` (8px); buttons are `h-9`, and inputs sitting beside buttons must
  align with them.
- Two vocabularies are sanctioned — boxed and underline. Do not collapse one
  into the other; the Dialog spec explicitly says dialog fields use the
  underline vocabulary.
- Focus indication is a system (`src/styles/design-system/focus.css`, keyed on
  tag name, with the `data-focus-ring="none"` opt-out earned only by a real
  on-focus change). No control may drop from one visible focus indicator to
  zero (WCAG 2.4.7). Restyling a control must keep, or deliberately re-earn,
  its indicator.
- `docs/ui-revamp-guardrails.md` must be read before touching the new-match
  wizard: three of its inputs, when wrong, silently attribute every statistic
  to the wrong player. Restyling them must not change their values, names,
  defaults or handlers.
- Auth pages style from CSS variables; dashboard pages use Tailwind utilities.
  A fix must work in both idioms, not force one onto the other.
- Inter only, Lucide icons only (chevrons included), the three sanctioned
  motion curves, no bounce.
- Design-system type classes are unlayered and beat Tailwind utilities on
  colour; a utility that appears not to apply is probably losing to one.

## Success criteria

1. Every boxed input, select trigger and textarea in the surfaces listed under
   Scope renders at the design-system radius (6px) and at one shared height
   per size tier, with one text size — verified visually on each surface and
   by a grep that finds no stray `rounded-md` / `rounded-lg` / bare `rounded`
   on a form control.
2. Every underline field shares one rule weight, height and text size, and its
   focus thickening still fires.
3. The three shared primitives agree with each other and with the design
   system, or are explicitly documented as not the canonical path.
4. Opened select panels match the Dropdown/Menu spec (container radius,
   padding, row height and radius).
5. No control loses its focus indicator; the opt-out table in SKILL.md is
   still accurate after the change.
6. The new-match wizard's guarded inputs are byte-identical in behaviour
   (`pipeline-guardrails-reviewer` passes).
7. `npm run lint` and `npm test` pass; no visual regression on a
   side-by-side of before/after for each listed surface.

## Open questions

Edit the answers in here; stage 02 will read them as decisions.

1. **Surface scope.** Is this dashboard-only, or do the auth pages, claim /
   join / onboarding forms and admin review rows count? *Assumed: all
   user-facing surfaces, dashboard first.*
2. **What counts as a "dropdown menu".** Select-style controls and their
   opened panels only (assumed), or also non-form menus such as the profile
   menu and row action menus?
3. **Canonical height.** The design system fixes the radius but not an input
   height. Observed boxed heights cluster at 34px, 32px and 36px; buttons are
   36px. Is there a preferred height, or a size-tier pair (e.g. default /
   compact) you want kept? *Left to stage 02 if unanswered.*
4. **Underline fields.** Keep the underline vocabulary in dialogs and settings
   as the design system prescribes (assumed), or did you mean one boxed style
   everywhere?
5. **Appetite for consolidation.** Is moving hand-rolled controls onto the
   shared primitives in scope if stage 02 finds it the cleaner route, or
   should this stay a styling pass that touches each control in place?

## Also consulted

Read to verify specific facts, beyond the declared inputs:

- `.skills/advantage-analytics-design/SKILL.md` — Border Radius table, Dialog,
  Dropdown / Menu and EntitySelect, Focus → "the underline opt-out".
- `src/styles/design-system/spacing.css` — radius tokens.
- `src/app/globals.css` — shadcn `--radius` scale (what `rounded-md` resolves to).
- `src/components/ui/input.tsx`, `select.tsx`, `textarea.tsx` — primitive classes.
- A grep census over `src/app` and `src/components` for raw form controls and
  the radius/height utilities near them (counts and file names only; no file
  bodies were read).
