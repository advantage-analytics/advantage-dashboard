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
import { RailScoreboard, type RailScoreboardPlayer } from "../rail-scoreboard";
import { footLine, setTrackTone, type Board } from "./film-score";

/**
 * The board: one 236px slab over the film.
 *
 * Its rows are the report rail's scorecard (`RailScoreboard`, tone `dark`):
 * "Playing" / "Paused" against the clock in blue, then each player's name,
 * their set digits, a hairline and the game's points, with a small caret on
 * the server's points. A one-line caption names the point, or the game state
 * between points (`footLine`). Every number still comes from `boardAt()`
 * (`film-score.ts`), the same one the rail reads, so the room and the rail
 * can never disagree. It survives the chrome collapse at 82% (`dim`): it is
 * what the screen IS, not a control.
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

/**
 * One board row as a rail scorecard row. Sets before the live one are
 * complete, so their winner's digit prints bold and their loser's dims, as on
 * the rail's final board; the live set's digits stay plain.
 */
function scoreRow(
  id: string,
  row: Board["rows"][number],
  other: Board["rows"][number],
  liveSet: number,
): RailScoreboardPlayer {
  const tones = row.sets.map((games, i) =>
    i < liveSet ? setTrackTone(games, other.sets[i] ?? null) : null,
  );
  return {
    id,
    name: row.name,
    sets: row.sets,
    wonSets: tones.map((tone) => tone === "won"),
    lostSets: tones.map((tone) => tone === "lost"),
    points: row.game,
    serving: row.serving,
  };
}

export function FilmScoreboard({
  board,
  pointName,
  playing,
  elapsed,
  saved,
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
            className="box-border"
            style={{
              width: 236,
              padding: "15px 15px 14px",
              borderRadius: "var(--radius-dropdown)",
              background: "rgba(13,13,13,0.74)",
              backdropFilter: "blur(8px)",
              fontFamily: "var(--font-sans)",
              opacity: dim ? 0.82 : 1,
            }}
          >
            {/* The report rail's scorecard, in its dark tone, so the room and
                the rail read the same score the same way. */}
            <RailScoreboard
              tone="dark"
              status="live"
              label={playing ? "Playing" : "Paused"}
              headTime={elapsed}
              caption={footLine(pointName, saved, {
                set: board.liveSet + 1,
                game: board.gameNumber,
                serverName: (
                  board.rows.find((row) => row.serving) ?? board.rows[0]
                ).name,
              })}
              players={[
                scoreRow("you", board.rows[0], board.rows[1], board.liveSet),
                scoreRow("opp", board.rows[1], board.rows[0], board.liveSet),
              ]}
            />
          </div>
        )}
      </div>
    </>
  );
}
