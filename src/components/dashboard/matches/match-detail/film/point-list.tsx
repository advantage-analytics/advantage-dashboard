"use client";

import { Fragment, memo, useEffect, useMemo, useRef } from "react";
import { Bookmark, PanelRightClose, X } from "lucide-react";

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
import { shotRowCells, type ShotStop } from "./film-shots";
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
 *
 * ── Two tones, one list ─────────────────────────────────────────────────────
 *
 * `tone="dark"` is the fullscreen room's points drawer (H2 frame R3): the same
 * rows, the same header, the same menu and the same three zero states, painted
 * on the dark scope. It is NOT a second list — every behaviour, every string
 * and every piece of geometry below is shared, and only the paint is looked up
 * per tone through `LIST_TONE` / `ROW_TONE` / `EMPTY_TONE`.
 *
 * Two rules the lookups exist to keep honest:
 *
 * - the light values are the shipped ones, byte for byte; a dark value is
 *   added BESIDE its light twin, never by rewriting it;
 * - on the dark scope the alphas are the frame's literals
 *   (`rgba(255,255,255,…)`), because `--ink-*` / `--surface-*` /
 *   `--border-hairline` are the light scope's tokens and resolve to light
 *   greys over the film. `--blue`, the radii, the easing and the focus ring
 *   are scope-independent and stay tokens in both.
 *
 * The DS type classes (`.text-micro`, `.text-scoreboard-sm`) carry a colour of
 * their own and are unlayered, so a Tailwind colour utility cannot override
 * them. The dark branch therefore spells its own size and sets the colour
 * inline rather than trying to re-paint a DS class.
 *
 * ── The playing point's shots, unfolded in place ────────────────────────────
 *
 * Given `shotStops` / `activeShotId` / `onSelectShot`, the row the playhead is
 * in is followed by a recessed well of that point's shots (H2 frame R3) — and
 * only that point's, so stepping to the next point refolds the last one. It is
 * not a second list and not a tab: the well is a sibling of the row inside the
 * point's own fragment, so it inherits the row's 14px side padding and runs
 * edge to edge under it. Without those props nothing changes, which is how the
 * in-report column (`film-tab.tsx`) keeps the list it has always had.
 */

/** Light is the in-report column; dark is the fullscreen room's drawer. */
export type FilmListTone = "light" | "dark";

/** One frozen empty slice, so "no well" never re-renders a memoized row. */
const NO_STOPS: ShotStop[] = [];

/** The list's chrome: card, header strip, count and game headers. */
const LIST_TONE = {
  light: {
    // `max-h-full min-h-0`: the card never runs past the column the film
    // tab gives it — the rows scroll inside it (below) — but a short cut
    // stays a short card rather than stretching to the column's height.
    root: "surface-card flex max-h-full min-h-0 flex-col",
    rootStyle: { padding: "10px 8px" } as const,
    header:
      "mx-1 flex items-center gap-1.5 border-b border-[var(--border-hairline)] pt-1 pb-2.5",
    clear:
      "inline-flex h-[22px] w-[22px] shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-cell)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
    clearIcon: "h-3 w-3 text-[var(--ink-500)]",
    count:
      "mono tabular pr-2 text-[10px] whitespace-nowrap text-[var(--ink-400)]",
    countSlash: "var(--ink-300)",
    collapse:
      "inline-flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-cell)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
    collapseIcon: "h-3.5 w-3.5 text-[var(--ink-500)]",
    gameHeader: "flex items-center px-3 pt-3 pb-[5px]",
    gameLabel:
      "mono text-[9px] tracking-[1.4px] text-[var(--ink-400)] uppercase",
    gameMeta: "mono tabular text-[10px] text-[var(--ink-400)]",
  },
  dark: {
    // No card: the drawer (R3) draws the 320px surface, its left hairline and
    // its shadow; the list fills it and paints nothing of its own.
    root: "flex max-h-full min-h-0 flex-col",
    rootStyle: undefined,
    // Frame R3's header is `padding:13px 10px 10px` over an inset hairline.
    // `FilmQuickFilters`' dark trigger carries its own `mb-[7px]`, so every
    // sibling below repeats that margin — `items-center` then centres them on
    // the same box — and the header's own bottom padding is the remaining 3px.
    header:
      "flex items-center gap-2 px-2.5 pt-[13px] pb-[3px] shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]",
    clear:
      "mb-[7px] inline-flex h-[22px] w-[22px] shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-cell)] transition-colors duration-200 hover:bg-white/[0.08] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
    clearIcon: "h-3 w-3 text-white/70",
    count: "mono tabular mb-[7px] text-[10px] whitespace-nowrap text-white/45",
    countSlash: "rgba(255,255,255,0.25)",
    collapse:
      "mb-[7px] inline-flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] transition-colors duration-200 hover:bg-white/[0.08] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
    collapseIcon: "h-3.5 w-3.5 text-white/70",
    gameHeader: "flex items-center px-[14px] pt-[13px] pb-[5px]",
    gameLabel: "mono text-[9px] tracking-[1.4px] text-white/45 uppercase",
    gameMeta: "mono tabular text-[10px] text-white/40",
  },
} satisfies Record<FilmListTone, Record<string, unknown>>;

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
  /** Paint only. "dark" is the fullscreen room's drawer (frame R3). */
  tone?: FilmListTone;
  /** Drawn only when given: the drawer's 26px collapse glyph in the header. */
  onCollapse?: () => void;
  /** The whole film's shot feed. Only the playing point's slice is drawn. */
  shotStops?: ShotStop[];
  /** The one shot that is lit, anywhere in the feed. */
  activeShotId?: string | null;
  /** Stable identity, please — the well's rows are memoized on it. */
  onSelectShot?: (stop: ShotStop) => void;
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
  tone = "light",
  onCollapse,
  shotStops,
  activeShotId = null,
  onSelectShot,
}: PointListProps) {
  const t = LIST_TONE[tone];
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
  // Who hit a shot is `shot.isPlayer1` read against the viewer's own side —
  // never player1/player2 order (guardrails §4). Resolved once here so the
  // well's memoized rows take a plain string and re-render on nothing else.
  const youLastName = lastNameOf(youName);
  const oppLastName = lastNameOf(oppName);

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

  // The playing point's shots, and nobody else's: the feed the room hands over
  // covers the whole film, and one open well at a time is the rule — stepping
  // to another point refolds the last one because this slice moves with
  // `activePointId` rather than accumulating.
  const wellStops = useMemo(() => {
    if (!shotStops || !activePointId) return NO_STOPS;
    return shotStops.filter((stop) => stop.point.id === activePointId);
  }, [shotStops, activePointId]);
  // A feed with no handler is a feed nothing can be done with, so it draws
  // nothing: the well's rows are seek targets before they are text.
  const wellOpen = onSelectShot != null && wellStops.length > 0;

  // Keep whatever is lit in view as the film moves on — the playing shot while
  // a well is open, the playing row otherwise — without fighting a user who is
  // scrolling the list themselves.
  //
  // Moves this scroller's own `scrollTop` and nothing else. The DOM's
  // scroll-an-element-into-view method walks every ancestor instead, and while
  // the room's drawer is still off-canvas mid-slide that dragged the whole
  // room — video included — sideways toward the row (`film-point-panel.tsx`
  // hit exactly that).
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const selector =
      wellOpen && activeShotId
        ? `[data-shot-id="${activeShotId}"]`
        : activePointId && `[data-point-id="${activePointId}"]`;
    if (!list || !selector) return;
    const row = list.querySelector<HTMLElement>(selector);
    if (!row) return;
    const listBox = list.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    if (rowBox.top < listBox.top) {
      list.scrollTop += rowBox.top - listBox.top;
    } else if (rowBox.bottom > listBox.bottom) {
      list.scrollTop += rowBox.bottom - listBox.bottom;
    }
  }, [activePointId, activeShotId, wellOpen]);

  return (
    <section aria-label="Point list" className={t.root} style={t.rootStyle}>
      {advancedOpen ? (
        // Advanced takes the list's own column, in this same section and on
        // this same tone (frame R4: never a modal over the film): Apply
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
          tone={tone}
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
          <div className={t.header}>
            {/* The quick menu owns the trigger and already branches on tone —
            `light` is the in-shell set of tokens, `dark` is the room's own
            menu — and its Advanced row swaps the panel into this column in
            both. */}
            <FilmQuickFilters
              filters={filters}
              onFiltersChange={onFiltersChange}
              sides={sides}
              tone={tone}
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
                className={t.clear}
              >
                <X
                  className={t.clearIcon}
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
              </button>
            )}

            <div className="flex-1" />

            {/* Always both numbers. A count that dropped its denominator once the
            cut emptied the list would leave the zero states saying nothing
            about how much film they are hiding. */}
            <span className={t.count}>
              {visiblePoints.length}{" "}
              <span style={{ color: t.countSlash }}>/</span> {allPoints.length}
            </span>

            {/* The drawer's own control (frame R3): a 26px collapse glyph on
            the count's right. It exists only where a host can be collapsed —
            the report column has nowhere to collapse to, so it passes no
            handler and the header ends at the count. */}
            {onCollapse && (
              <button
                type="button"
                onClick={onCollapse}
                aria-label="Collapse point list"
                className={t.collapse}
              >
                <PanelRightClose
                  className={t.collapseIcon}
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
              </button>
            )}
          </div>

          {groups.length === 0 ? (
            <EmptyList
              filters={filters}
              sides={sides}
              hasAnyPoints={allPoints.length > 0}
              hasAnySaved={allPoints.some((p) => p.saved)}
              onClear={clearAll}
              tone={tone}
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
                  {/* The game header: "SET 1 · GAME 3" in tracked mono on the
                  left, the you-first game score and the server on the right.
                  No rule under it — the rows' own spacing separates the games.
                  The same header in both tones; only the inks are looked up. */}
                  <div className={t.gameHeader}>
                    <span className={t.gameLabel}>
                      Set {group.setNumber} · Game {group.gameNumber}
                    </span>
                    <div className="flex-1" />
                    <span className={t.gameMeta}>
                      {group.gameScore ? `${group.gameScore} · ` : ""}
                      {group.serverName} serves
                    </span>
                  </div>

                  {group.points.map((point) => {
                    const isYou = (point.player === "player1") === youIsPlayer1;
                    const isActive = point.id === activePointId;
                    return (
                      // A fragment, not a wrapper: the well is the row's
                      // SIBLING in the game's own column, so it spans the
                      // drawer edge to edge under the row rather than being
                      // boxed beside it. With no well the DOM is the row alone,
                      // exactly as the report column has always drawn it.
                      <Fragment key={point.id}>
                        <PointRow
                          point={point}
                          isYou={isYou}
                          initials={
                            isYou ? sides.you.initials : sides.opp.initials
                          }
                          workspace={workspace}
                          showPointScore={showPointScore}
                          isActive={isActive}
                          activeStart={isActive ? activeStart : 0}
                          activeEnd={isActive ? activeEnd : 0}
                          onSelect={onSelect}
                          onToggleSaved={onToggleSaved}
                          tone={tone}
                        />
                        {isActive && wellOpen && onSelectShot && (
                          <ShotWell
                            stops={wellStops}
                            activeShotId={activeShotId}
                            youIsPlayer1={youIsPlayer1}
                            youLastName={youLastName}
                            oppLastName={oppLastName}
                            onSelectShot={onSelectShot}
                          />
                        )}
                      </Fragment>
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
 * The row's paint, per tone. Geometry is NOT in here — 52px, the 30px mark,
 * the 26px score slide and the 2px `--blue` progress rule are the row itself
 * and are identical in both tones; only the surfaces and the inks differ.
 */
const ROW_TONE = {
  light: {
    // The room's row hover (handoff F3), in the light treatment: the wash
    // fades in, the score slides 26px left and the bookmark fades in where it
    // was — one motion vocabulary for the same row in the tab and in the room.
    root: "group/row relative flex min-h-[52px] items-center gap-3 rounded-[var(--radius-element)] px-3 py-1.5 transition-colors duration-200",
    seekable:
      "cursor-pointer hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
    playing: "bg-[var(--surface-subtle)]",
    mark: "flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-subtle)] text-[11px] font-medium tracking-[0.3px] text-[var(--ink-700)]",
    title: "truncate text-[12px] text-[var(--ink-900)]",
    detail: "text-micro truncate",
    detailStyle: undefined,
    score:
      "text-scoreboard-sm tabular inline-block min-w-[52px] text-right transition-transform duration-200 ease-[var(--ease-primary)]",
    scoreStyle: { fontSize: "13px", color: "var(--ink-900)" } as const,
    save: "absolute right-3 inline-flex cursor-pointer items-center justify-center rounded-[var(--radius-cell)] p-0.5 transition-opacity duration-200 focus-visible:opacity-100 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
    savedInk: "var(--blue)",
    restingInk: "var(--ink-400)",
  },
  dark: {
    // Frame R3: full-bleed rows on the drawer's own 14px side padding, so the
    // T7 shots well can run edge to edge under the playing one. No radius —
    // a rounded row inside a 320px drawer would read as a card.
    root: "group/row relative flex min-h-[52px] items-center gap-3 px-[14px] py-1.5 transition-colors duration-200",
    seekable:
      "cursor-pointer hover:bg-white/[0.06] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
    playing: "bg-white/[0.08]",
    mark: "flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius-button)] bg-white/[0.14] text-[11px] font-medium tracking-[0.3px] text-white/90",
    title: "truncate text-[12px] font-medium text-white",
    // `.text-micro` would win on colour here (unlayered DS class), so the dark
    // detail spells its own 11px and takes the ink inline.
    detail: "truncate text-[11px]",
    detailStyle: { color: "rgba(255,255,255,0.45)" } as const,
    // Same story for `.text-scoreboard-sm`: the room's score is mono, not the
    // scoreboard face, so the dark branch does not borrow the class at all.
    score:
      "mono tabular inline-block min-w-[52px] text-right transition-transform duration-200 ease-[var(--ease-primary)]",
    scoreStyle: { fontSize: "11px", color: "rgba(255,255,255,0.85)" } as const,
    save: "absolute right-[14px] inline-flex cursor-pointer items-center justify-center rounded-[var(--radius-cell)] p-0.5 transition-opacity duration-200 focus-visible:opacity-100 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
    // Saving is the room's one filled glyph (R9) — white, not blue: blue on
    // the dark scope is reserved for the progress rule and the serve dot.
    savedInk: "rgba(255,255,255,1)",
    restingInk: "rgba(255,255,255,0.75)",
  },
} satisfies Record<FilmListTone, Record<string, unknown>>;

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
  tone = "light",
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
  /** Paint only. "dark" is the fullscreen room's drawer (frame R3). */
  tone?: FilmListTone;
}) {
  const t = ROW_TONE[tone];
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
        t.root,
        seekable ? t.seekable : "cursor-default opacity-45",
        isActive && t.playing,
      )}
    >
      <span className="inline-flex shrink-0 basis-[34px] items-center justify-center">
        {/* The viewer's own mark, never the frame's white initials chip
            (phase-1 decision): a point you decided reads as yours at a glance
            on both tones. The opponent keeps initials. */}
        {isYou ? (
          <WorkspaceMark
            workspace={workspace}
            className="size-[30px] rounded-[var(--radius-button)] text-[11px] tracking-[0.3px]"
          />
        ) : (
          <span aria-hidden="true" className={t.mark}>
            {initials}
          </span>
        )}
      </span>

      <span className="flex min-w-0 flex-col gap-px">
        <span className={t.title}>{point.resultType || "Point"}</span>
        <span className={t.detail} style={t.detailStyle}>
          {point.description}
        </span>
      </span>

      <div className="flex-1" />

      {showPointScore && (
        <span
          // The room's row (film-point-panel.tsx `PanelRow`): the score slides
          // 26px left on hover to make room for the bookmark fading in over
          // the row's right edge — same distance, same 200ms, every row.
          className={cn(
            t.score,
            // A saved point's bookmark stays lit, so its score stays aside
            // for it rather than sliding back under it when the hover ends.
            point.saved
              ? "-translate-x-[26px]"
              : "motion-safe:group-focus-within/row:-translate-x-[26px] motion-safe:group-hover/row:-translate-x-[26px]",
          )}
          style={t.scoreStyle}
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
          t.save,
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
            color: point.saved ? t.savedInk : t.restingInk,
            fill: point.saved ? t.savedInk : "none",
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

/* ── The playing point's shots ───────────────────────────────────────────── */

/**
 * The well under the playing row (H2 frame R3).
 *
 * Recessed rather than raised: `rgba(0,0,0,0.28)` behind inset hairlines top
 * and bottom, full-bleed on the row's own 14px side padding, so the shots read
 * as sitting UNDER the point rather than beside it. It is asked for only by the
 * room, where the scope is dark, so there is no light treatment here — a second
 * one would be a treatment nothing mounts.
 *
 * Columns are the phase-1 shot feed narrowed to `# · player · stroke ·
 * placement · result`, and the strings are `shotRowCells`' — the same builder
 * the "Current point" widget prints, so a null speed, zone or result reads the
 * same em dash in both places instead of a locally-invented blank.
 *
 * DEVIATION: the frame draws the player column as a 20px initials chip. The
 * cells come from `shotRowCells`, whose `player` is a name, so this prints the
 * last name. A chip would mean rebuilding that cell locally, and the room
 * already carries two marks per row above.
 */
function ShotWell({
  stops,
  activeShotId,
  youIsPlayer1,
  youLastName,
  oppLastName,
  onSelectShot,
}: {
  stops: ShotStop[];
  activeShotId: string | null;
  youIsPlayer1: boolean;
  youLastName: string;
  oppLastName: string;
  onSelectShot: (stop: ShotStop) => void;
}) {
  return (
    <div className="flex flex-col bg-[rgba(0,0,0,0.28)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(255,255,255,0.06)]">
      {stops.map((stop, i) => (
        <ShotWellRow
          key={stop.shot.id}
          stop={stop}
          order={i + 1}
          playerName={
            stop.shot.isPlayer1 === youIsPlayer1 ? youLastName : oppLastName
          }
          isLit={stop.shot.id === activeShotId}
          onSelect={onSelectShot}
        />
      ))}
    </div>
  );
}

/** 34px, on the point row's own 14px side padding. Frame R3's tracks. */
const SHOT_COLUMNS =
  "grid-cols-[12px_minmax(0,0.75fr)_minmax(0,1fr)_minmax(0,1.25fr)_auto]";

/**
 * One shot, lit or not.
 *
 * Memoized for the same reason `PointRow` is: `timeupdate` re-renders the list
 * about four times a second, and only the shot entering and the shot leaving
 * the lit state should draw. That is also why `onSelect` arrives already
 * stable rather than as an inline arrow closing over this row's stop.
 *
 * Exactly one row is ever lit — the one whose id is `activeShotId` — and the
 * lit wash is a class rather than an inline style so that `hover`, drawn only
 * on the unlit rows, can never repaint it as the pointer crosses the well.
 */
const ShotWellRow = memo(function ShotWellRow({
  stop,
  order,
  playerName,
  isLit,
  onSelect,
}: {
  stop: ShotStop;
  /** 1-based place in the rally. */
  order: number;
  playerName: string;
  isLit: boolean;
  onSelect: (stop: ShotStop) => void;
}) {
  const cells = shotRowCells(stop.shot, order, playerName);

  return (
    <button
      type="button"
      data-shot-id={stop.shot.id}
      aria-current={isLit ? "true" : undefined}
      aria-label={`${cells.order}. ${cells.player} ${cells.stroke}, ${cells.placement}, ${cells.result} — jump to this shot`}
      onClick={() => onSelect(stop)}
      className={cn(
        "grid h-[34px] w-full shrink-0 cursor-pointer items-center gap-x-2 px-[14px] text-left transition-colors duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        SHOT_COLUMNS,
        isLit
          ? "bg-[rgba(255,255,255,0.12)]"
          : "hover:bg-[rgba(255,255,255,0.05)]",
      )}
    >
      <span
        className="mono tabular text-[10px]"
        style={{ color: "rgba(255,255,255,0.35)" }}
      >
        {cells.order}
      </span>
      <span
        className="truncate text-[11px]"
        style={{ color: "rgba(255,255,255,0.5)" }}
      >
        {cells.player}
      </span>
      {/* The one cell that carries the lit state: full white while it plays,
          72% white the rest of the time. */}
      <span
        className="truncate text-[11px] font-medium"
        style={{ color: isLit ? "#FFFFFF" : "rgba(255,255,255,0.72)" }}
      >
        {cells.stroke}
      </span>
      <span
        className="truncate text-[11px]"
        style={{ color: "rgba(255,255,255,0.5)" }}
      >
        {cells.placement}
      </span>
      <span
        className="truncate text-right text-[11px]"
        style={{ color: "rgba(255,255,255,0.5)" }}
      >
        {cells.result}
      </span>
    </button>
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
 *
 * All three are the same three in the drawer, word for word. A cut that empties
 * the list says the same thing wherever it is read; only the paint changes.
 */
function EmptyList({
  filters,
  sides,
  hasAnyPoints,
  hasAnySaved,
  onClear,
  tone,
}: {
  filters: FilmFilters;
  sides: MatchSides;
  hasAnyPoints: boolean;
  hasAnySaved: boolean;
  onClear: () => void;
  tone: FilmListTone;
}) {
  // Nothing was detected in the film at all. No action: there is no
  // "Recording requirements" destination in the product to send anyone to,
  // and a button that goes nowhere is worse than a plain statement.
  if (!hasAnyPoints) {
    return (
      <EmptyBody
        title="No points were detected in this film"
        body="The recording plays, but nothing in it could be broken into points. Camera placement is the usual reason."
        tone={tone}
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
        tone={tone}
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
      tone={tone}
    />
  );
}

/** The zero state's paint, per tone. The copy above is the same in both. */
const EMPTY_TONE = {
  light: {
    root: "flex flex-col gap-[7px] px-3 pt-[22px] pb-5",
    title: "text-[13px] text-[var(--ink-900)]",
    body: "max-w-[40ch] text-[11px] leading-[1.55]",
    bodyStyle: { color: "var(--ink-500)" } as const,
    action:
      "mt-[3px] w-fit cursor-pointer text-[11px] font-medium text-[var(--blue)]",
  },
  dark: {
    // The drawer's own 14px side padding, so the words start where the rows do.
    root: "flex flex-col gap-[7px] px-[14px] pt-[22px] pb-5",
    title: "text-[13px] font-medium text-white",
    body: "max-w-[40ch] text-[11px] leading-[1.55]",
    bodyStyle: { color: "rgba(255,255,255,0.45)" } as const,
    // White, not blue: on the dark scope blue is the progress rule's, and a
    // blue word in a drawer of white text would read as a second accent.
    action:
      "mt-[3px] w-fit cursor-pointer text-[11px] font-medium text-white/70 transition-colors duration-200 hover:text-white",
  },
} satisfies Record<FilmListTone, Record<string, unknown>>;

function EmptyBody({
  title,
  body,
  action,
  onAction,
  tone,
}: {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
  tone: FilmListTone;
}) {
  const t = EMPTY_TONE[tone];
  return (
    <div className={t.root}>
      <span className={t.title}>{title}</span>
      <span className={t.body} style={t.bodyStyle}>
        {body}
      </span>
      {action && onAction && (
        <button type="button" onClick={onAction} className={t.action}>
          {action}
        </button>
      )}
    </div>
  );
}
