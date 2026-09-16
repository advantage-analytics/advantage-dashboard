import type { ScoreLineSet } from "@/lib/ui/score-format";

/**
 * Which side a set favours, for the rail scoreboard's ink weight (F8/F1): the
 * set winner's digit prints ink-900, the loser's ink-400 (spec decisions #6).
 *
 * Games decide it, never the tiebreak. A tiebreak set's `player1Tiebreak`/
 * `player2Tiebreak` hold that player's own tiebreak POINTS, not games
 * (`score-format.ts`'s `ScoreLineSet` doc; guardrails §4 — a score row stores
 * the GAME count for a tiebreak set, never the tiebreak points), so a 7-6(5)
 * set resolves by 7 vs 6 like any other set; this function never reads the
 * tiebreak fields at all.
 *
 * `ScoreLineSet` carries no "unfinished" flag, so the frame's "level OR
 * unfinished sets keep both digits ink-900" collapses to the one case a pure
 * function of a finished set can see: equal games reads as `"level"`.
 *
 * `set` must already be you-first — the shape `useMatchSides().sets` hands
 * over — never `player1`/`player2` database order read directly. That order
 * depends on which end the viewer started the video on; getting it backwards
 * attributes the whole scoreboard to the wrong player with nothing looking
 * broken on screen (docs/ui-revamp-guardrails.md §4), so this function takes
 * an already-oriented set and never looks at which id is which.
 */
export function setOutcome(set: ScoreLineSet): "you" | "opp" | "level" {
  if (set.player1 > set.player2) return "you";
  if (set.player2 > set.player1) return "opp";
  return "level";
}
