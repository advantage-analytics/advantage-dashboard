"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GripVertical, Maximize2, Minimize2, Pause, Play } from "lucide-react";
import type {
  BoardAnchor,
  BoardSize,
} from "@/components/dashboard/matches/match-detail/film/board-position";
import {
  ANCHOR_LABEL,
  SETTLE_CLASS,
  useCornerDrag,
} from "@/components/dashboard/matches/match-detail/film/use-corner-drag";
import { cn } from "@/lib/utils";
import { labelScores, type LabelScores } from "@/lib/services/labels/score";
import type { LabelPoint, LabelVideo } from "@/lib/services/labels/session";
import {
  DEFAULT_DOCK_ANCHOR,
  DOCK_ANCHOR_STORAGE_KEY,
  DOCK_INSETS,
  DOCK_MINIMISED_STORAGE_KEY,
  dockOrigin,
  dockRest,
  parseDockMinimised,
} from "./label-dock-position";
import { ENDING_LABEL, STROKE_LABEL, type SideNames } from "./label-format";
import {
  LabelVideoPlayer,
  type LabelVideoHandle,
  type LabelVideoReadout,
} from "./label-video";

/**
 * The console's video, floating: always on screen while the points table
 * scrolls under it, and movable to any corner.
 *
 * The movement is the film room's own (`useCornerDrag`, the scoreboard's and
 * court card's mechanic): drag the bar — free under the pointer, a ghost in
 * the corner it will land in — and let go to glide there; or focus the dock
 * and nudge it with the arrow keys (8px, 40 with Shift), Space to pick it up
 * or drop it, Escape to cancel a keyboard move. The corner is remembered for
 * this viewer under its own key, so it never moves the film room's board.
 *
 * ── A box that never changes size ───────────────────────────────────────────
 * The layer is `fixed inset-0` (the hook measures against `offsetParent`,
 * which a `fixed` element itself does not have — its absolute child does).
 * The dock keeps the expanded player's box whether or not it is minimised:
 * the pill sits inside it, pinned to the anchored corner, so minimising never
 * resizes what the hook measured and never moves the corner. A resize would
 * re-rest the box's top-left and glide the pill across the screen from where
 * the player's top-left used to be. The empty box is `pointer-events-none`;
 * only the visible card or pill takes the pointer.
 *
 * The player stays mounted while minimised — hidden, not unmounted — so the
 * video keeps playing (and keeps driving the table's playing row) behind the
 * pill's own play/pause.
 *
 * ── What is on the film ─────────────────────────────────────────────────────
 * The match Video tab's transport (`FilmTransport`, drawn by `label-video.tsx`)
 * rides over the film's foot, and nothing else covers it: no scoreboard — the
 * table already shows the score, the server and who won — and no court, which
 * is a card of its own. This file gives the transport its title row
 * ({@link dockReadout}): how the playing point ended and on which stroke, its
 * set, game and server, and "Point N / total" in the table's own numbers.
 *
 * ── Motion ──────────────────────────────────────────────────────────────────
 * - The corner snap is `SETTLE_CLASS`, the film room's 360ms
 *   `--ease-out-expo` glide, so the two surfaces move as one product. It is
 *   off while the dock is free, per the hook's rule.
 * - Lift: while dragged the card scales to 1.015 and its shadow deepens —
 *   120ms in, 150ms out, scale and shadow only.
 * - Minimise/expand: opacity and scale from the anchored corner
 *   (`dockOrigin`), 220ms in and 160ms out. `visibility` rides only the
 *   OUTGOING transition, so the half going away leaves the tab order once it
 *   has faded while the half arriving is visible — and focusable, which the
 *   focus hand-off needs — from its first frame.
 * - Reduced motion: no scale anywhere, no glide (`SETTLE_CLASS` carries
 *   `motion-reduce:transition-none`), minimise is an opacity crossfade.
 */

/** 16:9 video plus the transport, which rides over the frame's foot. */
const DOCK_WIDTH = 480;

export interface DockNowPlaying {
  /** The playing point's id. */
  id: string;
  /** The table's point number, 1-based. */
  point: number;
  /** The stroke's number among the point's live strokes, 1-based. */
  shot: number | null;
}

/**
 * The transport's title row for the playing point: "Winner · Forehand" (how
 * it ended · its last live stroke), "Set 1 · Game 3 · Lee serves" (the game
 * numbered within its set, as the table's bands number it), and the table's
 * point number over the table's last. Whatever a point lacks is left out
 * rather than dashed; in dead time there is no point to describe.
 */
export function dockReadout(
  points: readonly LabelPoint[],
  nowPlaying: DockNowPlaying | null,
  names: SideNames,
  scores: LabelScores,
): LabelVideoReadout {
  const point = nowPlaying
    ? points.find((p) => p.id === nowPlaying.id)
    : undefined;
  if (!nowPlaying || !point) {
    return { title: "Between points", subtitle: null, position: null };
  }
  const lastStroke = point.shots.findLast(
    (shot) => shot.status !== "deleted" && shot.stroke !== null,
  )?.stroke;
  const title = [
    point.ending ? ENDING_LABEL[point.ending] : null,
    lastStroke ? STROKE_LABEL[lastStroke] : null,
  ].filter((part) => part !== null);
  const game = scores.points.get(point.id)?.gameInSet ?? null;
  const subtitle = [
    point.setNumber !== null ? `Set ${point.setNumber}` : null,
    game !== null ? `Game ${game}` : null,
    point.server ? `${names[point.server]} serves` : null,
  ].filter((part) => part !== null);
  return {
    title: title.length ? title.join(" · ") : `Point ${nowPlaying.point}`,
    subtitle: subtitle.length ? subtitle.join(" · ") : null,
    position: {
      index: nowPlaying.point,
      total: points.reduce((max, p) => Math.max(max, p.pointIndex + 1), 0),
    },
  };
}

export const LabelVideoDock = forwardRef<
  LabelVideoHandle,
  {
    video: LabelVideo | null;
    points: readonly LabelPoint[];
    nowPlaying: DockNowPlaying | null;
    /** The two sides' names, for "<player> serves". */
    names: SideNames;
    /** Whether 40–40 goes to Ad — the score rule the game numbers come from. */
    adScoring: boolean;
    onTime: (videoTime: number) => void;
    /** Minimised on first render — for specs. Otherwise read from storage. */
    initialMinimised?: boolean;
    /** The video playable on first render — for specs. It starts pending. */
    initialReady?: boolean;
  }
>(function LabelVideoDock(
  {
    video,
    points,
    nowPlaying,
    names,
    adScoring,
    onTime,
    initialMinimised = false,
    initialReady = false,
  },
  ref,
) {
  const [minimised, setMinimised] = useState(initialMinimised);
  const [playing, setPlaying] = useState(false);
  const [player, setPlayer] = useState<LabelVideoHandle | null>(null);
  const minimiseButton = useRef<HTMLButtonElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  // Set by the two buttons only, so focus follows a press across the swap —
  // the button pressed is about to be hidden — and never moves on load.
  const handOffFocus = useRef(false);
  useEffect(() => {
    if (!handOffFocus.current) return;
    handOffFocus.current = false;
    (minimised ? expandButton : minimiseButton).current?.focus();
  }, [minimised]);

  // Read after mount, never during render: the server has no storage, and a
  // first client render that disagreed with the server's would not hydrate.
  // The dock is invisible until its first measurement, so nobody sees it
  // arrive expanded and then fold.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DOCK_MINIMISED_STORAGE_KEY);
      if (stored !== null) setMinimised(parseDockMinimised(stored));
    } catch {
      /* storage blocked — the dock just starts expanded */
    }
  }, []);

  const setMinimisedAndRemember = useCallback((next: boolean) => {
    setMinimised(next);
    try {
      localStorage.setItem(DOCK_MINIMISED_STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* private window — the state just isn't kept */
    }
  }, []);

  const rest = useCallback(
    (at: BoardAnchor | null, size: BoardSize, room: BoardSize) =>
      dockRest(at, size, room),
    [],
  );
  const announce = useCallback(
    (at: BoardAnchor) => `Video in the ${ANCHOR_LABEL[at]} corner.`,
    [],
  );
  const move = useCornerDrag({
    storageKey: DOCK_ANCHOR_STORAGE_KEY,
    defaultAnchor: DEFAULT_DOCK_ANCHOR,
    rest,
    fallback: { left: DOCK_INSETS.left, top: DOCK_INSETS.top },
    announce,
    insets: DOCK_INSETS,
  });
  const { ghost, position, sizes } = move;
  // The stored corner only once measured: before that the server and the
  // first client render must agree, and only the client can read storage.
  const anchor = sizes
    ? (move.anchor ?? DEFAULT_DOCK_ANCHOR)
    : DEFAULT_DOCK_ANCHOR;
  const [row, column] = anchor.split("-") as [
    "top" | "bottom",
    "left" | "right",
  ];
  const origin = dockOrigin(anchor);

  // The console's ref is this dock's player; the pill needs it too.
  const setPlayerRef = useCallback(
    (handle: LabelVideoHandle | null) => {
      setPlayer(handle);
      if (typeof ref === "function") ref(handle);
      else if (ref) ref.current = handle;
    },
    [ref],
  );

  const scores = useMemo(
    () => labelScores(points, adScoring),
    [points, adScoring],
  );
  const readout = useMemo(
    () => dockReadout(points, nowPlaying, names, scores),
    [points, nowPlaying, names, scores],
  );

  const label = nowPlaying
    ? nowPlaying.shot === null
      ? `Point ${nowPlaying.point}`
      : `Point ${nowPlaying.point} · shot ${nowPlaying.shot}`
    : "Video";

  return (
    <div
      data-label-dock-layer=""
      className="pointer-events-none fixed inset-0 z-40"
    >
      {ghost && !minimised && (
        <div
          aria-hidden="true"
          data-label-dock-ghost=""
          className={cn(
            "absolute rounded-[var(--radius-card)] border border-dashed border-[var(--ink-400)] bg-[rgba(13,13,13,0.04)]",
            SETTLE_CLASS,
          )}
          style={{
            left: ghost.left,
            top: ghost.top,
            width: sizes?.self.width,
            height: sizes?.self.height,
          }}
        />
      )}

      <div
        {...move.containerProps}
        // Minimised, the box is empty space: the pill's own buttons are the
        // stops, and a focus ring round nothing would be a lie.
        tabIndex={minimised ? -1 : 0}
        role="group"
        aria-label="Video"
        aria-describedby="label-dock-hint"
        data-label-dock=""
        data-dock-anchor={anchor}
        data-dock-minimised={minimised ? "true" : "false"}
        className={cn(
          "absolute rounded-[var(--radius-card)] outline-none focus-visible:shadow-[var(--focus-ring)]",
          !sizes && "invisible",
          !move.free && move.placed && SETTLE_CLASS,
          move.held && "shadow-[var(--focus-ring)]",
        )}
        style={{ left: position.left, top: position.top, width: DOCK_WIDTH }}
      >
        <span id="label-dock-hint" className="sr-only">
          Drag the bar to move the video, or press the arrow keys to nudge it 8
          pixels at a time — 40 with Shift. Space picks it up and drops it into
          the nearest corner; Escape cancels the move.
        </span>
        <span aria-live="polite" className="sr-only">
          {move.announcement && (
            <span key={move.announcement.seq}>{move.announcement.text}</span>
          )}
        </span>

        {/* Expanded: collapses toward the anchored corner. */}
        <div
          data-dock-card=""
          aria-hidden={minimised || undefined}
          className={cn(
            "ease-[var(--ease-out-expo)] motion-reduce:scale-100",
            minimised
              ? "pointer-events-none invisible scale-[0.94] opacity-0 transition-[opacity,scale,visibility] duration-[160ms]"
              : "pointer-events-auto visible scale-100 opacity-100 transition-[opacity,scale] duration-[220ms]",
          )}
          style={{ transformOrigin: origin }}
        >
          {/* The lift: a separate layer from the collapse, so each keeps its
              own timing — a transform has only one transition. */}
          <div
            data-dock-lift=""
            data-dock-lifted={move.free ? "true" : undefined}
            className={cn(
              "overflow-hidden rounded-[var(--radius-card)] bg-[#1A1A1C] transition-[scale,box-shadow] ease-[var(--ease-out-expo)] motion-reduce:scale-100",
              move.free
                ? "scale-[1.015] shadow-[0px_20px_48px_rgba(0,0,0,0.28),0px_0px_0px_1px_rgba(255,255,255,0.06)_inset] duration-[120ms]"
                : "scale-100 shadow-[var(--shadow-floating)] duration-150",
            )}
          >
            <div
              {...move.handleProps}
              data-dock-handle=""
              // A press on the minimise button is that button's: capturing
              // the pointer here would move the click off it.
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                move.handleProps.onPointerDown(e);
              }}
              className={cn(
                "flex h-8 touch-none items-center gap-2 pr-1.5 pl-2 select-none",
                move.free ? "cursor-grabbing" : "cursor-grab",
              )}
            >
              <GripVertical
                className="size-3.5 shrink-0 text-white/45"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span
                data-dock-now-playing=""
                className="tabular min-w-0 flex-1 truncate text-[12px] text-white/80"
              >
                {label}
              </span>
              <button
                type="button"
                ref={minimiseButton}
                aria-label="Minimise the video"
                onClick={() => {
                  handOffFocus.current = true;
                  setMinimisedAndRemember(true);
                }}
                className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-white/70 transition-colors duration-200 hover:bg-white/[0.08] hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              >
                <Minimize2
                  className="size-3.5"
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
              </button>
            </div>
            <LabelVideoPlayer
              ref={setPlayerRef}
              video={video}
              points={points}
              readout={readout}
              onTime={onTime}
              onPlayingChange={setPlaying}
              initialReady={initialReady}
            />
          </div>
        </div>

        {/* Minimised: the pill, pinned to the same corner. */}
        <div
          data-dock-pill=""
          aria-hidden={!minimised || undefined}
          className={cn(
            "absolute flex h-9 items-center gap-1 rounded-[var(--radius-pill)] bg-[#1A1A1C] pr-1 pl-1 shadow-[var(--shadow-floating)] ease-[var(--ease-out-expo)] motion-reduce:scale-100",
            row === "top" ? "top-0" : "bottom-0",
            column === "left" ? "left-0" : "right-0",
            minimised
              ? "pointer-events-auto visible scale-100 opacity-100 transition-[opacity,scale] duration-[220ms]"
              : "pointer-events-none invisible scale-[0.9] opacity-0 transition-[opacity,scale,visibility] duration-[160ms]",
          )}
          style={{ transformOrigin: origin }}
        >
          {video && (
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              onClick={() => player?.togglePlay()}
              className="flex size-7 cursor-pointer items-center justify-center rounded-[var(--radius-pill)] text-white/85 transition-colors duration-200 hover:bg-white/[0.08] hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              {playing ? (
                <Pause
                  className="size-3.5"
                  strokeWidth={1.6}
                  fill="currentColor"
                  aria-hidden="true"
                />
              ) : (
                <Play
                  className="size-3.5"
                  strokeWidth={1.6}
                  fill="currentColor"
                  aria-hidden="true"
                />
              )}
            </button>
          )}
          <span
            className={cn(
              "tabular text-[12px] whitespace-nowrap text-white/80",
              video ? "px-1" : "pr-1 pl-3",
            )}
          >
            {nowPlaying ? `Point ${nowPlaying.point}` : "Video"}
          </span>
          <button
            type="button"
            ref={expandButton}
            aria-label="Expand the video"
            onClick={() => {
              handOffFocus.current = true;
              setMinimisedAndRemember(false);
            }}
            className="flex size-7 cursor-pointer items-center justify-center rounded-[var(--radius-pill)] text-white/70 transition-colors duration-200 hover:bg-white/[0.08] hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            <Maximize2
              className="size-3.5"
              strokeWidth={1.6}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </div>
  );
});
