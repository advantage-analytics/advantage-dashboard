"use client";

import { useMemo } from "react";
import { ClipboardList } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import { cn } from "@/lib/utils";
import type { LabelPoint } from "@/lib/services/labels/session";
import type {
  LabelPointPatch,
  LabelShotPatch,
} from "@/lib/services/labels/edit";
import { labelScores, type LabelPointScore } from "@/lib/services/labels/score";
import type { SideNames } from "./label-format";
import { DeletedPoint, PointRow } from "./label-point-row";
import type { EditContext, LabelRowOperations } from "./label-row-parts";
import { ShotRows } from "./label-shot-row";
import {
  POINT_COLUMNS,
  POINT_GRID,
  TABLE_MIN_WIDTH,
} from "./label-table-layout";

export type { LabelRowOperations };

/**
 * The console's points table — board 08g's lower half.
 *
 * One row per `label_points` row, in `point_index` order (`PointRow`, in
 * `label-point-row.tsx`); the expanded point's strokes fold underneath it in
 * video order (the console keeps them there with `orderLabelShots`,
 * re-sorting after a time edit) as `ShotRows`, in `label-shot-row.tsx`. This
 * file owns the table's frame; a stroke's typed values are `EditableCell`s:
 * text until hovered, selected or opened from the keyboard, each change
 * handed straight to the console to autosave.
 *
 * Clicking a stroke (or tabbing into one) SELECTS it: the selected stroke
 * shows every field, and it is the one a court click places.
 *
 * Row operations (T7), each only a REQUEST to the console, which owns the
 * confirm and the write:
 *   · the ✕ at the far right of a stroke row, and Delete point in a point
 *     row's ⋯ menu, ask to delete it — the console opens a confirm dialog,
 *     and nothing is written before it;
 *   · the ⋯ menu's "Move to game…" lists the games either side, to move the
 *     point (the console asks "switch players?" when someone else serves it);
 *   · the open point's footer marks it checked (and Undo clears that), and
 *     adds a stroke after the selected one, or at the end of the rally;
 *   · Reset, on an edited stroke (beside its Edited pill) or an edited point
 *     (in its Status cell, and in its ⋯ menu) that has a stored seed, asks to
 *     put the row back to the values it was seeded with — it too only opens
 *     the console's confirm.
 *
 * A tombstone is not drawn as a row at all. A deleted point or shot is a thin
 * red rule with a "Deleted point" / "Deleted shot" pill on it — present, so
 * the labeller can see something was removed there, but never read as a
 * point to check or a stroke to count. The pill expands the rule to a
 * struck-through ghost of the row, with Undo.
 *
 * The PLAYING point and stroke — the rows the video is on — carry
 * `data-playing="true"`: a light blue wash (on a point row only while it is
 * closed; open, it already has its own ground) and the row number in
 * `--blue` with a small play glyph after it. It is deliberately none of the
 * other row states — not the open point's grey, not the selected stroke's
 * white with hairlines, not an added stroke's ringed tint — and it changes
 * nothing: no point opens, no stroke is selected, nothing scrolls.
 *
 * Stateless but for one memo: which point is open, which stroke is selected,
 * which rows are playing, which tombstones are expanded and the rows
 * themselves are the caller's (`LabelConsole` holds them), so a spec can
 * render any state without clicking. The memo is the scoreboard —
 * `labelScores` walks every point, so it runs once per change of rows here
 * rather than once per row. `LabelPointsTableView` is the same table with the
 * scores handed in: no hook at all, for a spec that walks the element tree.
 */
export function LabelPointsTable({
  adScoring = true,
  ...props
}: Omit<LabelPointsTableViewProps, "scores"> & {
  /** `session.adScoring`: whether 40–40 goes to Ad, or the next point ends it. */
  adScoring?: boolean;
}) {
  const { points } = props;
  const scores = useMemo(
    () => labelScores(points, adScoring).points,
    [points, adScoring],
  );
  return <LabelPointsTableView {...props} scores={scores} />;
}

export interface LabelPointsTableViewProps {
  points: readonly LabelPoint[];
  /** Each live point's score before it, by id — `labelScores(…).points`. */
  scores: ReadonlyMap<string, LabelPointScore>;
  names: SideNames;
  expandedPointId: string | null;
  onTogglePoint?: (pointId: string) => void;
  /** False for a complete session, or with nothing to save to. */
  editable?: boolean;
  selectedShotId?: string | null;
  onSelectShot?: (shotId: string) => void;
  onPatchPoint?: (pointId: string, patch: LabelPointPatch) => void;
  onPatchShot?: (shotId: string, patch: LabelShotPatch) => void;
  /** Absent: no ✕, no Undo, no ⋯ menu, no footer — the rows are read-only. */
  operations?: LabelRowOperations;
  /** Tombstones whose ghost row is showing. */
  openTombstoneIds?: ReadonlySet<string>;
  onToggleTombstone?: (id: string) => void;
  /** The point the video is on (see `playingRowAt`); null in dead time. */
  playingPointId?: string | null;
  /** The stroke the video is on, inside `playingPointId`. */
  playingShotId?: string | null;
}

export function LabelPointsTableView({
  points,
  scores,
  names,
  expandedPointId,
  onTogglePoint,
  editable = false,
  selectedShotId = null,
  onSelectShot,
  onPatchPoint,
  onPatchShot,
  operations,
  openTombstoneIds = NO_IDS,
  onToggleTombstone,
  playingPointId = null,
  playingShotId = null,
}: LabelPointsTableViewProps) {
  const edit: EditContext = {
    editable,
    names,
    selectedShotId,
    onSelectShot,
    onPatchPoint,
    onPatchShot,
    operations: editable ? operations : undefined,
    openTombstoneIds,
    onToggleTombstone,
    points,
    scores,
    playingShotId,
  };
  return (
    <TooltipProvider>
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
        <div className={cn(TABLE_MIN_WIDTH, "px-6 pt-0.5 pb-1.5")}>
          <div
            className={cn(
              POINT_GRID,
              "min-h-[34px] border-b border-[var(--border-hairline)]",
            )}
          >
            {POINT_COLUMNS.map((column, i) => (
              <span
                key={i}
                className={cn(
                  "text-[12px] whitespace-nowrap text-[var(--ink-500)]",
                  column.className,
                )}
              >
                {column.label}
              </span>
            ))}
          </div>

          {points.length === 0 ? (
            <TableEmptyBody
              icon={ClipboardList}
              title="This session has no points"
            />
          ) : (
            points.map((point) =>
              point.status === "deleted" ? (
                <DeletedPoint key={point.id} point={point} edit={edit} />
              ) : (
                <PointRow
                  key={point.id}
                  point={point}
                  open={point.id === expandedPointId}
                  playing={point.id === playingPointId}
                  onToggle={onTogglePoint}
                  edit={edit}
                >
                  {point.id === expandedPointId && point.shots.length > 0 ? (
                    <ShotRows point={point} edit={edit} />
                  ) : null}
                </PointRow>
              ),
            )
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

const NO_IDS: ReadonlySet<string> = new Set();
