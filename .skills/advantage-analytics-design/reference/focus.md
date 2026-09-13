# Focus

> Part of the Advantage Analytics design system. Read
> `.skills/advantage-analytics-design/SKILL.md` first — it carries the Banned
> list, the precedence rule and the routing table into this directory.

### Focus

**Write nothing.** `src/styles/design-system/focus.css` is the entire focus
treatment. It gives `<input>`, `<textarea>` and native `<select>`
`--focus-ring-field` by tag, and gives every other tabbable control —
`a[href]`, `button`, `[role="button"]`, `summary`,
`[tabindex]:not([tabindex="-1"])` — `--focus-ring`. Two separate tokens, kept
separate so fields and actionable controls _can_ diverge later — not because
they currently do: as of **2026-08-26 both resolve to the same blue** (see the
table below). You add a focus class to nothing, and a hand-rolled `<input>` is
covered as-is. Two families of field opt out of even this ring entirely — see
"The wrapper-ring pattern" and "The underline opt-out" below.

The two shipped rings, defined in `effects.css`:

| Token                | Value                                                         |
| -------------------- | ------------------------------------------------------------- |
| `--focus-ring`       | `0 0 0 2px var(--blue-ring-40)`                               |
| `--focus-ring-field` | `0 0 0 1px var(--field-ring), 0 0 0 2px var(--field-ring-30)` |

`--field-ring` aliases straight to `--blue-ring-*` (`colors.css`) as of
2026-08-26. It sat on the neutral `--ink-500` for a while — a form that rang
every field in blue "spent the accent" once per field, the argument went — and
was reverted at the design owner's explicit call: one consistent focus colour
across the whole product mattered more. Nothing about the reversion needed new
contrast work — `--blue` already clears WCAG 1.4.11's 3:1 floor against both
surfaces `--ink-500` was measured on: 3.68:1 on white, 3.38:1 on #F5F5F5
(`--surface-field`), both independent of why it lives here now. Do not read
this as license to swap `--field-ring` again casually — it is aliased rather
than hard-coded specifically so the next change is a one-line edit here, not a
grep-and-replace, but it is still a product decision, not a free variable.

The field ring is two layers on purpose regardless of which colour occupies
`--field-ring`: the 30% band alone composites too faint to read on its own —
present in devtools, easy to miss for a keyboard user. The opaque 1px layer is
what you actually see; the band only softens its outer edge. The measurements
are in DESIGN.md → Focus.

`focus.css` is imported outside any `@layer` while Tailwind utilities live in
`@layer utilities`, and unlayered CSS wins regardless of specificity — so
`focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40` on a button, a link or a
field does **not** override the default. It is silently discarded, and you have
written dead classes. Its `:where()` wrapper keeps specificity at 0, but that
only matters against other unlayered rules. To override, change the token or
write unlayered CSS. `advButton()` agrees by value rather than by utility — it
sets `focus-visible:shadow-[var(--focus-ring)]`, the same property the file
uses, so nothing is competing.

**A programmatically focused element does NOT match `:focus-visible`**
(measured on a row focused from its own `pointerdown` handler). Anywhere a
click is a _selection_ rather than a navigation — the lineup's rows are the
shipped case — the ring the system gives you never fires, and the component
must write `focus:shadow-[var(--focus-ring)]` on plain `:focus` itself. Do
that **by value, not by invention**: on a keyboard both rules match, the
unlayered one wins, and since it carries the same token nothing is competing
and no `!important` is needed. This is `advButton()`'s approach applied to a
row.

**A third override exists for a state the system has no token for:
`!important`.** An important declaration in a stylesheet beats an unlayered
_normal_ one, so `shadow-[0_0_0_2px_var(--blue)]!` lands where the same
utility without the `!` is silently discarded. Reach for it only where the
component genuinely needs a value the system does not define — the lineup's
**held** row, which is a product state and not a focus state — never to
restyle the standard ring, which is a token edit, and never for a focused
state, which should agree by value as above.

**Inline `style` is NOT a safe override on a `motion` component**, though
inline normally wins. framer-motion owns that element's `style` attribute and
does not clear a key that stops being passed: a row that stopped being
focused kept the outline it was last given, and two rows read as selected at
once. framer also writes `z-index` inline on every `Reorder.Item`, which
beats a `z-*` class — flag that too, or the row below paints its hover wash
over the bottom 2px of your outline.

Treat that as a known defect rather than as settled design — it fails silently,
which is how 209 such declarations accumulated across 61 files before anyone
noticed. A few encoded a _different_ ring than the system's: `ui/input.tsx` set
`#E5E5E5`, the value retired for measuring 1.26:1. `247f054` deleted 209 of
them — but not all of them. Seven `focus-visible:border-[#E5E5E5]`
declarations survived that sweep, across five files (`ui/input.tsx`,
`ui/select.tsx`, `statistics/match-selector.tsx`, `schedule/score-entry.tsx`
and `schedule/single-score-entry.tsx`), and were removed separately; `src/`
carries none today. The gap is the point: a sweep that reports a count is not
the same as a sweep that leaves nothing behind, and nothing in the repo
re-checks it.

Two structural fixes remain, and neither is done: importing the design-system
CSS into a named layer, so a utility overrides normally and this warning
collapses to "prefer the token"; and a lint rule or test-gated grep that makes
the dead class a build failure. Nothing enforces this today — the repo has no
CI, and the ESLint hook is non-blocking — so the rule below is the only thing
standing between a new author and a silently inert focus treatment. Write no
focus class.

**The wrapper-ring pattern is the first of two exceptions to "write nothing."** When the
input sits inside a bordered box and the box is what reads as the field, the
ring belongs on the box — otherwise it draws inset, floating inside the border.
Put the ring on the wrapper and `data-focus-ring="none"` on the inner control so
it does not draw a second one. Which selector you use depends on what else is in
the box:

| The box holds                              | Selector on the wrapper                                      | Worked example                   |
| ------------------------------------------ | ------------------------------------------------------------ | -------------------------------- |
| the input and nothing else focusable       | `focus-within:shadow-[var(--focus-ring-field)]`              | `claim/program-search.tsx`       |
| the input **and** other focusable children | `has-[input:focus-visible]:shadow-[var(--focus-ring-field)]` | none in `src/` today — see below |

`focus-within` matches on any descendant, so in a box that holds more than the
input it double-rings: in the bulk-invite dialog that first needed this, each
email chip carried a remove `<button>`, and focusing one drew the wrapper's
neutral ring and the button's own blue ring at the same time — two indicators,
two colours, the larger one on an element that was not focused. Keying on
`input:focus-visible` scopes the wrapper ring to the case it exists for.
(The native-select-over-a-pill that was the third case is gone — every
select is `MenuSelect` now, whose trigger is a plain button and rings itself.)

**The underline opt-out is the second exception to "write nothing."** A field
whose own rule visibly changes on focus — thickens, recolours, or both — needs
no ring at all: that change is already the one indicator WCAG 2.4.7 (AA) asks
for, and the standard's own guidance is that a surrounding ring is not required
once some other on-focus change is clearly visible. Stacking the neutral ring
on top of a rule that already answers the question is redundant chrome, not a
second layer of safety, and it reads on screen as a stray box sitting on a
field that was already fine. Put `data-focus-ring="none"` directly on the
input or select — there is no wrapper here, so nothing else to key the
selector on:

| Component                                                                   | File                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------- |
| `FormField`'s input                                                         | `auth/form-field.tsx`                             |
| `SettingsUnderlineInput`                                                    | `settings/settings-card.tsx`                      |
| `UnderlineSelect`                                                           | `team/player-fields.tsx`                          |
| `ProfileSelect`'s inline `<select>`                                         | `settings/profile-form.tsx`                       |
| `UnderlineField`'s children, `PlayerRow`'s name input                       | `matches/match-actions/edit-match-dialog.tsx`     |
| `EventCell`'s input — the wrapper goes blue 2px on `focus-within`           | `matches/new-match-wizard/DetailsStepContent.tsx` |
| the opponent-name input — its rule recolours to blue on `:focus`            | `schedule/score-only-flow.tsx`                    |
| every `DateSegment` — the focused segment fills Signal Blue with white text | `ui/date-field.tsx`                               |

The opt-out is earned by an actual on-focus change, never by looking like an
underline. `schedule/add-result-row.tsx`'s round `<select>`,
`schedule/add-result-dialog.tsx`'s `SELECT_CLS` and `schedule/score-entry.tsx`'s
opponent input all draw a hairline that never changes — no thickening, no
recolour, nothing — so they keep the neutral ring: remove it there and the
field drops from one indicator to zero, which is precisely the failure this
file exists to prevent.

A _standing_ rule fails the test for the same reason, even a bold one.
"Already blue" is not "changes on focus": a `border-b-2 border-[var(--blue)]`
drawn by an editing state looks focused, never changes, and stays blue after
focus moves to the next field, so a control under it keeps the ring. The
opponent-name span in `DetailsStepContent.tsx` and the title field in
`static/static-tournament-builder.tsx` were both that case and are no longer:
each now rests on `--border-medium` and recolours to blue on `focus-within`,
which is what earned each of them the opt-out it carries today. The test is the
change, not the colour — re-read the rule before copying either of them.

Before adding this attribute anywhere new, find the actual
`:focus`/`:focus-within` rule that changes the control and confirm it fires —
do not assume a `border-b` alone qualifies, and confirm the rule tracks focus
rather than some adjacent open/editing state. `EventCell` needed
`focus-within:` added for exactly that reason: it keyed the blue rule on the
popover's `open`, which `commit()` sets false while the input still holds
focus, so the opt-out would have left a focused field with no indicator at all
in that window.

`data-focus-ring="none"` is the opt-out for both exceptions, and it lives in
`focus.css` scoped to `:focus-visible` rather than as an inline
`style={{ boxShadow: "none" }}` on the input. Inline would suppress the focus
ring **and** any shadow the component ever sets for its own reasons,
unconditionally and invisibly to anyone grepping for focus. The attribute
suppresses exactly one rule in exactly one state, and stays inside `:where()`,
so it is still specificity 0.

Three gotchas, in the order you will actually hit them:

- The split is keyed on tag name, so `input[type=checkbox]` and
  `input[type=radio]` take the **neutral** ring even though they are actionable
  controls the rest of the system rings in blue. Two live call sites today.
- `border-color` is not part of the ring, so `focus:border-[var(--blue)]` still
  turns a field blue regardless of `data-focus-ring`. On an underline field
  that recolour IS the indicator the opt-out relies on — pair the two, per the
  table above. On a boxed field with no such opt-out set, the same recolour is
  just a leak.
- Radix's `SelectTrigger` is a `<button>`, so it takes the blue ring rather
  than the carve-out. Latent — that component has no call sites yet — but it
  will bite whoever adds the first one.

The rule exists because the reset leaves `outline: none` on everything, which
left keyboard users with no focus indicator at all (WCAG 2.4.7 AA). Recolour a
ring, or delete it where a control already shows focus some other way — never
delete the only indicator a control has.
