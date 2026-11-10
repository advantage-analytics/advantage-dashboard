"use client";

import { prefersReducedMotion } from "./use-reduced-motion";
import { memo, useEffect, useMemo, useRef } from "react";
import type { MatchPoint } from "@/lib/data/match-points-server";
import { pointResultLabel } from "@/components/dashboard/matches/match-detail/match-filters/model";
import { useMatchFilters } from "@/components/dashboard/matches/match-detail/match-filters/provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { useOptionalWorkspace } from "@/components/dashboard/workspace-provider";
import {
  PointRow,
  groupPointsByGame,
} from "@/components/dashboard/matches/match-detail/film/point-list";
import { LIST_TONE } from "@/components/dashboard/matches/match-detail/film/point-list-tone";
import { pointDetail } from "@/components/dashboard/matches/match-detail/film/film-shots";
import { scoreColumns } from "@/components/dashboard/matches/match-detail/film/film-score";

/**
 * The lightbox's Points column (canvas S03, S05, S07): the points behind the
 * court's marks, headed by game as the Video tab heads them, each row the
 * Video tab's own `PointRow` in its light tone — 52px, full-bleed on 14px
 * sides, the winner's mark, title, detail and the mono score. No progress
 * rule and no shot well: a lit row here is the selected mark, not a playing
 * point. Clicking a row selects its mark on the court; selecting a mark
 * lights its row and scrolls it into view. A click (or Enter) on the lit row
 * is the second click and watches its point (`VizLightboxShell`'s `select`);
 * when it can, the lit row's grey line ends "· Click again to watch".
 */
export const LightboxPointList = memo(function LightboxPointList({
  points,
  allPoints,
  selectedPointId,
  onSelectPoint,
  emptyLine,
  canWatch,
}: {
  /** The matched points, in match order (`pointsBehind`). */
  points: MatchPoint[];
  /** Every point in the match — the game headers' tiebreak reading. */
  allPoints: MatchPoint[];
  selectedPointId: string | null;
  /** Stable identity, please — `PointRow` is memoized on it. */
  onSelectPoint: (point: MatchPoint) => void;
  /** The empty line under "No points to play". */
  emptyLine: string;
  /** Whether the lit row's second click can watch its point. */
  canWatch: (point: MatchPoint) => boolean;
}) {
  const sides = useMatchSides();
  const { context: labelContext } = useMatchFilters();
  const workspace = useOptionalWorkspace()?.active ?? null;
  const t = LIST_TONE.light;
  const youIsPlayer1 = sides.you.isPlayer1;
  const { hasGameScore, hasPointScore } = useMemo(
    () => scoreColumns(allPoints),
    [allPoints],
  );
  const groups = useMemo(
    () =>
      groupPointsByGame(
        points,
        allPoints,
        youIsPlayer1,
        sides.you.name,
        sides.opp.name,
        hasGameScore,
      ),
    [
      points,
      allPoints,
      youIsPlayer1,
      sides.you.name,
      sides.opp.name,
      hasGameScore,
    ],
  );

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedPointId === null) return;
    listRef.current
      ?.querySelector(`[data-point-id="${CSS.escape(selectedPointId)}"]`)
      ?.scrollIntoView({
        block: "nearest",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
  }, [selectedPointId]);

  if (points.length === 0) {
    return (
      <div className="flex flex-col gap-1 py-5">
        <span className="text-[12px] font-medium text-[var(--ink-900)]">
          No points to play
        </span>
        <span className="text-[11px] leading-[1.5] text-[var(--ink-500)]">
          {emptyLine}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      role="list"
      aria-label="Points"
      className="-mx-[14px] flex flex-col pb-2 md:min-h-0 md:flex-1 md:overflow-y-auto"
    >
      {groups.map((group) => (
        <div key={group.key} role="listitem" className="flex flex-col">
          <div className={t.gameHeader}>
            <span className={t.gameLabel}>
              Set {group.setNumber} · Game {group.gameNumber}
            </span>
            <div className="flex-1" />
            <span className={t.gameMeta}>
              {group.gameScore ? `${group.gameScore} · ` : ""}
              {group.serverName} serves
              {group.tiebreak ? " first" : ""}
            </span>
          </div>
          {group.points.map((point) => {
            const isYou = point.wonByPlayer1 === youIsPlayer1;
            const side = isYou ? sides.you : sides.opp;
            const isSelected = point.id === selectedPointId;
            const detail = pointDetail(point, labelContext.hands);
            return (
              <PointRow
                key={point.id}
                point={point}
                title={pointResultLabel(point, labelContext)}
                detail={
                  // The second click, said on the lit row's own grey line —
                  // same 11px ink-500, truncating with it.
                  isSelected && canWatch(point)
                    ? [detail, "Click again to watch"]
                        .filter((part) => part !== "")
                        .join(" · ")
                    : detail
                }
                isYou={isYou}
                initials={side.initials}
                crestUrl={side.player.crestUrl ?? null}
                workspace={workspace}
                showPointScore={hasPointScore}
                isActive={isSelected}
                activeStart={0}
                activeEnd={0}
                onSelect={onSelectPoint}
                tone="light"
                selectable
                showProgress={false}
                inset
              />
            );
          })}
        </div>
      ))}
    </div>
  );
});
