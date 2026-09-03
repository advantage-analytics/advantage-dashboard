"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import {
  scopePoints,
  useSetScope,
} from "@/components/dashboard/matches/match-detail/set-scope";
import { ChartTooltip } from "@/components/dashboard/matches/match-detail/chart-tooltip";
import type { MatchPoint } from "@/lib/data/match-points-server";

/**
 * The Statistics tab's "How points ended" card (artboard 46a, lines 550–556).
 *
 * One 100% stacked bar per player over that player's OWN decisive shots:
 * winners, aces, unforced errors, double faults. The bars are not compared
 * against each other by length — each is its own composition — so the hover
 * carries the cross-reference count instead.
 *
 * The viewer's bar is first (`useMatchSides()`, guardrails §4), never
 * player1's.
 *
 * BUCKETING follows `calculate_match_stats`, which reads all four of these
 * exclusively off the free-text `points.result_type`:
 *   aces           `result_type = 'Ace'`
 *   double faults  `result_type = 'Double Fault'`
 *   winners        `result_type LIKE '%Winner%'`  (so 'Service Winner',
 *                  'Forehand Winner' … all land here, as they do in the
 *                  published card)
 *   unforced errs  `result_type LIKE '%Unforced Error%'`
 * Aces and double faults belong to the server structurally; winners and
 * unforced errors belong to whoever struck the decisive shot (`points.player`).
 * `head-to-head-card.tsx` splits them on exactly the same line.
 *
 * ACES ON A DERIVED MATCH. `suppress_derived_match_stats()` nulls
 * `match_stats.aces` for every `source_provider = 'splitstep'` match because
 * derivation cannot tell an ace from a service winner — it never emits 'Ace'
 * at all (see `services/splitstep/derivation/result-type.ts`). Counting from
 * points here would therefore print a confident 0, which is a claim about the
 * player rather than about the analysis. The segment is dropped on the same
 * provider test the SQL uses, not on the count being zero.
 *
 * Scope-aware: `scopePoints(points, activeSet)` narrows the tally to the
 * selected set before bucketing, the same read every point-derived card on
 * this tab makes (rally-length-card.tsx takes the identical dependency).
 */

const EASE_CHART = [0.2, 0, 0.4, 1] as const;

type OutcomeKey = "winners" | "aces" | "unforcedErrors" | "doubleFaults";

interface OutcomeMeta {
  key: OutcomeKey;
  label: string;
  /** Shorter legend text — the 6px-swatch row has no room for "errors". */
  legendLabel?: string;
  /** Fill for the viewer's bar. */
  you: string;
  /** Fill for the opponent's bar. */
  opp: string;
}

const OUTCOMES: OutcomeMeta[] = [
  {
    key: "winners",
    label: "Winners",
    you: "var(--viz-you-deep)",
    opp: "var(--viz-opp-deep)",
  },
  { key: "aces", label: "Aces", you: "var(--viz-you)", opp: "var(--viz-opp)" },
  {
    key: "unforcedErrors",
    label: "Unforced errors",
    legendLabel: "Unforced",
    you: "var(--viz-you-mid)",
    opp: "var(--viz-opp-mid)",
  },
  {
    key: "doubleFaults",
    label: "Double faults",
    you: "var(--viz-you-light)",
    opp: "var(--viz-opp-light)",
  },
];

type Tally = Record<OutcomeKey, number>;

function emptyTally(): Tally {
  return { winners: 0, aces: 0, unforcedErrors: 0, doubleFaults: 0 };
}

/**
 * One pass, one bucket per point. The chain is exclusive on purpose: a point
 * counted in two segments would make the bar's own total disagree with the
 * counts in its segment hovers.
 */
function tally(points: MatchPoint[], isPlayer1: boolean): Tally {
  const t = emptyTally();
  const me = isPlayer1 ? "player1" : "player2";

  for (const p of points) {
    const result = (p.resultType ?? "").toLowerCase();
    const iServed = p.serverIsPlayer1 === isPlayer1;
    const iStruck = p.player === me;

    if (result === "ace") {
      if (iServed) t.aces += 1;
    } else if (result === "double fault") {
      if (iServed) t.doubleFaults += 1;
    } else if (result.includes("winner")) {
      if (iStruck) t.winners += 1;
    } else if (result.includes("unforced error")) {
      if (iStruck) t.unforcedErrors += 1;
    }
  }

  return t;
}

interface PointEndingsCardProps {
  /** Video-derived match — the Aces segment cannot be measured. */
  isDerived: boolean;
}

export function PointEndingsCard({ isDerived }: PointEndingsCardProps) {
  const { points } = useMatchData();
  const sides = useMatchSides();
  const { activeSet } = useSetScope();
  const shouldReduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);

  const youIsPlayer1 = sides.you.isPlayer1;

  // Narrow to the chosen set through the shared helper — the same read every
  // point-derived card on this tab makes, so the chip selection moves them
  // in step. `null` is the whole match.
  const scopedPoints = useMemo(
    () => scopePoints(points, activeSet),
    [points, activeSet],
  );

  const { youTally, oppTally } = useMemo(
    () => ({
      youTally: tally(scopedPoints, youIsPlayer1),
      oppTally: tally(scopedPoints, !youIsPlayer1),
    }),
    [scopedPoints, youIsPlayer1],
  );

  const outcomes = OUTCOMES.filter((o) => o.key !== "aces" || !isDerived);

  const youTotal = outcomes.reduce((sum, o) => sum + youTally[o.key], 0);
  const oppTotal = outcomes.reduce((sum, o) => sum + oppTally[o.key], 0);

  // No point on this match records how it ended — two empty bars would read as
  // "nobody hit a winner or made an error".
  if (youTotal === 0 && oppTotal === 0) return null;

  const rows = [
    {
      id: "you",
      name: sides.you.shortName,
      otherName: sides.opp.shortName,
      own: youTally,
      other: oppTally,
      total: youTotal,
      fill: (o: OutcomeMeta) => o.you,
    },
    {
      id: "opp",
      name: sides.opp.shortName,
      otherName: sides.you.shortName,
      own: oppTally,
      other: youTally,
      total: oppTotal,
      fill: (o: OutcomeMeta) => o.opp,
    },
  ];

  return (
    <section
      aria-labelledby="point-endings-heading"
      className="surface-card flex flex-col gap-2.5"
      style={{ padding: "18px 20px 16px" }}
    >
      <div className="flex items-baseline gap-2">
        <span id="point-endings-heading" className="eyebrow">
          How points ended
        </span>
        <div className="flex-1" />
        <span className="text-micro whitespace-nowrap">Own outcomes</span>
      </div>

      {rows.map((row) => {
        const segments = outcomes.filter((o) => row.own[o.key] > 0);

        return (
          <div key={row.id} className="flex flex-col gap-[5px]">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[11px] text-[var(--ink-600)]">
                {row.name}
              </span>
              <div className="flex-1" />
              <span className="mono tabular text-[10px] text-[var(--ink-400)]">
                {row.total}
              </span>
            </div>

            <div className="flex h-2.5 w-full gap-0.5">
              {segments.map((o, i) => {
                const id = `${row.id}-${o.key}`;
                const share = row.total > 0 ? (row.own[o.key] / row.total) * 100 : 0;
                const isFirst = i === 0;
                const isLast = i === segments.length - 1;

                return (
                  <motion.div
                    key={o.key}
                    className="relative cursor-default"
                    style={{
                      background: row.fill(o),
                      borderTopLeftRadius: isFirst
                        ? "var(--radius-cell)"
                        : undefined,
                      borderBottomLeftRadius: isFirst
                        ? "var(--radius-cell)"
                        : undefined,
                      borderTopRightRadius: isLast
                        ? "var(--radius-cell)"
                        : undefined,
                      borderBottomRightRadius: isLast
                        ? "var(--radius-cell)"
                        : undefined,
                    }}
                    initial={
                      shouldReduceMotion
                        ? { width: `${share}%`, opacity: 0 }
                        : { width: "0%" }
                    }
                    animate={
                      shouldReduceMotion
                        ? { width: `${share}%`, opacity: 1 }
                        : { width: `${share}%` }
                    }
                    transition={{
                      duration: shouldReduceMotion ? 0.2 : 0.5,
                      ease: EASE_CHART,
                    }}
                    tabIndex={0}
                    aria-label={`${o.label}. ${row.name} ${row.own[o.key]}, ${row.otherName} ${row.other[o.key]}.`}
                    onMouseEnter={() => setHovered(id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(id)}
                    onBlur={() => setHovered(null)}
                  >
                    <SegmentTooltip
                      open={hovered === id}
                      label={o.label}
                      detail={`${row.name} ${row.own[o.key]} · ${row.otherName} ${row.other[o.key]}`}
                      align={isFirst ? "start" : isLast ? "end" : "center"}
                    />
                  </motion.div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-0.5">
        {/* Local swatch, not the shared `LegendSwatch` — this legend runs at
            6px, smaller than that component's fixed 8px dot. */}
        {outcomes.map((o) => (
          <span key={o.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-[2px]"
              style={{ background: o.you }}
            />
            <span className="text-micro whitespace-nowrap">
              {o.legendLabel ?? o.label}
            </span>
          </span>
        ))}
      </div>
    </section>
  );
}

function SegmentTooltip({
  open,
  label,
  detail,
  align,
}: {
  open: boolean;
  label: string;
  detail: string;
  align: "start" | "center" | "end";
}) {
  return (
    <ChartTooltip
      open={open}
      align={align}
      bottomOffset={6}
      className="gap-0.5 px-2.5 py-2"
    >
      <span className="text-[12px] font-medium text-white">{label}</span>
      <span className="tabular text-[11px] text-white/[0.64]">{detail}</span>
    </ChartTooltip>
  );
}
