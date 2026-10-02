"use client";

import { useCallback, useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import {
  BASE_BOARD_INSETS,
  BOARD_POSITION_STORAGE_KEY,
  DEFAULT_BOARD_ANCHOR,
  anchorPosition,
  type BoardAnchor,
  type BoardSize,
} from "./board-position";
import { ANCHOR_LABEL, SETTLE_CLASS, useCornerDrag } from "./use-corner-drag";
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
 * clearances around the room's chrome). The drawer never displaces it — it is
 * the viewer who moves it, never the room. R6 said the board was the only
 * movable object; the court card moves on the same mechanic since the author
 * reversed that on 2026-09-22, and both share `use-corner-drag.ts`.
 * The room's own keys stand down while the board has focus
 * (`data-film-own-keys`), which is what lets Space lift instead of pausing.
 */

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
  const insets = BASE_BOARD_INSETS;

  // The one movement mechanic, shared with the court (`use-corner-drag.ts`).
  // The board IS its own handle, so `handleProps` goes on the same element as
  // `containerProps` — which is what it was before the mechanic was lifted.
  const rest = useCallback(
    (at: BoardAnchor | null, size: BoardSize, room: BoardSize) =>
      anchorPosition(at ?? DEFAULT_BOARD_ANCHOR, size, room, insets),
    [insets],
  );
  const announce = useCallback(
    (at: BoardAnchor) => `Scoreboard in the ${ANCHOR_LABEL[at]} corner.`,
    [],
  );
  const move = useCornerDrag({
    storageKey: BOARD_POSITION_STORAGE_KEY,
    defaultAnchor: DEFAULT_BOARD_ANCHOR,
    rest,
    fallback: { left: BASE_BOARD_INSETS.left, top: BASE_BOARD_INSETS.top },
    announce,
    insets,
  });
  // Never null: `defaultAnchor` is a corner, so the board always has one.
  const anchor = move.anchor ?? DEFAULT_BOARD_ANCHOR;
  const { ghost, position, sizes } = move;

  const boardWidth = sizes?.self.width;
  const boardHeight = sizes?.self.height;
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
            width: sizes?.self.width,
            height: sizes?.self.height,
          }}
        />
      )}
      <div
        {...move.containerProps}
        {...move.handleProps}
        role="group"
        aria-label="Scoreboard"
        aria-describedby="film-board-hint"
        data-film-chrome=""
        data-board-anchor={anchor}
        className={cn(
          // A bare shell around the slab: it shrink-wraps it, so the measured
          // size the corners are figured from is the slab's own.
          "absolute flex touch-none rounded-[var(--radius-dropdown)] select-none",
          move.free
            ? "cursor-grabbing"
            : cn("cursor-grab", move.placed && SETTLE_CLASS),
          // Held is the focus outline at full weight (R6).
          move.held && "shadow-[var(--focus-ring)]",
        )}
        style={{ left: position.left, top: position.top }}
      >
        <span id="film-board-hint" className="sr-only">
          Drag the scoreboard to move it, or press the arrow keys to nudge it 8
          pixels at a time — 40 with Shift. Space picks it up and drops it into
          the nearest corner; Escape cancels the move.
        </span>
        <span aria-live="polite" className="sr-only">
          {move.announcement && (
            <span key={move.announcement.seq}>{move.announcement.text}</span>
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
