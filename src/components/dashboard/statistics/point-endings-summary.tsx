"use client";

import { outcomeTotal } from "@/components/dashboard/matches/match-detail/match-filters/model";
import {
  OUTCOMES,
  PointEndingsBars,
} from "@/components/dashboard/shared/point-endings-bars";
import { EmptyMark } from "@/components/ui/empty-mark";
import { outcomeTalliesAcross } from "@/lib/data/point-tallies";
import { RegionCard } from "./statistics-layout";
import { useStatistics } from "./statistics-provider";

/**
 * The Statistics page's How points ended card: the match report's two
 * stacked bars (`PointEndingsBars`) over every point of the filtered
 * matches.
 *
 * The tally is `outcomeTalliesAcross` — per match with THAT match's seat
 * and derived-aces rule (`StatisticsMatch.isPlayer1` / `isDerived`,
 * guardrails §4), then summed. The figure beside each side is a per-match
 * mean ("48 pts" under the "Per match" caption) over the matches that held
 * points; the bar's shares and the legend's are the same whether taken from
 * the sum or the mean.
 *
 * No film cuts: the bars draw their read-only markup.
 *
 * Its states (widget-states):
 *   - loading — the page's own skeleton (`statistics-skeleton.tsx`)
 *   - no outcome recorded — the card's anatomy: both sides, `—` per figure,
 *     an empty track each, the legend with a dash per share. Day zero and
 *     a season filtered to nothing land here and say nothing more; matches
 *     that are here and recorded no ending get one sentence
 *   - points unavailable (`null`) — thrown to the slot's `WidgetBoundary`
 */

const SIDES = ["You", "Opponents"] as const;

/** Both sides with a dash for a figure, and the legend with a dash per share. */
function PointEndingsEmpty() {
  return (
    <>
      {SIDES.map((side) => (
        <div key={side} className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[11px] text-[var(--ink-600)]">
              {side}
            </span>
            <div className="flex-1" />
            <span className="mono tabular text-[10px] text-[var(--ink-400)]">
              <EmptyMark
                label={`No points counted for ${side.toLowerCase()} yet`}
                className="text-[10px]"
              />{" "}
              pts
            </span>
          </div>
          <div
            aria-hidden="true"
            className="h-2.5 w-full rounded-[var(--radius-cell)]"
            style={{ background: "var(--ink-100)" }}
          />
        </div>
      ))}
      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 pt-0.5">
        {OUTCOMES.map((o) => (
          <span key={o.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-[2px]"
              style={{ background: o.you }}
            />
            <span className="text-micro tabular whitespace-nowrap">
              {o.label}{" "}
              <EmptyMark
                label={`No share for ${o.label.toLowerCase()} yet`}
                className="text-[10px]"
              />
            </span>
          </span>
        ))}
      </div>
    </>
  );
}

export function PointEndingsSummary() {
  const { filtered, points } = useStatistics();
  // The read failed: say so through the slot's boundary rather than draw a
  // season in which nobody hit a winner or made an error.
  if (points === null) {
    throw new Error("Point-by-point data could not be loaded.");
  }
  // No `useMemo`: the React Compiler memoizes this, and refuses a manual one.
  const { you, opp, matchesWithPoints } = outcomeTalliesAcross(
    points,
    filtered,
  );
  const empty = outcomeTotal(you) === 0 && outcomeTotal(opp) === 0;

  return (
    <RegionCard
      title="How points ended"
      aside={<span className="text-micro whitespace-nowrap">Per match</span>}
    >
      {empty ? (
        <PointEndingsEmpty />
      ) : (
        <PointEndingsBars
          youTally={you}
          oppTally={opp}
          youName="You"
          oppName="Opponents"
          legend="share"
          figure={(_side, total) =>
            `${Math.round(total / Math.max(1, matchesWithPoints))} pts`
          }
        />
      )}
      {empty && filtered.length > 0 && (
        <p className="text-micro pt-0.5" style={{ color: "var(--ink-500)" }}>
          No point on these matches records how it ended.
        </p>
      )}
    </RegionCard>
  );
}
