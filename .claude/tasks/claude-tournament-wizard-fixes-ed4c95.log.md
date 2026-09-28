# Run log — claude/tournament-wizard-fixes-ed4c95

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Default the tournament builder's format to No-Ad — done

- **gate:** mechanical GATE PASS (lint, typecheck, full suite); completion review VERDICT: pass
- **changed:** `static-tournament-builder.tsx` `DEFAULT_FORMAT` now looks up the `"bo3-no-ad"` row of `FORMATS` (doc comment updated to say no-ad, matching the dual builder); the private `formatFor` helper is exported so the derived object can be asserted; new `tests/tournament-format-default.spec.ts` (2 cases: no-format seed → adScoring false / bestOf 3; `"bo3-ad"` seed → Ad); `tests/schedule-static-copy.spec.ts` pinned literal moved from `"bo3-ad"` to `"bo3-no-ad"` with its comment corrected.
- **follow-ups:** 1. `event-fact-fields.tsx` `formatOptions(FORMATS)` order — now that both builders default to no-ad, consider listing the no-ad rows first.

## T2 · Default lets to Play On for college matches — done

- **gate:** mechanical GATE PASS (lint, typecheck, full suite); completion review VERDICT: pass
- **changed:** `recordResult` (`writes-server.ts`) writes `format.play_on_lets: true` on both the singles and doubles branch; the wizard's preset seed (`useUploadMatchWizard.ts` ~1436) sets `playOnLets: true` when `preset.eventKind` is `dual` or `tournament`, leaving `bestOf`/`adScoring` lines untouched and `DEFAULT_FORM_DATA.playOnLets` false for personal uploads. Specs: `tests/schedule-outcome-actions.spec.ts` (writer, both disciplines) and `tests/upload-validation.spec.ts` (hook harness: dual, tournament, no-preset).
- **follow-ups:** 1. The `attachLine`/`attachedLine` path in the same hook does not seed `playOnLets` from `eventKind` — if attached-line college matches should also default to Play On, that is a separate small change. 2. No hint near the Lets toggle explains why it defaults on for college matches; add one if it surprises coaches.
