# Run log — claude/blue-highlight-inputs-334746

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Make input focus rings neutral, not blue — done
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing
  react-hooks warnings, baseline unchanged), `npx tsc --noEmit` clean, `npm test`
  66/66 passed. Completion review — `VERDICT: pass`; it verified by compiling the
  Tailwind output for each changed className rather than reading class strings,
  and independently confirmed the `ring-inset` reasoning behind the one
  deviation from the reference treatment. Guardrails — `pipeline-guardrails-reviewer`
  ran (diff touches `src/components/dashboard/`) and reported clean, explicitly
  confirming the diff goes nowhere near the three wizard inputs that silently
  misattribute statistics. `rls-boundary-reviewer` skipped: the diff touches no
  `src/lib/supabase/`, `src/lib/data/`, `src/app/api/` or `supabase/migrations/`
  path and adds no table, view or query; `git ls-files --others` was empty, so
  no untracked file hid such a surface.
- **changed:** Six focus rings on text inputs recoloured from blue to the neutral
  grey treatment already in `src/components/ui/input.tsx:12`. Five were the call
  sites the contract grep names — `statistics/match-selector.tsx:104,112`,
  `schedule/score-entry.tsx:179,199`, `schedule/single-score-entry.tsx:157`. The
  sixth, `matches/matches-page-content.tsx:604`, is a blue-ringed `<input>` the
  criterion's `-A8` grep window misses by one line (the tag opens at 595); the
  reviewer judged it in scope rather than creep. That one field kept `ring-2` and
  took a colour-only change, because its resting state is `ring-1 ring-inset
  ring-[#EAECF0]` and the literal 1px/30% reference would have rendered the
  focused ring fainter than the unfocused one — a focus indicator that vanishes
  on focus. Blue rings on buttons, links, tabs, sidebar rows and filter pills
  are untouched.
- **note:** Both reviewers observed the same thing independently — the neutral
  ring is genuinely lower contrast than the blue one it replaces. That is the
  app-wide baseline from `ui/input.tsx`, not something this task invented, but
  it is worth a visual check on `/dashboard/team/schedule/[eventId]`, where the
  26px score cells make the indicator faintest.

## T2 · Carve text fields out of the design-system focus-ring spec — done
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing react-hooks
  warnings, baseline unchanged), `npx tsc --noEmit` clean, `npm test` 66/66
  passed. Completion review — `VERDICT: pass`; because this is a
  documentation-accuracy task, the reviewer was asked to verify every factual
  claim the new prose makes against the code rather than check that words were
  added, and it traced each one: the `:where()` selector list, `--focus-ring`
  through to `rgba(59,130,246,0.40)`, and the quoted class string byte-for-byte
  against `ui/input.tsx:12`. Guardrails — BOTH skipped, and legitimately: the
  diff touches no `src/` path at all, only `.skills/`, `DESIGN.md` and this
  queue file. Confirmed from `git diff HEAD --stat` and an empty
  `git ls-files --others --exclude-standard`, so no untracked file hid a
  dashboard or data-layer surface.
- **changed:** `.skills/advantage-analytics-design/SKILL.md` — the `### Focus`
  section grew from 4 lines to ~24. It keeps the blue
  `ring-2 ring-[#3B82F6]/40` string for buttons, links, tabs and pills, adds the
  neutral `border-[#E5E5E5] ring-[#E5E5E5]/30 ring-[1px]` string for text
  fields, and states that `focus.css` currently hands the blue `--focus-ring` to
  bare `input, select, textarea` at specificity 0 — so the doc describes today's
  behaviour, not the post-T3 world. `DESIGN.md:92` updated to agree rather than
  left alone; the implementer's reason (docs/README.md indexes only `docs/*`, so
  nothing marks DESIGN.md point-in-time, and its header already carries live
  corrections) was checked and held.
- **note:** The reviewer flagged one clause as editorial rather than sourced —
  "blue on a focused field reads as a validation state". The codebase's actual
  validation colour is red (`aria-invalid:border-destructive` in `input.tsx`),
  not blue. No criterion required that sentence to be sourced, so it did not
  fail the gate, but in a doc whose whole product is accuracy it is worth
  deleting on the next pass through that file. Two follow-ups surfaced for T3:
  `DESIGN.md:91` ("same vocabulary as Input focus") reads ambiguously now, and
  `schedule/lineup-editor.tsx:295` styles a focus *border* with `outline-none`,
  so it does not override the focus.css box-shadow and currently renders both a
  blue ring and a blue underline.
