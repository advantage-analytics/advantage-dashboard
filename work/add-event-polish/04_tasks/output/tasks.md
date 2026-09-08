# Tasks appended by stage 04 — add-event-polish

Mirror of the block appended to `.claude/tasks/claude-dual-match-tournament-designs-26cc2f.md` on 2026-09-08. Drafted inline under task-add's rules: the plan was already shaped and gated, and this file is the review surface.

## T22 · Chooser centred on the vertical axis too
- **status:** todo
- **model:** sonnet
- **files:** src/components/dashboard/schedule/event-shell.tsx, src/components/dashboard/schedule/static/static-event-chooser.tsx
- **done when:**
  - [ ] `EventShell`'s default (non-`flush`) body carries `flex flex-col` beside its existing `min-h-0 flex-1 overflow-y-auto px-12 pb-8 pt-[26px]`, and nothing else on the shell changes; its header comment gains one sentence saying the body is a flex column so a caller may centre with `my-auto`
  - [ ] The chooser's column wrapper reads `mx-auto my-auto w-full max-w-[820px] pt-[10px]`, and the two header-comment passages that describe the body as top-aligned / the artboard's `padding:36px 48px 0` are rewritten to say the column centres on both axes and why
  - [ ] Measured on `/dev-preview/chooser` at 1440×900 and at 1200×800: the column's centre (`h1.left`→`[role=radiogroup].right`, `h1.top`→the aside's bottom) is within 1px of `[data-content-area]`'s centre on both axes — the numbers are written into the task log
  - [ ] At a short viewport (1200×420) the column top-aligns at `26+10px` and the body scrolls (`scrollHeight > clientHeight`); a throwaway preview mounting `EventShell` with a tall block child in a 400px box shows the child's `top` = body `top + 26` and the body scrolling — the block-layout invariant `single-detail.tsx` and `match-detail-shell.tsx` rely on. If that does not hold, stop and report rather than adjusting either caller
  - [ ] `npx tsc --noEmit` clean, `npm run lint` clean (the harness routes are untracked and `npm test` is not expected to pass until T25)
- **notes:** From `work/add-event-polish/03_plan/output/plan.md` step 1. Harness: `src/app/dev-preview/chooser/page.tsx` (untracked — a fresh worktree will not have it; copy it in from the main checkout, dev server `npx next dev -p 3131`). Non-goals: no `centered` prop on the shell unless the invariant check fails; no change to the other two callers.

## T23 · School rows: 32px mark, subtle wash, Signal Blue check
- **status:** todo
- **model:** sonnet
- **files:** src/components/dashboard/schedule/static/event-mark.tsx, src/components/dashboard/schedule/static/dual-school-step.tsx
- **done when:**
  - [ ] `EventMark`'s `size` prop is `26 | 32 | 48`; 32 takes the 26 branch's type scale (`large` stays `size === 48`), and the component comment names the third size and its one user
  - [ ] `SchoolRow` draws `EventMark size={32}` in a `grid-cols-[32px_minmax(0,1fr)_96px_13px]`; measured on `/dev-preview/dual` step 1 the mark's box is 32×32 and the row's height is the same before and after (record both — expected 52px)
  - [ ] A selected row (`aria-pressed="true"`) has computed `backgroundColor` `rgb(245, 245, 245)` (`--surface-subtle`), contains `svg.lucide-check` (13px, `text-[var(--blue)]`, `strokeWidth={2}`, `aria-hidden`) and no `svg.lucide-chevron-right`; an unselected row has a transparent background at rest, `--surface-subtle` on hover, the chevron and no check — measured with the pointer parked off the rows
  - [ ] After a click on a row, `[data-wizard-continue].disabled === false` and clicking it lands on step 2 (`h1` = "When it's played, and how."); focusing the row and pressing Enter does the same; Tab to a row and Space selects it
  - [ ] The row's two comments are rewritten: the mark comment no longer claims parity with the schedule table's 26px, and the wash comment records that `--surface-muted` (#FAFAFA) on the white card measured invisible; `npx tsc --noEmit` and `npm run lint` clean
- **notes:** Plan step 2. `new-dual-flow.tsx` is not touched — Continue gating was measured correct in stage 02. Harness: `src/app/dev-preview/dual/page.tsx` (untracked, see T22's note).

## T24 · Facts step: MenuSelect for Site, Surface and Format; the Date rule answers focus
- **status:** todo
- **model:** opus
- **files:** src/components/dashboard/schedule/static/dual-build-step.tsx, tests/dual-format-options.spec.ts (new)
- **done when:**
  - [ ] `FieldCell` takes `chrome?: "rule" | "none"` (default `"rule"`, today's hairline row) and `glyph` is optional; Site, Surface and Format render `MenuSelect variant="underline"` inside `FieldCell chrome="none"` with `label` = the eyebrow text; `FieldSelect` and the opacity-0 Format `<select>` are deleted
  - [ ] Format's options come from an exported pure `formatOptions(FORMATS)` returning `{ value, label: sets, description: scoring }` per row, and `onChange` looks the chosen `FORMATS` row up by value and calls `onEdit({ format: chosen })` — the row object, never a parsed string; the `note` under the cell still prints the scoring half
  - [ ] `tests/dual-format-options.spec.ts` asserts four options, each `label`/`description` equal to its row's `sets`/`scoring`, and that resolving every option's `value` through `FORMATS` yields an `adScoring` that is a literal boolean; it passes alone via `npx playwright test tests/dual-format-options.spec.ts`
  - [ ] Date: the rule row carries `focus-within:border-b-2 focus-within:border-[var(--blue)] focus-within:pb-[6px]`, the `<input type="date">` carries `data-focus-ring="none"`, and the browser's picker icon and clear button are hidden so one Lucide calendar remains; the picker still opens on click and on Space
  - [ ] Measured on `/dev-preview/dual` step 2, tabbing every control and reading each `:focus-visible` element: Date → `box-shadow: none`, `outline-style: none`, cell rule `2px rgb(59, 130, 246)`; Site, Surface and Format triggers → `box-shadow: none`, `outline-style: none`, own rule `2px rgb(59, 130, 246)`; Escape on an open menu closes it without stepping back (`h1` unchanged); picking "One set · ad" prints "One set" on the trigger, "Ad scoring" in the note and updates the pinned bar; `npx tsc --noEmit` and `npm run lint` clean
- **notes:** Plan step 3. `docs/ui-revamp-guardrails.md` §3.1 binds: `adScoring` travels only as the chosen `FORMATS` row's literal. `DualFactsStep`'s header comment is updated (the overlay is gone; the Format cell is why `MenuSelect` exists) and gains a one-line note that `static-tournament-builder.tsx`'s `FieldCell` has the same pattern and is a separate task — do not touch that file. Harness as in T22/T23.

## T25 · Harness down, full suite green
- **status:** todo
- **model:** sonnet
- **needs:** T22, T23, T24
- **files:** src/app/dev-preview/ (delete), .claude/launch.json (delete)
- **done when:**
  - [ ] `src/app/dev-preview/` and `.claude/launch.json` no longer exist and `git status --short` shows nothing untracked under `src/app/`; the dev server on port 3131 is stopped
  - [ ] `npm run map` produces no diff to `MAP.md`
  - [ ] `npx tsc --noEmit`, `npm run lint` and `npm test` are all green, and `tests/schedule-static-copy.spec.ts` passed untouched (this feature changed no drawn string)
- **notes:** Plan step 4. Last, because T22–T24 verify on the harness this removes.
