# Plan — add-event-polish

Four steps of work and one of cleanup, cut by file so each runs in one fresh
context. Steps 1–3 are independent of each other and can run in any order;
step 4 must run last because it removes the harness the first three verify
with. Nothing here exceeds the brief: three screens, four fixes, no change to
what the wizard writes.

**The harness.** Two untracked routes already exist from stage 02 —
`src/app/dev-preview/chooser/page.tsx` and `src/app/dev-preview/dual/page.tsx`
— mounting the real components over fixtures with a fake 232px sidebar and
44px header. Every step below verifies on them with the dev server on port
3131 (`.claude/launch.json` is present, also untracked). They are deleted in
step 4; until then `npm test` fails on the route map, which is expected —
steps 1–3 run `npx tsc --noEmit` and `npm run lint` only.

Every step's verification is a **measurement**, done the way stage 02 measured
(`getComputedStyle` on the focused element, `getBoundingClientRect` on the
column), not an impression from a screenshot. Screenshots are kept as evidence
beside the numbers, not instead of them.

---

## Step 1 — Chooser: centred on the vertical axis too

**Files**
- `src/components/dashboard/schedule/event-shell.tsx`
- `src/components/dashboard/schedule/static/static-event-chooser.tsx`

**Change**
- `EventShell`'s default (non-`flush`) body gains `flex flex-col` beside its
  existing `min-h-0 flex-1 overflow-y-auto px-12 pb-8 pt-[26px]`. Nothing
  else on the shell moves. Add one sentence to the shell's header comment:
  the body is a flex column so a caller can centre with `my-auto`; a flex
  item's `min-height:auto` keeps a tall body overflowing and scrolling as it
  did.
- The chooser's column wrapper becomes `mx-auto my-auto w-full max-w-[820px] pt-[10px]`.
- Rewrite the two now-false passages of the chooser's header comment: the
  "second departure" paragraph (the column centres on both axes now, and
  why) and the body-padding comment above the wrapper (it still describes
  the artboard's `padding:36px 48px 0` and says the content is top-aligned).

**Verification**
1. `/dev-preview/chooser` at 1440×900 and 1200×800: read
   `[data-content-area]` and the column (`h1.left` … `[role=radiogroup].right`,
   `h1.top` … the aside's bottom). Assert the column's centre is within 1px of
   the area's centre on **both** axes. Record the numbers.
2. Short viewport (e.g. 1200×420): the column top-aligns at `pt-[26px]+pt-[10px]`
   and the body scrolls — `scrollHeight > clientHeight`, no overlap with the
   footer.
3. The shell's other two callers are unmoved. They need a session, so verify
   structurally: mount `EventShell` with a tall `<div>` child on a throwaway
   dev-preview page in a 400px-tall box and assert the body's `scrollHeight >
   clientHeight` and that the child's `getBoundingClientRect().top` equals
   the body's `top + 26`. That is the block-layout invariant those pages
   depend on. If it does not hold, stop and switch to the design's approach B
   (a `centered` prop on the shell) rather than adjusting the callers.
4. `npx tsc --noEmit`, `npm run lint`.

---

## Step 2 — School rows: a bigger mark, and a pick you can see

**Files**
- `src/components/dashboard/schedule/static/event-mark.tsx`
- `src/components/dashboard/schedule/static/dual-school-step.tsx` (`SchoolRow` only)

**Change**
- `EventMark`: `size: 26 | 32 | 48`. 32 takes the 26 branch's type scale
  (`large` stays `size === 48`). Note the third size in the component's
  comment and where it is used.
- `SchoolRow`:
  - grid `grid-cols-[32px_minmax(0,1fr)_96px_13px]`, `size={32}`.
  - wash: `selected ? "bg-[var(--surface-subtle)]" : "hover:bg-[var(--surface-subtle)]"`.
  - trailing cell: `selected` → Lucide `Check` 13px, `strokeWidth={2}`,
    `text-[var(--blue)]`, `aria-hidden`; otherwise the existing
    `ChevronRight`. Same 13px box either way, so nothing shifts.
  - Comments: the mark comment stops claiming parity with the schedule
    table's 26px and says why a pick row gets more; the wash comment records
    that `--surface-muted` (#FAFAFA) on the white card measured invisible,
    so the artboard's token is not to be restored.
- `new-dual-flow.tsx` is **not** touched: Continue gating was measured
  correct in stage 02.

**Verification**
1. `/dev-preview/dual` step 1: click a conference row via its button. Assert
   `aria-pressed="true"`, computed `backgroundColor` = `rgb(245, 245, 245)`,
   `svg.lucide-check` present in the row and `svg.lucide-chevron-right`
   absent; on an unselected sibling the reverse. Move the pointer off the
   row first (or measure with the mouse parked elsewhere) so hover is not
   what is being read.
2. Continue: `[data-wizard-continue].disabled === false` after the pick, and
   clicking it lands on step 2 (`h1` reads "When it's played, and how.").
   Also: focus the picked row and press Enter — same result.
3. Mark: `EventMark`'s box is 32×32 and the row's height is unchanged from
   before the step (measure before and after: expect 52px). The mark's
   initials are legible at 32 in the screenshot.
4. Keyboard: Tab to a row and press Space — same selection behaviour as
   click.
5. `npx tsc --noEmit`, `npm run lint`.

---

## Step 3 — Facts step: one focus indicator per cell

**Files**
- `src/components/dashboard/schedule/static/dual-build-step.tsx`
  (`DualFactsStep`, `FieldCell`, `FieldSelect`, and the `FORMATS` /
  `SITES` / `SURFACES` consts if they need a mapped form)
- one new spec, `tests/dual-format-options.spec.ts`

**Change**
- `FieldCell` gains `chrome?: "rule" | "none"` (default `"rule"`); `glyph`
  becomes optional. `"none"` renders the eyebrow and the child with no rule
  row and no glyph.
- Site, Surface, Format become `MenuSelect variant="underline"` inside
  `FieldCell chrome="none"`. `label` = the eyebrow text (accessible name).
  Format's options are `FORMATS.map(f => ({ value: f.value, label: f.sets, description: f.scoring }))`;
  `onChange` finds the `FORMATS` row by value and calls
  `onEdit({ format: chosen })` — **the row, never a parsed string**
  (guardrails §3.1). The `note` under Format stays. Extract that mapping
  as a small exported pure function (`formatOptions(FORMATS)`) so it can be
  tested without mounting the component.
- `FieldSelect` is deleted with its two callers.
- Date keeps `FieldCell` with the rule; the rule row gains
  `focus-within:border-b-2 focus-within:border-[var(--blue)] focus-within:pb-[6px]`
  (the `DetailsStepContent.tsx:508` pattern, so the 1px growth does not move
  the glyph) and the `<input type="date">` gets `data-focus-ring="none"`.
  Hide the browser's own picker icon and clear button
  (`[&::-webkit-calendar-picker-indicator]:hidden`, `[&::-webkit-clear-button]:hidden`)
  so only the Lucide calendar remains; confirm the picker still opens on
  click and on Space.
- Update `DualFactsStep`'s header comment ("What is a control and what is
  still a picture"): the opacity-0 overlay is gone and the three choices are
  `MenuSelect`; the Format cell is the reason the primitive exists.
- Do **not** touch `static-tournament-builder.tsx`'s `FieldCell`; leave a
  one-line note in `DualFactsStep`'s comment that it has the same pattern
  and is a separate task.

**Verification**
1. `/dev-preview/dual`: pick a school, Continue to step 2, click a blank
   area, then Tab through every control recording for each `:focus-visible`
   element: `boxShadow`, `outlineStyle`, and the visible rule's
   `borderBottomWidth`/`Color`. Expected, in tab order: Change (button ring —
   correct), Date (`box-shadow: none`, `outline: none`, cell rule
   `2px rgb(59,130,246)`), Site trigger (`none`/`none`/`2px rgb(59,130,246)`
   on the trigger itself), Surface (same), Format (same). Nothing on the
   step draws a ring except Change and the footer buttons.
2. Open Site with Enter: the `FloatMenu` shows Home/Away/Neutral; Escape
   closes the menu and does **not** step back (`h1` unchanged). Open Format:
   four rows each with the scoring half as its second line; pick "One set ·
   ad"; assert the trigger prints "One set" and the note prints "Ad scoring"
   and the pinned bar's format text updates.
3. Date: click the Lucide calendar — the native picker opens; only one
   calendar glyph is visible in the cell (screenshot).
4. `tests/dual-format-options.spec.ts`: over `formatOptions(FORMATS)`,
   assert four rows, each `label` is that row's `sets`, each `description`
   that row's `scoring`, and that resolving each option's `value` back
   through `FORMATS` yields an `adScoring` that is a literal boolean (never
   `null`/`undefined`). Run it alone with `npx playwright test tests/dual-format-options.spec.ts`.
5. `npx tsc --noEmit`, `npm run lint`.

---

## Step 4 — Harness down, gates green

**Files**
- delete `src/app/dev-preview/` (all three routes) and `.claude/launch.json`
- `MAP.md` only if `npm run map` changes it (it should not — the routes were
  never committed)

**Change**
Remove the harness. Stop the dev server on 3131.

**Verification**
`npm run map` (no diff), `npx tsc --noEmit`, `npm run lint`, `npm test` — all
green, and `git status` shows no untracked files under `src/app/`.

---

## Order and dependencies

```
1 (chooser)  ─┐
2 (rows)     ─┼─► 4 (cleanup + full suite)
3 (facts)    ─┘
```

1–3 touch disjoint files and share only the harness; run them in any order,
or in parallel worktrees if each copies the two harness routes in (they are
untracked, so a fresh worktree will not have them — the task for each step
must say so). Step 4 runs once, last, on the branch with 1–3 merged.

## Test strategy

- **Pure logic** gets a spec: the `FORMATS → MenuSelect options` mapping
  (step 3), because it is the one place this work sits next to a §3.1 input.
- **Layout and focus** are verified by measurement on the harness, per
  step, with the numbers written into the task log. No new Playwright
  browser specs: the suite is pure-logic by convention and the harness is
  temporary.
- **Regression**: `tests/schedule-static-copy.spec.ts` reads `static/*.tsx`
  source — none of the drawn strings change in this plan, so it should pass
  untouched; if a step trips it, the step changed copy it was not asked to.
- **Gates**: steps 1–3 run `tsc` + `lint`; step 4 runs everything, with the
  harness gone.
