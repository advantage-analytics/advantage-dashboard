/**
 * One weekend's stat rows, summed into two sides' totals.
 *
 * ## Why this sums raw counts instead of averaging per-match percentages
 *
 * Every other cross-match figure in this app goes through `meanOfPresent`
 * (`src/lib/data/aggregate.ts`), which averages one number per match. That is
 * the right shape for a CAREER baseline: each match is an occasion, and a
 * player's typical level is the mean over occasions, so a 40-point blowout and
 * a 180-point three-setter each count once.
 *
 * An event is not a career. A dual or a tournament weekend is one contest, and
 * the honest answer to "how did the team serve this weekend" is the pooled
 * ratio — every first serve the team struck over every first serve it went for —
 * not the mean of six court-level percentages. Averaging the percentages weights
 * a 6-0 6-0 line exactly as heavily as a three-set marathon, so a straight-sets
 * winner at line six can move the team's serve figure as far as the number one
 * who played twice as many points. That is a different quantity from the one the
 * label claims, and nothing on screen would say so.
 *
 * So: sum the numerators, sum the denominators, divide once at the end.
 *
 * ## Why `is_player1 === true` is OUR side here
 *
 * On an event match, seat one is not a recording accident — it is assigned.
 * `recordResult` (`src/lib/schedule/actions.ts`) writes `player1_name` from the
 * ENTRY's `player_labels` and `player2_name` from the opponent labels, and the
 * upload wizard's `EventPreset.playerName`
 * (`src/components/dashboard/matches/new-match-wizard/types.ts`) carries the
 * same promise in its doc — "Our side. `player1` everywhere downstream". Both
 * writers of an event match therefore put the program's player in seat one, so
 * for ids that came off an event, `is_player1` IS the side.
 *
 * This is deliberately NARROWER than `playerSeat` / `ownSeatRows` in
 * `match-stats-server.ts`, which resolve a seat per match from the player ids
 * because a personal upload can seat its owner either way. That machinery is
 * for a PLAYER's history across any match; here the caller has already
 * restricted the ids to one event's lines, where the seat is a fact the writer
 * guaranteed. Handing these ids to the general resolver would also be wrong for
 * a doubles line, which has two players and a null `player1_id`.
 *
 * Pure — no Supabase import — so the arithmetic can be tested against hand
 * figures with plain objects, the same split `team-kpi.ts` and `ownSeatRows`
 * keep. The loader lives in `event-team-totals-server.ts`.
 */

/**
 * One side of one match, as `match_stats_with_percentages` returns it for the
 * columns this figure needs.
 *
 * Counts arrive as numbers and may be null — a video-derived match publishes
 * some columns and withholds others. Null is treated as 0 for a SUM (a term
 * nobody measured adds nothing) but never rescues a denominator: a ratio whose
 * denominator summed to 0 is `null`, not `0%`. "We did not measure it" and "we
 * went 0 for everything" are different claims and only one of them is true.
 */
export interface TeamTotalRow {
  match_id: string;
  /** True for the program's side — see the seat note in the module header. */
  is_player1: boolean;
  first_serves: number | null;
  first_serves_in: number | null;
  first_serve_points_won: number | null;
  break_point_opportunities: number | null;
  break_points_converted: number | null;
  total_points: number | null;
  total_points_won: number | null;
}

/**
 * The four figures one side of an event produced.
 *
 * Percentages are 0–100 numbers, rounded to one decimal — the app's `*_pct`
 * convention, which `match_stats_with_percentages` follows (its
 * `first_serve_pct` is rendered straight as `61%`, never multiplied). A caller
 * printing a whole number rounds at the render.
 *
 * `null` on any field means the denominator behind it summed to zero across the
 * event: nothing measured, so there is no percentage to state.
 */
export interface SideTotals {
  /** first_serves_in / first_serves. */
  firstServeInPct: number | null;
  /** first_serve_points_won / first_serves_in. */
  firstServeWonPct: number | null;
  /**
   * The FRACTION, not a percentage: "9 of 21" is what a coach reads off a
   * weekend, and a lone 43% hides how many chances there were to convert.
   */
  breakPoints: { converted: number; opportunities: number } | null;
  /** total_points_won / total_points. */
  pointsWonPct: number | null;
}

export interface EventTeamTotals {
  /** `is_player1 === true` rows — the program's side. */
  ours: SideTotals;
  /** Everything else — the opponent's side. */
  theirs: SideTotals;
  /** Distinct `match_id`s seen in the rows, either side. */
  matchesCounted: number;
}

/** A count cell, with absent folded to 0 for summing. */
function count(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * A pooled ratio as a 0–100 percentage, or null when nothing was measured.
 *
 * The zero check is on the DENOMINATOR alone, so a genuine 0-for-40 first-serve
 * day still returns `0` — a real figure — while a day where no first serve was
 * recorded at all returns `null`.
 */
function ratioPct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** The running sums one side accumulates. */
interface SideSums {
  firstServes: number;
  firstServesIn: number;
  firstServePointsWon: number;
  breakPointOpportunities: number;
  breakPointsConverted: number;
  totalPoints: number;
  totalPointsWon: number;
}

function emptySums(): SideSums {
  return {
    firstServes: 0,
    firstServesIn: 0,
    firstServePointsWon: 0,
    breakPointOpportunities: 0,
    breakPointsConverted: 0,
    totalPoints: 0,
    totalPointsWon: 0,
  };
}

function add(sums: SideSums, row: TeamTotalRow): void {
  sums.firstServes += count(row.first_serves);
  sums.firstServesIn += count(row.first_serves_in);
  sums.firstServePointsWon += count(row.first_serve_points_won);
  sums.breakPointOpportunities += count(row.break_point_opportunities);
  sums.breakPointsConverted += count(row.break_points_converted);
  sums.totalPoints += count(row.total_points);
  sums.totalPointsWon += count(row.total_points_won);
}

function totalsOf(sums: SideSums): SideTotals {
  return {
    firstServeInPct: ratioPct(sums.firstServesIn, sums.firstServes),
    firstServeWonPct: ratioPct(sums.firstServePointsWon, sums.firstServesIn),
    breakPoints:
      sums.breakPointOpportunities > 0
        ? {
            converted: sums.breakPointsConverted,
            opportunities: sums.breakPointOpportunities,
          }
        : null,
    pointsWonPct: ratioPct(sums.totalPointsWon, sums.totalPoints),
  };
}

/**
 * Both sides' event totals, from every stat row the event's matches produced.
 *
 * Rows for BOTH sides of a match are expected — the view holds one per side —
 * and are split on `is_player1`. A row for a match nothing else references is
 * still counted; this function does not know which matches were asked for and
 * does not second-guess the caller's id list.
 */
export function sumTeamTotals(rows: TeamTotalRow[]): EventTeamTotals {
  const ours = emptySums();
  const theirs = emptySums();
  const matchIds = new Set<string>();

  for (const row of rows) {
    matchIds.add(row.match_id);
    add(row.is_player1 === true ? ours : theirs, row);
  }

  return {
    ours: totalsOf(ours),
    theirs: totalsOf(theirs),
    matchesCounted: matchIds.size,
  };
}
