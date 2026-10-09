"use client";

import { useState } from "react";
import { Plus, RotateCcw, Split, Undo2, WandSparkles, X } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { shotRowRevealDelay } from "@/components/dashboard/matches/match-detail/film/film-shots";
import { cn } from "@/lib/utils";
import {
  isGhostShot,
  isServeStroke,
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
import {
  deriveShotResult,
  shotPlacement,
} from "@/lib/services/labels/shot-derived";
import type { LabelShotResult } from "@/lib/services/labels/seed";
import { suggestionState } from "@/lib/services/labels/suggestions";
import { courtPair } from "./label-black-format";
import {
  AMBER_SUGGESTION_INK,
  RAIL_PRESS,
  BlackTextAction,
  BlackUndoButton,
} from "./label-black-parts";
import { positionPatch } from "@/lib/services/labels/shot-derived";
import { PencilMark, PointHintLine, pointHints } from "./label-black-mark";
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
  STROKE_OPTIONS,
  formatCourtPoint,
  formatVideoTime,
  isFault,
  parseCourtPoint,
  parseVideoTime,
  sideOptions,
  spinLabel,
  spinOptions,
} from "./label-format";
import { railInk, type RailTone } from "./label-rail-tone";
import { sideLabel, type EditContext } from "./label-row-parts";

/**
 * The rail's strokes: the open point's shots in a recessed well, each edited in
 * place with a single-field write. No header row: a hollow ring is "hit at", a
 * filled dot "landed at". An ink set by style is `railInk(alpha)`
 * (label-rail-tone.ts), never a literal white.
 */

/**
 * The well's one set of tracks: number · time · player · stroke · spin · hit at
 * · landed at · placement · result. Every row kind (stroke, ghost, suggestion,
 * Add shot) is laid on `SHOT_TRACKS`, so columns line up by construction and
 * ghost or suggestion text spans tracks.
 *
 * The word tracks are fractions with floors, not `minmax(min, Npx)`: the rail
 * resizes 520–880 and fixed maxima left all the slack in the last track. Floors
 * + gaps + padding come to exactly 520 (`SHOT_FLOORS_PX` + `SHOT_GAPS_PX` +
 * `SHOT_PADDING_PX`), so nothing passes the edge at the narrowest; the two
 * positions stay 88px so decimal points align.
 *
 * The result's floor leaves room for the pencil tail (`SHOT_TAIL_PX`, set once
 * on the well as `--shot-tail`); the actions overlay stops short of it.
 */
/** The result cell's tail, of which the pencil takes 11px. */
export const SHOT_TAIL_PX = 33;
/** What the result track adds around the tail: the cell's 3px gap and 2px. */
export const SHOT_TAIL_AIR_PX = 5;

/** Each track's floor, left to right; the positions and the number are fixed. */
// The time's floor holds a match past the hour whole: "1:02:03.4" is nine
// 6px mono figures.
export const SHOT_FLOORS_PX = [
  22,
  56,
  32,
  48,
  26,
  88,
  88,
  30,
  SHOT_TAIL_PX + SHOT_TAIL_AIR_PX,
] as const;
/** The 8 gaps between 9 tracks, at `gap-x-2`. */
export const SHOT_GAPS_PX = 8 * 8;
/** `px-[14px]`, both sides. */
export const SHOT_PADDING_PX = 2 * 14;

// A literal: Tailwind only emits a class it can read whole in the source, so
// the two numbers (`SHOT_TAIL_PX`, `SHOT_TAIL_AIR_PX`) are written out here.
export const SHOT_TRACKS =
  "grid-cols-[22px_minmax(56px,0.3fr)_minmax(32px,0.55fr)_minmax(48px,0.8fr)_minmax(26px,0.5fr)_88px_88px_minmax(30px,0.8fr)_minmax(calc(var(--shot-tail,33px)_+_5px),0.35fr)]";

// `text-[11px] leading-[14px]`: every cell's own line box is the size of its
// text, so a value centres on the row instead of hanging from a 16px strut.
const ROW_GRID = `relative grid ${SHOT_TRACKS} items-center gap-x-2 h-[34px] px-[14px] text-[11px] leading-[14px]`;

/** The actions overlay's right edge: the padding, the tail and 4px of air. */
const ACTIONS_RIGHT = "right-[calc(14px_+_var(--shot-tail,33px)_+_4px)]";

const WELL_STYLE = {
  "--shot-tail": `${SHOT_TAIL_PX}px`,
} as React.CSSProperties;

// ── The rally arriving ───────────────────────────────────────────────────

/**
 * Same classes as the Video tab's `ShotWell` (film/point-list.tsx):
 * `film-shot-well-open` unfolds the well, rows arrive on `film-shot-row-in` via
 * `shotRowRevealDelay`. `order` is the row's 1-based place in the well (stagger
 * only); undefined means no arrival. Rows are keyed by stroke id, so edits and
 * clock ticks replay nothing.
 */
function rowArrival(order: number | undefined): {
  className: string | undefined;
  style: React.CSSProperties | undefined;
} {
  if (order === undefined) return { className: undefined, style: undefined };
  return {
    className: "film-shot-row-in",
    style: { animationDelay: `${shotRowRevealDelay(order)}ms` },
  };
}

/**
 * The rally has arrived: mark the well on the element (no state). From here a
 * row that mounts in it is an edit, and globals.css (`[data-well-settled]`)
 * takes the stagger and the rise off it; only a tombstone still rises in.
 */
function settleWell(well: HTMLElement) {
  well.dataset.wellSettled = "";
}

/** Settled when the LAST row's arrival ends — or, reduced, the well's fade. */
function settleWellOnArrival(event: React.AnimationEvent<HTMLDivElement>) {
  const well = event.currentTarget;
  if (event.animationName === "film-shot-well-fade") {
    if (event.target === well) settleWell(well);
    return;
  }
  if (event.animationName !== "film-shot-row-in") return;
  if (event.target === well.firstElementChild?.lastElementChild) {
    settleWell(well);
  }
}

/** Reaching into the well ends the arrival: nothing holds a row from a click. */
function settleWellOnReach(event: React.SyntheticEvent<HTMLDivElement>) {
  settleWell(event.currentTarget);
}

/**
 * The ground under the row's two requests: the rail's own (`--rail-ground`)
 * with the washes the row is wearing painted back over it, so the result text
 * it covers does not show through the buttons. Its left 16px fade in (a mask).
 */
const WELL_WASH = railInk(0.035);
function actionsGround(lit: boolean): string {
  const wash = lit ? railInk(0.12) : railInk(0.06);
  return `linear-gradient(${wash},${wash}),linear-gradient(${WELL_WASH},${WELL_WASH})`;
}

const EMPTY_INK = railInk(0.25);
/** Times, and a faulted serve's stroke and numbers. */
const QUIET_INK = railInk(0.45);
/** The stroke word and the numbers. */
const VALUE_INK = railInk(0.72);
const REASON_INK = railInk(0.5);
const GONE_INK = railInk(0.32);

/** Whether a site-removed stroke is drawn as a ghost: only with marks. */
export function drawsGhosts(marks: LabelMarks | null | undefined): boolean {
  return marks !== null && marks !== undefined;
}

/**
 * The open point's strokes, inside the point row's `data-shots-for` wrapper.
 * Strokes are numbered 1…n among the live ones: a tombstone takes no number,
 * nor does a ghost while it is drawn as one (`drawsGhosts`). The hint line
 * (`PointHintLine`) is the first row; a suggested stroke
 * (`openShotSuggestions`) is a dashed row after the stroke it would follow,
 * with no number.
 */
export function BlackShotsWell({
  point,
  edit,
  marks = null,
  playingShotId = null,
  animate = true,
}: {
  point: LabelPoint;
  edit: EditContext;
  /** Animate the well's opening. Off for the point open on page load. */
  animate?: boolean;
  /** The session's marks; null draws no hint line, slot or ghost. */
  marks?: LabelMarks | null;
  /** The stroke the film is on, when it is one of this point's. */
  playingShotId?: string | null;
}) {
  const { operations } = edit;
  const pointNumber = point.pointIndex + 1;
  const ghosts = drawsGhosts(marks);
  const suggested = openShotSuggestions(point, marks);
  const rows: React.ReactNode[] = [];
  let n = 0;
  // The next row's place in the well, for the stagger; none when the well
  // does not animate.
  const arrive = () => (animate ? rows.length + 1 : undefined);
  // The point's hints, as the well's first row: it arrives with the rally.
  // Their answers write through the console only where it can write at all.
  const hints = pointHints(
    point,
    marks,
    edit.names,
    edit.editable ? edit : undefined,
  );
  if (hints.length > 0) {
    const arrival = rowArrival(arrive());
    rows.push(
      <PointHintLine
        key="hints"
        hints={hints}
        className={arrival.className}
        style={arrival.style}
      />,
    );
  }
  // The strokes that went as dead balls after the point, at the end of the
  // rally: from each of them, Undo puts back every one to the end at once.
  const runStart = deadBallRunStart(point.shots);
  for (const [i, shot] of point.shots.entries()) {
    if (shot.status === "deleted") {
      const run =
        i >= runStart && point.shots.length - i >= 2
          ? { pointId: point.id, ids: point.shots.slice(i).map((s) => s.id) }
          : undefined;
      rows.push(
        <BlackDeletedShot
          key={shot.id}
          shot={shot}
          edit={edit}
          run={run}
          arrive={arrive()}
        />,
      );
      continue;
    }
    if (ghosts && isGhostShot(shot)) {
      rows.push(
        <BlackGhostShot
          key={shot.id}
          shot={shot}
          edit={edit}
          arrive={arrive()}
        />,
      );
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
          playing={shot.id === playingShotId}
          arrive={arrive()}
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
          arrive={arrive()}
        />,
      );
    }
  }
  const addArrival = rowArrival(arrive());
  return (
    <div
      data-shots-well={point.id}
      data-well-animate={animate ? "" : undefined}
      className={animate ? "film-shot-well-open" : undefined}
      style={WELL_STYLE}
      onAnimationEnd={animate ? settleWellOnArrival : undefined}
      onPointerDownCapture={animate ? settleWellOnReach : undefined}
      onKeyDownCapture={animate ? settleWellOnReach : undefined}
    >
      <div className="flex min-h-0 flex-col overflow-hidden bg-white/[0.035] shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-white)_6%,transparent),inset_0_-1px_0_color-mix(in_oklab,var(--color-white)_6%,transparent)]">
        {rows}
        {edit.editable && operations ? (
          <button
            type="button"
            data-add-shot=""
            onClick={() => operations.onAddShot(point.id, null)}
            style={addArrival.style}
            // The row's own tracks, so the plus sits under the numbers and
            // the words under the times, at any rail width.
            className={cn(
              ROW_GRID,
              addArrival.className,
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
    </div>
  );
}

/**
 * One stroke: number · time · hitter · stroke · spin · hit at (ring) · landed
 * at (dot) · derived placement and result · blue pencil when changed or added.
 *
 * Time, Player, Stroke, Spin and both positions are `EditableCell`s. A typed
 * position sends its derived result in the same patch (`positionPatch`), as a
 * court click does. Requests (Split point here, Reset, Delete) overlay the
 * right edge on hover, focus and selection so no column moves. Reset and Delete
 * only ask the console to confirm; Split runs at once.
 *
 * LIT (selected, or the stroke the film is on) washes the row; a FAULT is a
 * step quieter.
 */
export function BlackShotRow({
  shot,
  number,
  point,
  pointNumber,
  edit,
  playing = false,
  arrive,
  resultMenuOpen = false,
}: {
  shot: LabelShot;
  number: number;
  arrive?: number;
  /**
   * The serve-result menu's state when the row first draws: false but for a
   * spec, which cannot reach a menu's open state any other way.
   */
  resultMenuOpen?: boolean;
  /**
   * The stroke's point, for "Split point here". Absent, no split is offered.
   */
  point?: Pick<LabelPoint, "id" | "status" | "shots">;
  /** The point's number, for the confirm the console opens. */
  pointNumber: number;
  edit: EditContext;
  playing?: boolean;
}) {
  const { names, editable, onSelectShot, onPatchShot } = edit;
  const tone = edit.tone ?? "dark";
  const operations = editable ? edit.operations : undefined;
  const selected = shot.id === edit.selectedShotId;
  const lit = selected || playing;
  const fault = isFault(shot);
  const changed = shot.status === "edited" || shot.status === "added";
  const select = () => {
    if (!selected) onSelectShot?.(shot.id);
  };
  const patch = (value: LabelShotPatch) => onPatchShot?.(shot.id, value);
  const cell = { editable, rowSelected: selected };
  const selectCell = { ...cell, menu: tone };
  const time = shot.videoTime !== null ? formatVideoTime(shot.videoTime) : null;
  const placement = shotPlacement(labelShotValues(shot));
  const serveResult = serveResultMenu(shot, edit.playOnLets);
  /** The words' ink, a step down on a fault. */
  const words = fault ? "text-white/35" : "text-white/50";
  const arrival = rowArrival(arrive);

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
      style={arrival.style}
      className={cn(
        ROW_GRID,
        arrival.className,
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
            label={`Shot ${number} time`}
            text={time ?? ""}
            parse={parseVideoTime}
            onCommit={(value) => patch({ video_time: value as number | null })}
          />
        }
      />
      <BlackSelectCell
        {...selectCell}
        label={`Shot ${number} player`}
        value={shot.hitter}
        text={sideLabel(shot.hitter, names)}
        options={sideOptions(names)}
        className={cn("text-[11px]", words)}
        onChange={(value) => patch({ hitter: value as LabelSide | null })}
      />
      <BlackSelectCell
        {...selectCell}
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
        {...selectCell}
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
        onCommit={(p) =>
          patch(positionPatch(labelShotValues(shot), "contact", p))
        }
      />
      <BlackPositionCell
        {...cell}
        end="landed"
        label={`Shot ${number} landed at`}
        x={shot.landingX}
        y={shot.landingY}
        muted={fault}
        onCommit={(p) =>
          patch(positionPatch(labelShotValues(shot), "landing", p))
        }
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
      {/* The word, then a fixed right-aligned slot for the pencil: the word
          truncates before the pencil is touched. The gap between them is
          3px; at 4 the pencil's last pixel was clipped. A serve, where lets
          are replayed, is a "Serve result" select in that first slot. */}
      <span
        data-calculated={serveResult ? undefined : "result"}
        data-serve-result={serveResult ? "" : undefined}
        className={cn(
          "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-[3px] overflow-hidden text-[11px] whitespace-nowrap",
          words,
        )}
      >
        {serveResult ? (
          <ServeResultCell
            {...selectCell}
            label={`Shot ${number} result`}
            value={shot.result}
            options={serveResult.options}
            initialOpen={resultMenuOpen}
            onChange={(value) => patch(serveResultPatch(value))}
          />
        ) : (
          <span className="min-w-0 truncate">
            {shot.result ? (
              RESULT_LABEL[shot.result]
            ) : (
              <Dash label="No result" />
            )}
          </span>
        )}
        {changed ? (
          <span
            data-shot-marks=""
            className="inline-flex shrink-0 items-center gap-1 justify-self-end"
          >
            {/* The pencil is the row's Reset too, when there is one to
                offer — the same ask as the overlay's button, in the slot
                the overlay stops short of. */}
            <PencilMark
              reset={
                operations && canResetShot(shot)
                  ? {
                      label: `Reset shot ${number}`,
                      onClick: () =>
                        operations.onAskResetShot(shot.id, number, pointNumber),
                    }
                  : undefined
              }
            />
          </span>
        ) : null}
      </span>
      {operations ? (
        <span
          data-shot-actions=""
          className={cn(
            "absolute inset-y-0 flex items-center gap-0.5 bg-[var(--rail-ground)] [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-8px),transparent)] pr-2 pl-5 transition-opacity duration-200 group-focus-within/row:opacity-100 group-hover/row:opacity-100",
            ACTIONS_RIGHT,
            // Hidden, it is not in the pointer's way either: a click on the
            // result under it selects the row. A selected row waits for the
            // pointer or the keyboard too, so its result stays readable.
            "pointer-events-none opacity-0 group-focus-within/row:pointer-events-auto group-hover/row:pointer-events-auto",
            // While the serve-result menu is open, Delete steps aside: the
            // menu opens over the row's right edge.
            "group-has-[[data-menu-open]]/row:hidden",
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
 * Where the rally's trailing run of `dead_ball_after_point` tombstones
 * starts: the index of its first row, or `shots.length` when the last row
 * is anything else. A tombstone with another reason, or a live row, ends it.
 */
export function deadBallRunStart(shots: readonly LabelShot[]): number {
  let start = shots.length;
  while (
    start > 0 &&
    shots[start - 1].status === "deleted" &&
    shots[start - 1].deleteReason === "dead_ball_after_point"
  ) {
    start -= 1;
  }
  return start;
}

/**
 * A deleted stroke: one quiet line (a dash, "Deleted shot", its time and why it
 * went) with Undo on a track of its own, so the words truncate first. In a
 * `run` — this row and every one after it went as dead balls after the point
 * (`deadBallRunStart`) — Undo reads "Undo N" and puts the whole run back in
 * one call (`onRestoreShots`), where the console can take one; a run of one
 * is the plain Undo.
 */
export function BlackDeletedShot({
  shot,
  edit,
  run,
  arrive,
}: {
  shot: LabelShot;
  edit: EditContext;
  /** The run from this row to the end of the rally, two or more rows. */
  run?: { pointId: string; ids: readonly string[] };
  /** Its place in the well; a tombstone also rises (`label-row-arrive`). */
  arrive?: number;
}) {
  const arrival = rowArrival(arrive);
  const { operations, onRestoreShots } = edit;
  const time = shot.videoTime !== null ? formatVideoTime(shot.videoTime) : null;
  const reason = isLabelDeleteReason(shot.deleteReason)
    ? DELETE_REASON_LABEL[shot.deleteReason]
    : null;
  const facts = [time, reason].filter(Boolean).join(" · ");
  const batch =
    run && run.ids.length >= 2 && onRestoreShots
      ? { ...run, restore: onRestoreShots }
      : null;
  return (
    <div
      data-row="deleted-shot"
      data-tombstone-id={shot.id}
      data-well-tombstone=""
      style={arrival.style}
      className={cn(
        "grid h-[30px] grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-2 px-[14px]",
        arrival.className,
        arrival.className && "label-row-arrive",
      )}
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
      {batch ? (
        <BlackUndoButton
          label={`Undo delete of the ${batch.ids.length} shots after the point`}
          count={batch.ids.length}
          onClick={() => batch.restore(batch.pointId, [...batch.ids])}
        />
      ) : operations ? (
        <BlackUndoButton
          label={time ? `Undo delete shot at ${time}` : "Undo delete shot"}
          onClick={() => operations.onRestoreShot(shot.id)}
        />
      ) : null}
    </div>
  );
}

/**
 * A ghost row's reason and Restore span the placement and result tracks. At its
 * narrowest the span (`GHOST_TAIL_MIN_PX`) holds Restore whole, so the reason's
 * words truncate first.
 */
const GHOST_TAIL = "col-[8/-1]";

/** The ghost tail at its narrowest: Restore whole, plus the gap. */
export const GHOST_TAIL_MIN_PX = SHOT_FLOORS_PX[7] + 8 + SHOT_FLOORS_PX[8];

/**
 * The affordance on an editable cell's text while it is text: a cursor, and
 * class-coloured words stepping up to white. No border and no ground: those are
 * the field's.
 */
const TEXT_AFFORDANCE =
  "cursor-pointer transition-colors duration-200 hover:text-white";

/**
 * A ghost: a stroke the site removed before the transcript was built, neither
 * restored nor deleted by the labeller. At rest it is one quiet line with Show;
 * it takes no shot number and the rally count skips it. Shown (`openGhostIds`),
 * the stroke comes back struck through with its reason and Restore, which
 * writes `site_removal_restored_at`.
 */
export function BlackGhostShot({
  shot,
  edit,
  arrive,
}: {
  shot: LabelShot;
  edit: EditContext;
  /** The line's place in the well (`rowArrival`); its shown row shares it. */
  arrive?: number;
}) {
  const arrival = rowArrival(arrive);
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
        className={cn(
          "flex h-[26px] items-center gap-[7px] pr-[14px] pl-[44px] text-[11px]",
          arrival.className,
        )}
        style={{ color: QUIET_INK, ...arrival.style }}
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
          style={arrival.style}
          className={cn(ROW_GRID, arrival.className, "bg-white/[0.03]")}
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
            style={{ color: REASON_INK }}
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
                className={cn(
                  "inline-flex shrink-0 cursor-pointer items-center gap-[5px] rounded-[var(--radius-button)] px-1 text-[11px] font-medium whitespace-nowrap text-white/70 hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                  RAIL_PRESS,
                )}
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

/** The point's stroke suggestions still open (`suggestionState`). */
function openShotSuggestions(
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
 * A suggested stroke: two strokes in a row by one player, so the other's is
 * probably missing between them. A dashed amber row on the stroke row's tracks
 * (`ROW_GRID`); the sentence is what truncates. Its time and player are what
 * "Add shot" will write (`planAddedShot`); when that rule refuses there is no
 * row.
 */
function BlackSuggestedShot({
  suggestion,
  point,
  edit,
  arrive,
}: {
  suggestion: ShotSuggestion;
  point: LabelPoint;
  edit: EditContext;
  arrive?: number;
}) {
  const arrival = rowArrival(arrive);
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
      style={arrival.style}
      className={cn(
        ROW_GRID,
        arrival.className,
        "cursor-default rounded-lg bg-[var(--rail-amber-wash-faint)] outline-1 -outline-offset-4 outline-[color:var(--rail-amber-line)] outline-dashed",
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

/** A ghost row's value: struck through, or an unstruck em dash for none. */
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

/** A ghost row's position: the ring or dot, then x and y struck through. */
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

/** One of the row's requests. It never selects the row it sits in. */
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
        className="flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-white/[0.45] transition-[color,background-color,scale] duration-200 hover:bg-white/[0.08] hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.96] active:duration-100 motion-reduce:active:scale-100"
      >
        {children}
      </button>
    </ChromeTooltip>
  );
}

/** One em dash, and what is missing in words. */
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

/** The calculated item's second line in the serve-result menu. */
export const SERVE_RESULT_LANDED = "From where it landed";
/** The Let item's second line. */
export const SERVE_RESULT_LET =
  "Replayed. Not a fault, so the next serve is still a first serve.";

/**
 * A serve row's result menu, or null where the result is the landing's alone:
 * any stroke but a serve, and every row when lets are played on (or the
 * console has not said). Two items under "Serve result": the result
 * `deriveShotResult` reads off the coordinates, then — past a hairline —
 * Let. With no landing to read there is no calculated item, only Let: the
 * menu never offers a result the coordinates do not say.
 */
export function serveResultMenu(
  shot: LabelShot,
  playOnLets: boolean | undefined,
): { derived: LabelShotResult | null; options: SelectOption[] } | null {
  if (playOnLets !== false || !isServeStroke(shot.stroke)) return null;
  const derived = deriveShotResult(labelShotValues(shot));
  const options: SelectOption[] = [];
  if (derived && derived !== "let") {
    options.push({
      value: derived,
      label: RESULT_LABEL[derived],
      description: SERVE_RESULT_LANDED,
      group: "Serve result",
    });
  }
  options.push({
    value: "let",
    label: RESULT_LABEL.let,
    description: SERVE_RESULT_LET,
    group: "Serve result",
    divider: true,
  });
  return { derived, options };
}

/** What picking a serve-result item writes. */
export function serveResultPatch(value: string | null): LabelShotPatch {
  return { result: value as LabelShotResult | null };
}

/** A let's word, in the rail's amber; any other result in the row's ink. */
const LET_INK = "text-[var(--rail-amber)]";

/**
 * A serve's result: its word, and the "Serve result" select once reached for.
 * It keeps the menu's open state so the cell can say so
 * (`data-menu-open`), which steps the row's actions aside.
 */
function ServeResultCell({
  editable,
  rowSelected,
  menu,
  label,
  value,
  options,
  initialOpen,
  onChange,
}: {
  editable: boolean;
  rowSelected: boolean;
  menu: RailTone;
  label: string;
  value: LabelShotResult | null;
  options: readonly SelectOption[];
  initialOpen: boolean;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(initialOpen);
  const isLet = value === "let";
  return (
    <span
      data-menu-open={open ? "" : undefined}
      className="flex min-w-0 items-center"
    >
      <EditableCell
        editable={editable}
        rowSelected={rowSelected}
        label={label}
        valueText={value ? RESULT_LABEL[value] : "No result"}
        textClassName={TEXT_AFFORDANCE}
        className="w-full"
        display={
          value ? (
            <span className={cn("truncate", isLet && LET_INK)}>
              {RESULT_LABEL[value]}
            </span>
          ) : (
            <Dash label="No result" />
          )
        }
        editor={
          <SelectEditor
            menu={menu}
            label={label}
            value={value}
            options={options}
            onChange={onChange}
            open={open}
            onOpenChange={setOpen}
            className={isLet ? "text-[color:var(--rail-amber)]" : undefined}
            // A stored result with no landing to calculate from is not an
            // item, but the trigger still says it.
            placeholder={value ? RESULT_LABEL[value] : undefined}
          />
        }
      />
    </span>
  );
}

/** Player, Stroke or Spin: its word, and the menu select once reached for. */
function BlackSelectCell({
  editable,
  rowSelected,
  menu,
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
  menu: RailTone;
  label: string;
  value: string | null;
  text: string | null;
  options: readonly SelectOption[];
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
          menu={menu}
          label={label}
          value={value}
          options={options}
          onChange={onChange}
        />
      }
    />
  );
}

/** One right-aligned number in a slot of its own. */
const NUM = "mono tabular w-8 flex-none text-right text-[10px]";

/**
 * A position. The mark stands for the column's name: a ring is where the stroke
 * was hit, a dot where it landed. Then x and y, each right-aligned in a 32px
 * slot so the decimal points line up. The numbers give way to a text field ("x,
 * y" in metres) sized for the longest pair in this 88px track.
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
