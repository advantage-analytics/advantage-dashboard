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
import {
  scopeMeta,
  scopePoints,
  useSetScope,
} from "@/components/dashboard/matches/match-detail/set-scope";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { PlayerStatistics, StatFraction } from "@/lib/data/types";

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
}

export const SERVE_ROWS: H2HRowConfig[] = [
  { label: "Aces", key: "aces" },
  { label: "Double faults", key: "doubleFaults", lowerIsBetter: true },
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
  },
  {
    label: "Second serve points won",
    key: "secondServeWinPct",
    isPercentage: true,
    fractionKey: "secondServeWinPct",
  },
  {
    label: "Break points saved",
    key: "breakpointsSaved",
    isPercentage: true,
    fractionKey: "breakpointsSaved",
    fromFraction: true,
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
  { label: "Winners", key: "winners" },
  { label: "Unforced errors", key: "unforcedErrors", lowerIsBetter: true },
  { label: "Total points won", key: "totalPointsWon", ofKey: "totalPoints" },
];

export const H2H_GROUPS: { title: string; configs: H2HRowConfig[] }[] = [
  { title: "Serve", configs: SERVE_ROWS },
  { title: "Return", configs: RETURN_ROWS },
  { title: "Points", configs: POINT_ROWS },
];

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
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
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

/** Both value columns; the artboard's 104 px, right-aligned. */
const COLUMN = "flex w-[104px] shrink-0 items-center justify-end gap-1";

function ValueCell({
  value,
  emphasised,
  note,
  scoped,
}: {
  value: H2HValue;
  emphasised: boolean;
  note?: string;
  scoped: boolean;
}) {
  if (value.display) {
    return (
      <span className={COLUMN}>
        <span
          className="tabular text-[13px]"
          style={{
            fontWeight: emphasised ? 500 : 400,
            color: emphasised ? "var(--ink-900)" : "var(--ink-500)",
          }}
        >
          {value.display}
        </span>
      </span>
    );
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
            className="tabular cursor-help text-[13px] font-light italic text-[var(--color-text-muted)]"
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
 * The dark readout above a hovered row. It is where the fraction went when the
 * 9 px sub-figures came off the numbers: `62%` is the figure a reader wants at
 * a glance, `38/61` is the one they want when they doubt it.
 */
function RowTooltip({
  open,
  row,
  youName,
  oppName,
}: {
  open: boolean;
  row: H2HRow;
  youName: string;
  oppName: string;
}) {
  const detail =
    row.note ??
    (row.you.detail || row.opp.detail
      ? `${youName} ${row.you.detail ?? "—"} · ${oppName} ${row.opp.detail ?? "—"}`
      : null);

  return (
    <ChartTooltip
      open={open}
      align="center"
      bottomOffset={2}
      className="gap-0.5 px-3 py-2"
    >
      <span className="text-[12px] font-medium text-white">{row.label}</span>
      {detail && (
        <span className="mono tabular text-[10px] text-white/[0.72]">
          {detail}
        </span>
      )}
    </ChartTooltip>
  );
}

export function HeadToHeadCard() {
  const { match, points } = useMatchData();
  const sides = useMatchSides();
  const { activeSet } = useSetScope();
  const [hovered, setHovered] = useState<string | null>(null);

  const youStats = sides.you.stats;
  const oppStats = sides.opp.stats;
  const youIsPlayer1 = sides.you.isPlayer1;

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
  const meta = useMemo(
    () => scopeMeta(sides.sets, points, activeSet),
    [sides.sets, points, activeSet],
  );

  if (sections.length === 0) return null;

  const scoped = activeSet !== null;

  return (
    <section
      aria-labelledby="head-to-head-heading"
      className="surface-card flex flex-col"
      style={{ padding: "18px 24px" }}
    >
      <div className="flex items-baseline gap-3 pb-3">
        <span id="head-to-head-heading" className="eyebrow">
          Head to head
        </span>
        <div className="flex-1" />
        <span
          className="text-micro tabular whitespace-nowrap"
          style={{ color: "var(--ink-400)" }}
        >
          {meta.label} · {meta.points} points · {meta.games} games
        </span>
      </div>

      {/* Column header — you first, always. `sides` decides, never player
          order (guardrails §4). */}
      <div className="flex items-center border-b border-[var(--border-hairline)] pb-2">
        <span aria-hidden="true" className="min-w-0 flex-1" />
        <span className={COLUMN}>
          <span className="truncate text-[12px] font-medium text-[var(--ink-900)]">
            {sides.you.shortName}
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
          <span className="truncate text-[12px] font-medium text-[var(--ink-600)]">
            {sides.opp.shortName}
          </span>
        </span>
      </div>

      {sections.map((section) => (
        <div key={section.title} className="flex flex-col">
          <div className="flex items-baseline pb-[5px] pt-[13px]">
            <span className="eyebrow-sm">{section.title}</span>
          </div>

          {section.rows.map((row) => (
            <div
              key={row.label}
              className="relative -mx-2 flex min-h-8 items-center rounded-[var(--radius-element)] px-2 transition-colors duration-200 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] hover:bg-[var(--surface-muted)]"
              onMouseEnter={() => setHovered(row.label)}
              onMouseLeave={() =>
                setHovered((current) => (current === row.label ? null : current))
              }
            >
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-600)]">
                {row.label}
              </span>
              <ValueCell
                value={row.you}
                emphasised={row.leader === "you"}
                note={row.note}
                scoped={scoped}
              />
              <ValueCell
                value={row.opp}
                emphasised={row.leader === "opp"}
                note={row.note}
                scoped={scoped}
              />
              <RowTooltip
                open={hovered === row.label}
                row={row}
                youName={sides.you.shortName}
                oppName={sides.opp.shortName}
              />
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
