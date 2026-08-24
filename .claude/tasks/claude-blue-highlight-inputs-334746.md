# Tasks — claude/blue-highlight-inputs-334746

> Scope: focus-state styling on form inputs — make text fields share one
> neutral focus treatment instead of a mix of blue and grey rings.

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

## T1 · Make input focus rings neutral, not blue
- **status:** done
- **files:** src/components/dashboard/statistics/match-selector.tsx,
  src/components/dashboard/schedule/score-entry.tsx,
  src/components/dashboard/schedule/single-score-entry.tsx
  (guess — a subagent should confirm against src/components/ui/input.tsx)
- **done when:**
  - [ ] No `<input>` or `<textarea>` in `src/` carries a blue focus ring —
        `grep -rn --include='*.tsx' '<input\|<textarea' -A8 src/ | grep -E 'blue-ring-40|accent-blue-ring|ring-\[#3B82F6\]'`
        returns nothing (it returns 5 matches today)
  - [ ] Tabbing into each changed field still shows a visible non-blue focus
        indicator matching `src/components/ui/input.tsx` — the ring is
        recoloured, never deleted
  - [ ] Blue focus rings on buttons, links, tabs, sidebar rows and filter
        pills are untouched — those call sites still match the same grep
  - [ ] `npm run lint` passes, and no other property (border, background,
        size, radius) changed on the touched inputs
- **notes:** A focus ring is an accessibility requirement — this task
  recolours it to the neutral grey the shared primitives already use, it does
  not remove focus styling. Blue rings on non-input controls are intentional
  design-system and out of scope.

## T2 · Carve text fields out of the design-system focus-ring spec
- **status:** done
- **files:** .skills/advantage-analytics-design/SKILL.md (the `### Focus`
  section at line 655), DESIGN.md (line 92)
  (guess — confirm against src/components/ui/input.tsx:12 and
  src/styles/design-system/focus.css)
- **done when:**
  - [ ] The `### Focus` section distinguishes text fields from other controls:
        it names the neutral `focus-visible:border-[#E5E5E5]
        focus-visible:ring-[#E5E5E5]/30 focus-visible:ring-[1px]` treatment
        from `ui/input.tsx:12` for `<input>`/`<textarea>`/`<select>`, and keeps
        `ring-[#3B82F6]/40` documented for buttons, links, tabs and pills
  - [ ] The carve-out states that `src/styles/design-system/focus.css` applies
        the blue `--focus-ring` to `input, select, textarea` at zero
        specificity, so a hand-rolled text field renders blue unless it
        overrides — the doc describes today's behaviour, not an aspiration
  - [ ] `DESIGN.md:92` ("2px ring at blue 40% — except underline inputs") no
        longer contradicts the skill file: either updated to agree, or left
        alone with the reason stated in the diff
  - [ ] Documentation only — `git diff --stat` lists no `.css`, `.ts` or
        `.tsx` file, and the T1 contract grep still returns nothing
- **notes:** Scoped deliberately to the docs. The CSS default that actually
  paints the blue ring is T3. Writing the neutral treatment into the spec
  without that fix would make the spec describe something the code does not
  produce for unstyled inputs. If T3 lands first, criterion 2 should describe
  the post-T3 behaviour instead — the requirement is that the doc match the
  code, not that it match this wording.

## T3 · Make the global focus-ring default neutral for text fields
- **status:** todo
- **files:** src/styles/design-system/focus.css,
  src/styles/design-system/effects.css
  (guess — `--focus-ring` is defined at effects.css:40 and consumed at
  focus.css:27)
- **done when:**
  - [ ] `focus.css` splits its `:where()` selector list in two: `input`,
        `select` and `textarea` resolve to a neutral focus ring, while
        `a[href]`, `button`, `[role="button"]`, `summary` and
        `[tabindex]:not([tabindex="-1"])` still resolve to the blue
        `--focus-ring`
  - [ ] The neutral value is a named token defined beside `--focus-ring` in
        `effects.css` (e.g. `--focus-ring-field`), matching the
        `ui/input.tsx:12` treatment — not a box-shadow hardcoded inline in
        `focus.css`
  - [ ] Keyboard-focusing an input that sets no focus classes of its own —
        `src/components/auth/form-field.tsx:79` is one — shows a visible
        neutral ring in the browser: not blue, and not absent
  - [ ] Both rules stay inside `:where()` so specificity remains 0 —
        `ui/input.tsx` and the six call sites T1 changed still override the
        default rather than fighting it
  - [ ] Blue focus is still visible in the browser on a button, a nav link and
        a tab, confirming the split did not neutralise non-input controls
- **notes:** This is the change that actually stops unstyled inputs rendering
  a blue focus box — T1 only fixed call sites that named the blue in their
  className. Read the header comment in `focus.css` before editing: this rule
  exists because the reset left focused controls with no indicator at all,
  a WCAG 2.4.7 failure that survived review precisely because nothing looks
  wrong unless you navigate by keyboard. Browser verification is in the
  criteria for that reason — grep cannot see this one. Watch the underline
  input pattern noted at `DESIGN.md:92`, which deliberately thickens to a 2px
  blue rule; do not silently flatten it.
