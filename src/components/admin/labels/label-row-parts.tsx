"use client";

import { ChevronDown, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LabelPoint, LabelSide } from "@/lib/services/labels/session";
import type { LabelGame } from "@/lib/services/labels/operations";
import type { InsertPosition } from "@/lib/services/labels/point-insert";
import type {
  LabelPointPatch,
  LabelShotPatch,
} from "@/lib/services/labels/edit";
import type { LabelPointScore } from "@/lib/services/labels/score";
import type { SideNames } from "./label-format";

/**
 * What the points table's two kinds of row share: the context every row
 * draws and saves from, the requests a row can make of the console, and the
 * small controls both a point row (`label-point-row.tsx`) and a stroke row
 * (`label-shot-row.tsx`) carry. It imports neither, so the two can import
 * it — and the table both — without a cycle.
 */

/**
 * The row operations the table can ask for. Each is a request: the console
 * decides whether it needs a confirm first, and does the write.
 */
export interface LabelRowOperations {
  onAskDeleteShot: (
    shotId: string,
    shotNumber: number,
    pointNumber: number,
  ) => void;
  onAskDeletePoint: (pointId: string) => void;
  onRestoreShot: (shotId: string) => void;
  onRestorePoint: (pointId: string) => void;
  onMovePoint: (pointId: string, to: LabelGame) => void;
  onSetChecked: (pointId: string, checked: boolean) => void;
  /** After `afterShotId`, or at the end of the rally when null. */
  onAddShot: (pointId: string, afterShotId: string | null) => void;
  onAskResetShot: (
    shotId: string,
    shotNumber: number,
    pointNumber: number,
  ) => void;
  onAskResetPoint: (pointId: string) => void;
  /**
   * Put a stroke the SITE removed (a ghost, board 08m §3) back into the
   * rally. Only the black view draws ghosts, so only it asks; the light
   * table shows them as ordinary rows and never calls this.
   */
  onRestoreSiteRemoval: (shotId: string) => void;
  /**
   * Say no to a suggestion the marks made on a point (board 08m §4): `key`
   * is the suggestion's own (`missing_shot:<vendor stroke id>`). Only the
   * black view draws suggestions, so only it asks.
   */
  onDismissSuggestion: (pointId: string, key: string) => void;
  /**
   * Add a point the vendor never saw beside `anchorPointId`: BEFORE it (the
   * default — board 08m §5's slot on the second of two points served from
   * one side, which only the black view draws, and the ⋯ menu's "Add point
   * above") or AFTER it ("Add point below"). The later points move up one
   * and the new one takes the slot, in the anchor's game.
   */
  onInsertPoint: (anchorPointId: string, position?: InsertPosition) => void;
  /**
   * Move the points left over past a game's end — the rows after the one
   * that decided it, which read "Game–30" — into the next game, and on down
   * the match while games run over (`game-shift.ts`). `fromPointId` is one of
   * those leftovers. The black rail's slot before the first of them asks;
   * so does a leftover's ⋯ menu in the light table.
   */
  onShiftGameOverflow: (fromPointId: string) => void;
}

/** What every row needs to draw and save its editors. */
export interface EditContext {
  editable: boolean;
  names: SideNames;
  selectedShotId: string | null;
  onSelectShot?: (shotId: string) => void;
  onPatchPoint?: (pointId: string, patch: LabelPointPatch) => void;
  onPatchShot?: (shotId: string, patch: LabelShotPatch) => void;
  operations?: LabelRowOperations;
  openTombstoneIds: ReadonlySet<string>;
  onToggleTombstone?: (id: string) => void;
  /**
   * `session.marksEnabled`: the session computes the derivation's marks, so
   * the black view may draw a site-removed stroke as a ghost. Absent (the
   * light table never sets it) or false, a ghost is an ordinary row.
   */
  marksEnabled?: boolean;
  /** Ghosts folded open to their struck-through row (the black view only). */
  openGhostIds?: ReadonlySet<string>;
  onToggleGhost?: (id: string) => void;
  /** Every row, for the move menu's neighbouring games. */
  points: readonly LabelPoint[];
  /** `labelScores(points, adScoring).points`, computed once by the table. */
  scores: ReadonlyMap<string, LabelPointScore>;
  /**
   * `session.adScoring`, for the rows that re-run the scoreboard's rule —
   * the leftover check behind "Move leftover points to the next game".
   * Absent means ad scoring, as the loader's own fallback does.
   */
  adScoring?: boolean;
  playingShotId: string | null;
}

/**
 * The playing point's span on the FILE clock — the `<video>`'s own seconds,
 * which is what `--film-t` carries — from its `labelFilmStops` stop.
 */
export interface PlayingWindow {
  start: number;
  end: number;
}

/**
 * A tombstone: a thin red rule carrying a small pill, board 08's `.dl`. The
 * pill (and the rule) is one button that expands a struck-through ghost of
 * the deleted row underneath, where Undo lives.
 */
export function DeletedMarker({
  kind,
  id,
  open,
  onToggle,
}: {
  kind: "point" | "shot";
  id: string;
  open: boolean;
  onToggle?: (id: string) => void;
}) {
  const label = kind === "point" ? "Deleted point" : "Deleted shot";
  return (
    <div
      data-row={kind === "point" ? "deleted-point" : "deleted-shot"}
      data-tombstone-id={id}
      className={cn(
        "flex h-7 items-center",
        // A shot's marker sits in the shot card, at a row's own padding.
        kind === "shot" ? "px-[11px]" : "",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          onToggle?.(id);
        }}
        className="group/dl flex h-6 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-element)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
      >
        <span
          className={cn(
            "inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium whitespace-nowrap text-[var(--danger-hover)] transition-colors duration-200",
          )}
          style={{
            background: `color-mix(in srgb, var(--danger) ${open ? 14 : 8}%, transparent)`,
            boxShadow:
              "inset 0 0 0 1px color-mix(in srgb, var(--danger) 25%, transparent)",
          }}
        >
          {label}
          <ChevronDown
            className={cn(
              "size-2.5 transition-transform duration-200",
              open && "rotate-180",
            )}
            strokeWidth={2}
            aria-hidden="true"
          />
        </span>
        <span
          className="h-px flex-1 transition-colors duration-200"
          style={{
            background: open
              ? "var(--danger)"
              : "color-mix(in srgb, var(--danger) 35%, transparent)",
          }}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

/** A ghost row's value: struck through, muted. An empty one is a plain dash. */
export function Ghost({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tabular truncate text-[var(--ink-500)] line-through",
        className,
      )}
    >
      {/* An inline-block is not struck by its parent's line-through. */}
      {children ?? <span className="inline-block">—</span>}
    </span>
  );
}

/** Board 08's `.card-link`: a blue text action. */
export function UndoButton({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "cursor-pointer rounded-[var(--radius-button)] text-[13px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-200 hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        className,
      )}
    >
      Undo
    </button>
  );
}

/**
 * Reset, as a row action: board 08's `.card-link` blue words (like Undo), at
 * 12px. Revealed like the ✕ — on the row's hover, on focus, and on the open
 * point or selected stroke — 200ms. It only ASKS: the console opens the
 * confirm, and nothing is written from here.
 */
export function ResetRowButton({
  label,
  onClick,
  revealed = false,
}: {
  label: string;
  onClick: () => void;
  revealed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-reset-row=""
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "shrink-0 cursor-pointer rounded-[var(--radius-button)] px-1 text-[12px] font-medium whitespace-nowrap text-[var(--blue)] transition-[opacity,color] duration-200 group-hover/row:opacity-100 hover:text-[var(--blue-hover)] focus-visible:opacity-100 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        revealed ? "opacity-100" : "opacity-0",
      )}
    >
      Reset
    </button>
  );
}

/** The playing row's ground: a light blue wash, no stripe, no ring. */
export const PLAYING_WASH = "var(--blue-tint-08)";

/**
 * A row's number. On the playing row it turns `--blue` and a small play glyph
 * follows it — after, so the numbers down the column stay aligned.
 */
export function RowNumber({
  number,
  strong,
  playing,
  className,
}: {
  number: number;
  strong: boolean;
  playing: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-1",
        className,
        playing
          ? "font-medium text-[var(--blue)]"
          : strong
            ? "font-medium text-[var(--ink-900)]"
            : "text-[var(--ink-600)]",
      )}
    >
      {number}
      {playing ? (
        <>
          <Play
            className="size-2 shrink-0"
            fill="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
            data-playing-mark=""
          />
          <span className="sr-only">, playing</span>
        </>
      ) : null}
    </span>
  );
}

/** A side's chip letter: its cell label's first character. */
export function sideInitial(side: LabelSide, names: SideNames): string {
  return names[side].trim().charAt(0).toUpperCase();
}

/**
 * Board 08g's `.mk`: a square carrying a player's initial — p1 on `--blue`
 * with white text, p2 on `--surface-subtle` inside a hairline. Two grounds,
 * not two hues: down a column of marks the blue squares are one player and
 * the grey ones the other, before a letter is read. No side yet is an empty
 * hairline square with a dash.
 *
 * At 30px (`.mk.s30`) it is the point row's WINNER mark; at 22px it is the
 * hitter's chip beside a stroke's player name — the same chip, so a player is
 * one colour all the way down the table; at 18px it is the server's chip in a
 * game band's trigger. `attr` names what the mark says.
 */
export function SideMark({
  side,
  names,
  size = 30,
  attr = "data-winner-mark",
}: {
  side: LabelSide | null;
  names: SideNames;
  size?: 30 | 22 | 18;
  attr?: "data-winner-mark" | "data-player-mark";
}) {
  return (
    <span
      {...{ [attr]: side ?? "none" }}
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[var(--radius-button)] leading-none font-medium tracking-[0.3px]",
        size === 30 && "size-[30px] text-[11px]",
        size === 22 && "size-[22px] text-[10px]",
        size === 18 && "size-[18px] rounded-[5px] text-[9px] tracking-[0.2px]",
        side === "p1"
          ? "bg-[var(--blue)] text-white"
          : "text-[var(--ink-700)] shadow-[inset_0_0_0_1px_var(--border-hairline)]",
        side === "p2" && "bg-[var(--surface-subtle)]",
      )}
    >
      {side ? sideInitial(side, names) : "—"}
    </span>
  );
}

export function sideLabel(
  side: LabelSide | null,
  names: SideNames,
): string | null {
  return side ? names[side] : null;
}
