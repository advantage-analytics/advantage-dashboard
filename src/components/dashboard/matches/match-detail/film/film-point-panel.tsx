"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, PanelRightClose } from "lucide-react";

import type { MatchPoint } from "@/lib/data/match-points-server";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { cn } from "@/lib/utils";

import { FilmAdvancedFiltersDialog } from "./film-advanced-filters-dialog";
import { describeFilmCut, lastNameOf, type FilmFilters } from "./film-filters";
import { FilmQuickFilters } from "./film-quick-filters";
import { filmProgressWidth } from "./film-clock";
import { absolutize, serverFirstScore } from "./film-score";
import { shotLabel, type ShotStop } from "./film-shots";

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
 *
 * ── Shots ───────────────────────────────────────────────────────────────────
 * A third tab, local to the room: the same cut of points, one row per shot,
 * in rally order. It follows the film shot by shot and a row seeks to that
 * stroke. The Points/Saved tab stays shared with the report list, so opening
 * Shots here does not change what the report shows.
 */

export interface FilmPointPanelProps {
  allPoints: MatchPoint[];
  visiblePoints: MatchPoint[];
  filters: FilmFilters;
  onFiltersChange: (filters: FilmFilters) => void;
  tab: "points" | "saved";
  onTabChange: (tab: "points" | "saved") => void;
  activePointId: string | null;
  /** Film-clock window of the playing point; the progress rule reads `--film-t`. */
  activeStart: number;
  activeEnd: number;
  /** `open` slides in; `closing` slides out, then `onExited` unmounts it. */
  state: "open" | "closing";
  onExited: () => void;
  position: { index: number; total: number } | null;
  columns: { hasGameScore: boolean; hasPointScore: boolean };
  onSelect: (point: MatchPoint) => void;
  onToggleSaved: (pointId: string) => void;
  onClose: () => void;
  /** Every timed shot on the film clock. */
  shotStops: ShotStop[];
  activeShotId: string | null;
  onSelectShot: (stop: ShotStop) => void;
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
  activeStart,
  activeEnd,
  state,
  onExited,
  position,
  columns,
  onSelect,
  onToggleSaved,
  onClose,
  shotStops,
  activeShotId,
  onSelectShot,
}: FilmPointPanelProps) {
  const sides = useMatchSides();
  const youIsPlayer1 = sides.you.isPlayer1;
  const youName = sides.you.name;
  const oppName = sides.opp.name;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showShots, setShowShots] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Shots of the points on screen, grouped by point, in film order. Built
  // from the same visible cut so a filter narrows both tabs alike.
  const shotGroups = useMemo(() => {
    const visible = new Set(visiblePoints.map((p) => p.id));
    const out: { point: MatchPoint; stops: ShotStop[] }[] = [];
    for (const stop of shotStops) {
      if (!visible.has(stop.point.id)) continue;
      const last = out[out.length - 1];
      if (last && last.point.id === stop.point.id) last.stops.push(stop);
      else out.push({ point: stop.point, stops: [stop] });
    }
    return out;
  }, [shotStops, visiblePoints]);

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
    if (!listRef.current) return;
    const selector = showShots
      ? activeShotId && `[data-shot-id="${activeShotId}"]`
      : activePointId && `[data-point-id="${activePointId}"]`;
    if (!selector) return;
    listRef.current
      .querySelector<HTMLElement>(selector)
      ?.scrollIntoView({ block: "nearest" });
  }, [activePointId, activeShotId, showShots]);

  return (
    <aside
      aria-label="Point list"
      data-film-chrome=""
      data-state={state}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && state === "closing") onExited();
      }}
      className={cn(
        "absolute inset-y-0 right-0 flex w-[320px] max-w-full flex-col bg-[rgba(13,13,13,0.88)] shadow-[inset_1px_0_0_rgba(255,255,255,0.1)]",
        // In: the room's expo curve, long enough to read as the drawer arriving.
        // Out: shorter and accelerating, so closing never feels like waiting.
        "data-[state=open]:animate-in data-[state=open]:duration-[420ms] data-[state=open]:ease-[var(--ease-out-expo)] data-[state=open]:fade-in-0 motion-safe:data-[state=open]:slide-in-from-right",
        "data-[state=closing]:animate-out data-[state=closing]:duration-[240ms] data-[state=closing]:ease-[cubic-bezier(0.4,0,1,1)] data-[state=closing]:fade-out-0 data-[state=closing]:fill-mode-forwards motion-safe:data-[state=closing]:slide-out-to-right",
      )}
    >
      <div className="flex items-center gap-5 px-4 pt-[13px] shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]">
        <div
          role="tablist"
          aria-label="Point list view"
          className="flex items-center gap-5"
        >
          {(["points", "saved", "shots"] as const).map((value) => {
            const active = showShots ? value === "shots" : value === tab;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  if (value === "shots") {
                    setShowShots(true);
                  } else {
                    setShowShots(false);
                    onTabChange(value);
                  }
                }}
                className={cn(
                  "cursor-pointer px-0.5 pt-0.5 pb-2 text-[11px] font-medium transition-colors duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                  active
                    ? "text-white shadow-[inset_0_-2px_0_var(--blue)]"
                    : "text-white/50 hover:text-white/80",
                )}
              >
                {value === "points"
                  ? "Points"
                  : value === "saved"
                    ? "Saved"
                    : "Shots"}
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
        {showShots ? (
          shotGroups.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-6 py-14 text-center">
              <span className="text-[12px] font-medium text-white/80">
                No shot timeline
              </span>
              <span className="max-w-[240px] text-[11px] text-white/45">
                {visiblePoints.length === 0
                  ? "The current cut is too narrow to leave anything on the film."
                  : "The shots on these points were never timed against the video."}
              </span>
            </div>
          ) : (
            shotGroups.map(({ point, stops }) => {
              const serverIsYou = point.serverIsPlayer1 === youIsPlayer1;
              const score = columns.hasPointScore
                ? serverFirstScore(point.pointScore)
                : null;
              return (
                <div key={point.id} className="flex flex-col">
                  <div className="flex items-center gap-2 px-4 pt-3 pb-[5px]">
                    <span className="mono shrink-0 text-[9px] tracking-[1.4px] text-white/45 uppercase">
                      Point {point.pointNumber}
                    </span>
                    <span className="min-w-0 truncate text-[10px] text-white/55">
                      {point.resultType || "Point"}
                    </span>
                    <div className="flex-1" />
                    <span className="mono tabular shrink-0 text-[10px] text-white/40">
                      {score ? `${score} · ` : ""}
                      {lastNameOf(serverIsYou ? youName : oppName)} serves
                    </span>
                  </div>
                  {stops.map((stop, i) => (
                    <ShotRow
                      key={stop.shot.id}
                      stop={stop}
                      order={i + 1}
                      playerName={lastNameOf(
                        stop.shot.isPlayer1 === youIsPlayer1
                          ? youName
                          : oppName,
                      )}
                      isActive={stop.shot.id === activeShotId}
                      onSelect={onSelectShot}
                    />
                  ))}
                </div>
              );
            })
          )
        ) : groups.length === 0 ? (
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
                      ? serverFirstScore(point.pointScore)
                      : null
                  }
                  isActive={point.id === activePointId}
                  activeStart={point.id === activePointId ? activeStart : 0}
                  activeEnd={point.id === activePointId ? activeEnd : 0}
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

/**
 * Memoized: `timeupdate` re-renders the panel ~4×/s. The progress rule does
 * not depend on those renders — it scales from `--film-t` every frame.
 */
const PanelRow = memo(function PanelRow({
  point,
  score,
  isActive,
  activeStart,
  activeEnd,
  onSelect,
  onToggleSaved,
}: {
  point: MatchPoint;
  score: string | null;
  isActive: boolean;
  activeStart: number;
  activeEnd: number;
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
          style={{ width: filmProgressWidth(activeStart, activeEnd) }}
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

/** One stroke. Memoized for the same reason as `PanelRow`. */
const ShotRow = memo(function ShotRow({
  stop,
  order,
  playerName,
  isActive,
  onSelect,
}: {
  stop: ShotStop;
  /**
   * Position in the rally, 1-based. Not `shotNumber`: the derivation numbers a
   * faulted first serve 0, which reads as a typo in a list.
   */
  order: number;
  playerName: string;
  isActive: boolean;
  onSelect: (stop: ShotStop) => void;
}) {
  const { shot } = stop;
  const detail = [
    playerName,
    shot.zone,
    shot.result && shot.result !== "In" ? shot.result : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const label = shotLabel(shot);

  return (
    <button
      type="button"
      data-shot-id={shot.id}
      aria-current={isActive ? "true" : undefined}
      aria-label={`${label}, ${detail} — jump to this shot`}
      onClick={() => onSelect(stop)}
      className={cn(
        "relative flex h-9 w-full cursor-pointer items-center gap-2.5 px-4 text-left transition-colors duration-200 hover:bg-white/[0.06] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        isActive && "bg-white/[0.09]",
      )}
    >
      <span className="mono tabular w-4 shrink-0 text-right text-[10px] text-white/35">
        {order}
      </span>
      <span className="flex min-w-0 flex-col">
        <span
          className={cn(
            "truncate text-[11px] font-medium",
            isActive ? "text-white" : "text-white/[0.88]",
          )}
        >
          {label}
        </span>
        <span className="truncate text-[10px] text-white/45">{detail}</span>
      </span>
      <div className="flex-1" />
      {shot.speedMph != null && (
        <span
          className={cn(
            "mono tabular shrink-0 text-[11px]",
            isActive ? "text-white" : "text-white/60",
          )}
        >
          {Math.round(shot.speedMph)} mph
        </span>
      )}
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-0.5 bg-[var(--blue)]"
          style={{ width: filmProgressWidth(stop.start, stop.end) }}
        />
      )}
    </button>
  );
});
