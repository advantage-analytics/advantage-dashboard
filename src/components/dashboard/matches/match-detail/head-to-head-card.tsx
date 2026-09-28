"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";

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
import type { FilmFilters } from "@/components/dashboard/matches/match-detail/film/filters/types";
import {
  scopeMeta,
  scopePoints,
  useSetScope,
} from "@/components/dashboard/matches/match-detail/set-scope";
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
}

export const SERVE_ROWS: H2HRowConfig[] = [
  { label: "Aces", key: "aces", cut: { serve: ["ace"] } },
  {
    label: "Double faults",
    key: "doubleFaults",
    lowerIsBetter: true,
    cut: { serve: ["double-fault"] },
  },
  {
    label: "First serve in",
    key: "firstServeInPct",
    isPercentage: true,
    fractionKey: "firstServeInPct",
  },
  {
    label: "First serve points won",
    key: "firstServeWinPct",
    isPercentage: true,
    fractionKey: "firstServeWinPct",
    cut: { ball: "first" },
  },
  {
    label: "Second serve points won",
    key: "secondServeWinPct",
    isPercentage: true,
    fractionKey: "secondServeWinPct",
    cut: { ball: "second" },
  },
  {
    label: "Break points saved",
    key: "breakpointsSaved",
    isPercentage: true,
    fractionKey: "breakpointsSaved",
    fromFraction: true,
    cut: { pressure: "break" },
  },
  {
    label: "Service games won",
    key: "serviceGamesWonPct",
    isPercentage: true,
    fractionKey: "serviceGamesWonPct",
  },
];

export const RETURN_ROWS: H2HRowConfig[] = [
  {
    label: "First serve returns won",
    key: "firstReturnWonPct",
    isPercentage: true,
    fractionKey: "firstReturnWonPct",
  },
  {
    label: "Second serve returns won",
    key: "secondReturnWonPct",
    isPercentage: true,
    fractionKey: "secondReturnWonPct",
  },
  {
    label: "Break points converted",
    key: "breakpointsWonPct",
    isPercentage: true,
    fractionKey: "breakpointsWonPct",
  },
  // Drawn by the frame, backed by nothing: neither SwingVision nor the video
  // pipeline records which winners were struck off a return. The row keeps its
  // place and says so rather than borrowing `winners`, which would read as a
  // return figure and be a total.
  { label: "Return winners", note: "Not recorded by any source yet" },
];

export const POINT_ROWS: H2HRowConfig[] = [
  {
    label: "Net points won",
    key: "netPointsWonPct",
    isPercentage: true,
    fractionKey: "netPointsWonPct",
  },
  { label: "Winners", key: "winners", cut: { result: ["winner"] } },
  {
    label: "Unforced errors",
    key: "unforcedErrors",
    lowerIsBetter: true,
    cut: { result: ["unforced"] },
  },
  { label: "Total points won", key: "totalPointsWon", ofKey: "totalPoints" },
];

export const H2H_GROUPS: { title: string; configs: H2HRowConfig[] }[] = [
  { title: "Serve", configs: SERVE_ROWS },
  { title: "Return", configs: RETURN_ROWS },
  { title: "Points", configs: POINT_ROWS },
];

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
export function sideCut(
  cut: Partial<FilmFilters>,
  side: "you" | "opp",
): Partial<FilmFilters> {
  if (cut.result) {
    const erred = cut.result.includes("unforced");
    const outcome = erred ? (side === "you" ? "opp" : "you") : side;
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

/* ── Per-set derivation ─────────────────────────────────────────────────────
   `useSetScope()` narrows the pane to one set. The published `match_stats`
   numbers are whole-match only, so the scoped view is recomputed from `points`
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
}

function emptyTally(): Tally {
  return { won: 0, total: 0 };
}

function tallySide(points: MatchPoint[], isPlayer1: boolean): DerivedSide {
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
 * support it for a single set — first/second serve splits, net play and any
 * game-level count all need information the point rows do not carry.
 */
function derivedValue(
  config: H2HRowConfig,
  d: DerivedSide,
): DerivedValue | null {
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
  if (published.display === "") return NO_VALUE;

  const derived = derivedValue(config, d);
  if (!derived) return NO_VALUE;

  const display = statDisplay(derived.value, config.isPercentage);
  return {
    value: derived.value,
    display,
    detail: display ? derived.detail : undefined,
  };
}

function buildDerivedRows(
  configs: H2HRowConfig[],
  published: H2HRow[],
  youDerived: DerivedSide,
  oppDerived: DerivedSide,
): H2HRow[] {
  return configs.map((config, i) =>
    assembleRow(
      config,
      derivedSideValue(config, youDerived, published[i].you),
      derivedSideValue(config, oppDerived, published[i].opp),
    ),
  );
}

/* ── Rendering ──────────────────────────────────────────────────────────── */

/** Both value columns and both name cells; the artboard's 64 px, right-aligned. */
const COLUMN = "flex w-[64px] shrink-0 items-center justify-end gap-1";

function ValueCell({
  value,
  emphasised,
  note,
  scoped,
  watch,
}: {
  value: H2HValue;
  emphasised: boolean;
  note?: string;
  scoped: boolean;
  /**
   * Open this cell's points in the Video tab. Passed only for a row with a
   * cut on a match with a playable video; the em-dash cell below ignores it,
   * since a statistic with no value has nothing to watch.
   */
  watch?: { onClick: () => void; label: string };
}) {
  if (value.display) {
    const figure = (
      <span
        className={cn(
          "tabular text-[13px]",
          // A clickable figure washes on hover like any control (`surface-
          // subtle` over the row's lighter `surface-muted`), sized to the
          // number itself; the -mr cancels the pr so the digits stay on the
          // column's right edge, aligned with every non-clickable figure.
          watch &&
            "-mr-1.5 rounded-[var(--radius-cell)] py-0.5 pr-1.5 pl-1.5 transition-colors duration-200 ease-[var(--ease-primary)] group-hover/watch:bg-[var(--surface-subtle)]",
        )}
        style={{
          fontWeight: emphasised ? 500 : 400,
          color: emphasised ? "var(--ink-900)" : "var(--ink-500)",
        }}
      >
        {value.display}
      </span>
    );
    if (watch) {
      // A bare button around the same figure: the number's own hover wash and
      // the readout's "Click a number to watch in Video" line are the
      // affordance. Focus is `focus.css`'s ring — nothing written here.
      return (
        <button
          type="button"
          onClick={watch.onClick}
          aria-label={watch.label}
          className={`${COLUMN} group/watch cursor-pointer rounded-[var(--radius-element)] border-0 bg-transparent p-0`}
        >
          {figure}
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
          {note ?? (scoped ? "Not measurable for a single set" : "No data")}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

/**
 * The dark readout for a hovered row. It is where the fraction went when the
 * 9 px sub-figures came off the numbers: `62%` is the figure a reader wants at
 * a glance, `38/61` is the one they want when they doubt it.
 *
 * It sits to the LEFT of the two value columns, centred on the row, and never
 * moves while the row is hovered. The numbers are what a reader looks at and
 * what a click lands on, so the readout goes beside them rather than over
 * them; the only thing it covers is the row's own label, which its title
 * repeats. It is a label, not a control — the numbers are the buttons, which
 * is why its last line names them.
 */
function RowTooltip({
  open,
  row,
  youName,
  oppName,
  watchable,
}: {
  open: boolean;
  row: H2HRow;
  youName: string;
  oppName: string;
  /** The row's numbers open its points in the Video tab. */
  watchable: boolean;
}) {
  const detail =
    row.note ??
    (row.you.detail || row.opp.detail
      ? `${youName} ${row.you.detail ?? "—"} · ${oppName} ${row.opp.detail ?? "—"}`
      : null);

  return (
    <ChartTooltip
      open={open}
      side="left"
      offset={8}
      className="gap-0.5 px-2.5 py-2"
    >
      <span className="text-[12px] font-medium text-white">{row.label}</span>
      {detail && (
        <span className="mono tabular text-[10px] text-white/[0.64]">
          {detail}
        </span>
      )}
      {watchable && (
        <span className="text-[10px] text-white/[0.64]">
          Click a number to watch in Video
        </span>
      )}
    </ChartTooltip>
  );
}

export function HeadToHeadCard() {
  const { match, points } = useMatchData();
  const { meta, actions } = useMatchReport();
  const sides = useMatchSides();
  const { activeSet } = useSetScope();
  const [hovered, setHovered] = useState<string | null>(null);

  const youStats = sides.you.stats;
  const oppStats = sides.opp.stats;
  const youIsPlayer1 = sides.you.isPlayer1;
  const [youName, oppName] = surnameLabels(sides.you.name, sides.opp.name);

  const scopedPoints = useMemo(
    () => scopePoints(points, activeSet),
    [points, activeSet],
  );

  const sections = useMemo(() => {
    if (!youStats || !oppStats) return [];
    const youDerived =
      activeSet === null ? null : tallySide(scopedPoints, youIsPlayer1);
    const oppDerived =
      activeSet === null ? null : tallySide(scopedPoints, !youIsPlayer1);

    return H2H_GROUPS.map((group) => {
      const published = buildStatRows(group.configs, youStats, oppStats);
      return {
        title: group.title,
        rows:
          youDerived && oppDerived
            ? buildDerivedRows(group.configs, published, youDerived, oppDerived)
            : published,
      };
    });
  }, [youStats, oppStats, youIsPlayer1, activeSet, scopedPoints]);

  // Memoized rather than recomputed inline: the card re-renders on every row
  // hover, and `scopeMeta` allocates a scoped-points array just to count it —
  // work that has nothing to do with which row the cursor is on.
  const scope = useMemo(
    () => scopeMeta(sides.sets, points, activeSet),
    [sides.sets, points, activeSet],
  );

  if (sections.length === 0) return null;

  const scoped = activeSet !== null;

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
          {scope.label} · {scope.points} points
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
            const cut = meta.hasPlayableVideo ? row.cut : undefined;
            // Only a cell with a figure is watchable: an em dash has no
            // points behind it to show.
            const watchFor = (
              side: "you" | "opp",
              value: H2HValue,
              name: string,
            ) =>
              cut && value.display
                ? {
                    onClick: () =>
                      actions.watchCut(scopeCut(sideCut(cut, side), activeSet)),
                    label: `${row.label}, ${name} ${value.display}. Watch in Video`,
                  }
                : undefined;
            const youWatch = watchFor("you", row.you, youName);
            const oppWatch = watchFor("opp", row.opp, oppName);

            return (
              <div
                key={row.label}
                className="relative -mx-2 flex min-h-[30px] items-center rounded-[var(--radius-element)] px-2 transition-colors duration-200 ease-[var(--ease-primary)] hover:bg-[var(--surface-muted)]"
                onMouseEnter={() => setHovered(row.label)}
                onMouseLeave={() =>
                  setHovered((current) =>
                    current === row.label ? null : current,
                  )
                }
              >
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-600)]">
                  {row.label}
                </span>
                {/* The two value columns are the readout's anchor, so it
                    lands beside the numbers rather than off the row's far
                    edge. */}
                <div className="relative flex shrink-0 items-center">
                  <ValueCell
                    value={row.you}
                    emphasised={row.leader === "you"}
                    note={row.note}
                    scoped={scoped}
                    watch={youWatch}
                  />
                  <ValueCell
                    value={row.opp}
                    emphasised={row.leader === "opp"}
                    note={row.note}
                    scoped={scoped}
                    watch={oppWatch}
                  />
                  <RowTooltip
                    open={hovered === row.label}
                    row={row}
                    youName={youName}
                    oppName={oppName}
                    watchable={Boolean(youWatch || oppWatch)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
