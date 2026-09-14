# Run log — claude/remove-title-attributes-e1812c

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Drop DOM title tooltips — matches list, wizard, KPI strip — blocked

**gate:** mechanical — fail (lint pass, typecheck pass, tests 1 failed / 1184 passed); completion — not run

**reason:** `tests/upload-player-details.spec.ts:288` ("the opponent's editable name carries a visible edit affordance…") locates the opponent button by `detailsSrc.indexOf('title="Change the opponent"')`. With the `title` removed, `indexOf` returns -1, the slice starts at the end of the file and the `<Pencil` assertion fails. The task's `files:` did not include the spec, so the anchor was not updated. All seven removals and the new `aria-label` otherwise landed and typecheck/lint passed. Fix: re-anchor that test on `aria-label={`Change the opponent,`(and add`tests/upload-player-details.spec.ts` to the task's files), then re-run.

**stash:** 49a4994a6dbe97d3809674bea00621ef50d935d2
