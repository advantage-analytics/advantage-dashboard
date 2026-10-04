"use client";

import { useMemo } from "react";
import { ClipboardList, X } from "lucide-react";
import { EmptyMark } from "@/components/ui/empty-mark";
import { StatePill } from "@/components/ui/state-pill";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import { cn } from "@/lib/utils";
import type {
  LabelPoint,
  LabelShot,
  LabelSide,
} from "@/lib/services/labels/session";
import { isLabelDeleteReason } from "@/lib/services/labels/operations";
import {
  LABEL_SHOT_RESULTS,
  LABEL_STROKES,
  type LabelPointPatch,
  type LabelShotPatch,
} from "@/lib/services/labels/edit";
import { canResetShot } from "@/lib/services/labels/reset";
import { labelScores, type LabelPointScore } from "@/lib/services/labels/score";
import {
  EditableCell,
  SelectEditor,
  TextEditor,
  type SelectOption,
} from "./label-cells";
import {
  DELETE_REASON_LABEL,
  RESULT_LABEL,
  STROKE_LABEL,
  formatCourtPoint,
  formatVideoTime,
  parseCourtPoint,
  parseVideoTime,
  type SideNames,
} from "./label-format";
import { DeletedPoint, PointRow } from "./label-point-row";
import {
  DeletedMarker,
  Ghost,
  PLAYING_WASH,
  ResetRowButton,
  RowNumber,
  UndoButton,
  sideLabel,
  type EditContext,
  type LabelRowOperations,
} from "./label-row-parts";
import { POINT_COLUMNS, POINT_GRID, SHOT_GRID } from "./label-table-layout";

export type { LabelRowOperations };

/**
 * The console's points table — board 08g's lower half.
 *
 * One row per `label_points` row, in `point_index` order (`PointRow`, in
 * `label-point-row.tsx`); the expanded point's strokes fold underneath it in
 * video order (the console keeps them there with `orderLabelShots`,
 * re-sorting after a time edit). This file owns the table's frame and the
 * STROKE rows; every stroke value is an `EditableCell`: text until hovered,
 * selected or opened from the keyboard, each change handed straight to the
 * console to autosave.
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
        <div className="min-w-[1108px] px-6 pt-0.5 pb-1.5">
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

function sideOptions(names: SideNames): SelectOption[] {
  return [
    { value: "p1", label: names.p1 },
    { value: "p2", label: names.p2 },
  ];
}

const STROKE_OPTIONS: SelectOption[] = LABEL_STROKES.map((value) => ({
  value,
  label: STROKE_LABEL[value],
}));
const RESULT_OPTIONS: SelectOption[] = LABEL_SHOT_RESULTS.map((value) => ({
  value,
  label: RESULT_LABEL[value],
}));

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

/** A stroke value: an em dash until it is set. */
function Value({ children }: { children: React.ReactNode }) {
  return <>{children ?? <EmptyMark label="Not set" />}</>;
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
