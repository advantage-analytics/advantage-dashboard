# Review — add-event-polish

**Sign-off:** pending

Target reviewed: the feature's own commit range, `01a6b92..2a86f09`
(the four tasks, their scaffold and bookkeeping), plus the fixes this stage
made on top, committed as `e1620bb`. Everything before `01a6b92` on the
branch carries earlier receipts (`c21d7c8`, `f15fe30`). Receipt for this
stage recorded at `e1620bb`.

## Success criteria (from the brief)

1. **Chooser centred in the content area at 1440×900 and 1200×800** — met,
   with the author's amendment: centred in the shell's *body* (the region
   between header and footer), measured 0px / 2px off on both axes at both
   sizes; the four other shell screens unmoved (real-content probe:
   child.top = body.top + 26, body scrolls). Approved on the harness.
2. **Crest at the design's size on every row** — met at 32px (the author's
   number; the 2c artboard draws no mark at all). Row height unchanged
   (56.9px before and after).
3. **Clicking a school shows the blue check, reads as selected off-hover,
   Continue enables and advances; keyboard the same** — met: selected bg
   `rgb(245,245,245)`, `svg.lucide-check` present, chevron absent; Continue
   enabled and lands on step 2. Enter/Space activation could not be injected
   by the browser tool and was judged structurally satisfied (native
   `<button>`, no keydown handler).
4. **One focus indicator per control on the facts step; underline fields show
   the blue rule alone** — met: Date and the three `MenuSelect` triggers each
   measured `box-shadow: none`, `outline: none`, rule `2px rgb(59,130,246)`
   on `:focus-visible`; Escape on an open menu closes it without stepping
   back. **And one gap this stage found**: Enter on a closed trigger advanced
   the step instead of opening the menu — fixed here (see findings).
5. **lint, tsc, npm test green; copy spec untouched** — met: 661 passed after
   this stage's fixes; `tests/schedule-static-copy.spec.ts` byte-identical.

## Mechanical gates

lint 0 errors · `tsc --noEmit` clean · `npm test` 661 passed (658 from the
feature + 3 from this stage's new spec).

## Findings and resolutions

**code-review (my pass, medium)**
- **Fixed.** `useWizardKeys.isFormControl` did not recognise a
  `MenuSelect` trigger (`<button aria-haspopup>`), so plain Enter on Site,
  Surface or Format ran `onContinue()` and prevented the click that opens
  the menu — a keyboard regression from the native `<select>`, which the
  `SELECT` branch had always covered. Now any element with `aria-haspopup`
  owns its Enter; `tests/wizard-keys-form-control.spec.ts` pins it. No task
  gate could have caught it: the browser tool in this environment delivers
  Enter as a blank keydown.

**simplify — reuse**
- **Fixed (root).** `MENU_TRIGGER = "h-[34px]"` re-stated the underline
  family's height at three call sites because `MenuSelect`'s underline
  trigger was `h-8` (32) against `advField("underline")`'s 34. The height
  moved into `MenuSelect`; the constant and its comment are gone. The two
  underline selects in `settings/teams/team-identity-card.tsx` move 2px to
  the family height as a consequence.
- Noted, not changed: `FieldCell` remains a second, richer copy of the
  tournament builder's; that file is deliberately deferred and should share
  a `field-cell.tsx` when it migrates. The selected-row check is a fifth
  hand-rolled trailing check (no shared helper fits an `aria-pressed` row).

**simplify — simplification**
- **Fixed.** `DualFormat.label` and `FORMAT_WORDS.*.label` were dead once
  the native `<option>`s went; removed with their stale doc lines.
- **Fixed.** Chooser centring rationale stated once (header point 2), the
  JSX comment reduced to the one fact only it held.
- **Fixed.** `EventMark` size is a three-entry lookup with shared classes
  hoisted, not a ternary inside a template inside a ternary.
- **Fixed.** No-op `className="block"` on the `chrome="none"` div.
- Skipped: extracting a `MenuCell` to fold the three `MenuSelect` cells —
  the altitude reviewer judged the `chrome` prop the right depth (one
  component keeps the eyebrow/note treatment in one place); the repetition
  is three short cells. Skipped: dropping `formatOptions`'s export — the
  guardrails reviewer valued the spec's "an option carries no scoring field"
  assertion, which needs it.

**simplify — efficiency**
- Nothing to change; `FORMAT_OPTIONS` was already a module constant.

**simplify — altitude**
- Agreed with reuse on `MenuSelect`'s height (fixed as above). Judged
  `EventShell`'s flex column, the `chrome` prop and `EventMark`'s literal
  size union the right depth; the shell comment now says the scroll invariant
  was measured (fixed).
- **Consciously left:** the date input's picker indicator stretched over the
  cell at opacity 0 is the same overlay pattern this diff retires on Format,
  and Firefox draws its own icon untouched. It stays because it satisfies the
  criterion the author approved (one glyph; a click anywhere opens the
  picker) and because `work/date-field` — scaffolded, react-aria chosen —
  replaces every native date input, this one first.

**pipeline-guardrails-reviewer (over the whole range)** — no findings.
`adScoring` traced end to end: options carry no scoring field; `onEdit`
receives the `FORMATS` row found by value. §4 untouched; §3.3 unreachable
from `EventShell`; no vendor string.

**Skipped, with reasons**: `rls-boundary-reviewer` — no data, API or
migration surface in the range. `vercel-react-best-practices` — no
`"use client"` added, no new component file. Postgres best-practices — no
SQL.

## Consciously left (summary)

- Date picker overlay (above) — until `date-field`.
- `FieldCell` duplication with the tournament builder — until that file
  migrates.
- `focus.css` still names `settings/settings-inline-select.tsx`, deleted
  upstream — stale sentence, pre-existing.
- The Format menu shows two "Best of 3 sets" and two "One set" rows told
  apart only by their description line — a design call.
- The chooser's "Add a one-off match" link targets a retired route — its own
  task.

## Also consulted

Beyond the declared inputs (`build.md`, the range diff, `brief.md`,
`.claude/skills/pr-check/SKILL.md`): `src/components/dashboard/matches/new-match-wizard/useWizardKeys.ts`,
`src/components/ui/menu-select.tsx`, `src/lib/ui/adv-field.ts`,
`src/components/dashboard/schedule/single-detail.tsx` (grep for auto
margins only), `tests/schedule-static-copy.spec.ts` (grep for `.label`
readers only).
