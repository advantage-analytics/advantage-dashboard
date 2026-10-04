# Run log — claude/score-check-stop-reason

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Stop-reason answers in "Did it end early?" — done

**gate:** mechanical — lint pass, typecheck pass, tests 4475 passed / 38 failed; the 38 are video-playback browser specs (trim-step-navigation, match-video-probe, match-video-attachment-flow, match-video-file-step) that fail identically with T1 stashed — the container ships Chromium 1194 while Playwright wants 1200, and the shimmed build cannot decode the H.264 fixtures. Environmental, not this task. completion — VERDICT: pass.
**changed:** `STOP_REASONS`/`StopReason` in score-state.ts; optional `FormData.stopReason` (reset on Start over and on a line swap that drops the score); `ScoreCheckNotice` gains `dualLine` and `stopReason` — the dual line leads with "Yes, play stopped once the dual was decided" and settles to "Marked as unfinished. Play stopped once the dual was decided."; "Yes, it wasn't finished (time, weather)" renamed "Yes, stopped for time or weather"; pure tests in tests/upload-score-state.spec.ts.
**follow-ups:**

1. `.skills/advantage-analytics-design/reference/primitives.md` › "Warning question" still describes the early-end check as three answers; it is conditional now.
2. `tests/upload-score-regression.spec.ts` (opt-in browser spec) does not cover the dual answer.

## T2 · "No, it was a one-set match" with settled line and Undo — done

**gate:** mechanical — lint pass, typecheck pass, tests 4482 passed / 38 failed; the 38 are the same container-only video-playback specs logged under T1 (identical set, fail on base). completion — VERDICT: pass.
**changed:** `offersOneSet()` in score-state.ts (best of 3/5, exactly one finished set, nothing typed past set 1); `useScoreCheck` takes `handleFormatChange`, remembers the prior format, and exposes `chooseOneSet`/`undoOneSet`/`oneSetSettled`; `ScoreCheckNotice` offers "No, it was a one-set match" off-preset and off-dual, settling to "Set to best of 1 · <name> wins." with Undo; `SettledNotice` gains `actionLabel` (default "Change"); pure tests for `offersOneSet`.
**follow-ups:**

1. The self case reads "Set to best of 1 · You wins." when the subject name falls back to "You" — the retired line has the same "retired by You" problem; needs a wording decision.
2. The remembered format is hook state only: a resumed draft loses Undo (the match stays correctly at best of 1).
3. Hook/notice behaviour (settled line, Undo, fromLine gating) has no automated test beyond the pure helper.
