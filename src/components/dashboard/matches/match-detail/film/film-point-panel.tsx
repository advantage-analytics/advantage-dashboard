"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, PanelRightClose } from "lucide-react";

import type { MatchPoint } from "@/lib/data/match-points-server";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { cn } from "@/lib/utils";

import { FilmAdvancedFiltersDialog } from "./film-advanced-filters-dialog";
import { describeFilmCut, lastNameOf, type FilmFilters } from "./film-filters";
import { FilmQuickFilters } from "./film-quick-filters";
import { absolutize } from "./film-score";

/**
 * The 320px point list over the film (handoff F3). Slides in from the right;
 * the film stays full-bleed behind it. Tabs, group headers, rows and the
 * footer are `point-list.tsx`'s structure in the dark treatment, with the
 * F3 hover: the score slides 26px left and the bookmark fades in. The playing
 * row's blue progress rule is the only blue in the list.
 *
 * The same guardrails as the report list: the server's name and every score
 * orientation come from `useMatchSides()`, never from player order, and a
 * score column that is "0-0" from end to end is not printed at all.
 */

export interface FilmPointPanelProps {
  allPoints: MatchPoint[];
  visiblePoints: MatchPoint[];
  filters: FilmFilters;
  onFiltersChange: (filters: FilmFilters) => void;
  tab: "points" | "saved";
  onTabChange: (tab: "points" | "saved") => void;
  activePointId: string | null;
  activeProgress: number;
  position: { index: number; total: number } | null;
  columns: { hasGameScore: boolean; hasPointScore: boolean };
  onSelect: (point: MatchPoint) => void;
  onToggleSaved: (pointId: string) => void;
  onClose: () => void;
}

interface GameGroup {
  key: string;
  setNumber: number;
  gameNumber: number;
  serverName: string;
  /** You-first, en-dashed, or null when the column is empty. */
  gameScore: string | null;
  points: MatchPoint[];
}

function youFirst(
  serverFirst: string,
  serverIsPlayer1: boolean,
  youIsPlayer1: boolean,
): string | null {
  const pair = absolutize(serverFirst, serverIsPlayer1);
  if (!pair) return null;
  return youIsPlayer1
    ? `${pair.player1}–${pair.player2}`
    : `${pair.player2}–${pair.player1}`;
}

export function FilmPointPanel({
  allPoints,
  visiblePoints,
  filters,
  onFiltersChange,
  tab,
  onTabChange,
  activePointId,
  activeProgress,
  position,
  columns,
  onSelect,
  onToggleSaved,
  onClose,
}: FilmPointPanelProps) {
  const sides = useMatchSides();
  const youIsPlayer1 = sides.you.isPlayer1;
  const youName = sides.you.name;
  const oppName = sides.opp.name;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => {
    const out: GameGroup[] = [];
    let current: GameGroup | undefined;
    for (const point of visiblePoints) {
      if (
        !current ||
        current.setNumber !== point.setNumber ||
        current.gameNumber !== point.gameNumber
      ) {
        const serverIsYou = point.serverIsPlayer1 === youIsPlayer1;
        current = {
          key: `${point.setNumber}-${point.gameNumber}-${point.id}`,
          setNumber: point.setNumber,
          gameNumber: point.gameNumber,
          serverName: lastNameOf(serverIsYou ? youName : oppName),
          gameScore: columns.hasGameScore
            ? youFirst(point.gameScore, point.serverIsPlayer1, youIsPlayer1)
            : null,
          points: [],
        };
        out.push(current);
      }
      current.points.push(point);
    }
    return out;
  }, [visiblePoints, youIsPlayer1, youName, oppName, columns.hasGameScore]);

  const savedCount = useMemo(
    () => allPoints.filter((p) => p.saved).length,
    [allPoints],
  );

  // Keep the playing row in view as the film moves on, without fighting a
  // user who is scrolling the list themselves.
  useEffect(() => {
    if (!activePointId || !listRef.current) return;
    const row = listRef.current.querySelector<HTMLElement>(
      `[data-point-id="${activePointId}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [activePointId]);

  return (
    <aside
      aria-label="Point list"
      className="absolute inset-y-0 right-0 flex w-[320px] max-w-full animate-in flex-col bg-[rgba(13,13,13,0.88)] shadow-[inset_1px_0_0_rgba(255,255,255,0.1)] duration-200 fade-in-0 motion-safe:slide-in-from-right"
    >
      <div className="flex items-center gap-5 px-4 pt-[13px] shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]">
        <div
          role="tablist"
          aria-label="Point list view"
          className="flex items-center gap-5"
        >
          {(["points", "saved"] as const).map((value) => {
            const active = value === tab;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(value)}
                className={cn(
                  "cursor-pointer px-0.5 pt-0.5 pb-2 text-[11px] font-medium transition-colors duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                  active
                    ? "text-white shadow-[inset_0_-2px_0_var(--blue)]"
                    : "text-white/50 hover:text-white/80",
                )}
              >
                {value === "points" ? "Points" : "Saved"}
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <FilmQuickFilters
          filters={filters}
          onFiltersChange={onFiltersChange}
          sides={sides}
          onOpenAdvanced={() => setAdvancedOpen(true)}
        />
        <button
          type="button"
          aria-label="Collapse point list"
          onClick={onClose}
          className="mb-[7px] inline-flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-white/70 transition-colors duration-200 hover:bg-white/[0.08] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          <PanelRightClose
            className="h-3.5 w-3.5"
            strokeWidth={1.6}
            aria-hidden="true"
          />
        </button>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <EmptyPanel
            tab={tab}
            hasAnySaved={savedCount > 0}
            onGoToPoints={() => onTabChange("points")}
          />
        ) : (
          groups.map((group) => (
            <div key={group.key} className="flex flex-col">
              <div className="flex items-center px-4 pt-3 pb-[5px]">
                <span className="mono text-[9px] tracking-[1.4px] text-white/45 uppercase">
                  Set {group.setNumber} · Game {group.gameNumber}
                </span>
                <div className="flex-1" />
                <span className="mono tabular text-[10px] text-white/40">
                  {group.gameScore ? `${group.gameScore} · ` : ""}
                  {group.serverName} serves
                </span>
              </div>
              {group.points.map((point) => (
                <PanelRow
                  key={point.id}
                  point={point}
                  score={
                    columns.hasPointScore
                      ? youFirst(
                          point.pointScore,
                          point.serverIsPlayer1,
                          youIsPlayer1,
                        )
                      : null
                  }
                  isActive={point.id === activePointId}
                  progress={point.id === activePointId ? activeProgress : 0}
                  onSelect={onSelect}
                  onToggleSaved={onToggleSaved}
                />
              ))}
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-2 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
        <span className="min-w-0 truncate text-[11px] text-white/60">
          {describeFilmCut(filters, sides)} ·{" "}
          <span className="mono tabular">{savedCount}</span> saved
        </span>
        <div className="flex-1" />
        {position && (
          <span className="mono tabular shrink-0 text-[10px] text-white/45">
            {position.index} / {position.total}
          </span>
        )}
      </div>

      <FilmAdvancedFiltersDialog
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        points={allPoints}
        filters={filters}
        youIsPlayer1={youIsPlayer1}
        onApply={onFiltersChange}
      />
    </aside>
  );
}

/** Memoized: `timeupdate` re-renders the panel ~4×/s. */
const PanelRow = memo(function PanelRow({
  point,
  score,
  isActive,
  progress,
  onSelect,
  onToggleSaved,
}: {
  point: MatchPoint;
  score: string | null;
  isActive: boolean;
  progress: number;
  onSelect: (point: MatchPoint) => void;
  onToggleSaved: (pointId: string) => void;
}) {
  const seekable = point.videoTime != null;
  return (
    <div
      data-point-id={point.id}
      role={seekable ? "button" : undefined}
      tabIndex={seekable ? 0 : undefined}
      aria-label={
        seekable
          ? `${point.resultType || "Point"} — jump to this point`
          : undefined
      }
      aria-current={isActive ? "true" : undefined}
      onClick={() => seekable && onSelect(point)}
      onKeyDown={(e) => {
        if (seekable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect(point);
        }
      }}
      className={cn(
        "group/row relative flex h-11 items-center gap-2.5 px-4 transition-colors duration-200",
        seekable
          ? "cursor-pointer hover:bg-white/[0.06] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          : "cursor-default opacity-45",
        isActive && "bg-white/[0.09]",
      )}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            "truncate text-[11px] font-medium",
            isActive ? "text-white" : "text-white/[0.88]",
          )}
        >
          {point.resultType || "Point"}
        </span>
        <span className="truncate text-[10px] text-white/45">
          {point.description}
        </span>
      </span>
      <div className="flex-1" />
      {score && (
        <span
          className={cn(
            "mono tabular inline-block text-[11px] transition-transform duration-200 motion-safe:group-focus-within/row:-translate-x-[26px] motion-safe:group-hover/row:-translate-x-[26px]",
            isActive ? "text-white" : "text-white/60",
          )}
        >
          {score}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSaved(point.id);
        }}
        aria-label={point.saved ? "Remove bookmark" : "Save point"}
        aria-pressed={point.saved}
        className={cn(
          "absolute right-4 inline-flex cursor-pointer items-center rounded-[var(--radius-cell)] p-0.5 transition-opacity duration-200 focus-visible:opacity-100 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
          point.saved
            ? "opacity-100"
            : "opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100",
        )}
      >
        <Bookmark
          className="h-[13px] w-[13px]"
          strokeWidth={1.6}
          style={{
            color: point.saved ? "#FFFFFF" : "rgba(255,255,255,0.75)",
            fill: point.saved ? "#FFFFFF" : "none",
          }}
          aria-hidden="true"
        />
      </button>
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-0.5 bg-[var(--blue)]"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      )}
    </div>
  );
});

function EmptyPanel({
  tab,
  hasAnySaved,
  onGoToPoints,
}: {
  tab: "points" | "saved";
  hasAnySaved: boolean;
  onGoToPoints: () => void;
}) {
  const saved = tab === "saved";
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-14 text-center">
      <span className="text-[12px] font-medium text-white/80">
        {saved
          ? hasAnySaved
            ? "No saved points match"
            : "Nothing saved yet"
          : "No points match"}
      </span>
      <span className="max-w-[240px] text-[11px] text-white/45">
        {saved
          ? hasAnySaved
            ? "The current cut hides every point you saved."
            : "Press S on a point, or the bookmark on a row, to keep it here."
          : "The current cut is too narrow to leave anything on the film."}
      </span>
      {saved && !hasAnySaved && (
        <button
          type="button"
          onClick={onGoToPoints}
          className="mt-3 cursor-pointer text-[11px] font-medium text-white/70 hover:text-white"
        >
          Go to Points
        </button>
      )}
    </div>
  );
}
