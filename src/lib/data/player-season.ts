import type { MatchPoint } from "@/lib/data/match-points-server";
import { compareMatchDays, matchDay } from "@/lib/data/match-day";
import {
  GAME_PROFILE_AXES,
  GAME_PROFILE_RECENT,
  type GameProfileValues,
} from "@/lib/data/game-profile-axes";
import {
  buildStatRows,
  h2hGroups,
  rateTally,
  rowLeader,
  statDisplay,
  tallySide,
  withLobAvailability,
  withoutShotKindRows,
  withPointRows,
  type DerivedSide,
  type H2HRowConfig,
  type H2HStats,
} from "@/components/dashboard/matches/match-detail/head-to-head-rows";
import {
  netGameTally,
  type NetEnding,
  type NetEntry,
  type NetGameTally,
} from "@/components/dashboard/matches/match-detail/match-filters/net-game";
import {
  rallyBandTally,
  sumRallyBandTallies,
  type RallyBandCount,
  type RallyBandTally,
} from "@/components/dashboard/matches/match-detail/rally-length-bands";
import {
  emptyOutcomeTally,
  outcomeTally,
  type OutcomeKey,
  type OutcomeTally,
} from "@/components/dashboard/matches/match-detail/point-endings-tally";

/**
 * A player's season, folded from the match reports of their analyzed matches
 * — the team player profile's Statistics tab (design Q, the `CohesiveQ`
 * board, reworked on the "Match page refinements" canvas, boards 9–10): a
 * season Head to head table and its Differential on the left and, on the
 * right, the Game profile radar, How points ended, Rally length and Net game
 * cards.
 *
 * NOTHING HERE DERIVES A STATISTIC. Each match is run through the match
 * report's own calculators exactly as `HeadToHeadCard` runs them —
 * `h2hGroups` → `withLobAvailability` → `buildStatRows` → `tallySide` →
 * `withPointRows`, then `outcomeTally`, `netGameTally` and
 * `rallyLengthBandOf` for the cards — with THAT match's own `isPlayer1`,
 * `isDerived` and lob keys, and the fold only adds up what comes back. A
 * season figure that disagrees with the sum of its match reports is a bug
 * here, never a second opinion.
 *
 * Sides (guardrails §4): the player may sit in either seat from one match to
 * the next. Every match is tallied with its own `isPlayer1`; nothing flips
 * points to a common seat. "You" is the player whose profile this is, "opp"
 * is whoever they played that day — so the Opponents column is many people.
 *
 * Counts and rates fold differently. A COUNT row (aces, winners, net point
 * attempts…) is the per-match average, printed to one decimal ("4.2"). A RATE
 * row is POOLED — the made and the attempts are summed over the matches and
 * divided once — not a mean of percentages, which would weigh a 30-point
 * retirement the same as a 120-point three-setter. The made/attempts are read
 * from the same places the report's tooltip reads them: the published
 * `fractions[fractionKey]` for a SwingVision figure, `rateTally()` over
 * `tallySide` for a row counted from the points, and `key`/`ofKey` for Total
 * points won — which the canvas prints as a share of all points ("52%"), not
 * as "74.5 points a match", so it folds as a rate.
 *
 * A match with nothing to say on a row — a null published figure (a derived
 * match's suppressed `aces`), a fraction with no attempts (no break points
 * faced), a rate with no attempts (never came to the net) — is left out of
 * that row for that side; `SeasonValue.matches` says how many were in. With
 * none, the value is `null` and the display `""`, the card's own contract for
 * "no data", which it draws as "—".
 *
 * Row set: one "Errors" row unless EVERY analyzed match has its errors judged
 * forced/unforced (`seasonErrorSplitJudged`), then "Unforced errors" and
 * "Forced errors" — a judged match folded into an unjudged season contributes
 * its unforced + forced to Errors, as the report's own Errors row does. The
 * Aces row follows each match's own config: unreturned serves on an Advantage
 * Intelligence match, the published count otherwise. Lob points and Passed
 * the net player fold only over matches with lob keys; with none at all the
 * rows carry the report's `NO_LOB_DATA_NOTE` / `NO_PASS_DATA_NOTE`.
 */

/* ── Inputs ─────────────────────────────────────────────────────────────── */

/** One analyzed match, as the Head to head fold reads it. */
export interface SeasonMatchStats {
  /** Every point of the match, as `getMatchPointsFromSupabase` returns them. */
  points: MatchPoint[];
  /**
   * Which seat the PLAYER sat in for this match. Each match keeps its own;
   * never normalised to a common seat (guardrails §4).
   */
  isPlayer1: boolean;
  /** An Advantage Intelligence match: aces are its unreturned serves. */
  isDerived: boolean;
  /** Its errors are judged forced/unforced (`lib/data/error-split.ts`). */
  errorSplitJudged: boolean;
  /**
   * The ball-paths file's lobs (`lobShotKeys`), or `null` when the match has
   * no file — unknown, never "no lobs".
   */
  lobKeys: ReadonlySet<number> | null;
  /**
   * The player's published statistics for this match, or `null` when the
   * match has no `match_stats_with_percentages` row for their seat. A missing
   * row is unknown, never zeroes: that seat sits out of every published row
   * (count and rate) for this match, while the rows counted from the points
   * (`fromPoints`) still read them.
   */
  youStats: H2HStats | null;
  /** The opponent's, with the same `null`. */
  oppStats: H2HStats | null;
}

/** One analyzed match with the identity the right-column cards name. */
export interface SeasonMatch extends SeasonMatchStats {
  matchId: string;
  /**
   * The match's calendar day — `matches.date` as stored, or `matchDay()`'s
   * `YYYY-MM-DD`. Compared with `compareMatchDays`, never parsed here.
   */
  date: string | null;
  /** The opponent's name, as the match names them. */
  opponent: string;
  /** The opponent's hand off the match row (`SeasonVizMatch.opponentHand`),
   *  null when it does not say. Optional: a fold reads none of it. */
  opponentHand?: "right" | "left" | null;
}

/* ── Head to head rows ───────────────────────────────────────────────────── */

export type SeasonRowKind = "count" | "rate";

/** One side's season figure for one row. */
export interface SeasonValue {
  /** The number the two sides are compared on; `null` when there is none. */
  value: number | null;
  /** `"4.2"` for a count, `"57%"` for a rate, `""` for no data. */
  display: string;
  /** `"21 in 5 matches"` for a count, `"40/70"` for a pooled rate. */
  detail?: string;
  /** How many analyzed matches had a figure for this side on this row. */
  matches: number;
}

export interface SeasonRow {
  label: string;
  kind: SeasonRowKind;
  /** The LOWER number is the better one — double faults, errors. */
  lowerIsBetter?: boolean;
  /** Why the row is a dash for the whole season (no ball flight data). */
  note?: string;
  you: SeasonValue;
  opp: SeasonValue;
  leader: "you" | "opp" | null;
}

export interface SeasonGroup {
  title: string;
  rows: SeasonRow[];
}

/**
 * Whether the season's Points group splits its errors: only when every
 * analyzed match has judged its own. No matches is unjudged — nothing has
 * called anything forced or unforced yet — so the empty table shows "Errors".
 */
export function seasonErrorSplitJudged(
  matches: readonly Pick<SeasonMatchStats, "errorSplitJudged">[],
): boolean {
  return matches.length > 0 && matches.every((m) => m.errorSplitJudged);
}

/**
 * Whether every analyzed match knows its lobs — what the season Net game card
 * needs before it can draw a Lobbed segment (otherwise a lob over the net
 * player in a file-less match is counted among the passes).
 */
export function seasonHasLobs(
  matches: readonly Pick<SeasonMatchStats, "lobKeys">[],
): boolean {
  return matches.length > 0 && matches.every((m) => m.lobKeys !== null);
}

/**
 * How a row folds. A percentage, a fraction-derived figure, or a count read
 * "of" a total (Total points won) is a rate; everything else is a count.
 */
export function seasonRowKind(
  config: Pick<H2HRowConfig, "isPercentage" | "fromFraction" | "ofKey">,
): SeasonRowKind {
  return config.isPercentage || config.fromFraction || config.ofKey
    ? "rate"
    : "count";
}

interface Pool {
  /** Counts: the per-match figures added up. */
  sum: number;
  /** Rates: the made and attempts added up. */
  made: number;
  attempts: number;
  /** Matches that contributed. */
  n: number;
}

const emptyPool = (): Pool => ({ sum: 0, made: 0, attempts: 0, n: 0 });

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * What `buildStatRows` is handed for a seat with no stats row. Every figure
 * it yields is ignored — `publishedFor` keeps that seat out of the published
 * rows — so this only gives the call its shape.
 */
const NO_PUBLISHED: H2HStats = { fractions: {} };

/**
 * Whether a row's figure for a seat can be read this match: a row counted
 * from the points always can; a published one only when the seat has a stats
 * row. Without this a missing row would fold in as zeroes and drag the
 * season's averages and pooled rates down.
 */
function publishedFor(
  config: Pick<H2HRowConfig, "fromPoints">,
  stats: H2HStats | null,
): stats is H2HStats {
  return Boolean(config.fromPoints) || stats !== null;
}

/**
 * The made/attempts behind one side's rate row for one match, read where the
 * report's own tooltip reads them, or `null` when that match has none: the
 * tally behind a row counted from the points (`rateTally`, `null` for a lob
 * or pass row without lob keys), `key` of `ofKey` for Total points won, else
 * the published fraction.
 */
function rowFraction(
  config: H2HRowConfig,
  stats: H2HStats,
  derived: DerivedSide,
): { made: number; attempts: number } | null {
  if (config.fromPoints) {
    const tally = rateTally(config, derived);
    return tally ? { made: tally.won, attempts: tally.total } : null;
  }
  if (config.ofKey && config.key) {
    const made = stats[config.key];
    const attempts = stats[config.ofKey];
    return finite(made) && finite(attempts) ? { made, attempts } : null;
  }
  if (config.fractionKey) return stats.fractions[config.fractionKey] ?? null;
  return null;
}

function addFraction(
  pool: Pool,
  fraction: { made: number; attempts: number } | null,
): void {
  if (!fraction || !(fraction.attempts > 0)) return;
  pool.made += fraction.made;
  pool.attempts += fraction.attempts;
  pool.n += 1;
}

function addCount(pool: Pool, value: number | null): void {
  if (!finite(value)) return;
  pool.sum += value;
  pool.n += 1;
}

const NO_VALUE: SeasonValue = { value: null, display: "", matches: 0 };

function matchesWord(n: number): string {
  return n === 1 ? "match" : "matches";
}

function finishCount(pool: Pool): SeasonValue {
  if (pool.n === 0) return NO_VALUE;
  const value = pool.sum / pool.n;
  return {
    value,
    display: value.toFixed(1),
    detail: `${pool.sum} in ${pool.n} ${matchesWord(pool.n)}`,
    matches: pool.n,
  };
}

function finishRate(pool: Pool): SeasonValue {
  if (pool.attempts === 0) return NO_VALUE;
  const value = (pool.made / pool.attempts) * 100;
  return {
    value,
    display: statDisplay(value, true),
    detail: `${pool.made}/${pool.attempts}`,
    matches: pool.n,
  };
}

/**
 * The season Head to head groups: every row of the report's table
 * (`h2hGroups`), for the player and for their opponents, folded over
 * `matches` as the module comment describes. With no matches every row is
 * still there, both values `null`.
 */
export function foldSeasonRows(
  matches: readonly SeasonMatchStats[],
): SeasonGroup[] {
  const { shape, pools } = foldSeasonPools(matches);
  return shape.map((group, gi) => ({
    title: group.title,
    rows: group.configs.map((config, ri) => {
      const kind = seasonRowKind(config);
      const finish = kind === "rate" ? finishRate : finishCount;
      const you = finish(pools[gi][ri].you);
      const opp = finish(pools[gi][ri].opp);
      return {
        label: config.label,
        kind,
        lowerIsBetter: config.lowerIsBetter,
        note: config.note,
        you,
        opp,
        leader: rowLeader(config, you.value, opp.value),
      };
    }),
  }));
}

/**
 * The season's row shape and, per row, both sides' pools — what
 * `foldSeasonRows` finishes into figures and `seasonGameProfile` reads its
 * rates from, so the radar and the table cannot disagree.
 */
function foldSeasonPools(matches: readonly SeasonMatchStats[]): {
  shape: { title: string; configs: H2HRowConfig[] }[];
  pools: { you: Pool; opp: Pool }[][];
} {
  const judged = seasonErrorSplitJudged(matches);
  const anyLobs = matches.some((m) => m.lobKeys !== null);

  // The season's row shape — titles, labels, kinds, notes. The derived and the
  // SwingVision row sets differ only in how Aces is counted, never in a label,
  // so either names the rows; the per-match pass below picks the right one.
  const shape = withLobAvailability(h2hGroups(false, judged), anyLobs);
  const pools = shape.map((group) =>
    group.configs.map(() => ({ you: emptyPool(), opp: emptyPool() })),
  );

  for (const m of matches) {
    const groups = withLobAvailability(
      h2hGroups(m.isDerived, judged),
      m.lobKeys !== null,
    );
    // Each side with its own seat for THIS match, never a normalised one.
    const youDerived = tallySide(m.points, m.isPlayer1, m.lobKeys);
    const oppDerived = tallySide(m.points, !m.isPlayer1, m.lobKeys);

    groups.forEach((group, gi) => {
      const published = buildStatRows(
        group.configs,
        m.youStats ?? NO_PUBLISHED,
        m.oppStats ?? NO_PUBLISHED,
      );
      const rows = withPointRows(
        group.configs,
        published,
        youDerived,
        oppDerived,
      );

      group.configs.forEach((config, ri) => {
        const slot = shape[gi]?.configs[ri];
        if (!slot || slot.label !== config.label) {
          // The two row sets have drifted apart; summing by position would
          // put one statistic's figures under another's label with nothing
          // on screen to say so.
          throw new Error(
            `player-season: row "${config.label}" has no season slot (${slot?.label ?? "none"} at ${gi}/${ri})`,
          );
        }
        const pool = pools[gi][ri];
        const youIn = publishedFor(config, m.youStats);
        const oppIn = publishedFor(config, m.oppStats);
        if (seasonRowKind(config) === "rate") {
          if (youIn) {
            addFraction(
              pool.you,
              rowFraction(config, m.youStats ?? NO_PUBLISHED, youDerived),
            );
          }
          if (oppIn) {
            addFraction(
              pool.opp,
              rowFraction(config, m.oppStats ?? NO_PUBLISHED, oppDerived),
            );
          }
        } else {
          if (youIn) addCount(pool.you, rows[ri].you.value);
          if (oppIn) addCount(pool.opp, rows[ri].opp.value);
        }
      });
    });
  }

  return { shape, pools };
}

/**
 * The labels of the rows the match report leaves off its table
 * (`withoutShotKindRows`: Lob points won, Drop shot points won), read off
 * the report's own rule rather than retyped.
 */
const SHOT_KIND_ROW_LABELS: ReadonlySet<string> = (() => {
  const all = h2hGroups(false, true);
  const kept = new Set(
    withoutShotKindRows(all).flatMap((g) => g.configs.map((c) => c.label)),
  );
  return new Set(
    all
      .flatMap((g) => g.configs.map((c) => c.label))
      .filter((label) => !kept.has(label)),
  );
})();

/**
 * The season groups without Lob points won and Drop shot points won — the
 * season Head to head card's rows, matching the match report's table
 * (product decision, 2026-11-09: both read off shot kinds not accurate
 * enough to publish). The fold keeps them for the insight evidence and Ask.
 */
export function withoutSeasonShotKindRows(
  groups: readonly SeasonGroup[],
): SeasonGroup[] {
  return groups.map((group) => ({
    title: group.title,
    rows: group.rows.filter((row) => !SHOT_KIND_ROW_LABELS.has(row.label)),
  }));
}

/* ── Game profile ───────────────────────────────────────────────────────── */

// The axes, the shape type and the recent-match count live in a module with
// no imports (`game-profile-axes.ts`), so the client card can read them
// without pulling this fold and its calculators into its bundle.
export {
  GAME_PROFILE_AXES,
  GAME_PROFILE_RECENT,
  type GameProfileValues,
} from "@/lib/data/game-profile-axes";

export interface SeasonGameProfile {
  /** The player's whole season — the slate outline. */
  overall: GameProfileValues;
  /**
   * The latest dated analyzed match (`recentFormOrder`), `null` with none.
   */
  lastMatch: {
    values: GameProfileValues;
    opponent: string;
    date: string | null;
  } | null;
  /**
   * The last five analyzed matches pooled — only with more than five, else
   * `null` and the card draws no swap.
   */
  lastFive: GameProfileValues | null;
}

/** The player's six rates over `matches`, pooled as the table's rate rows are. */
export function gameProfileValues(
  matches: readonly SeasonMatchStats[],
): GameProfileValues {
  const { shape, pools } = foldSeasonPools(matches);
  const byLabel = new Map<string, Pool>();
  shape.forEach((group, gi) =>
    group.configs.forEach((config, ri) =>
      byLabel.set(config.label, pools[gi][ri].you),
    ),
  );
  return GAME_PROFILE_AXES.map((axis) => {
    let made = 0;
    let attempts = 0;
    for (const label of axis.rows) {
      const pool = byLabel.get(label);
      if (!pool) {
        // A renamed table row would otherwise draw the axis at zero with
        // nothing on screen to say why.
        throw new Error(`player-season: game profile row "${label}" missing`);
      }
      made += pool.made;
      attempts += pool.attempts;
    }
    return attempts > 0 ? (made / attempts) * 100 : null;
  });
}

/**
 * The season oldest first for "recent form": `compareSeasonMatches` order,
 * except a match with no readable date counts as the OLDEST, not the newest
 * (where that comparator files it). Nothing says when an undated match was
 * played, so it must never stand in as the last match while a dated one
 * exists; with none dated it is all there is.
 */
function recentFormOrder(matches: readonly SeasonMatch[]): SeasonMatch[] {
  const ordered = [...matches].sort(compareSeasonMatches);
  const undated = ordered.filter((m) => matchDay(m.date) === null);
  return [...undated, ...ordered.filter((m) => matchDay(m.date) !== null)];
}

export function seasonGameProfile(
  matches: readonly SeasonMatch[],
): SeasonGameProfile {
  const ordered = recentFormOrder(matches);
  const last = ordered.at(-1);
  return {
    overall: gameProfileValues(ordered),
    lastMatch: last
      ? {
          values: gameProfileValues([last]),
          opponent: last.opponent,
          date: last.date,
        }
      : null,
    lastFive:
      ordered.length > GAME_PROFILE_RECENT
        ? gameProfileValues(ordered.slice(-GAME_PROFILE_RECENT))
        : null,
  };
}

/* ── The right column's tallies ─────────────────────────────────────────── */

/**
 * One analyzed match, oldest first — what the insight card's evidence line
 * and cache signature read (`player-insight.ts`): the points the player won
 * of the points played, counted from the points themselves (`tallySide`'s
 * `allPoints`), as the report's point-level cards count them.
 */
export interface SeasonPerMatch {
  matchId: string;
  date: string | null;
  opponent: string;
  youWon: number;
  total: number;
}

/**
 * Season order, oldest first: by calendar day (`compareMatchDays`, a match
 * with no readable date last), then — two matches on one day compare equal
 * there — by id. `matches` stores no recording time (`date`'s time part
 * means nothing, `match-day.ts`), so a day's matches cannot be put in the
 * order they were played; the id at least makes the order stable, rather
 * than whatever order the loader read them in.
 */
export function compareSeasonMatches(
  a: Pick<SeasonMatch, "date" | "matchId">,
  b: Pick<SeasonMatch, "date" | "matchId">,
): number {
  const byDay = compareMatchDays(a.date, b.date);
  if (byDay !== 0) return byDay;
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0;
}

/** Oldest first (`compareSeasonMatches`); a match with no readable date sorts last. */
export function seasonPerMatch(
  matches: readonly SeasonMatch[],
): SeasonPerMatch[] {
  return [...matches].sort(compareSeasonMatches).map((m) => {
    const { allPoints } = tallySide(m.points, m.isPlayer1, null);
    return {
      matchId: m.matchId,
      date: m.date,
      opponent: m.opponent,
      youWon: allPoints.won,
      total: allPoints.total,
    };
  });
}

/** How points ended over the season — the summed `outcomeTally` per side. */
export interface SeasonOutcomes {
  you: OutcomeTally;
  opp: OutcomeTally;
  /**
   * The split the tallies were taken with (`seasonErrorSplitJudged`): when
   * false `unforcedErrors` holds every error and `forcedErrors` is 0, exactly
   * as the report's unjudged "Errors" segment.
   */
  errorSplitJudged: boolean;
}

function addOutcomes(sum: OutcomeTally, part: OutcomeTally): void {
  for (const key of Object.keys(part) as OutcomeKey[]) sum[key] += part[key];
}

export function seasonOutcomes(
  matches: readonly SeasonMatchStats[],
): SeasonOutcomes {
  const judged = seasonErrorSplitJudged(matches);
  const you = emptyOutcomeTally();
  const opp = emptyOutcomeTally();
  for (const m of matches) {
    addOutcomes(you, outcomeTally(m.points, m.isPlayer1, m.isDerived, judged));
    addOutcomes(opp, outcomeTally(m.points, !m.isPlayer1, m.isDerived, judged));
  }
  return { you, opp, errorSplitJudged: judged };
}

/** The net game over the season — the summed `netGameTally` per side. */
export interface SeasonNetGame {
  you: NetGameTally;
  opp: NetGameTally;
  /**
   * Every analyzed match knew its lobs (`seasonHasLobs`). When false, the
   * card draws Passed as "Passed or lobbed", as the report does without a
   * ball-paths file, and `endings.lobbed` is 0 on both sides: the lobs the
   * matches WITH a file found are folded into `passed`, so the segments the
   * card draws still add up to `total`.
   */
  hasLobs: boolean;
}

function addNetGame(sum: NetGameTally, part: NetGameTally): void {
  sum.total += part.total;
  for (const key of Object.keys(part.endings) as NetEnding[]) {
    sum.endings[key] += part.endings[key];
  }
  for (const key of Object.keys(part.entries) as NetEntry[]) {
    sum.entries[key] += part.entries[key];
  }
}

export function seasonNetGame(
  matches: readonly SeasonMatchStats[],
): SeasonNetGame {
  // The zeroed shape is the calculator's own, over no points.
  const you = netGameTally([], true, null);
  const opp = netGameTally([], true, null);
  for (const m of matches) {
    addNetGame(you, netGameTally(m.points, m.isPlayer1, m.lobKeys));
    addNetGame(opp, netGameTally(m.points, !m.isPlayer1, m.lobKeys));
  }
  const hasLobs = seasonHasLobs(matches);
  if (!hasLobs) {
    // Without lobs for every match the card has no Lobbed segment, only
    // "Passed or lobbed" — so the lobs the matches with a file did find go
    // there, or the drawn segments would add up to less than `total`. The
    // match report never meets this: one match either has its file or not.
    for (const side of [you, opp]) {
      side.endings.passed += side.endings.lobbed;
      side.endings.lobbed = 0;
    }
  }
  return { you, opp, hasLobs };
}

/** One of the Rally length card's three bands, summed over the season. */
export type SeasonRallyBand = RallyBandCount;

/**
 * The season's bands — `bands` (short, medium, long), `total` (points in any
 * band: the ones with a shot count recorded), `shotSum` and `avgShots` (the
 * card's "N shots average", `null` with no banded point).
 */
export type SeasonRallyBands = RallyBandTally;

/**
 * The Rally length card's bands over the season: the card's own tally
 * (`rallyBandTally`, `rally-length-bands.ts`) run per match with that match's
 * seat, then added band by band, average included — every point
 * `rallyLengthBandOf` places in a band, exactly the points the card averages
 * over (a `rallyLength` of 0 is "none recorded" and is left out).
 */
export function seasonRallyBands(
  matches: readonly SeasonMatchStats[],
): SeasonRallyBands {
  return sumRallyBandTallies(
    matches.map((m) => rallyBandTally(m.points, m.isPlayer1)),
  );
}

/** Everything the profile's right column draws, folded once. */
export interface SeasonTallies {
  perMatch: SeasonPerMatch[];
  /** The Game profile radar (`seasonGameProfile`). */
  gameProfile: SeasonGameProfile;
  outcomes: SeasonOutcomes;
  netGame: SeasonNetGame;
  rallyBands: SeasonRallyBands;
}

export function foldSeasonTallies(
  matches: readonly SeasonMatch[],
): SeasonTallies {
  return {
    perMatch: seasonPerMatch(matches),
    gameProfile: seasonGameProfile(matches),
    outcomes: seasonOutcomes(matches),
    netGame: seasonNetGame(matches),
    rallyBands: seasonRallyBands(matches),
  };
}
