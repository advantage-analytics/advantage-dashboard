"use client";

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  PanelRightClose,
  X,
} from "lucide-react";

import type { MatchPoint } from "@/lib/data/match-points-server";
import type { Workspace } from "@/lib/workspace/types";
import type { MatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { WorkspaceMark } from "@/components/dashboard/workspace-mark";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { cn } from "@/lib/utils";

import { filmProgressWidth } from "./film-clock";
import { FilmAdvancedPanel } from "./film-advanced-panel";
import { reducedMotionNow } from "./film-motion";
import { FilmQuickFilters } from "./film-quick-filters";
import { shotRowCells, shotRowRevealDelay, type ShotStop } from "./film-shots";
import {
  followAffordance,
  type FollowAffordance,
  type PointFocus,
} from "./film-timeline";
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
 * Rows are grouped by GAME and headed the way the fullscreen room's drawer
 * heads them: "SET 3 · GAME 7" on the left, the
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
 * The mark is the point's WINNER, not who hit the last shot: the workspace's
 * mark (profile photo on personal, crest on a team) when the viewer won the
 * point, an initials chip on `--surface-subtle` when the opponent did.
 * Initials come from `sides`, so a two-letter chip is never a hardcoded
 * artboard string. The value is `won_by_player1`, which the Advantage
 * Intelligence pipeline derives from consecutive point scores
 * (`resolveWinner` in `derivation/winners.ts`, walking the ladder / game /
 * set counts and deliberately ignoring the last stroke's `in` flag) and the
 * SwingVision parser reads straight from the export. It disagrees with "who
 * hit last" on any point flagged `winner_disputed` — that is exactly the set
 * this mark exists to get right. The row's hover, the score sliding aside for
 * the bookmark, is the room's (handoff F3) in the light treatment.
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
 *
 * ── Follow the film, or hold the point you are reading ──────────────────────
 *
 * `pointFocus` (T17 design, `2026-09-22-film-follow-hold-design.md`) splits
 * exactly two reads in here. The WELL reads `displayedPointId` — the held
 * point while held, else the playing one — and so does the keep-in-view
 * effect, which stops entirely while held. The LIT ROW (`isActive`,
 * `data-playing`, the 2px progress rule) keeps reading `activePointId`, so
 * the row that is playing stays named while the well stays put. A row or
 * shot click holds that point (or re-follows, when it is the playing one) and
 * still seeks; on either tone a hand scroll of the list holds too (T24).
 * Nothing animates on hold — holding is the absence of a scroll. Both tones
 * draw the "Now playing" pill as the way back (T23), whenever held and the
 * lit row is not wholly inside the scroller's box — including when the held
 * point IS the playing one, scrolled out of view (T24).
 */

/** Light is the in-report column; dark is the fullscreen room's drawer. */
export type FilmListTone = "light" | "dark";

/** One frozen empty slice, so "no well" never re-renders a memoized row. */
const NO_STOPS: ShotStop[] = [];

/** A list with no owner of the focus state simply follows. */
const FOLLOW: PointFocus = { mode: "follow" };
const NOOP = () => {};

/**
 * Keys that scroll a scroller (or the row focused inside it) without a
 * `wheel`, `touchmove` or `pointerdown` — the fourth hold source (author's
 * answer to Open item 3).
 */
const SCROLL_KEYS = new Set([
  "PageDown",
  "PageUp",
  "Home",
  "End",
  " ",
  "ArrowUp",
  "ArrowDown",
]);

/**
 * How long the follow flag stays up when the scroller never reports
 * `scrollend` (Safari). Chromium's smooth scroll eases in about 300ms.
 */
const FOLLOW_SCROLL_FALLBACK_MS = 400;

/**
 * How long the pill's 100ms exit may take before it unmounts anyway: a page
 * that stops painting never delivers `transitionend`.
 */
const PILL_EXIT_FALLBACK_MS = 150;

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
      "inline-flex h-[22px] shrink-0 cursor-pointer items-center gap-1 text-[11px] font-medium text-[var(--ink-600)] transition-colors duration-200 hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
    clearIcon: "h-3 w-3 text-[var(--ink-600)]",
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
      "mb-[7px] inline-flex h-[22px] shrink-0 cursor-pointer items-center gap-1 text-[11px] font-medium text-white/60 transition-colors duration-200 hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
    clearIcon: "h-3 w-3 text-white/60",
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
  /**
   * The second door into the fullscreen room (spec § Doors): given only by the
   * shell's column, a ⇧-click on a seekable row opens that point in the room
   * instead of seeking the report player. The room's own drawer does not pass
   * it — there is nowhere further to open into. Stable identity, please, for
   * the same reason `onSelect` wants one.
   */
  onOpenInRoom?: (point: MatchPoint) => void;
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
  /**
   * Follow-or-hold, owned by `FilmRoom` (film-tab.tsx) and shared by the
   * shell column and the room's drawer. Absent, the list follows — the
   * fixtures that mount it alone keep the list they had.
   */
  pointFocus?: PointFocus;
  /**
   * The point whose well is open: the held one while held, else the playing
   * one. Absent, it is `activePointId`.
   */
  displayedPointId?: string | null;
  /** Stable identity, please — the click wrappers below are memoized on both. */
  onHoldPoint?: (pointId: string) => void;
  onFollow?: () => void;
  /**
   * The playing point and its 1-based place in the walk over the applied cut
   * (`position.index`, the number the counters print) — null in dead time,
   * `index: null` when the cut excludes it. The pill's inputs, in both
   * tones (T23: the shell column draws the drawer's pill too).
   * Stable identity, please — the list is memoized on it.
   */
  nowPlaying?: { id: string; index: number | null } | null;
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
  onOpenInRoom,
  tone = "light",
  onCollapse,
  shotStops,
  activeShotId = null,
  onSelectShot,
  pointFocus = FOLLOW,
  displayedPointId: displayedPointIdProp,
  onHoldPoint = NOOP,
  onFollow = NOOP,
  nowPlaying = null,
}: PointListProps) {
  const t = LIST_TONE[tone];
  const displayedPointId =
    displayedPointIdProp === undefined ? activePointId : displayedPointIdProp;
  const held = pointFocus.mode === "held";
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

  // The DISPLAYED point's shots, and nobody else's: the feed the room hands
  // over covers the whole film, and one open well at a time is the rule —
  // stepping to another point refolds the last one because this slice moves
  // with `displayedPointId` rather than accumulating. While held that id is
  // the held point, so the well stays put as the film moves on.
  const wellStops = useMemo(() => {
    if (!shotStops || !displayedPointId) return NO_STOPS;
    return shotStops.filter((stop) => stop.point.id === displayedPointId);
  }, [shotStops, displayedPointId]);
  // A feed with no handler is a feed nothing can be done with, so it draws
  // nothing: the well's rows are seek targets before they are text.
  const wellOpen = onSelectShot != null && wellStops.length > 0;

  // The click wrappers and the intent listeners below read the playing and
  // displayed ids through refs, written after each commit, so their identity
  // never moves with the film: `PointRow` and `ShotWellRow` are memoized on
  // the callbacks they get, and a wrapper re-made on every point crossing
  // would re-render every row of a 174-point match roughly once every ten
  // seconds. Written in an effect rather than during render — the handlers
  // run on a later event, never inside the render that changed the value.
  const activePointRef = useRef(activePointId);
  const displayedPointRef = useRef(displayedPointId);
  const heldRef = useRef(held);
  useEffect(() => {
    activePointRef.current = activePointId;
    displayedPointRef.current = displayedPointId;
    heldRef.current = held;
  }, [activePointId, displayedPointId, held]);

  // A click on a row holds its point — or re-follows, when the row is the one
  // already playing: that click is the way back without the pill, and the
  // seek still happens as a restart of the point. The seek itself is
  // untouched: the hold lands first, then `onSelect` as it always did.
  const selectPoint = useCallback(
    (point: MatchPoint) => {
      if (point.id === activePointRef.current) onFollow();
      else onHoldPoint(point.id);
      onSelect(point);
    },
    [onFollow, onHoldPoint, onSelect],
  );
  // A shot click holds the shot's own point, by the same rule.
  const selectShot = useCallback(
    (stop: ShotStop) => {
      if (stop.point.id === activePointRef.current) onFollow();
      else onHoldPoint(stop.point.id);
      onSelectShot?.(stop);
    },
    [onFollow, onHoldPoint, onSelectShot],
  );

  // Keep whatever is lit in view as the film moves on — the playing shot while
  // a well is open, the playing row otherwise — and stop entirely while held:
  // the viewer's own scrolling is what the listeners after this effect read
  // as intent (`wheel`, `touchmove`, `pointerdown` on the scroller, and the
  // scrolling keys), never the `scroll` event, which a programmatic scroll
  // fires exactly as a wheel does. Around its own `scrollTo` the effect
  // raises `followScrollRef`, so nothing derived from the scroller's motion
  // can mistake the effect's travel for the viewer's; the intent listeners do
  // not consult it — a wheel arriving mid-follow-scroll is intent and holds.
  //
  // Moves this scroller's own `scrollTop` and nothing else. The DOM's
  // scroll-an-element-into-view method walks every ancestor instead, and while
  // the room's drawer is still off-canvas mid-slide that dragged the whole
  // room — video included — sideways toward the row. The room's retired dark
  // list hit exactly that, which is why the rule is written down here.
  const listRef = useRef<HTMLDivElement>(null);
  const followScrollRef = useRef(false);
  /** Cancels the pending settle of the last follow scroll, flag untouched. */
  const cancelSettleRef = useRef<() => void>(NOOP);
  useEffect(() => {
    if (held) return;
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
    let top = list.scrollTop;
    if (rowBox.top < listBox.top) top += rowBox.top - listBox.top;
    else if (rowBox.bottom > listBox.bottom)
      top += rowBox.bottom - listBox.bottom;
    else return;

    cancelSettleRef.current();
    followScrollRef.current = true;
    const settle = () => {
      cancel();
      followScrollRef.current = false;
    };
    // `scrollend` is the honest end of the travel; the timer is for the
    // engines that never send it.
    const timer = window.setTimeout(settle, FOLLOW_SCROLL_FALLBACK_MS);
    const cancel = () => {
      window.clearTimeout(timer);
      list.removeEventListener("scrollend", settle);
      cancelSettleRef.current = NOOP;
    };
    cancelSettleRef.current = cancel;
    list.addEventListener("scrollend", settle);
    // Smooth on the list's own scrollTop — Chromium eases it in about 300ms,
    // no scroll-jacking of our own — and instant under reduced motion.
    list.scrollTo({ top, behavior: reducedMotionNow() ? "auto" : "smooth" });
  }, [activePointId, activeShotId, wellOpen, held]);

  // Intent, read where a programmatic scroll never produces it: a wheel, a
  // touch drag, a press on the scroller's own gutter (the scrollbar is the
  // only part of the scroller that is not a child), or a scrolling key. Each
  // holds the displayed point — an ENTER only: scrolling while already held
  // keeps the held point, so the well never wanders to whatever scrolled into
  // view. Both tones listen (T24): the room's drawer and the shell column
  // hold on the same sources, and return by the same pill (T23).
  //
  // `ArrowUp`/`ArrowDown` with focus on a drawer row hold here, and the
  // room's window handler (film-fullscreen.tsx) then steps on the same key
  // with `preventDefault`, which re-follows — both updates land in one native
  // event and batch, so the net result of an arrow is `follow`, as the design
  // wants for a step. On the shell column an arrow on a focused row is a
  // SCROLL, not a step: the tab's window handler (film-tab.tsx) returns early
  // for `[role=button]` targets, so nothing re-follows and the net result
  // there is `held`. `Enter`/`Space` on a row are the row's activation, not
  // a scroll: the row's React handler prevents them, but it runs after this
  // native listener, so Space is skipped here by its target instead.
  const scrollerMounted = !advancedOpen && groups.length > 0;

  // The return affordance, on every `PointList` surface (T23: the shell's
  // card header line is gone, so the pill is the way back there too), while
  // held and a point is playing — the pill itself hides while the lit row is
  // in view (T24).
  const affordance = followAffordance(pointFocus, nowPlaying);
  useEffect(() => {
    if (!scrollerMounted) return;
    const list = listRef.current;
    if (!list) return;
    const hold = () => {
      if (heldRef.current) return;
      const id = displayedPointRef.current;
      if (id) onHoldPoint(id);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.target === list) hold();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !SCROLL_KEYS.has(e.key)) return;
      if (
        e.key === " " &&
        e.target instanceof Element &&
        e.target.closest("button, [role=button]")
      ) {
        return;
      }
      hold();
    };
    list.addEventListener("wheel", hold, { passive: true });
    list.addEventListener("touchmove", hold, { passive: true });
    list.addEventListener("pointerdown", onPointerDown);
    list.addEventListener("keydown", onKeyDown);
    return () => {
      list.removeEventListener("wheel", hold);
      list.removeEventListener("touchmove", hold);
      list.removeEventListener("pointerdown", onPointerDown);
      list.removeEventListener("keydown", onKeyDown);
    };
  }, [scrollerMounted, onHoldPoint]);

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
            trigger and the count and nothing else. Labelled text, not an
            icon-only glyph — a bare X beside a "Filters" trigger reads as
            "close the menu", not "clear the cut". */}
            {filtered && (
              <button type="button" onClick={clearAll} className={t.clear}>
                <X
                  className={t.clearIcon}
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
                Clear all
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
            // The pill's positioning wrapper. It sits around the scroller, not
            // on the drawer: the drawer has no padding, and Advanced replaces
            // the scroller in this same section, so the pill goes with the
            // scroller it belongs to — pinned to the list's bottom edge, and
            // not inside the scroller, where it would scroll away.
            <div className="relative flex min-h-0 flex-1 flex-col">
              {/* The one scroller in the card: the header stays put while the rows
            scroll, the way the room's panel scrolls its list under a fixed
            header. */}
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
                      const isYou = point.wonByPlayer1 === youIsPlayer1;
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
                            onSelect={selectPoint}
                            onToggleSaved={onToggleSaved}
                            onOpenInRoom={onOpenInRoom}
                            tone={tone}
                          />
                          {/* Under the DISPLAYED row, not the lit one: while
                            held the well stays here as `isActive` moves on.
                            The lit shot inside it is the playing shot, which
                            is in this well only when the displayed point is
                            the playing point. */}
                          {point.id === displayedPointId && wellOpen && (
                            <ShotWell
                              stops={wellStops}
                              activeShotId={activeShotId}
                              youIsPlayer1={youIsPlayer1}
                              youLastName={youLastName}
                              oppLastName={oppLastName}
                              onSelectShot={selectShot}
                            />
                          )}
                        </Fragment>
                      );
                    })}
                  </div>
                ))}
              </div>
              {/* After the scroller in DOM order, so Tab reaches it after the
            last row and before the transport. */}
              <FollowPill
                affordance={affordance}
                listRef={listRef}
                nowPlaying={nowPlaying}
                onFollow={onFollow}
                tone={tone}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
});

/* ── The "Now playing" pill ──────────────────────────────────────────────── */

type PillEdge = "top" | "bottom";

/**
 * Where the lit row sits against the scroller's box, as the pill reads it.
 * `edge` is the edge the pill is pinned to; `remembered` says whether that
 * edge is a live memory (the pill has been placed since the row was last
 * fully in view) or only what the last pill used, kept so an exit fade does
 * not jump across the list. `inView` is `null` until read for this episode.
 */
type PillPlace = {
  edge: PillEdge;
  remembered: boolean;
  inView: boolean | null;
};

const PLACE_UNREAD: PillPlace = {
  edge: "bottom",
  remembered: false,
  inView: null,
};

/**
 * The next place from the lit row's box against the scroller's (T21). The
 * edge changes only once the row is wholly beyond one — `row.bottom <=
 * box.top` pins top, `row.top >= box.bottom` pins bottom — and while the row
 * straddles an edge the remembered edge holds, so the pill cannot flip-flop
 * as a row slides past. With no memory (the row was fully in view, or this is
 * the episode's first read), a straddling row takes the edge it crosses.
 * Fully in view clears the memory: the pill is unmounted then, and the row
 * leaving the box re-seeds it from the side it leaves by.
 */
function nextPillPlace(prev: PillPlace, row: DOMRect, box: DOMRect): PillPlace {
  let next: PillPlace;
  if (row.bottom <= box.top) {
    next = { edge: "top", remembered: true, inView: false };
  } else if (row.top >= box.bottom) {
    next = { edge: "bottom", remembered: true, inView: false };
  } else if (row.top >= box.top && row.bottom <= box.bottom) {
    next = { edge: prev.edge, remembered: false, inView: true };
  } else {
    next = {
      edge: prev.remembered ? prev.edge : row.top < box.top ? "top" : "bottom",
      remembered: true,
      inView: false,
    };
  }
  return next.edge === prev.edge &&
    next.remembered === prev.remembered &&
    next.inView === prev.inView
    ? prev
    : next;
}

/**
 * The drawer's return affordance while held (T17 design, frame B1): "Now
 * playing · Point 14", and a chevron toward the lit row. Pressing it follows
 * the film again — the keep-in-view effect does the smooth scroll and the
 * well unfolds under the playing row; this does nothing else.
 *
 * The "Points" trigger's recipe (film-fullscreen.tsx) plus the drawer's own
 * 10% inset hairline, so it reads over a lit row as well as the sheet. On
 * the light tone (the shell's column, T23) the same dark pill floats over a
 * white card instead, so it takes `--shadow-floating` in place of the
 * hairline — foundations.md's "Dark floating UI" — and nothing else. It is
 * a button with visible text, so the chevron is `aria-hidden` and there is
 * no tooltip. `data-film-chrome`, so the chrome collapse and the room's exit
 * fade take it with everything else.
 *
 * Pinned 12px (`top-3` / `bottom-3`) inside the edge the lit row is beyond,
 * with `nextPillPlace`'s hysteresis; the chevron points at that edge. A
 * playing point with no row in the cut pins bottom with no chevron. While
 * the lit row is fully inside the scroller's box there is nothing to return
 * to, so the pill is unmounted.
 *
 * Unmounted when hidden — never `opacity-0` in the tab order. It arrives on
 * `film-follow-pill-in` (150ms, a 4px rise away from its edge — the
 * `--film-pill-rise` sign; the rise drops under reduced motion, the fade
 * stays) and leaves on a 100ms opacity transition, unmounting on its own
 * `transitionend` or a 150ms timer, whichever is first.
 */
function FollowPill({
  affordance,
  listRef,
  nowPlaying,
  onFollow,
  tone,
}: {
  affordance: FollowAffordance | null;
  listRef: RefObject<HTMLDivElement | null>;
  nowPlaying: { id: string; index: number | null } | null;
  onFollow: () => void;
  tone: FilmListTone;
}) {
  // The lit row against the scroller's box. Read in a layout effect, so a
  // pill that should not show (the row is in view) is never painted, and
  // re-read on the scroller's `scroll` (placement, not intent: the follow
  // effect's own travel is harmless here) and whenever the playing point
  // changes. This component stays mounted while the pill is not, so the
  // edge memory outlives the button.
  const active = affordance !== null;
  const inCut = affordance?.inCut ?? false;
  const [place, setPlace] = useState<PillPlace>(PLACE_UNREAD);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !active || !inCut) {
      // A new episode, or no row to place against: forget the edge but keep
      // it for the exit fade, and read afresh next time.
      setPlace((p) =>
        p.remembered || p.inView !== null
          ? { edge: p.edge, remembered: false, inView: null }
          : p,
      );
      return;
    }
    const read = () => {
      const lit = list.querySelector<HTMLElement>(
        '[data-point-id][data-playing="true"]',
      );
      // No lit row to measure (it should not happen in the cut): show the
      // pill where it last was rather than never.
      if (!lit) {
        setPlace((p) => (p.inView === false ? p : { ...p, inView: false }));
        return;
      }
      const box = list.getBoundingClientRect();
      const row = lit.getBoundingClientRect();
      setPlace((p) => nextPillPlace(p, row, box));
    };
    read();
    list.addEventListener("scroll", read, { passive: true });
    return () => list.removeEventListener("scroll", read);
  }, [listRef, active, inCut, nowPlaying]);

  // What is on screen, which outlives `affordance` by the exit's 100ms.
  const [shown, setShown] = useState<FollowAffordance | null>(null);
  const [leaving, setLeaving] = useState(false);
  // In-cut, the pill mounts only once the row is read as out of view, and a
  // mounted one leaves only once it is read as in view — an unread place
  // neither mounts it nor starts an exit.
  const rowInView = inCut ? place.inView : false;
  const wanted =
    affordance && (shown ? rowInView !== true : rowInView === false)
      ? affordance
      : null;
  // Adjusted during render, not in an effect: the pill must never paint one
  // frame with the old words, or linger a frame before its exit begins.
  if (wanted) {
    if (
      !shown ||
      shown.label !== wanted.label ||
      shown.ariaLabel !== wanted.ariaLabel ||
      shown.inCut !== wanted.inCut
    ) {
      setShown(wanted);
    }
    if (leaving) setLeaving(false);
  } else if (shown && !leaving) {
    setLeaving(true);
  }

  const finishLeave = useCallback(() => {
    setShown(null);
    setLeaving(false);
  }, []);
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(finishLeave, PILL_EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, finishLeave]);

  if (!shown) return null;
  // Out of the cut there is no row to point at: bottom, no chevron.
  const edge: PillEdge = shown.inCut ? place.edge : "bottom";
  const Chevron = !shown.inCut
    ? null
    : edge === "top"
      ? ChevronUp
      : ChevronDown;

  return (
    <button
      type="button"
      data-film-chrome
      data-edge={edge}
      aria-label={shown.ariaLabel}
      onClick={onFollow}
      // Leaving, it is already on its way out: not a target, not a stop.
      tabIndex={leaving ? -1 : undefined}
      onTransitionEnd={(e) => {
        if (
          e.target === e.currentTarget &&
          e.propertyName === "opacity" &&
          leaving
        ) {
          finishLeave();
        }
      }}
      className={cn(
        "inline-flex h-7 items-center gap-[7px] rounded-[var(--radius-button)] bg-[rgba(13,13,13,0.72)] px-2.5 text-[11px] font-medium text-white transition-[opacity,transform,background-color] duration-200 ease-[var(--ease-primary)] hover:bg-[rgba(13,13,13,0.9)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        "absolute left-1/2 -translate-x-1/2 cursor-pointer whitespace-nowrap active:scale-[0.97]",
        tone === "light"
          ? "shadow-[var(--shadow-floating)]"
          : "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]",
        // The same 12px inset on either edge; the rise comes from the edge
        // side, so pinned top it drops in (the keyframe reads the sign).
        edge === "top" ? "top-3 [--film-pill-rise:-4px]" : "bottom-3",
        // The enter keyframe holds its end state (`both`), so it comes off
        // for the exit or it would pin the opacity at 1.
        leaving
          ? "pointer-events-none opacity-0 duration-100"
          : "film-follow-pill-in",
      )}
    >
      {shown.label}
      {Chevron && (
        <Chevron
          className="size-3 text-white/85"
          strokeWidth={1.6}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

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
  onOpenInRoom,
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
  /** ⇧-click's door into the room; absent in the room's own drawer. */
  onOpenInRoom?: (point: MatchPoint) => void;
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
      // A Shift-held press would otherwise extend the document's selection
      // from wherever the last caret was, so the ⇧-click that opens the room
      // leaves a band of highlighted rows behind it. Suppressed only while
      // Shift is down and only where that door exists — a plain press keeps
      // its default, including the focus it gives the row.
      onMouseDown={(e) => {
        if (seekable && onOpenInRoom && e.shiftKey) e.preventDefault();
      }}
      onClick={(e) => {
        if (!seekable) return;
        // ⇧-click is the second door into the fullscreen room (spec § Doors).
        // Without the door it is an ordinary click, as it always was.
        if (e.shiftKey && onOpenInRoom) onOpenInRoom(point);
        else onSelect(point);
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
      <span
        className="inline-flex shrink-0 basis-[34px] items-center justify-center"
        data-mark={isYou ? "you" : "opp"}
      >
        {/* The viewer's own mark, never the frame's white initials chip
            (phase-1 decision): a point the viewer WON reads as theirs at a
            glance on both tones. The opponent keeps initials. */}
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
          // The room's row hover (handoff F3): the score slides
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
    // Two elements, not one: the outer grid is what `film-shot-well-open`
    // (globals.css) unfolds — its single row track grows from 0fr to 1fr on
    // mount — and the inner `min-h-0 overflow-hidden` column is what that
    // track clips, carrying the wash, the hairlines and the rows. Rows below
    // the well slide down with the track instead of jumping when it mounts;
    // the rows' own stagger plays inside the clip from the same instant.
    <div data-shot-well className="film-shot-well-open">
      <div className="flex min-h-0 flex-col overflow-hidden bg-[rgba(0,0,0,0.28)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(255,255,255,0.06)]">
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
      // T9: the rally reveals itself as a rally. Mount-driven — the rows are
      // keyed by `shot.id`, so stepping to another point mounts a fresh set
      // and replays this, while a `timeupdate` tick bails out of the memo
      // above and replays nothing.
      style={{ animationDelay: `${shotRowRevealDelay(order)}ms` }}
      className={cn(
        "film-shot-row-in grid h-[34px] w-full shrink-0 cursor-pointer items-center gap-x-2 px-[14px] text-left transition-colors duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
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
