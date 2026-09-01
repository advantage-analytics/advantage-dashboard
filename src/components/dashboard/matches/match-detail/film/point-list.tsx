"use client";

import { memo, useMemo, useState } from "react";
import { Bookmark, Filter, SlidersHorizontal } from "lucide-react";

import type { MatchPoint } from "@/lib/data/match-points-server";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  DEFAULT_FILM_FILTERS,
  FilmFiltersPanel,
  describeFilmCut,
  hasActiveFilmFilters,
  lastNameOf,
  type FilmFilters,
} from "./film-filters";

/**
 * The Film room's point list (artboard 46c, lines 845–1131).
 *
 * Rows are grouped by GAME and headed "Set 3 · Reid serving" with the game
 * score on the right, exactly as the artboard draws it. Two things about that
 * header are load-bearing:
 *
 * - the server's name comes from `serverIsPlayer1` resolved through
 *   `useMatchSides()`, never from player order;
 * - `gameScore` and `pointScore` are written SERVER-FIRST by the parser
 *   (`process-match/index.ts`: `serverIsPlayer1 ? host-guest : guest-host`),
 *   so the header naming the server is what makes the chip readable. Nothing
 *   here re-orients them, because re-orienting one without the other is how a
 *   score ends up describing the wrong player.
 *
 * The decisive-player chip is `point.player` — the player who hit the last
 * shot — coloured `--viz-you` when that is the viewer and `--surface-subtle`
 * when it is not. Initials come from `sides`, so a two-letter chip is never a
 * hardcoded artboard string.
 */

interface PointListProps {
  /** Every point on the match — the filter universe and the denominator. */
  allPoints: MatchPoint[];
  /** The applied cut, tab-scoped: what actually renders. */
  visiblePoints: MatchPoint[];
  /** Size of the applied cut before the Points/Saved split. */
  filteredCount: number;
  filters: FilmFilters;
  onFiltersChange: (filters: FilmFilters) => void;
  tab: "points" | "saved";
  onTabChange: (tab: "points" | "saved") => void;
  /** Point whose window contains the playhead, and how far through it is. */
  activePointId: string | null;
  activeProgress: number;
  /** Stable identity, please — `PointRow` is memoized on it. */
  onSelect: (point: MatchPoint) => void;
  onToggleSaved: (pointId: string) => void;
}

interface GameGroup {
  key: string;
  setNumber: number;
  gameNumber: number;
  serverName: string;
  gameScore: string;
  points: MatchPoint[];
}

/**
 * Whether a score column is real on this match.
 *
 * `match-points-server.ts` coerces a null `point_score`/`game_score` to
 * "0-0", and the Advantage Intelligence derivation writes neither: all 114
 * points of the analysed match carry NULL for both, checked against the live
 * table. Printing "0-0" on every row of that match would be a fabricated
 * score in the one column a player reads as fact, so when a column is "0-0"
 * from end to end there is nothing behind it and it does not render. A real
 * match escapes the test on its second game, which is never 0-0 games.
 */
function columnHasValues(
  points: MatchPoint[],
  read: (point: MatchPoint) => string,
): boolean {
  return points.length > 0 && points.some((point) => read(point) !== "0-0");
}

export function PointList({
  allPoints,
  visiblePoints,
  filteredCount,
  filters,
  onFiltersChange,
  tab,
  onTabChange,
  activePointId,
  activeProgress,
  onSelect,
  onToggleSaved,
}: PointListProps) {
  const sides = useMatchSides();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilmFilters>(filters);

  const filtered = hasActiveFilmFilters(filters);

  // `useMatchSides()` returns a fresh object each render, so the memo keys off
  // the three primitives it actually reads rather than the object identity.
  const youIsPlayer1 = sides.you.isPlayer1;
  const youName = sides.you.name;
  const oppName = sides.opp.name;

  const showGameScore = useMemo(
    () => columnHasValues(allPoints, (p) => p.gameScore),
    [allPoints],
  );
  const showPointScore = useMemo(
    () => columnHasValues(allPoints, (p) => p.pointScore),
    [allPoints],
  );

  // Grouped on `gameNumber`, not on the game score: the score is the label,
  // and on a match that has none every group would collapse into one.
  const groups = useMemo(() => {
    const out: GameGroup[] = [];
    let current: GameGroup | undefined;

    for (const point of visiblePoints) {
      const serverIsYou = point.serverIsPlayer1 === youIsPlayer1;
      if (
        !current ||
        current.setNumber !== point.setNumber ||
        current.gameNumber !== point.gameNumber
      ) {
        current = {
          key: `${point.setNumber}-${point.gameNumber}-${point.id}`,
          setNumber: point.setNumber,
          gameNumber: point.gameNumber,
          serverName: lastNameOf(serverIsYou ? youName : oppName),
          gameScore: point.gameScore,
          points: [],
        };
        out.push(current);
      }
      current.points.push(point);
    }

    return out;
  }, [visiblePoints, youIsPlayer1, youName, oppName]);

  const clearAll = () => {
    setDraft(DEFAULT_FILM_FILTERS);
    onFiltersChange(DEFAULT_FILM_FILTERS);
  };

  return (
    <section
      aria-label="Point list"
      className="surface-card flex flex-col"
      style={{ padding: "10px 8px" }}
    >
      {/* Points / Saved + the filter trigger */}
      <div className="flex items-center gap-5 border-b border-[var(--border-hairline)] px-3 pt-1">
        <div role="tablist" aria-label="Point list view" className="flex items-center gap-5">
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
                  "cursor-pointer px-0.5 pt-1.5 pb-2 text-[11px] font-medium",
                  active
                    ? "text-[var(--ink-900)] shadow-[inset_0_-2px_0_var(--blue)]"
                    : "text-[var(--ink-500)] hover:text-[var(--ink-700)]",
                )}
              >
                {value === "points" ? "Points" : "Saved"}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        <Popover
          open={open}
          onOpenChange={(next) => {
            // Opening seeds the draft from what is applied, so an abandoned
            // popover leaves nothing behind.
            if (next) setDraft(filters);
            setOpen(next);
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className="mb-1.5 inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-2.5 text-[11px] font-medium text-[var(--ink-900)]"
            >
              <SlidersHorizontal
                className="h-[13px] w-[13px]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              Filters
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-[312px] rounded-[var(--radius-dropdown)] border-[var(--border-hairline)] bg-[var(--surface-card)] p-0 shadow-[var(--shadow-dropdown)]"
          >
            <FilmFiltersPanel
              points={allPoints}
              sides={sides}
              draft={draft}
              onDraftChange={setDraft}
              onApply={() => {
                onFiltersChange(draft);
                setOpen(false);
              }}
              onClearAll={clearAll}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Applied cut, stated in words — never chips. */}
      {filtered && (
        <div className="mx-3 mt-2.5 mb-1 flex items-center gap-2 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-2.5 py-2">
          <Filter
            className="h-[13px] w-[13px] shrink-0 text-[var(--ink-500)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="text-[11px] text-[var(--ink-700)]">
            {describeFilmCut(filters, sides)} ·{" "}
            <span className="tabular">{filteredCount}</span> of{" "}
            <span className="tabular">{allPoints.length}</span>
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={clearAll}
            className="cursor-pointer whitespace-nowrap text-[11px] font-medium text-[var(--blue)]"
          >
            Clear filter
          </button>
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyList
          tab={tab}
          filtered={filtered}
          hasAnyPoints={allPoints.length > 0}
          hasAnySaved={allPoints.some((p) => p.saved)}
          onClear={clearAll}
          onGoToPoints={() => onTabChange("points")}
        />
      ) : (
        <div className="flex flex-col">
          {groups.map((group) => (
            <div key={group.key} className="flex flex-col">
              <div className="mb-1 flex items-center gap-2.5 border-b border-[var(--border-hairline)] px-3 pt-3.5 pb-2">
                <span className="inline-flex items-baseline gap-[5px]">
                  <span className="text-[10px] font-medium tracking-[1.2px] text-[var(--ink-400)] uppercase">
                    Set {group.setNumber} ·
                  </span>
                  <span className="text-[10px] font-medium tracking-[1.2px] text-[var(--ink-600)] uppercase">
                    {group.serverName} serving
                  </span>
                </span>
                <div className="flex-1" />
                {showGameScore && (
                  <span className="inline-flex items-baseline rounded-[var(--radius-cell)] bg-[var(--surface-subtle)] px-2 py-0.5">
                    <span
                      className="text-scoreboard-sm tabular"
                      style={{ fontSize: "13px", color: "var(--ink-900)" }}
                    >
                      {group.gameScore}
                    </span>
                  </span>
                )}
              </div>

              {group.points.map((point) => {
                const isYou = (point.player === "player1") === youIsPlayer1;
                return (
                  <PointRow
                    key={point.id}
                    point={point}
                    isYou={isYou}
                    initials={isYou ? sides.you.initials : sides.opp.initials}
                    showPointScore={showPointScore}
                    isActive={point.id === activePointId}
                    progress={point.id === activePointId ? activeProgress : 0}
                    onSelect={onSelect}
                    onToggleSaved={onToggleSaved}
                  />
                );
              })}
            </div>
          ))}

          {/* The artboard's trailing "All N points". The list is never
              paginated — every point in the cut is already above — so the
              link is only meaningful as a way back out of the cut. */}
          {filtered && (
            <button
              type="button"
              onClick={clearAll}
              className="w-fit cursor-pointer px-3 pt-3 pb-1.5 text-[11px] font-medium text-[var(--blue)]"
            >
              All {allPoints.length} points
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/* ── Row ────────────────────────────────────────────────────────────────── */

/**
 * Memoized on purpose: `timeupdate` moves the playhead about four times a
 * second, and without this every row on a 174-point match re-renders each
 * tick. With it, only the row entering and the row leaving the playing state
 * do — which is why the callbacks arrive already-stable rather than as inline
 * arrows closing over the row's own point.
 */
const PointRow = memo(function PointRow({
  point,
  isYou,
  initials,
  showPointScore,
  isActive,
  progress,
  onSelect,
  onToggleSaved,
}: {
  point: MatchPoint;
  isYou: boolean;
  initials: string;
  showPointScore: boolean;
  isActive: boolean;
  progress: number;
  onSelect: (point: MatchPoint) => void;
  onToggleSaved: (pointId: string) => void;
}) {
  // A point with no `videoTime` has nowhere to seek to. It still reads, it
  // just cannot be clicked — imports predating video timing are full of them.
  const seekable = point.videoTime != null;

  return (
    <div
      role={seekable ? "button" : undefined}
      tabIndex={seekable ? 0 : undefined}
      aria-label={
        seekable ? `${point.resultType} — jump to this point` : undefined
      }
      onClick={() => {
        if (seekable) onSelect(point);
      }}
      onKeyDown={(e) => {
        if (seekable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect(point);
        }
      }}
      className={cn(
        "group/row relative flex min-h-[52px] items-center gap-3 rounded-[var(--radius-element)] px-3 py-1.5",
        seekable
          ? "cursor-pointer hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          : "cursor-default opacity-45",
        isActive && "bg-[var(--surface-subtle)]",
      )}
    >
      <span className="inline-flex shrink-0 basis-[34px] items-center justify-center">
        <span
          className={cn(
            "flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius-button)] text-[11px] font-medium tracking-[0.3px]",
            isYou
              ? "bg-[var(--viz-you)] text-white"
              : "bg-[var(--surface-subtle)] text-[var(--ink-700)]",
          )}
        >
          {initials}
        </span>
      </span>

      <span className="flex min-w-0 flex-col gap-px">
        <span className="truncate text-[12px] text-[var(--ink-900)]">
          {point.resultType || "Point"}
        </span>
        <span className="text-micro truncate">{point.description}</span>
      </span>

      <div className="flex-1" />

      {showPointScore && (
        <span
          className="text-scoreboard-sm tabular min-w-[52px] text-right"
          style={{ fontSize: "13px", color: "var(--ink-900)" }}
        >
          {point.pointScore}
        </span>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSaved(point.id);
        }}
        aria-label={point.saved ? "Remove bookmark" : "Bookmark this point"}
        aria-pressed={point.saved}
        className={cn(
          "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-cell)] p-0.5 focus-visible:opacity-100 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
          point.saved
            ? "opacity-100"
            : "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100",
        )}
      >
        <Bookmark
          className="h-[13px] w-[13px]"
          strokeWidth={1.6}
          style={{
            color: point.saved ? "var(--blue)" : "var(--ink-400)",
            fill: point.saved ? "var(--blue)" : "none",
          }}
          aria-hidden="true"
        />
      </button>

      {isActive && (
        <span
          aria-hidden="true"
          className="absolute inset-x-3 bottom-0 h-0.5 overflow-hidden rounded-[1px] bg-[var(--ink-100)]"
        >
          <span
            className="block h-0.5 rounded-[1px] bg-[var(--blue)]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </span>
      )}
    </div>
  );
});

/* ── Empty states ───────────────────────────────────────────────────────── */

function EmptyList({
  tab,
  filtered,
  hasAnyPoints,
  hasAnySaved,
  onClear,
  onGoToPoints,
}: {
  tab: "points" | "saved";
  filtered: boolean;
  hasAnyPoints: boolean;
  hasAnySaved: boolean;
  onClear: () => void;
  onGoToPoints: () => void;
}) {
  if (tab === "saved") {
    // A player with real bookmarks can still land here if the active film
    // filter happens to exclude every one of them — that reads as "you have
    // no bookmarks" unless the copy says otherwise and offers the same
    // recovery the Points tab's filtered-empty state does.
    const hiddenByFilter = filtered && hasAnySaved;
    return (
      <div className="flex flex-col items-center gap-1 px-6 py-14 text-center">
        <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-subtle)]">
          <Bookmark
            className="h-4 w-4 text-[var(--ink-400)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </span>
        <span className="text-[12px] font-medium text-[var(--ink-700)]">
          {hiddenByFilter ? "No bookmarks match" : "Nothing bookmarked yet"}
        </span>
        <span
          className="text-micro max-w-[240px]"
          style={{ color: "var(--ink-500)" }}
        >
          {hiddenByFilter
            ? "The current cut hides every point you bookmarked."
            : "Hover a point on the Points tab and press the bookmark to keep it here."}
        </span>
        <button
          type="button"
          onClick={hiddenByFilter ? onClear : onGoToPoints}
          className="mt-3 cursor-pointer text-[11px] font-medium text-[var(--blue)]"
        >
          {hiddenByFilter ? "Clear filter" : "Go to Points"}
        </button>
      </div>
    );
  }

  if (filtered) {
    return (
      <div className="flex flex-col items-center gap-1 px-6 py-14 text-center">
        <span className="text-[12px] font-medium text-[var(--ink-700)]">
          No points match
        </span>
        <span
          className="text-micro max-w-[240px]"
          style={{ color: "var(--ink-500)" }}
        >
          The current cut is too narrow to leave anything on the film.
        </span>
        <button
          type="button"
          onClick={onClear}
          className="mt-3 cursor-pointer text-[11px] font-medium text-[var(--blue)]"
        >
          Clear filter
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1 px-6 py-14 text-center">
      <span className="text-[12px] font-medium text-[var(--ink-700)]">
        {hasAnyPoints ? "No points to show" : "No point timeline on this match"}
      </span>
      <span
        className="text-micro max-w-[260px]"
        style={{ color: "var(--ink-500)" }}
      >
        The film plays, but there is no per-point index to jump through yet.
      </span>
    </div>
  );
}
