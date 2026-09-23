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

## T3 · ProfileDayZero composition, page branch, docs, render spec — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite; the subagent's own full run hit two live-DB flakes, program-owner-name-live and viz-bands-rls, both green on re-run); completion review VERDICT: pass (all five criteria met, four files all inside `files:`).
**changed:** new `profile-day-zero.tsx` — one 13px sentence from `profileDayZeroCopy` with at most one inline import link, then `DayZeroGrade` over the empty KPI strip and the four ghost cards in the page's 2:1 grid, no bands, no buttons; `page.tsx` branches on `matchesPlayed === 0`; the DS empty-and-loading day-zero row lists the file as the one day zero with no offer; `tests/profile-day-zero.spec.ts` (7 passing) pins the single inert masked region, the absence of primaries and bands inside it, the per-viewer sentence and link, the serve card's band, and Home's unchanged mask.
**follow-ups:** 1. `roster/[playerId]/loading.tsx` still flashes the populated skeleton before a zero-match profile resolves — needs a per-player presence read (cf. 651d613f). 2. `tests/fixtures/vm-modules.ts:104` has an unused eslint-disable directive (pre-existing warning). 3. From T2: `ServePlacementQuietStrip.emptyCopy` is now caller-less and `CardFooter` is imported unused there.
