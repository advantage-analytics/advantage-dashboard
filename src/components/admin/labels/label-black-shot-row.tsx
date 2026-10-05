"use client";

import { Plus, RotateCcw, Split, Undo2, WandSparkles, X } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
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
import type { LabelMarks, LabelSuggestion } from "@/lib/services/labels/marks";
import {
  isLabelDeleteReason,
  planAddedShot,
} from "@/lib/services/labels/operations";
import { canSplitAtShot } from "@/lib/services/labels/point-split";
import { canResetShot } from "@/lib/services/labels/reset";
import { shotPlacement } from "@/lib/services/labels/shot-derived";
import { suggestionState } from "@/lib/services/labels/suggestions";
import { courtPair, withoutGhosts } from "./label-black-format";
import {
  AMBER_SUGGESTION_INK,
  BlackTextAction,
  BlackUndoButton,
} from "./label-black-parts";
import {
  MarkChip,
  PencilMark,
  collapseShotMarks,
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
 * The well's one set of tracks: number · time · player · stroke · spin ·
 * hit at · landed at · placement · result. Every row kind in the well — a
 * stroke, a shown ghost, a suggested stroke, "Add shot" — is laid on
 * `SHOT_TRACKS`, so their columns line up by construction: a ghost's
 * reason and a suggestion's sentence span tracks (`col-[8/-1]`,
 * `col-[4/7]`) rather than carrying tracks of their own.
 *
 * The frame draws the row for a 640px rail — 22 · 48 · 54 · 80 · 52 · 88 ·
 * 88 · 88 and what is left — but the rail resizes from 520 to 880
 * (`RAIL_MIN_PX` … `RAIL_MAX_PX`), and a row of `minmax(min, Npx)` tracks
 * hit every maximum at 640 and handed everything past that to the last
 * track: at 880 the words sat packed on the left and the result alone in a
 * void. So the WORD tracks are fractions with floors. The fractions are the
 * frame's widths in proportion (time's a little under, since a tabular
 * time is not a word and wants no room past its digits), so at 640 each
 * track is the frame's within a couple of px, and past 640 the slack is
 * shared out in those proportions — the row reads edge to edge at every
 * width, its gaps even rather than one big one. The two positions stay
 * fixed at 88: tabular numbers whose decimal points line up down the
 * column, however wide the rail. The number is 22.
 *
 * Each floor is what the track's shortest useful reading needs, and the
 * floors with the gaps and the padding come to exactly 520 (`SHOT_FLOORS_PX`
 * + `SHOT_GAPS_PX` + `SHOT_PADDING_PX`): at the rail's narrowest nothing
 * passes its edge, and a word that no longer fits truncates (a select's
 * whole word is in its menu, the placement's in a tooltip).
 *
 * The result's floor is its tail's room: one 18px mark disc, a 4px gap and
 * the 11px pencil (`SHOT_TAIL_PX`, set once on the well as `--shot-tail`)
 * plus the cell's own 3px gap and 2px of air — so the tail never grows the
 * grid; the result word truncates first. The same variable places the
 * row's actions overlay (`data-shot-actions`), which takes NO track and
 * stops short of the tail (padding + `--shot-tail` + 4px), so a chip and
 * the pencil stay under the pointer while the row is hovered. The ghost
 * row's tail — the placement and result tracks spanned, with the gap
 * between them — is at its narrowest `30 + 8 + 38 = 76`, which holds
 * Restore whole.
 */
/** The widest the result cell's tail gets: 18px disc + 4px gap + 11px pencil. */
export const SHOT_TAIL_PX = 33;
/** What the result track adds around the tail: the cell's 3px gap and 2px. */
export const SHOT_TAIL_AIR_PX = 5;

/** Each track's floor, left to right; the positions and the number are fixed. */
export const SHOT_FLOORS_PX = [
  22,
  44,
  36,
  52,
  30,
  88,
  88,
  30,
  SHOT_TAIL_PX + SHOT_TAIL_AIR_PX,
] as const;
/** The 8 gaps between 9 tracks, at `gap-x-2`. */
export const SHOT_GAPS_PX = 8 * 8;
/** `px-[14px]`, both sides. */
export const SHOT_PADDING_PX = 2 * 14;

/**
 * The tracks themselves. The result's floor reads `--shot-tail` so the two
 * numbers cannot drift apart; its fallback is `SHOT_TAIL_PX` for a row
 * drawn outside the well.
 */
export const SHOT_TRACKS = `grid-cols-[22px_minmax(44px,0.3fr)_minmax(36px,0.55fr)_minmax(52px,0.8fr)_minmax(30px,0.5fr)_88px_88px_minmax(30px,0.8fr)_minmax(calc(var(--shot-tail,${SHOT_TAIL_PX}px)_+_${SHOT_TAIL_AIR_PX}px),0.35fr)]`;

/** A stroke row: the tracks, the gap, the height and the padding. */
const ROW_GRID = `relative grid ${SHOT_TRACKS} items-center gap-x-2 h-[34px] px-[14px]`;

/** The actions overlay's right edge: the padding, the tail and 4px of air. */
const ACTIONS_RIGHT = "right-[calc(14px_+_var(--shot-tail,33px)_+_4px)]";

/** The CSS variables the well sets once for every row in it. */
export const WELL_STYLE = {
  "--shot-tail": `${SHOT_TAIL_PX}px`,
} as React.CSSProperties;

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
 * §3): only while the session has marks. The loader builds them only for a
 * session that computes marks, so `marks` being there says both; otherwise
 * — the ground-truth session, or a build that failed — a ghost is an
 * ordinary numbered row, exactly as in the three light layouts.
 */
export function drawsGhosts(marks: LabelMarks | null | undefined): boolean {
  return marks !== null && marks !== undefined;
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
 *
 * A stroke the marks think is missing (`openShotSuggestions`) is a dashed row
 * right after the stroke it would follow. It is a proposal, not a stroke: no
 * number, not in the rally count, and nothing is added until "Add shot" is
 * clicked.
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
  const ghosts = drawsGhosts(marks);
  // The point as the rail reads it: without its ghosts while they are ghosts.
  const shown = ghosts ? withoutGhosts(point) : point;
  const suggested = openShotSuggestions(point, marks);
  const rows: React.ReactNode[] = [];
  let n = 0;
  for (const shot of point.shots) {
    if (shot.status === "deleted") {
      rows.push(<BlackDeletedShot key={shot.id} shot={shot} edit={edit} />);
      continue;
    }
    if (ghosts && isGhostShot(shot)) {
      rows.push(<BlackGhostShot key={shot.id} shot={shot} edit={edit} />);
    } else {
      n += 1;
      rows.push(
        <BlackShotRow
          key={shot.id}
          shot={shot}
          number={n}
          point={point}
          pointNumber={pointNumber}
          edit={edit}
          marks={shotRowMarks(shown, shot, marks, edit.names)}
        />,
      );
    }
    for (const suggestion of suggested) {
      if (suggestion.afterShotId !== shot.id) continue;
      rows.push(
        <BlackSuggestedShot
          key={suggestion.key}
          suggestion={suggestion}
          point={point}
          edit={edit}
        />,
      );
    }
  }
  return (
    <div
      data-shots-well={point.id}
      className="flex flex-col bg-white/[0.035] py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(255,255,255,0.06)]"
      style={WELL_STYLE}
    >
      {rows}
      {edit.editable && operations ? (
        <button
          type="button"
          data-add-shot=""
          onClick={() => operations.onAddShot(point.id, null)}
          // The row's own tracks, so the plus sits under the numbers and
          // the words under the times, at any rail width.
          className={cn(
            ROW_GRID,
            "w-full cursor-pointer text-left text-[11px] font-medium text-white/70 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
          )}
        >
          <Plus
            className="size-2.5"
            style={{ color: QUIET_INK }}
            strokeWidth={2}
            aria-hidden="true"
          />
          <span className="col-[2/-1] min-w-0 truncate">Add shot</span>
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
 * `EditableCell`s with hover turned off: text until the row is SELECTED
 * (then every one is a field) or the cell itself is clicked or reached from
 * the keyboard. A hovered cell shows only its cursor and its word a step
 * brighter — no box: a field under a crossing pointer read as a field
 * already chosen. A typed position sends the result it derives in the same
 * patch (`positionPatch`), exactly as a court click does.
 *
 * The row's requests — Split point here (any shot but the point's first
 * live one), Reset (an edited stroke with a seed) and Delete — are an
 * overlay on the row's right edge, out of the grid, there only on hover, on
 * focus and on the selected row, so the row at rest is the frame's and no
 * column moves when they appear. Reset and Delete only ASK, as the light
 * row's do: the console opens the confirm. Split runs at once — it moves
 * rows and deletes nothing, and "Split point here" on the first moved shot
 * is the way back from a combine.
 *
 * LIT — selected, or the stroke the film is on — is the frame's `.bk-lit`
 * wash. A FAULT, a serve that did not go in, is a step quieter throughout:
 * part of the point, not of the rally.
 */
export function BlackShotRow({
  shot,
  number,
  point,
  pointNumber,
  edit,
  marks = NO_MARKS,
}: {
  shot: LabelShot;
  number: number;
  /**
   * The point the stroke is in, for "Split point here" (`canSplitAtShot`
   * reads its shots in video order). Absent, no split is offered.
   */
  point?: Pick<LabelPoint, "id" | "status" | "shots">;
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
  const cell = { editable, rowSelected: selected, hoverReveals: false };
  const time = shot.videoTime !== null ? formatVideoTime(shot.videoTime) : null;
  const placement = shotPlacement(labelShotValues(shot));
  /** The words' ink — `.bk-pl`, `.bk-sp`, `.bk-cv` — a step down on a fault. */
  const words = fault ? "text-white/35" : "text-white/50";
  // ONE disc for the row's marks, however many (`collapseShotMarks`).
  const mark = collapseShotMarks(marks);

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
        textClassName={TEXT_AFFORDANCE}
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
        <ChromeTooltip label={placement} side="top" wrap>
          <span
            data-calculated="placement"
            className={cn("min-w-0 truncate text-[11px]", words)}
          >
            {placement}
          </span>
        </ChromeTooltip>
      ) : (
        <span
          data-calculated="placement"
          className={cn("min-w-0 truncate text-[11px]", words)}
        >
          <Dash label="No placement" />
        </span>
      )}
      {/* The word, then a fixed right-aligned slot for the row's marks and
          pencil. The word's column can go to nothing and the cell clips, so
          the slot never grows the grid and never passes the rail's edge: the
          word truncates before a mark is touched. The 3px between them is
          what the cell's 36px minimum leaves beside the slot's 33
          (`SHOT_TAIL_PX`) — at 4 the pencil's last pixel was clipped. */}
      <span
        data-calculated="result"
        className={cn(
          "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-[3px] overflow-hidden text-[11px] whitespace-nowrap",
          words,
        )}
      >
        <span className="min-w-0 truncate">
          {shot.result ? RESULT_LABEL[shot.result] : <Dash label="No result" />}
        </span>
        {mark || changed ? (
          <span
            data-shot-marks=""
            className="inline-flex shrink-0 items-center gap-1 justify-self-end"
          >
            {mark ? <MarkChip {...mark} /> : null}
            {/* The pencil is the row's Reset too, when there is one to
                offer — the same ask as the overlay's button, in the slot
                the overlay stops short of. */}
            {changed ? (
              <PencilMark
                reset={
                  operations && canResetShot(shot)
                    ? {
                        label: `Reset shot ${number}`,
                        onClick: () =>
                          operations.onAskResetShot(
                            shot.id,
                            number,
                            pointNumber,
                          ),
                      }
                    : undefined
                }
              />
            ) : null}
          </span>
        ) : null}
      </span>
      {operations ? (
        <span
          data-shot-actions=""
          className={cn(
            "absolute inset-y-0 flex items-center gap-0.5 bg-[var(--surface-dark)] [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-8px),transparent)] pr-2 pl-5 transition-opacity duration-200 group-focus-within/row:opacity-100 group-hover/row:opacity-100",
            ACTIONS_RIGHT,
            // Hidden, it is not in the pointer's way either: a click on the
            // result under it selects the row. A selected row waits for the
            // pointer or the keyboard too, so its result stays readable.
            "pointer-events-none opacity-0 group-focus-within/row:pointer-events-auto group-hover/row:pointer-events-auto",
          )}
          style={{ backgroundImage: actionsGround(lit) }}
        >
          {point && canSplitAtShot(point, shot.id) ? (
            <RowAction
              attr="data-split-row"
              label={`Split point at shot ${number}`}
              tooltip="Split point here"
              detail={`Shot ${number} and those after it become a new point`}
              onClick={() => operations.onSplitPoint(point.id, shot.id)}
            >
              <Split className="size-3" strokeWidth={1.6} aria-hidden="true" />
            </RowAction>
          ) : null}
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
 * A ghost row's reason and Restore sit where the stroke row's placement and
 * result would be, spanning both tracks (the frame's `.fx-gt`,
 * `grid-column: 8 / -1`): nobody derives a placement for a stroke that is
 * out of the rally. The span is at its narrowest the two floors and the gap
 * between them — `30 + 8 + 38 = 76` (`GHOST_TAIL_MIN_PX`), which holds
 * Restore whole (the icon, "Restore", its padding and the gap before it) —
 * so the reason's words are what give, truncating to nothing before
 * Restore moves or is cut. The ghost row is `ROW_GRID` itself, so its
 * columns are the stroke row's by construction.
 */
const GHOST_TAIL = "col-[8/-1]";

/** The ghost tail at its narrowest: Restore whole, plus the gap. */
export const GHOST_TAIL_MIN_PX = SHOT_FLOORS_PX[7] + 8 + SHOT_FLOORS_PX[8];

/**
 * The quiet affordance on an editable cell's text while it is text: the
 * cursor says what a click does, and class-coloured words step up to white.
 * No border and no ground — those are the field's, drawn once the cell is
 * opened or its row selected.
 */
const TEXT_AFFORDANCE =
  "cursor-pointer transition-colors duration-200 hover:text-white";

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
          <BlackTextAction
            ink="plain"
            data-ghost-toggle=""
            aria-expanded={open}
            aria-controls={open ? rowId : undefined}
            aria-label={`${open ? "Hide" : "Show"} the removed shot${time ? ` at ${time}` : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleGhost(shot.id);
            }}
          >
            {open ? "Hide" : "Show"}
          </BlackTextAction>
        ) : null}
      </div>
      {open ? (
        <div
          id={rowId}
          data-row="ghost-shot-row"
          data-shot-ghost-row={shot.id}
          className={cn(ROW_GRID, "bg-white/[0.03]")}
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
            className={cn(
              GHOST_TAIL,
              "flex min-w-0 items-center justify-between gap-2.5 text-[11px] whitespace-nowrap",
            )}
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

type ShotSuggestion = Extract<LabelSuggestion, { kind: "missing_shot" }>;

/**
 * The point's stroke suggestions still waiting for an answer (board 08m §4):
 * the session computes marks and has them, the suggestion is this point's,
 * and it is neither dismissed nor already answered with an added stroke
 * (`suggestionState`). With marks off, or none built, there is none.
 */
export function openShotSuggestions(
  point: LabelPoint,
  marks: LabelMarks | null | undefined,
): ShotSuggestion[] {
  if (!marks) return [];
  return marks.suggestions.filter(
    (s): s is ShotSuggestion =>
      s.kind === "missing_shot" &&
      s.pointId === point.id &&
      suggestionState(s, point) === "open",
  );
}

/**
 * A suggested stroke (board 08m §4, the frame's `.fx-sug`): two strokes in a
 * row by one player, so the other's is probably missing between them. A
 * dashed amber row where it would go, on the stroke row's own first tracks —
 * a plus where the number would be, the time and the player it would be
 * added with — then the sentence and its two answers.
 *
 * The time and the player are what "Add shot" WILL write (`planAddedShot`,
 * the console's own rule: the midpoint of its two live neighbours, the
 * opponent of the stroke before it), falling back to the marks' reading; when
 * that rule refuses — the stroke it would follow is no longer live — there is
 * no row to draw. "Add shot" is the existing request (`onAddShot` after that
 * stroke); "Dismiss" stores the suggestion's key. Both are absent on a
 * session that cannot be written.
 *
 * It sits on the stroke row's tracks (`ROW_GRID`), so its first three
 * columns line up with the strokes around it: the sentence spans the
 * stroke, spin and hit-at tracks, the answers the last three — 172px at a
 * 520px rail, which holds both whole — and the sentence is what truncates.
 */
function BlackSuggestedShot({
  suggestion,
  point,
  edit,
}: {
  suggestion: ShotSuggestion;
  point: LabelPoint;
  edit: EditContext;
}) {
  const plan = planAddedShot(point, suggestion.afterShotId);
  if ("error" in plan) return null;
  const operations = edit.editable ? edit.operations : undefined;
  const seconds = plan.write.video_time ?? suggestion.videoTime;
  const time = seconds !== null ? formatVideoTime(seconds) : null;
  const name = sideLabel(plan.write.hitter ?? suggestion.hitter, edit.names);
  const words = name
    ? `A shot by ${name} is probably missing here`
    : "A shot is probably missing here";
  const where = time ? ` at ${time}` : "";
  return (
    <div
      data-row="suggested-shot"
      data-shot-suggestion={suggestion.key}
      className={cn(
        ROW_GRID,
        "cursor-default rounded-lg bg-[rgba(253,230,138,0.06)] outline-1 -outline-offset-4 outline-[rgba(252,211,77,0.45)] outline-dashed",
      )}
    >
      <Plus
        className="size-2.5"
        style={{ color: AMBER_SUGGESTION_INK }}
        strokeWidth={2}
        aria-hidden="true"
      />
      <span
        className="mono tabular min-w-0 truncate text-[10px]"
        style={{ color: AMBER_SUGGESTION_INK }}
      >
        {time ?? <Dash label="No time" />}
      </span>
      <span
        className="min-w-0 truncate text-[11px]"
        style={{ color: AMBER_SUGGESTION_INK }}
      >
        {name ?? <Dash label="No player" />}
      </span>
      <ChromeTooltip label={words} side="top" wrap>
        <span
          data-suggestion-text=""
          className="col-[4/7] min-w-0 truncate text-[11px]"
          style={{ color: VALUE_INK }}
        >
          {words}
        </span>
      </ChromeTooltip>
      {operations ? (
        <span
          data-suggestion-actions=""
          className="col-[7/-1] flex min-w-0 items-center justify-end gap-[14px]"
        >
          <BlackTextAction
            ink="amber"
            data-suggestion-add=""
            aria-label={
              name
                ? `Add the missing shot by ${name}${where}`
                : `Add the missing shot${where}`
            }
            onClick={(event) => {
              event.stopPropagation();
              operations.onAddShot(point.id, suggestion.afterShotId);
            }}
          >
            Add shot
          </BlackTextAction>
          <BlackTextAction
            ink="quiet"
            data-suggestion-dismiss=""
            aria-label={`Dismiss the suggested shot${where}`}
            onClick={(event) => {
              event.stopPropagation();
              operations.onDismissSuggestion(point.id, suggestion.key);
            }}
          >
            Dismiss
          </BlackTextAction>
        </span>
      ) : null}
    </div>
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
 * One of the row's requests: a 22px glyph button, quiet until reached. It
 * never selects the row it sits in.
 */
function RowAction({
  attr,
  label,
  tooltip,
  detail,
  onClick,
  children,
}: {
  attr: "data-split-row" | "data-reset-row" | "data-delete-row";
  label: string;
  tooltip: string;
  /** A line under the tooltip's name, saying what the request does. */
  detail?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <ChromeTooltip label={tooltip} detail={detail} side="top">
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
    </ChromeTooltip>
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
  hoverReveals,
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
  hoverReveals: boolean;
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
      hoverReveals={hoverReveals}
      label={label}
      valueText={text ?? "Not set"}
      textClassName={TEXT_AFFORDANCE}
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
  hoverReveals,
  end,
  label,
  x,
  y,
  muted,
  onCommit,
}: {
  editable: boolean;
  rowSelected: boolean;
  hoverReveals: boolean;
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
        hoverReveals={hoverReveals}
        label={label}
        valueText={text ?? "Not set"}
        className="flex-1"
        textClassName="cursor-text"
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
