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
import type { MatchVideo } from "@/lib/data/match-video-server";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { shortMonthDate } from "@/components/dashboard/matches/match-detail/format-clock";
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
  breakSegments,
  deadTimeJump,
  nextStop,
  prevStop,
  type FilmStop,
} from "./film-timeline";
import { FilmTransport, PLAYBACK_RATES } from "./film-transport";

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
  video: MatchVideo;
  /** Where the report player was when the room opened. */
  initial: { time: number; playing: boolean };
  /** Every timed point on the film clock — the board, the track, the playing row. */
  stops: FilmStop[];
  /** The applied cut on the film clock — what ↑↓ and prev/next walk. */
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

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
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
  const [panel, setPanel] = useState<PanelState>("closed");
  const panelOpen = panel === "open";
  const [videoReady, setVideoReady] = useState(false);
  // Set while the room is shrinking back into the report; everything that
  // would start a second exit or a new interaction checks it.
  const leavingRef = useRef(false);
  const enterAnimation = useRef<Animation | null>(null);

  const syncClock = useFilmClockVars(videoRef, rootRef, playing);

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

  const shotStops = useMemo(
    () => buildShotStops(p.stops, p.video.startTimeSeconds),
    [p.stops, p.video.startTimeSeconds],
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
    () => breakSegments(p.stops, duration),
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

  const seek = useCallback((seconds: number) => {
    const el = videoRef.current;
    if (!el) return;
    const max =
      Number.isFinite(el.duration) && el.duration > 0 ? el.duration : undefined;
    const target = Math.max(0, max ? Math.min(seconds, max) : seconds);
    el.currentTime = target;
    setCurrentTime(target);
    rootRef.current?.style.setProperty("--film-t", String(target));
  }, []);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setFailed(true));
    else el.pause();
  }, []);

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

  const onTimeUpdate = useCallback(
    (t: number) => {
      setCurrentTime(t);
      syncClock();
      const now = activeStopAt(p.stops, t);
      if (looping && now && t >= now.stop.end) {
        seek(now.stop.start);
        return;
      }
      if (skipDead) {
        const jump = deadTimeJump(p.stops, t);
        if (jump !== null) seek(jump);
      }
    },
    [p.stops, looping, skipDead, seek, syncClock],
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
      if (isTypingTarget(e.target)) return;
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
        case "ArrowRight":
          e.preventDefault();
          seek((videoRef.current?.currentTime ?? currentTime) + 5);
          break;
        case "ArrowLeft":
          e.preventDefault();
          seek((videoRef.current?.currentTime ?? currentTime) - 5);
          break;
        case "ArrowDown":
          e.preventDefault();
          step(1);
          break;
        case "ArrowUp":
          e.preventDefault();
          step(-1);
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
  }, [wake, togglePlay, seek, step, toggleSavedActive, exit, currentTime]);

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
        className="fixed inset-0 z-50 bg-black outline-none"
      >
        {failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
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
              ref={videoRef}
              src={p.video.url}
              preload="metadata"
              playsInline
              className={cn(
                "absolute inset-0 h-full w-full object-contain transition-opacity duration-200",
                videoReady ? "opacity-100" : "opacity-0",
              )}
              onLoadedData={() => setVideoReady(true)}
              onClick={togglePlay}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onLoadedMetadata={(e) => {
                const el = e.currentTarget;
                setDuration(el.duration || 0);
                el.currentTime = p.initial.time;
                el.playbackRate = rate;
                if (p.initial.playing) void el.play().catch(() => {});
                syncClock();
              }}
              onDurationChange={(e) => {
                setDuration(e.currentTarget.duration || 0);
                syncClock();
              }}
              onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
              onSeeked={(e) => {
                setCurrentTime(e.currentTarget.currentTime);
                syncClock();
              }}
              onError={() => setFailed(true)}
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
              collapsed={!chrome}
            />

            <button
              data-film-chrome
              type="button"
              onClick={() => setPanel("open")}
              aria-expanded={panelOpen}
              aria-hidden={panel !== "closed" ? true : undefined}
              tabIndex={panel !== "closed" ? -1 : undefined}
              className={cn(
                "absolute top-[18px] right-6 inline-flex h-7 cursor-pointer items-center gap-[7px] rounded-[var(--radius-button)] bg-[rgba(13,13,13,0.72)] px-2.5 text-[11px] font-medium text-white transition-[opacity,transform,background-color] duration-200 ease-[var(--ease-primary)] hover:bg-[rgba(13,13,13,0.9)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                chrome && panel === "closed"
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
                onSeek={seek}
                onTogglePlay={togglePlay}
                onStep={step}
                onToggleSaved={toggleSavedActive}
                onToggleSkipDeadTime={() => setSkipDead((v) => !v)}
                onCycleRate={cycleRate}
                onToggleLoop={() => setLooping((v) => !v)}
                onToggleMute={toggleMute}
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
