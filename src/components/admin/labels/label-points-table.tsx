"use client";

import { useState } from "react";
import { Check, ChevronDown, ClipboardList, Play, Plus, X } from "lucide-react";
import { EmptyMark } from "@/components/ui/empty-mark";
import { StatePill } from "@/components/ui/state-pill";
import {
  FloatMenu,
  FloatMenuItem,
  FloatMenuNote,
} from "@/components/ui/float-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import type {
  LabelPoint,
  LabelShot,
  LabelSide,
} from "@/lib/services/labels/session";
import {
  destinationServerIn,
  isLabelDeleteReason,
  neighbourGames,
  type LabelGame,
} from "@/lib/services/labels/operations";
import {
  LABEL_ENDINGS,
  LABEL_SHOT_RESULTS,
  LABEL_STROKES,
  type LabelPointPatch,
  type LabelShotPatch,
} from "@/lib/services/labels/edit";
import { canResetPoint, canResetShot } from "@/lib/services/labels/reset";
import {
  EditableCell,
  SelectEditor,
  TextEditor,
  type SelectOption,
} from "./label-cells";
import {
  DELETE_REASON_LABEL,
  ENDING_LABEL,
  RESULT_LABEL,
  STROKE_LABEL,
  formatCourtPoint,
  formatVideoTime,
  parseCourtPoint,
  parseVideoTime,
  type SideNames,
} from "./label-format";
import {
  POINT_COLUMNS,
  POINT_GRID,
  SHOT_COLUMNS,
  SHOT_GRID,
} from "./label-table-layout";

/**
 * The console's points table — board 08's lower half.
 *
 * One row per `label_points` row, in `point_index` order; the expanded
 * point's strokes fold underneath it in video order (the console keeps them
 * there with `orderLabelShots`, re-sorting after a time edit). The point's
 * labelled columns (won by, ending, ended by) and every stroke value are
 * `EditableCell`s: text until hovered, selected or opened from the keyboard,
 * each change handed straight to the console to autosave.
 *
 * Clicking a stroke (or tabbing into one) SELECTS it: the selected stroke
 * shows every field, and it is the one a court click places.
 *
 * Row operations (T7), each only a REQUEST to the console, which owns the
 * confirm and the write:
 *   · the ✕ at the far right of a point or stroke row asks to delete it —
 *     the console opens a confirm dialog, and nothing is written before it;
 *   · the set · game cell opens a menu of the games either side, to move the
 *     point (the console asks "switch players?" when someone else serves it);
 *   · the open point's footer marks it checked (and Undo clears that), and
 *     adds a stroke after the selected one, or at the end of the rally;
 *   · Reset, on an edited stroke (beside its Edited pill) or an edited point
 *     (in the gap before its labelled columns) that has a stored seed, asks
 *     to put the row back to the values it was seeded with — revealed like
 *     the ✕, and it too only opens the console's confirm.
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
 * Stateless: which point is open, which stroke is selected, which rows are
 * playing, which tombstones are expanded and the rows themselves are the
 * caller's (`LabelConsole` holds them), so a spec can render any state
 * without clicking. The one exception is the move menu's own open/closed.
 */
export function LabelPointsTable({
  points,
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
}: {
  points: readonly LabelPoint[];
  names: SideNames;
  expandedPointId: string | null;
  onTogglePoint?: (pointId: string) => void;
  /** False for a complete session, or with nothing to save to. */
  editable?: boolean;
  selectedShotId?: string | null;
  onSelectShot?: (shotId: string) => void;
  onPatchPoint?: (pointId: string, patch: LabelPointPatch) => void;
  onPatchShot?: (shotId: string, patch: LabelShotPatch) => void;
  /** Absent: no ✕, no Undo, no move menu, no footer — the rows are read-only. */
  operations?: LabelRowOperations;
  /** Tombstones whose ghost row is showing. */
  openTombstoneIds?: ReadonlySet<string>;
  onToggleTombstone?: (id: string) => void;
  /** The point the video is on (see `playingRowAt`); null in dead time. */
  playingPointId?: string | null;
  /** The stroke the video is on, inside `playingPointId`. */
  playingShotId?: string | null;
}) {
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
    playingShotId,
  };
  return (
    <TooltipProvider>
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
        <div className="min-w-[940px] px-6 pt-0.5 pb-1.5">
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
                  "text-[12px] whitespace-nowrap",
                  column.calculated
                    ? "text-[var(--ink-400)]"
                    : "text-[var(--ink-500)]",
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
                />
              ),
            )
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

const NO_IDS: ReadonlySet<string> = new Set();

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
interface EditContext {
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
  playingShotId: string | null;
}

function sideOptions(names: SideNames): SelectOption[] {
  return [
    { value: "p1", label: names.p1 },
    { value: "p2", label: names.p2 },
  ];
}

const ENDING_OPTIONS: SelectOption[] = LABEL_ENDINGS.map((value) => ({
  value,
  label: ENDING_LABEL[value],
}));
const STROKE_OPTIONS: SelectOption[] = LABEL_STROKES.map((value) => ({
  value,
  label: STROKE_LABEL[value],
}));
const RESULT_OPTIONS: SelectOption[] = LABEL_SHOT_RESULTS.map((value) => ({
  value,
  label: RESULT_LABEL[value],
}));

function PointRow({
  point,
  open,
  playing,
  onToggle,
  edit,
}: {
  point: LabelPoint;
  open: boolean;
  playing: boolean;
  onToggle?: (pointId: string) => void;
  edit: EditContext;
}) {
  const { names, operations } = edit;
  const number = point.pointIndex + 1;
  const shotsId = `label-point-${point.id}-shots`;
  const liveShots = point.shots.filter((shot) => shot.status !== "deleted");
  const setGame =
    point.setNumber !== null && point.gameNumber !== null
      ? `${point.setNumber} · ${point.gameNumber}`
      : null;

  return (
    <>
      <div
        data-row="point"
        data-point-id={point.id}
        data-playing={playing ? "true" : undefined}
        onClick={(event) => {
          // A click that lands in a cell is an edit, not a toggle.
          if ((event.target as Element).closest("[data-cell]")) return;
          onToggle?.(point.id);
        }}
        className={cn(
          POINT_GRID,
          "group/row -mx-4 min-h-[52px] cursor-pointer rounded-[var(--radius-element)] px-4 text-[13px] transition-colors duration-200",
          open
            ? "rounded-b-none bg-[var(--surface-muted)]"
            : "hover:bg-[var(--surface-muted)]",
        )}
        style={playing && !open ? { background: PLAYING_WASH } : undefined}
      >
        {/* The row's one control. The row's own click does the same thing
            for a mouse; this is what a keyboard and a screen reader reach. */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? shotsId : undefined}
          aria-label={`${open ? "Hide" : "Show"} shots for point ${number}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggle?.(point.id);
          }}
          className="-ml-1 flex size-6 items-center justify-center rounded-[var(--radius-button)] text-[var(--ink-400)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          <ChevronDown
            className={cn(
              "size-3 transition-transform duration-200",
              open && "rotate-180",
            )}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>

        <RowNumber number={number} strong={open} playing={playing} />
        {operations ? (
          <MoveGameCell
            point={point}
            number={number}
            text={setGame}
            edit={edit}
            onMove={(to) => operations.onMovePoint(point.id, to)}
          />
        ) : (
          <Calculated>{setGame}</Calculated>
        )}
        <Calculated>{sideLabel(point.server, names)}</Calculated>
        <Calculated>{liveShots.length}</Calculated>
        {operations && canResetPoint(point) ? (
          <span className="flex min-w-0 justify-end">
            <ResetRowButton
              label={`Reset point ${number}`}
              revealed={open}
              onClick={() => operations.onAskResetPoint(point.id)}
            />
          </span>
        ) : (
          <span aria-hidden="true" />
        )}

        <PointSelectCell
          point={point}
          edit={edit}
          field="winner"
          label={`Point ${number} won by`}
          value={point.winner}
          text={sideLabel(point.winner, names)}
          options={sideOptions(names)}
        />
        <PointSelectCell
          point={point}
          edit={edit}
          field="ending"
          label={`Point ${number} ending`}
          value={point.ending}
          text={point.ending ? ENDING_LABEL[point.ending] : null}
          options={ENDING_OPTIONS}
        />
        <PointSelectCell
          point={point}
          edit={edit}
          field="ended_by"
          label={`Point ${number} ended by`}
          value={point.endedBy}
          text={sideLabel(point.endedBy, names)}
          options={sideOptions(names)}
        />
        <PointStatus checked={point.checkedAt !== null} />
        {operations ? (
          <DeleteRowButton
            label={`Delete point ${number}`}
            tooltip="Delete point"
            onClick={() => operations.onAskDeletePoint(point.id)}
          />
        ) : (
          <span aria-hidden="true" />
        )}
      </div>

      {open ? (
        <div
          id={shotsId}
          data-shots-for={point.id}
          className="-mx-4 mb-2 rounded-b-[var(--radius-element)] bg-[var(--surface-page)] pb-1.5 shadow-[inset_0_1px_0_var(--border-hairline)]"
        >
          <div className={cn(SHOT_GRID, "min-h-[34px]")}>
            {SHOT_COLUMNS.map((label) => (
              <span
                key={label}
                className="text-[12px] whitespace-nowrap text-[var(--ink-400)]"
              >
                {label}
              </span>
            ))}
          </div>
          {point.shots.length === 0 ? (
            <p className="pl-11 text-[12px] text-[var(--ink-500)]">
              No strokes on this point
            </p>
          ) : (
            <ShotRows point={point} edit={edit} />
          )}
          {operations ? (
            <PointFooter point={point} edit={edit} operations={operations} />
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/**
 * The strokes, numbered 1…n among the live ones: a tombstone takes no number,
 * so the numbers are the rally as the labeller now says it went.
 */
function ShotRows({ point, edit }: { point: LabelPoint; edit: EditContext }) {
  let n = 0;
  const pointNumber = point.pointIndex + 1;
  return point.shots.map((shot) => {
    if (shot.status === "deleted") {
      return <DeletedShot key={shot.id} shot={shot} edit={edit} />;
    }
    n += 1;
    return (
      <ShotRow
        key={shot.id}
        shot={shot}
        number={n}
        pointNumber={pointNumber}
        edit={edit}
      />
    );
  });
}

function ShotRow({
  shot,
  number,
  pointNumber,
  edit,
}: {
  shot: LabelShot;
  number: number;
  pointNumber: number;
  edit: EditContext;
}) {
  const { names, editable, onSelectShot, onPatchShot, operations } = edit;
  const added = shot.status === "added";
  const selected = shot.id === edit.selectedShotId;
  const playing = shot.id === edit.playingShotId;
  const select = () => {
    if (!selected) onSelectShot?.(shot.id);
  };
  const patch = (value: LabelShotPatch) => onPatchShot?.(shot.id, value);
  const cell = { editable, rowSelected: selected };
  const hitAt = formatCourtPoint(shot.contactX, shot.contactY);
  const landedAt = formatCourtPoint(shot.landingX, shot.landingY);
  const time = shot.videoTime !== null ? formatVideoTime(shot.videoTime) : null;

  return (
    // Selecting is a pointer convenience; the keyboard selects by focusing
    // any cell in the row, which bubbles here as the same call.
    <div
      data-row="shot"
      data-shot-id={shot.id}
      data-selected={selected ? "" : undefined}
      data-playing={playing ? "true" : undefined}
      onClick={select}
      onFocus={select}
      className={cn(
        SHOT_GRID,
        "group/row min-h-[44px] text-[13px] text-[var(--ink-900)] transition-colors duration-200",
        added && "rounded-[var(--radius-element)]",
        selected
          ? "bg-[var(--surface-card)] shadow-[inset_0_1px_0_var(--border-hairline),inset_0_-1px_0_var(--border-hairline)]"
          : editable && "cursor-pointer hover:bg-[var(--surface-subtle)]",
      )}
      style={
        added
          ? {
              boxShadow:
                "inset 0 0 0 1px color-mix(in srgb, var(--blue) 35%, transparent)",
              background: playing
                ? PLAYING_WASH
                : "color-mix(in srgb, var(--blue) 3%, transparent)",
            }
          : playing && !selected
            ? { background: PLAYING_WASH }
            : undefined
      }
    >
      <RowNumber number={number} strong={selected} playing={playing} />
      <EditableCell
        {...cell}
        label={`Shot ${number} time`}
        valueText={time ?? "Not set"}
        display={<Value>{time}</Value>}
        editor={
          <TextEditor
            label={`Shot ${number} time`}
            text={time ?? ""}
            parse={parseVideoTime}
            onCommit={(value) => patch({ video_time: value as number | null })}
          />
        }
      />
      <ShotSelectCell
        {...cell}
        label={`Shot ${number} player`}
        value={shot.hitter}
        text={sideLabel(shot.hitter, names)}
        options={sideOptions(names)}
        onChange={(value) => patch({ hitter: value as LabelSide | null })}
      />
      <ShotSelectCell
        {...cell}
        label={`Shot ${number} stroke`}
        value={shot.stroke}
        text={shot.stroke ? STROKE_LABEL[shot.stroke] : null}
        options={STROKE_OPTIONS}
        onChange={(value) =>
          patch({ stroke: value as LabelShotPatch["stroke"] })
        }
      />
      <ShotSelectCell
        {...cell}
        label={`Shot ${number} result`}
        value={shot.result}
        text={shot.result ? RESULT_LABEL[shot.result] : null}
        options={RESULT_OPTIONS}
        onChange={(value) =>
          patch({ result: value as LabelShotPatch["result"] })
        }
      />
      <PositionCell
        {...cell}
        label={`Shot ${number} hit at`}
        text={hitAt}
        onCommit={(p) =>
          patch({ contact_x: p?.x ?? null, contact_y: p?.y ?? null })
        }
      />
      <PositionCell
        {...cell}
        label={`Shot ${number} landed at`}
        text={landedAt}
        onCommit={(p) =>
          patch({ landing_x: p?.x ?? null, landing_y: p?.y ?? null })
        }
      />
      <span className="flex min-w-0 items-center gap-2">
        {added ? (
          <StatePill>Added</StatePill>
        ) : shot.status === "edited" ? (
          <StatePill>Edited</StatePill>
        ) : null}
        {operations && canResetShot(shot) ? (
          <ResetRowButton
            label={`Reset shot ${number}`}
            revealed={selected}
            onClick={() =>
              operations.onAskResetShot(shot.id, number, pointNumber)
            }
          />
        ) : null}
        {operations ? (
          <DeleteRowButton
            label={`Delete shot ${number}`}
            tooltip="Delete shot"
            className="ml-auto"
            revealed={selected}
            onClick={() =>
              operations.onAskDeleteShot(shot.id, number, pointNumber)
            }
          />
        ) : null}
      </span>
    </div>
  );
}

/**
 * A tombstone: a thin red rule carrying a small pill, board 08's `.dl`. The
 * pill (and the rule) is one button that expands a struck-through ghost of
 * the deleted row underneath, where Undo lives.
 */
function DeletedMarker({
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

function DeletedShot({ shot, edit }: { shot: LabelShot; edit: EditContext }) {
  const open = edit.openTombstoneIds.has(shot.id);
  const { names, operations } = edit;
  const time = shot.videoTime !== null ? formatVideoTime(shot.videoTime) : null;
  const reason = isLabelDeleteReason(shot.deleteReason)
    ? DELETE_REASON_LABEL[shot.deleteReason]
    : null;
  return (
    <>
      <DeletedMarker
        kind="shot"
        id={shot.id}
        open={open}
        onToggle={edit.onToggleTombstone}
      />
      {open ? (
        <div
          data-row="ghost-shot"
          data-ghost-id={shot.id}
          className={cn(SHOT_GRID, "min-h-[40px] text-[13px] opacity-60")}
        >
          <span className="tabular text-[var(--ink-500)]">–</span>
          <Ghost>{time}</Ghost>
          <Ghost>{sideLabel(shot.hitter, names)}</Ghost>
          <Ghost>{shot.stroke ? STROKE_LABEL[shot.stroke] : null}</Ghost>
          <Ghost>{shot.result ? RESULT_LABEL[shot.result] : null}</Ghost>
          <Ghost>{formatCourtPoint(shot.contactX, shot.contactY)}</Ghost>
          <Ghost>{formatCourtPoint(shot.landingX, shot.landingY)}</Ghost>
          <span className="flex min-w-0 items-center gap-2">
            {reason ? (
              <span className="truncate text-[12px] text-[var(--ink-500)]">
                {reason}
              </span>
            ) : null}
            {operations ? (
              <UndoButton
                label={
                  time ? `Undo delete shot at ${time}` : "Undo delete shot"
                }
                className="ml-auto"
                onClick={() => operations.onRestoreShot(shot.id)}
              />
            ) : null}
          </span>
        </div>
      ) : null}
    </>
  );
}

function DeletedPoint({
  point,
  edit,
}: {
  point: LabelPoint;
  edit: EditContext;
}) {
  const open = edit.openTombstoneIds.has(point.id);
  const { names, operations } = edit;
  const liveShots = point.shots.filter((shot) => shot.status !== "deleted");
  return (
    <>
      <DeletedMarker
        kind="point"
        id={point.id}
        open={open}
        onToggle={edit.onToggleTombstone}
      />
      {open ? (
        <div
          data-row="ghost-point"
          data-ghost-id={point.id}
          className={cn(POINT_GRID, "min-h-[44px] text-[13px] opacity-60")}
        >
          <span aria-hidden="true" />
          <span className="tabular text-[var(--ink-500)]">–</span>
          <Ghost>
            {point.setNumber !== null && point.gameNumber !== null
              ? `${point.setNumber} · ${point.gameNumber}`
              : null}
          </Ghost>
          <Ghost>{sideLabel(point.server, names)}</Ghost>
          <Ghost>{liveShots.length}</Ghost>
          <span aria-hidden="true" />
          <Ghost>{sideLabel(point.winner, names)}</Ghost>
          <Ghost>{point.ending ? ENDING_LABEL[point.ending] : null}</Ghost>
          <Ghost>{sideLabel(point.endedBy, names)}</Ghost>
          <span className="flex items-center">
            {operations ? (
              <UndoButton
                label={`Undo delete point ${point.pointIndex + 1}`}
                onClick={() => operations.onRestorePoint(point.id)}
              />
            ) : null}
          </span>
          <span aria-hidden="true" />
        </div>
      ) : null}
    </>
  );
}

/** A ghost row's value: struck through, muted. An empty one is a plain dash. */
function Ghost({ children }: { children: React.ReactNode }) {
  return (
    <span className="tabular truncate text-[var(--ink-500)] line-through">
      {/* An inline-block is not struck by its parent's line-through. */}
      {children ?? <span className="inline-block">—</span>}
    </span>
  );
}

/** Board 08's `.card-link`: a blue text action. */
function UndoButton({
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
function ResetRowButton({
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

/**
 * Board 08's `.xb`: the row's ✕, at its far right. Revealed on the row's
 * hover and on focus (and on a selected stroke), 200ms. It only ASKS — the
 * console opens the confirm; nothing is deleted from here.
 */
function DeleteRowButton({
  label,
  tooltip,
  onClick,
  revealed = false,
  className,
}: {
  label: string;
  tooltip: string;
  onClick: () => void;
  revealed?: boolean;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-delete-row=""
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          className={cn(
            "flex size-7 shrink-0 cursor-pointer items-center justify-center justify-self-end rounded-[var(--radius-element)] text-[var(--ink-400)] transition-[opacity,color,background-color] duration-200 group-hover/row:opacity-100 hover:bg-[var(--surface-subtle)] hover:text-[var(--danger)] focus-visible:bg-[var(--surface-subtle)] focus-visible:text-[var(--danger)] focus-visible:opacity-100 focus-visible:outline-none",
            revealed ? "opacity-100" : "opacity-0",
            className,
          )}
        >
          <X className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The set · game cell, as the move control: the same muted text, and a menu
 * of the games either side of the point (board 08's grip, "Move point N to
 * another game"). Each game says who serves it; picking one hands it to the
 * console, which asks "switch players?" first when that is not this point's
 * server.
 */
function MoveGameCell({
  point,
  number,
  text,
  edit,
  onMove,
}: {
  point: LabelPoint;
  number: number;
  text: string | null;
  edit: EditContext;
  onMove: (to: LabelGame) => void;
}) {
  const [open, setOpen] = useState(false);
  const games = neighbourGames(edit.points, point.id);
  if (games.length === 0) return <Calculated>{text}</Calculated>;
  return (
    // `data-cell` keeps the row from toggling; the stopPropagation catches
    // clicks inside the menu, which portals out of the row's DOM but still
    // bubbles through its React tree.
    <span
      data-cell=""
      className="flex min-w-0"
      onClick={(event) => event.stopPropagation()}
    >
      <FloatMenu
        open={open}
        onOpenChange={setOpen}
        align="start"
        width={220}
        label={`Move point ${number} to`}
        trigger={
          <button
            type="button"
            aria-label={`Move point ${number} to another game`}
            aria-haspopup="menu"
            aria-expanded={open}
            className="tabular -mx-1.5 cursor-pointer truncate rounded-[var(--radius-button)] px-1.5 py-0.5 text-left text-[var(--ink-500)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            {text ?? <EmptyMark label="Not set" />}
          </button>
        }
      >
        {games.map((game) => {
          const server = destinationServerIn(edit.points, point.id, game);
          return (
            <FloatMenuItem
              key={`${game.setNumber}-${game.gameNumber}`}
              label={`Set ${game.setNumber} · Game ${game.gameNumber}`}
              description={server ? `${edit.names[server]} serving` : undefined}
              onSelect={() => {
                setOpen(false);
                onMove(game);
              }}
            />
          );
        })}
        <FloatMenuNote>Only the games either side of this point.</FloatMenuNote>
      </FloatMenu>
    </span>
  );
}

/**
 * Under the open point's strokes: "Mark point checked ↵" (the one primary),
 * becoming "✓ Point checked · Undo"; and "Add shot", after the selected
 * stroke or at the end of the rally.
 */
function PointFooter({
  point,
  edit,
  operations,
}: {
  point: LabelPoint;
  edit: EditContext;
  operations: LabelRowOperations;
}) {
  const live = point.shots.filter((shot) => shot.status !== "deleted");
  const selectedIndex = live.findIndex(
    (shot) => shot.id === edit.selectedShotId,
  );
  const after = selectedIndex === -1 ? null : live[selectedIndex];
  const checked = point.checkedAt !== null;
  return (
    <div
      data-point-footer={point.id}
      className="flex items-center gap-2 pt-3 pr-4 pb-2 pl-11"
    >
      {checked ? (
        <span
          data-checked-state="checked"
          className="inline-flex h-8 items-center gap-1.5 text-[12px] whitespace-nowrap text-[var(--ink-700)]"
        >
          <Check
            className="size-[13px] text-[var(--ink-900)]"
            strokeWidth={2}
            aria-hidden="true"
          />
          Point checked
          <UndoButton
            label={`Undo point ${point.pointIndex + 1} checked`}
            className="ml-1.5 text-[12px]"
            onClick={() => operations.onSetChecked(point.id, false)}
          />
        </span>
      ) : (
        <button
          type="button"
          data-checked-state="unchecked"
          onClick={() => operations.onSetChecked(point.id, true)}
          className={advButton("primary", "sm")}
        >
          Mark point checked
          <kbd
            aria-hidden="true"
            className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] border border-white/35 bg-white/20 px-1 text-[10px] text-white"
          >
            ↵
          </kbd>
        </button>
      )}
      <button
        type="button"
        onClick={() => operations.onAddShot(point.id, after?.id ?? null)}
        className={advButton("outline", "sm")}
      >
        <Plus className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
        {after ? `Add shot after shot ${selectedIndex + 1}` : "Add shot"}
      </button>
    </div>
  );
}

/** Checked (✓) once `checked_at` is set; "To check" until then. */
function PointStatus({ checked }: { checked: boolean }) {
  return checked ? (
    <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap text-[var(--ink-700)]">
      <Check
        className="size-[13px] text-[var(--ink-900)]"
        strokeWidth={2}
        aria-hidden="true"
      />
      Checked
    </span>
  ) : (
    <span className="text-[12px] whitespace-nowrap text-[var(--ink-400)]">
      To check
    </span>
  );
}

/** A seeded value the labeller does not decide here: muted ink. */
/** The playing row's ground: a light blue wash, no stripe, no ring. */
const PLAYING_WASH = "var(--blue-tint-08)";

/**
 * A row's number. On the playing row it turns `--blue` and a small play glyph
 * follows it — after, so the numbers down the column stay aligned.
 */
function RowNumber({
  number,
  strong,
  playing,
}: {
  number: number;
  strong: boolean;
  playing: boolean;
}) {
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-1",
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

function Calculated({ children }: { children: React.ReactNode }) {
  return (
    <span className="tabular truncate text-[var(--ink-500)]">
      {children ?? <EmptyMark label="Not set" />}
    </span>
  );
}

/** A value the labeller owns: full ink, an em dash until it is set. */
function Labelled({ children }: { children: React.ReactNode }) {
  return (
    <span className="truncate text-[var(--ink-900)]">
      {children ?? <EmptyMark label="Not labelled" />}
    </span>
  );
}

/** A stroke value: an em dash until it is set. */
function Value({ children }: { children: React.ReactNode }) {
  return <>{children ?? <EmptyMark label="Not set" />}</>;
}

/** One of the point's labelled columns, as a select. */
function PointSelectCell({
  point,
  edit,
  field,
  label,
  value,
  text,
  options,
}: {
  point: LabelPoint;
  edit: EditContext;
  field: "winner" | "ending" | "ended_by";
  label: string;
  value: string | null;
  text: string | null;
  options: readonly SelectOption[];
}) {
  return (
    <EditableCell
      editable={edit.editable}
      label={label}
      valueText={text ?? "Not labelled"}
      display={<Labelled>{text}</Labelled>}
      editor={
        <SelectEditor
          label={label}
          value={value}
          options={options}
          onChange={(next) =>
            edit.onPatchPoint?.(point.id, {
              [field]: next,
            } as LabelPointPatch)
          }
        />
      }
    />
  );
}

function ShotSelectCell({
  editable,
  rowSelected,
  label,
  value,
  text,
  options,
  onChange,
}: {
  editable: boolean;
  rowSelected: boolean;
  label: string;
  value: string | null;
  text: string | null;
  options: readonly SelectOption[];
  onChange: (value: string | null) => void;
}) {
  return (
    <EditableCell
      editable={editable}
      rowSelected={rowSelected}
      label={label}
      valueText={text ?? "Not set"}
      display={<Value>{text}</Value>}
      editor={
        <SelectEditor
          label={label}
          value={value}
          options={options}
          onChange={onChange}
        />
      }
    />
  );
}

/** "x, y" in metres, typed; the court click is the other way in. */
function PositionCell({
  editable,
  rowSelected,
  label,
  text,
  onCommit,
}: {
  editable: boolean;
  rowSelected: boolean;
  label: string;
  text: string | null;
  onCommit: (point: { x: number; y: number } | null) => void;
}) {
  return (
    <EditableCell
      editable={editable}
      rowSelected={rowSelected}
      label={label}
      valueText={text ?? "Not set"}
      display={<Value>{text}</Value>}
      editor={
        <TextEditor
          label={`${label}, metres x, y`}
          text={text ?? ""}
          parse={parseCourtPoint}
          onCommit={(value) =>
            onCommit(value as { x: number; y: number } | null)
          }
        />
      }
    />
  );
}

function sideLabel(side: LabelSide | null, names: SideNames): string | null {
  return side ? names[side] : null;
}
