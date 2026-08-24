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
