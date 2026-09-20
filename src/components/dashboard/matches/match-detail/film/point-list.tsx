"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { Bookmark, X } from "lucide-react";

import type { MatchPoint } from "@/lib/data/match-points-server";
import type { Workspace } from "@/lib/workspace/types";
import type { MatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { WorkspaceMark } from "@/components/dashboard/workspace-mark";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { cn } from "@/lib/utils";

import { filmProgressWidth } from "./film-clock";
import { FilmAdvancedPanel } from "./film-advanced-panel";
import { FilmQuickFilters } from "./film-quick-filters";
import type { FilmSectionId } from "./filters/types";
import { scoreColumns, youFirstScore } from "./film-score";
import {
  DEFAULT_FILM_FILTERS,
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
  /** The applied cut: what actually renders, and the count's numerator. */
  visiblePoints: MatchPoint[];
  filters: FilmFilters;
  onFiltersChange: (filters: FilmFilters) => void;
  /** Advanced takes this column; the state is the film tab's, so it and the
   *  open sections survive the list re-rendering. */
  advancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
  openSections: FilmSectionId[];
  onOpenSectionsChange: (next: FilmSectionId[]) => void;
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

/**
 * Memoized, because the playhead re-renders the tab about four times a second
 * and none of this list's props move at that rate: the point arrays are
 * memoized upstream, the callbacks are stable, and `activePointId` changes
 * only when the film crosses into another point — roughly once every ten
 * seconds. Without the memo every tick re-allocates a row element per point
 * and re-renders each game header, whose subtrees are inline and so cannot
 * bail out on their own; `PointRow`'s own memo stops the row bodies but not
 * the work of offering them.
 */
export const PointList = memo(function PointList({
  allPoints,
  visiblePoints,
  filters,
  onFiltersChange,
  advancedOpen,
  onAdvancedOpenChange,
  openSections,
  onOpenSectionsChange,
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

  const clearAll = () => onFiltersChange(DEFAULT_FILM_FILTERS);

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
      {advancedOpen ? (
        // Advanced takes the list's own column, inside this same card: Apply
        // commits the draft and returns to the list, Close returns without
        // touching the cut. No popover, no overlay.
        <FilmAdvancedPanel
          points={allPoints}
          sides={sides}
          filters={filters}
          onApply={(next) => {
            onFiltersChange(next);
            onAdvancedOpenChange(false);
          }}
          onClose={() => onAdvancedOpenChange(false)}
          openSections={openSections}
          onOpenSectionsChange={onOpenSectionsChange}
        />
      ) : (
        <>
          {/* The header IS the applied-filter strip (handoff P1/P2, frame E):
          one 28px trigger naming the cut, a 22px clear beside it once a cut
          is on, and `matched / total` on the right. No Saved pill, no chips
          row, no second strip anywhere in the column — the words and the
          count are the only report of what is applied.

          It sits OUTSIDE the scroller and outside the zero-state branch
          below, so the frame the column always has stays drawn while the
          rows are empty (P5: furniture, never a skeleton). */}
          <div className="mx-1 flex items-center gap-1.5 border-b border-[var(--border-hairline)] pt-1 pb-2.5">
            {/* The quick menu owns the trigger; `tone="light"` is the in-shell
            set of tokens, and its Advanced row swaps the panel into this
            column. */}
            <FilmQuickFilters
              filters={filters}
              onFiltersChange={onFiltersChange}
              sides={sides}
              tone="light"
              onOpenAdvanced={() => onAdvancedOpenChange(true)}
            />

            {/* One control clears every axis at once, Advanced included. Drawn
            only while something is applied, so the resting header is the
            trigger and the count and nothing else. */}
            {filtered && (
              <button
                type="button"
                onClick={clearAll}
                aria-label="Clear the cut"
                className="inline-flex h-[22px] w-[22px] shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-cell)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              >
                <X
                  className="h-3 w-3 text-[var(--ink-500)]"
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
              </button>
            )}

            <div className="flex-1" />

            {/* Always both numbers. A count that dropped its denominator once the
            cut emptied the list would leave the zero states saying nothing
            about how much film they are hiding. */}
            <span className="mono tabular pr-2 text-[10px] whitespace-nowrap text-[var(--ink-400)]">
              {visiblePoints.length}{" "}
              <span style={{ color: "var(--ink-300)" }}>/</span>{" "}
              {allPoints.length}
            </span>
          </div>

          {groups.length === 0 ? (
            <EmptyList
              filters={filters}
              sides={sides}
              hasAnyPoints={allPoints.length > 0}
              hasAnySaved={allPoints.some((p) => p.saved)}
              onClear={clearAll}
            />
          ) : (
            // The one scroller in the card: the header stays put while the rows
            // scroll, the way the room's panel scrolls its list under a fixed
            // header.
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
                        initials={
                          isYou ? sides.you.initials : sides.opp.initials
                        }
                        workspace={workspace}
                        showPointScore={showPointScore}
                        isActive={point.id === activePointId}
                        activeStart={
                          point.id === activePointId ? activeStart : 0
                        }
                        activeEnd={point.id === activePointId ? activeEnd : 0}
                        onSelect={onSelect}
                        onToggleSaved={onToggleSaved}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
});

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
      role={seekable ? "button" : undefined}
      tabIndex={seekable ? 0 : undefined}
      // Which row the playhead is in, in the DOM rather than only in a class
      // name. A credential refresh that corrects the alignment has to move the
      // SELECTION and not just the playhead, and a background wash is not
      // something a test can assert on without pinning a token's value.
      data-point-id={point.id}
      data-playing={isActive ? "true" : undefined}
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

/* ── Empty states ─────────────────────────────────────────── */

/**
 * The three zero states of handoff P5, and only three — each a different
 * condition with a different answer, never each other's:
 *
 * - a film with no point data is a permanent statement about the recording;
 * - "Saved only" with nothing saved is a gesture that has not been used yet,
 *   so it teaches the gesture rather than reporting a filter result;
 * - any other cut that matches nothing is a FILTER result, which states the
 *   cut in words so the body and the header's count agree.
 *
 * Left-aligned and top-weighted, matching the frame: no icon circle, no
 * skeleton rows, no sample point. The header above stays drawn in all three.
 * "Analysis still running" is deliberately absent — `matches/[matchId]/page.tsx`
 * short-circuits the whole pane to `MatchAnalysisProgress` while a match is
 * analysing, so this list can never be in that state.
 */
function EmptyList({
  filters,
  sides,
  hasAnyPoints,
  hasAnySaved,
  onClear,
}: {
  filters: FilmFilters;
  sides: MatchSides;
  hasAnyPoints: boolean;
  hasAnySaved: boolean;
  onClear: () => void;
}) {
  // Nothing was detected in the film at all. No action: there is no
  // "Recording requirements" destination in the product to send anyone to,
  // and a button that goes nowhere is worse than a plain statement.
  if (!hasAnyPoints) {
    return (
      <EmptyBody
        title="No points were detected in this film"
        body="The recording plays, but nothing in it could be broken into points. Camera placement is the usual reason."
      />
    );
  }

  // Saved only, and the match has no saved point at all — not a cut that hid
  // them, which is the branch below. Teaches the gesture once, here.
  if (filters.savedOnly && !hasAnySaved) {
    return (
      <EmptyBody
        title="You haven’t saved a point yet"
        body="Hover a point and press the bookmark, or press S while it plays."
        action="Show all points"
        onAction={onClear}
      />
    );
  }

  // Every other applied cut. The body states the cut rather than a generic
  // sentence, so it can never say "too narrow" about a cut the viewer can
  // read differently from what is actually applied.
  return (
    <EmptyBody
      title="No points match this cut"
      body={`Nothing in this match matched this cut — ${describeFilmCut(filters, sides)}.`}
      action="Clear the cut"
      onAction={onClear}
    />
  );
}

function EmptyBody({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col gap-[7px] px-3 pt-[22px] pb-5">
      <span className="text-[13px] text-[var(--ink-900)]">{title}</span>
      <span
        className="max-w-[40ch] text-[11px] leading-[1.55]"
        style={{ color: "var(--ink-500)" }}
      >
        {body}
      </span>
      {action && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-[3px] w-fit cursor-pointer text-[11px] font-medium text-[var(--blue)]"
        >
          {action}
        </button>
      )}
    </div>
  );
}
