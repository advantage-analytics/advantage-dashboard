"use client";

import { useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { EmptyMark } from "@/components/ui/empty-mark";
import {
  FloatMenu,
  FloatMenuItem,
  FloatMenuLabel,
} from "@/components/ui/float-menu";
import { StatePill } from "@/components/ui/state-pill";
import { StatusChip } from "@/components/ui/status-chip";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import type { LabelPoint, LabelSide } from "@/lib/services/labels/session";
import {
  LABEL_ENDINGS,
  LABEL_NOTE_MAX,
  type LabelPointPatch,
} from "@/lib/services/labels/edit";
import { canResetPoint } from "@/lib/services/labels/reset";
import {
  EditableCell,
  SelectEditor,
  TextEditor,
  type SelectOption,
} from "./label-cells";
import {
  ENDING_LABEL,
  STROKE_LABEL,
  formatVideoTime,
  type SideNames,
} from "./label-format";
import { PointMenu } from "./label-point-menu";
import {
  DeletedMarker,
  Ghost,
  PLAYING_WASH,
  ResetRowButton,
  RowNumber,
  SideMark as WinnerMark,
  UndoButton,
  sideInitial,
  type EditContext,
  type LabelRowOperations,
} from "./label-row-parts";
import {
  POINT_CELL,
  POINT_GRID,
  SHOT_COLUMNS,
  SHOT_GRID,
} from "./label-table-layout";

/**
 * One point of the console's table — board 08g's `.pr` row.
 *
 * Left to right: the fold caret · the WINNER MARK (a 30px square with the
 * player's initial, and the menu that changes who won) · the point's number
 * and the time of its first stroke, in mono · the score before the point ·
 * how it ended (the one select) · the last shot and the rally's length, both
 * read off the strokes · a free-text note · the row's status · its ⋯ menu.
 *
 * Time, Score, Last shot and Rally are never typed here: they follow the
 * strokes and the points before this one, so correcting a stroke or a winner
 * is what changes them.
 *
 * The ⋯ menu holds what happens TO the point — move it to a neighbouring
 * game, reset it to its seed, delete it. Each only asks the console
 * (`LabelRowOperations`), which owns the confirm and the write.
 *
 * The strokes arrive as `children`: the table owns the stroke rows and hands
 * the open point's in, so this file never imports the table.
 */
export function PointRow({
  point,
  open,
  playing,
  onToggle,
  edit,
  children,
}: {
  point: LabelPoint;
  open: boolean;
  playing: boolean;
  onToggle?: (pointId: string) => void;
  edit: EditContext;
  /** The open point's stroke rows; nothing when it has none. */
  children?: React.ReactNode;
}) {
  const { operations } = edit;
  const number = point.pointIndex + 1;
  const shotsId = `label-point-${point.id}-shots`;
  const summary = pointSummary(point);
  const score = edit.scores.get(point.id)?.scoreBefore ?? null;

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
        {/* The row's one fold control. The row's own click does the same
            thing for a mouse; this is what a keyboard and a screen reader
            reach. */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? shotsId : undefined}
          aria-label={`${open ? "Hide" : "Show"} shots for point ${number}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggle?.(point.id);
          }}
          className={cn(
            "-ml-1 flex size-6 items-center justify-center rounded-[var(--radius-button)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
            open ? "text-[var(--ink-900)]" : "text-[var(--ink-400)]",
          )}
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

        <WinnerCell point={point} number={number} open={open} edit={edit} />
        <RowNumber
          number={number}
          strong={open}
          playing={playing}
          className={cn("font-mono text-[11px]", POINT_CELL.number)}
        />
        <span className="truncate font-mono text-[12px] text-[var(--ink-700)]">
          {summary.time ?? <EmptyMark label="No timed shot" />}
        </span>
        <span
          data-point-score=""
          className={cn(
            "tabular truncate text-[var(--ink-900)]",
            POINT_CELL.score,
          )}
        >
          {score ?? <EmptyMark label="No score" />}
        </span>
        <EndingCell point={point} number={number} edit={edit} />
        <span
          data-point-last-shot=""
          className="truncate text-[12px] text-[var(--ink-600)]"
        >
          {summary.lastShot ?? <EmptyMark label="No shot" />}
        </span>
        <span
          data-point-rally=""
          className={cn("tabular text-[var(--ink-700)]", POINT_CELL.rally)}
        >
          {summary.rally}
        </span>
        <NoteCell point={point} number={number} edit={edit} />
        <PointStatus
          point={point}
          number={number}
          open={open}
          operations={operations}
        />
        {operations ? (
          <PointMenu
            point={point}
            number={number}
            open={open}
            edit={edit}
            operations={operations}
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
              <span key={label} className="eyebrow-sm whitespace-nowrap">
                {label}
              </span>
            ))}
          </div>
          {children ?? (
            <p className="pl-11 text-[12px] text-[var(--ink-500)]">
              No strokes on this point
            </p>
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
 * What a point row reads off its strokes. Tombstones never count: the row
 * says what the rally is now, not what the vendor first reported.
 *   · `time` — the first live stroke that has a time;
 *   · `lastShot` — the last live stroke's name;
 *   · `rally` — the live strokes from the LAST serve on, that serve included,
 *     so a fault, a second serve and two groundstrokes is a rally of 3. A
 *     point with no serve labelled counts every live stroke.
 */
export function pointSummary(point: Pick<LabelPoint, "shots">): {
  time: string | null;
  lastShot: string | null;
  rally: number;
} {
  const live = point.shots.filter((shot) => shot.status !== "deleted");
  const timed = live.find((shot) => shot.videoTime !== null);
  const last = live.at(-1);
  const serve = live.findLastIndex(
    (shot) => shot.stroke === "first_serve" || shot.stroke === "second_serve",
  );
  return {
    time:
      timed && timed.videoTime !== null
        ? formatVideoTime(timed.videoTime)
        : null,
    lastShot: last?.stroke ? STROKE_LABEL[last.stroke] : null,
    rally: live.length - Math.max(serve, 0),
  };
}

// ── The winner mark ────────────────────────────────────────────────────────

const SIDES: readonly LabelSide[] = ["p1", "p2"];

/**
 * The winner mark as the control that changes it: a menu of the two players,
 * the current one checked. Choosing the other saves `{ winner }` — and, since
 * every later score in the game follows from it, says so on that row.
 * Read-only, it is the mark alone.
 */
function WinnerCell({
  point,
  number,
  open: rowOpen,
  edit,
}: {
  point: LabelPoint;
  number: number;
  open: boolean;
  edit: EditContext;
}) {
  const [open, setOpen] = useState(false);
  const { names } = edit;
  const name = point.winner
    ? `Point ${number} won by ${names[point.winner]}`
    : `Point ${number} winner not labelled`;
  if (!edit.editable) {
    return (
      <span role="img" aria-label={name} className="flex">
        <WinnerMark side={point.winner} names={names} />
      </span>
    );
  }
  // The ring sits on a 2px gap of the row's own ground, which is grey once
  // the point is open.
  const gap = rowOpen ? "var(--surface-muted)" : "var(--surface-card)";
  return (
    // `data-cell` keeps the row from toggling; the stopPropagation catches
    // clicks inside the menu, which portals out of the row's DOM but still
    // bubbles through its React tree.
    <span
      data-cell=""
      className="flex"
      onClick={(event) => event.stopPropagation()}
    >
      <FloatMenu
        open={open}
        onOpenChange={setOpen}
        align="start"
        sideOffset={8}
        width={260}
        label={`Who won point ${number}`}
        trigger={
          <button
            type="button"
            aria-label={name}
            aria-haspopup="menu"
            aria-expanded={open}
            className="cursor-pointer rounded-[var(--radius-button)] transition-shadow duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            style={
              open
                ? { boxShadow: `0 0 0 2px ${gap}, 0 0 0 3.5px var(--ink-300)` }
                : undefined
            }
          >
            <WinnerMark side={point.winner} names={names} />
          </button>
        }
      >
        <FloatMenuLabel>Won the point</FloatMenuLabel>
        {SIDES.map((side) => {
          const chosen = side === point.winner;
          return (
            <FloatMenuItem
              key={side}
              label={names[side]}
              description={
                chosen ? undefined : "Recalculates the scores after this point"
              }
              chosen={chosen}
              onSelect={() => {
                setOpen(false);
                if (!chosen) edit.onPatchPoint?.(point.id, { winner: side });
              }}
            />
          );
        })}
      </FloatMenu>
    </span>
  );
}

// ── The labelled cells ─────────────────────────────────────────────────────

const ENDING_OPTIONS: SelectOption[] = LABEL_ENDINGS.map((value) => ({
  value,
  label: ENDING_LABEL[value],
}));

/** How the point ended — the row's one select. */
function EndingCell({
  point,
  number,
  edit,
}: {
  point: LabelPoint;
  number: number;
  edit: EditContext;
}) {
  const label = `Point ${number} ending`;
  const text = point.ending ? ENDING_LABEL[point.ending] : null;
  return (
    <EditableCell
      editable={edit.editable}
      label={label}
      valueText={text ?? "Not labelled"}
      className={POINT_CELL.ending}
      display={
        <span className="font-medium text-[var(--ink-900)]">
          {text ?? <EmptyMark label="Not labelled" />}
        </span>
      }
      editor={
        <SelectEditor
          label={label}
          value={point.ending}
          options={ENDING_OPTIONS}
          onChange={(next) =>
            edit.onPatchPoint?.(point.id, {
              ending: next,
            } as LabelPointPatch)
          }
        />
      }
    />
  );
}

/** Typed text → the note to store: null when cleared, undefined when too long. */
function parseNote(text: string): string | null | undefined {
  const note = text.trim();
  if (note === "") return null;
  return note.length > LABEL_NOTE_MAX ? undefined : note;
}

/**
 * The point's note: a sentence about it, typed in place. Empty, an editable
 * row says "Add note" in muted ink — an invitation, not a value — and a
 * read-only one a dash.
 */
function NoteCell({
  point,
  number,
  edit,
}: {
  point: LabelPoint;
  number: number;
  edit: EditContext;
}) {
  const label = `Point ${number} note`;
  const { note } = point;
  return (
    <EditableCell
      editable={edit.editable}
      label={label}
      valueText={note ?? "None"}
      className={POINT_CELL.note}
      display={
        note ? (
          <span className="text-[12px] text-[var(--ink-600)]">{note}</span>
        ) : edit.editable ? (
          <span className="text-[12px] text-[var(--ink-400)]">Add note</span>
        ) : (
          <EmptyMark label="No note" />
        )
      }
      editor={
        <TextEditor
          label={label}
          text={note ?? ""}
          parse={parseNote}
          onCommit={(value) =>
            edit.onPatchPoint?.(point.id, { note: value as string | null })
          }
        />
      }
    />
  );
}

// ── Status ─────────────────────────────────────────────────────────────────

/**
 * The row's state, and the one action that state invites:
 *   · Checked, once `checked_at` is set;
 *   · else the Edited pill, on a point whose labels differ from its seed;
 *   · else "To check", with a ✓ that marks it checked without opening it.
 * A point that can be put back to its seed carries Reset at the cell's right
 * edge, revealed on hover, on focus and on the open point.
 */
export function PointStatus({
  point,
  number,
  open,
  operations,
}: {
  point: LabelPoint;
  number: number;
  open: boolean;
  operations?: LabelRowOperations;
}) {
  const checked = point.checkedAt !== null;
  const edited = point.status === "edited";
  return (
    <span
      data-point-status={checked ? "checked" : edited ? "edited" : "to-check"}
      className={cn("flex min-w-0 items-center gap-2.5", POINT_CELL.status)}
    >
      {checked ? (
        <StatusChip tone="win" className="text-[12px]">
          Checked
        </StatusChip>
      ) : edited ? (
        <StatePill>Edited</StatePill>
      ) : (
        <span className="text-[12px] whitespace-nowrap text-[var(--ink-400)]">
          To check
        </span>
      )}
      {operations && (checked || edited) && canResetPoint(point) ? (
        <span className="ml-auto flex">
          <ResetRowButton
            label={`Reset point ${number}`}
            revealed={open}
            onClick={() => operations.onAskResetPoint(point.id)}
          />
        </span>
      ) : null}
      {operations && !checked && !edited ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`Mark point ${number} checked`}
              data-check-row=""
              onClick={(event) => {
                event.stopPropagation();
                operations.onSetChecked(point.id, true);
              }}
              className={cn(
                "ml-auto flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-[opacity,color,background-color] duration-200 group-hover/row:opacity-100 hover:bg-[var(--surface-subtle)] hover:text-[var(--success)] focus-visible:opacity-100 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                open ? "opacity-100" : "opacity-0",
              )}
            >
              <Check
                className="size-3.5"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Mark point checked</TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}

// ── Under the open point ───────────────────────────────────────────────────

/**
 * Under the open point's strokes: "Mark point checked ↵" (the one primary),
 * becoming "✓ Point checked · Undo"; and "Add shot", after the selected
 * stroke or at the end of the rally.
 */
export function PointFooter({
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

// ── A deleted point ────────────────────────────────────────────────────────

/**
 * A tombstone: the red rule and its pill, expanding to a struck-through ghost
 * of the row on the same tracks, where Undo lives (in the Status column). A
 * deleted point has no score — it is not in the game any more.
 */
export function DeletedPoint({
  point,
  edit,
}: {
  point: LabelPoint;
  edit: EditContext;
}) {
  const open = edit.openTombstoneIds.has(point.id);
  const { names, operations } = edit;
  const summary = pointSummary(point);
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
          <Ghost>
            {point.winner ? sideInitial(point.winner, names) : null}
          </Ghost>
          <span
            className={cn("tabular text-[var(--ink-500)]", POINT_CELL.number)}
          >
            –
          </span>
          <Ghost>{summary.time}</Ghost>
          <span aria-hidden="true" />
          <Ghost className={POINT_CELL.ending}>
            {point.ending ? ENDING_LABEL[point.ending] : null}
          </Ghost>
          <Ghost>{summary.lastShot}</Ghost>
          <Ghost className={POINT_CELL.rally}>{summary.rally}</Ghost>
          <Ghost className={POINT_CELL.note}>{point.note}</Ghost>
          <span className={cn("flex items-center", POINT_CELL.status)}>
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
