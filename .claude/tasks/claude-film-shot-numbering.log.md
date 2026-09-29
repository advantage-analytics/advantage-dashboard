# Run log — claude/film-shot-numbering

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Number film shots from the deciding serve — done

**gate:** mechanical GATE PASS · completion VERDICT: pass

**changed:** `rallyNumbering(shots)` in film-shots.ts numbers every serve row 1 and counts on from the last serve (count = shots from the last serve on; 1..n with no serve), plus `shotRowAriaLabel` and `isRallyOpener`. The This point card, fullscreen shot well, `shotRowCells().order`, the "N shots" footer, the fullscreen court caption ("1 shot" singular) and court tooltips (`pointMarks` gains optional `pointShots`; `matchMarks`) use it. Reveal delay and keys keep list position. The darker ink marks the deciding serve only. 5 new specs across film-shots/film-court.

**follow-ups:**

1. On a no-serve point the darker ink still goes to the first shot (the old `order === 1` rule) — decide if no row should be darkened.
2. A non-serve row stored before the last serve (e.g. a Feed ahead of the serves) numbers 1 and is excluded from the count.
3. The fullscreen court caption reads "0 shots" when `activePoint` is null (was the timed-stop count); likely unreachable in point mode.
