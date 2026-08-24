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
- **status:** done
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

## T4 · Close the remaining blue focus surfaces
- **status:** todo
- **files:** src/components/dashboard/settings/settings-inline-select.tsx:36,
  src/components/dashboard/settings/team-settings-form.tsx:231,
  src/components/dashboard/settings/settings-card.tsx:193,
  src/components/claim/program-search.tsx:88,
  src/components/claim/claim-shell.tsx:266,
  src/components/dashboard/team/invite-dialog.tsx:210
  (classified by grep; a subagent should re-verify each is boxed, not underline)
- **done when:**
  - [ ] None of the six boxed fields above turns blue on focus — verified in a
        browser with real keyboard focus (Tab, not `.focus()`), reading
        `getComputedStyle` on the focused element and its wrapper: neither
        `border-color` nor `box-shadow` contains `rgb(59, 130, 246)`
  - [ ] The three underline fields still DO turn blue —
        `settings/profile-form.tsx:349`, `schedule/lineup-editor.tsx:295`,
        `team/add-player-dialog.tsx:78`. `DESIGN.md:92` documents that
        vocabulary deliberately; flattening it is a failure, not a bonus
  - [ ] Every field touched still shows a visible focus indicator — none is
        left with no indicator at all
  - [ ] Blue focus is unchanged on buttons, links, tabs and pills, confirmed
        in the same browser pass
- **notes:** Two of the six — `program-search.tsx:88` and
  `invite-dialog.tsx:210` — draw the blue on a wrapper `<div>` via
  `focus-within:ring-[var(--blue-ring-40)]`. A `<div>` matches none of
  `focus.css`'s `:where()` selector lists, so no global rule reaches them and
  the Tailwind utility applies normally. These are the two that render a
  literal blue box around a field, and they are the closest thing left to the
  bug this branch was opened for. The other four use
  `focus:border-[var(--blue)]`; `border-color` is not part of `box-shadow`, so
  `focus.css` cannot govern it either. Both mechanisms need a local fix — do
  not try to solve either by widening the global rule.

## T5 · Raise the field focus ring to WCAG 1.4.11's 3:1
- **status:** todo
- **files:** src/styles/design-system/colors.css (`--field-ring`,
  `--field-ring-30`), possibly src/styles/design-system/effects.css
  (`--focus-ring-field`)
  (guess — the token is consumed only by `focus.css`)
- **done when:**
  - [ ] `--field-ring` reaches at least 3:1 against **both** white and
        `#F7F7F7`. Both surfaces matter: the `statistics/match-selector.tsx`
        date inputs sit on `#F7F7F7`. Measured today — `#E5E5E5` is 1.26:1 /
        1.18:1; `#949494` is the lightest grey clearing white at 3.03:1 but
        fails `#F7F7F7` at 2.83:1; the existing `--ink-500` `#888888` clears
        both at 3.54:1 / 3.31:1
  - [ ] The opaque 1px layer carries the contrast, not the translucent band —
        a 30% wash of any grey on white cannot reach 3:1 (30% `#888888`
        computes ~1.35:1), so `--field-ring-30` must not be the load-bearing
        layer
  - [ ] The ring is still neutral — no `rgb(59, 130, 246)` reintroduced on any
        text field, checked with the T1-era contract grep and in the browser
  - [ ] Verified with real keyboard focus (Tab, not `.focus()`) on a bare
        input — `auth/form-field.tsx:79` on `/login`, which needs no
        credentials — and on a native checkbox, `statistics/match-selector.tsx:138`,
        which is 14px and is where a faint ring fails hardest
  - [ ] Blue `--focus-ring` on buttons, links, tabs and pills is unchanged
- **notes:** The pre-branch blue ring measured 1.62:1, so it failed this bar
  too — this is not a regression the branch invented, but it did move the
  number the wrong way and this closes it properly for the first time. Expect a
  visibly heavier ring than today's: 3:1 on white means roughly `#949494` or
  darker, which is a real change in how a focused field looks. That is the
  point, but it is worth a look before merging rather than after. `--ink-500`
  is the obvious candidate precisely because it already exists and already
  clears both surfaces. Whatever value lands also needs a `.dark` counterpart —
  `--field-ring` currently has none while `--focus-ring` flips via
  `--blue-ring-40` (`colors.css:183`).
