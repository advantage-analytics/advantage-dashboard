"use client";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { formatClock } from "@/components/dashboard/matches/match-detail/format-clock";
import {
  useMatchSides,
  type MatchSide,
} from "@/components/dashboard/matches/match-detail/use-match-sides";
import { TIEBREAK_STYLE } from "@/components/dashboard/score-line";
import { formatScoreboardStatus } from "@/lib/data/match-utils";
import {
  playedSets,
  tiebreakOf,
  type ScoreLineSet,
} from "@/lib/ui/score-format";
import { cn } from "@/lib/utils";

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
 *
 * Lives in the component file rather than a sibling `report-scoreboard.ts`:
 * with both files present the extensionless specifier resolved to the `.ts`
 * under TypeScript and to the `.tsx` under Next's bundler, so typecheck and
 * the build would each have checked a different module.
 * `tests/report-scoreboard.spec.ts` imports it from here, the way
 * `tests/match-h2h-rows.spec.ts` imports `head-to-head-card.tsx`'s rules.
 */
export function setOutcome(set: ScoreLineSet): "you" | "opp" | "level" {
  if (set.player1 > set.player2) return "you";
  if (set.player2 > set.player1) return "opp";
  return "level";
}

/**
 * One row's cells — the SHARED derivation behind both scoreboards that draw a
 * match's two score rows: this file's rail row and the fullscreen court
 * viewer's slab row (`shots/viz-fullscreen.tsx`). Final review #10: the
 * viewer had hand-copied the lost-set dimming, the `isYou ? player1 :
 * player2` indexing and the tiebreak slot, and this is the one widget where
 * getting that indexing backwards looks entirely fine on screen while
 * attributing the score to the wrong player (docs/ui-revamp-guardrails.md
 * §4). One function, two renderers.
 *
 * `sets` must already be you-first — the shape `useMatchSides().sets` hands
 * over. This function never looks at which id is which; it only applies
 * `side` to an already-oriented set.
 *
 * `lostSet` is what dims a digit. A LEVEL set has no loser, so both rows keep
 * full ink — which is also the closest thing `ScoreLineSet` can express to
 * "unfinished", since it carries no such flag (see `setOutcome` above).
 * `tiebreak` is non-null only on the LOSER's row, because `tiebreakOf`
 * already returns the loser's points and the digit belongs beside their 6.
 */
export interface ScoreboardCell {
  /** The games digit for THIS row. */
  digit: number;
  /** This row lost the set — draw it dimmed. */
  lostSet: boolean;
  /** The loser's tiebreak points, on the loser's row only. */
  tiebreak: number | null;
}

export function scoreboardCells(
  sets: ScoreLineSet[],
  side: "you" | "opp",
): ScoreboardCell[] {
  const isYou = side === "you";
  return sets.map((set) => {
    const outcome = setOutcome(set);
    const lostSet = outcome !== "level" && outcome !== side;
    return {
      digit: isYou ? set.player1 : set.player2,
      lostSet,
      tiebreak: lostSet ? tiebreakOf(set) : null,
    };
  });
}

/**
 * `formatScoreboardStatus` spells the old rail's uppercase eyebrow ("FINAL");
 * this scoreboard sets the same word in sentence case ("Final"). Cased here rather
 * than in `match-utils.ts`, so the shared helper keeps its one spelling.
 */
function sentenceCase(word: string): string {
  return word.charAt(0) + word.slice(1).toLowerCase();
}

/**
 * The rail scoreboard (design 04 F1's rail, which supersedes F8's bordered
 * card): the match status and its clock over two score rows, the viewer's
 * first.
 *
 * Which row is "you", and which digit belongs to whom, comes from
 * `useMatchSides()` and nothing else (guardrails §4): the names from
 * `sides.you`/`sides.opp`, the digits from `sides.sets`, which are already
 * you-first with the tiebreak slots swapped together with the games. Nothing
 * here reads `match.score` or `player1`/`player2`.
 *
 * Nothing to load and nothing to wait on — the match row is already in
 * `MatchDataProvider` — so the only empty cases are partial data, and each
 * omits rather than invents: no duration → no clock; no played sets → the two
 * names, each beside a dash, never a 0.
 */
export function MatchReportScoreboard() {
  const { match } = useMatchData();
  const sides = useMatchSides();

  const status = sentenceCase(formatScoreboardStatus(match.matchContext));
  const duration =
    typeof match.durationSec === "number" && match.durationSec > 0
      ? formatClock(match.durationSec, { alwaysShowHours: true })
      : null;
  // Display-only trim of the phantom trailing 0-0 sets production rows carry
  // (`playedSets`' doc). Still `sides.sets`, still you-first.
  const sets = playedSets(sides.sets);

  return (
    // F1 (settled, 2026-09-16): no card of its own. The scoreboard is the
    // rail's head, set off from the view switcher by a hairline rule that
    // stops 12px short of each rail edge.
    <div className="px-3">
      <div
        className="flex flex-col gap-[14px] border-b border-[var(--border-hairline)]"
        style={{ padding: "18px 13px 20px" }}
      >
        <div className="flex items-baseline gap-2">
          {/* `.text-micro` already paints ink-500, the frame's colour, so no
              inline override (the class is unlayered and would beat a
              colour utility anyway). */}
          <span className="text-micro">{status}</span>
          <div className="flex-1" />
          {duration ? (
            <span className="mono tabular text-[10px] text-[var(--ink-400)]">
              {duration}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-[11px]">
          <ScoreRow side="you" player={sides.you} sets={sets} />
          <ScoreRow side="opp" player={sides.opp} sets={sets} />
        </div>
      </div>
    </div>
  );
}

function ScoreRow({
  side,
  player,
  sets,
}: {
  side: "you" | "opp";
  player: MatchSide;
  /** You-first, from `useMatchSides().sets`. */
  sets: ScoreLineSet[];
}) {
  const isYou = side === "you";

  return (
    <div className="flex min-w-0 items-center gap-[7px]">
      {/* The frame never wraps a name; a name too long for the 300px rail
          ends in an ellipsis instead of pushing the digits out of the rail. */}
      <span
        className={cn(
          "min-w-0 overflow-hidden text-[13px] text-ellipsis whitespace-nowrap",
          isYou ? "font-medium text-[var(--ink-900)]" : "text-[var(--ink-600)]",
        )}
      >
        {player.name}
      </span>
      {isYou ? (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-[var(--radius-pill)] bg-[var(--blue)]"
        />
      ) : null}
      <div className="flex-1" />

      <span className="mono tabular inline-flex shrink-0 items-center gap-2 text-[13px] whitespace-nowrap">
        {/* No played sets (a row stored all 0-0): the score is unmeasured,
            so one dash where the digits go — never a 0 that reads as a
            result. */}
        {sets.length === 0 ? (
          <span className="w-[11px] text-right text-[var(--ink-400)]">
            <span aria-hidden="true">—</span>
            <span className="sr-only">No score</span>
          </span>
        ) : null}
        {/* `scoreboardCells` owns the indexing and the lost-set rule — the
            same function the fullscreen viewer's slab row uses. */}
        {scoreboardCells(sets, side).map(
          ({ digit, lostSet, tiebreak }, index) => {
            return (
              <span
                key={index}
                className={cn(
                  "w-[11px] text-right",
                  lostSet ? "text-[var(--ink-400)]" : "text-[var(--ink-900)]",
                )}
              >
                {digit}
                {tiebreak !== null ? (
                  // Zero-width, so the games digit stays flush right in its
                  // 11px slot and every set column lines up across both rows;
                  // the raised digit hangs out past the slot into the gap.
                  <span className="inline-block w-0">
                    {/* `ScoreLine`'s superscript, and its reading: the digit is
                      hidden from assistive tech and spoken as a phrase, or
                      "6⁵" reads as "sixty-five". */}
                    <span aria-hidden="true" style={TIEBREAK_STYLE}>
                      {tiebreak}
                    </span>
                    <span className="sr-only"> tiebreak {tiebreak}</span>
                  </span>
                ) : null}
              </span>
            );
          },
        )}
      </span>
    </div>
  );
}
