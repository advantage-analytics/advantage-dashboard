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
import { scopeCut } from "@/components/dashboard/matches/match-detail/film-cut-context";
import {
  countFilmOption,
  DEFAULT_FILM_FILTERS,
  isReturnWinner,
  type FilmFilters,
} from "@/components/dashboard/matches/match-detail/film/filters/types";
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
   * The film cut that shows this statistic's points in the Video tab, before
   * a side is laid over it (`sideCut`). Absent when the statistic has no
   * point-level equivalent — service games won is a count of games, not a
   * set of points. The cut shows what the filter model admits; on a
   * video-derived match the aggregate is approximate, so the two counts may
   * differ, and that is accepted.
   */
  cut?: Partial<FilmFilters>;
  /**
   * Whose points a value cell's cut takes (`sideCut`). Absent keeps the
   * default: a result row's side is who won (or, for errors, lost) the point,
   * every other row's is who served it. Return rows are the returner's, so
   * their side is the one NOT serving; total points won is the winner's.
   */
  sideBy?: CutSide;
  /** What the cut's points are, plural — "break points". Screen-reader copy. */
  noun?: string;
  /** What the fraction's first number counts — "9 of 12 saved". */
  verb?: string;
  /**
   * A statistic no provider publishes, counted from the points themselves
   * (`tallySide`) for the whole match as well as for the filtered points.
   */
  fromPoints?: "returnWinners";
}

export const SERVE_ROWS: H2HRowConfig[] = [
  { label: "Aces", key: "aces", cut: { serve: ["ace"] }, noun: "aces" },
  {
    label: "Double faults",
    key: "doubleFaults",
    lowerIsBetter: true,
    cut: { serve: ["double-fault"] },
    noun: "double faults",
  },
  {
    // The first serves that landed: a point is "played on a first serve"
    // (`ball: "first"`) exactly when the first serve went in, so this opens
    // the numerator — the same points as the row below.
    label: "First serve in",
    key: "firstServeInPct",
    isPercentage: true,
    fractionKey: "firstServeInPct",
    cut: { ball: "first" },
    noun: "first-serve points",
    verb: "in",
  },
  {
    label: "First serve points won",
    key: "firstServeWinPct",
    isPercentage: true,
    fractionKey: "firstServeWinPct",
    cut: { ball: "first" },
    noun: "first-serve points",
    verb: "won",
  },
  {
    label: "Second serve points won",
    key: "secondServeWinPct",
    isPercentage: true,
    fractionKey: "secondServeWinPct",
    cut: { ball: "second" },
    noun: "second-serve points",
    verb: "won",
  },
  {
    label: "Break points saved",
    key: "breakpointsSaved",
    isPercentage: true,
    fractionKey: "breakpointsSaved",
    fromFraction: true,
    cut: { pressure: "break" },
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
    cut: { ball: "first" },
    sideBy: "returner",
    noun: "first-serve returns",
    verb: "won",
  },
  {
    label: "Second serve returns won",
    key: "secondReturnWonPct",
    isPercentage: true,
    fractionKey: "secondReturnWonPct",
    cut: { ball: "second" },
    sideBy: "returner",
    noun: "second-serve returns",
    verb: "won",
  },
  {
    label: "Break points converted",
    key: "breakpointsWonPct",
    isPercentage: true,
    fractionKey: "breakpointsWonPct",
    cut: { pressure: "break" },
    sideBy: "returner",
    noun: "break points",
    verb: "converted",
  },
  // No provider publishes it, but every point carries its return: a return
  // that landed, a rally of at most two shots and a winner the returner won
  // (`isReturnWinner`). Counted from the points, never borrowed from
  // `winners`, which would read as a return figure and be a total.
  {
    label: "Return winners",
    fromPoints: "returnWinners",
    cut: { returns: ["winner"] },
    sideBy: "winner",
    noun: "return winners",
  },
];

export const POINT_ROWS: H2HRowConfig[] = [
  // No cut: the film filter model has no net-approach axis to open.
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
    cut: { result: ["winner"] },
    noun: "winners",
  },
  {
    label: "Unforced errors",
    key: "unforcedErrors",
    lowerIsBetter: true,
    cut: { result: ["unforced"] },
    noun: "unforced errors",
  },
  {
    // The row opens the whole (scoped) match; a value opens the points that
    // side won.
    label: "Total points won",
    key: "totalPointsWon",
    ofKey: "totalPoints",
    cut: {},
    sideBy: "winner",
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

/**
 * One value cell's cut: the row's cut with the cell's side laid over it.
 * A serve row's side is who SERVED the point (`server`) — a player's aces are
 * the points they served that ended in an ace. A result row's side is who
 * WON it (`outcome`) — a player's winners are the points they won on a
 * winner. That is the line `tallySide` below draws: aces and double faults
 * by server, winners and errors by the player who ended the point. Unforced
 * errors take the OTHER side's `outcome` for the same reason — the player
 * who errs is the one who loses the point.
 *
 * `you`/`opp` are relative, resolved by `useMatchSides()` inside the film tab
 * (guardrails §4); nothing here reads player order.
 */
export type CutSide = "returner" | "winner";

function flipSide(side: "you" | "opp"): "you" | "opp" {
  return side === "you" ? "opp" : "you";
}

export function sideCut(
  cut: Partial<FilmFilters>,
  side: "you" | "opp",
  by?: CutSide,
): Partial<FilmFilters> {
  // A return statistic belongs to the player receiving serve, so the side is
  // the one NOT serving: your first-serve returns are the opponent's first
  // serves.
  if (by === "returner") {
    return { ...cut, server: flipSide(side) };
  }
  if (by === "winner") return { ...cut, outcome: side };
  if (cut.result) {
    const erred = cut.result.includes("unforced");
    const outcome = erred ? flipSide(side) : side;
    return { ...cut, outcome };
  }
  return { ...cut, server: side };
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
  cut?: Partial<FilmFilters>;
  sideBy?: CutSide;
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

/* ── Filtered derivation ────────────────────────────────────────────────────
   `useMatchFilters()` narrows the pane to the points the match filters keep.
   The published `match_stats` numbers are whole-match only, so the filtered
   view is recomputed from `filteredPoints`
   — and only for the statistics a `MatchPoint` genuinely carries. Everything
   else shows the same em dash the card already uses for missing data, because
   a plausible-looking number computed from fields that cannot support it is
   the one failure mode nothing downstream can catch. */

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

interface DerivedValue {
  value: number | null;
  detail?: string;
}

function pctValue(t: Tally): DerivedValue {
  if (t.total === 0) return { value: null };
  return { value: (t.won / t.total) * 100, detail: `${t.won}/${t.total}` };
}

/**
 * The scoped value for one statistic, or `null` when a `MatchPoint` cannot
 * support it for a subset of points — first/second serve splits, net play and any
 * game-level count all need information the point rows do not carry.
 */
function derivedValue(
  config: H2HRowConfig,
  d: DerivedSide,
): DerivedValue | null {
  // No points at all (filters that match nothing) measures nothing: every
  // row is an em dash, never a column of confident zeros.
  if (d.allPoints.total === 0) return null;
  // 0 is a measurement only where returns were recorded; with none, a zero
  // would say "no return winners" about points nobody looked at.
  if (config.fromPoints === "returnWinners") {
    return d.returnsRecorded > 0 ? { value: d.returnWinners } : null;
  }
  switch (config.key) {
    case "aces":
      return { value: d.aces };
    case "doubleFaults":
      return { value: d.doubleFaults };
    case "winners":
      return { value: d.winners };
    case "unforcedErrors":
      return { value: d.unforcedErrors };
    case "totalPointsWon":
      return { value: d.allPoints.won, detail: `of ${d.allPoints.total}` };
    case "breakpointsSaved":
      return pctValue(d.breakPointsFaced);
    case "breakpointsWonPct":
      return pctValue(d.breakPointsAgainst);
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
  // A statistic the provider withheld whole-match stays withheld per set.
  // Aces on a video-derived match are the case that matters: derivation never
  // emits "Ace", so counting them here would print a confident 0 where the
  // published card correctly prints an em dash.
  // A statistic only the points carry has no published figure to defer to.
  if (published.display === "" && !config.fromPoints) return NO_VALUE;

  const derived = derivedValue(config, d);
  if (!derived) return NO_VALUE;

  const display = statDisplay(derived.value, config.isPercentage);
  return {
    value: derived.value,
    display,
    detail: display ? derived.detail : undefined,
  };
}

/** One row, recomputed from `youDerived`/`oppDerived` in place of `published`. */
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
 * points carry, which are counted from every point in scope.
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

function buildDerivedRows(
  configs: H2HRowConfig[],
  published: H2HRow[],
  youDerived: DerivedSide,
  oppDerived: DerivedSide,
): H2HRow[] {
  return configs.map((config, i) =>
    deriveRow(config, published[i], youDerived, oppDerived),
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
  title,
  lines,
  note,
  action,
}: {
  open: boolean;
  align: "start" | "end";
  title: string;
  lines: ReadoutLine[];
  note?: string;
  action?: string | null;
}) {
  // A title alone repeats the label the cursor is already on — "Aces" over
  // "Aces" — so a readout with nothing else to say does not open.
  const hasEvidence = lines.length > 0 || Boolean(note);
  if (!hasEvidence && !action) return null;
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
      {action && (
        <span
          className={cn(
            "tabular flex items-center gap-1.5 text-[11px] leading-[15px] text-white/[0.86]",
            // The hairline divides evidence from the action; with no evidence
            // (a count row) there is nothing to divide it from.
            hasEvidence && "mt-[5px] border-t border-white/10 pt-[7px]",
          )}
        >
          <CirclePlay
            aria-hidden="true"
            className="h-3 w-3 shrink-0"
            strokeWidth={1.5}
          />
          {action}
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

function ValueCell({
  value,
  emphasised,
  note,
  scoped,
  washed,
  watch,
  zero,
  readout,
}: {
  value: H2HValue;
  emphasised: boolean;
  note?: string;
  scoped: boolean;
  /** The cursor or focus is on this figure. */
  washed: boolean;
  /**
   * Open this cell's points in the Video tab. Passed only for a figure with
   * points behind it on a match with a playable video; the em-dash cell below
   * ignores it, since a statistic with no value has nothing to watch.
   */
  watch?: { onClick: () => void; label: string; handlers: TargetHandlers };
  /**
   * A measured zero — nothing to watch, but still worth a hover that says so
   * ("No aces in this match"). It hovers, focuses and washes exactly as a
   * watchable figure does; it just has no click.
   */
  zero?: { label: string; handlers: TargetHandlers };
  readout?: ReactNode;
}) {
  if (value.display) {
    const figure = (
      <span
        className={cn(
          "tabular text-[13px]",
          // The wash is sized to the number itself; the -mr cancels the pr so
          // the digits stay on the column's right edge, aligned with every
          // figure that has no wash.
          `-mr-1.5 rounded-[var(--radius-cell)] px-1.5 py-0.5 transition-colors ${EASE}`,
        )}
        style={{
          fontWeight: emphasised ? 500 : 400,
          color: emphasised ? "var(--ink-900)" : "var(--ink-500)",
          backgroundColor: washed ? "var(--surface-subtle)" : "transparent",
        }}
      >
        {value.display}
      </span>
    );
    const target = watch ?? zero;
    if (target) {
      // One element for both, so a zero is the same hit area, wash and focus
      // ring as the figure beside it. A zero is a button with nothing to do —
      // `aria-disabled` says so and keeps it reachable by Tab, which
      // `disabled` would not. Focus is `focus.css`'s ring — nothing written
      // here.
      return (
        <button
          type="button"
          onClick={watch?.onClick}
          aria-disabled={watch ? undefined : true}
          aria-label={target.label}
          {...target.handlers}
          className={cn(
            `${COLUMN} relative self-stretch rounded-[var(--radius-element)] border-0 bg-transparent p-0`,
            watch ? "cursor-pointer" : "cursor-default",
          )}
        >
          {figure}
          {readout}
        </button>
      );
    }
    return <span className={COLUMN}>{figure}</span>;
  }

  // The card's missing-data convention (match-statistics-card.tsx): an italic
  // em dash that says why on hover, never a zero.
  return (
    <span className={COLUMN}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label="No data recorded for this stat"
            className="tabular cursor-help text-[13px] font-light text-[var(--color-text-muted)] italic"
          >
            —
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          className="px-2.5 py-1.5 text-[11px] leading-[14px]"
        >
          {note ?? (scoped ? "Not measurable for filtered points" : "No data")}
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
  const { filteredPoints, filtersActive } = useMatchFilters();
  const [hover, setHover] = useState<HoverTarget | null>(null);

  const youStats = sides.you.stats;
  const oppStats = sides.opp.stats;
  const youIsPlayer1 = sides.you.isPlayer1;
  const [youName, oppName] = surnameLabels(sides.you.name, sides.opp.name);

  // With no filter applied this is `points` itself.
  const scopedPoints = filteredPoints;

  const sections = useMemo(() => {
    if (!youStats || !oppStats) return [];
    // Tallied whole-match too: the statistics only the points carry (return
    // winners) have no published figure to fall back on.
    const youDerived = tallySide(scopedPoints, youIsPlayer1);
    const oppDerived = tallySide(scopedPoints, !youIsPlayer1);

    return H2H_GROUPS.map((group) => {
      const published = buildStatRows(group.configs, youStats, oppStats);
      return {
        title: group.title,
        rows: filtersActive
          ? buildDerivedRows(group.configs, published, youDerived, oppDerived)
          : withPointRows(group.configs, published, youDerived, oppDerived),
      };
    });
  }, [youStats, oppStats, youIsPlayer1, filtersActive, scopedPoints]);

  // The exact points each target opens, counted through the Video tab's own
  // filter so the readout's "Watch all 12" is what the tab will show — on a
  // video-derived match that can differ from the published figure, and the
  // readout says the true count rather than borrowing the statistic's. Each
  // of `both`/`you`/`opp` is its own count() call — see the comment below on
  // why `both` is not simply `you + opp`.
  //
  // Counted over `scopedPoints` (the filtered points) so the readout's count
  // agrees with the figure beside it. Until T7 moves the Video tab and its
  // cuts onto `MatchFilters`, the tab a click opens does NOT apply the match
  // filters, so under an active filter it can list more points than this
  // count says; `scopeCut(…, null)` is the whole-match set scope the cut
  // vocabulary still carries.
  const counts = useMemo(() => {
    const byRow = new Map<string, RowCounts>();
    if (!meta.hasPlayableVideo) return byRow;
    const count = (cut: Partial<FilmFilters>) =>
      countFilmOption(
        scopedPoints,
        DEFAULT_FILM_FILTERS,
        youIsPlayer1,
        scopeCut(cut, null),
      );
    for (const config of ALL_H2H_CONFIGS) {
      if (!config.cut) continue;
      // `both` is counted, not summed: the Return winners filter also admits
      // the rare two-shot "winner" the server won, which neither side's cut
      // does, and the readout must say what the tab will actually list.
      byRow.set(config.label, {
        both: count(config.cut),
        you: count(sideCut(config.cut, "you", config.sideBy)),
        opp: count(sideCut(config.cut, "opp", config.sideBy)),
      });
    }
    return byRow;
  }, [meta.hasPlayableVideo, scopedPoints, youIsPlayer1]);

  // "Whole match · 148 points", or just "Filtered": the Statistics view's
  // filter bar, directly above this card, already says "32 of 148 points",
  // and the same count twice one glance apart is noise.
  const scopeLine = filtersActive
    ? "Filtered"
    : `Whole match · ${points.length} points`;

  if (sections.length === 0) return null;

  const scoped = filtersActive;

  const target = (row: string, zone: Zone): TargetHandlers => ({
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
          {scopeLine}
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
            // One lookup per side, built once, in place of a
            // `side === "you" ? youX : oppX` ternary at every use below.
            const perSide = {
              you: { name: youName, fraction: fractionWords(row.you) },
              opp: { name: oppName, fraction: fractionWords(row.opp) },
            };
            // A figure is watchable only when points stand behind it: an em
            // dash has none, and neither does a cut the filter finds empty.
            const cellWatch = (side: "you" | "opp") => {
              const value = row[side];
              const n = rowCounts?.[side] ?? 0;
              if (!value.display || n === 0) return undefined;
              const { name, fraction } = perSide[side];
              const inWords = fraction
                ? [fraction, row.verb].filter(Boolean).join(" ")
                : null;
              // "74 of 138 won" already carries the figure; "44%" does not.
              const figure = !inWords
                ? value.display
                : value.detail?.startsWith("of ")
                  ? inWords
                  : `${value.display}, ${inWords}`;
              return {
                onClick: () =>
                  actions.watchCut(
                    scopeCut(sideCut(row.cut!, side, row.sideBy), null),
                  ),
                label: `${row.label}, ${name}: ${figure}. ${watchLabel(n, noun)}`,
                handlers: target(row.label, side),
              };
            };
            const youWatch = cellWatch("you");
            const oppWatch = cellWatch("opp");
            // A count of zero with nothing to open still answers a hover. Only
            // a count: 0% of 3 break points is three break points, not none.
            const isZeroCount = (side: "you" | "opp") =>
              row[side].display === "0";
            const inScope = filtersActive
              ? "in the filtered points"
              : "in this match";
            const cellZero = (side: "you" | "opp", watchable: boolean) =>
              !watchable && isZeroCount(side) && row.noun
                ? {
                    label: `${row.label}, ${perSide[side].name}: 0. No ${row.noun} ${inScope}`,
                    handlers: target(row.label, side),
                  }
                : undefined;
            const youZero = cellZero("you", Boolean(youWatch));
            const oppZero = cellZero("opp", Boolean(oppWatch));
            const zeroBySide = { you: youZero, opp: oppZero };
            const rowWatchable =
              !!rowCounts &&
              rowCounts.both > 0 &&
              Boolean(row.you.display || row.opp.display);
            // Mirrors `cellWatch`'s shape so the row's own target — "both
            // players" — is built the same way as each player's.
            const rowWatch = rowWatchable
              ? {
                  onClick: () => actions.watchCut(scopeCut(row.cut!, null)),
                  label: `${row.label}, both players. ${watchLabel(rowCounts!.both, noun)}`,
                  handlers: target(row.label, "row"),
                }
              : undefined;

            const active = hover?.row === row.label ? hover.zone : null;
            // The label's hover is "both players" only when the label is a
            // target; on a row with nothing to open it just reads.
            const bothLit = active === "row" && rowWatchable;
            const rowLines: ReadoutLine[] =
              perSide.you.fraction || perSide.opp.fraction
                ? [
                    { name: youName, value: perSide.you.fraction ?? "—" },
                    {
                      name: oppName,
                      value: perSide.opp.fraction ?? "—",
                      muted: true,
                    },
                  ]
                : [];
            const cellReadout = (side: "you" | "opp", watchable: boolean) => {
              const { name, fraction } = perSide[side];
              const title = `${row.label} · ${name}`;
              if (!watchable) {
                if (!zeroBySide[side]) return null;
                return (
                  <Readout
                    open={active === side}
                    align="end"
                    title={title}
                    lines={[]}
                    note={`No ${row.noun} ${inScope}`}
                  />
                );
              }
              return (
                <Readout
                  open={active === side}
                  align="end"
                  title={title}
                  lines={
                    fraction
                      ? [
                          {
                            name: [fraction, row.verb]
                              .filter(Boolean)
                              .join(" "),
                            value: "",
                          },
                        ]
                      : []
                  }
                  action={watchLine(rowCounts![side])}
                />
              );
            };
            // Both players at a measured zero: the label answers the way each
            // zero does, rather than going silent between them.
            const bothZero =
              !rowWatchable &&
              Boolean(row.noun) &&
              isZeroCount("you") &&
              isZeroCount("opp");
            const rowReadout = (
              <Readout
                open={active === "row"}
                align="start"
                title={row.label}
                lines={rowLines}
                note={bothZero ? `No ${row.noun} ${inScope}` : row.note}
                action={rowWatchable ? watchLine(rowCounts!.both) : null}
              />
            );

            return (
              <div
                key={row.label}
                className={cn(
                  "relative -mx-2 flex min-h-[30px] items-center rounded-[var(--radius-element)] px-2 transition-colors",
                  EASE,
                  // Hovering a number styles that number alone: the row wash
                  // belongs to the label's hover (or a row with no targets).
                  active === "row" && "bg-[var(--surface-muted)]",
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
                {rowWatch ? (
                  <button
                    type="button"
                    onClick={rowWatch.onClick}
                    aria-label={rowWatch.label}
                    {...rowWatch.handlers}
                    className={cn(
                      "relative flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 self-stretch border-0 bg-transparent p-0 pr-3 text-left text-[12px] transition-colors",
                      EASE,
                      bothLit
                        ? "text-[var(--ink-900)]"
                        : "text-[var(--ink-600)]",
                    )}
                  >
                    <span className="min-w-0 truncate">{row.label}</span>
                    <CirclePlay
                      aria-hidden="true"
                      strokeWidth={1.5}
                      className={cn(
                        "h-3 w-3 shrink-0 text-[var(--ink-900)] transition-[opacity,transform] motion-reduce:transform-none",
                        EASE,
                        bothLit
                          ? "translate-x-0 opacity-100"
                          : "-translate-x-1 opacity-0",
                      )}
                    />
                    {rowReadout}
                  </button>
                ) : (
                  <span
                    // Focusable only when it has something to say, so a
                    // keyboard gets the same empty state a hover does.
                    {...(bothZero && {
                      tabIndex: 0,
                      role: "note",
                      "aria-label": `${row.label}: no ${row.noun} ${inScope}`,
                      ...target(row.label, "row"),
                    })}
                    className="relative flex min-w-0 flex-1 items-center self-stretch rounded-[var(--radius-element)]"
                  >
                    <span className="min-w-0 truncate text-[12px] text-[var(--ink-600)]">
                      {row.label}
                    </span>
                    {rowReadout}
                  </span>
                )}
                <ValueCell
                  value={row.you}
                  emphasised={row.leader === "you"}
                  note={row.note}
                  scoped={scoped}
                  washed={active === "you" && Boolean(youWatch || youZero)}
                  watch={youWatch}
                  zero={youZero}
                  readout={cellReadout("you", Boolean(youWatch))}
                />
                <ValueCell
                  value={row.opp}
                  emphasised={row.leader === "opp"}
                  note={row.note}
                  scoped={scoped}
                  washed={active === "opp" && Boolean(oppWatch || oppZero)}
                  watch={oppWatch}
                  zero={oppZero}
                  readout={cellReadout("opp", Boolean(oppWatch))}
                />
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
