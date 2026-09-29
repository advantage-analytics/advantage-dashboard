# Tasks — claude/film-shot-numbering

> Scope: Film UI shot numbering restarts at the deciding serve

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Number film shots from the deciding serve

- **status:** todo
- **model:** opus
- **files:** (guess) src/components/dashboard/matches/match-detail/film/film-shots.ts, film/film-this-point.tsx, film/point-list.tsx, film/film-fullscreen.tsx, film/film-court.ts, tests/film-shots.spec.ts, tests/film-court.spec.ts
- **routes:** /dashboard/matches/[matchId]?tab=film
- **done when:**
  - [ ] `film-shots.ts` exports one rally-numbering helper that works from a point's full `shots` (not the timed-only `shotStops`): serve rows (`isServeRow`) are 1, later shots count from the last serve, and the count is the shots from the last serve on (all shots when there is no serve). `tests/film-shots.spec.ts` covers a SplitStep point (shot_numbers 0,1,2,3 → [1,1,2,3], count 3), a SwingVision point (1,1,2 → [1,1,2], count 2), and a point with no serve (1..n, count n).
  - [ ] The "This point" rows in `film-this-point.tsx`, the fullscreen shot well in `point-list.tsx`, and `shotRowCells().order` show the helper's number instead of `i + 1`. The "N shots" footer (`film-this-point.tsx`) and the court caption (`film-fullscreen.tsx`) use the helper's count. List position still drives `shotRowRevealDelay` and React keys.
  - [ ] `film-court.ts` passes the rally number and count to `detailOf` in both point mode and match mode, and `tests/film-court.spec.ts` asserts `order` / `rallyShots` for a faulted-first-serve point match the rally numbering.
  - [ ] When two serves both show 1, their aria-labels stay unique ("Shot 1, first serve" / "Shot 1, second serve"), and the darker "shot 1" ink in `film-this-point.tsx` marks only the deciding serve. A spec asserts both.
  - [ ] The diff touches no file under `src/lib/services/splitstep/`, `src/lib/data/`, `supabase/`, or any stats module (display only).
- **notes:** Don't read `shot_number` directly (SplitStep faulted serve = 0; older SwingVision Feed rows = 0), and don't use `rallyLength` (0 when unrecorded). Eyes-on for /pr-check: Ace v Goodman point 46 (SplitStep, faulted first serve) and any SwingVision point with two serves — check the This point card, fullscreen shot well, caption and court tooltip ("shot 2 of 4").
