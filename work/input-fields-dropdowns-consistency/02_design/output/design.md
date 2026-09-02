# Design — input-fields-dropdowns-consistency

Brief: `../01_brief/output/brief.md`. This stage resolves all five of its open
questions (see "Brief questions, resolved") and adds two new ones that only
surfaced once the code was measured.

---

## What is actually wrong

The brief said the controls disagree. Measuring them says *why*, and the why
changes the fix.

### Finding 1 — the app has two radius scales, and the design system's shorthand reads the wrong one

`src/app/globals.css` line 9 opens an `@theme inline` block (closing line 66)
that redefines Tailwind's whole radius scale off shadcn's `--radius: 0.625rem`:

| Class | Stock Tailwind v4 | **This app** | DS token it was meant to hit |
|---|---|---|---|
| `rounded-sm` | 4px | 6px | — |
| `rounded-md` | 6px | **8px** | — |
| `rounded-lg` | 8px | **10px** | `radius-element` = 8px |
| `rounded-xl` | 12px | **14px** | `radius-dropdown` = 12px |

The design system's Border Radius table maps its tokens onto class names
(`radius-element` → `rounded-lg`, `radius-dropdown` → `rounded-xl`). That
mapping is correct for stock Tailwind and **wrong in this codebase**. Every
component that wrote `rounded-lg` meaning 8px is rendering 10px; every
`rounded-xl` meaning 12px is rendering 14px. Nobody wrote a bug — the shorthand
silently resolves through a scale the design system does not know about.

This is why the drift is systemic rather than sloppy, and it is why the fix
cannot be "use the right class name". Consequence for this feature: **the
canonical field styles must be written as `var(--radius-*)` tokens, never as
`rounded-md` / `rounded-lg` / `rounded-xl`.** Those three class names are the
defect, not the cure.

### Finding 2 — the shared primitives are the outlier, and their one consumer fights them

`src/components/ui/{input,select,textarea}.tsx` are stock shadcn. They render
`rounded-md` (8px, not the DS's 6px) and disagree with each other on height and
text size: input `h-9`/12px text, select trigger `h-7` default and `h-8` sm with
14px text, textarea `min-h-[80px]`.

Exactly one file in the app imports any of them:
`new-match-wizard/ScoreCell.tsx` — and it overrides the primitive back to
`rounded-[6px] h-8` by hand to get the design-system value. The single consumer
of the shared control has to fight the shared control. That is the argument for
fixing the primitives rather than routing around them.

**ScoreCell is guardrail territory.** It is the set-score input, which
`docs/ui-revamp-guardrails.md` §4 items 2 and 3 call out as silently
corrupting: set scores are reordered top-player-first before submission, and a
tiebreak set must send the game count. Restyling it must not touch `value`,
`onValueChange`, `type`, `inputMode` or the parent's ordering.

### Finding 3 — boxed geometry has six heights and three radii

| Where | Height | Radius |
|---|---|---|
| `CLAIM_FIELD` (claim, join, onboarding — the largest single family) | 38px | 8px `--radius-element` |
| `claim/program-search.tsx` wrapper | 38px | 8px |
| shadcn `input.tsx` | 36px | 8px (`rounded-md`) |
| `statistics/match-selector.tsx` selects | auto (`py-1.5`) | 10px (`rounded-lg`) |
| shadcn select trigger | 28px / 32px | 8px |
| `matches-page-content.tsx` search | 28px | 8px |
| `settings/team-settings-form.tsx`, `settings/account/page.tsx` | 30px | **6px** |
| `schedule/score-entry.tsx` | 30px | **6px** |
| `ScoreCell` | 32px | **6px** |

Three surfaces already sit at the design system's 6px. Everything else drifted
to 8px or 10px. Heights cluster at 38 / 36 / 32 / 30 / 28 with no rule.

Meanwhile `advButton()` fixes button heights at 32 / 36 / 44 (`sm`/`md`/`lg`).
The brief's constraint that "inputs sitting beside buttons must align with
them" is therefore already answered by a table that exists.

### Finding 4 — the underline family is nearly consistent, in two mechanisms

`settings-card.tsx`, `player-fields.tsx` and `profile-form.tsx` all sit at
`h-[34px]` with a `border-b` that thickens to `border-b-2`. `form-field.tsx`,
`edit-match-dialog.tsx` and `DetailsContent.tsx` instead draw an explicit
`h-[1px]` div that swaps to `h-[2px]`. Same visual, two mechanisms, and only the
first is greppable as a field rule. `lineup-editor.tsx`'s `NameField` matches
neither pattern's markers.

So the underline family needs alignment on *height and mechanism*, not on
appearance. It is a much smaller job than the boxed family.

### Finding 5 — focus is a system that silently discards utilities

`src/styles/design-system/focus.css` is imported outside any `@layer`, and
unlayered CSS beats `@layer utilities` before specificity is consulted. A
`focus-visible:ring-*` or `focus-visible:shadow-*` utility written on an input
**is silently discarded**. The file documents this as measured, not assumed.

Two consequences bind this design:

1. The canonical field classes must not attempt a focus treatment. `focus.css`
   already gives `input`, `select` and `textarea` the neutral
   `--focus-ring-field` for free.
2. The split is keyed on tag name, so Radix's `SelectTrigger` — a `<button>` —
   takes the **blue** actionable ring. A Radix select restyled to look exactly
   like the native select beside it will still focus a different colour. See
   Open question A.

---

## Approaches considered

### A. Retune the shadcn radius scale in `globals.css`

Change `--radius` (and/or the four `--radius-*` lines) so `rounded-md` and
`rounded-lg` resolve to design-system values, then leave call sites alone.

- **For:** one-line diff; fixes every drifted call site at once.
- **Against:** those four names are used on cards, menus, modals, dialogs,
  skeletons and popovers, not just fields. Retuning them restyles the entire
  app in one commit, which is exactly the "bulk find-and-replace is how a
  redesign turns into an outage" failure `design-system/index.css` warns about
  in its own header. It also fixes only radius — height and text size, half the
  brief, are untouched.
- **Verdict:** rejected. Right diagnosis, wrong blast radius.

### B. `advField()` — a class helper in `src/lib/ui/`, applied surface by surface

Mirror the existing `advButton()` precedent exactly: one module exporting the
canonical field classes by kind and size, then convert call sites in reviewable
batches.

- **For:** the repo already proved this shape works, for the same reason (the
  claim flow's hand-rolled near-miss primary button). Values live in one file
  with the rationale beside them. Conversion is incremental and each batch is
  independently reviewable and revertable. It fixes radius, height, text size
  and border together. `CLAIM_FIELD` already demonstrates the pattern locally
  and can simply delegate.
- **Against:** ~35 files to touch; a helper does not stop the 36th file from
  hand-rolling a new one. Needs a test to hold the line.
- **Verdict:** **recommended.**

### C. Rewrite every control onto the shadcn primitives

Convert raw `<input>`/`<select>` to `<Input>`/`<Select>` everywhere.

- **For:** genuinely one implementation; gets Radix keyboard behaviour for free.
- **Against:** this is a behaviour change dressed as a look change. Replacing a
  native `<select>` with Radix `Select` swaps the event model, the focus ring
  branch, the mobile picker and the form-submission semantics — in the
  new-match wizard, on the three inputs guardrails §4 says corrupt every
  statistic when they change meaning. The brief's first non-goal is "no
  behaviour changes". Thirty-five files of that is not a styling pass.
- **Verdict:** rejected. Retained only as the eventual destination if the app
  ever wants Radix behaviour, which it does not today.

---

## Chosen design — B

### Architecture

One new module, `src/lib/ui/adv-field.ts`, written as a deliberate sibling of
`src/lib/ui/adv-button.ts`: same file shape, same documentation habit of naming
the value *and* the reason, same "every value below is the DS rule, not a nearby
one" contract in the header.

```ts
export type AdvFieldKind = "boxed" | "underline";
export type AdvFieldSize = "sm" | "md";

export function advField(
  kind: AdvFieldKind = "boxed",
  size: AdvFieldSize = "md"
): string;
```

**The canonical boxed field**

| Property | Value | Why |
|---|---|---|
| radius | `rounded-[var(--radius-button)]` (6px) | DS `radius-input` is defined as "matches button radius". Written as the token, never `rounded-md` — see Finding 1. |
| height | `h-9` (36px) md · `h-8` (32px) sm | Mirrors `advButton`'s `md`/`sm` exactly, which is what "aligns with the button beside it" means in practice. Retires 38 / 34 / 30 / 28. |
| text | `text-[13px]` md · `text-[12px]` sm | Same tiers as `advButton`. |
| border | `border border-[var(--border-field)]` | The DS token (#EAECF0). Retires the `#EAECF0` and `#F3F3F3` literals. |
| surface | `bg-[var(--surface-card)]` | |
| padding | `px-3` | Already the majority. |
| ink | `text-[var(--ink-900)]`, `placeholder:text-[var(--ink-400)]` | |
| disabled | `disabled:bg-[var(--bg-field)]` (#F7F7F7) | DS colour table, "Disabled fields". |
| focus | **nothing** | `focus.css` supplies `--focus-ring-field`. A utility here is silently discarded (Finding 5); writing one would look like coverage and be dead code. |

**The canonical underline field**: `h-[34px]`, `border-b border-[var(--border-field)]`
thickening to `border-b-2 border-[var(--blue)]` on focus, `text-[13px]`,
`bg-transparent`, plus `data-focus-ring="none"` — which stays *earned* here,
because the rule genuinely changes on focus, which is the exact test
`focus.css` demands before that attribute is added anywhere new.

**No new radius token.** `--radius-input` was considered as an alias beside the
existing `--radius-score-card` / `--radius-modal` legacy aliases. Rejected on
YAGNI: `advField()` writes the radius once, and `spacing.css` states in its own
header that it carries six radii "and nothing else".

### Components and the order they change

Six batches, each independently shippable and revertable. Sequence matters:
the primitives and the shared constants go first, so later batches shrink.

1. **`src/lib/ui/adv-field.ts`** — the helper, with the header documenting the
   two-radius-scale trap so the next person does not re-derive Finding 1.
2. **The three primitives** — `ui/input.tsx`, `ui/select.tsx`, `ui/textarea.tsx`
   adopt the canonical values so they agree with each other and with the DS.
   Blast radius is one consumer (`ScoreCell`), which currently overrides them
   to the same values by hand; after this its override becomes deletable.
   *Guardrail gate: `ScoreCell`'s `value`, `onValueChange`, `type`, `inputMode`
   and its parent's ordering must be untouched. `pipeline-guardrails-reviewer`
   runs on this batch.*
3. **`CLAIM_FIELD` in `claim/claim-shell.tsx`** — delegate to `advField("boxed")`.
   One constant, and the claim, join and onboarding forms all move with it.
   Visible change: 38px → 36px, 8px → 6px radius. Also `claim/program-search.tsx`,
   which hand-rolls the same 38px/8px wrapper.
4. **Settings and schedule inline fields** — `settings/team-settings-form.tsx`,
   `settings/account/page.tsx`, `schedule/score-entry.tsx`. Already at 6px;
   30px → 32px (`sm`) is the whole change.
5. **Dashboard selects and their panels** — `statistics/match-selector.tsx`
   (10px → 6px trigger), `matches/new-match-wizard/FieldCell.tsx`,
   `matches/matches-page-content.tsx`, plus float panels that belong to a field
   (`OpponentProgramField.tsx` already correct at `--radius-dropdown`;
   `matches-page-content.tsx` and `opponent-popup.tsx` use `rounded-xl` = 14px
   and should move to `rounded-[var(--radius-dropdown)]` = 12px).
   *Carve-out: the matches page's 28px search control is DS **chrome**, not a
   field — the DS Header section fixes it at 28px/radius 8. It keeps its
   geometry and is excluded from the grep gate.*
6. **The underline family** — converge the three `h-[1px]`/`h-[2px]` div
   implementations onto the `border-b`/`border-b-2` mechanism at `h-[34px]`, and
   bring `lineup-editor.tsx`'s `NameField` in. *Guardrail gate again:
   `DetailsContent.tsx` holds the player-name inputs and `edit-match-dialog.tsx`
   the match-edit fields.*

### Data flow

None. No component in scope reads, writes, derives or submits differently after
this change. No Supabase table, RLS policy, loader or API route is touched, so
there is no schema to verify against the live database. Every diff should be
class strings plus the one new module — if a task's diff touches a handler, a
`value`, a `name`, a `defaultValue` or a piece of state, that task has left its
lane and should stop.

### Error handling

Three failure modes are worth naming, because each is silent:

1. **A utility that never applies.** Design-system type classes and `focus.css`
   are unlayered and beat Tailwind utilities. A converted field whose colour or
   focus looks unchanged has probably lost to one; the fix is an inline style or
   a token change, not a more specific class. Do not add `!important`.
2. **A control that loses its only focus indicator.** Converting a boxed field
   to underline styling, or adding `data-focus-ring="none"` because a field
   "looks like an underline", drops it from one indicator to zero — WCAG 2.4.7
   (AA), invisible unless someone navigates by keyboard. The attribute is earned
   only by an actual on-focus change; `schedule/field-row.tsx`'s hairline is the
   documented counter-example that must keep its ring.
3. **A guarded input changing meaning.** Batches 2, 5 and 6 touch the new-match
   wizard and the edit-match dialog. Guardrails §4 is explicit that the page
   still renders and the numbers still look plausible when these break. Class
   strings only, and `pipeline-guardrails-reviewer` gates those batches.

### Testing

- **A source-scanning invariant test**, `tests/field-geometry.spec.ts`, modelled
  on `tests/generate-map.spec.ts` — which is the repo's existing precedent for a
  Playwright spec that reads files rather than driving a browser. It walks
  `src/app` and `src/components` for `<input>`, `<select>`, `<textarea>` and
  `SelectTrigger`, and fails on `rounded-md`, `rounded-lg`, `rounded-xl` or a
  bare `rounded` in their class strings, with a short allowlist for the
  documented chrome carve-outs. This is what stops file 36 from hand-rolling a
  new variant, and it makes success criterion 1's grep executable rather than
  aspirational.
- **Visual confirmation per batch** via the browser preview: a screenshot of
  each converted surface, checked against the batch before it. Note the worktree
  needs `npm ci` before anything runs.
- **`npm run lint` and `npm test`** green per batch.
- **`pipeline-guardrails-reviewer`** on batches 2, 5 and 6.
- No new unit tests: there is no new behaviour to assert.

---

## Brief questions, resolved

1. **Surface scope** → all user-facing surfaces. Confirmed by the evidence:
   `CLAIM_FIELD` is the single largest family of drifted fields and covers
   claim, join and onboarding. Excluding non-dashboard surfaces would leave the
   biggest offender in place.
2. **What counts as a dropdown** → select-style controls and the panels that
   belong to them. Non-form menus (profile menu, row `…` menus, command
   palette) are out. The panels of in-scope fields move to
   `--radius-dropdown` (12px), which is a *change* for anything currently on
   `rounded-xl` (14px here — Finding 1).
3. **Canonical height** → two tiers mirroring `advButton`: `md` 36px, `sm` 32px.
   Chosen because the constraint "inputs beside buttons must align" resolves to
   a table that already exists rather than to a new number.
4. **Underline fields** → kept, as the DS Dialog spec prescribes. Aligned on
   height (34px) and mechanism (`border-b`), not converted to boxed.
5. **Appetite for consolidation** → a shared *class helper* (approach B), not a
   component rewrite (approach C). Consolidating markup is a behaviour change
   and collides with the brief's first non-goal and with guardrails §4.

## Open questions

**A. Radix `SelectTrigger` focuses blue; every native field focuses neutral.**
`focus.css` splits the ring on tag name, and a `SelectTrigger` is a `<button>`.
The file names this case explicitly, so it is a known decision, not an
oversight. Making a Radix select focus like the field it visually is means
adding one selector (`[data-slot="select-trigger"]`) to the field branch of
`focus.css`. That edits the focus system, which is why it is a question and not
a decision. Today it affects exactly one consumer (`ScoreCell`), so the cost of
deferring is near zero. **Default if unanswered: leave `focus.css` alone and
record the split as known.**

**B. The design system's Border Radius table is wrong for this codebase.**
Finding 1 means SKILL.md's `radius-element → rounded-lg` and
`radius-dropdown → rounded-xl` mappings mislead anyone who follows them. Fixing
the table is a two-line documentation change that would prevent the next
recurrence of this whole feature, but SKILL.md is the design system's own
authority and editing it is outside a styling pass's remit. **Default if
unanswered: out of scope for this feature; flag it as its own task on its own
branch, per the branch-scope-discipline rule.**

**C. Do the 38px claim fields shrinking to 36px need a visual sign-off?**
The claim and onboarding flows are the collegiate first-run experience and this
is the most visible single change in the feature (2px shorter, 2px tighter
corners, across every field on those pages). Mechanically safe; worth a look
before it lands. **Default if unanswered: proceed, and put the before/after
screenshots in the batch-3 review.**

## Also consulted

Beyond the declared inputs (`brief.md`, `MAP.md`, `docs/ui-revamp-guardrails.md`,
`.skills/advantage-analytics-design/SKILL.md`):

- `src/app/globals.css` — the `@theme inline` block, lines 9–66, and `--radius`
  at line 194. This is Finding 1 and it is the load-bearing fact of the design.
- `src/styles/design-system/spacing.css` — the six radius tokens and the
  "nothing else" statement that rules out a new one.
- `src/styles/design-system/focus.css` — the two-ring split, the unlayered-CSS
  measurement, and the `data-focus-ring="none"` earning test.
- `src/styles/design-system/index.css` — the header's warning against bulk
  find-and-replace, which is why approach A was rejected.
- `src/lib/ui/adv-button.ts` — the precedent `advField()` is modelled on, and
  the source of the 32/36/44 size table.
- `src/components/ui/input.tsx`, `select.tsx`, `textarea.tsx` — Finding 2.
- `src/components/claim/claim-shell.tsx` — `CLAIM_FIELD`, and its consumers in
  `join/join-forms.tsx`, `onboarding/onboarding-flow.tsx`,
  `claim/{setup,team-setup,unlisted-program,contact-owner}-form.tsx`.
- `src/components/dashboard/matches/new-match-wizard/ScoreCell.tsx` — the sole
  primitive consumer, and its use in `DetailsContent.tsx` and
  `edit-match-dialog.tsx`, which is what makes it guarded.
- Geometry read from `settings/team-settings-form.tsx`,
  `settings/account/page.tsx`, `settings/profile-form.tsx`,
  `settings/settings-card.tsx`, `schedule/score-entry.tsx`,
  `schedule/static/{dual-build-step,static-tournament-builder,opponent-popup}.tsx`,
  `statistics/match-selector.tsx`, `matches/matches-page-content.tsx`,
  `matches/new-match-wizard/{FieldCell,DetailsContent,OpponentProgramField}.tsx`,
  `matches/match-actions/edit-match-dialog.tsx`, `team/player-fields.tsx`,
  `claim/program-search.tsx`, `auth/form-field.tsx`.
- `tests/generate-map.spec.ts` — the source-scanning invariant-test precedent.
- `package.json` — the `lint` / `test` / `map` scripts the gates run.
