"use client";

import { useMemo, type ReactNode } from "react";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import {
  useMatchSides,
  type MatchSide,
} from "@/components/dashboard/matches/match-detail/use-match-sides";
import { CourtTile } from "./court-tile";
import { useVizState } from "./use-viz-state";
import { DEFAULT_CUTS } from "./default-cuts";
import {
  EMPTY_VIZ_FILTERS,
  computeViz,
  type PlayerFilter,
  type VizResult,
} from "./viz-model";

/**
 * P1a/P1b: the wall of default cuts, one row per subject (you first, then
 * the opponent — never player1/player2), three tiles per row.
 *
 * Attribution (guardrails §4): `useMatchSides()` is the only place "you" is
 * resolved here; each row's subject is read straight off the side
 * (`side.isPlayer1`) and passed to `computeViz`, never re-derived. Won/lost
 * stays relative to the row's own subject — on the opponent's row green
 * means the opponent won.
 */

export function VizWall({ savedViewsBand }: { savedViewsBand?: ReactNode }) {
  const { points } = useMatchData();
  const { you, opp } = useMatchSides();
  const { hrefFor } = useVizState();

  const rows: { filterPlayer: PlayerFilter; side: MatchSide }[] = [
    { filterPlayer: "you", side: you },
    { filterPlayer: "opponent", side: opp },
  ];

  // Keyed on `points` and `you.isPlayer1` alone — `opp.isPlayer1` is always
  // its inverse, so it carries no information the memo doesn't already have.
  const resultsBySubject: VizResult[][] = useMemo(
    () =>
      rows.map((row) =>
        DEFAULT_CUTS.map((c) =>
          computeViz(
            points,
            c.cut,
            { ...EMPTY_VIZ_FILTERS, ...c.filters },
            row.side.isPlayer1,
          ),
        ),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
    [points, you.isPlayer1],
  );

  return (
    <div className="flex flex-col gap-6">
      {rows.map((row, i) => {
        const results = resultsBySubject[i];
        const isEmpty = results.every((r) => r.total === 0);
        return (
          <div key={row.filterPlayer}>
            {isEmpty ? (
              <EmptySubjectRow name={row.side.name} />
            ) : (
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
              >
                {DEFAULT_CUTS.map((cut, j) => {
                  const result = results[j];
                  const countLabel =
                    cut.cut === "serve"
                      ? `${result.count} of ${result.total}`
                      : `${result.count} returns`;
                  const href = hrefFor({
                    cut: cut.cut,
                    chart: cut.chart,
                    viewId: null,
                    filters: {
                      ...EMPTY_VIZ_FILTERS,
                      ...cut.filters,
                      player: row.filterPlayer,
                    },
                  });
                  return (
                    <CourtTile
                      key={cut.cut}
                      playerName={row.side.name}
                      name={cut.name}
                      pills={cut.pills}
                      countLabel={countLabel}
                      cut={cut.cut}
                      dots={result.dots}
                      href={href}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {savedViewsBand}
    </div>
  );
}

/**
 * Honest zero for a subject with nothing drawable in any default cut — never
 * an empty court (an empty serve chart reads as "you hit no serves", per
 * `reference/empty-and-loading.md`). One bar across the row, not three blank
 * tiles, so the page states plainly what is missing instead of repeating an
 * empty shape three times.
 */
function EmptySubjectRow({ name }: { name: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-[var(--radius-card)] border px-6 py-8 text-center"
      style={{
        borderColor: "var(--border-hairline)",
        backgroundColor: "var(--surface-card)",
      }}
    >
      <p className="text-[12px]" style={{ color: "var(--ink-500)" }}>
        No serves or returns recorded for {name} yet.
      </p>
    </div>
  );
}
