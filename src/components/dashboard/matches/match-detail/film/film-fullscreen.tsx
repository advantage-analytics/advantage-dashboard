"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { PanelRight } from "lucide-react";

import type { MatchPoint } from "@/lib/data/match-points-server";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { isFormControl } from "@/components/dashboard/matches/new-match-wizard/useWizardKeys";
import {
  formatClock,
  shortMonthDate,
} from "@/components/dashboard/matches/match-detail/format-clock";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { advButton } from "@/lib/ui/adv-button";
import { overlayIsOpen } from "@/lib/ui/overlay-is-open";
import { cn } from "@/lib/utils";

import {
  BASE_BOARD_INSETS,
  COURT_ANCHOR_STORAGE_KEY,
  anchorPosition,
  courtRest,
  courtSlot,
  type BoardAnchor,
  type BoardPosition,
  type BoardSize,
} from "./board-position";
import { bounceTimesByShot } from "./film-ball";
import { matchMarks, pointMarks, type CourtView } from "./film-court";
import {
  FILM_COURT_SIZE,
  FilmCourt,
  type FilmCourtMark,
  type FilmCourtMode,
  type FilmCourtProps,
} from "./film-court-card";
import { ANCHOR_LABEL, SETTLE_CLASS, useCornerDrag } from "./use-corner-drag";
import {
  cutName,
  hasActiveFilmFilters,
  lastNameOf,
  type FilmFilters,
} from "./film-filters";
import { FOCUSABLE_SELECTOR, nextFocusTarget } from "./film-focus-trap";
import { FILM_REFUSAL_COPY } from "./film-refusal-copy";
import { FilmRoomDrawer } from "./film-room-drawer";
import {
  readCourtMode,
  readCourtOn,
  readDrawerOpen,
  writeCourtMode,
  writeCourtOn,
  writeDrawerOpen,
  type CourtMode,
} from "./film-room-prefs";
import { boardAt, type BoardColumns } from "./film-score";
import { FilmScoreboard } from "./film-scoreboard";
import { createFilmTrace, readTraceFlag, type FilmTrace } from "./film-trace";
import { useFilmClockVars } from "./film-clock";
import {
  OPEN_ROOM_FRAME,
  PANEL_EXIT_MS,
  ROOM_EASE_ENTER,
  ROOM_EASE_EXIT,
  ROOM_ENTER_MS,
  ROOM_EXIT_MS,
  collapsedRoomFrame,
  reducedMotionNow as prefersReducedMotion,
  type Rect,
} from "./film-motion";
import { activeShotAt, shotStops as buildShotStops } from "./film-shots";
import {
  activeStopAt,
  setSegments,
  deadTimeJump,
  nextStop,
  playingStopAt,
  prevStop,
  REACHED_EPSILON_SECONDS,
  type FilmClock,
  type FilmStop,
} from "./film-timeline";
import { FilmTransport, PLAYBACK_RATES } from "./film-transport";
import type {
  AttachmentPlaybackProblem,
  AttachmentResumeIntent,
} from "./use-attachment-playback";
import { useBallPaths } from "./use-ball-paths";
import { useSeekSettling } from "./use-seek-settling";

/**
 * The fullscreen film room (Film Room Fullscreen handoff, F1–F5).
 *
 * ── An overlay, not the Fullscreen API ──────────────────────────────────────
 * The room is a `fixed inset-0` portal on `body`, not `requestFullscreen()`.
 * Native fullscreen shows ONLY the fullscreened element's subtree, and every
 * Radix surface here — the filters menu, the advanced dialog, each dark
 * tooltip — portals to `body`, so under the API they would all render
 * invisibly behind the film. The portal also escapes the match layout's
 * `overflow-hidden` frame, which is why it cannot simply grow in place.
 *
 * ── Its own <video> ─────────────────────────────────────────────────────────
 * The report player keeps its element; this one mounts a second, seeded with
 * the report's playhead and paused state and handing them back on exit.
 * Re-parenting one element through a portal remounts it and drops the
 * buffer, which is a worse hand-off than a metadata fetch.
 *
 * ── Motion ──────────────────────────────────────────────────────────────────
 * The report player's frame grows into the room (`film-motion.ts`): a uniform
 * scale plus a clip to the frame's shape, 460ms on the expo ease-out, and the
 * chrome fades in once the film has landed. Exit runs the same path backwards
 * in 320ms, chrome first, and only then hands the playhead back. The points
 * drawer slides on the same curve and the transport's right edge travels with
 * it. Progress rules and the playhead read `--film-t` (`film-clock.ts`), so
 * they move every frame instead of every `timeupdate`. Reduced motion keeps
 * every change as an opacity fade and drops the travel.
 *
 * ── Chrome ──────────────────────────────────────────────────────────────────
 * 3s of stillness **while the film is playing** collapses everything operable
 * — the transport, the "Points" trigger, the court's header glyphs, the
 * bottom scrim and the cursor. The board and the court keep their boxes. Any
 * pointer, key or focus is activity, a focused control holds the chrome up,
 * and a pause puts it back: someone who stopped the film to look at something
 * is not idle.
 */

export interface FilmFullscreenProps {
  /**
   * The credential to play — the refresh hook's current URL, shared with the
   * report player, so the two surfaces can never hold two different ones.
   */
  url: string | null;
  /** The hook's reload key; it keys this room's element too. */
  generation: number;
  /** Where to land after a swap. See `film-player.tsx` for the race it settles. */
  resume: AttachmentResumeIntent | null;
  /** The hook's terminal state, rendered over the room rather than the report. */
  problem: AttachmentPlaybackProblem | null;
  /** The Advantage Intelligence lineage: the reload panel stays its only repair. */
  passthrough: boolean;
  /** The playhead and the intent, for the hook's anchor and its resume. */
  onPlaybackTime: (seconds: number) => void;
  onPlaybackPlaying: (playing: boolean) => void;
  onLoadFailure: () => void;
  onPlayRejected: () => void;
  onRetry: () => void;
  /**
   * The film clock `stops` were built from — passed in rather than rebuilt
   * from `video`, so the room's shot feed converts through the very same
   * alignment the report tab's points did.
   */
  clock: FilmClock;
  /** Where the report player was when the room opened. */
  initial: { time: number; playing: boolean };
  /** Every timed point on the film clock — the board, the track, the playing row. */
  stops: FilmStop[];
  /** The applied cut on the film clock — what ← → and prev/next walk. */
  walkStops: FilmStop[];
  columns: BoardColumns;
  allPoints: MatchPoint[];
  visiblePoints: MatchPoint[];
  filters: FilmFilters;
  onFiltersChange: (filters: FilmFilters) => void;
  onToggleSaved: (pointId: string) => void;
  onExit: (state: { time: number; playing: boolean }) => void;
  /** The report player's frame on screen — where the room grows from and returns to. */
  originRect: () => Rect | null;
  /** Called as the exit starts, with the playhead to restore underneath. */
  onHandoff: (time: number) => void;
}

const IDLE_MS = 3000;

/**
 * The film's own darkening, in two layers because they have different lives.
 *
 * The top wash keeps the "Points" trigger and a bright first frame apart; it
 * is not operable and stays through the collapse. The bottom is the
 * transport's ground (C3: the bar "draws no surface of its own"), so it goes
 * with the transport and comes back with it — one 200ms opacity fade, not a
 * gradient crossfading into another gradient.
 */
const TOP_SCRIM =
  "linear-gradient(to bottom, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0) 62%)";
const BOTTOM_SCRIM =
  "linear-gradient(to bottom, rgba(0,0,0,0) 58%, rgba(13,13,13,0.78) 100%)";

/**
 * A heading per terminal reason. Same four as `film-player.tsx`, because one
 * hook state must not read as two different events depending on which surface
 * the viewer happened to be on — which is why every one of them resolves from
 * `FILM_REFUSAL_COPY` rather than being typed out again here (H2 R10: one copy
 * table, two hosts). The body stays the hook's `problem.message`.
 */
const ROOM_PROBLEM_TITLES: Record<AttachmentPlaybackProblem["reason"], string> =
  {
    removed: FILM_REFUSAL_COPY.stale.heading,
    denied: FILM_REFUSAL_COPY.denied.heading,
    unreachable: FILM_REFUSAL_COPY.unavailable.heading,
    unplayable: FILM_REFUSAL_COPY.loadFailure.heading,
  };

type PanelState = "closed" | "open" | "closing";

/**
 * The court card's layer: the wrapper that moves, and the mechanic that moves
 * it.
 *
 * It is its own component for one reason — `useCornerDrag` measures the
 * element it is given, and the court mounts long after the room does (R11:
 * not before the first point resolves, and not at all while the court is
 * off). A hook called in `FilmFullscreen` would run its layout effect against
 * a ref that is still null.
 *
 * Until the viewer drops it somewhere, the court has no corner of its own
 * (`anchor === null`, `data-court-anchor="follow"`) and `courtRest` stacks it
 * in the board's column exactly where it has always sat. Once dropped it
 * keeps its corner — and `dock` follows the court's own column rather than
 * the board's, so the readout hangs off the side that has room for it.
 */
function FilmCourtLayer({
  board,
  room,
  court,
}: {
  /** The board at rest: the column the court follows until it has its own. */
  board: { anchor: BoardAnchor; position: BoardPosition; size: BoardSize };
  room: BoardSize;
  court: Omit<FilmCourtProps, "dock" | "handleProps" | "grabbing">;
}) {
  const rest = useCallback(
    (at: BoardAnchor | null, size: BoardSize, roomSize: BoardSize) =>
      courtRest(at, board, size, roomSize, BASE_BOARD_INSETS),
    [board],
  );
  const announce = useCallback(
    (at: BoardAnchor) => `Court in the ${ANCHOR_LABEL[at]} corner.`,
    [],
  );
  const move = useCornerDrag({
    storageKey: COURT_ANCHOR_STORAGE_KEY,
    // Null, not a corner: a viewer who has never moved the court sees it
    // exactly where it is today, under the board.
    defaultAnchor: null,
    rest,
    // Pre-measurement only, and `useLayoutEffect` measures before paint — so
    // this is never what anybody sees. `FILM_COURT_SIZE` is the card's pinned
    // box, which is what the measurement will report anyway.
    fallback: courtSlot(
      board.anchor,
      board.position,
      board.size,
      FILM_COURT_SIZE,
    ),
    announce,
  });
  const column = move.anchor ?? board.anchor;

  return (
    <>
      {move.ghost && (
        <div
          aria-hidden="true"
          data-film-court-ghost=""
          className={cn(
            "pointer-events-none absolute rounded-[var(--radius-element)] bg-white/[0.06] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28)]",
            SETTLE_CLASS,
          )}
          style={{
            left: move.ghost.left,
            top: move.ghost.top,
            width: move.sizes?.self.width ?? FILM_COURT_SIZE.width,
            height: move.sizes?.self.height ?? FILM_COURT_SIZE.height,
          }}
        />
      )}
      <div
        {...move.containerProps}
        data-film-chrome
        data-court-anchor={move.anchorAttr}
        aria-describedby="film-court-hint"
        className={cn(
          "absolute rounded-[var(--radius-element)]",
          move.placed && SETTLE_CLASS,
          // Held is the focus outline at full weight, as on the board (R6).
          move.held && "shadow-[var(--focus-ring)]",
        )}
        style={{ left: move.position.left, top: move.position.top }}
      >
        <span id="film-court-hint" className="sr-only">
          Drag the court card by its header to move it, or press the arrow keys
          to nudge it 8 pixels at a time — 40 with Shift. Space picks it up and
          drops it into the nearest corner; Escape cancels the move.
        </span>
        <span aria-live="polite" className="sr-only">
          {move.announcement && (
            <span key={move.announcement.seq}>{move.announcement.text}</span>
          )}
        </span>
        <FilmCourt
          {...court}
          dock={column.endsWith("right") ? "right" : "left"}
          handleProps={move.handleProps}
          grabbing={move.free}
        />
      </div>
    </>
  );
}

export function FilmFullscreen(p: FilmFullscreenProps) {
  const { match } = useMatchData();
  const sides = useMatchSides();

  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const idleRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(p.initial.time);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState<number>(1);
  const [looping, setLooping] = useState(false);
  const [skipDead, setSkipDead] = useState(false);
  const [failed, setFailed] = useState(false);
  const [chrome, setChrome] = useState(true);
  // The court and the side it is showing are viewer preferences (spec:
  // Persistence is localStorage), read once in lazy initializers so a
  // blocked-storage throw costs nothing per render, and written on every
  // change. A court left off stays off across exit and re-entry (R9).
  const [courtOn, setCourtOn] = useState(readCourtOn);
  const [courtMode, setCourtMode] = useState<CourtMode>(readCourtMode);
  // Bumped by every seek. The court's readout describes one moment, so it
  // closes as soon as the film moves to another one.
  const [seekKey, setSeekKey] = useState(0);
  // Open or closed is a viewer preference (spec: Persistence is localStorage),
  // read once in a lazy initializer so a blocked-storage throw costs nothing
  // per render. A drawer that was left open opens with the room.
  const [panel, setPanel] = useState<PanelState>(() =>
    readDrawerOpen() ? "open" : "closed",
  );
  const panelOpen = panel === "open";
  const [videoReady, setVideoReady] = useState(false);
  // T16: the frame admits it is still catching up with a seek the chrome has
  // already made. Display only — `seek` is untouched and still marks on click.
  const settling = useSeekSettling({ graceMs: 120, generation: p.generation });
  // T14: the seek trace is opt-in (`localStorage["film-room:trace"]`), read
  // once. Off, the ref stays null — no listener, no `performance` call.
  const [traceOn] = useState(readTraceFlag);
  const traceRef = useRef<FilmTrace | null>(null);

  // The drawer unmounts when its slide-out ends. The end event is only the
  // fast path: a page that stops painting (a hidden or throttled tab) never
  // delivers it, and the drawer would sit there answering no clicks. The
  // timer closes it regardless, a beat after the slide should have finished.
  useEffect(() => {
    if (panel !== "closing") return;
    const timer = window.setTimeout(
      () => setPanel((current) => (current === "closing" ? "closed" : current)),
      PANEL_EXIT_MS + 60,
    );
    return () => window.clearTimeout(timer);
  }, [panel]);

  // Opening and collapsing the drawer touch the drawer and the preference and
  // nothing else — no `pause()`, no `load()`, no seek. The film keeps playing
  // through the slide (spec: "Rules that apply to every task").
  const openPanel = useCallback(() => {
    setPanel("open");
    writeDrawerOpen(true);
  }, []);
  const collapsePanel = useCallback(() => {
    setPanel("closing");
    writeDrawerOpen(false);
  }, []);

  // Showing, hiding and swapping the court touch the court and the preference
  // and nothing else — no `pause()`, no `load()`, no seek. The write sits
  // beside the state change rather than inside the updater, which React
  // invokes twice in development.
  const toggleCourt = useCallback(() => {
    const next = !courtOn;
    setCourtOn(next);
    writeCourtOn(next);
  }, [courtOn]);
  const showCourtMode = useCallback((next: CourtMode) => {
    setCourtMode(next);
    writeCourtMode(next);
  }, []);
  const swapCourtMode = useCallback(
    () => showCourtMode(courtMode === "match" ? "point" : "match"),
    [courtMode, showCourtMode],
  );
  // Set while the room is shrinking back into the report; everything that
  // would start a second exit or a new interaction checks it.
  const leavingRef = useRef(false);
  const enterAnimation = useRef<Animation | null>(null);

  const syncClock = useFilmClockVars(videoRef, rootRef, playing);

  /**
   * Where a fresh element has to come back to. Seeded from the report player's
   * hand-off and kept current by playback, so a credential swap mid-rally
   * lands on the rally rather than on frame one — and so does a swap that
   * happens before the hook has resolved a resume intent.
   */
  const landingRef = useRef({
    time: p.initial.time,
    playing: p.initial.playing,
  });
  const readyRef = useRef(false);
  /**
   * Seeded with the generation the room opened on, not with a sentinel: a
   * refresh that happened BEFORE the room was opened has an intent that is
   * still current, and applying it here would throw away the hand-off the room
   * was actually seeded with — which is the more recent of the two.
   */
  const appliedRef = useRef(p.generation);

  /* ── Derived ─────────────────────────────────────────────────────────── */

  // Two readings of one playhead, and they differ between points (R7).
  //
  // `active` is the last point REACHED and never goes back to null, which is
  // what holds the score on the board through a changeover. `playingStop` is
  // the point the film is actually inside, and is null in the dead time —
  // everything that NAMES a point reads that one, so the point line, the
  // position counter, the drawer's lit row and the court's point mode all go
  // quiet together instead of the room insisting on a point nobody is on.
  const active = useMemo(
    () => activeStopAt(p.stops, currentTime),
    [p.stops, currentTime],
  );
  const playingStop = useMemo(
    () => playingStopAt(p.stops, currentTime),
    [p.stops, currentTime],
  );
  // No fallback to the first point: until the playhead has reached one there
  // is no board at all (R11), rather than a board for a point nobody is on.
  const boardStop = active?.stop ?? null;
  const board = useMemo(
    () =>
      boardStop
        ? boardAt(
            boardStop.point,
            {
              youIsPlayer1: sides.you.isPlayer1,
              youName: sides.you.name,
              oppName: sides.opp.name,
              sets: sides.sets,
            },
            p.columns,
          )
        : null,
    [
      boardStop,
      sides.you.isPlayer1,
      sides.you.name,
      sides.opp.name,
      sides.sets,
      p.columns,
    ],
  );
  const activePoint = playingStop?.point ?? null;
  /**
   * The point a "save that" means (T13).
   *
   * Saving is an act about the point you just WATCHED, and the dead time after
   * a rally is exactly when somebody reaches for it — so the bookmark control
   * and the `S` key read `boardStop`, the last point reached, never the
   * playing one. `activePoint` is null in that gap, and the control used to
   * fall silently through to nothing at all. The shell's own `S` has always
   * read the last point reached (`activeStopAt`), so this also ends a
   * disagreement between the two surfaces.
   *
   * The board's "· saved" glyph reads this same point, so the foot and the
   * control can never name different points. Everything that NAMES the point
   * — the point line, the position counter, the drawer's lit row — stays on
   * `playingStop` (R7).
   */
  const savePoint = boardStop?.point ?? null;

  /**
   * The board and the court appear together, or not at all (R11).
   *
   * "No board for a point nobody is on": until the film has a length and the
   * playhead has reached the first point, neither object has anything true to
   * say, and half-populating them is worse than the black frame with its
   * chrome — which IS the loading state here. No spinner, no skeleton.
   */
  const firstPointReached = duration > 0 && active !== null;

  // The drawer and the court both read the shot feed — the court needs the
  // playing shot with the drawer shut — and a three-set match is a few
  // thousand shots to place and then scan on every tick, so it is not built
  // while both of them are away.
  const shotStops = useMemo(
    () =>
      panel === "closed" && !courtOn ? [] : buildShotStops(p.stops, p.clock),
    [panel, courtOn, p.stops, p.clock],
  );
  const activeShot = useMemo(
    () => activeShotAt(shotStops, currentTime),
    [shotStops, currentTime],
  );

  // The playing point's shots in RALLY ORDER — the order `buildShotStops` put
  // them in, which is the order `pointMarks` reads them. An untimed shot has no
  // place on the film and so is in neither.
  const pointShotStops = useMemo(
    () =>
      activePoint ? shotStops.filter((s) => s.point.id === activePoint.id) : [],
    [shotStops, activePoint],
  );

  // Point mode is drawn the way the film shows the court, so a mark sits where
  // the ball is on screen. Only an Advantage Intelligence match's stored frame
  // IS the camera's (`CourtView`); anything else keeps you at the bottom.
  const courtView: CourtView =
    match.sourceProvider === "splitstep" ? "camera" : "you-bottom";

  // Ball-paths bounce times, the older of the two measured sources: the paths are
  // derived from the vendor's per-frame trajectories, so a match from any other
  // source has no file to fetch and nothing to gain from asking. With the court
  // off there is nothing to draw them on. Everything below is silent and
  // optional — with no file, no match for a shot or no bounce in the vendor's
  // data, `bounceTime` stays undefined and `estimatedBounceTime` places the
  // bounce exactly as it does today.
  const ballPaths = useBallPaths({
    matchId: match.id,
    enabled: courtOn && match.sourceProvider === "splitstep",
    clock: p.clock,
  });
  // Both sides are film seconds: `ShotStop.start` already is, and the paths
  // were converted once on the way out of the hook.
  const bounceTimes = useMemo(
    () =>
      bounceTimesByShot(
        pointShotStops.map((s) => ({ id: s.shot.id, start: s.start })),
        ballPaths,
      ),
    [pointShotStops, ballPaths],
  );

  // With no point playing, point mode has nothing to draw and says so in
  // words ("Next point" / "Not started") rather than vanishing. Match mode is
  // about the whole cut and not about the playhead, so it keeps its marks
  // through the dead time between points (C2, R8).
  const courtCardMode: FilmCourtMode =
    courtMode === "match" ? "match" : activePoint ? "point" : "none";
  // Match mode follows the applied cut: the points the room was handed are
  // already filtered, which is the same array the drawer's list shows (R5).
  const courtMarks = useMemo<readonly FilmCourtMark[]>(() => {
    if (!courtOn) return [];
    if (courtMode === "match")
      return matchMarks(p.visiblePoints, { youIsPlayer1: sides.you.isPlayer1 });
    // `ShotStop.start` is already film time, the same clock `currentTime` is
    // on, so a mark's opacity is a pure function of the two (`markOpacity`).
    return pointMarks(
      pointShotStops.map((s) => ({
        shot: s.shot,
        contactTime: s.start,
        // The row's own measured landing first (`ShotStop.bounce`, converted in
        // `shotStops` off `shots.bounce_video_time`), then the ball-paths match
        // for a match derived before that column was written. Absent from both
        // leaves `bounceTime` undefined, which is `estimatedBounceTime`'s cue.
        bounceTime: s.bounce ?? bounceTimes.get(s.shot.id),
      })),
      {
        youIsPlayer1: sides.you.isPlayer1,
        filmTime: currentTime,
        view: courtView,
      },
    );
  }, [
    bounceTimes,
    courtView,
    courtOn,
    courtMode,
    currentTime,
    p.visiblePoints,
    pointShotStops,
    sides.you.isPlayer1,
  ]);
  const courtTitle =
    courtMode === "match"
      ? hasActiveFilmFilters(p.filters)
        ? cutName(p.filters, sides)
        : "Whole match"
      : "This point";
  // The point's caption counts the shots the card can draw and number — the
  // same total the readout's "shot 3 of 7" is out of — so the two can never
  // disagree about how long the rally was.
  const courtCaption =
    courtMode === "match"
      ? `${p.visiblePoints.length} points`
      : `${pointShotStops.length} shots`;

  /* ── The board's column ──────────────────────────────────────────────── */

  // The court lives in the board's corner (R6's court rule), so it needs the
  // corner and the size the board actually measured — which `FilmScoreboard`
  // reports — plus the room's own box to turn that corner back into pixels.
  // The drawer is deliberately absent from this: it moves neither object.
  const [boardRest, setBoardRest] = useState<{
    anchor: BoardAnchor;
    size: BoardSize;
  } | null>(null);
  const onBoardRest = useCallback(
    (anchor: BoardAnchor, size: BoardSize) => setBoardRest({ anchor, size }),
    [],
  );
  const [roomSize, setRoomSize] = useState<BoardSize | null>(null);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    // `clientWidth`/`clientHeight` are layout sizes, so the entrance's scale
    // never reaches them: the court is placed for the room it settles into.
    const measure = () =>
      setRoomSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The board at rest, in pixels — the column the court stacks under while it
  // has no corner of its own. Null until both are measured, which is also the
  // court layer's gate: it cannot be placed before there is a board to place
  // it against.
  const boardColumn = useMemo(() => {
    if (!boardRest || !roomSize) return null;
    return {
      anchor: boardRest.anchor,
      position: anchorPosition(
        boardRest.anchor,
        boardRest.size,
        roomSize,
        BASE_BOARD_INSETS,
      ),
      size: boardRest.size,
    };
  }, [boardRest, roomSize]);

  const position = useMemo(() => {
    if (!activePoint) return null;
    const index = p.walkStops.findIndex((s) => s.point.id === activePoint.id);
    return index === -1
      ? null
      : { index: index + 1, total: p.walkStops.length };
  }, [activePoint, p.walkStops]);

  const segments = useMemo(
    () => setSegments(p.stops, duration),
    [p.stops, duration],
  );

  const eventName = match.tournamentName?.trim() || null;
  const subtitle = [
    eventName,
    match.round?.trim() || null,
    shortMonthDate(match.date),
  ]
    .filter(Boolean)
    .join(" · ");

  /* ── Playback ────────────────────────────────────────────────────────── */

  /** One place that moves the playhead everywhere it is read. */
  const mark = useCallback(
    (seconds: number) => {
      landingRef.current.time = seconds;
      setCurrentTime(seconds);
      p.onPlaybackTime(seconds);
    },
    // `p` is the props object; only the callback is used, and it is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.onPlaybackTime],
  );

  const seek = useCallback(
    (seconds: number) => {
      const el = videoRef.current;
      if (!el) return;
      const max =
        Number.isFinite(el.duration) && el.duration > 0
          ? el.duration
          : undefined;
      const target = Math.max(0, max ? Math.min(seconds, max) : seconds);
      // Observes only; captures the buffered ranges the jump starts from.
      traceRef.current?.seek(el, target);
      el.currentTime = target;
      mark(target);
      rootRef.current?.style.setProperty("--film-t", String(target));
      // Whatever the court's readout was explaining is no longer on screen.
      setSeekKey((k) => k + 1);
    },
    [mark],
  );

  /**
   * Put a fresh element back where the old one was — the room's half of the
   * credential swap. Either the element's metadata or the hook's resume intent
   * can arrive last, so both call this.
   */
  const land = useCallback(() => {
    const el = videoRef.current;
    if (!el || !readyRef.current) return;
    const { time, playing: wasPlaying } = landingRef.current;
    const max =
      Number.isFinite(el.duration) && el.duration > 0 ? el.duration : undefined;
    const target = Math.max(0, max ? Math.min(time, max) : time);
    // See `film-player.tsx`: small enough that a real correction always
    // lands, large enough that a repeated settle is not a stutter.
    if (Math.abs(el.currentTime - target) > 0.01) {
      el.currentTime = target;
      mark(target);
      rootRef.current?.style.setProperty("--film-t", String(target));
    }
    if (wasPlaying && el.paused) {
      void el.play().catch(() => p.onPlayRejected());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mark, p.onPlayRejected]);

  /** Metadata is in: take the duration and put the playhead where it belongs. */
  const settle = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    setDuration(el.duration || 0);
    el.playbackRate = rate;
    readyRef.current = true;
    land();
    syncClock();
  }, [land, rate, syncClock]);

  /**
   * Metadata, however it arrives — and this element cannot rely on the event.
   *
   * The room opens on the SAME URL the report player has already buffered, so
   * the browser serves it from memory and the element can reach `readyState 1`
   * before React has finished mounting the subtree — the `loadedmetadata` the
   * `onLoadedMetadata` prop is waiting for has already been and gone, and the
   * room sits on frame one with the viewer's playhead lost. Asking the element
   * what it has is the only reading that is true either way; the prop below
   * stays as the fast path for the ordinary case.
   */
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.readyState >= 1) {
      settle();
      return;
    }
    readyRef.current = false;
    const onReady = () => settle();
    el.addEventListener("loadedmetadata", onReady);
    return () => el.removeEventListener("loadedmetadata", onReady);
  }, [p.generation, settle]);

  // T14: follow each element the room mounts. Keyed on `generation` so a
  // remount mid-seek is recorded on that seek; the trace itself outlives it.
  useEffect(() => {
    if (!traceOn) return;
    const el = videoRef.current;
    if (!el) return;
    traceRef.current ??= createFilmTrace("room");
    return traceRef.current.attach(el, p.generation);
  }, [traceOn, p.generation]);
  useEffect(() => () => traceRef.current?.dispose(), []);

  // The room moves its own selection on a realign, not just its playhead:
  // `mark` inside `land` sets `currentTime`, which is what the board, the
  // position counter and the drawer's playing row all read.
  useEffect(() => {
    const resume = p.resume;
    if (!resume || appliedRef.current === p.generation) return;
    appliedRef.current = p.generation;
    landingRef.current = { time: resume.filmTime, playing: resume.playing };
    land();
  }, [p.resume, p.generation, land]);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    // A rejected play() is not a broken film: a pause landing before play
    // resolves (a quick double Space) rejects with AbortError, and an autoplay
    // refusal with NotAllowedError. Only the element's own `error` event means
    // the file can't be played.
    if (el.paused) void el.play().catch(() => p.onPlayRejected());
    else el.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.onPlayRejected]);

  const step = useCallback(
    (direction: -1 | 1) => {
      const now = videoRef.current?.currentTime ?? currentTime;
      const stop =
        direction === 1
          ? nextStop(p.walkStops, now)
          : prevStop(p.walkStops, now);
      if (stop) seek(stop.start);
    },
    [p.walkStops, currentTime, seek],
  );

  // Stable, because the panel's rows are memoized on them and the room
  // re-renders several times a second while the film plays.
  const selectPoint = useCallback(
    (point: MatchPoint) => {
      const stop = p.stops.find((s) => s.point.id === point.id);
      if (stop) seek(stop.start);
    },
    [p.stops, seek],
  );
  const selectShot = useCallback(
    (stop: { start: number }) => seek(stop.start),
    [seek],
  );
  // A mark is a seek target: it takes the film to that shot and brings the
  // court back to the point the shot belongs to (C2). A match-mode mark for a
  // shot the film has no time for still lands on its point, which is the
  // moment match mode was pointing at.
  const selectMark = useCallback(
    (mark: FilmCourtMark) => {
      const shot = shotStops.find((s) => s.shot.id === mark.shotId);
      if (shot) selectShot(shot);
      else {
        const point = mark.pointId
          ? p.stops.find((s) => s.point.id === mark.pointId)
          : undefined;
        if (point) seek(point.start);
      }
      showCourtMode("point");
    },
    [shotStops, selectShot, p.stops, seek, showCourtMode],
  );

  const toggleSavedActive = useCallback(() => {
    if (savePoint) p.onToggleSaved(savePoint.id);
  }, [savePoint, p]);

  const cycleRate = useCallback(
    (direction: 1 | -1 = 1) => {
      const i = PLAYBACK_RATES.indexOf(rate as (typeof PLAYBACK_RATES)[number]);
      const next =
        PLAYBACK_RATES[
          (i + direction + PLAYBACK_RATES.length) % PLAYBACK_RATES.length
        ];
      if (videoRef.current) videoRef.current.playbackRate = next;
      setRate(next);
    },
    [rate],
  );

  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  }, []);

  const exit = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    const el = videoRef.current;
    const wasPlaying = el ? !el.paused : false;
    el?.pause();
    const state = {
      time: el?.currentTime ?? currentTime,
      playing: wasPlaying,
    };

    // Hand the playhead back before the room shrinks, so the report player
    // underneath is already on this frame when the room comes off it.
    p.onHandoff(state.time);

    const root = rootRef.current;
    enterAnimation.current?.cancel();
    if (!root) {
      p.onExit(state);
      return;
    }

    // Chrome leaves first and quickly, so the shrinking frame carries only film.
    for (const node of root.querySelectorAll<HTMLElement>(
      "[data-film-chrome]",
    )) {
      node.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 120,
        easing: "linear",
        fill: "forwards",
      });
    }

    const frame = prefersReducedMotion() ? null : p.originRect();
    const animation = frame
      ? root.animate(
          [
            OPEN_ROOM_FRAME,
            collapsedRoomFrame(frame, {
              width: root.clientWidth,
              height: root.clientHeight,
            }),
          ],
          { duration: ROOM_EXIT_MS, easing: ROOM_EASE_EXIT, fill: "forwards" },
        )
      : root.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 180,
          easing: "linear",
          fill: "forwards",
        });
    void animation.finished.catch(() => {}).then(() => p.onExit(state));
  }, [p, currentTime]);

  // The point the film was last inside, for Loop. Loop cannot ask
  // `activeStopAt` at the end of a window: a window clamped to the next one's
  // start (a point with no duration, or two points close together) hands over
  // to the next point just before its own end, so "past the end of the active
  // point" is never true and the film ran on.
  const loopStopRef = useRef<FilmStop | null>(null);

  const onTimeUpdate = useCallback(
    (t: number) => {
      mark(t);
      syncClock();
      const now = activeStopAt(p.stops, t);
      const previous = loopStopRef.current;
      // Crossing the end during playback (not a jump somewhere else).
      if (
        looping &&
        previous &&
        t >= previous.end - REACHED_EPSILON_SECONDS &&
        t < previous.end + 1
      ) {
        seek(previous.start);
        return;
      }
      loopStopRef.current = now?.stop ?? null;
      if (skipDead) {
        const jump = deadTimeJump(p.stops, t);
        if (jump !== null) seek(jump);
      }
    },
    [p.stops, looping, skipDead, seek, syncClock, mark],
  );

  /* ── Mount: seed the player, lock the page, take focus ───────────────── */

  useEffect(() => {
    const previous = document.body.style.overflow;
    // Whatever opened the room — the player's maximize control, or a
    // ⇧-clicked point row — gets focus back when the room comes off (R1: the
    // room is modal). Without this, focus falls to `body` and a keyboard
    // viewer restarts their tab walk at the top of the page.
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previous;
      // A detached opener (the row's list re-rendered) simply no-ops.
      opener?.focus({ preventScroll: true });
    };
  }, []);

  // The entrance. Layout effect, so the first painted frame is already the
  // collapsed one — a normal effect would flash the full room for a frame
  // before it snapped back to the report player's size.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = prefersReducedMotion();
    const frame = reduced ? null : p.originRect();

    enterAnimation.current = frame
      ? root.animate(
          [
            collapsedRoomFrame(frame, {
              width: root.clientWidth,
              height: root.clientHeight,
            }),
            OPEN_ROOM_FRAME,
          ],
          { duration: ROOM_ENTER_MS, easing: ROOM_EASE_ENTER },
        )
      : root.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 200,
          easing: "linear",
        });

    // Chrome arrives as the film settles, not while it is still travelling.
    for (const node of root.querySelectorAll<HTMLElement>(
      "[data-film-chrome]",
    )) {
      node.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 220,
        delay: frame ? ROOM_ENTER_MS * 0.55 : 0,
        easing: "linear",
        fill: "backwards",
      });
    }
    // A remount (React's development double-invoke, or a fast re-open) must
    // not leave a second entrance composited over the first.
    return () => enterAnimation.current?.cancel();
    // Mount-only: the entrance plays once, from where the room was opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Chrome idle ─────────────────────────────────────────────────────── */

  // Arms the collapse. A focused control or an open menu/dialog re-arms
  // instead of collapsing, so chrome never fades under someone's keyboard.
  const arm = useCallback(() => {
    function schedule() {
      if (idleRef.current) window.clearTimeout(idleRef.current);
      idleRef.current = window.setTimeout(() => {
        const focused = document.activeElement;
        const root = rootRef.current;
        const focusHolds =
          focused instanceof HTMLElement &&
          root?.contains(focused) &&
          focused !== root &&
          focused !== videoRef.current;
        if (focusHolds || overlayIsOpen()) {
          schedule();
          return;
        }
        setChrome(false);
      }, IDLE_MS);
    }
    schedule();
  }, []);

  // Read inside `wake`, which has to stay stable: it is the window key
  // handler's dependency, and re-subscribing that on every play/pause is a
  // cost for nothing.
  const playingRef = useRef(false);

  const wake = useCallback(() => {
    setChrome(true);
    // R2: the collapse only runs while the film is playing. A wake while
    // paused puts the chrome up and leaves it up — there is nothing to re-arm.
    if (playingRef.current) arm();
  }, [arm]);

  /**
   * The collapse clock runs off playback, not off the mount (R2).
   *
   * "After 3s of stillness **while playing**" — a viewer who paused to look at
   * something is not idle, and the room used to fade the transport out from
   * under them three seconds after they stopped the film. So: playing arms it,
   * and a pause clears it (the element's own `pause` handler is what puts the
   * chrome back, because that is an event and not a synchronization). The
   * holds inside `arm` — focus in the room, an open menu — are unchanged and
   * still re-arm rather than collapse.
   */
  useEffect(() => {
    playingRef.current = playing;
    if (!playing) {
      if (idleRef.current) window.clearTimeout(idleRef.current);
      idleRef.current = null;
      return;
    }
    arm();
    return () => {
      if (idleRef.current) window.clearTimeout(idleRef.current);
    };
  }, [playing, arm]);

  /* ── Keyboard ────────────────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isFormControl(e.target)) return;
      // A control that owns its own keys (the movable scoreboard) — its
      // arrows move it, not the film.
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("[data-film-own-keys]")
      ) {
        return;
      }
      if (overlayIsOpen()) return;
      wake();
      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        // Up/Down are kept as plain aliases for previous/next point — phase 1
        // taught them and nothing else in the room wants them (author
        // decision 2026-09-21). Left/Right carry the H2 seek behaviour below.
        case "ArrowUp":
          e.preventDefault();
          step(-1);
          break;
        case "ArrowDown":
          e.preventDefault();
          step(1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) {
            seek((videoRef.current?.currentTime ?? 0) - 5);
          } else {
            step(-1);
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) {
            seek((videoRef.current?.currentTime ?? 0) + 5);
          } else {
            step(1);
          }
          break;
        case "l":
        case "L":
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          e.preventDefault();
          setLooping((v) => !v);
          break;
        case "s":
        case "S":
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          e.preventDefault();
          toggleSavedActive();
          break;
        case "m":
        case "M":
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          e.preventDefault();
          toggleMute();
          break;
        case "c":
        case "C":
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          e.preventDefault();
          toggleCourt();
          break;
        case "d":
        case "D":
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          e.preventDefault();
          setSkipDead((v) => !v);
          break;
        case "p":
        case "P":
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          e.preventDefault();
          if (panelOpen) collapsePanel();
          else openPanel();
          break;
        case ">":
          e.preventDefault();
          cycleRate(1);
          break;
        case "<":
          e.preventDefault();
          cycleRate(-1);
          break;
        case "Escape":
          e.preventDefault();
          if (panelOpen) collapsePanel();
          else exit();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    wake,
    togglePlay,
    seek,
    step,
    toggleSavedActive,
    toggleMute,
    toggleCourt,
    cycleRate,
    panelOpen,
    openPanel,
    collapsePanel,
    exit,
  ]);

  /* ── Focus trap ──────────────────────────────────────────────────────── */

  /**
   * Tab is trapped inside the room (R1), on its own effect.
   *
   * Separate from the shortcut handler above on purpose: that one is about
   * what the film does, this one is about where focus goes, and the two have
   * different stand-down rules. The ring is read at the moment Tab is pressed
   * rather than held in state — the chrome collapses, the drawer opens, the
   * court's header glyphs drop out of the tab order, so any cached list would
   * be describing a room that is no longer on screen.
   *
   * It stands down entirely while a menu or dialog is open: Radix portals its
   * surfaces to `body`, outside this root, and they run their own trap. Two
   * traps fighting over one Tab is how focus ends up somewhere neither of them
   * meant.
   */
  useEffect(() => {
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (overlayIsOpen()) return;
      const root = rootRef.current;
      if (!root) return;

      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (el) =>
          // Taken out of the tab order, or not drawn at all: a collapsed
          // chrome's glyphs are still in the DOM and must not be tab stops.
          el.tabIndex >= 0 &&
          el.getClientRects().length > 0 &&
          el.closest('[aria-hidden="true"]') === null,
      );
      const active =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const next = nextFocusTarget(focusables, active, e.shiftKey);
      // Nothing to move to — leave Tab to the browser rather than swallow it.
      if (!next) return;
      e.preventDefault();
      next.focus();
    };
    window.addEventListener("keydown", onTab);
    return () => window.removeEventListener("keydown", onTab);
  }, []);

  /* ── Render ──────────────────────────────────────────────────────────── */

  const fade = cn(
    "transition-opacity duration-200",
    chrome ? "opacity-100" : "pointer-events-none opacity-0",
  );

  return createPortal(
    <TooltipProvider>
      <div
        ref={rootRef}
        // The room covers the page, locks its scroll and traps Tab, so it is a
        // modal dialog and says so (R1). It must NEVER gain `data-state`:
        // `overlayIsOpen()` above matches `[role="dialog"][data-state="open"]`
        // to stand the room's own keys and idle timer down for a menu, and a
        // room that matched that selector would freeze both against itself.
        role="dialog"
        aria-modal="true"
        aria-label="Film room"
        tabIndex={-1}
        onPointerMove={wake}
        onPointerDown={wake}
        onFocus={wake}
        className={cn(
          "fixed inset-0 z-50 overflow-clip bg-black outline-none",
          // R2 counts the cursor among the operable things that go: it is the
          // one piece of chrome the viewer's own hand draws. The first pointer
          // move brings it back, which `wake` is already listening for.
          !chrome && "cursor-none",
        )}
      >
        {p.problem ? (
          // The hook's terminal state, in the room's own palette. "Back to the
          // report" comes first because leaving is the one thing that always
          // works; the second button appears only where asking again could
          // honestly change the answer.
          <div
            role="alert"
            data-testid="film-room-problem"
            data-film-problem={p.problem.reason}
            className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center"
          >
            <span className="text-[16px] text-white">
              {ROOM_PROBLEM_TITLES[p.problem.reason]}
            </span>
            <span className="max-w-[380px] text-[12px] text-white/60">
              {p.problem.message}
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={exit}
                className={advButton("outline", "md")}
              >
                {FILM_REFUSAL_COPY.buttons.back}
              </button>
              {p.problem.canRetry && (
                <button
                  type="button"
                  onClick={p.onRetry}
                  className={advButton("primary", "md")}
                >
                  {FILM_REFUSAL_COPY.buttons.retry}
                </button>
              )}
            </div>
          </div>
        ) : failed ? (
          // The Advantage Intelligence lineage, unchanged: nothing re-signs
          // that URL, so a reload is the whole repair.
          <div
            role="alert"
            data-testid="film-room-reload"
            className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center"
          >
            <span className="text-[16px] text-white">
              {FILM_REFUSAL_COPY.loadFailure.heading}
            </span>
            {/* The body is this panel's own: the table's sentence is about a
                stream that broke, and this one is about a credential that
                expired, which has a different repair. */}
            <span className="max-w-[380px] text-[12px] text-white/60">
              Playback links are signed for a short window and this one has run
              out. Reloading the page signs a fresh one.
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={exit}
                className={advButton("outline", "md")}
              >
                {FILM_REFUSAL_COPY.buttons.back}
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className={advButton("primary", "md")}
              >
                Reload
              </button>
            </div>
          </div>
        ) : (
          <>
            <video
              // The reload key. `videoReady` is deliberately NOT reset with
              // it: a silent refresh should be invisible, and fading the room
              // to black and back is the most visible thing it could do.
              key={p.generation}
              ref={videoRef}
              src={p.url ?? undefined}
              preload="metadata"
              playsInline
              data-testid="film-room-video"
              data-generation={p.generation}
              data-film-seeking={settling.seeking ? "true" : undefined}
              className={cn(
                "absolute inset-0 h-full w-full object-contain transition-opacity duration-200",
                // Not ready wins; a seek past its grace dims the held frame.
                !videoReady
                  ? "opacity-0"
                  : settling.seeking
                    ? "opacity-60"
                    : "opacity-100",
              )}
              onLoadedData={() => setVideoReady(true)}
              onClick={togglePlay}
              // R1 (2026-09-22): click the film plays/pauses. Double-click no
              // longer exits — a fast click burst (click, click, dblclick)
              // was throwing the viewer out of the room on an ordinary rapid
              // pause/play. The three exits that remain are Esc, the
              // transport's minimize control, and "Back to the report".
              onPlay={() => {
                setPlaying(true);
                playingRef.current = true;
                landingRef.current.playing = true;
                p.onPlaybackPlaying(true);
              }}
              onPause={() => {
                setPlaying(false);
                playingRef.current = false;
                landingRef.current.playing = false;
                // A pause is the end of the collapse's only reason to run, so
                // the chrome comes back with it and stays up (R2).
                setChrome(true);
                p.onPlaybackPlaying(false);
              }}
              // `landingRef` is seeded from the report player's hand-off, so
              // the first mount seeds exactly as it always did; later mounts
              // are credential swaps and land where playback had got to.
              onLoadedMetadata={settle}
              onDurationChange={(e) => {
                setDuration(e.currentTarget.duration || 0);
                syncClock();
              }}
              onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
              onSeeking={settling.onSeeking}
              onSeeked={(e) => {
                settling.onSeeked();
                mark(e.currentTarget.currentTime);
                syncClock();
              }}
              onError={() =>
                p.passthrough ? setFailed(true) : p.onLoadFailure()
              }
            >
              Your browser cannot play this video.
            </video>

            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{ background: TOP_SCRIM }}
            />
            <span
              aria-hidden="true"
              data-film-chrome
              // Never takes the pointer, chrome up or down: it lies over the
              // whole film, and a click on the film is play/pause.
              className={cn("pointer-events-none absolute inset-0", fade)}
              style={{ background: BOTTOM_SCRIM }}
            />

            {/* R11: one condition, so the board and the court arrive together
                the moment the first point resolves — never one without the
                other, and never a board for a point nobody is on. */}
            {firstPointReached && (
              <>
                <FilmScoreboard
                  board={board}
                  // Between points the board says nothing about a point; T4's
                  // foot falls back to the game state on a null name (R7).
                  pointName={
                    activePoint ? activePoint.resultType || "Point" : null
                  }
                  playing={playing}
                  elapsed={formatClock(currentTime)}
                  // The point the bookmark control saves (T13), not the
                  // playing one — so the glyph and the control can never
                  // disagree about which point is bookmarked.
                  saved={savePoint?.saved ?? false}
                  // You/opponent is `useMatchSides()`'s call, never player order.
                  wonByYou={
                    activePoint
                      ? activePoint.wonByPlayer1 === sides.you.isPlayer1
                      : null
                  }
                  dim={!chrome}
                  onRest={onBoardRest}
                />

                {courtOn && boardColumn && roomSize && (
                  // The court starts in the board's own column and travels on
                  // the board's curve, so the two land together — until the
                  // viewer drags it to a corner of its own, which it then
                  // keeps (R6's court rule, as revised 2026-09-22). The drawer
                  // moves neither object. Turning the court off gives that
                  // column back to the film and leaves the board where it is
                  // (R9). Between points it stays mounted and keeps its lines
                  // — `mode` goes quiet, the card does not (R7).
                  <FilmCourtLayer
                    board={boardColumn}
                    room={roomSize}
                    court={{
                      mode: courtCardMode,
                      title: courtTitle,
                      caption: courtCaption,
                      marks: courtMarks,
                      // Who is who is `useMatchSides()`'s call, never player order.
                      youName: lastNameOf(sides.you.name),
                      opponentName: lastNameOf(sides.opp.name),
                      controls: chrome,
                      onSwapMode: swapCourtMode,
                      // The header x and the transport's control are one toggle.
                      onHide: toggleCourt,
                      onSelectMark: selectMark,
                      seekKey,
                    }}
                  />
                )}
              </>
            )}

            <ChromeTooltip label="Points" shortcut="P" side="bottom">
              <button
                data-film-chrome
                type="button"
                onClick={openPanel}
                aria-expanded={panelOpen}
                aria-hidden={panelOpen ? true : undefined}
                tabIndex={panelOpen ? -1 : undefined}
                className={cn(
                  "absolute top-[18px] right-6 inline-flex h-7 cursor-pointer items-center gap-[7px] rounded-[var(--radius-button)] bg-[rgba(13,13,13,0.72)] px-2.5 text-[11px] font-medium text-white transition-[opacity,transform,background-color] duration-200 ease-[var(--ease-primary)] hover:bg-[rgba(13,13,13,0.9)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                  // Back as soon as the drawer starts leaving, so a quick re-open
                  // can catch the sheet mid-slide and turn it around. The slide
                  // belongs to the drawer: the chrome collapse is opacity alone,
                  // because R2 is explicit that nothing reflows or travels.
                  chrome && !panelOpen
                    ? "opacity-100"
                    : "pointer-events-none opacity-0",
                  panelOpen && "motion-safe:translate-x-2",
                )}
              >
                <PanelRight
                  className="h-[13px] w-[13px]"
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
                Points
              </button>
            </ChromeTooltip>

            {/* A full-size positioning layer for the bottom block. It must never
                take clicks itself: it sits above the video and the Points
                trigger, and when it did, a real click on either landed here
                and did nothing. Only the transport block is interactive, and
                only while the chrome is showing. */}
            <div
              data-film-chrome
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0",
                // The drawer's edge and the transport's edge travel together:
                // same curve and length in, the drawer's quicker curve out.
                // The collapse fade sits on the bar itself rather than here,
                // so R2's 200ms opacity is not overridden by this longer
                // travel — the two changes are unrelated and read as such.
                panelOpen
                  ? "right-[320px] transition-[right] duration-[420ms] ease-[var(--ease-out-expo)]"
                  : "right-0 transition-[right] duration-[240ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
              )}
            >
              <FilmTransport
                className={cn(
                  fade,
                  chrome ? "pointer-events-auto" : "pointer-events-none",
                )}
                title={`${sides.you.name} v ${sides.opp.name}`}
                subtitle={subtitle || null}
                position={position}
                segments={segments}
                duration={duration}
                currentTime={currentTime}
                playing={playing}
                muted={muted}
                rate={rate}
                looping={looping}
                skippingDeadTime={skipDead}
                saved={savePoint ? savePoint.saved : null}
                canStep={p.walkStops.length > 0}
                courtOn={courtOn}
                onSeek={seek}
                onTogglePlay={togglePlay}
                onStep={step}
                onToggleSaved={toggleSavedActive}
                onToggleSkipDeadTime={() => setSkipDead((v) => !v)}
                onCycleRate={cycleRate}
                onToggleLoop={() => setLooping((v) => !v)}
                onToggleMute={toggleMute}
                onToggleCourt={toggleCourt}
                onExit={exit}
              />
            </div>

            {panel !== "closed" && (
              <FilmRoomDrawer
                state={panel}
                onExited={() => setPanel("closed")}
                onCollapse={collapsePanel}
                allPoints={p.allPoints}
                visiblePoints={p.visiblePoints}
                filters={p.filters}
                onFiltersChange={p.onFiltersChange}
                // Between points no row is lit, and the progress rule belongs
                // to the row that is (R7) — so both read the playing point,
                // never the last one reached.
                activePointId={activePoint?.id ?? null}
                activeStart={playingStop?.start ?? 0}
                activeEnd={playingStop?.end ?? 0}
                onSelect={selectPoint}
                onToggleSaved={p.onToggleSaved}
                shotStops={shotStops}
                activeShotId={activeShot?.stop.shot.id ?? null}
                onSelectShot={selectShot}
              />
            )}
          </>
        )}
      </div>
    </TooltipProvider>,
    document.body,
  );
}
