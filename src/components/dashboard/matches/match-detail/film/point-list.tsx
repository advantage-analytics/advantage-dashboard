"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Filter, SlidersHorizontal } from "lucide-react";

import type { MatchPoint } from "@/lib/data/match-points-server";
import type { Workspace } from "@/lib/workspace/types";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { WorkspaceMark } from "@/components/dashboard/workspace-mark";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { filmProgressWidth } from "./film-clock";
import { scoreColumns, youFirstScore } from "./film-score";
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
 * Rows are grouped by GAME and headed the way the fullscreen room's panel
 * heads them (`film-point-panel.tsx`): "SET 3 · GAME 7" on the left, the
 * you-first game score and "Reid serves" on the right. Two things about that
 * header are load-bearing:
 *
 * - the server's name comes from `serverIsPlayer1` resolved through
 *   `useMatchSides()`, never from player order;
 * - `gameScore` and `pointScore` are written SERVER-FIRST by the parser
 *   (`process-match/index.ts`: `serverIsPlayer1 ? host-guest : guest-host`).
 *   The header's game score is read you-first through `youFirstScore`, which
 *   absolutizes on the server first and orients on the viewer second; the
 *   row's point score stays server-first, as the umpire calls it.
 *
 * The decisive-player mark is `point.player` — the player who hit the last
 * shot: the workspace's mark (profile photo on personal, crest on a team)
 * when that is the viewer, an initials chip on `--surface-subtle` when it is
 * not. Initials come from `sides`, so a two-letter chip is never a hardcoded
 * artboard string. The row's hover, the score sliding aside for the bookmark,
 * is the room's (handoff F3) in the light treatment.
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
  /** Film-clock window of the playing point; its rule reads `--film-t`. */
  activeStart: number;
  activeEnd: number;
  /** Stable identity, please — `PointRow` is memoized on it. */
  onSelect: (point: MatchPoint) => void;
  onToggleSaved: (pointId: string) => void;
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

export function PointList({
  allPoints,
  visiblePoints,
  filteredCount,
  filters,
  onFiltersChange,
  tab,
  onTabChange,
  activePointId,
  activeStart,
  activeEnd,
  onSelect,
  onToggleSaved,
}: PointListProps) {
  const sides = useMatchSides();
  // The viewer's rows lead with the workspace's own mark — the profile photo
  // on personal, the program's crest on a team — so a point you decided reads
  // as yours at a glance; the opponent's rows keep their initials.
  const { active: workspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilmFilters>(filters);

  const filtered = hasActiveFilmFilters(filters);

  // `useMatchSides()` returns a fresh object each render, so the memo keys off
  // the three primitives it actually reads rather than the object identity.
  const youIsPlayer1 = sides.you.isPlayer1;
  const youName = sides.you.name;
  const oppName = sides.opp.name;

  const { hasGameScore: showGameScore, hasPointScore: showPointScore } =
    useMemo(() => scoreColumns(allPoints), [allPoints]);

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
          // You-first for a header under the viewer's name, the way the room
          // reads it; null when the match has no real game score column.
          gameScore: showGameScore
            ? youFirstScore(
                point.gameScore,
                point.serverIsPlayer1,
                youIsPlayer1,
              )
            : null,
          points: [],
        };
        out.push(current);
      }
      current.points.push(point);
    }

    return out;
  }, [visiblePoints, youIsPlayer1, youName, oppName, showGameScore]);

  const clearAll = () => {
    setDraft(DEFAULT_FILM_FILTERS);
    onFiltersChange(DEFAULT_FILM_FILTERS);
  };

  // Keep the playing row in view as the film moves on, without fighting a
  // user who is scrolling the list themselves — the room's rule. Scrolls
  // the list ONLY, never the pane: `scrollIntoView` would walk every
  // ancestor.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!list || !activePointId) return;
    const row = list.querySelector<HTMLElement>(
      `[data-point-id="${activePointId}"]`,
    );
    if (!row) return;
    const listBox = list.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    if (rowBox.top < listBox.top) {
      list.scrollTop += rowBox.top - listBox.top;
    } else if (rowBox.bottom > listBox.bottom) {
      list.scrollTop += rowBox.bottom - listBox.bottom;
    }
  }, [activePointId]);

  return (
    <section
      aria-label="Point list"
      // `max-h-full min-h-0`: the card never runs past the column the film
      // tab gives it — the rows scroll inside it (below) — but a short cut
      // stays a short card rather than stretching to the column's height.
      className="surface-card flex max-h-full min-h-0 flex-col"
      style={{ padding: "10px 8px" }}
    >
      {/* Points / Saved + the filter trigger. The view switcher is the
          design system's status-pill row (design canvas "Video A3"): 26px
          hairline pills, the chosen one on the surface-subtle wash — a fixed
          two-view switcher, not a filter, so no counts on it. */}
      <div className="flex items-center gap-5 border-b border-[var(--border-hairline)] px-3 pt-1 pb-2.5">
        <div
          role="tablist"
          aria-label="Point list view"
          className="flex items-center gap-1.5"
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
                  "inline-flex h-[26px] cursor-pointer items-center rounded-[var(--radius-pill)] border px-[11px] text-[12px] transition-colors duration-200",
                  active
                    ? "border-[var(--surface-subtle)] bg-[var(--surface-subtle)] font-medium text-[var(--ink-900)]"
                    : "border-[var(--border-field)] text-[var(--ink-700)] hover:bg-[var(--surface-subtle)]",
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
              className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-2.5 text-[11px] font-medium text-[var(--ink-900)]"
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

      {/* Applied cut, stated in words — never chips. Drawn only while a
          filter narrows the list; the unfiltered list needs no strip. */}
      {filtered && (
        <div className="mx-3 mt-2.5 mb-1 flex items-center gap-2 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-2.5 py-2">
          <Filter
            className="h-[13px] w-[13px] shrink-0 text-[var(--ink-500)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="min-w-0 truncate text-[11px] text-[var(--ink-700)]">
            {describeFilmCut(filters, sides)} ·{" "}
            <span className="tabular">{filteredCount}</span> of{" "}
            <span className="tabular">{allPoints.length}</span>
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={clearAll}
            className="cursor-pointer text-[11px] font-medium whitespace-nowrap text-[var(--blue)]"
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
        // The one scroller in the card: the header, the cut strip and the
        // tabs stay put while the rows scroll, the way the room's panel
        // scrolls its list under a fixed tab row.
        <div
          ref={listRef}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
          {groups.map((group) => (
            <div key={group.key} className="flex flex-col">
              {/* The room's game header (film-point-panel.tsx), in the light
                  treatment: "SET 1 · GAME 3" in tracked mono on the left, the
                  you-first game score and the server on the right. No rule
                  under it — the rows' own spacing separates the games. */}
              <div className="flex items-center px-3 pt-3 pb-[5px]">
                <span className="mono text-[9px] tracking-[1.4px] text-[var(--ink-400)] uppercase">
                  Set {group.setNumber} · Game {group.gameNumber}
                </span>
                <div className="flex-1" />
                <span className="mono tabular text-[10px] text-[var(--ink-400)]">
                  {group.gameScore ? `${group.gameScore} · ` : ""}
                  {group.serverName} serves
                </span>
              </div>

              {group.points.map((point) => {
                const isYou = (point.player === "player1") === youIsPlayer1;
                return (
                  <PointRow
                    key={point.id}
                    point={point}
                    isYou={isYou}
                    initials={isYou ? sides.you.initials : sides.opp.initials}
                    workspace={workspace}
                    showPointScore={showPointScore}
                    isActive={point.id === activePointId}
                    activeStart={point.id === activePointId ? activeStart : 0}
                    activeEnd={point.id === activePointId ? activeEnd : 0}
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
export const PointRow = memo(function PointRow({
  point,
  isYou,
  initials,
  workspace,
  showPointScore,
  isActive,
  activeStart,
  activeEnd,
  onSelect,
  onToggleSaved,
}: {
  point: MatchPoint;
  isYou: boolean;
  initials: string;
  /** The active workspace, whose mark leads the viewer's own rows. */
  workspace: Pick<Workspace, "kind" | "mark" | "iconUrl">;
  showPointScore: boolean;
  isActive: boolean;
  activeStart: number;
  activeEnd: number;
  onSelect: (point: MatchPoint) => void;
  onToggleSaved: (pointId: string) => void;
}) {
  // A point with no `videoTime` has nowhere to seek to. It still reads, it
  // just cannot be clicked — imports predating video timing are full of them.
  const seekable = point.videoTime != null;

  return (
    <div
      data-point-id={point.id}
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
        // The room's row hover (film-point-panel.tsx, handoff F3), in the
        // light treatment: the wash fades in, the score slides 26px left and
        // the bookmark fades in where it was — one motion vocabulary for the
        // same row in the tab and in the room.
        "group/row relative flex min-h-[52px] items-center gap-3 rounded-[var(--radius-element)] px-3 py-1.5 transition-colors duration-200",
        seekable
          ? "cursor-pointer hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          : "cursor-default opacity-45",
        isActive && "bg-[var(--surface-subtle)]",
      )}
    >
      <span className="inline-flex shrink-0 basis-[34px] items-center justify-center">
        {isYou ? (
          <WorkspaceMark
            workspace={workspace}
            className="size-[30px] rounded-[var(--radius-button)] text-[11px] tracking-[0.3px]"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-subtle)] text-[11px] font-medium tracking-[0.3px] text-[var(--ink-700)]"
          >
            {initials}
          </span>
        )}
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
          // The room's row (film-point-panel.tsx `PanelRow`): the score slides
          // 26px left on hover to make room for the bookmark fading in over
          // the row's right edge — same distance, same 200ms, every row.
          className={cn(
            "text-scoreboard-sm tabular inline-block min-w-[52px] text-right transition-transform duration-200 ease-[var(--ease-primary)]",
            // A saved point's bookmark stays lit, so its score stays aside
            // for it rather than sliding back under it when the hover ends.
            point.saved
              ? "-translate-x-[26px]"
              : "motion-safe:group-focus-within/row:-translate-x-[26px] motion-safe:group-hover/row:-translate-x-[26px]",
          )}
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
          "absolute right-3 inline-flex cursor-pointer items-center justify-center rounded-[var(--radius-cell)] p-0.5 transition-opacity duration-200 focus-visible:opacity-100 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
          // The room's row: the bookmark sits over the row's right edge and
          // fades in as the score slides aside; a saved point's stays lit.
          point.saved
            ? "opacity-100"
            : "opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100",
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

      {/* The playing row's rule, as the room draws it (`PanelRow`): a bare
          2px blue line growing from the row's left edge across its full
          width as the point plays — no grey track under it. */}
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
