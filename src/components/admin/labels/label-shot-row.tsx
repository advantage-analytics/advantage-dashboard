"use client";

import { Crosshair, X } from "lucide-react";
import { EmptyMark } from "@/components/ui/empty-mark";
import { StatePill } from "@/components/ui/state-pill";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  LabelPoint,
  LabelShot,
  LabelSide,
} from "@/lib/services/labels/session";
import { isLabelDeleteReason } from "@/lib/services/labels/operations";
import {
  LABEL_STROKES,
  labelShotValues,
  type LabelShotPatch,
} from "@/lib/services/labels/edit";
import { canResetShot } from "@/lib/services/labels/reset";
import {
  deriveShotResult,
  shotPlacement,
} from "@/lib/services/labels/shot-derived";
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
import {
  DeletedMarker,
  Ghost,
  PLAYING_WASH,
  ResetRowButton,
  RowNumber,
  SideMark,
  UndoButton,
  sideLabel,
  type EditContext,
} from "./label-row-parts";
import { SHOT_ROW_GRID } from "./label-table-layout";

/**
 * The open point's strokes — board 08g's `.srows` card and its `.srw` rows.
 *
 * The strokes sit in one bordered card folded under their point, on the
 * fold's grey ground: 40px rows split by hairlines, the stroke's number and
 * time in mono, a 22px player chip (the point row's winner mark, smaller)
 * beside the hitter's name.
 *
 * Left to right: Shot · Time · Player · Stroke · Hit at · Landed at ·
 * Placement · Result · Status · the row's ✕. Time, Player, Stroke and the two
 * positions are `EditableCell`s — text until hovered, selected or opened from
 * the keyboard. PLACEMENT and RESULT are never typed or picked: they follow
 * the two positions (`shot-derived.ts`), so they are plain text with a small
 * aim glyph and a tooltip saying so, and a typed position sends the result it
 * derives in the same patch (`positionPatch`), exactly as a court click does.
 *
 * A FAULT — a serve that did not go in — is muted to `--ink-500` and says
 * "Fault" in its Status cell: it is part of the point, but not of the rally.
 *
 * Row states, none of which is another: SELECTED (a grey ground, every editor
 * mounted, the stroke a court click places), PLAYING (the blue wash and a
 * blue number — see `RowNumber`), ADDED (a blue ring and tint, and the Added
 * pill). A tombstone is a thin red rule (`DeletedMarker`) that expands to a
 * struck-through ghost of the row, with Undo.
 */

/**
 * The strokes, numbered 1…n among the live ones: a tombstone takes no number,
 * so the numbers are the rally as the labeller now says it went.
 */
export function ShotRows({
  point,
  edit,
}: {
  point: LabelPoint;
  edit: EditContext;
}) {
  const pointNumber = point.pointIndex + 1;
  const rows: React.ReactNode[] = [];
  let n = 0;
  for (const shot of point.shots) {
    if (shot.status === "deleted") {
      rows.push(<DeletedShot key={shot.id} shot={shot} edit={edit} />);
      continue;
    }
    n += 1;
    rows.push(
      <ShotRow
        key={shot.id}
        shot={shot}
        number={n}
        pointNumber={pointNumber}
        edit={edit}
      />,
    );
  }
  return (
    <div
      data-shot-card=""
      className="mr-4 ml-8 divide-y divide-[var(--border-hairline)] overflow-hidden rounded-[var(--radius-element)] border border-[var(--border-card)] bg-[var(--surface-card)]"
    >
      {rows}
    </div>
  );
}

/** A serve that did not go in: part of the point, not of the rally. */
function isFault(shot: Pick<LabelShot, "stroke" | "result">): boolean {
  return (
    (shot.stroke === "first_serve" || shot.stroke === "second_serve") &&
    (shot.result === "out" || shot.result === "net")
  );
}

/**
 * The patch a typed position sends: the two coordinates of that end AND the
 * result the row's values derive once they are in — one write, so In / Out /
 * Net never lags the position it follows. Clearing an end (or typing one
 * while the other is still missing) leaves nothing to derive from:
 * `deriveShotResult` answers null, the patch carries no `result` key, and the
 * row keeps its stored value — `nextPlacement`'s rule for a court click.
 */
export function positionPatch(
  shot: LabelShot,
  end: "contact" | "landing",
  point: { x: number; y: number } | null,
): LabelShotPatch {
  const x = point?.x ?? null;
  const y = point?.y ?? null;
  const placed: LabelShotPatch =
    end === "contact"
      ? { contact_x: x, contact_y: y }
      : { landing_x: x, landing_y: y };
  const result = deriveShotResult({ ...labelShotValues(shot), ...placed });
  return result === null ? placed : { ...placed, result };
}

const CALCULATED_HINT = "Set by where the shot was hit and where it landed";

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

export function ShotRow({
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
  const fault = isFault(shot);
  const select = () => {
    if (!selected) onSelectShot?.(shot.id);
  };
  const patch = (value: LabelShotPatch) => onPatchShot?.(shot.id, value);
  const cell = { editable, rowSelected: selected };
  const time = shot.videoTime !== null ? formatVideoTime(shot.videoTime) : null;
  const placement = shotPlacement(labelShotValues(shot));

  return (
    // Selecting is a pointer convenience; the keyboard selects by focusing
    // any cell in the row, which bubbles here as the same call.
    <div
      data-row="shot"
      data-shot-id={shot.id}
      data-selected={selected ? "" : undefined}
      data-playing={playing ? "true" : undefined}
      data-fault={fault ? "" : undefined}
      onClick={select}
      onFocus={select}
      className={cn(
        SHOT_ROW_GRID,
        "group/row min-h-[40px] text-[13px] transition-colors duration-200",
        fault ? "text-[var(--ink-500)]" : "text-[var(--ink-900)]",
        selected
          ? "bg-[var(--surface-subtle)]"
          : editable && "cursor-pointer hover:bg-[var(--surface-muted)]",
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
      <RowNumber
        number={number}
        strong={selected}
        playing={playing}
        className="font-mono text-[11px]"
      />
      <EditableCell
        {...cell}
        label={`Shot ${number} time`}
        valueText={time ?? "Not set"}
        display={
          <Value>
            {time ? (
              <span className="font-mono text-[12px]">{time}</span>
            ) : null}
          </Value>
        }
        editor={
          <TextEditor
            label={`Shot ${number} time`}
            text={time ?? ""}
            parse={parseVideoTime}
            onCommit={(value) => patch({ video_time: value as number | null })}
          />
        }
      />
      {/* The chip keeps 14px clear of the name: the editor's chrome reaches
          11px back from its text, and must not run under the chip. */}
      <span className="flex min-w-0 items-center gap-3.5">
        <SideMark
          side={shot.hitter}
          names={names}
          size={22}
          attr="data-player-mark"
        />
        <ShotSelectCell
          {...cell}
          className="flex-1"
          label={`Shot ${number} player`}
          value={shot.hitter}
          text={sideLabel(shot.hitter, names)}
          options={sideOptions(names)}
          onChange={(value) => patch({ hitter: value as LabelSide | null })}
        />
      </span>
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
      <PositionCell
        {...cell}
        label={`Shot ${number} hit at`}
        text={formatCourtPoint(shot.contactX, shot.contactY)}
        onCommit={(p) => patch(positionPatch(shot, "contact", p))}
      />
      <PositionCell
        {...cell}
        label={`Shot ${number} landed at`}
        text={formatCourtPoint(shot.landingX, shot.landingY)}
        onCommit={(p) => patch(positionPatch(shot, "landing", p))}
      />
      <CalculatedCell name="placement" revealed={selected} muted={fault}>
        {placement ?? <EmptyMark label="No placement" />}
      </CalculatedCell>
      <CalculatedCell name="result" revealed={selected} muted={fault}>
        {shot.result ? (
          RESULT_LABEL[shot.result]
        ) : (
          <EmptyMark label="No result" />
        )}
      </CalculatedCell>
      <span className="flex min-w-0 items-center gap-2">
        {added ? (
          <StatePill>Added</StatePill>
        ) : shot.status === "edited" ? (
          <StatePill>Edited</StatePill>
        ) : null}
        {fault ? (
          <span className="text-[12px] whitespace-nowrap text-[var(--ink-500)]">
            Fault
          </span>
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
      </span>
      {operations ? (
        <DeleteRowButton
          label={`Delete shot ${number}`}
          tooltip="Delete shot"
          revealed={selected}
          onClick={() =>
            operations.onAskDeleteShot(shot.id, number, pointNumber)
          }
        />
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  );
}

export function DeletedShot({
  shot,
  edit,
}: {
  shot: LabelShot;
  edit: EditContext;
}) {
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
          className={cn(SHOT_ROW_GRID, "min-h-[40px] text-[13px] opacity-60")}
        >
          <span className="font-mono text-[11px] text-[var(--ink-500)]">–</span>
          <Ghost className="font-mono text-[12px]">{time}</Ghost>
          <Ghost>{sideLabel(shot.hitter, names)}</Ghost>
          <Ghost>{shot.stroke ? STROKE_LABEL[shot.stroke] : null}</Ghost>
          <Ghost>{formatCourtPoint(shot.contactX, shot.contactY)}</Ghost>
          <Ghost>{formatCourtPoint(shot.landingX, shot.landingY)}</Ghost>
          <Ghost className="text-[12px]">
            {shotPlacement(labelShotValues(shot))}
          </Ghost>
          <Ghost className="text-[12px]">
            {shot.result ? RESULT_LABEL[shot.result] : null}
          </Ghost>
          {/* Why it went, and Undo: across the Status and ✕ tracks. */}
          <span className="col-span-2 flex min-w-0 items-center gap-2">
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
 * Board 08's `.xb`: the row's ✕, in its own last track. Revealed on the row's
 * hover and on focus (and on a selected stroke), 200ms. It only ASKS — the
 * console opens the confirm; nothing is deleted from here.
 */
function DeleteRowButton({
  label,
  tooltip,
  onClick,
  revealed = false,
}: {
  label: string;
  tooltip: string;
  onClick: () => void;
  revealed?: boolean;
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

/**
 * A value nobody types: it follows the stroke's two positions. Quieter than
 * an editable value (12px, `--ink-600`), never a control — and on the row
 * being hovered or selected, where a labeller would reach to change it, an
 * aim glyph appears after it; the tooltip says what sets it.
 */
function CalculatedCell({
  name,
  revealed,
  muted,
  children,
}: {
  name: "placement" | "result";
  revealed: boolean;
  /** A fault row: the row's own muted ink, not this cell's. */
  muted: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-calculated={name}
          className={cn(
            "flex min-w-0 items-center gap-1 justify-self-start text-[12px] whitespace-nowrap",
            !muted && "text-[var(--ink-600)]",
          )}
        >
          {children}
          <Crosshair
            className={cn(
              "size-[11px] shrink-0 text-[var(--ink-400)] transition-opacity duration-200 group-hover/row:opacity-100",
              revealed ? "opacity-100" : "opacity-0",
            )}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{CALCULATED_HINT}</TooltipContent>
    </Tooltip>
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
  className,
}: {
  editable: boolean;
  rowSelected: boolean;
  label: string;
  value: string | null;
  text: string | null;
  options: readonly SelectOption[];
  onChange: (value: string | null) => void;
  className?: string;
}) {
  return (
    <EditableCell
      editable={editable}
      rowSelected={rowSelected}
      className={className}
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

/**
 * "x, y" in metres, typed; the court click is the other way in. The value is
 * never cut: its track (`SHOT_TRACKS`) is wider than the longest pair, in the
 * text and in the editor.
 */
export function PositionCell({
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
      display={
        <Value>
          {text ? <span className="whitespace-nowrap">{text}</span> : null}
        </Value>
      }
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
