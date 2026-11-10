# Run log — claude/practice-sessions-teammate-opponents-bfb356

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Share match-type options and an isPracticeMatch predicate — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite); completion VERDICT: pass. `tests/court-options.spec.ts:94` fails when that file runs alone, also at a clean HEAD, and passes inside the full suite — environmental, not this diff.
**changed:** new `src/lib/matches/match-type.ts` (`MATCH_TYPE_OPTIONS` Tournament / Dual Match / Practice, `isPracticeMatch` trims and lowercases); `edit-match-dialog.tsx` imports the options instead of declaring its own array; new `tests/match-type.spec.ts`.
**follow-ups:**

1. The edit dialog could branch on `isPracticeMatch` once Practice behaviour lands.

## T2 · Show Match type first under Context on wizard step 4 — done

**gate:** mechanical GATE PASS; completion VERDICT: pass.
**changed:** new `MatchTypeField.tsx` (`MatchTypeCell` underline MenuSelect with T1's options and "Not set", `PracticeNotice`, helpers `matchTypeFieldValue` / `showsMatchTypeField` / `matchTypeForEventKind`); `DetailsStepContent.tsx` puts Match type first in the Context grid (hidden for Doubles), routes `EventCell`'s pick through `matchTypeForEventKind`, and renders the Practice notice under Context naming the subject only; `WizardNotice.tsx` gains a grey `tone="note"`; new `tests/upload-details-match-type.spec.ts`. The notice takes a `profiles` list so T4 can add the teammate.
**follow-ups:**

1. Picking Tournament in the menu does not set `eventKind` or Round; only an event pick does. Decide whether the two should stay independent.
2. A Practice value survives picking an "other" event; a tournament pick replaces it (unchanged behaviour).
