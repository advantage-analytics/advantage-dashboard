import { Check, ChevronDown, ClipboardList } from "lucide-react";
import { EmptyMark } from "@/components/ui/empty-mark";
import { StatePill } from "@/components/ui/state-pill";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import { cn } from "@/lib/utils";
import type {
  LabelPoint,
  LabelShot,
  LabelSide,
} from "@/lib/services/labels/session";
import {
  LABEL_ENDINGS,
  LABEL_SHOT_RESULTS,
  LABEL_STROKES,
  type LabelPointPatch,
  type LabelShotPatch,
} from "@/lib/services/labels/edit";
import {
  EditableCell,
  SelectEditor,
  TextEditor,
  type SelectOption,
} from "./label-cells";
import {
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
 * each change handed straight to the console to autosave. T7 turns the
 * deleted markers into expanders with Undo.
 *
 * Clicking a stroke (or tabbing into one) SELECTS it: the selected stroke
 * shows every field, and it is the one a court click places.
 *
 * A tombstone is not drawn as a row at all. A deleted point or shot is a thin
 * red rule with a "Deleted point" / "Deleted shot" pill on it — present, so
 * the labeller can see something was removed there, but never read as a
 * point to check or a stroke to count.
 *
 * Stateless: which point is open, which stroke is selected and the rows
 * themselves are the caller's (`LabelConsole` holds them), so a spec can
 * render any state without clicking.
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
}) {
  const edit: EditContext = {
    editable,
    names,
    selectedShotId,
    onSelectShot,
    onPatchPoint,
    onPatchShot,
  };
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
      <div className="min-w-[900px] px-6 pt-0.5 pb-1.5">
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
              <DeletedMarker key={point.id} kind="point" />
            ) : (
              <PointRow
                key={point.id}
                point={point}
                open={point.id === expandedPointId}
                onToggle={onTogglePoint}
                edit={edit}
              />
            ),
          )
        )}
      </div>
    </div>
  );
}

/** What every row needs to draw and save its editors. */
interface EditContext {
  editable: boolean;
  names: SideNames;
  selectedShotId: string | null;
  onSelectShot?: (shotId: string) => void;
  onPatchPoint?: (pointId: string, patch: LabelPointPatch) => void;
  onPatchShot?: (shotId: string, patch: LabelShotPatch) => void;
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
  onToggle,
  edit,
}: {
  point: LabelPoint;
  open: boolean;
  onToggle?: (pointId: string) => void;
  edit: EditContext;
}) {
  const { names } = edit;
  const number = point.pointIndex + 1;
  const shotsId = `label-point-${point.id}-shots`;
  const liveShots = point.shots.filter((shot) => shot.status !== "deleted");

  return (
    <>
      <div
        data-row="point"
        data-point-id={point.id}
        onClick={(event) => {
          // A click that lands in a cell is an edit, not a toggle.
          if ((event.target as Element).closest("[data-cell]")) return;
          onToggle?.(point.id);
        }}
        className={cn(
          POINT_GRID,
          "-mx-4 min-h-[52px] cursor-pointer rounded-[var(--radius-element)] px-4 text-[13px] transition-colors duration-200",
          open
            ? "rounded-b-none bg-[var(--surface-muted)]"
            : "hover:bg-[var(--surface-muted)]",
        )}
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

        <span
          className={cn(
            "tabular",
            open
              ? "font-medium text-[var(--ink-900)]"
              : "text-[var(--ink-600)]",
          )}
        >
          {number}
        </span>
        <Calculated>
          {point.setNumber !== null && point.gameNumber !== null
            ? `${point.setNumber} · ${point.gameNumber}`
            : null}
        </Calculated>
        <Calculated>{sideLabel(point.server, names)}</Calculated>
        <Calculated>{liveShots.length}</Calculated>
        <span aria-hidden="true" />

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
            <ShotRows shots={point.shots} edit={edit} />
          )}
        </div>
      ) : null}
    </>
  );
}

/**
 * The strokes, numbered 1…n among the live ones: a tombstone takes no number,
 * so the numbers are the rally as the labeller now says it went.
 */
function ShotRows({
  shots,
  edit,
}: {
  shots: readonly LabelShot[];
  edit: EditContext;
}) {
  let n = 0;
  return shots.map((shot) => {
    if (shot.status === "deleted") {
      return <DeletedMarker key={shot.id} kind="shot" />;
    }
    n += 1;
    return <ShotRow key={shot.id} shot={shot} number={n} edit={edit} />;
  });
}

function ShotRow({
  shot,
  number,
  edit,
}: {
  shot: LabelShot;
  number: number;
  edit: EditContext;
}) {
  const { names, editable, onSelectShot, onPatchShot } = edit;
  const added = shot.status === "added";
  const selected = shot.id === edit.selectedShotId;
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
      onClick={select}
      onFocus={select}
      className={cn(
        SHOT_GRID,
        "min-h-[44px] text-[13px] text-[var(--ink-900)] transition-colors duration-200",
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
              background: "color-mix(in srgb, var(--blue) 3%, transparent)",
            }
          : undefined
      }
    >
      <span
        className={cn(
          "tabular",
          selected
            ? "font-medium text-[var(--ink-900)]"
            : "text-[var(--ink-600)]",
        )}
      >
        {number}
      </span>
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
      <span className="flex min-w-0 items-center">
        {added ? (
          <StatePill>Added</StatePill>
        ) : shot.status === "edited" ? (
          <StatePill>Edited</StatePill>
        ) : null}
      </span>
    </div>
  );
}

/**
 * A tombstone: a thin red rule carrying a small pill. Static in T5 — T7 makes
 * the pill a button that opens the struck-through row with Undo.
 */
function DeletedMarker({ kind }: { kind: "point" | "shot" }) {
  const label = kind === "point" ? "Deleted point" : "Deleted shot";
  return (
    <div
      data-row={kind === "point" ? "deleted-point" : "deleted-shot"}
      className={cn(
        "flex h-7 items-center gap-2",
        kind === "shot" ? "pr-4 pl-11" : "",
      )}
    >
      <span
        className="inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap text-[var(--danger-hover)]"
        style={{
          background: "color-mix(in srgb, var(--danger) 8%, transparent)",
          boxShadow:
            "inset 0 0 0 1px color-mix(in srgb, var(--danger) 25%, transparent)",
        }}
      >
        {label}
      </span>
      <span
        className="h-px flex-1"
        style={{
          background: "color-mix(in srgb, var(--danger) 35%, transparent)",
        }}
        aria-hidden="true"
      />
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
