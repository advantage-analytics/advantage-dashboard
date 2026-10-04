# Run log — claude/head-to-head-stats-widget-b95363

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Count unreturned serves as aces in Head to head on Advantage Intelligence matches — done

- **gate:** mechanical GATE PASS (after `npm ci` — the worktree's node_modules predated the 09-27 lockfile and lacked `pg` / `@electric-sql/pglite`); completion `VERDICT: pass`; widget-states checklist walked (loading/error untouched, unmeasured → em dash).
- **changed:** `film-cut-context.tsx` gains `isUnreturnedServe()` (rallyLength 1, server won) and two `FilmCutEnding` values, `unreturned-serve` and `rally-winner` (winner minus unreturned serves — needed so the derived Winners and Aces cuts are disjoint). `head-to-head-card.tsx` gains `DERIVED_SERVE_ROWS` / `DERIVED_POINT_ROWS` / `DERIVED_H2H_GROUPS` / `ALL_DERIVED_H2H_CONFIGS`, selected by `HeadToHeadCard` only when `meta.isDerived`; Aces reads `fromPoints: "unreturnedServes"`, Winners reads `winnersLessUnreturned` = max(0, published − unreturned). `tallySide()` counts `unreturnedServes` for the server. SwingVision configs byte-identical. Specs added to `tests/match-h2h-rows.spec.ts` and `tests/head-to-head-cuts.spec.ts` (80 offline tests pass).
- **follow-ups:** 1. `point-endings-card.tsx` still drops the Aces bar when `isDerived` and its winners bucket still includes unreturned serves; it could reuse `isUnreturnedServe` and the `rally-winner` ending so the two cards agree. 2. The derived Aces cut carries `resultOutcome: ["winner"]` while the tally counts any one-shot server-won rally — they agree for the derivation today but could diverge if a rally-length-1 server-won point ever carried a non-winner `resultType`. 3. Derived Winners subtracts every unreturned serve including any labelled `Ace`; exact for splitstep, not for a mixed-source match.

## T2 · Align derivation docs and classifier comments with the widget-level ace rule — done

- **gate:** mechanical GATE PASS; completion `VERDICT: pass`; widget-states mark recorded (comment-only change in point-endings-card.tsx, no rendered state touched).
- **changed:** `docs/splitstep-derivation.md` §4 keeps aces Unknowable for `match_stats` and adds one paragraph describing the T1 widget-level rule (`head-to-head-card.tsx`, `rallyLength === 1` + server won, subtracted from Winners, `match_stats` untouched). `result-type.ts` `classifyPoint()` docblock gains a pointer that the Head to head widget derives its own ace count. `point-endings-card.tsx` header comment no longer claims the two cards split aces on the same line; it states how they differ on splitstep. No code changed.
