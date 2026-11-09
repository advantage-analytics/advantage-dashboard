import type { MatchPoint } from "@/lib/data/match-points-server";
import type { PlayerStatistics, StatFraction } from "@/lib/data/types";
import type {
  CutSide,
  FilmCut,
} from "@/components/dashboard/matches/match-detail/film-cut-context";
import {
  cameToNet,
  countsAsWinner,
  errorMadeBy,
  isReturnWinner,
  isUnreturnedServe,
  rallyLengthBandOf,
  winnerHitBy,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import {
  hitADropShot,
  hitALob,
  netEndingOf,
  netEntryOf,
} from "@/components/dashboard/matches/match-detail/match-filters/net-game";

/**
 * The head-to-head table's rows, as data: the row configuration, the
 * published values, the leader rule and the point-derived tallies —
 * everything `head-to-head-card.tsx` computes before it draws anything.
 *
 * Pure on purpose (no React, no `"use client"`), so it runs on the server
 * too: the team player profile's season fold (`lib/data/player-season.ts`)
 * calls these same calculators per analyzed match from a Server Component
 * loader, and a `"use client"` module's exports reach server code as client
 * references, not callable functions. The card re-exports every name that
 * used to live in it, so its import surface is unchanged.
 *
 * Which side is "you" is decided by the caller (guardrails §4): every builder
 * takes `you`/`opp` statistics or an `isPlayer1`, and nothing here reads
 * `player1`/`player2` to pick a column.
 */

/* ── Row configuration ──────────────────────────────────────────────────────
   Pure data, exported so `tests/match-h2h-rows.spec.ts` can pin the shape of
   the table without rendering it. */

/** The `PlayerStatistics` fields the published rows read, and nothing else. */
export type H2HStatKey = Extract<
  keyof PlayerStatistics,
  | "aces"
  | "doubleFaults"
  | "firstServeInPct"
  | "firstServeWinPct"
  | "secondServeWinPct"
  | "breakpointsSaved"
  | "serviceGamesWonPct"
  | "firstReturnWonPct"
  | "secondReturnWonPct"
  | "breakpointsWonPct"
  | "winners"
  | "unforcedErrors"
  | "forcedErrors"
  | "totalPointsWon"
  | "totalPoints"
>;

/**
 * What one side has to supply. A structural subset of `PlayerStatistics` (which
 * satisfies it) so a spec can hand over a three-field object rather than a
 * thirty-five-field one.
 */
export type H2HStats = Partial<Record<H2HStatKey, number | null>> & {
  fractions: Partial<Record<string, StatFraction>>;
};

export interface H2HRowConfig {
  /** Sentence case, as the artboard spells it. */
  label: string;
  /** The field the value is read from. Absent means the row has no source. */
  key?: H2HStatKey;
  /**
   * The `fractions` entry behind the row: the made/attempts the tooltip shows,
   * and — with `fromFraction` — the value itself.
   */
  fractionKey?: string;
  /** Render `NN%` rather than a bare count. */
  isPercentage?: boolean;
  /**
   * Compute the percentage from `fractionKey`'s made/attempts instead of
   * reading `key`. Break points saved is published as a raw count, and "9"
   * with no "of 12" beside it is not a statistic — the fraction is the figure.
   */
  fromFraction?: boolean;
  /** Tooltip reads `of {this field}` in place of a fraction. */
  ofKey?: H2HStatKey;
  /**
   * A second field added to `key`'s figure, absent read as 0 — the unjudged
   * Errors row is `unforcedErrors + (forcedErrors ?? 0)`. Never makes a value
   * out of nothing: no `key` figure is still no value.
   */
  plusKey?: H2HStatKey;
  /** The LOWER number is the better one — double faults, unforced errors. */
  lowerIsBetter?: boolean;
  /** Why a keyless row can never carry a value. */
  note?: string;
  /**
   * The film cut that shows this statistic's points in the Video tab — the
   * row's own "both players" cut, before a side is laid over it (`sideCut`).
   * A `Partial<MatchFilters>` plus Film-only extras (`FilmCut`), ANDed over
   * the shared filters in Film only. Absent when the statistic has no
   * point-level equivalent — service games won is a count of games, not a
   * set of points. The cut shows what the filter model admits; on a
   * video-derived match the aggregate is approximate, so the two counts may
   * differ, and that is accepted.
   */
  cut?: FilmCut;
  /**
   * Whose points a value cell's cut takes (`sideCut`). Absent is the server:
   * a player's serve rows (aces included) are the points they served. Return
   * rows are the returner's, so their side is the one NOT serving; result
   * rows (double faults, winners, errors) are the Result player's — the one
   * who hit the winner or made the error.
   */
  sideBy?: CutSide;
  /**
   * The cell opens the points its side WON, not every point the row is
   * about: "74 of 100 won" opens the 74 (Result › Outcome, read from the
   * viewer's side — Won for you, Lost for the opponent).
   */
  sideWon?: boolean;
  /** What the cut's points are, plural — "break points". Screen-reader copy. */
  noun?: string;
  /** What the fraction's first number counts — "9 of 12 saved". */
  verb?: string;
  /**
   * A statistic counted from the points themselves (`tallySide`) over the
   * whole match rather than read as published:
   *
   * - `returnWinners` — no provider publishes it.
   * - `unreturnedServes` — the derived Aces row: an Advantage Intelligence
   *   match publishes no aces at all (see `DERIVED_SERVE_ROWS`).
   * - `netAttempts`, `netPointsWon` — counted with `cameToNet`, the predicate
   *   the rows' cut opens, so a figure and its "Watch all N" cannot disagree.
   * - `approachPointsWon`, `passingShotsWon` — counted with `netEntryOf` /
   *   `netEndingOf` (`match-filters/net-game.ts`), the predicates behind the
   *   cuts' `netEntry` / `netEnding`.
   * - `lobPointsWon` — counted with `hitALob` over the ball-paths file's lobs;
   *   no file, no figure and no cut (`withLobAvailability`).
   */
  fromPoints?:
    | "returnWinners"
    | "unreturnedServes"
    | "netAttempts"
    | "netPointsWon"
    | "approachPointsWon"
    | "passingShotsWon"
    | "lobPointsWon"
    | "dropShotPointsWon";
}

export const SERVE_ROWS: H2HRowConfig[] = [
  {
    // Serve › Result "Ace" by the server: exactly `resultType` "Ace", which
    // leaves out the service winners (every unreturned serve and missed return
    // on a video match).
    label: "Aces",
    key: "aces",
    cut: { serveResult: ["ace"] },
    sideBy: "server",
    noun: "aces",
  },
  {
    // A point can only end on the server's own serve error when it is a
    // double fault, so Error + Serve IS the double-fault bucket.
    label: "Double faults",
    key: "doubleFaults",
    lowerIsBetter: true,
    cut: { resultEnding: ["error"], resultShot: ["Serve"] },
    sideBy: "player",
    noun: "double faults",
  },
  {
    // The first serves that landed: Serve type First plus `serveIn`, which
    // drops a lone first serve in the net whose second serve the vendor never
    // recorded — Type First alone would count it. Every serve and return row
    // carries `serveIn` for the same reason: the published figures count only
    // serves that landed (`s.result = 'In'`), so a double fault is never a
    // second-serve return point.
    label: "First serve in",
    key: "firstServeInPct",
    isPercentage: true,
    fractionKey: "firstServeInPct",
    cut: { serveType: ["first"], serveIn: true },
    noun: "first-serve points",
    verb: "in",
  },
  {
    label: "First serve points won",
    key: "firstServeWinPct",
    isPercentage: true,
    fractionKey: "firstServeWinPct",
    cut: { serveType: ["first"], serveIn: true },
    sideWon: true,
    noun: "first-serve points",
    verb: "won",
  },
  {
    label: "Second serve points won",
    key: "secondServeWinPct",
    isPercentage: true,
    fractionKey: "secondServeWinPct",
    cut: { serveType: ["second"], serveIn: true },
    sideWon: true,
    noun: "second-serve points",
    verb: "won",
  },
  {
    label: "Break points saved",
    key: "breakpointsSaved",
    isPercentage: true,
    fractionKey: "breakpointsSaved",
    fromFraction: true,
    cut: { scoreType: ["breakpoint"] },
    sideWon: true,
    noun: "break points",
    verb: "saved",
  },
  {
    label: "Service games won",
    key: "serviceGamesWonPct",
    isPercentage: true,
    fractionKey: "serviceGamesWonPct",
    verb: "won",
  },
];

export const RETURN_ROWS: H2HRowConfig[] = [
  {
    label: "First serve returns won",
    key: "firstReturnWonPct",
    isPercentage: true,
    fractionKey: "firstReturnWonPct",
    cut: { serveType: ["first"], serveIn: true },
    sideBy: "returner",
    sideWon: true,
    noun: "first-serve returns",
    verb: "won",
  },
  {
    label: "Second serve returns won",
    key: "secondReturnWonPct",
    isPercentage: true,
    fractionKey: "secondReturnWonPct",
    cut: { serveType: ["second"], serveIn: true },
    sideBy: "returner",
    sideWon: true,
    noun: "second-serve returns",
    verb: "won",
  },
  {
    label: "Break points converted",
    key: "breakpointsWonPct",
    isPercentage: true,
    fractionKey: "breakpointsWonPct",
    cut: { scoreType: ["breakpoint"] },
    sideBy: "returner",
    sideWon: true,
    noun: "break points",
    verb: "converted",
  },
  // No provider publishes it, but every point carries its return: a return
  // that landed, a rally of at most two shots and a winner the returner won
  // (`isReturnWinner`). Counted from the points, never borrowed from
  // `winners`, which would read as a return figure and be a total. The cut
  // is Return › Result "Winner", which admits exactly `isReturnWinner`; a
  // cell adds "returned by, and won by, that side" — exactly `tallySide`'s
  // rule.
  {
    label: "Return winners",
    fromPoints: "returnWinners",
    cut: { returnResult: ["winner"] },
    sideBy: "returner",
    sideWon: true,
    noun: "return winners",
  },
];

export const POINT_ROWS: H2HRowConfig[] = [
  // Both net rows open the same points; a Net points won cell narrows to the
  // ones that side won. Counted and cut with one predicate, `cameToNet`.
  {
    label: "Net point attempts",
    fromPoints: "netAttempts",
    cut: { netBy: "either" },
    sideBy: "net",
    noun: "net points",
  },
  {
    label: "Net points won",
    fromPoints: "netPointsWon",
    isPercentage: true,
    cut: { netBy: "either" },
    sideBy: "net",
    sideWon: true,
    noun: "net points",
    verb: "won",
  },
  {
    // Of the net points that side came in on by approaching (`netEntryOf`),
    // the share it won. A cell's cut is `{ netBy: side, netEntry }` won.
    label: "Approach points won",
    fromPoints: "approachPointsWon",
    isPercentage: true,
    cut: { netBy: "either", netEntry: "approach" },
    sideBy: "net",
    sideWon: true,
    noun: "approach points",
    verb: "won",
  },
  {
    // A side's passes are the OPPONENT's net points that ended "passed"
    // (`netEndingOf`), as a share of ALL the opponent's net points — not of
    // the points a pass was tried on, which nothing measures — so the label
    // says what it counts. The cell's cut names the other side at the net
    // (`netAgainst`). Needs the ball-paths file, or a lob would count as a
    // pass (`withLobAvailability`).
    label: "Passed the net player",
    fromPoints: "passingShotsWon",
    isPercentage: true,
    cut: { netBy: "either", netEnding: "passed" },
    sideBy: "netAgainst",
    noun: "opponent net points",
    verb: "passed",
  },
  {
    // The points in which that side struck at least one lob (`hitALob`), and
    // the share it won. Needs the ball-paths file: without it the row is a
    // dash with no cut (`withLobAvailability`).
    label: "Lob points won",
    fromPoints: "lobPointsWon",
    isPercentage: true,
    cut: { lobBy: "either" },
    sideBy: "lob",
    sideWon: true,
    noun: "lob points",
    verb: "won",
  },
  {
    // The points in which that side struck at least one drop shot
    // (`hitADropShot`), and the share it won. Read from the shots alone, so
    // it needs no ball-paths file; a match with no spin recorded simply has
    // no drop shots, and the rate is a dash.
    label: "Drop shot points won",
    fromPoints: "dropShotPointsWon",
    isPercentage: true,
    cut: { dropBy: "either" },
    sideBy: "drop",
    sideWon: true,
    noun: "drop shot points",
    verb: "won",
  },
  {
    label: "Winners",
    key: "winners",
    // Result › Ending Winner narrowed to the Film-only "winner" bucket, which
    // leaves out aces and service winners as the published figure does — Ending
    // "winner" alone admits them (`winnerHitBy` credits both to the server).
    cut: { resultEnding: ["winner"], ending: "winner" },
    sideBy: "player",
    noun: "winners",
  },
  {
    label: "Unforced errors",
    key: "unforcedErrors",
    lowerIsBetter: true,
    // Result › Ending Error covers forced errors too, and a video match does
    // not separate them — the Film-only "unforced error" bucket narrows it.
    cut: { resultEnding: ["error"], ending: "unforced-error" },
    sideBy: "player",
    noun: "unforced errors",
  },
  {
    // The row opens the whole (scoped) match; a value opens the points that
    // side won.
    label: "Total points won",
    key: "totalPointsWon",
    ofKey: "totalPoints",
    cut: {},
    sideBy: "player",
    sideWon: true,
    noun: "points",
    verb: "won",
  },
];

/**
 * The SwingVision groups with the Points group's errors as published — the
 * card draws them through `h2hGroups`, which sets the error rows to the
 * match's split (`withErrorSplit`).
 */
export const H2H_GROUPS: { title: string; configs: H2HRowConfig[] }[] = [
  { title: "Serve", configs: SERVE_ROWS },
  { title: "Return", configs: RETURN_ROWS },
  { title: "Points", configs: POINT_ROWS },
];

/* ── Advantage Intelligence (video-derived) rows ────────────────────────────
   The derivation (`lib/services/splitstep/derivation/result-type.ts`
   `classifyPoint()`) never emits "Ace": every unreturned serve is a "Service
   Winner" (as is a return struck and missed, rally length 2), so the
   published `aces` is 0. Product decision (2026-09-29): on these matches an
   unreturned serve the server won IS an ace. So that row swaps, at the widget
   alone — `match_stats` is untouched. */

/**
 * The derived Aces row: every unreturned serve the side won, counted from the
 * points (`isUnreturnedServe` — a one-shot rally won by the server). The rule
 * is structural, not the "Service Winner" label, so a service winner with an
 * intermediate stroke (rally length above one) is no ace. The cut is the
 * SwingVision Aces row's own pure pill, Serve › Result "Ace" by the server:
 * on a derived match (`MatchFilterContext.isDerived`) that pill IS
 * `isUnreturnedServe`, the very predicate the tally counts.
 */
const DERIVED_ACES_ROW: H2HRowConfig = {
  label: "Aces",
  fromPoints: "unreturnedServes",
  cut: { serveResult: ["ace"] },
  sideBy: "server",
  noun: "aces",
};

export const DERIVED_SERVE_ROWS: H2HRowConfig[] = SERVE_ROWS.map((config) =>
  config.label === "Aces" ? DERIVED_ACES_ROW : config,
);

/** `H2H_GROUPS` for an Advantage Intelligence match (`meta.isDerived`). */
export const DERIVED_H2H_GROUPS: { title: string; configs: H2HRowConfig[] }[] =
  [
    { title: "Serve", configs: DERIVED_SERVE_ROWS },
    { title: "Return", configs: RETURN_ROWS },
    { title: "Points", configs: POINT_ROWS },
  ];

/* ── Errors: one row until the split is judged ──────────────────────────────
   `MatchFilterContext.errorSplitJudged` (`lib/data/error-split.ts`). Until a
   match's errors are judged forced/unforced, its "unforced" figure is every
   error, so the Points group says "Errors" — unforced plus forced — and the
   cut opens every error. Once judged it is two rows, Unforced then Forced.
   Both apply to the SwingVision and the derived row sets alike. */

/**
 * The unjudged row: every error, one figure. Its cut is Ending Error narrowed
 * to the Film-only "error" bucket: Ending Error alone also admits double faults
 * and points with no result, and the row would offer more than it counts.
 */
const ERRORS_ROW: H2HRowConfig = {
  label: "Errors",
  key: "unforcedErrors",
  plusKey: "forcedErrors",
  lowerIsBetter: true,
  cut: { resultEnding: ["error"], ending: "error" },
  sideBy: "player",
  noun: "errors",
};

/** The judged split's second row, after "Unforced errors". */
const FORCED_ERRORS_ROW: H2HRowConfig = {
  label: "Forced errors",
  key: "forcedErrors",
  lowerIsBetter: true,
  // Ending Error narrowed to the Film-only "forced error" bucket.
  cut: { resultEnding: ["error"], ending: "forced-error" },
  sideBy: "player",
  noun: "forced errors",
};

/**
 * A Points row set with its error rows set to the match's split: the single
 * Errors row when unjudged, or the Unforced row (unchanged) followed by the
 * Forced row when judged. Every other row passes through untouched.
 */
export function withErrorSplit(
  configs: H2HRowConfig[],
  errorSplitJudged: boolean,
): H2HRowConfig[] {
  return configs.flatMap((config) => {
    if (config.key !== "unforcedErrors") return [config];
    return errorSplitJudged ? [config, FORCED_ERRORS_ROW] : [ERRORS_ROW];
  });
}

/**
 * The groups the card draws for one match: SwingVision or derived
 * (`isDerived`), with the Points group's errors split or not
 * (`errorSplitJudged`).
 */
export function h2hGroups(
  isDerived: boolean,
  errorSplitJudged: boolean,
): { title: string; configs: H2HRowConfig[] }[] {
  return (isDerived ? DERIVED_H2H_GROUPS : H2H_GROUPS).map((group) => ({
    title: group.title,
    configs: withErrorSplit(group.configs, errorSplitJudged),
  }));
}

/** `h2hGroups` for each of its four inputs, built once at module load. */
const GROUPS_BY_KIND = {
  plain: h2hGroups(false, false),
  plainJudged: h2hGroups(false, true),
  derived: h2hGroups(true, false),
  derivedJudged: h2hGroups(true, true),
};

/** Why the Lob row is a dash on a match with no ball-paths file. */
export const NO_LOB_DATA_NOTE = "No ball flight data for this match";
/** Why the Passed row is a dash then: a lob cannot be told from a pass. */
export const NO_PASS_DATA_NOTE =
  "No ball flight data, so a lob can't be told from a pass";

/**
 * The groups with the Lob points and Passed rows set to what the match can
 * say: as
 * configured when the ball-paths file's lobs are known, otherwise with no cut
 * and a note — the dash it draws then says why, and nothing offers to open
 * points no predicate can find. Every other row passes through untouched.
 */
export function withLobAvailability(
  groups: { title: string; configs: H2HRowConfig[] }[],
  hasLobs: boolean,
): { title: string; configs: H2HRowConfig[] }[] {
  if (hasLobs) return groups;
  return groups.map((group) => ({
    title: group.title,
    configs: group.configs.map((config) => {
      const note =
        config.fromPoints === "lobPointsWon"
          ? NO_LOB_DATA_NOTE
          : config.fromPoints === "passingShotsWon"
            ? NO_PASS_DATA_NOTE
            : null;
      return note ? { ...config, cut: undefined, note } : config;
    }),
  }));
}

export function groupsFor(isDerived: boolean, errorSplitJudged: boolean) {
  if (isDerived)
    return errorSplitJudged
      ? GROUPS_BY_KIND.derivedJudged
      : GROUPS_BY_KIND.derived;
  return errorSplitJudged ? GROUPS_BY_KIND.plainJudged : GROUPS_BY_KIND.plain;
}

/* ── Values and the leader rule ─────────────────────────────────────────── */

export interface H2HValue {
  /** The number the two sides are compared on; `null` when there is none. */
  value: number | null;
  /** `"75%"`, `"12"`, or `""` — this card's contract for "no data". */
  display: string;
  /** The tooltip's second line: `"9/12"` or `"of 148"`. */
  detail?: string;
}

/** `""` is what this card treats as missing; `0` is a measurement. */
export function statDisplay(
  value: number | null,
  isPercentage?: boolean,
): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "";
  return isPercentage ? `${Math.round(value)}%` : String(Math.round(value));
}

/**
 * Which side to emphasise, or `null` for neither.
 *
 * Two of the fifteen rows invert: fewer double faults and fewer unforced
 * errors are the better result, and emphasising the larger number there would
 * congratulate a player for the one thing on the row they got wrong. Ties
 * emphasise nobody — a bolded number that is not ahead of anything reads as a
 * lead.
 */
export function rowLeader(
  config: Pick<H2HRowConfig, "lowerIsBetter">,
  you: number | null,
  opp: number | null,
): "you" | "opp" | null {
  if (you === null || opp === null) return null;
  if (you === opp) return null;
  const youAhead = config.lowerIsBetter ? you < opp : you > opp;
  return youAhead ? "you" : "opp";
}

/** One side's figure for one row. */
export function rowValue(config: H2HRowConfig, stats: H2HStats): H2HValue {
  const fraction = config.fractionKey
    ? stats.fractions[config.fractionKey]
    : undefined;
  const asFraction = fraction
    ? `${fraction.made}/${fraction.attempts}`
    : undefined;

  if (config.fromFraction) {
    const value =
      fraction && fraction.attempts > 0
        ? (fraction.made / fraction.attempts) * 100
        : null;
    return { value, display: statDisplay(value, true), detail: asFraction };
  }

  if (!config.key) return { value: null, display: "", detail: asFraction };

  const raw = stats[config.key];
  // Absent must reach here as null rather than 0 — see the mapping in
  // match-stats-server.ts.
  const base = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  const plus = config.plusKey ? stats[config.plusKey] : null;
  const value =
    base !== null && typeof plus === "number" && Number.isFinite(plus)
      ? base + plus
      : base;
  const outOf = config.ofKey ? stats[config.ofKey] : undefined;

  return {
    value,
    display: statDisplay(value, config.isPercentage),
    detail:
      typeof outOf === "number" && Number.isFinite(outOf)
        ? `of ${outOf}`
        : asFraction,
  };
}

export interface H2HRow {
  label: string;
  /** Present only on rows that can never have a value. */
  note?: string;
  /** The config's cut, sideless — `sideCut` adds the cell's side. */
  cut?: FilmCut;
  sideBy?: CutSide;
  sideWon?: boolean;
  noun?: string;
  verb?: string;
  you: H2HValue;
  opp: H2HValue;
  leader: "you" | "opp" | null;
}

function assembleRow(
  config: H2HRowConfig,
  you: H2HValue,
  opp: H2HValue,
): H2HRow {
  return {
    label: config.label,
    note: config.note,
    cut: config.cut,
    sideBy: config.sideBy,
    sideWon: config.sideWon,
    noun: config.noun,
    verb: config.verb,
    you,
    opp,
    leader: rowLeader(config, you.value, opp.value),
  };
}

/**
 * The published (whole-match) rows. `you`/`opp` rather than `p1`/`p2` on
 * purpose: a builder keyed on player order is exactly the shape that silently
 * swaps a match's statistics when the viewer happens to be player2.
 */
export function buildStatRows(
  configs: H2HRowConfig[],
  you: H2HStats,
  opp: H2HStats,
): H2HRow[] {
  return configs.map((config) =>
    assembleRow(config, rowValue(config, you), rowValue(config, opp)),
  );
}

/* ── Point-derived statistics ───────────────────────────────────────────────
   The card is always the whole match: its figures are the published
   `match_stats` numbers (`buildStatRows`). The match filters live on the
   Video tab only and never reach this card. The exceptions are the
   `fromPoints` rows — a statistic no provider publishes (return winners),
   and on an Advantage Intelligence match its aces and winners — which are
   counted here from every point of the match. */

export interface Tally {
  won: number;
  total: number;
}

export interface DerivedSide {
  aces: number;
  doubleFaults: number;
  winners: number;
  unforcedErrors: number;
  servicePoints: Tally;
  returnPoints: Tally;
  /** Break points faced while serving; `won` = saved. */
  breakPointsFaced: Tally;
  /** Break points held while returning; `won` = converted. */
  breakPointsAgainst: Tally;
  shortRally: Tally;
  mediumRally: Tally;
  longRally: Tally;
  allPoints: Tally;
  /** Points this side returned that ended on its winning return. */
  returnWinners: number;
  /** Points this side returned whose return shot was recorded at all. */
  returnsRecorded: number;
  /**
   * Points this side served that were never returned and it won
   * (`isUnreturnedServe`) — the derived Aces row.
   */
  unreturnedServes: number;
  /** Points this side came to the net (`cameToNet`); `won` = won them. */
  netPoints: Tally;
  /** Net points this side came in on by approaching (`netEntryOf`). */
  approachPoints: Tally;
  /**
   * The OPPONENT's net points this side passed (`netEndingOf` "passed" for
   * the opponent) — `won` — of every opponent net point — `total`. `null`
   * without lob keys: a lob would count as a pass.
   */
  passes: Tally | null;
  /**
   * Points this side struck a lob in (`hitALob`); `won` = won them. `null`
   * without lob keys: unknown, not none.
   */
  lobPoints: Tally | null;
  /** Points this side struck a drop shot in (`hitADropShot`); `won` = won them. */
  dropPoints: Tally;
  /** Whether the points carry this side's shots, so a net zero is measured. */
  shotsRecorded: boolean;
}

function emptyTally(): Tally {
  return { won: 0, total: 0 };
}

export function tallySide(
  points: MatchPoint[],
  isPlayer1: boolean,
  lobKeys: ReadonlySet<number> | null = null,
): DerivedSide {
  const d: DerivedSide = {
    aces: 0,
    doubleFaults: 0,
    winners: 0,
    unforcedErrors: 0,
    servicePoints: emptyTally(),
    returnPoints: emptyTally(),
    breakPointsFaced: emptyTally(),
    breakPointsAgainst: emptyTally(),
    shortRally: emptyTally(),
    mediumRally: emptyTally(),
    longRally: emptyTally(),
    allPoints: emptyTally(),
    returnWinners: 0,
    returnsRecorded: 0,
    unreturnedServes: 0,
    netPoints: emptyTally(),
    approachPoints: emptyTally(),
    passes: lobKeys ? emptyTally() : null,
    lobPoints: lobKeys ? emptyTally() : null,
    dropPoints: emptyTally(),
    shotsRecorded: false,
  };
  for (const p of points) {
    const iWon = p.wonByPlayer1 === isPlayer1;
    const iServed = p.serverIsPlayer1 === isPlayer1;
    const result = (p.resultType ?? "").toLowerCase();

    d.allPoints.total += 1;
    if (iWon) d.allPoints.won += 1;

    if (p.shots?.some((shot) => shot.isPlayer1 === isPlayer1)) {
      d.shotsRecorded = true;
    }
    if (cameToNet(p, isPlayer1)) {
      d.netPoints.total += 1;
      if (iWon) d.netPoints.won += 1;
      if (netEntryOf(p, isPlayer1) === "approach") {
        d.approachPoints.total += 1;
        if (iWon) d.approachPoints.won += 1;
      }
    }
    if (d.passes && cameToNet(p, !isPlayer1)) {
      d.passes.total += 1;
      if (netEndingOf(p, !isPlayer1, lobKeys) === "passed") d.passes.won += 1;
    }
    if (d.lobPoints && lobKeys && hitALob(p, isPlayer1, lobKeys)) {
      d.lobPoints.total += 1;
      if (iWon) d.lobPoints.won += 1;
    }
    if (hitADropShot(p, isPlayer1)) {
      d.dropPoints.total += 1;
      if (iWon) d.dropPoints.won += 1;
    }

    if (iServed) {
      d.servicePoints.total += 1;
      if (iWon) d.servicePoints.won += 1;
      if (p.isBreakPoint) {
        d.breakPointsFaced.total += 1;
        if (iWon) d.breakPointsFaced.won += 1;
      }
      // Aces and double faults belong to the server structurally, so they are
      // attributed by who served rather than by who struck last.
      if (result === "ace") d.aces += 1;
      if (result === "double fault") d.doubleFaults += 1;
      if (isUnreturnedServe(p)) d.unreturnedServes += 1;
    } else {
      d.returnPoints.total += 1;
      if (iWon) d.returnPoints.won += 1;
      if (p.isBreakPoint) {
        d.breakPointsAgainst.total += 1;
        if (iWon) d.breakPointsAgainst.won += 1;
      }
      if (p.secondShotResult) d.returnsRecorded += 1;
      // The returner has to have won it: a two-shot "winner" the server won
      // is a mislabelled shot, not a return winner.
      if (iWon && isReturnWinner(p)) d.returnWinners += 1;
    }

    // `calculate_match_stats` buckets these with LIKE '%Winner%' (less
    // 'Service Winner') and LIKE '%Unforced Error%' against the same free-text
    // `result_type` (see lib/services/splitstep/derivation/result-type.ts).
    // Matching the same substrings keeps a scoped row comparable with the
    // published one. Credited as the Result filters and Point endings credit
    // them.
    if (countsAsWinner(p)) {
      if (winnerHitBy(p) === isPlayer1) d.winners += 1;
    } else if (result.includes("unforced error")) {
      if (errorMadeBy(p) === isPlayer1) d.unforcedErrors += 1;
    }

    // rallyLength is 0 when the source recorded none — not a one-shot rally.
    const bandKey = rallyLengthBandOf(p.rallyLength);
    const band =
      bandKey === "long"
        ? d.longRally
        : bandKey === "medium"
          ? d.mediumRally
          : bandKey === "short"
            ? d.shortRally
            : null;
    if (band) {
      band.total += 1;
      if (iWon) band.won += 1;
    }
  }

  return d;
}

/**
 * A `fromPoints` statistic's value, or `null` when the points cannot support
 * it.
 *
 * - Return winners: 0 is a measurement only where returns were recorded;
 *   with none, a zero would say "no return winners" about points nobody
 *   looked at.
 * - Unreturned serves: likewise only where the side served at all.
 * - Net attempts: likewise only where the side's shots were recorded.
 * - Net points won: a rate needs an attempt. Coming in and losing every one is
 *   a measured 0%; never coming in is no rate at all.
 * - Approach points won, Passing shots won, Lob points won, Drop shot points
 *   won: likewise rates, over approaches, the opponent's net points, lob
 *   points and drop shot points; the lob rate also needs the ball-paths file
 *   (`lobPoints` null without it).
 */
function derivedValue(config: H2HRowConfig, d: DerivedSide): number | null {
  switch (config.fromPoints) {
    case "returnWinners":
      return d.returnsRecorded > 0 ? d.returnWinners : null;
    case "unreturnedServes":
      return d.servicePoints.total > 0 ? d.unreturnedServes : null;
    case "netAttempts":
      return d.shotsRecorded ? d.netPoints.total : null;
    case "netPointsWon":
      return rate(d.netPoints);
    case "approachPointsWon":
      return rate(d.approachPoints);
    case "passingShotsWon":
      return d.passes ? rate(d.passes) : null;
    case "lobPointsWon":
      return d.lobPoints ? rate(d.lobPoints) : null;
    case "dropShotPointsWon":
      return rate(d.dropPoints);
    default:
      return null;
  }
}

function rate(t: Tally): number | null {
  return t.total > 0 ? (t.won / t.total) * 100 : null;
}

/** The tally behind a rate row — its tooltip's "won of total". */
export function rateTally(config: H2HRowConfig, d: DerivedSide): Tally | null {
  switch (config.fromPoints) {
    case "netPointsWon":
      return d.netPoints;
    case "approachPointsWon":
      return d.approachPoints;
    case "passingShotsWon":
      return d.passes;
    case "lobPointsWon":
      return d.lobPoints;
    case "dropShotPointsWon":
      return d.dropPoints;
    default:
      return null;
  }
}

const NO_VALUE: H2HValue = { value: null, display: "" };

function derivedSideValue(config: H2HRowConfig, d: DerivedSide): H2HValue {
  const value = derivedValue(config, d);
  if (value === null) return NO_VALUE;
  const tally = rateTally(config, d);
  return {
    value,
    display: statDisplay(value, config.isPercentage),
    detail: tally ? `${tally.won}/${tally.total}` : undefined,
  };
}

/** One `fromPoints` row, counted from `youDerived`/`oppDerived`. */
function deriveRow(
  config: H2HRowConfig,
  youDerived: DerivedSide,
  oppDerived: DerivedSide,
): H2HRow {
  return assembleRow(
    config,
    derivedSideValue(config, youDerived),
    derivedSideValue(config, oppDerived),
  );
}

/**
 * The whole-match rows: the published figures, except the statistics only the
 * points carry, which are counted from every point of the match.
 */
export function withPointRows(
  configs: H2HRowConfig[],
  published: H2HRow[],
  youDerived: DerivedSide,
  oppDerived: DerivedSide,
): H2HRow[] {
  return configs.map((config, i) =>
    config.fromPoints
      ? deriveRow(config, youDerived, oppDerived)
      : published[i],
  );
}
