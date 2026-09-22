"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

import {
  BASE_BOARD_INSETS,
  BOARD_POSITION_STORAGE_KEY,
  DEFAULT_BOARD_ANCHOR,
  anchorPosition,
  clampBoardPosition,
  nearestAnchor,
  nudgeBoard,
  parseBoardAnchor,
  type BoardAnchor,
  type BoardArrowKey,
  type BoardPosition,
  type BoardSize,
} from "./board-position";
import {
  footLine,
  setTrackTone,
  type Board,
  type SetTrackTone,
} from "./film-score";

/**
 * The board: one 236px slab (handoff C1).
 *
 * Head is a micro "Playing" / "Paused" against a mono clock. Under it two
 * rows 11px apart — name (you 13/500 white, the opponent 13/400 at 72%), a
 * 6px blue serve dot, then a right-aligned mono group of one 11px set track
 * per set column and a 22px game cell. A 14% hairline closes it off above a
 * foot that pairs the 22px winner pill with the point's name. Every number
 * still comes from `boardAt()` (`film-score.ts`), the same one the report
 * rail reads. It survives the chrome collapse at 82% (`dim`) — it is what
 * the screen IS, not a control.
 *
 * ── Movable, with four resting corners ──────────────────────────────────────
 * Wherever it sits it covers some of the court, so it can be moved. It moves
 * free — under the pointer, or 8px at a time by arrow key (40px with shift) —
 * while a board-sized ghost shows the corner it will land in. Letting go, or
 * dropping it with Space, snaps it to the nearest corner and remembers it for
 * this viewer; Escape while it is held puts it back where the move began and
 * remembers nothing (`board-position.ts` owns the four corners and the
 * clearances around the room's chrome). The drawer never displaces it — R6:
 * "the board is the only movable object", and it is the viewer who moves it.
 * The room's own keys stand down while the board has focus
 * (`data-film-own-keys`), which is what lets Space lift instead of pausing.
 */

/** The glide into a resting corner, and the ghost's hop between corners. */
const SETTLE_CLASS =
  "transition-[left,top] duration-[360ms] ease-[var(--ease-out-expo)] motion-reduce:transition-none";

/** How each landing is spoken. */
const ANCHOR_LABEL: Record<BoardAnchor, string> = {
  "top-left": "top left",
  "top-right": "top right",
  "bottom-left": "bottom left",
  "bottom-right": "bottom right",
};

/** The two tones a set track is drawn in. */
const SET_TRACK_COLOR: Record<SetTrackTone, string> = {
  won: "#FFFFFF",
  lost: "rgba(255,255,255,0.42)",
};

/** "G. Revelli" → "GR". The winner pill is 22px, so two letters at most. */
function initials(name: string): string {
  const letters: string[] = [];
  for (const part of name.split(/\s+/)) {
    const letter = part.match(/\p{L}/u)?.[0];
    if (letter) letters.push(letter.toUpperCase());
  }
  if (letters.length === 0) return "";
  return letters.length === 1
    ? letters[0]
    : letters[0] + letters[letters.length - 1];
}

function arrowKey(key: string): BoardArrowKey | null {
  return key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "ArrowUp" ||
    key === "ArrowDown"
    ? key
    : null;
}

export function FilmScoreboard({
  board,
  pointName,
  playing,
  elapsed,
  saved,
  wonByYou,
  dim,
  onRest,
}: {
  board: Board | null;
  /** The analysis's own string for the current point, or null between points. */
  pointName: string | null;
  /** Drives the head's micro status: "Playing" or "Paused". */
  playing: boolean;
  /** The film clock, already formatted ("41:12"). */
  elapsed: string;
  /** Whether the point in play is bookmarked — the foot's "· saved". */
  saved: boolean;
  /**
   * Who took the point, resolved against `useMatchSides()` by the room
   * (`wonByPlayer1 === sides.you.isPlayer1`), never from player1/player2
   * order. Null between points: the frame does not say whether the pill shows
   * there, so it is omitted rather than guessed at.
   */
  wonByYou: boolean | null;
  /** The chrome is collapsed (R2); the slab stays, at 82%. */
  dim: boolean;
  /**
   * Fires with the resting corner and the measured board size whenever either
   * changes — what the court needs to keep the board's column beneath it.
   */
  onRest?: (anchor: BoardAnchor, size: BoardSize) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<BoardAnchor>(() => {
    try {
      return (
        parseBoardAnchor(localStorage.getItem(BOARD_POSITION_STORAGE_KEY)) ??
        DEFAULT_BOARD_ANCHOR
      );
    } catch {
      return DEFAULT_BOARD_ANCHOR;
    }
  });
  // Board and room sizes, measured before paint and kept current, so a spot
  // on the right or bottom edge follows a board that grows (a longer point
  // name) or a room that resizes.
  const [sizes, setSizes] = useState<{
    board: BoardSize;
    room: BoardSize;
  } | null>(null);
  // Glides only once the board has been placed: the first measurement puts a
  // remembered spot straight where it belongs instead of flying it in from
  // the top-left fallback every time the room opens.
  const [placed, setPlaced] = useState(false);
  // Where the board is while it is being moved — under the pointer, or nudged
  // by the arrows. Null whenever it is resting in its corner.
  const [free, setFree] = useState<BoardPosition | null>(null);
  // A keyboard hold: Space lifted it, or an arrow nudged it. It ends on a
  // drop (Space), on Escape, or when focus leaves.
  const [held, setHeld] = useState(false);
  // The corner the last landing put it in, spoken politely once it arrives.
  // `seq` counts the landings so that coming back to the same corner replaces
  // the live region's text node and is announced again.
  const [landed, setLanded] = useState<{
    anchor: BoardAnchor;
    seq: number;
  } | null>(null);
  const drag = useRef<{
    pointerX: number;
    pointerY: number;
    start: BoardPosition;
    /** A click is not a drag: nothing lifts until the pointer travels 3px. */
    moved: boolean;
  } | null>(null);

  const insets = BASE_BOARD_INSETS;

  useLayoutEffect(() => {
    const el = ref.current;
    const room = el?.offsetParent as HTMLElement | null;
    if (!el || !room) return;
    const measure = () =>
      setSizes({
        board: { width: el.offsetWidth, height: el.offsetHeight },
        room: { width: room.clientWidth, height: room.clientHeight },
      });
    measure();
    const frame = requestAnimationFrame(() => setPlaced(true));
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(room);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const resting = sizes
    ? anchorPosition(anchor, sizes.board, sizes.room, insets)
    : { left: BASE_BOARD_INSETS.left, top: BASE_BOARD_INSETS.top };
  const position = free ?? resting;
  // The corner a free board would land in, and the ghost sitting in it. Both
  // a pointer drag and a keyboard hold move the board free, so both draw it.
  const target =
    free && sizes ? nearestAnchor(free, sizes.board, sizes.room, insets) : null;
  const ghost =
    target && sizes
      ? anchorPosition(target, sizes.board, sizes.room, insets)
      : null;

  const boardWidth = sizes?.board.width;
  const boardHeight = sizes?.board.height;
  const onRestRef = useRef(onRest);
  useEffect(() => {
    onRestRef.current = onRest;
  });
  // The court shares the board's column, so it needs the corner and the size
  // the board actually measured — not the corner alone.
  useEffect(() => {
    if (boardWidth == null || boardHeight == null) return;
    onRestRef.current?.(anchor, { width: boardWidth, height: boardHeight });
  }, [anchor, boardWidth, boardHeight]);

  /** Lands the board in a corner and remembers it for this viewer. */
  const settle = useCallback((next: BoardAnchor) => {
    setFree(null);
    setHeld(false);
    setAnchor(next);
    setLanded((last) => ({ anchor: next, seq: (last?.seq ?? 0) + 1 }));
    try {
      localStorage.setItem(BOARD_POSITION_STORAGE_KEY, next);
    } catch {
      /* private window or storage blocked — the corner just isn't kept */
    }
  }, []);

  /** Drops a free board into the corner it is closest to. */
  const drop = (at: BoardPosition) => {
    if (!sizes) return;
    settle(nearestAnchor(at, sizes.board, sizes.room, insets));
  };

  /**
   * Puts a held board back where the move began. The hold never touched
   * `anchor`, so letting the free position go returns it exactly there, and
   * nothing is written to storage.
   */
  const cancelHold = () => {
    setFree(null);
    setHeld(false);
  };

  const endDrag = (commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    if (commit && free) drop(free);
    else cancelHold();
  };

  return (
    <>
      {ghost && (
        <div
          aria-hidden="true"
          data-film-board-ghost=""
          className={cn(
            "pointer-events-none absolute rounded-[var(--radius-element)] bg-white/[0.06] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28)]",
            SETTLE_CLASS,
          )}
          style={{
            left: ghost.left,
            top: ghost.top,
            width: sizes?.board.width,
            height: sizes?.board.height,
          }}
        />
      )}
      <div
        ref={ref}
        role="group"
        aria-label="Scoreboard"
        aria-describedby="film-board-hint"
        tabIndex={0}
        data-film-own-keys=""
        data-film-chrome=""
        data-board-anchor={anchor}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          // Capture keeps the drag alive when the pointer outruns the board.
          // Best-effort: it throws for a pointer the browser no longer tracks,
          // and a drag without capture still works while over the board.
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* not capturable */
          }
          // Start from where the board is on screen, not its resting spot:
          // grabbed mid-glide, it must not jump to the end of the glide.
          const box = e.currentTarget.getBoundingClientRect();
          const roomBox = (
            e.currentTarget.offsetParent as HTMLElement | null
          )?.getBoundingClientRect();
          drag.current = {
            pointerX: e.clientX,
            pointerY: e.clientY,
            start: roomBox
              ? { left: box.left - roomBox.left, top: box.top - roomBox.top }
              : position,
            // Grabbing a board that is already held by the keyboard continues
            // that move rather than snapping it back to its corner first.
            moved: held,
          };
          setHeld(false);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !sizes) return;
          const dx = e.clientX - d.pointerX;
          const dy = e.clientY - d.pointerY;
          if (!d.moved && Math.hypot(dx, dy) < 3) return;
          d.moved = true;
          setFree(
            clampBoardPosition(
              { left: d.start.left + dx, top: d.start.top + dy },
              sizes.board,
              sizes.room,
            ),
          );
        }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            /* was never captured */
          }
          endDrag(true);
        }}
        onPointerCancel={() => endDrag(false)}
        onLostPointerCapture={() => {
          if (drag.current) endDrag(true);
        }}
        onKeyDown={(e) => {
          if (!sizes) return;
          const arrow = arrowKey(e.key);
          if (arrow) {
            // Nudging picks the board up if it was resting, so the ghost shows
            // where it would land and Space or Escape can finish the move.
            e.preventDefault();
            setHeld(true);
            setFree(
              nudgeBoard(position, arrow, e.shiftKey, sizes.board, sizes.room),
            );
            return;
          }
          if (e.key === " ") {
            e.preventDefault();
            if (free) drop(free);
            else {
              setHeld(true);
              setFree(position);
            }
            return;
          }
          if (e.key === "Escape" && held) {
            // The room's Escape closes the drawer or the room; a held board
            // takes it first, and only while it is held.
            e.preventDefault();
            e.stopPropagation();
            cancelHold();
          }
        }}
        onBlur={(e) => {
          // A held board that loses focus has no keys left to finish the move,
          // so it lands where it stands.
          if (!held || e.currentTarget.contains(e.relatedTarget)) return;
          if (free) drop(free);
          else setHeld(false);
        }}
        className={cn(
          // A bare shell around the slab: it shrink-wraps it, so the measured
          // size the corners are figured from is the slab's own.
          "absolute flex touch-none rounded-[var(--radius-dropdown)] select-none",
          free ? "cursor-grabbing" : cn("cursor-grab", placed && SETTLE_CLASS),
          // Held is the focus outline at full weight (R6).
          held && "shadow-[var(--focus-ring)]",
        )}
        style={{ left: position.left, top: position.top }}
      >
        <span id="film-board-hint" className="sr-only">
          Drag the scoreboard to move it, or press the arrow keys to nudge it 8
          pixels at a time — 40 with Shift. Space picks it up and drops it into
          the nearest corner; Escape cancels the move.
        </span>
        <span aria-live="polite" className="sr-only">
          {landed && (
            <span key={landed.seq}>
              Scoreboard in the {ANCHOR_LABEL[landed.anchor]} corner.
            </span>
          )}
        </span>
        {board && (
          <div
            className="box-border flex flex-col"
            style={{
              width: 236,
              gap: 14,
              padding: "14px 15px 12px",
              borderRadius: "var(--radius-dropdown)",
              background: "rgba(13,13,13,0.74)",
              backdropFilter: "blur(8px)",
              fontFamily: "var(--font-sans)",
              opacity: dim ? 0.82 : 1,
            }}
          >
            <div className="flex items-baseline gap-2">
              {/* `.text-micro` is unlayered and would beat a Tailwind colour
                  utility, so the dark-scope alpha is set inline. */}
              <span
                className="text-micro"
                style={{ color: "rgba(255,255,255,0.55)" }}
              >
                {playing ? "Playing" : "Paused"}
              </span>
              <span
                className="mono tabular ml-auto"
                style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}
              >
                {elapsed}
              </span>
            </div>

            <div
              role="table"
              aria-label="Score"
              className="flex flex-col gap-[11px]"
            >
              {board.rows.map((row, r) => {
                const you = r === 0;
                const other = board.rows[you ? 1 : 0];
                return (
                  <span
                    key={row.name}
                    role="row"
                    className="flex min-w-0 items-center gap-[7px]"
                  >
                    <span
                      role="rowheader"
                      className="min-w-0 truncate"
                      style={{
                        fontSize: 13,
                        fontWeight: you ? 500 : 400,
                        color: you ? "#FFFFFF" : "rgba(255,255,255,0.72)",
                      }}
                    >
                      {row.name}
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-[6px] w-[6px] shrink-0 rounded-[var(--radius-pill)]"
                      style={{
                        background: row.serving ? "var(--blue)" : "transparent",
                      }}
                    />
                    {row.serving && <span className="sr-only">, serving</span>}
                    <span
                      role="cell"
                      className="mono tabular ml-auto inline-flex shrink-0 items-center gap-2 text-[13px] whitespace-nowrap"
                    >
                      {row.sets.map((games, i) => (
                        <span
                          key={i}
                          className="w-[11px] text-right"
                          style={{
                            color:
                              SET_TRACK_COLOR[
                                setTrackTone(games, other.sets[i] ?? null)
                              ],
                          }}
                        >
                          {games ?? ""}
                        </span>
                      ))}
                      <span
                        className="w-[22px] text-right"
                        style={{ color: "#FFFFFF" }}
                      >
                        {row.game ?? ""}
                      </span>
                    </span>
                  </span>
                );
              })}
            </div>

            <div
              className="flex items-center gap-[9px] pt-[9px]"
              style={{ borderTop: "1px solid rgba(255,255,255,0.14)" }}
            >
              {/* Between points nobody has won anything yet. The frame does
                  not draw that case, so the pill is omitted rather than
                  invented, and the foot keeps the full width. */}
              {wonByYou !== null && (
                <span
                  aria-label={`${board.rows[wonByYou ? 0 : 1].name} won the point`}
                  className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[var(--radius-pill)]"
                  style={{
                    background: wonByYou
                      ? "var(--blue)"
                      : "rgba(255,255,255,0.14)",
                    fontSize: 10,
                    fontWeight: 500,
                    color: "#FFFFFF",
                  }}
                >
                  {initials(board.rows[wonByYou ? 0 : 1].name)}
                </span>
              )}
              <span
                className="min-w-0 truncate"
                style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}
              >
                {footLine(pointName, saved, {
                  set: board.liveSet + 1,
                  game: board.gameNumber,
                  serverName: (
                    board.rows.find((row) => row.serving) ?? board.rows[0]
                  ).name,
                })}
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
