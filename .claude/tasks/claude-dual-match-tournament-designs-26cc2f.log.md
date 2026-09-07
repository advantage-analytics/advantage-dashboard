# Run log — claude/dual-match-tournament-designs-26cc2f

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Chooser aside becomes a real link to the one-off match — done
**gate:** lint pass · tsc pass · npm test pass (475) · task-completion-reviewer `VERDICT: pass` · pipeline-guardrails-reviewer ran (dashboard surface) — no findings · rls-boundary-reviewer skipped (no data/api/migration surface touched)
**changed:** `static-event-chooser.tsx` — the aside's inert span is a `next/link` to `/dashboard/team/schedule/new/single` labelled "Add a one-off match"; header comment rewritten. `tests/schedule-static-copy.spec.ts` — `3b` asserts the new label with a RETIRED note for the old.

## T2 · `opponentMeetings()` beside `opponentDualHistory` — done
**gate:** lint pass · tsc pass · npm test pass (482) · task-completion-reviewer `VERDICT: pass` · pipeline-guardrails-reviewer skipped (no dashboard surface) · rls-boundary-reviewer skipped (pure function in src/lib/schedule, no query)
**changed:** `opponent-history.ts` — `OpponentMeeting` type and `opponentMeetings()` (decided duals only, newest-first by `startsOn`, `won: null` on a level dual, `excludeEventId`). New `tests/opponent-meetings.spec.ts`, 7 cases including agreement with `opponentDualHistory`'s tally.
**follow-ups:** none.
