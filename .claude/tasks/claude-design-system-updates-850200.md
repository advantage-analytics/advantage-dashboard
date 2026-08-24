# Tasks — claude/design-system-updates-850200

> Scope: bring DESIGN.md and the advantage-analytics-design skill back in line with the design system as shipped.

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue, then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Fold the shipped focus/token work into DESIGN.md and the design skill
- **status:** done
- **files:** DESIGN.md, .skills/advantage-analytics-design/SKILL.md (read-only:
  src/styles/design-system/{focus,effects,colors}.css, src/lib/ui/adv-button.ts,
  src/components/dashboard/team/invite-dialog.tsx, src/components/claim/program-search.tsx)
- **done when:**
  - [ ] SKILL.md's composite-field guidance names both shipped selectors — `focus-within:` for a box holding only the input, `has-[input:focus-visible]:` for a box that also holds focusable children — and says `focus-within` double-rings when a chip's remove button is focused. `invite-dialog.tsx` is cited as the second case, not the first.
  - [ ] No SKILL.md component recipe still instructs the builder to write `focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40` — each occurrence is removed or marked inert, so no snippet contradicts the section's own "Write nothing."
  - [ ] Both docs name the wrapper-ring pattern by that name and document `data-focus-ring="none"` as its opt-out, including why it is scoped to `:focus-visible` rather than an inline `boxShadow: "none"`.
  - [ ] DESIGN.md records the shipped values of `--focus-ring` and `--focus-ring-field` from effects.css and the 3:1 floor on `--field-ring` / `--ink-500`.
  - [ ] Every token defined in `src/styles/design-system/effects.css` and `focus.css` appears in DESIGN.md or SKILL.md, or is listed there as deliberately undocumented.
- **notes:** Docs-only; no component or CSS changes. Adjacent drift found but left out of scope — CLAUDE.md:151 still says "two Framer Motion curves" while both design docs list three (`--ease-chart`).

## T2 · Correct the stale focus-ring figures in the CSS comments
- **status:** todo
- **files:** src/styles/design-system/colors.css (the `--field-ring` rationale,
  around lines 74-88), src/styles/design-system/effects.css (the
  `--focus-ring-field` comment, around lines 41-46), DESIGN.md (the Focus
  bullet), .skills/advantage-analytics-design/SKILL.md (the Focus section)
- **done when:**
  - [ ] `colors.css`'s `--field-ring` comment names `#F5F5F5` (the value `--surface-field` resolves to) as the field surface, not `#F7F7F7`, and states the pair as 3.54:1 / 3.25:1 against white and that surface, with the retired `#E5E5E5` at 1.26:1 / 1.16:1.
  - [ ] The same comment no longer claims the `-30` band "tops out near 1.4:1 whatever colour it carries" — it states that 30% alpha cannot reach 3:1 at all (pure black composites to ~2.1:1) and that the band measures 1.38:1 at today's `--ink-500`.
  - [ ] `effects.css`'s two-layer comment computes the shipped band: `--ink-500` at 30% over white composites to `#DBDBDB` (0.3x136 + 0.7x255 = 219.3), 1.38:1 — not the `0.3x229 + 0.7x255 = 247.2` arithmetic, whose 229 is the retired `#E5E5E5`.
  - [ ] DESIGN.md and SKILL.md carry `~2.1:1` too — neither still says `2.12:1` — and every other focus figure in all four files agrees value-for-value.
  - [ ] Every figure is recomputed from the WCAG relative-luminance formula rather than copied from another file. Where a composite lands exactly on `.5` (pure black at 30% over white is exactly 178.5, giving 2.12 / 2.11 / 2.10 under half-to-even / no rounding / half-up), the figure is written to the precision that holds under every rounding — `~2.1:1` — never to two decimals.
  - [ ] The CSS diff is comment-only: no declaration, selector, token value or ordering changed. `npm run lint`, `npx tsc --noEmit` and `npm test` stay green.
- **notes:** Widened from CSS-only after the first attempt was gated
  `needs-work`: the original criterion demanded `2.12:1`, which is an artifact
  of Python's banker's rounding, not of the formula. `~2.1:1` is the honest
  figure, and it now has to land in all four files at once or they disagree.
  **Restore the first attempt rather than redoing it** — `git stash apply
  9fa3b7597418a95668d5588458df1773ec704944` has the CSS comments already
  rewritten and re-verified; everything in it except the `2.12:1` figure was
  confirmed correct by the reviewer. These comments are what DESIGN.md and
  SKILL.md were originally written from, which is how four wrong figures reached
  the docs in T1. Verified figures are in commit 55087b4's message.

## T3 · Delete the inert focus-visible:ring-* declarations under src/
- **status:** todo
- **files:** ~62 files under src/ carrying `focus-visible:ring-*` (start from
  `grep -rl 'focus-visible:ring-' src/`), notably src/components/ui/input.tsx,
  src/components/ui/button.tsx, src/components/dashboard/sidebar/rail-item.tsx;
  read-only: src/styles/design-system/focus.css
- **done when:**
  - [ ] Every `focus-visible:ring-*` declaration removed is first confirmed inert — the element it sits on matches one of `focus.css`'s selectors (`a[href]`, `button`, `[role="button"]`, `summary`, `[tabindex]:not([tabindex="-1"])`, or `input`/`select`/`textarea`), so the unlayered rule already overrides it. Any element that does NOT match (e.g. `contenteditable`, or a focusable element outside that list) is left alone and named in the commit message.
  - [ ] `src/components/ui/input.tsx` no longer carries `focus-visible:ring-[#E5E5E5]/30` — the value retired for measuring 1.26:1 — and `src/components/ui/button.tsx` no longer carries `focus-visible:ring-ring/50 focus-visible:ring-[3px]`.
  - [ ] Companion `focus-visible:ring-offset-*` and `focus-visible:ring-inset` classes are removed alongside the ring they modified, and no `focus-visible:outline-none` is removed (focus.css sets `outline: none` itself, but the utility is harmless and removing it is a separate question).
  - [ ] The layering is NOT changed: `globals.css` still imports `design-system/index.css` outside any `@layer`. This task removes dead classes only.
  - [ ] A keyboard pass over at least three reworked surfaces — one shadcn `Input`, one `Button`, and the sidebar rail — shows the design-system ring still drawn on focus, with a screenshot or measured `box-shadow` for each.
  - [ ] `npm run lint`, `npx tsc --noEmit` and `npm test` stay green.
- **notes:** ~190 declarations across 62 files, all currently discarded because
  `focus.css` is unlayered and Tailwind utilities live in `@layer utilities`.
  Deleting them is behaviour-preserving *today*; the point is that they stop
  being a trap and stop hiding a contradicting intent. The structural fix —
  moving the design-system import into a named layer, plus a lint rule that
  makes the dead class a build failure — is deliberately NOT in this task,
  because with these classes still present it would flip ~190 declarations from
  inert to live in one commit. File it after this lands.
