# Run log — claude/workspace-profile-empty-states-a6a40b

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Shared DayZeroGrade + profile day-zero copy helper — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite); completion review VERDICT: pass (all four criteria met, no out-of-scope files).
**changed:** `day-zero-shape.tsx` gains `DayZeroGrade` (sr-only sentence + `inert` div, mask on both `maskImage`/`WebkitMaskImage` from one `DAY_ZERO_GRADE` const) and its doc no longer says Home is built apart; `day-zero-home.tsx` renders it with the same classes and unchanged sr-only text, no gradient literal left. New pure `src/lib/ui/profile-day-zero-copy.ts` (four voices + sr-only description) with `tests/profile-day-zero-copy.spec.ts` (7 passing).
**follow-ups:** 1. `team/team-day-zero-home.tsx` still carries the same mask string inline — folding it onto `DayZeroGrade` would retire the last duplicate. 2. The widget-states PostToolUse hook did not fire because the subagent edited via Bash; the rendered Home markup is byte-identical, so nothing was missed, but the gate was marked by the runner, not the skill.

## T2 · Profile card ghosts + serve card CardEmpty shell — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite); completion review VERDICT: pass (all five criteria met, six files all inside `files:`).
**changed:** `LastMatchGhost`, `MatchHistoryGhost`, `LineHistoryGhost` (header + private `LineHistoryGhostRows`) and `ServePlacementGhost` exported; `LastMatchEmpty` and the match-history `CardEmpty` branch removed; `LastMatchCard({ match })` returns the match or null; serve card takes `subject` and, with `zoneStats` null, draws its own `surface-card` + eyebrow + `CardEmpty` around the ghost with the "serve map lands here" band and no action; Home's strip output unchanged; `page.tsx` call sites updated only.
**follow-ups:** 1. `ServePlacementQuietStrip`'s `emptyCopy` prop now has no caller — delete after T3 settles. 2. `serve-placement-quiet-strip.tsx` imports `CardFooter` without using it (pre-existing). 3. The serve card's empty section uses `gap-3` where the retired `LastMatchEmpty` used `mt-3.5`; settle one spacing if any card-level empty survives T3.
