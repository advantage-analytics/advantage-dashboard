# Design — add-event-polish

Four fixes on three screens of the dual create path. Every one was reproduced
on a dev server before this was written; the numbers below are measured, not
assumed. The brief's four open questions are all resolved here.

## Route trace

| Screen (as the human names it) | Route | Rendered by |
|---|---|---|
| "What are you adding?" | `/dashboard/team/schedule/new` | `static/static-event-chooser.tsx` inside `schedule/event-shell.tsx` (`EventShell`, shared with `single-detail.tsx` and `match-detail-shell.tsx`) |
| "Who are you playing?" | `/dashboard/team/schedule/new/dual`, step 1 | `static/new-dual-flow.tsx` → `SchoolStep` → `WizardShell` → `static/dual-school-step.tsx` (`DualSchoolStep`, `SchoolRow`) |
| "When it's played, and how." | same route, step 2 | `new-dual-flow.tsx` → `DualDraftFlow` → `WizardShell` → `static/dual-build-step.tsx` (`DualFactsStep`, `FieldCell`, `FieldSelect`) |

## What was actually found

1. **Chooser.** Horizontally it IS centred — the 820px column's centre sits
   within 0px of the content area's centre at both 1440×900 and 1200×800.
   What is not centred is the **vertical** axis: the body is top-aligned
   (`pt-[26px]` + `pt-[10px]`) and the content ends at y=396 of an 856px
   body, leaving **504px** empty beneath it at 1440×900 (404px at 1200×800).
   That is what "not centred in the viewport" is. The 3b artboard is drawn
   top-aligned and left-flushed (`padding:36px 48px 0`), so this is a
   deliberate departure from the artboard, the second one on this screen,
   and is recorded as such.
2. **Crest.** The 2c artboard draws **no mark at all** on a school row
   (`grid-template-columns: minmax(0,1fr) 96px 13px`). The 26px `EventMark`
   was added on this branch (unit 3 of PR #178) because the human's design
   has one. `EventMark`'s `size` prop is the literal union `26 | 48`, so
   "slightly bigger" needs a new size, not a number change at the call site.
3. **Selection.** Clicking a row sets `aria-pressed="true"`, enables Continue,
   and Continue advances to step 2 — **the "doesn't let you continue" half
   did not reproduce as a logic defect** by mouse, by Enter in the field, or
   by Enter on the focused row. What DID reproduce is that the selection is
   **invisible**: the selected wash is `--surface-muted` (`#FAFAFA`) on a
   `#FFFFFF` card — a 1.02:1 contrast — and there is no check; the row keeps
   its resting `chevron-right`. A coach who clicks a row and sees nothing
   change reasonably concludes it did not take. That is the whole of item
   3: make the pick visible, and the second half resolves with it. (Hover
   uses the same `#FAFAFA`, so "the grey hover" the human sees is likely the
   row under their pointer, not the selection.)
4. **Focus outline on step 2.** Tabbing the step: Change (pinned bar, ring —
   correct, it is a button), then the **date input: field ring drawn**, then
   Site `<select>`: **field ring drawn**, and the cell's hairline stays
   `1px rgb(243,243,243)` throughout. Surface is the same. The Format cell's
   `<select>` sits at `opacity:0` over the cell, so its ring is invisible —
   that cell has **no focus indicator at all**. The date input additionally
   draws the browser's own calendar-picker icon beside `FieldCell`'s Lucide
   calendar: two glyphs.

## Approaches considered

### Item 1 — vertical centring

- **A. Centre the chooser's body in `EventShell`'s scroll area** with a
  wrapper in the chooser (`my-auto` on the column inside a flex column body).
  Touches only the chooser. Falls back to top-aligned automatically when the
  body is shorter than the content, because `margin:auto` collapses to 0 in
  a flex column with no slack. **Recommended.**
- B. Add a `centered` prop to `EventShell`. Cleaner API, but the shell is
  shared by two event pages that must not move, and a prop nobody else uses
  is a second way to draw the shell for one caller.
- C. Fixed top offset (e.g. `pt-[18vh]`). Looks centred at one height and
  wrong at every other.

### Item 2 — crest size

- **A. Add `32` to `EventMark`'s size union and use it on `SchoolRow`.** 32
  is the next step that reads bigger without becoming a 40px `FieldRow`
  lead; it keeps the row at its 10px vertical padding (row height 52 → 52,
  since the two-line text block is 34px tall and already sets the height).
  Grid column `26px` → `32px`. **Recommended, with the number stated so the
  human can change it in this file.**
- B. Make `size` a free number. Loses the reason the union exists — every
  mark on the product is one of a few sizes on purpose.

### Item 3 — a visible pick

- **A. Follow the design system's chosen-row rule.** Selected = `--surface-subtle`
  wash (`#F5F5F5`, the wash `FloatMenuItem` and `EntitySelect` use for the
  chosen row) + a 13px Lucide `check` in `--blue` in the trailing 13px
  column, replacing the `chevron-right`; hover = the same wash, transient;
  unselected keeps `chevron-right` in `ink-300`. Weight 500 on the name
  stays. No Continue change. **Recommended.**
- B. Keep `#FAFAFA` and add the check only. The check alone on a white row
  reads as an icon, not a state; the wash is what says "this row".
- C. Also auto-advance on pick (row click = Continue). Removes the second
  half of the ask entirely, but it removes the coach's chance to read the
  subline before committing and diverges from every other step, where
  Continue is the one way forward. Rejected; keyboard Enter on a focused
  row already advances via `useWizardKeys`.

### Item 4 — one indicator per cell on the facts step

- **A. Site, Surface, Format become `MenuSelect variant="underline"`; the
  date cell's rule goes blue on `focus-within` with the input opted out.**
  `MenuSelect` is the decided primitive (2026-09-08) and its underline
  trigger already answers focus with its own 2px blue rule and no ring
  (`df64023`). Format's two strings map exactly onto `MenuSelect`'s
  option shape: label = the sets half ("Best of 3 sets"), `description` =
  the scoring half ("No-ad scoring") — the reason the opacity-0 overlay
  existed (a native select prints one line) is the reason `MenuSelect`
  exists. `FieldCell` loses its own chevron for those three (the trigger
  draws one) and keeps the calendar glyph for Date. **Recommended.**
- B. Opt the three native controls out of the ring and make `FieldCell`'s
  rule go blue on `focus-within`. Smaller diff, keeps two native selects and
  the opacity-0 overlay, and leaves the product with three more native
  selects the day after deciding there should be none. Rejected on the
  decision, not on effort.
- C. Leave the rings; they are technically compliant. Rejected: it is the
  ask.

## Chosen design

### 1. Chooser — centred on both axes

In `static-event-chooser.tsx`, the column wrapper gains `my-auto`:

```tsx
<div className="mx-auto my-auto w-full max-w-[820px] pt-[10px]">
```

`EventShell`'s default body is `min-h-0 flex-1 overflow-y-auto px-12 pb-8 pt-[26px]`
— a block. For `my-auto` to distribute slack it must be a flex column, so
`EventShell` gets **one** additional class on that default body:
`flex flex-col`. This is safe for the two other callers because their
children have no `my-auto` and a single flex child in a column at
`align-items: stretch` lays out exactly as a block child did (their widths
are already `w-full` or intrinsic-to-content columns — verify by screenshot
in the build task, criterion 1's "unmoved"). If either moves by a pixel, fall
back to approach B (the prop) rather than fighting it.

Vertical rhythm: `pt-[26px]` + `pt-[10px]` above and `pb-8` below stay, so on
a short viewport the content top-aligns exactly as today. Update the two
paragraphs of the chooser header comment that describe the artboard's
`padding:36px 48px 0` and the "content is top-aligned" note — both become
false.

### 2. Crest — 32px

`static/event-mark.tsx`: `size: 26 | 32 | 48`. The existing `large` boolean
branches type size on 48; 32 takes the 26 branch's type scale (the initials
at the same 11px/500 read fine at 32; verify by screenshot). `SchoolRow`:
`grid-cols-[32px_minmax(0,1fr)_96px_13px]` and `size={32}`. Row comment
updated: it currently claims parity with the schedule table's 26px; the two
now differ and the comment must say why (a pick row gives the mark more room
than a table cell does).

### 3. Selection — wash + Signal Blue check

`SchoolRow` in `dual-school-step.tsx`:

- Classes: `selected ? "bg-[var(--surface-subtle)]" : "hover:bg-[var(--surface-subtle)]"`.
- Trailing column: `selected ? <Check size={13} strokeWidth={2} className="text-[var(--blue)]" /> : <ChevronRight … ink-300 />`.
  Both 13px, so the column does not move. `aria-pressed` already carries the
  state for assistive tech; the check is `aria-hidden` like the chevron.
- The comment on the wash: state the contrast reason (`#FAFAFA` on white
  was invisible) so nobody restores the artboard's token.

Nothing changes in `new-dual-flow.tsx`: Continue gating was measured
correct. If the human's environment still refuses Continue after this lands,
that is a new report against a specific gesture, not this item.

### 4. Facts step — `MenuSelect` for the three choices, a live rule for Date

`dual-build-step.tsx`:

- `FieldCell` gains `chrome?: "rule" | "none"`. Default `"rule"` is today's
  hairline row (Date keeps it). `"none"` renders the label and the child
  only — for the three `MenuSelect` cells, whose trigger IS the underline.
  The `glyph` prop becomes optional and is dropped by those three callers.
- Site and Surface: `<MenuSelect variant="underline" label="Site" value=… options={SITES} onChange=…/>`.
  `SITES` and `SURFACES` already have `{value,label}`; `MenuSelect` is generic
  over `T extends string`, so `EventSite` types through with no cast.
  `SURFACES`' `""` option labelled `—` is a plain option; `MenuSelect` prints
  the matched label, which is `—`, so no placeholder concept is needed.
- Format: `<MenuSelect variant="underline" label="Format" value={draft.format.value}
  options={FORMATS.map(f => ({ value: f.value, label: f.sets, description: f.scoring }))}
  onChange={(value) => { const chosen = FORMATS.find(f => f.value === value); if (chosen) onEdit({ format: chosen }); }} />`.
  The `note` under the cell (the scoring half) is kept — the closed trigger
  prints the sets half, the note prints the scoring half, exactly as `2b`
  draws it. **`onEdit` still receives the `FORMATS` row, never a parsed
  string** (guardrails §3.1); this design changes the control, not the
  assignment. `FieldSelect` is deleted with its two callers.
- Date: `FieldCell`'s rule row gains `focus-within:border-[var(--blue)] focus-within:border-b-2`
  (keep `border-b` width stable by pairing with `focus-within:pb-[6px]`
  so the 1px growth does not shift the glyph — the pattern
  `DetailsStepContent.tsx:508` uses), and the date input gets
  `data-focus-ring="none"`. Its browser calendar-picker icon is hidden
  (`[&::-webkit-calendar-picker-indicator]:hidden` + the same for the
  clear button); the Lucide calendar stays and the input still opens the
  picker on click/Space. That closes the two-glyphs defect found while
  measuring, which is in scope only because it is the same cell.
- `useWizardKeys` already treats an open `[aria-expanded="true"]` as owning
  Enter/Escape, so a `MenuSelect` open on this step does not step back on
  Escape. Verify in the build.

`static-tournament-builder.tsx` has the same `FieldCell` pattern; it is
**not** in scope (brief non-goal), but the build task should note it so the
follow-up is obvious.

### Data flow

Unchanged. Nothing in this design touches what `useDualDraft.submit()`
sends; `adScoring` still travels as the chosen `FORMATS` row's literal.

### Error handling

None new. `MenuSelect` has no async path; the date input's empty value still
disables Continue via `draft.date.trim() === ""`.

### Testing

- `tests/schedule-static-copy.spec.ts` reads `static/*.tsx` source: no drawn
  copy changes here, but the chooser's header comment and the row comment
  change — confirm the spec asserts strings, not comments.
- New pure-logic case: `FORMATS → MenuSelect options` mapping keeps
  `adScoring` a literal boolean per row (a tiny spec over the mapped
  array, in `tests/event-format-label.spec.ts` or a sibling).
- Browser verification per success criterion, on the harness (see below),
  measured the way this stage measured: `offCentreBy` on both axes for item
  1; computed `borderBottom`, `boxShadow`, `outlineStyle` on each
  `:focus-visible` control for item 4; the selected row's computed
  background and the presence of `svg.lucide-check` for item 3.

## Open questions

Carried forward from the brief, each now answered:

1. Item 3's second half — **not a logic defect**; resolved by making the
   pick visible. Stated above so the human can overrule it.
2. "Which viewport" — **vertical**, in the content area. The horizontal axis
   was already exact.
3. "How much bigger" — **32px**, a decision for the human to change in this
   file before stage 03 if they want 30 or 36.
4. Which control — **all three selects and the date input**; the Format
   overlay had no indicator at all.

New:

5. The chooser's "Add a one-off match" link still points at
   `/dashboard/team/schedule/new/single`, a route `splitstep-integration`
   retired (f8814ee). It is a dead link today. Out of this brief's scope and
   flagged for its own task: the roster's player profile is now where a
   one-off upload starts.

## Also consulted

Beyond the declared inputs (`brief.md`, `MAP.md`, `docs/ui-revamp-guardrails.md`,
`.skills/advantage-analytics-design/SKILL.md` — the Dropdown/Menu, Wizard
primitives, Settings selects and Focus sections):

- `src/components/dashboard/schedule/static/static-event-chooser.tsx`
- `src/components/dashboard/schedule/event-shell.tsx` (+ its two other importers, by grep)
- `src/components/dashboard/schedule/static/dual-school-step.tsx`
- `src/components/dashboard/schedule/static/new-dual-flow.tsx`
- `src/components/dashboard/schedule/static/dual-build-step.tsx` (`DualFactsStep`, `FieldCell`, `FieldSelect`, `LineRow`'s controls)
- `src/components/dashboard/schedule/static/event-mark.tsx` (the `size` union)
- `src/components/dashboard/matches/new-match-wizard/useWizardKeys.ts`
- `src/components/dashboard/matches/new-match-wizard/WizardShell.tsx` (`CONTENT_CLS` only)
- `src/components/ui/menu-select.tsx`
- `src/styles/design-system/colors.css` (`--surface-muted`, `--surface-subtle` values)
- `src/lib/data/programs-server.ts`, `src/lib/data/roster-server.ts` (fixture shapes)
- Claude Design project `afde9116-…`, `Events & Lineups.dc.html` — artboards 3b and 2c, via DesignSync
- Two temporary preview routes, `src/app/dev-preview/{chooser,dual}/page.tsx`,
  mounting the real components over fixtures with a fake 232px sidebar and
  44px header. **Untracked; they must be deleted before `npm test`** and are
  the stage 05 verification harness.
