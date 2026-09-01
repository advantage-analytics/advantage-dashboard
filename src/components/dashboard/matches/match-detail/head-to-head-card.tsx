"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { PlayerStatistics } from "@/lib/data/types";
import { cn } from "@/lib/utils";

/**
 * The Statistics tab's head-to-head card (artboard 46a, lines 499–517).
 *
 * Legend row, per-set score chips, then the Serve / Return / Other stat groups
 * as mirrored rows: your value on the left, the label centred, the opponent's
 * value on the right, with a two-segment bar underneath sized by each side's
 * share.
 *
 * Which side is "you" comes exclusively from `useMatchSides()` (guardrails §4).
 * Nothing in this file reads `player1`/`player2` off the match — the stat
 * builder below takes `you` and `opp` statistics as arguments precisely so the
 * orientation is decided once, at the call site that holds `sides`.
 */

/* ── Stat configuration ─────────────────────────────────────────────────────
   Relocated here from `app/dashboard/matches/[matchId]/page.tsx`, which no
   longer builds stat rows. The card that consumes them owns them. */

export type StatConfig = {
  key: keyof PlayerStatistics;
  label: string;
  isPercentage: boolean;
  fractionKey?: string;
};

export const SERVE_STATS: StatConfig[] = [
  { key: "aces", label: "Aces", isPercentage: false },
  { key: "doubleFaults", label: "Double Faults", isPercentage: false },
  { key: "firstServeInPct", label: "First Serves In", isPercentage: true, fractionKey: "firstServeInPct" },
  { key: "firstServeWinPct", label: "First Serve Points Won", isPercentage: true, fractionKey: "firstServeWinPct" },
  { key: "secondServeWinPct", label: "Second Serve Points Won", isPercentage: true, fractionKey: "secondServeWinPct" },
  { key: "breakpointsSaved", label: "Break Points Saved", isPercentage: false, fractionKey: "breakpointsSaved" },
  { key: "servicePointsWon", label: "Service Points Won", isPercentage: false, fractionKey: "servicePointsWon" },
  { key: "serviceGamesWon", label: "Service Games Won", isPercentage: false },
];

export const RETURN_STATS: StatConfig[] = [
  { key: "firstReturnInPct", label: "First Returns In Play", isPercentage: false },
  { key: "firstReturnWonPct", label: "First Return Points Won", isPercentage: false },
  { key: "secondReturnInPct", label: "Second Returns In Play", isPercentage: true, fractionKey: "secondReturnInPct" },
  { key: "secondReturnWonPct", label: "Second Return Points Won", isPercentage: true, fractionKey: "secondReturnWonPct" },
  { key: "breakpointsWonPct", label: "Break Points Converted", isPercentage: true, fractionKey: "breakpointsWonPct" },
  { key: "returnPointsWon", label: "Return Points Won", isPercentage: false, fractionKey: "returnPointsWon" },
  { key: "returnGamesWonPct", label: "Return Games Won %", isPercentage: true, fractionKey: "returnGamesWonPct" },
  { key: "returnGamesWon", label: "Service Breaks", isPercentage: false },
];

export const OTHER_STATS: StatConfig[] = [
  { key: "winners", label: "Winners", isPercentage: false },
  { key: "unforcedErrors", label: "Unforced Errors", isPercentage: false },
  { key: "netPointsAppearances", label: "Net Approaches", isPercentage: false },
  { key: "netPointsWonPct", label: "Net Points Won %", isPercentage: true, fractionKey: "netPointsWonPct" },
  { key: "shortRallyWonPct", label: "Short Rallies (1–4)", isPercentage: true, fractionKey: "shortRallyWonPct" },
  { key: "mediumRallyWonPct", label: "Medium Rallies (5–8)", isPercentage: true, fractionKey: "mediumRallyWonPct" },
  { key: "longRallyWonPct", label: "Long Rallies (9+)", isPercentage: true, fractionKey: "longRallyWonPct" },
  { key: "totalPointsWon", label: "Total Points Won", isPercentage: false },
];

const STAT_GROUPS: { title: string; configs: StatConfig[] }[] = [
  { title: "Serve", configs: SERVE_STATS },
  { title: "Return", configs: RETURN_STATS },
  { title: "Other", configs: OTHER_STATS },
];

/** "" is what this card treats as missing; 0 is a measurement. */
export function statDisplay(
  value: number | null,
  isPercentage?: boolean,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return isPercentage ? `${Math.round(value)}%` : String(Math.round(value));
}

export interface H2HRow {
  label: string;
  youDisplay: string;
  oppDisplay: string;
  youFraction?: string;
  oppFraction?: string;
}

/**
 * The published (whole-match) rows. `you`/`opp` rather than `p1`/`p2` on
 * purpose: a builder keyed on player order is exactly the shape that silently
 * swaps a match's statistics when the viewer happens to be player2.
 */
export function buildStatRows(
  configs: StatConfig[],
  you: PlayerStatistics,
  opp: PlayerStatistics,
): H2HRow[] {
  return configs.map((c) => {
    const youVal = you[c.key] as number | null;
    const oppVal = opp[c.key] as number | null;
    const youFrac = c.fractionKey ? you.fractions[c.fractionKey] : undefined;
    const oppFrac = c.fractionKey ? opp.fractions[c.fractionKey] : undefined;

    return {
      label: c.label,
      // An empty display is this card's contract for "no data", which it
      // renders as an italic em dash with an explanatory tooltip. Absent must
      // reach here as null rather than 0 — see the mapping in
      // match-stats-server.ts.
      youDisplay: statDisplay(youVal, c.isPercentage),
      oppDisplay: statDisplay(oppVal, c.isPercentage),
      youFraction: youFrac ? `${youFrac.made}/${youFrac.attempts}` : undefined,
      oppFraction: oppFrac ? `${oppFrac.made}/${oppFrac.attempts}` : undefined,
    };
  });
}

/* ── Per-set derivation ─────────────────────────────────────────────────────
   A set chip narrows the card to one set. The published `match_stats` numbers
   are whole-match only, so the filtered view is recomputed from `points` — and
   only for the statistics a `MatchPoint` genuinely carries. Everything else
   shows the same em dash the card already uses for missing data, because a
   plausible-looking number computed from fields that cannot support it is the
   one failure mode nothing downstream can catch. */

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
    // same substrings keeps a filtered row comparable with the published one.
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
  fraction?: string;
}

function countValue(t: Tally): DerivedValue {
  return { value: t.won, fraction: `${t.won}/${t.total}` };
}

function pctValue(t: Tally): DerivedValue {
  if (t.total === 0) return { value: null };
  return { value: (t.won / t.total) * 100, fraction: `${t.won}/${t.total}` };
}

/**
 * The filtered value for one statistic, or `null` when a `MatchPoint` cannot
 * support it for a single set — first/second serve splits, net play and any
 * game-level count all need information the point rows do not carry.
 */
function derivedValue(cfg: StatConfig, d: DerivedSide): DerivedValue | null {
  switch (cfg.key) {
    case "aces":
      return { value: d.aces };
    case "doubleFaults":
      return { value: d.doubleFaults };
    case "winners":
      return { value: d.winners };
    case "unforcedErrors":
      return { value: d.unforcedErrors };
    case "totalPointsWon":
      return { value: d.allPoints.won };
    case "breakpointsSaved":
      return countValue(d.breakPointsFaced);
    case "servicePointsWon":
      return countValue(d.servicePoints);
    case "returnPointsWon":
      return countValue(d.returnPoints);
    case "breakpointsWonPct":
      return pctValue(d.breakPointsAgainst);
    case "shortRallyWonPct":
      return pctValue(d.shortRally);
    case "mediumRallyWonPct":
      return pctValue(d.mediumRally);
    case "longRallyWonPct":
      return pctValue(d.longRally);
    default:
      return null;
  }
}

function buildDerivedRows(
  configs: StatConfig[],
  published: H2HRow[],
  youDerived: DerivedSide,
  oppDerived: DerivedSide,
): H2HRow[] {
  return configs.map((cfg, i) => {
    const base = published[i];
    const you = derivedValue(cfg, youDerived);
    const opp = derivedValue(cfg, oppDerived);

    // A statistic the provider withheld whole-match stays withheld per set.
    // Aces on a video-derived match are the case that matters: derivation
    // never emits "Ace", so counting them here would print a confident 0
    // where the published card correctly prints an em dash.
    const youWithheld = base.youDisplay === "";
    const oppWithheld = base.oppDisplay === "";

    const youDisplay =
      you && !youWithheld ? statDisplay(you.value, cfg.isPercentage) : "";
    const oppDisplay =
      opp && !oppWithheld ? statDisplay(opp.value, cfg.isPercentage) : "";

    return {
      label: cfg.label,
      youDisplay,
      oppDisplay,
      youFraction: cfg.fractionKey && youDisplay ? you?.fraction : undefined,
      oppFraction: cfg.fractionKey && oppDisplay ? opp?.fraction : undefined,
    };
  });
}

/* ── Rendering ──────────────────────────────────────────────────────────── */

function parseDisplay(s: string): number | null {
  const raw = s.trim();
  if (raw === "") return null;
  const n = Number(raw.endsWith("%") ? raw.slice(0, -1) : raw);
  return Number.isFinite(n) ? n : null;
}

function sharePct(value: number | null, other: number | null): string {
  const a = value ?? 0;
  const b = other ?? 0;
  const sum = a + b;
  if (sum <= 0) return "0%";
  return `${(a / sum) * 100}%`;
}

function ValueCell({
  display,
  fraction,
  isLeader,
  filtered,
  align,
}: {
  display: string;
  fraction?: string;
  isLeader: boolean;
  filtered: boolean;
  align: "start" | "end";
}) {
  const number = display.trim() ? (
    <span
      className="tabular text-[13px]"
      style={{
        fontWeight: isLeader ? 500 : 400,
        color: isLeader ? "var(--ink-900)" : "var(--ink-500)",
      }}
    >
      {display}
    </span>
  ) : (
    // The card's existing missing-data convention (match-statistics-card.tsx):
    // an italic em dash that says why on hover, never a zero.
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
        {filtered ? "Not measurable for a single set" : "No data"}
      </TooltipContent>
    </Tooltip>
  );

  // A fraction beside an em dash would contradict it — the old card dropped the
  // sub-figure with the value, and so does this one.
  const sub =
    fraction && display.trim() ? (
      <span className="mono tabular text-[9px] text-[var(--ink-400)]">
        {fraction}
      </span>
    ) : null;

  return (
    <span
      className={cn(
        "flex w-[112px] shrink-0 items-baseline gap-1.5",
        align === "end" && "justify-end",
      )}
    >
      {align === "end" ? (
        <>
          {sub}
          {number}
        </>
      ) : (
        <>
          {number}
          {sub}
        </>
      )}
    </span>
  );
}

export function HeadToHeadCard() {
  const { match, points } = useMatchData();
  const sides = useMatchSides();
  const [activeSet, setActiveSet] = useState<number | null>(null);

  const youStats = sides.you.stats;
  const oppStats = sides.opp.stats;
  const youIsPlayer1 = sides.you.isPlayer1;

  /** How many points each set contributes — a set with none can't be filtered. */
  const pointsPerSet = useMemo(() => {
    const counts = new Map<number, number>();
    for (const p of points) {
      counts.set(p.setNumber, (counts.get(p.setNumber) ?? 0) + 1);
    }
    return counts;
  }, [points]);

  const filteredPoints = useMemo(
    () =>
      activeSet === null
        ? points
        : points.filter((p) => p.setNumber === activeSet),
    [points, activeSet],
  );

  const sections = useMemo(() => {
    if (!youStats || !oppStats) return [];
    const youDerived =
      activeSet === null ? null : tallySide(filteredPoints, youIsPlayer1);
    const oppDerived =
      activeSet === null ? null : tallySide(filteredPoints, !youIsPlayer1);

    return STAT_GROUPS.map((group) => {
      const published = buildStatRows(group.configs, youStats, oppStats);
      return {
        title: group.title,
        rows:
          youDerived && oppDerived
            ? buildDerivedRows(group.configs, published, youDerived, oppDerived)
            : published,
      };
    });
  }, [youStats, oppStats, youIsPlayer1, activeSet, filteredPoints]);

  if (sections.length === 0) return null;

  const filtered = activeSet !== null;
  const scopeLabel = filtered ? `Set ${activeSet}` : "Whole match";
  const scopeCount = filtered ? filteredPoints.length : points.length;

  return (
    <section
      aria-labelledby="head-to-head-heading"
      className="surface-card flex flex-col"
      style={{ padding: "18px 24px" }}
    >
      <div className="flex items-center gap-3 pb-4">
        <span id="head-to-head-heading" className="eyebrow">
          Head to head
        </span>
        <div className="flex-1" />
        <span className="inline-flex items-baseline gap-2">
          <span className="whitespace-nowrap text-[11px] font-medium text-[var(--ink-700)]">
            {scopeLabel}
          </span>
          {scopeCount > 0 && (
            <span
              className="text-micro tabular whitespace-nowrap"
              style={{ color: "var(--ink-400)" }}
            >
              {scopeCount} points
            </span>
          )}
        </span>
        {filtered && (
          <button
            type="button"
            onClick={() => setActiveSet(null)}
            className="cursor-pointer whitespace-nowrap text-[11px] font-medium text-[var(--blue)]"
          >
            Whole match
          </button>
        )}
      </div>

      {/* Legend — you on the left, always. `sides` decides, never player order. */}
      <div className="flex items-center gap-3 border-b border-[var(--border-hairline)] pb-3">
        <span className="inline-flex min-w-0 flex-1 items-center gap-[7px]">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-[2px] bg-[var(--viz-you)]"
          />
          <span className="truncate whitespace-nowrap text-[13px] font-medium text-[var(--ink-900)]">
            {sides.you.name}
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

        <div className="flex shrink-0 items-center gap-[3px]">
          {sides.sets.map((set, i) => {
            const setNumber = i + 1;
            const isActive = activeSet === setNumber;
            const hasPoints = (pointsPerSet.get(setNumber) ?? 0) > 0;
            return (
              <button
                key={setNumber}
                type="button"
                disabled={!hasPoints}
                aria-pressed={isActive}
                aria-label={`Set ${setNumber}, ${set.player1}-${set.player2}`}
                onClick={() => setActiveSet(isActive ? null : setNumber)}
                className={cn(
                  "text-scoreboard-sm tabular inline-flex h-[26px] items-center rounded-[var(--radius-button)] px-2.5 transition-[background-color,opacity] duration-200 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]",
                  hasPoints
                    ? "cursor-pointer hover:bg-[var(--surface-muted)] hover:opacity-100"
                    : "cursor-default opacity-40",
                  isActive && "bg-[var(--surface-subtle)]",
                  filtered && !isActive && hasPoints && "opacity-45",
                )}
                // `.text-scoreboard-sm` is unlayered, so it beats a Tailwind
                // font-size utility — the artboard's 13px has to be inline.
                style={{ fontSize: "13px", color: "var(--ink-900)" }}
              >
                {set.player1}-{set.player2}
              </button>
            );
          })}
        </div>

        <span className="inline-flex min-w-0 flex-1 items-center justify-end gap-[7px]">
          <span className="truncate whitespace-nowrap text-[13px] font-medium text-[var(--ink-600)]">
            {sides.opp.name}
          </span>
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-[2px] bg-[var(--viz-opp)]"
          />
        </span>
      </div>

      {sections.map((section) => (
        <div key={section.title} className="flex flex-col">
          <div className="flex items-baseline pb-1 pt-3.5">
            <span className="eyebrow-sm">{section.title}</span>
          </div>
          {section.rows.map((row) => {
            const youNum = parseDisplay(row.youDisplay);
            const oppNum = parseDisplay(row.oppDisplay);
            const youLeads =
              youNum !== null && oppNum !== null && youNum > oppNum;
            const oppLeads =
              youNum !== null && oppNum !== null && oppNum > youNum;

            return (
              <div
                key={row.label}
                className="flex flex-col gap-1 border-b border-[var(--border-hairline)] py-2"
              >
                <div className="flex items-baseline">
                  <ValueCell
                    display={row.youDisplay}
                    fraction={row.youFraction}
                    isLeader={youLeads}
                    filtered={filtered}
                    align="start"
                  />
                  <span className="flex-1 text-center text-[11px] text-[var(--ink-600)]">
                    {row.label}
                  </span>
                  <ValueCell
                    display={row.oppDisplay}
                    fraction={row.oppFraction}
                    isLeader={oppLeads}
                    filtered={filtered}
                    align="end"
                  />
                </div>

                <div aria-hidden="true" className="flex items-center">
                  <span className="flex h-[5px] flex-1 justify-end overflow-hidden rounded-l-[3px] bg-[var(--surface-subtle)]">
                    <span
                      className="h-[5px] rounded-l-[3px] bg-[var(--viz-you)]"
                      style={{ width: sharePct(youNum, oppNum) }}
                    />
                  </span>
                  <span className="mx-px h-[11px] w-[2px] rounded-[1px] bg-[var(--ink-100)]" />
                  <span className="h-[5px] flex-1 overflow-hidden rounded-r-[3px] bg-[var(--surface-subtle)]">
                    <span
                      className="block h-[5px] rounded-r-[3px] bg-[var(--viz-opp)]"
                      style={{ width: sharePct(oppNum, youNum) }}
                    />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
