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
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

import type { FilmFilters } from "./film-filters";
import { FilmPointPanel } from "./film-point-panel";
import { boardAt, type BoardColumns } from "./film-score";
import { FilmScoreboard } from "./film-scoreboard";
import { useFilmClockVars } from "./film-clock";
import {
  OPEN_ROOM_FRAME,
  PANEL_EXIT_MS,
  ROOM_EASE_ENTER,
  ROOM_EASE_EXIT,
  ROOM_ENTER_MS,
  ROOM_EXIT_MS,
  collapsedRoomFrame,
  type Rect,
} from "./film-motion";
import { activeShotAt, shotStops as buildShotStops } from "./film-shots";
import {
  activeStopAt,
  setSegments,
  deadTimeJump,
  nextStop,
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
 * 3s of stillness collapses everything operable; the board and the point
 * name stay. Any pointer, key or focus is activity, and a focused control
 * holds the chrome up, so it never fades under someone's keyboard.
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
  tab: "points" | "saved";
  onTabChange: (tab: "points" | "saved") => void;
  onToggleSaved: (pointId: string) => void;
  onExit: (state: { time: number; playing: boolean }) => void;
  /** The report player's frame on screen — where the room grows from and returns to. */
  originRect: () => Rect | null;
  /** Called as the exit starts, with the playhead to restore underneath. */
  onHandoff: (time: number) => void;
}

const IDLE_MS = 3000;

/**
 * A heading per terminal reason. Same four as `film-player.tsx`, because one
 * hook state must not read as two different events depending on which surface
 * the viewer happened to be on.
 */
const ROOM_PROBLEM_TITLES: Record<AttachmentPlaybackProblem["reason"], string> =
  {
    removed: "This video is no longer attached",
    denied: "You can no longer watch this video",
    unreachable: "The video could not be reached",
    unplayable: "The film stopped loading",
  };

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type PanelState = "closed" | "open" | "closing";

/**
 * True when a menu or dialog is up — the room's keys stand down.
 *
 * Radix gives both its Dialog content and its Popover content (the float
 * menus) `role="dialog"` with `data-state`, and a tooltip `role="tooltip"`,
 * so this one selector catches the two surfaces that take keys and ignores
 * the one that must never eat the space bar. `data-state="open"` matters: a
 * closing menu stays in the DOM through its exit animation.
 */
function overlayIsOpen(): boolean {
  return document.querySelector('[role="dialog"][data-state="open"]') !== null;
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
  // Placeholder for the court toggle so the transport's control is live now.
  // T12 replaces it with the persisted preference and the court itself.
  const [courtOn, setCourtOn] = useState(true);
  const [panel, setPanel] = useState<PanelState>("closed");
  const panelOpen = panel === "open";
  const [videoReady, setVideoReady] = useState(false);

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

  const active = useMemo(
    () => activeStopAt(p.stops, currentTime),
    [p.stops, currentTime],
  );
  // Before the first serve the board shows what the first point starts from.
  const boardStop = active?.stop ?? p.stops[0] ?? null;
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
  const activePoint = active?.stop.point ?? null;

  // Only the drawer reads the shot feed, and a three-set match is a few
  // thousand shots to place and then scan on every tick — so it is not built
  // until the drawer is up.
  const shotStops = useMemo(
    () => (panel === "closed" ? [] : buildShotStops(p.stops, p.clock)),
    [panel, p.stops, p.clock],
  );
  const activeShot = useMemo(
    () => activeShotAt(shotStops, currentTime),
    [shotStops, currentTime],
  );

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
      el.currentTime = target;
      mark(target);
      rootRef.current?.style.setProperty("--film-t", String(target));
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

  const toggleSavedActive = useCallback(() => {
    if (activePoint) p.onToggleSaved(activePoint.id);
  }, [activePoint, p]);

  const cycleRate = useCallback(() => {
    const i = PLAYBACK_RATES.indexOf(rate as (typeof PLAYBACK_RATES)[number]);
    const next = PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length];
    if (videoRef.current) videoRef.current.playbackRate = next;
    setRate(next);
  }, [rate]);

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
    document.body.style.overflow = "hidden";
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previous;
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

  const wake = useCallback(() => {
    setChrome(true);
    arm();
  }, [arm]);

  // Chrome starts up; the mount only starts the clock on it.
  useEffect(() => {
    arm();
    return () => {
      if (idleRef.current) window.clearTimeout(idleRef.current);
    };
  }, [arm]);

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
        case "ArrowDown":
        case "ArrowRight":
          e.preventDefault();
          step(1);
          break;
        case "ArrowUp":
        case "ArrowLeft":
          e.preventDefault();
          step(-1);
          break;
        case "l":
        case "L":
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          e.preventDefault();
          seek((videoRef.current?.currentTime ?? 0) + 5);
          break;
        case "j":
        case "J":
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          e.preventDefault();
          seek((videoRef.current?.currentTime ?? 0) - 5);
          break;
        case "s":
        case "S":
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          e.preventDefault();
          toggleSavedActive();
          break;
        case "Escape":
          e.preventDefault();
          exit();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wake, togglePlay, seek, step, toggleSavedActive, exit]);

  /* ── Render ──────────────────────────────────────────────────────────── */

  const scrim = chrome
    ? "linear-gradient(to bottom, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0) 58%, rgba(13,13,13,0.78) 100%)"
    : "linear-gradient(to bottom, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0) 62%, rgba(0,0,0,0) 100%)";

  const fade = cn(
    "transition-opacity duration-200",
    chrome ? "opacity-100" : "pointer-events-none opacity-0",
  );

  return createPortal(
    <TooltipProvider>
      <div
        ref={rootRef}
        role="region"
        aria-label="Film room"
        tabIndex={-1}
        onPointerMove={wake}
        onPointerDown={wake}
        onFocus={wake}
        className="fixed inset-0 z-50 overflow-clip bg-black outline-none"
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
                Back to the report
              </button>
              {p.problem.canRetry && (
                <button
                  type="button"
                  onClick={p.onRetry}
                  className={advButton("primary", "md")}
                >
                  Try again
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
              The film stopped loading
            </span>
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
                Back to the report
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
              className={cn(
                "absolute inset-0 h-full w-full object-contain transition-opacity duration-200",
                videoReady ? "opacity-100" : "opacity-0",
              )}
              onLoadedData={() => setVideoReady(true)}
              onClick={togglePlay}
              onPlay={() => {
                setPlaying(true);
                landingRef.current.playing = true;
                p.onPlaybackPlaying(true);
              }}
              onPause={() => {
                setPlaying(false);
                landingRef.current.playing = false;
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
              onSeeked={(e) => {
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
              className="pointer-events-none absolute inset-0 transition-[background] duration-200"
              style={{ background: scrim }}
            />

            <FilmScoreboard
              board={board}
              pointName={activePoint ? activePoint.resultType || "Point" : null}
              playing={playing}
              elapsed={formatClock(currentTime)}
              saved={activePoint?.saved ?? false}
              // You/opponent is `useMatchSides()`'s call, never player order.
              wonByYou={
                activePoint
                  ? activePoint.wonByPlayer1 === sides.you.isPlayer1
                  : null
              }
              dim={!chrome}
            />

            <button
              data-film-chrome
              type="button"
              onClick={() => setPanel("open")}
              aria-expanded={panelOpen}
              aria-hidden={panelOpen ? true : undefined}
              tabIndex={panelOpen ? -1 : undefined}
              className={cn(
                "absolute top-[18px] right-6 inline-flex h-7 cursor-pointer items-center gap-[7px] rounded-[var(--radius-button)] bg-[rgba(13,13,13,0.72)] px-2.5 text-[11px] font-medium text-white transition-[opacity,transform,background-color] duration-200 ease-[var(--ease-primary)] hover:bg-[rgba(13,13,13,0.9)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                // Back as soon as the drawer starts leaving, so a quick re-open
                // can catch the sheet mid-slide and turn it around.
                chrome && !panelOpen
                  ? "opacity-100"
                  : "pointer-events-none opacity-0 motion-safe:translate-x-2",
              )}
            >
              <PanelRight
                className="h-[13px] w-[13px]"
                strokeWidth={1.6}
                aria-hidden="true"
              />
              Points
            </button>

            {/* A full-size positioning layer for the bottom block. It must never
                take clicks itself: it sits above the video and the Points
                trigger, and when it did, a real click on either landed here
                and did nothing. Only the transport block is interactive, and
                only while the chrome is showing. */}
            <div
              data-film-chrome
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0",
                fade,
                // The drawer's edge and the transport's edge travel together:
                // same curve and length in, the drawer's quicker curve out.
                panelOpen
                  ? "right-[320px] transition-[right,opacity] duration-[420ms] ease-[var(--ease-out-expo)]"
                  : "right-0 transition-[right,opacity] duration-[240ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
              )}
            >
              <FilmTransport
                className={
                  chrome ? "pointer-events-auto" : "pointer-events-none"
                }
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
                saved={activePoint ? activePoint.saved : null}
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
                onToggleCourt={() => setCourtOn((v) => !v)}
                onExit={exit}
              />
            </div>

            {panel !== "closed" && (
              <FilmPointPanel
                state={panel}
                onExited={() => setPanel("closed")}
                allPoints={p.allPoints}
                visiblePoints={p.visiblePoints}
                filters={p.filters}
                onFiltersChange={p.onFiltersChange}
                tab={p.tab}
                onTabChange={p.onTabChange}
                activePointId={activePoint?.id ?? null}
                activeStart={active?.stop.start ?? 0}
                activeEnd={active?.stop.end ?? 0}
                position={position}
                columns={p.columns}
                onSelect={selectPoint}
                onToggleSaved={p.onToggleSaved}
                onClose={() => setPanel("closing")}
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
