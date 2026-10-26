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
import {
  isDerivedMatch,
  pointResultLabel,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
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
  filmListActive,
  filmListName,
  lastNameOf,
  type FilmListFilters,
} from "./film-list-filters";
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
import { useSkipDead } from "./use-skip-dead";
import { skipDeadAction, type SkipDeadMemo } from "./film-sequence";
import { FilmScoreboard } from "./film-scoreboard";
import { useFilmClockVars } from "./film-clock";
import { useFilmTrace } from "./use-film-trace";
import {
  OPEN_ROOM_FRAME,
  PANEL_EXIT_MS,
  ROOM_EASE_ENTER,
  ROOM_EASE_EXIT,
  ROOM_ENTER_MS,
  ROOM_EXIT_MS,
  collapsedRoomFrame,
  reducedMotionNow as prefersReducedMotion,
  roomMotionPath,
  type Rect,
} from "./film-motion";
import {
  activeShotAt,
  rallyNumbering,
  shotStops as buildShotStops,
  stepShot,
} from "./film-shots";
import {
  activeStopAt,
  setSegments,
  nextStop,
  playingStopAt,
  prevStop,
  REACHED_EPSILON_SECONDS,
  displayedPointId as displayedPointOf,
  nowPlayingOf,
  type FilmClock,
  type FilmStop,
  type PointFocus,
} from "./film-timeline";
import { FilmTransport, PLAYBACK_RATES } from "./film-transport";
import type {
  AttachmentPlaybackProblem,
  AttachmentResumeIntent,
} from "./use-attachment-playback";
import { useBallPaths } from "./use-ball-paths";
import { useSeekSettling } from "./use-seek-settling";
import { useFilmReadOnly } from "./film-read-only";

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
 * chrome fades in once the film has landed. The transform is about the room's
 * top-left corner (`origin-top-left`, and `transformOrigin` in every keyframe)
 * — the keyframe maths assumes it, and the default centre origin started the
 * room beside the player. A frame with no area on screen (the ⇧-click door
 * from a scrolled-away player) has nothing to grow from, so the room fades in
 * over 200ms instead, its chrome with it. Exit runs the entrance backwards
 * in 320ms, INTO the report frame, when that frame is on screen, and fades
 * over 180ms when it is not (the window resized under the room, or the
 * ⇧-click door opened it from a scrolled-off player). Either way the playhead
 * is handed back first, so the report player is already on this frame, then
 * the chrome leaves and the room goes. The points drawer slides on the same
 * curve and the transport's right edge travels with it. Progress rules and
 * the playhead read `--film-t` (`film-clock.ts`), so they move every frame
 * instead of every `timeupdate`. Reduced motion keeps every change as an
 * opacity fade and drops the travel.
 *
 * ── Chrome ──────────────────────────────────────────────────────────────────
 * 3s of stillness **while the film is playing** collapses everything operable
 * — the transport, the "Points" trigger, the court's header glyphs, the
 * bottom scrim and the cursor. The board and the court keep their boxes. Any
 * pointer, key or focus is activity, a focused control holds the chrome up,
 * and a pause puts it back: someone who stopped the film to look at something
 * is not idle.
 */

/** What the room opens from: the report player's playhead, and its element. */
export interface FilmRoomEntry {
  time: number;
  playing: boolean;
  /**
   * The report player's own `<video>`, mirrored onto a canvas over the room's
   * element until that element has the picture itself. The room's element
   * starts cold — metadata and a seek on a large file take seconds — and
   * without the mirror the room grew in black and then stalled, which read as
   * a broken film. A PLAYING report player is left playing under the mirror
   * (its sound too) and handed over frame-for-frame; see `handoffRef`.
   * Absent on the ⇧-click door, which opens somewhere the player is not.
   */
  source?: HTMLVideoElement | null;
}

/** How far ahead of the report player the room parks its element to take over. */
const HANDOFF_LEAD_SECONDS = 1.5;
/** Parks that the report player outran before the room takes over unsynced. */
const HANDOFF_MAX_ATTEMPTS = 3;

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
  /**
   * The first `play` event of each loaded source (`generation`) in this room
   * — a view of the video (SwingVision Add video T8). See `film-player.tsx`.
   */
  onFirstPlay?: (generation: number) => void;
  onRetry: () => void;
  /**
   * The film clock `stops` were built from — passed in rather than rebuilt
   * from `video`, so the room's shot feed converts through the very same
   * alignment the report tab's points did.
   */
  clock: FilmClock;
  /** Where the report player was when the room opened. */
  initial: FilmRoomEntry;
  /** Every timed point on the film clock — the board, the track, the playing row. */
  stops: FilmStop[];
  /** The applied cut on the film clock — what ← → and prev/next walk. */
  walkStops: FilmStop[];
  columns: BoardColumns;
  allPoints: MatchPoint[];
  visiblePoints: MatchPoint[];
  /** The list's filter layers, handed to the drawer's list untouched. */
  filmFilters: FilmListFilters;
  /**
   * Absent on a read-only report: no Save glyph on the transport, no bookmark
   * button in the drawer, and S does nothing.
   */
  onToggleSaved?: (pointId: string) => void;
  /**
   * Follow-or-hold (T17 design), owned by `FilmRoom` so it outlives this
   * room. The state and the two callbacks are forwarded to the drawer's list
   * untouched; the DISPLAYED point is derived here from the room's own
   * playing point, because the displayed point is per surface (the design's
   * "drawer: `playingStop`, shell: `activeStopAt`") and the shell's playhead
   * does not move while the room is open — `onPlaybackTime` feeds the
   * credential hook's anchor, not the tab's clock. The room's own `step`
   * calls `onFollow` because stepping means "take me on".
   */
  pointFocus: PointFocus;
  onHoldPoint: (pointId: string | null) => void;
  onFollow: () => void;
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
          // The glide is for landing in a corner, never for following the
          // pointer: with it on during a drag every move is eased over 360ms
          // and the card trails the cursor, then slides again on release from
          // wherever the easing had got to. Same rule as the board ("moving
          // the court should be as easy as moving the scorecard", author
          // 2026-09-22).
          !move.free && move.placed && SETTLE_CLASS,
          // Held is the focus outline at full weight, as on the board (R6).
          move.held && "shadow-[var(--focus-ring)]",
        )}
        style={{ left: move.position.left, top: move.position.top }}
      >
        <span id="film-court-hint" className="sr-only">
          Drag the court card to move it, or press the arrow keys to nudge it 8
          pixels at a time — 40 with Shift. Space picks it up and drops it into
          the nearest corner; Escape cancels the move.
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

/**
 * The room's current size, plus the frame to travel from/to and which path
 * (`roomMotionPath`) that travel takes — shared by the entrance and exit
 * animations, which read the same three things from the same root element.
 * The rect is never read under reduced motion: there is no travel to aim.
 */
function roomTravel(root: HTMLElement, originRect: () => Rect | null) {
  const roomSize = { width: root.clientWidth, height: root.clientHeight };
  const reduced = prefersReducedMotion();
  const frame = reduced ? null : originRect();
  const path = reduced ? "fade" : roomMotionPath(frame, roomSize);
  return { roomSize, frame, path };
}

export function FilmFullscreen(p: FilmFullscreenProps) {
  const { match } = useMatchData();
  const readOnly = useFilmReadOnly();
  const sides = useMatchSides();

  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const idleRef = useRef<number | null>(null);

  // A room opened on a playing report player IS playing from its first frame:
  // the mirror shows that film until this element takes over (`handoffRef`).
  const initialHandoff = Boolean(p.initial.source) && p.initial.playing;
  const [playing, setPlaying] = useState(initialHandoff);
  const [handingOff, setHandingOff] = useState(initialHandoff);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(p.initial.time);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState<number>(1);
  const [looping, setLooping] = useState(false);
  // Shared with the report player (`use-skip-dead.ts`): the film keeps
  // skipping, or not, on the way into the room. On by default.
  const [skipDead, toggleSkipDead] = useSkipDead();
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
  // The report player's element, mirrored over this one until this one has
  // the picture (`FilmRoomEntry.source`). One-way: once dropped it never comes
  // back for this room.
  const source = p.initial.source ?? null;
  const [mirrorUp, setMirrorUp] = useState(source !== null);
  // Dropped only once this element shows a frame where it stands: not while
  // it seeks, nor before it has one. `loadeddata` can fire for the frame at 0
  // with the seek to the landing still under way, and dropping then left the
  // room black. A drop asked for too early waits for `seeked` / `canplay`.
  const mirrorDropPending = useRef(false);
  const dropMirror = useCallback(() => {
    const el = videoRef.current;
    if (el && (el.seeking || el.readyState < 2)) {
      mirrorDropPending.current = true;
      return;
    }
    mirrorDropPending.current = false;
    setMirrorUp(false);
  }, []);
  const settleMirrorDrop = useCallback(() => {
    if (mirrorDropPending.current) dropMirror();
  }, [dropMirror]);
  const mirrorRef = useRef<HTMLCanvasElement>(null);
  /**
   * The hand-off from a playing report player. It plays on under the mirror
   * while this element loads and parks, paused, at `target` — a beat ahead —
   * and this element starts the moment the report player reaches that frame,
   * so the film never stops. A report player that outruns the park is parked
   * ahead of again; after {@link HANDOFF_MAX_ATTEMPTS} the room takes over
   * where the report player is and lets the buffer catch up. Any seek, pause
   * or exit ends the hand-off first. `handingOff` is the same flag as state,
   * for what renders from it.
   */
  const handoffRef = useRef({
    active: initialHandoff,
    target: null as number | null,
    attempts: 0,
  });
  const endHandoff = useCallback(() => {
    handoffRef.current.active = false;
    setHandingOff(false);
    source?.pause();
  }, [source]);
  // T16: the frame admits it is still catching up with a seek the chrome has
  // already made. Display only — `seek` is untouched and still marks on click.
  const settling = useSeekSettling({ graceMs: 120, generation: p.generation });
  const traceRef = useFilmTrace(videoRef, p.generation, "room");

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

  // During the hand-off the mirror loop writes `--film-t` off the report
  // player; this element is parked ahead and would write the wrong time.
  const syncClock = useFilmClockVars(videoRef, rootRef, playing && !handingOff);

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
  /** The generation whose first `play` has already been reported (T8). */
  const firstPlayRef = useRef<number | null>(null);

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
  // The drawer's well: the held point while held, else the room's playing one.
  const displayedPointId = displayedPointOf(
    p.pointFocus,
    activePoint?.id ?? null,
  );
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
    // Not on a shared link: the route asks for a session and would refuse.
    enabled: courtOn && match.sourceProvider === "splitstep" && !readOnly,
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
        pointShots: activePoint?.shots,
      },
    );
  }, [
    activePoint,
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
      ? filmListActive(p.filmFilters)
        ? filmListName(p.filmFilters, {
            you: lastNameOf(sides.you.name),
            opponent: lastNameOf(sides.opp.name),
          })
        : "Whole match"
      : "This point";
  // The point's caption is the rally's length (`rallyNumbering`, from the
  // point's full shot list) — the same total the readout's "shot 3 of 7" is
  // out of — so the two can never disagree about how long the rally was.
  const rallyShots = useMemo(
    () => rallyNumbering(activePoint?.shots).count,
    [activePoint],
  );
  const courtCaption =
    courtMode === "match"
      ? `${p.visiblePoints.length} points`
      : `${rallyShots} ${rallyShots === 1 ? "shot" : "shots"}`;

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

  // The drawer's pill names the playing point by the same number the
  // transport's `Point 14 / 87` prints; `index: null` is a point the cut
  // excludes. Memoized: the drawer's list is memoized on it.
  const nowPlaying = useMemo(
    () => nowPlayingOf(activePoint, position),
    [activePoint, position],
  );

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
      // A seek during the hand-off ends it: this element plays from here.
      const tookOver = handoffRef.current.active;
      if (tookOver) endHandoff();
      el.currentTime = target;
      // The mirror is the opening moment; a seek is a different one.
      dropMirror();
      if (tookOver && readyRef.current) {
        void el.play().catch(() => p.onPlayRejected());
      }
      mark(target);
      rootRef.current?.style.setProperty("--film-t", String(target));
      // Whatever the court's readout was explaining is no longer on screen.
      setSeekKey((k) => k + 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mark, traceRef, dropMirror, endHandoff, p.onPlayRejected],
  );

  /** Park this element, paused, a beat ahead of the report player. */
  const primeHandoff = useCallback(() => {
    const el = videoRef.current;
    const handoff = handoffRef.current;
    if (!el || !source || !readyRef.current) return;
    handoff.attempts += 1;
    const target = source.currentTime + HANDOFF_LEAD_SECONDS * handoff.attempts;
    handoff.target = target;
    el.currentTime = target;
  }, [source]);

  /**
   * Put a fresh element back where the old one was — the room's half of the
   * credential swap. Either the element's metadata or the hook's resume intent
   * can arrive last, so both call this.
   */
  const land = useCallback(() => {
    const el = videoRef.current;
    if (!el || !readyRef.current) return;
    if (handoffRef.current.active) {
      primeHandoff();
      return;
    }
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
      void el.play().catch(() => {
        dropMirror();
        p.onPlayRejected();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mark, p.onPlayRejected, dropMirror, primeHandoff]);

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
    // Mid-hand-off the film playing is the report player's, so this is a
    // pause: stop it, and put this element on the frame it stopped at.
    if (handoffRef.current.active && source) {
      endHandoff();
      setPlaying(false);
      landingRef.current = { time: source.currentTime, playing: false };
      mark(source.currentTime);
      land();
      return;
    }
    // A rejected play() is not a broken film: a pause landing before play
    // resolves (a quick double Space) rejects with AbortError, and an autoplay
    // refusal with NotAllowedError. Only the element's own `error` event means
    // the file can't be played.
    if (el.paused) void el.play().catch(() => p.onPlayRejected());
    else el.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.onPlayRejected, source, endHandoff, mark, land]);

  /**
   * One tick of the hand-off, off the mirror loop: take over once the report
   * player reaches the parked frame and this element can play through it.
   */
  const tryTakeOver = useCallback(
    (t: number) => {
      const el = videoRef.current;
      const handoff = handoffRef.current;
      if (!el || !source || handoff.target === null || !readyRef.current) {
        return;
      }
      const giveUp = () => {
        endHandoff();
        landingRef.current = { time: source.currentTime, playing: true };
        land();
      };
      // The report player stopped on its own (its end, a stall that errored).
      if (source.paused || source.ended) {
        giveUp();
        return;
      }
      const ready = !el.seeking && el.readyState >= 3;
      if (t > handoff.target + (ready ? 0.25 : 0)) {
        // Outran the park: further ahead, or stop chasing.
        if (handoff.attempts >= HANDOFF_MAX_ATTEMPTS) giveUp();
        else primeHandoff();
        return;
      }
      if (!ready || t < handoff.target - 1 / 60) return;
      endHandoff();
      landingRef.current = { time: handoff.target, playing: true };
      void el.play().catch(() => {
        dropMirror();
        p.onPlayRejected();
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, endHandoff, land, primeHandoff, dropMirror, p.onPlayRejected],
  );

  /**
   * The mirror: the report player's frames painted every animation frame
   * while it is up, and — during the hand-off — the playhead read off it, so
   * the board, the track and the counters move with the film being shown.
   * `mark` is throttled to the rate `timeupdate` would deliver.
   */
  useEffect(() => {
    if (!mirrorUp || !source) return;
    const canvas = mirrorRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let frame = 0;
    let lastMark = 0;
    let durationTaken = false;
    const draw = () => {
      // The report player already knows the length; this element will not
      // until its metadata lands, and the track reads a zero length as full.
      if (
        !durationTaken &&
        Number.isFinite(source.duration) &&
        source.duration > 0
      ) {
        durationTaken = true;
        setDuration((d) => d || source.duration);
        rootRef.current?.style.setProperty("--film-d", String(source.duration));
      }
      if (source.videoWidth > 0) {
        if (canvas.width !== source.videoWidth)
          canvas.width = source.videoWidth;
        if (canvas.height !== source.videoHeight) {
          canvas.height = source.videoHeight;
        }
        try {
          ctx.drawImage(source, 0, 0);
        } catch {
          // No frame to draw yet; the next tick tries again.
        }
      }
      if (handoffRef.current.active) {
        const t = source.currentTime;
        rootRef.current?.style.setProperty("--film-t", String(t));
        const now = performance.now();
        if (now - lastMark > 250) {
          lastMark = now;
          mark(t);
        }
        tryTakeOver(t);
      } else if (!readyRef.current) {
        // Paused entry: this element reads 0 until its metadata lands.
        rootRef.current?.style.setProperty(
          "--film-t",
          String(landingRef.current.time),
        );
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [mirrorUp, source, mark, tryTakeOver]);

  /**
   * Where the film being SHOWN is: the report player's time during the
   * hand-off (this element is parked ahead of it), and before this element
   * has metadata the landing time rather than its 0.
   */
  const filmNow = useCallback(() => {
    if (handoffRef.current.active && source) return source.currentTime;
    const el = videoRef.current;
    return el && readyRef.current ? el.currentTime : landingRef.current.time;
  }, [source]);

  const { onFollow } = p;
  const step = useCallback(
    (direction: -1 | 1) => {
      // Stepping means "take me on": ← → ↑ ↓ and the transport chevrons
      // re-follow first, then walk from the PLAYING point — even at the end
      // of the cut, where there is nothing left to step to.
      onFollow();
      const now = filmNow();
      const stop =
        direction === 1
          ? nextStop(p.walkStops, now)
          : prevStop(p.walkStops, now);
      if (stop) seek(stop.start);
    },
    [p.walkStops, onFollow, filmNow, seek],
  );

  // ↑ ↓ walk SHOTS, over the cut ← → walk. Built on the press rather than
  // read from `shotStops`, which stays empty while the drawer and the court
  // are both away (it is a few thousand shots to place on every tick).
  const stepShotBy = useCallback(
    (direction: -1 | 1) => {
      onFollow();
      const shot = stepShot(
        buildShotStops(p.walkStops, p.clock),
        filmNow(),
        direction,
      );
      if (shot) seek(shot.start);
    },
    [p.walkStops, p.clock, onFollow, filmNow, seek],
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

  // The literal `<FilmCourtLayer court={{ … }}>` reads below would otherwise
  // rebuild every render; every field here is already stable (a primitive,
  // or itself a `useMemo`/`useCallback`), so memoizing the object costs
  // nothing.
  const court = useMemo<
    Omit<FilmCourtProps, "dock" | "handleProps" | "grabbing">
  >(
    () => ({
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
    }),
    [
      courtCardMode,
      courtTitle,
      courtCaption,
      courtMarks,
      sides.you.name,
      sides.opp.name,
      chrome,
      swapCourtMode,
      toggleCourt,
      selectMark,
      seekKey,
    ],
  );

  const toggleSavedActive = useCallback(() => {
    if (savePoint) p.onToggleSaved?.(savePoint.id);
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

  // Exit order: pause → `p.onHandoff(time)` → chrome 120ms fade-out → the
  // root's shrink (or fade) → `p.onExit` once that animation has finished.
  const exit = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    const el = videoRef.current;
    // Mid-hand-off the film is still the report player's, and so is its time.
    const handing = handoffRef.current.active && source !== null;
    if (handing) endHandoff();
    const wasPlaying = handing || (el ? !el.paused : false);
    el?.pause();
    const state = {
      time: handing ? source.currentTime : (el?.currentTime ?? currentTime),
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

    // A frame with no area on screen (the window resized under the room, or
    // the ⇧-click door from a scrolled-off player) has nothing to shrink into.
    const { roomSize, frame, path } = roomTravel(root, p.originRect);
    const animation =
      path === "frame" && frame
        ? root.animate([OPEN_ROOM_FRAME, collapsedRoomFrame(frame, roomSize)], {
            duration: ROOM_EXIT_MS,
            easing: ROOM_EASE_EXIT,
            fill: "forwards",
          })
        : root.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 180,
            easing: "linear",
            fill: "forwards",
          });
    void animation.finished.catch(() => {}).then(() => p.onExit(state));
  }, [p, currentTime, source, endHandoff]);

  // The point the film was last inside, for Loop. Loop cannot ask
  // `activeStopAt` at the end of a window: a window clamped to the next one's
  // start (a point with no duration, or two points close together) hands over
  // to the next point just before its own end, so "past the end of the active
  // point" is never true and the film ran on.
  const loopStopRef = useRef<FilmStop | null>(null);
  const skipMemoRef = useRef<SkipDeadMemo<FilmStop>>({
    inside: null,
    lastJump: null,
  });

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
      // Over the cut, as the report player: only the listed points play.
      // Only while playing — a paused scrub into the dead time stays put.
      if (skipDead && playing) {
        const action = skipDeadAction(p.walkStops, t, skipMemoRef.current);
        if (action?.kind === "seek") seek(action.to);
        else if (action?.kind === "pause") videoRef.current?.pause();
      }
    },
    [p.stops, p.walkStops, looping, skipDead, playing, seek, syncClock, mark],
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
    const { roomSize, frame, path } = roomTravel(root, p.originRect);

    enterAnimation.current =
      path === "frame" && frame
        ? root.animate([collapsedRoomFrame(frame, roomSize), OPEN_ROOM_FRAME], {
            duration: ROOM_ENTER_MS,
            easing: ROOM_EASE_ENTER,
          })
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
        delay: path === "frame" ? ROOM_ENTER_MS * 0.55 : 0,
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
  /** The press on the film was a touch that found the chrome hidden. */
  const revealTapRef = useRef(false);

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
        // Up/Down walk shots (2026-10-19; they were plain aliases for
        // previous/next point before). Left/Right step points, and carry the
        // H2 seek behaviour below.
        case "ArrowUp":
          e.preventDefault();
          stepShotBy(-1);
          break;
        case "ArrowDown":
          e.preventDefault();
          stepShotBy(1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) {
            seek(filmNow() - 5);
          } else {
            step(-1);
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) {
            seek(filmNow() + 5);
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
          toggleSkipDead();
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
    stepShotBy,
    filmNow,
    toggleSavedActive,
    toggleMute,
    toggleCourt,
    toggleSkipDead,
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
          // `origin-top-left`: the grow/shrink keyframes assume it (and carry
          // it); a centre origin lands the first frame beside the player.
          "fixed inset-0 z-50 origin-top-left overflow-clip bg-black outline-none",
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
              // A parked hand-off element has to buffer ahead to take over
              // without a stall; otherwise metadata, as the report player.
              preload={handingOff ? "auto" : "metadata"}
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
              onLoadedData={() => {
                setVideoReady(true);
                settling.onLoadedData();
                // Paused, the mirror already shows the frame under the
                // playhead; it stays until a play or a seek takes over.
                settleMirrorDrop();
              }}
              // Playing, the mirror waits for frames that MOVE here: a play
              // that stalls on a cold buffer keeps the viewer's film up rather
              // than a black or dimmed one.
              onPlaying={dropMirror}
              onCanPlay={settleMirrorDrop}
              // A finger on a film whose chrome has faded only brings the
              // chrome back, as the iOS player does: the room's `wake` runs
              // on the same press, and a tap that also paused would stop the
              // film under someone who only reached for the controls. Read
              // here, before the room's own handler bubbles up and wakes it.
              onPointerDown={(e) => {
                revealTapRef.current = e.pointerType === "touch" && !chrome;
              }}
              onClick={() => {
                if (revealTapRef.current) {
                  revealTapRef.current = false;
                  return;
                }
                togglePlay();
              }}
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
                if (firstPlayRef.current !== p.generation) {
                  firstPlayRef.current = p.generation;
                  p.onFirstPlay?.(p.generation);
                }
              }}
              onPause={() => {
                dropMirror();
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
                // A drop a seek asked for lands with the seek's frame; the
                // landing's own seek leaves a paused entry's mirror up.
                settleMirrorDrop();
                mark(e.currentTarget.currentTime);
                syncClock();
              }}
              onError={() =>
                p.passthrough ? setFailed(true) : p.onLoadFailure()
              }
            >
              Your browser cannot play this video.
            </video>

            {source && (
              <canvas
                ref={mirrorRef}
                aria-hidden="true"
                data-testid="film-room-mirror"
                data-film-mirror={mirrorUp ? "up" : "down"}
                className={cn(
                  "pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-200",
                  mirrorUp ? "opacity-100" : "opacity-0",
                )}
              />
            )}

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
                    activePoint
                      ? pointResultLabel(activePoint, {
                          isDerived: isDerivedMatch(match),
                        })
                      : null
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
                    court={court}
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
                  // Safe-area insets as the transport's; 0 on a desktop. The
                  // 28px pill takes a 44px tap area on touch.
                  "absolute top-[max(18px,env(safe-area-inset-top))] right-[max(1.5rem,env(safe-area-inset-right))] inline-flex h-7 cursor-pointer items-center gap-[7px] rounded-[var(--radius-button)] bg-[rgba(13,13,13,0.72)] px-2.5 text-[11px] font-medium text-white transition-[opacity,transform,background-color] duration-200 ease-[var(--ease-primary)] hover:bg-[rgba(13,13,13,0.9)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none touch:hit-area",
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
                  // The room is edge to edge (`viewportFit: "cover"`), so the
                  // bar clears the home indicator and a notch's side insets.
                  // Every inset is 0 without one, leaving the 24px / 14px.
                  "pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(0.875rem,env(safe-area-inset-bottom))] pl-[max(1.5rem,env(safe-area-inset-left))]",
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
                previewSource={{ url: p.url, generation: p.generation }}
                onSeek={seek}
                onSeekBy={(delta) => seek(filmNow() + delta)}
                onTogglePlay={togglePlay}
                onStep={step}
                onToggleSaved={p.onToggleSaved ? toggleSavedActive : undefined}
                onToggleSkipDeadTime={toggleSkipDead}
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
                filmFilters={p.filmFilters}
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
                pointFocus={p.pointFocus}
                displayedPointId={displayedPointId}
                onHoldPoint={p.onHoldPoint}
                onFollow={p.onFollow}
                nowPlaying={nowPlaying}
              />
            )}
          </>
        )}
      </div>
    </TooltipProvider>,
    document.body,
  );
}
