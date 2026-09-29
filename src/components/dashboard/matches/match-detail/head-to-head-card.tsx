"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, CirclePlay } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChartTooltip } from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import {
  applyFilmCut,
  isReturnWinner,
  isUnreturnedServe,
  sideCut,
  type CutSide,
  type FilmCut,
} from "@/components/dashboard/matches/match-detail/film-cut-context";
import { useMatchFilters } from "@/components/dashboard/matches/match-detail/match-filters/provider";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { PlayerStatistics, StatFraction } from "@/lib/data/types";
import { surnameLabels } from "@/lib/data/match-utils";
import { cn } from "@/lib/utils";

/**
 * The Statistics pane's head-to-head table (artboard 47f).
 *
 * A plain two-column table: the statistic on the left, both players' numbers
 * on the right, and nothing between them. The 46a card drew mirrored values
 * around a centred label with a share bar under each row and a fraction beside
 * each number; at fifteen rows that is three visual channels saying the same
 * thing, so the bar and the sub-figure are gone and the fraction moved into
 * the row's hover tooltip.
 *
 * Which side is "you" comes exclusively from `useMatchSides()` (guardrails §4).
 * Nothing in this file reads `player1`/`player2` to decide which column a
 * number belongs in — the row builder below takes `you` and `opp` statistics as
 * arguments precisely so the orientation is decided once, at the call site that
 * holds `sides`.
 */

/* ── Row configuration ──────────────────────────────────────────────────────
   Pure data, exported so `tests/match-h2h-rows.spec.ts` can pin the shape of
   the table without rendering it. */

/** The `PlayerStatistics` fields the fifteen rows read, and nothing else. */
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
  | "netPointsWonPct"
  | "winners"
  | "unforcedErrors"
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
   * a player's serve rows are the points they served. Return rows are the
   * returner's, so their side is the one NOT serving; result rows (aces,
   * double faults, winners, errors) are the Result player's — the one who hit
   * the winner or made the error.
   */
  sideBy?: CutSide;
  /**
   * The cell opens the points its side WON, not every point the row is
   * about: "74 of 100 won" opens the 74 (Result › Won, from that side).
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
   * - `winnersLessUnreturned` — the derived Winners row: the published
   *   `winners` (read through `key`) less the side's unreturned serves,
   *   which that figure already counts.
   */
  fromPoints?: "returnWinners" | "unreturnedServes" | "winnersLessUnreturned";
}

export const SERVE_ROWS: H2HRowConfig[] = [
  {
    // Result › Winner by the server, narrowed to the "Ace" bucket: Winner
    // alone would add every service winner, which the report counts as a
    // winner (and which is every unreturned serve on a video match).
    label: "Aces",
    key: "aces",
    cut: { resultOutcome: ["winner"], ending: "ace" },
    sideBy: "player",
    noun: "aces",
  },
  {
    // A point can only end on the server's own serve error when it is a
    // double fault, so Error + Serve IS the double-fault bucket.
    label: "Double faults",
    key: "doubleFaults",
    lowerIsBetter: true,
    cut: { resultOutcome: ["error"], resultShot: ["Serve"] },
    sideBy: "player",
    noun: "double faults",
  },
  {
    // The first serves that landed: a point is "played on a first serve"
    // (Serve type First) exactly when the first serve went in, so this opens
    // the numerator.
    label: "First serve in",
    key: "firstServeInPct",
    isPercentage: true,
    fractionKey: "firstServeInPct",
    cut: { serveType: ["first"] },
    noun: "first-serve points",
    verb: "in",
  },
  {
    label: "First serve points won",
    key: "firstServeWinPct",
    isPercentage: true,
    fractionKey: "firstServeWinPct",
    cut: { serveType: ["first"] },
    sideWon: true,
    noun: "first-serve points",
    verb: "won",
  },
  {
    label: "Second serve points won",
    key: "secondServeWinPct",
    isPercentage: true,
    fractionKey: "secondServeWinPct",
    cut: { serveType: ["second"] },
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
    cut: { serveType: ["first"] },
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
    cut: { serveType: ["second"] },
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
  // is the Film-only `return-winner` ending: Result › Shot "Return" finds the
  // return from shot rows, which a point without them does not carry, so it
  // could not agree with this count. A cell adds "returned by, and won by,
  // that side" — exactly `tallySide`'s rule.
  {
    label: "Return winners",
    fromPoints: "returnWinners",
    cut: { ending: "return-winner" },
    sideBy: "returner",
    sideWon: true,
    noun: "return winners",
  },
];

export const POINT_ROWS: H2HRowConfig[] = [
  // No cut: the match filters have no net-approach axis to open.
  {
    label: "Net points won",
    key: "netPointsWonPct",
    isPercentage: true,
    fractionKey: "netPointsWonPct",
    verb: "won",
  },
  {
    label: "Winners",
    key: "winners",
    // Result › Winner narrowed to the "winner" bucket, which leaves aces on
    // their own line as the published figure does.
    cut: { resultOutcome: ["winner"], ending: "winner" },
    sideBy: "player",
    noun: "winners",
  },
  {
    label: "Unforced errors",
    key: "unforcedErrors",
    lowerIsBetter: true,
    // Result › Error covers forced errors too, and a video match does not
    // separate them — the Film-only "unforced error" bucket narrows it.
    cut: { resultOutcome: ["error"], ending: "unforced-error" },
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

export const H2H_GROUPS: { title: string; configs: H2HRowConfig[] }[] = [
  { title: "Serve", configs: SERVE_ROWS },
  { title: "Return", configs: RETURN_ROWS },
  { title: "Points", configs: POINT_ROWS },
];

/** Every row's config, flattened once — `H2H_GROUPS` is fixed at module load. */
const ALL_H2H_CONFIGS: H2HRowConfig[] = H2H_GROUPS.flatMap(
  (group) => group.configs,
);

/* ── Advantage Intelligence (video-derived) rows ────────────────────────────
   The derivation (`lib/services/splitstep/derivation/result-type.ts`
   `classifyPoint()`) never emits "Ace": every unreturned serve is a "Service
   Winner", so the published `aces` is 0 and the published `winners`
   (LIKE '%Winner%') already counts those points. Product decision
   (2026-09-29): on these matches an unreturned serve the server won IS an
   ace. So two rows swap, at the widget alone — `match_stats` is untouched. */

/**
 * The derived Aces row: every unreturned serve the side won, counted from the
 * points (`isUnreturnedServe` — a one-shot rally won by the server). The rule
 * is structural, not the "Service Winner" label, so a service winner with an
 * intermediate stroke (rally length above one) stays a winner. The cut is the
 * Film-only `unreturned-serve` ending, the very predicate the tally counts.
 */
const DERIVED_ACES_ROW: H2HRowConfig = {
  label: "Aces",
  fromPoints: "unreturnedServes",
  cut: { resultOutcome: ["winner"], ending: "unreturned-serve" },
  sideBy: "player",
  noun: "aces",
};

/**
 * The derived Winners row: the published `winners` less the side's
 * unreturned serves, now counted as aces. Its cut is the `rally-winner`
 * ending — the winner bucket without them — so it never opens a point the
 * derived Aces row does. Double faults stay published: the derivation does
 * emit "Double Fault" on a lost second serve.
 */
const DERIVED_WINNERS_ROW: H2HRowConfig = {
  label: "Winners",
  key: "winners",
  fromPoints: "winnersLessUnreturned",
  cut: { resultOutcome: ["winner"], ending: "rally-winner" },
  sideBy: "player",
  noun: "winners",
};

export const DERIVED_SERVE_ROWS: H2HRowConfig[] = SERVE_ROWS.map((config) =>
  config.label === "Aces" ? DERIVED_ACES_ROW : config,
);

export const DERIVED_POINT_ROWS: H2HRowConfig[] = POINT_ROWS.map((config) =>
  config.label === "Winners" ? DERIVED_WINNERS_ROW : config,
);

/** `H2H_GROUPS` for an Advantage Intelligence match (`meta.isDerived`). */
export const DERIVED_H2H_GROUPS: { title: string; configs: H2HRowConfig[] }[] =
  [
    { title: "Serve", configs: DERIVED_SERVE_ROWS },
    { title: "Return", configs: RETURN_ROWS },
    { title: "Points", configs: DERIVED_POINT_ROWS },
  ];

const ALL_DERIVED_H2H_CONFIGS: H2HRowConfig[] = DERIVED_H2H_GROUPS.flatMap(
  (group) => group.configs,
);

// `CutSide`/`sideCut` — one value cell's cut, the row's cut with the cell's
// side laid over it — now live in `film-cut-context.tsx` beside `FilmCut`
// itself, since `point-endings-card.tsx` composes a cut the same way.
// Re-exported here so this module's own call sites are unchanged.
export type { CutSide };
export { sideCut };

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
  const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
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

interface Tally {
  won: number;
  total: number;
}

interface DerivedSide {
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
}

function emptyTally(): Tally {
  return { won: 0, total: 0 };
}

export function tallySide(
  points: MatchPoint[],
  isPlayer1: boolean,
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
  };
  const me = isPlayer1 ? "player1" : "player2";

  for (const p of points) {
    const iWon = p.wonByPlayer1 === isPlayer1;
    const iServed = p.serverIsPlayer1 === isPlayer1;
    const result = (p.resultType ?? "").toLowerCase();

    d.allPoints.total += 1;
    if (iWon) d.allPoints.won += 1;

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

    // `calculate_match_stats` buckets these with LIKE '%Winner%' and
    // LIKE '%Unforced Error%' against the same free-text `result_type`
    // (see lib/services/splitstep/derivation/result-type.ts). Matching the
    // same substrings keeps a scoped row comparable with the published one.
    if (p.player === me) {
      if (result.includes("winner")) d.winners += 1;
      else if (result.includes("unforced error")) d.unforcedErrors += 1;
    }

    // rallyLength is 0 when the source recorded none — not a one-shot rally.
    const band =
      p.rallyLength >= 9
        ? d.longRally
        : p.rallyLength >= 5
          ? d.mediumRally
          : p.rallyLength >= 1
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
 * it. `published` is the side's published figure for the same row (read
 * through the config's `key`), which the Winners subtraction starts from.
 *
 * - Return winners: 0 is a measurement only where returns were recorded;
 *   with none, a zero would say "no return winners" about points nobody
 *   looked at.
 * - Unreturned serves: likewise only where the side served at all.
 * - Winners less unreturned serves: nothing published is nothing to
 *   subtract from; never below 0.
 */
function derivedValue(
  config: H2HRowConfig,
  d: DerivedSide,
  published: H2HValue,
): number | null {
  switch (config.fromPoints) {
    case "returnWinners":
      return d.returnsRecorded > 0 ? d.returnWinners : null;
    case "unreturnedServes":
      return d.servicePoints.total > 0 ? d.unreturnedServes : null;
    case "winnersLessUnreturned":
      return published.value === null
        ? null
        : Math.max(0, published.value - d.unreturnedServes);
    default:
      return null;
  }
}

const NO_VALUE: H2HValue = { value: null, display: "" };

function derivedSideValue(
  config: H2HRowConfig,
  d: DerivedSide,
  published: H2HValue,
): H2HValue {
  const value = derivedValue(config, d, published);
  if (value === null) return NO_VALUE;
  return { value, display: statDisplay(value, config.isPercentage) };
}

/** One `fromPoints` row, counted from `youDerived`/`oppDerived`. */
function deriveRow(
  config: H2HRowConfig,
  published: H2HRow,
  youDerived: DerivedSide,
  oppDerived: DerivedSide,
): H2HRow {
  return assembleRow(
    config,
    derivedSideValue(config, youDerived, published.you),
    derivedSideValue(config, oppDerived, published.opp),
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
      ? deriveRow(config, published[i], youDerived, oppDerived)
      : published[i],
  );
}

/* ── Rendering ──────────────────────────────────────────────────────────── */

/** Both value columns and both name cells; the artboard's 64 px, right-aligned. */
const COLUMN = "flex w-[64px] shrink-0 items-center justify-end gap-1";

const EASE = "duration-200 ease-[var(--ease-primary)]";

/**
 * What the cursor (or keyboard focus) is on. The label is the "both players"
 * target and each number is one player's, so the hover says which of the two
 * a click will open before it happens. One hover state at a time: the label
 * washes the row, a number washes only itself — never both at once.
 */
type Zone = "row" | "you" | "opp";

interface HoverTarget {
  row: string;
  zone: Zone;
}

/**
 * A value's fraction in words: `9/12` → `9 of 12`, and a count published with
 * an `of N` detail (total points won) → `68 of 148`. `null` when the value has
 * no fraction behind it.
 */
export function fractionWords(value: H2HValue): string | null {
  const { detail, display } = value;
  if (!detail || !display) return null;
  if (detail.startsWith("of ")) return `${display} ${detail}`;
  const [made, attempts] = detail.split("/");
  return attempts === undefined ? detail : `${made} of ${attempts}`;
}

/** The click-through a readout offers: the scope's point count, in Video. */
export function watchLine(count: number): string {
  // "Watch all 1" reads as a miscount; one point is just "it".
  return count === 1 ? "Watch it in Video" : `Watch all ${count} in Video`;
}

/** The same click, for a screen reader, which has no readout title to lean on. */
export function watchLabel(count: number, noun: string): string {
  return count === 1
    ? "Watch it in Video"
    : `Watch all ${count} ${noun} in Video`;
}

interface ReadoutLine {
  name: string;
  value: string;
  /** The opponent recedes, as it does in the Rally length readout. */
  muted?: boolean;
}

/**
 * What a click on the target would do. `watch` opens `count` points in Video;
 * `no-video` holds the same slot on a match with no playable video, so a
 * statistic reads the same with or without one — only the action is gone.
 */
type ReadoutFooter = { kind: "watch"; count: number } | { kind: "no-video" };

const NO_VIDEO_LINE = "No video attached";

/** Everything one readout says. */
interface ReadoutContent {
  title: string;
  lines: ReadoutLine[];
  note?: string;
  footer?: ReadoutFooter;
}

/**
 * Whether a readout has anything to say. A title alone repeats the label the
 * cursor is already on — "Aces" over "Aces" — so it does not count.
 */
export function hasReadout(
  content: ReadoutContent | null,
): content is ReadoutContent {
  if (!content) return false;
  return content.lines.length > 0 || Boolean(content.note || content.footer);
}

const IN_SCOPE = "in this match";

/** A measured zero count. Only a count: 0% of 3 break points is not "none". */
function isZeroCount(value: H2HValue): boolean {
  return value.display === "0";
}

/** A figure's fraction in words with its verb: `11 of 25 won`, or null. */
function fractionPhrase(row: H2HRow, value: H2HValue): string | null {
  const fraction = fractionWords(value);
  return fraction ? [fraction, row.verb].filter(Boolean).join(" ") : null;
}

/** One side's figure in words: `44%, 11 of 25 won`, `68 of 148 won`, `3`. */
function figureWords(row: H2HRow, side: "you" | "opp"): string {
  const value = row[side];
  const inWords = fractionPhrase(row, value);
  // "74 of 138 won" already carries the figure; "44%" does not.
  if (!inWords) return value.display;
  return value.detail?.startsWith("of ")
    ? inWords
    : `${value.display}, ${inWords}`;
}

interface ReadoutScope {
  /** The match has a playable video, so its cuts can be opened. */
  hasVideo: boolean;
  /** How many points the target's cut opens (0 without video). */
  count: number;
  /**
   * Whether "No video attached" is true to say. False on a read-only share
   * link (`meta.readOnly`), which never shows video even when the match has
   * one — the readout carries its evidence alone there.
   */
  noVideoLine: boolean;
}

/**
 * One figure's readout, or `null` for an em dash (which keeps its own "No
 * data" tooltip). The same shape with or without video: the evidence (its
 * fraction, or "No aces in this match" for a zero) is always there, and the
 * footer is the watch line when the cut has points, "No video attached" when
 * it would have had a watch line but the match has no video (never on a
 * read-only share link), and nothing on a statistic with no cut.
 */
export function figureReadout(
  row: H2HRow,
  side: "you" | "opp",
  name: string,
  { hasVideo, count, noVideoLine }: ReadoutScope,
): ReadoutContent | null {
  const value = row[side];
  if (!value.display) return null;
  const title = `${row.label} · ${name}`;
  const phrase = fractionPhrase(row, value);
  const lines: ReadoutLine[] = phrase ? [{ name: phrase, value: "" }] : [];

  if (hasVideo && row.cut && count > 0) {
    return { title, lines, footer: { kind: "watch", count } };
  }
  const note =
    isZeroCount(value) && row.noun ? `No ${row.noun} ${IN_SCOPE}` : undefined;
  // A zero has nothing to watch with or without a video, so it says so and
  // nothing more.
  const footer: ReadoutFooter | undefined =
    noVideoLine && row.cut && !note ? { kind: "no-video" } : undefined;
  return { title, lines, note, footer };
}

/**
 * The label's readout — "both players". The per-side fractions, then the same
 * footer rule a figure follows, over the row's own sideless cut.
 */
export function rowReadout(
  row: H2HRow,
  youName: string,
  oppName: string,
  { hasVideo, count, noVideoLine }: ReadoutScope,
): ReadoutContent {
  const title = row.label;
  const hasFigure = Boolean(row.you.display || row.opp.display);
  const youFraction = fractionWords(row.you);
  const oppFraction = fractionWords(row.opp);
  const lines: ReadoutLine[] =
    youFraction || oppFraction
      ? [
          { name: youName, value: youFraction ?? "—" },
          { name: oppName, value: oppFraction ?? "—", muted: true },
        ]
      : [];

  if (hasVideo && row.cut && count > 0 && hasFigure) {
    return { title, lines, note: row.note, footer: { kind: "watch", count } };
  }
  // Both players at a measured zero: the label answers the way each zero
  // does, rather than going silent between them.
  const bothZero =
    Boolean(row.noun) && isZeroCount(row.you) && isZeroCount(row.opp);
  const note = bothZero ? `No ${row.noun} ${IN_SCOPE}` : row.note;
  const footer: ReadoutFooter | undefined =
    noVideoLine && row.cut && hasFigure && !bothZero
      ? { kind: "no-video" }
      : undefined;
  return { title, lines, note, footer };
}

/** A readout's note and no-video line as a sentence (the lines excluded). */
function tailWords(content: ReadoutContent): string {
  return [
    content.note,
    content.footer?.kind === "no-video" ? NO_VIDEO_LINE : undefined,
  ]
    .filter(Boolean)
    .join(". ");
}

/** A readout as one sentence, for a target that has no click to name. */
function readoutWords(content: ReadoutContent): string {
  return [
    content.lines
      .map((line) => [line.name, line.value].filter(Boolean).join(" "))
      .join("; "),
    tailWords(content),
  ]
    .filter(Boolean)
    .join(". ");
}

/**
 * The dark readout, in three tiers: which statistic (title), the evidence
 * behind the figures (a name/value line per player, in the card's column
 * order), then what a click opens, set off by a hairline so it reads as a
 * consequence rather than more data. Inter tabular throughout — a fraction is
 * a statistic, and Roboto Mono is for machine values.
 *
 * It opens ABOVE its anchor, never over the numbers: for the label it starts at
 * the label's left edge, for a number it ends at that number's right edge. The
 * 168 px floor is the Data Tooltip spec's compact width, and keeps the box
 * from changing size as the cursor crosses from the label to a number.
 */
function Readout({
  open,
  align,
  content,
}: {
  open: boolean;
  align: "start" | "end";
  content: ReadoutContent | null;
}) {
  // A readout with nothing past its title does not open (`hasReadout`).
  if (!hasReadout(content)) return null;
  const { title, lines, note, footer } = content;
  const hasEvidence = lines.length > 0 || Boolean(note);
  return (
    <ChartTooltip
      open={open}
      align={align}
      offset={6}
      className="min-w-[168px] gap-1 px-3 py-2.5 text-left"
    >
      <span className="text-[12px] leading-4 font-medium text-white">
        {title}
      </span>
      {lines.length > 0 && (
        <span className="flex flex-col gap-px">
          {lines.map((line) => (
            <span
              key={line.name}
              className={cn(
                "tabular flex justify-between gap-6 text-[11px] leading-[15px]",
                line.muted ? "text-white/[0.78]" : "text-white",
              )}
            >
              <span>{line.name}</span>
              <span>{line.value}</span>
            </span>
          ))}
        </span>
      )}
      {note && (
        <span className="text-[11px] leading-[15px] text-white/[0.64]">
          {note}
        </span>
      )}
      {footer && (
        <span
          className={cn(
            "tabular flex items-center gap-1.5 text-[11px] leading-[15px]",
            footer.kind === "watch" ? "text-white/[0.86]" : "text-white/[0.64]",
            // The hairline divides evidence from the action; with no evidence
            // (a count row) there is nothing to divide it from.
            hasEvidence && "mt-[5px] border-t border-white/10 pt-[7px]",
          )}
        >
          {footer.kind === "watch" ? (
            <>
              <CirclePlay
                aria-hidden="true"
                className="h-3 w-3 shrink-0"
                strokeWidth={1.5}
              />
              {watchLine(footer.count)}
            </>
          ) : (
            NO_VIDEO_LINE
          )}
        </span>
      )}
    </ChartTooltip>
  );
}

/** Hover and focus wiring for one target — keyboard gets what the mouse gets. */
interface TargetHandlers {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

/**
 * One figure's target: its click (absent when there is nothing to open), its
 * screen-reader sentence and its hover wiring.
 */
interface FigureTarget {
  onClick?: () => void;
  label: string;
  handlers: TargetHandlers;
}

/**
 * The figure's box, and its wash. On a target it is the button itself, so the
 * hit area is exactly the grey wash — no wider than the number. The -mr
 * cancels the pr so the digits stay on the column's right edge, aligned with
 * every figure that has no box.
 */
const FIGURE = `tabular -mr-1.5 rounded-[var(--radius-cell)] px-1.5 py-0.5 text-[13px] transition-colors ${EASE}`;

/**
 * The label target's stretched box: its `::after` covers the whole row, so the
 * hit area is exactly the row's wash. The ring moves onto it (with
 * `data-focus-ring="none"` on the element) so focus draws the same box.
 */
const STRETCHED =
  "after:absolute after:inset-0 after:rounded-[var(--radius-element)] after:content-[''] focus-visible:after:[box-shadow:var(--focus-ring)]";

function ValueCell({
  value,
  emphasised,
  note,
  washed,
  target,
  readout,
}: {
  value: H2HValue;
  emphasised: boolean;
  note?: string;
  /** The cursor or focus is on this figure. */
  washed: boolean;
  /**
   * The figure as a hover target. Every figure with a readout is one, video
   * or not; it clicks through only when its cut has points to open in Video.
   * The em-dash cell below ignores it — it keeps its own "No data" tooltip.
   */
  target?: FigureTarget;
  readout?: ReactNode;
}) {
  if (value.display) {
    const style: React.CSSProperties = {
      fontWeight: emphasised ? 500 : 400,
      color: emphasised ? "var(--ink-900)" : "var(--ink-500)",
      backgroundColor: washed ? "var(--surface-subtle)" : "transparent",
    };
    if (target) {
      // One element for every figure, so a figure with nothing to open is
      // the same hit area, wash and focus ring as one that plays. With no
      // click it is a button with nothing to do — `aria-disabled` says so and
      // keeps it reachable by Tab, which `disabled` would not. `relative z-[1]`
      // lifts it over the row's stretched target. Focus is `focus.css`'s
      // ring — nothing written here.
      return (
        <span className={COLUMN}>
          <button
            type="button"
            onClick={target.onClick}
            aria-disabled={target.onClick ? undefined : true}
            aria-label={target.label}
            {...target.handlers}
            className={cn(
              FIGURE,
              "relative z-[1] border-0",
              target.onClick ? "cursor-pointer" : "cursor-default",
            )}
            style={style}
          >
            {value.display}
            {readout}
          </button>
        </span>
      );
    }
    return (
      <span className={COLUMN}>
        <span className={FIGURE} style={style}>
          {value.display}
        </span>
      </span>
    );
  }

  // The card's missing-data convention (match-statistics-card.tsx): an italic
  // em dash that says why on hover, never a zero. Lifted over the row's
  // stretched target so its tooltip still gets the hover.
  return (
    <span className={COLUMN}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label="No data recorded for this stat"
            className="tabular relative z-[1] cursor-help text-[13px] font-light text-[var(--color-text-muted)] italic"
          >
            —
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          className="px-2.5 py-1.5 text-[11px] leading-[14px]"
        >
          {note ?? "No data"}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

/** How many points each of a row's three targets opens. */
interface RowCounts {
  both: number;
  you: number;
  opp: number;
}

export function HeadToHeadCard() {
  const { match, points } = useMatchData();
  const { meta, actions } = useMatchReport();
  const sides = useMatchSides();
  // Only the filter CONTEXT (you/opp seat and hands), never the applied
  // filters: it is what the Video tab resolves a cut with, so the counts
  // below say what the tab will list. The card itself is always the whole
  // match — the match filters live on the Video tab alone.
  const { context } = useMatchFilters();
  const [hover, setHover] = useState<HoverTarget | null>(null);

  const youStats = sides.you.stats;
  const oppStats = sides.opp.stats;
  const youIsPlayer1 = sides.you.isPlayer1;
  const [youName, oppName] = surnameLabels(sides.you.name, sides.opp.name);

  // An Advantage Intelligence match counts its aces from the points
  // (`DERIVED_H2H_GROUPS`). `meta.isDerived` is set by the dashboard and by
  // the /m/[token] share page alike. The table and the counts below iterate
  // the SAME configs, so a cell's "Watch all N" and its click open one cut.
  const isDerived = meta.isDerived;
  const groups = isDerived ? DERIVED_H2H_GROUPS : H2H_GROUPS;

  const sections = useMemo(() => {
    if (!youStats || !oppStats) return [];
    // Tallied whole-match too: the statistics only the points carry (return
    // winners) have no published figure to fall back on.
    const youDerived = tallySide(points, youIsPlayer1);
    const oppDerived = tallySide(points, !youIsPlayer1);

    return groups.map((group) => {
      const published = buildStatRows(group.configs, youStats, oppStats);
      return {
        title: group.title,
        rows: withPointRows(group.configs, published, youDerived, oppDerived),
      };
    });
  }, [groups, youStats, oppStats, youIsPlayer1, points]);

  // The exact points each target opens, counted with the Video tab's own
  // predicate — `applyFilmCut` over EVERY point of the match, the same whole
  // match the card's figures describe — so the readout's "Watch all 12" is
  // the cut's own size. On a video-derived match that can differ from the
  // published figure, and the readout says the true count rather than
  // borrowing the statistic's. Each of `both`/`you`/`opp` is its own count —
  // see the comment below on why `both` is not simply `you + opp`.
  const counts = useMemo(() => {
    const byRow = new Map<string, RowCounts>();
    if (!meta.hasPlayableVideo) return byRow;
    const count = (cut: FilmCut) =>
      applyFilmCut(points, points, cut, context).length;
    const configs = isDerived ? ALL_DERIVED_H2H_CONFIGS : ALL_H2H_CONFIGS;
    for (const config of configs) {
      if (!config.cut) continue;
      // `both` is counted, not summed: a row's own cut carries no side, so
      // it also admits what neither side's does — the rare two-shot "winner"
      // the server won on Return winners, every point a won-row's sides did
      // not win — and the readout must say what the tab will actually list.
      byRow.set(config.label, {
        both: count(config.cut),
        you: count(sideCut(config.cut, "you", config.sideBy, config.sideWon)),
        opp: count(sideCut(config.cut, "opp", config.sideBy, config.sideWon)),
      });
    }
    return byRow;
  }, [meta.hasPlayableVideo, isDerived, points, context]);

  if (sections.length === 0) return null;

  const handlersFor = (row: string, zone: Zone): TargetHandlers => ({
    onMouseEnter: () => setHover({ row, zone }),
    // Leaving a number hands the hover back to its row, which the cursor is
    // still inside; leaving the label is the row's own mouseleave.
    onMouseLeave: () =>
      zone === "row"
        ? undefined
        : setHover((current) =>
            current?.row === row ? { row, zone: "row" } : current,
          ),
    onFocus: () => setHover({ row, zone }),
    onBlur: () =>
      setHover((current) =>
        current?.row === row && current.zone === zone ? null : current,
      ),
  });

  return (
    <section
      aria-labelledby="head-to-head-heading"
      className="surface-card flex flex-col"
      style={{ padding: "18px 20px 14px" }}
    >
      <div className="flex items-baseline gap-3 pb-[14px]">
        <span id="head-to-head-heading" className="eyebrow">
          Head to head
        </span>
        <div className="flex-1" />
        <span
          className="text-micro tabular whitespace-nowrap"
          style={{ color: "var(--ink-400)" }}
        >
          Whole match · {points.length} points
        </span>
      </div>

      {/* Column header — you first, always. `sides` decides, never player
          order (guardrails §4). Names are surnames: at 64px a full
          `shortName` overruns the column the way `surnameLabels()` does not;
          `truncate` on top is the backstop for a longer one-word surname. */}
      <div className="flex items-center border-b border-[var(--border-hairline)] pb-[11px]">
        <span aria-hidden="true" className="min-w-0 flex-1" />
        <span className={COLUMN}>
          <span className="min-w-0 truncate text-[12px] font-medium text-[var(--ink-900)]">
            {youName}
          </span>
          {/* Gated exactly as the rail's check is: the glyph claims a verified
              result, so it may not appear on a match that has none. */}
          {match.verificationStatus ? (
            <Check
              className="h-[11px] w-[11px] shrink-0 text-[var(--viz-good)]"
              strokeWidth={2}
              aria-label="Verified result"
            />
          ) : null}
        </span>
        <span className={COLUMN}>
          <span className="min-w-0 truncate text-[12px] font-medium text-[var(--ink-600)]">
            {oppName}
          </span>
        </span>
      </div>

      {sections.map((section) => (
        <div key={section.title} className="flex flex-col">
          <div className="flex items-baseline pt-3 pb-0.5">
            <span className="eyebrow-sm" style={{ color: "var(--ink-400)" }}>
              {section.title}
            </span>
          </div>

          {section.rows.map((row) => {
            const rowCounts = row.cut ? counts.get(row.label) : undefined;
            const noun = row.noun ?? "points";
            const names = { you: youName, opp: oppName };
            const hasVideo = meta.hasPlayableVideo;
            const noVideoLine = !hasVideo && !meta.readOnly;

            // One figure's readout and target. Every figure with something
            // to say hovers the same way; only a cut with points behind it on
            // a match with a playable video clicks through.
            const cell = (side: "you" | "opp") => {
              const name = names[side];
              const content = figureReadout(row, side, name, {
                hasVideo,
                noVideoLine,
                count: rowCounts?.[side] ?? 0,
              });
              if (!hasReadout(content)) {
                return { content: null, target: undefined };
              }
              const figure = `${row.label}, ${name}: ${figureWords(row, side)}`;
              const { footer } = content;
              const target: FigureTarget =
                footer?.kind === "watch"
                  ? {
                      onClick: () =>
                        actions.watchCut(
                          sideCut(row.cut!, side, row.sideBy, row.sideWon),
                          `${row.label} · ${name}`,
                        ),
                      label: `${figure}. ${watchLabel(footer.count, noun)}`,
                      handlers: handlersFor(row.label, side),
                    }
                  : {
                      label: [figure, tailWords(content)]
                        .filter(Boolean)
                        .join(". "),
                      handlers: handlersFor(row.label, side),
                    };
              return { content, target };
            };
            const you = cell("you");
            const opp = cell("opp");

            const rowContent = rowReadout(row, youName, oppName, {
              hasVideo,
              noVideoLine,
              count: rowCounts?.both ?? 0,
            });
            const rowHasReadout = hasReadout(rowContent);
            const rowFooter = rowContent.footer;
            const rowWatchable = rowFooter?.kind === "watch";

            const active = hover?.row === row.label ? hover.zone : null;
            // One hover at a time: the label (and any part of the row that
            // is not a figure) washes the row; a figure washes itself alone.
            // A row with nothing to say does not wash.
            const rowLit = active === "row" && rowHasReadout;
            const readout = (
              <Readout
                open={active === "row"}
                align="start"
                content={rowContent}
              />
            );
            // The label's target is stretched over the whole row by its
            // `::after`, so the hit area is exactly the row's wash; the figures
            // sit above it (`z-[1]`) with their own. The target itself stays
            // unpositioned so the `::after` resolves against the row, and the
            // readout anchors to the label text instead. The ring moves onto
            // the `::after` too, so focus draws the same box the wash does.
            const label = (
              <span className="relative flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate">{row.label}</span>
                {rowWatchable && (
                  <CirclePlay
                    aria-hidden="true"
                    strokeWidth={1.5}
                    className={cn(
                      "h-3 w-3 shrink-0 text-[var(--ink-900)] transition-[opacity,transform] motion-reduce:transform-none",
                      EASE,
                      rowLit
                        ? "translate-x-0 opacity-100"
                        : "-translate-x-1 opacity-0",
                    )}
                  />
                )}
                {readout}
              </span>
            );

            return (
              <div
                key={row.label}
                className={cn(
                  "relative -mx-2 flex min-h-[30px] items-center rounded-[var(--radius-element)] px-2 transition-colors",
                  EASE,
                  rowLit && "bg-[var(--surface-muted)]",
                )}
                onMouseEnter={() =>
                  setHover((current) =>
                    current?.row === row.label
                      ? current
                      : { row: row.label, zone: "row" },
                  )
                }
                onMouseLeave={() =>
                  setHover((current) =>
                    current?.row === row.label ? null : current,
                  )
                }
              >
                {rowWatchable ? (
                  <button
                    type="button"
                    onClick={() => actions.watchCut(row.cut!, row.label)}
                    aria-label={`${row.label}, both players. ${watchLabel(rowFooter.count, noun)}`}
                    data-focus-ring="none"
                    {...handlersFor(row.label, "row")}
                    className={cn(
                      "flex min-w-0 flex-1 cursor-pointer items-center self-stretch border-0 bg-transparent p-0 pr-3 text-left text-[12px] transition-colors",
                      EASE,
                      STRETCHED,
                      rowLit
                        ? "text-[var(--ink-900)]"
                        : "text-[var(--ink-600)]",
                    )}
                  >
                    {label}
                  </button>
                ) : (
                  <span
                    // Focusable only when it has something to say, so a
                    // keyboard gets the same readout a hover does.
                    {...(rowHasReadout && {
                      tabIndex: 0,
                      role: "note",
                      "aria-label": `${row.label}. ${readoutWords(rowContent)}`,
                      "data-focus-ring": "none",
                      ...handlersFor(row.label, "row"),
                    })}
                    className={cn(
                      "flex min-w-0 flex-1 items-center self-stretch pr-3 text-[12px] text-[var(--ink-600)]",
                      rowHasReadout && STRETCHED,
                    )}
                  >
                    {label}
                  </span>
                )}
                <ValueCell
                  value={row.you}
                  emphasised={row.leader === "you"}
                  note={row.note}
                  washed={active === "you" && Boolean(you.target)}
                  target={you.target}
                  readout={
                    <Readout
                      open={active === "you"}
                      align="end"
                      content={you.content}
                    />
                  }
                />
                <ValueCell
                  value={row.opp}
                  emphasised={row.leader === "opp"}
                  note={row.note}
                  washed={active === "opp" && Boolean(opp.target)}
                  target={opp.target}
                  readout={
                    <Readout
                      open={active === "opp"}
                      align="end"
                      content={opp.content}
                    />
                  }
                />
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
