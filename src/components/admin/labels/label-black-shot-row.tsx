"use client";

import { Plus, RotateCcw, Undo2, WandSparkles, X } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  isGhostShot,
  type LabelPoint,
  type LabelShot,
  type LabelSide,
} from "@/lib/services/labels/session";
import {
  labelShotValues,
  type LabelShotPatch,
} from "@/lib/services/labels/edit";
import type { LabelMarks } from "@/lib/services/labels/marks";
import { isLabelDeleteReason } from "@/lib/services/labels/operations";
import { canResetShot } from "@/lib/services/labels/reset";
import { shotPlacement } from "@/lib/services/labels/shot-derived";
import { courtPair, withoutGhosts } from "./label-black-format";
import {
  MarkChip,
  PencilMark,
  shotRowMarks,
  type ShotRowMark,
} from "./label-black-mark";
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
  spinLabel,
  spinOptions,
} from "./label-format";
import { sideLabel, type EditContext } from "./label-row-parts";
import {
  STROKE_OPTIONS,
  isFault,
  positionPatch,
  sideOptions,
} from "./label-shot-row";

/**
 * The black full-screen view's strokes (board 08l's `.bk-well` and `.bk-sr`):
 * the open point's shots in a recessed well under its row, on the room's
 * black.
 *
 * The same strokes, the same editors and the same single-field writes as the
 * light table's card (`label-shot-row.tsx`) — a third of its width, so there
 * is NO header row: a hollow ring says "hit at", a filled dot "landed at",
 * and every other column reads as what it is.
 *
 * Colours are the frame's: white at an alpha on black, and `--blue` for the
 * "changed" pencil. Nothing here is a light token.
 */

/**
 * The frame's `.bk-sr` tracks: number · time · player · stroke · spin ·
 * hit at · landed at · placement · result.
 *
 * The frame draws them for a 640px rail — 22 · 48 · 54 · 80 · 52 · 88 · 88 ·
 * 88 and what is left — and that is exactly what each `minmax()` here grows
 * to: a grid fills every track to its maximum before the `1fr` takes
 * anything, so at 640 and wider the row is the frame's. But the rail goes
 * down to 520 (`RAIL_MIN_PX`), where those fixed tracks alone need 612 and
 * pushed the result off the rail. So the words give: each track's MINIMUM is
 * what its shortest useful reading needs, the minimums with the gaps and the
 * padding come to 518, and a word that no longer fits truncates (a select's
 * whole word is in its menu, the placement's in a tooltip). The two positions never give — they are the numbers being checked.
 *
 * The row's two requests take NO track: they are an overlay on its right
 * edge (`data-shot-actions`), so reaching for a row never moves a column.
 */
const ROW_GRID =
  "relative grid grid-cols-[22px_minmax(44px,48px)_minmax(36px,54px)_minmax(52px,80px)_minmax(30px,52px)_88px_88px_minmax(38px,88px)_minmax(28px,1fr)] items-center gap-x-2 h-[34px] px-[14px]";

/**
 * The ground under the row's two requests: the rail's own `--surface-dark`
 * with the washes the row is wearing painted back over it — the well's, then
 * the lit row's or the hovered one's — so the patch is the row's colour and
 * the result text it covers does not show through the buttons. Its left 16px
 * fade in (a mask), so the words run under it rather than into an edge.
 */
const WELL_WASH = "rgba(255,255,255,0.035)";
function actionsGround(lit: boolean): string {
  const wash = lit ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)";
  return `linear-gradient(${wash},${wash}),linear-gradient(${WELL_WASH},${WELL_WASH})`;
}

const NO_MARKS: readonly ShotRowMark[] = [];

/** The frame's `.bk-em`: a value that is not there. */
const EMPTY_INK = "rgba(255,255,255,0.25)";
/** `.bk-tm`'s ink, and a faulted serve's stroke and numbers. */
const QUIET_INK = "rgba(255,255,255,0.45)";
/** `.bk-sk` and `.bk-num`. */
const VALUE_INK = "rgba(255,255,255,0.72)";
/** A ghost's struck-through values — the frame's `.fx-gone`. */
const GONE_INK = "rgba(255,255,255,0.32)";

/**
 * Whether the black view draws a site-removed stroke as a ghost (board 08m
 * §3): only on a session that computes marks, and only while it has them.
 * Otherwise — the ground-truth session, or a build that failed — a ghost is
 * an ordinary numbered row, exactly as in the three light layouts.
 */
export function drawsGhosts(
  edit: Pick<EditContext, "marksEnabled">,
  marks: LabelMarks | null | undefined,
): boolean {
  return edit.marksEnabled === true && marks !== null && marks !== undefined;
}

/**
 * The open point's strokes — the frame's `.bk-well`, drawn inside the point
 * row's own `data-shots-for` wrapper (`label-black-point-row.tsx`).
 *
 * The strokes are numbered 1…n among the live ones, as the light table
 * numbers them: a tombstone takes no number — and nor does a ghost while it
 * is drawn as one (`drawsGhosts`), which is also when the rally count, the
 * point's two lines and the marks' hover sentence skip it. The trailing "Add
 * shot" appends to the rally; it is there only while the session can be
 * written.
 */
export function BlackShotsWell({
  point,
  edit,
  marks = null,
}: {
  point: LabelPoint;
  edit: EditContext;
  /** The session's marks; null draws no chip on any stroke. */
  marks?: LabelMarks | null;
}) {
  const { operations } = edit;
  const pointNumber = point.pointIndex + 1;
  const ghosts = drawsGhosts(edit, marks);
  // The point as the rail reads it: without its ghosts while they are ghosts.
  const shown = ghosts ? withoutGhosts(point) : point;
  const rows: React.ReactNode[] = [];
  let n = 0;
  for (const shot of point.shots) {
    if (shot.status === "deleted") {
      rows.push(<BlackDeletedShot key={shot.id} shot={shot} edit={edit} />);
      continue;
    }
    if (ghosts && isGhostShot(shot)) {
      rows.push(<BlackGhostShot key={shot.id} shot={shot} edit={edit} />);
      continue;
    }
    n += 1;
    rows.push(
      <BlackShotRow
        key={shot.id}
        shot={shot}
        number={n}
        pointNumber={pointNumber}
        edit={edit}
        marks={shotRowMarks(shown, shot, marks, edit.names)}
      />,
    );
  }
  return (
    <div
      data-shots-well={point.id}
      className="flex flex-col bg-white/[0.035] py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(255,255,255,0.06)]"
    >
      {rows}
      {edit.editable && operations ? (
        <button
          type="button"
          data-add-shot=""
          onClick={() => operations.onAddShot(point.id, null)}
          // The row's own first track and gap, so the plus sits under the
          // numbers and the words under the times, at any rail width.
          className="grid h-[34px] w-full cursor-pointer grid-cols-[22px_minmax(0,1fr)] items-center gap-x-2 px-[14px] text-left text-[11px] font-medium text-white/70 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          <Plus
            className="size-2.5"
            style={{ color: QUIET_INK }}
            strokeWidth={2}
            aria-hidden="true"
          />
          Add shot
        </button>
      ) : null}
    </div>
  );
}

/**
 * One stroke — the frame's `.bk-sr`.
 *
 * Left to right: its number · its time on the film, to the tenth · who hit
 * it · the stroke · its spin · where it was hit (the ring) · where it landed
 * (the dot) · the placement and the result those two positions give, which
 * nobody types · the stroke's own marks (board 08m), an icon each, hover for
 * the reason · the blue pencil on a stroke the labeller changed or added.
 *
 * Time, Player, Stroke, Spin and the two positions are the light table's
 * `EditableCell`s: text until hovered, and every one a field on the SELECTED
 * row. A typed position sends the result it derives in the same patch
 * (`positionPatch`), exactly as a court click does.
 *
 * The row's two requests — Reset (an edited stroke with a seed) and Delete —
 * are an overlay on the row's right edge, out of the grid, there only on
 * hover, on focus and on the selected row, so the row at rest is the frame's
 * and no column moves when they appear. Each only ASKS, as the light row's
 * do: the console opens the confirm.
 *
 * LIT — selected, or the stroke the film is on — is the frame's `.bk-lit`
 * wash. A FAULT, a serve that did not go in, is a step quieter throughout:
 * part of the point, not of the rally.
 */
export function BlackShotRow({
  shot,
  number,
  pointNumber,
  edit,
  marks = NO_MARKS,
}: {
  shot: LabelShot;
  number: number;
  /** The point's number, for the confirm the console opens. */
  pointNumber: number;
  edit: EditContext;
  /** This stroke's own marks (`shotRowMarks`), drawn after its result. */
  marks?: readonly ShotRowMark[];
}) {
  const { names, editable, onSelectShot, onPatchShot } = edit;
  const operations = editable ? edit.operations : undefined;
  const selected = shot.id === edit.selectedShotId;
  const playing = shot.id === edit.playingShotId;
  const lit = selected || playing;
  const fault = isFault(shot);
  const changed = shot.status === "edited" || shot.status === "added";
  const select = () => {
    if (!selected) onSelectShot?.(shot.id);
  };
  const patch = (value: LabelShotPatch) => onPatchShot?.(shot.id, value);
  const cell = { editable, rowSelected: selected };
  const time = shot.videoTime !== null ? formatVideoTime(shot.videoTime) : null;
  const placement = shotPlacement(labelShotValues(shot));
  /** The words' ink — `.bk-pl`, `.bk-sp`, `.bk-cv` — a step down on a fault. */
  const words = fault ? "text-white/35" : "text-white/50";

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
        ROW_GRID,
        // A size container, for a mark that narrows with the rail.
        "group/row @container transition-colors duration-200",
        lit
          ? "bg-white/[0.12]"
          : editable && "cursor-pointer hover:bg-white/[0.06]",
      )}
    >
      <span
        className={cn(
          "mono tabular text-[10px]",
          lit ? "text-white/80" : "text-white/35",
        )}
      >
        {number}
        {playing ? <span className="sr-only">, playing</span> : null}
      </span>
      <EditableCell
        {...cell}
        label={`Shot ${number} time`}
        valueText={time ?? "Not set"}
        display={
          time ? (
            <span
              className="mono tabular text-[10px]"
              style={{ color: QUIET_INK }}
            >
              {time}
            </span>
          ) : (
            <Dash label="Not set" />
          )
        }
        editor={
          <TextEditor
            tone="dark"
            label={`Shot ${number} time`}
            text={time ?? ""}
            parse={parseVideoTime}
            onCommit={(value) => patch({ video_time: value as number | null })}
          />
        }
      />
      <BlackSelectCell
        {...cell}
        label={`Shot ${number} player`}
        value={shot.hitter}
        text={sideLabel(shot.hitter, names)}
        options={sideOptions(names)}
        className={cn("text-[11px]", words)}
        onChange={(value) => patch({ hitter: value as LabelSide | null })}
      />
      <BlackSelectCell
        {...cell}
        label={`Shot ${number} stroke`}
        value={shot.stroke}
        text={shot.stroke ? STROKE_LABEL[shot.stroke] : null}
        options={STROKE_OPTIONS}
        className={cn("text-[11px] font-medium", lit && "text-white")}
        style={lit ? undefined : { color: fault ? QUIET_INK : VALUE_INK }}
        onChange={(value) =>
          patch({ stroke: value as LabelShotPatch["stroke"] })
        }
      />
      <BlackSelectCell
        {...cell}
        label={`Shot ${number} spin`}
        value={shot.spin}
        text={spinLabel(shot.stroke, shot.spin)}
        options={spinOptions(shot.stroke)}
        className={cn("text-[11px]", words)}
        onChange={(value) => patch({ spin: value as LabelShotPatch["spin"] })}
      />
      <BlackPositionCell
        {...cell}
        end="hit"
        label={`Shot ${number} hit at`}
        x={shot.contactX}
        y={shot.contactY}
        muted={fault}
        onCommit={(p) => patch(positionPatch(shot, "contact", p))}
      />
      <BlackPositionCell
        {...cell}
        end="landed"
        label={`Shot ${number} landed at`}
        x={shot.landingX}
        y={shot.landingY}
        muted={fault}
        onCommit={(p) => patch(positionPatch(shot, "landing", p))}
      />
      {placement ? (
        // The one word here nobody can open an editor on, in a track that
        // narrows with the rail: whole in the tooltip when it is cut.
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              data-calculated="placement"
              className={cn("min-w-0 truncate text-[11px]", words)}
            >
              {placement}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">{placement}</TooltipContent>
        </Tooltip>
      ) : (
        <span
          data-calculated="placement"
          className={cn("min-w-0 truncate text-[11px]", words)}
        >
          <Dash label="No placement" />
        </span>
      )}
      <span
        data-calculated="result"
        className={cn(
          "inline-flex min-w-0 items-center gap-1.5 text-[11px] whitespace-nowrap",
          words,
        )}
      >
        {shot.result ? RESULT_LABEL[shot.result] : <Dash label="No result" />}
        {marks.map(({ code, ...chip }) => (
          <MarkChip key={code} {...chip} />
        ))}
        {changed ? <PencilMark /> : null}
      </span>
      {operations ? (
        <span
          data-shot-actions=""
          className={cn(
            "absolute inset-y-0 right-0 flex items-center gap-0.5 bg-[var(--surface-dark)] [mask-image:linear-gradient(to_right,transparent,black_16px)] pr-[10px] pl-5 transition-opacity duration-200 group-focus-within/row:opacity-100 group-hover/row:opacity-100",
            // Hidden, it is not in the pointer's way either: a click on the
            // result under it selects the row. A selected row waits for the
            // pointer or the keyboard too, so its result stays readable.
            "pointer-events-none opacity-0 group-focus-within/row:pointer-events-auto group-hover/row:pointer-events-auto",
          )}
          style={{ backgroundImage: actionsGround(lit) }}
        >
          {canResetShot(shot) ? (
            <RowAction
              attr="data-reset-row"
              label={`Reset shot ${number}`}
              tooltip="Reset shot"
              onClick={() =>
                operations.onAskResetShot(shot.id, number, pointNumber)
              }
            >
              <RotateCcw
                className="size-3"
                strokeWidth={1.6}
                aria-hidden="true"
              />
            </RowAction>
          ) : null}
          <RowAction
            attr="data-delete-row"
            label={`Delete shot ${number}`}
            tooltip="Delete shot"
            onClick={() =>
              operations.onAskDeleteShot(shot.id, number, pointNumber)
            }
          >
            <X className="size-3" strokeWidth={1.6} aria-hidden="true" />
          </RowAction>
        </span>
      ) : null}
    </div>
  );
}

/**
 * A deleted stroke, in the well: ONE quiet line on the row's own first track
 * and padding — a dash where the number was, "Deleted shot", its time and
 * why it went — with Undo always at the right edge, on a track of its own so
 * the words truncate before it moves.
 *
 * The light table's tombstone (`DeletedShot`) folds open to a ghost of the
 * row on the light table's eleven tracks; in a rail a third that width the
 * ghost ran 1,195px and took Undo off-screen with it, in light-theme ink.
 * There is nothing to fold open here, so `openTombstoneIds` is not read. Undo
 * is the same request (`onRestoreShot`), and is absent on a session that
 * cannot be written.
 */
export function BlackDeletedShot({
  shot,
  edit,
}: {
  shot: LabelShot;
  edit: EditContext;
}) {
  const { operations } = edit;
  const time = shot.videoTime !== null ? formatVideoTime(shot.videoTime) : null;
  const reason = isLabelDeleteReason(shot.deleteReason)
    ? DELETE_REASON_LABEL[shot.deleteReason]
    : null;
  const facts = [time, reason].filter(Boolean).join(" · ");
  return (
    <div
      data-row="deleted-shot"
      data-tombstone-id={shot.id}
      data-well-tombstone=""
      className="grid h-[30px] grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-2 px-[14px]"
    >
      <span
        aria-hidden="true"
        className="mono text-[10px]"
        style={{ color: EMPTY_INK }}
      >
        –
      </span>
      <span className="min-w-0 truncate text-[11px] text-white/45">
        Deleted shot
        {facts ? <span className="text-white/35"> · {facts}</span> : null}
      </span>
      {operations ? (
        <BlackUndoButton
          label={time ? `Undo delete shot at ${time}` : "Undo delete shot"}
          onClick={() => operations.onRestoreShot(shot.id)}
        />
      ) : null}
    </div>
  );
}

/**
 * The ghost row's tracks: the stroke row's first seven — number · time ·
 * player · stroke · spin · hit at · landed at — then ONE track for the reason
 * and Restore where the row's placement and result would be (the frame's
 * `.fx-gt`, `grid-column: 8 / -1`): nobody derives a placement for a stroke
 * that is out of the rally. Its minimums are the stroke row's, so the two
 * rows' columns line up and the ghost fits the rail at 520px like every
 * other row; the reason's words truncate before Restore moves.
 */
const GHOST_ROW_GRID =
  "grid grid-cols-[22px_minmax(44px,48px)_minmax(36px,54px)_minmax(52px,80px)_minmax(30px,52px)_88px_88px_minmax(0,1fr)] items-center gap-x-2 h-[34px] px-[14px]";

/**
 * A ghost (board 08m §3, the frame's `.fx-gl` and `.fx-gone`): a stroke the
 * site removed before the transcript was built — someone hit a serve that
 * had already faulted — that the labeller has neither restored nor deleted.
 *
 * At rest it is ONE quiet line where the stroke was, on the line a tombstone
 * takes: the fix's wand, "1 shot removed: {hitter} hit the fault back", and
 * Show. It takes no shot number and the rally count skips it. Shown
 * (`openGhostIds`, the console's state like `openTombstoneIds`), the removed
 * stroke comes back under the line struck through — its values at a third of
 * white, the em dashes not struck — with its reason, "Hit after the fault",
 * and Restore, which is the one request here: the console writes
 * `site_removal_restored_at` and the stroke is an ordinary row again.
 * Restore is absent on a session that cannot be written.
 */
export function BlackGhostShot({
  shot,
  edit,
}: {
  shot: LabelShot;
  edit: EditContext;
}) {
  const { names, operations, onToggleGhost } = edit;
  const open = edit.openGhostIds?.has(shot.id) ?? false;
  const rowId = `label-ghost-${shot.id}`;
  const time = shot.videoTime !== null ? formatVideoTime(shot.videoTime) : null;
  const hitter = sideLabel(shot.hitter, names);
  const words = hitter
    ? `1 shot removed: ${hitter} hit the fault back`
    : "1 shot removed: the fault was hit back";
  return (
    <>
      <div
        data-row="ghost-shot"
        data-shot-ghost={shot.id}
        className="flex h-[26px] items-center gap-[7px] pr-[14px] pl-[44px] text-[11px]"
        style={{ color: QUIET_INK }}
      >
        <WandSparkles
          className="size-[11px] shrink-0"
          strokeWidth={1.8}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate">{words}</span>
        {onToggleGhost ? (
          <button
            type="button"
            data-ghost-toggle=""
            aria-expanded={open}
            aria-controls={open ? rowId : undefined}
            aria-label={`${open ? "Hide" : "Show"} the removed shot${time ? ` at ${time}` : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleGhost(shot.id);
            }}
            className="shrink-0 cursor-pointer rounded-[var(--radius-button)] px-1 text-[11px] font-medium whitespace-nowrap text-white/70 transition-colors duration-200 hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            {open ? "Hide" : "Show"}
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          id={rowId}
          data-row="ghost-shot-row"
          data-shot-ghost-row={shot.id}
          className={cn(GHOST_ROW_GRID, "bg-white/[0.03]")}
        >
          <span
            aria-hidden="true"
            className="mono text-[10px]"
            style={{ color: EMPTY_INK }}
          >
            –
          </span>
          <Struck label="Not set" className="mono tabular text-[10px]">
            {time}
          </Struck>
          <Struck label="Not set" className="text-[11px]">
            {hitter}
          </Struck>
          <Struck label="Not set" className="text-[11px] font-medium">
            {shot.stroke ? STROKE_LABEL[shot.stroke] : null}
          </Struck>
          <Struck label="Not set" className="text-[11px]">
            {spinLabel(shot.stroke, shot.spin)}
          </Struck>
          <GhostPosition end="hit" x={shot.contactX} y={shot.contactY} />
          <GhostPosition end="landed" x={shot.landingX} y={shot.landingY} />
          <span
            data-ghost-reason=""
            className="flex min-w-0 items-center justify-between gap-2.5 text-[11px] whitespace-nowrap"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            <span className="min-w-0 truncate">Hit after the fault</span>
            {operations ? (
              <button
                type="button"
                data-restore-site-removal=""
                aria-label={
                  time ? `Restore the shot at ${time}` : "Restore the shot"
                }
                onClick={(event) => {
                  event.stopPropagation();
                  operations.onRestoreSiteRemoval(shot.id);
                }}
                className="inline-flex shrink-0 cursor-pointer items-center gap-[5px] rounded-[var(--radius-button)] px-1 text-[11px] font-medium whitespace-nowrap text-white/70 transition-colors duration-200 hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              >
                <Undo2
                  className="size-[11px]"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                Restore
              </button>
            ) : null}
          </span>
        </div>
      ) : null}
    </>
  );
}

/**
 * A ghost row's value: struck through at the frame's `.fx-gone` ink, or —
 * when there is none — the plain em dash, which the frame leaves unstruck
 * (`.fx-gone .bk-em`). One element either way, so it is one grid cell.
 */
function Struck({
  children,
  className,
  label,
}: {
  children: string | null;
  className?: string;
  /** What is missing, for a screen reader, when `children` is null. */
  label: string;
}) {
  return (
    <span
      className={cn("min-w-0 truncate", className, children && "line-through")}
      style={children ? { color: GONE_INK } : undefined}
    >
      {children ?? <Dash label={label} />}
    </span>
  );
}

/**
 * A ghost row's position: the stroke row's ring or dot, then x and y struck
 * through in their own slots (`BlackPositionCell` without the field — a
 * ghost is not edited, it is restored or left). A position not set is the
 * one unstruck dash in the first slot.
 */
function GhostPosition({
  end,
  x,
  y,
}: {
  end: "hit" | "landed";
  x: number | null;
  y: number | null;
}) {
  const pair = courtPair(x, y);
  return (
    <span data-xy={end} className="flex min-w-0 items-center gap-1.5">
      {end === "hit" ? (
        <i
          role="img"
          aria-label="Hit at"
          className="size-[7px] flex-none rounded-full border border-white/50"
        />
      ) : (
        <i
          role="img"
          aria-label="Landed at"
          className="mx-px size-[5px] flex-none rounded-full bg-white/50"
        />
      )}
      {pair ? (
        <>
          <b
            className={cn(NUM, "font-normal line-through")}
            style={{ color: GONE_INK }}
          >
            {pair[0]}
          </b>
          <b
            className={cn(NUM, "font-normal line-through")}
            style={{ color: GONE_INK }}
          >
            {pair[1]}
          </b>
        </>
      ) : (
        <>
          <b className={cn(NUM, "font-normal")}>
            <Dash label="Not set" />
          </b>
          <b className={cn(NUM, "font-normal")} aria-hidden="true" />
        </>
      )}
    </span>
  );
}

/**
 * Undo, on black: the light table's blue words are the room's white ones —
 * 70% to full on hover, as every text action in the dark tone. It never
 * reaches the row under it.
 */
export function BlackUndoButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-undo-delete=""
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="shrink-0 cursor-pointer rounded-[var(--radius-button)] px-1 text-[11px] font-medium whitespace-nowrap text-white/70 transition-colors duration-200 hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
    >
      Undo
    </button>
  );
}

/**
 * One of the row's two requests: a 22px glyph button, quiet until reached.
 * It never selects the row it sits in.
 */
function RowAction({
  attr,
  label,
  tooltip,
  onClick,
  children,
}: {
  attr: "data-reset-row" | "data-delete-row";
  label: string;
  tooltip: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          {...{ [attr]: "" }}
          aria-label={label}
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          className="flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-white/[0.45] transition-colors duration-200 hover:bg-white/[0.08] hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/** The frame's `.bk-em`: one em dash, and what is missing in words. */
function Dash({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true" style={{ color: EMPTY_INK }}>
        —
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}

/** Player, Stroke or Spin: its word, and the menu select once reached for. */
function BlackSelectCell({
  editable,
  rowSelected,
  label,
  value,
  text,
  options,
  className,
  style,
  onChange,
}: {
  editable: boolean;
  rowSelected: boolean;
  label: string;
  value: string | null;
  text: string | null;
  options: readonly SelectOption[];
  /** The word's type and ink. */
  className: string;
  style?: React.CSSProperties;
  onChange: (value: string | null) => void;
}) {
  return (
    <EditableCell
      editable={editable}
      rowSelected={rowSelected}
      label={label}
      valueText={text ?? "Not set"}
      display={
        text ? (
          <span className={className} style={style}>
            {text}
          </span>
        ) : (
          <Dash label="Not set" />
        )
      }
      editor={
        <SelectEditor
          tone="dark"
          label={label}
          value={value}
          options={options}
          onChange={onChange}
        />
      }
    />
  );
}

/** The frame's `.bk-num`: one right-aligned number in a slot of its own. */
const NUM = "mono tabular w-8 flex-none text-right text-[10px]";

/**
 * A position — the frame's `.bk-xy`. The mark stands for the column's name:
 * a 7px ring is where the stroke was HIT, a 5px dot where it LANDED. After it
 * come x then y, each right-aligned in a 32px slot, so the decimal points of
 * every row line up whatever the sign or the digits. A position not set is
 * one em dash in the first slot, the second left empty.
 *
 * The mark stays put while the two numbers give way to the light table's
 * field — "x, y" in metres, typed; the court click is the other way in. The
 * dark field (`FIELD_DARK`, label-cells.tsx) is sized for the longest pair,
 * thirteen characters ("-10.10, 24.82"), in what this 88px track leaves.
 */
function BlackPositionCell({
  editable,
  rowSelected,
  end,
  label,
  x,
  y,
  muted,
  onCommit,
}: {
  editable: boolean;
  rowSelected: boolean;
  end: "hit" | "landed";
  label: string;
  x: number | null;
  y: number | null;
  /** A fault row: the numbers a step quieter. */
  muted: boolean;
  onCommit: (point: { x: number; y: number } | null) => void;
}) {
  const pair = courtPair(x, y);
  const text = formatCourtPoint(x, y);
  return (
    <span data-xy={end} className="flex min-w-0 items-center gap-1.5">
      {end === "hit" ? (
        <i
          role="img"
          aria-label="Hit at"
          className="size-[7px] flex-none rounded-full border border-white/50"
        />
      ) : (
        <i
          role="img"
          aria-label="Landed at"
          className="mx-px size-[5px] flex-none rounded-full bg-white/50"
        />
      )}
      <EditableCell
        editable={editable}
        rowSelected={rowSelected}
        label={label}
        valueText={text ?? "Not set"}
        className="flex-1"
        display={
          <span className="inline-flex items-center gap-1.5 align-middle">
            {pair ? (
              <>
                <b
                  className={cn(NUM, "font-normal")}
                  style={{ color: muted ? QUIET_INK : VALUE_INK }}
                >
                  {pair[0]}
                </b>
                <b
                  className={cn(NUM, "font-normal")}
                  style={{ color: muted ? QUIET_INK : VALUE_INK }}
                >
                  {pair[1]}
                </b>
              </>
            ) : (
              <>
                <b className={cn(NUM, "font-normal")}>
                  <Dash label="Not set" />
                </b>
                <b className={cn(NUM, "font-normal")} aria-hidden="true" />
              </>
            )}
          </span>
        }
        editor={
          <TextEditor
            tone="dark"
            label={`${label}, metres x, y`}
            text={text ?? ""}
            parse={parseCourtPoint}
            onCommit={(value) =>
              onCommit(value as { x: number; y: number } | null)
            }
          />
        }
      />
    </span>
  );
}
