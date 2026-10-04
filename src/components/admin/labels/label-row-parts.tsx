"use client";

import { ChevronDown, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LabelPoint, LabelSide } from "@/lib/services/labels/session";
import type { LabelGame } from "@/lib/services/labels/operations";
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
 * (`label-points-table.tsx`) carry. It imports neither, so the two can import
 * it — and the table the point row — without a cycle.
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
  /** Every row, for the move menu's neighbouring games. */
  points: readonly LabelPoint[];
  /** `labelScores(points, adScoring).points`, computed once by the table. */
  scores: ReadonlyMap<string, LabelPointScore>;
  playingShotId: string | null;
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
        kind === "shot" ? "pr-4 pl-11" : "",
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

export function sideLabel(
  side: LabelSide | null,
  names: SideNames,
): string | null {
  return side ? names[side] : null;
}
