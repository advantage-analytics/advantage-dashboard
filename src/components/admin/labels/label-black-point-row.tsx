"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  GripVertical,
  Plus,
  StickyNote,
} from "lucide-react";
import {
  FloatMenu,
  FloatMenuItem,
  FloatMenuLabel,
  floatMenuToneClasses,
} from "@/components/ui/float-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { filmProgressWidth } from "@/components/dashboard/matches/match-detail/film/film-clock";
import { cn } from "@/lib/utils";
import type { LabelMarks, LabelSuggestion } from "@/lib/services/labels/marks";
import type { LabelGame } from "@/lib/services/labels/operations";
import type { LabelGameBand as LabelGameBandScore } from "@/lib/services/labels/score";
import type {
  LabelGameType,
  LabelPoint,
  LabelSide,
} from "@/lib/services/labels/session";
import { canResetPoint } from "@/lib/services/labels/reset";
import { suggestionState } from "@/lib/services/labels/suggestions";
import {
  formatClockTime,
  pointDetail,
  pointSentence,
  withoutGhosts,
} from "./label-black-format";
import { MarkChip, PencilMark, pointRowMarks } from "./label-black-mark";
import { EditableCell, TextEditor } from "./label-cells";
import type { SideNames } from "./label-format";
import {
  gameBandMenus,
  gameBandModel,
  gameBandServes,
  type GameBandMenuRow,
} from "./label-game-band";
import { PointMenu } from "./label-point-menu";
import { BlackUndoButton, drawsGhosts } from "./label-black-shot-row";
import { parseNote, pointSummary } from "./label-point-row";
import {
  sideInitial,
  type EditContext,
  type PlayingWindow,
} from "./label-row-parts";

/**
 * The black full-screen view's rows (board 08l): the film room's points rail
 * (`film/point-list.tsx`, `ROW_TONE.dark` / `LIST_TONE.dark`) carrying the
 * labelling console's point. Same labels, same writes and the same requests
 * as the table's row (`label-point-row.tsx`) — two lines instead of eleven
 * columns, on black.
 *
 * Colours are the frame's: white at an alpha on the room's black, `--blue`
 * for the one player's mark, the progress rule and the "changed" pencil,
 * `--success` for a checked tick. Nothing here is a light token — the row
 * never sits on a light ground.
 */

/**
 * The frame's `.bk-row` tracks: number · winner mark · the two lines · tail ·
 * score · actions · tick. The actions track is `auto` and empty until the
 * row is reached for, so the score sits against the tick and slides left
 * when they appear; the tick's own track never moves.
 */
const ROW_GRID =
  "grid grid-cols-[22px_30px_minmax(0,1fr)_auto_48px_auto_22px] items-center gap-x-[10px] min-h-[52px] px-[14px] py-1.5";

/** A point the labeller has changed: itself, or any of its strokes. */
export function pointChangedByYou(
  point: Pick<LabelPoint, "status" | "shots">,
): boolean {
  return (
    point.status === "edited" ||
    point.status === "added" ||
    point.shots.some(
      (shot) =>
        shot.status === "edited" ||
        shot.status === "added" ||
        shot.status === "deleted",
    )
  );
}

/**
 * One point of the black rail — the frame's `.bk-row`.
 *
 * Left to right: the point's number (a grip in its place while the row is
 * hovered or playing — drawn as the frame draws it; nothing reorders) · the
 * WINNER mark, which is the menu that changes who won · how the point ended
 * as a sentence over the deciding shot, the time and the rally · a tail slot
 * carrying the point's marks (board 08m: what to check, what the site fixed)
 * and the blue pencil on a point the labeller has changed · the score
 * before the point · the row's actions (Note and ⋯), there only on hover, on
 * focus and on the playing row · the tick that marks the point checked.
 *
 * The PLAYING row draws the rail's progress rule along its foot, its width
 * CSS reading `--film-t` (`film-clock.ts`) so the row never re-renders to
 * move it.
 *
 * The strokes arrive as `children` and are drawn under the open row.
 */
export function BlackPointRow({
  point,
  open,
  playing,
  playingWindow = null,
  score,
  edit,
  marks = null,
  onToggle,
  children,
}: {
  point: LabelPoint;
  open: boolean;
  playing: boolean;
  /** The playing point's span in file seconds; only the playing row gets one. */
  playingWindow?: PlayingWindow | null;
  /** The score before the point, as the scoreboard words it; null for none. */
  score: string | null;
  edit: EditContext;
  /**
   * The session's marks (`getLabelSession`'s `marks`). Null — a session
   * seeded without them, or a build that failed — draws no chip at all.
   */
  marks?: LabelMarks | null;
  onToggle?: (pointId: string) => void;
  /** The open point's strokes; nothing when it is folded. */
  children?: React.ReactNode;
}) {
  const { operations, names } = edit;
  const number = point.pointIndex + 1;
  const shotsId = `label-black-point-${point.id}-shots`;
  const checked = point.checkedAt !== null;
  const showNote = edit.editable || point.note !== null;
  // The point as the rail reads it (board 08m §3): without the strokes the
  // site removed while the well draws them as ghosts, so the sentence, the
  // deciding stroke and the rally count say what the rally is now. With the
  // session's marks off or none built, a ghost is a stroke like any other.
  const shown = drawsGhosts(edit, marks) ? withoutGhosts(point) : point;
  // A point the labeller just added (board 08m §5's "New point"): nothing on
  // it yet, so the two lines say what to do next rather than how it ended.
  const fresh = isNewPoint(point);
  const sentence = fresh ? NEW_POINT_TITLE : pointSentence(shown, names);
  const detail = fresh
    ? newPointDetail(point, edit.points)
    : pointDetail(shown, names);
  // The rail's rows go along so a "Same side twice" question reads settled
  // once a point the labeller added sits between the two (marks-state.ts).
  const rowMarks = pointRowMarks(point, marks, names, sentence, edit.points);
  // ONE pencil: the roll-up's when the session has marks (it also counts a
  // removed stroke the labeller put back), the row's own rule when not.
  const changed = rowMarks ? rowMarks.pencil : pointChangedByYou(point);

  return (
    <>
      <div
        data-row="point"
        data-point-id={point.id}
        data-point-new={fresh ? "" : undefined}
        data-playing={playing ? "true" : undefined}
        onClick={(event) => {
          // A click that lands in a control is that control's, not a toggle.
          if ((event.target as Element).closest("[data-cell]")) return;
          onToggle?.(point.id);
        }}
        className={cn(
          ROW_GRID,
          // A size container: a mark's words give way under 600px of row.
          "group/row @container relative cursor-pointer transition-colors duration-200",
          playing ? "bg-white/[0.08]" : "hover:bg-white/[0.06]",
        )}
      >
        {/* The number, and the frame's grip over it once the row is reached. */}
        <span className="mono tabular relative inline-flex items-center text-[10px] text-white/35">
          <span
            className={cn(
              "transition-opacity duration-200",
              playing ? "opacity-0" : "group-hover/row:opacity-0",
            )}
          >
            {number}
          </span>
          <GripVertical
            data-row-handle=""
            aria-hidden="true"
            strokeWidth={1.6}
            className={cn(
              "absolute left-0 size-3.5 cursor-grab text-white/60 transition-opacity duration-200",
              playing ? "opacity-100" : "opacity-0 group-hover/row:opacity-100",
            )}
          />
        </span>

        <BlackWinnerCell
          point={point}
          number={number}
          edit={edit}
          fresh={fresh}
        />

        {/* The two lines, and the row's fold control for a keyboard and a
            screen reader — the row's own click does the same for a mouse. */}
        <button
          type="button"
          data-point-fold=""
          aria-expanded={open}
          aria-controls={open ? shotsId : undefined}
          onClick={(event) => {
            event.stopPropagation();
            onToggle?.(point.id);
          }}
          className="flex min-w-0 cursor-pointer flex-col gap-px rounded-[var(--radius-button)] text-left focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          <span
            data-point-sentence=""
            className={cn(
              "truncate text-[12px] font-medium",
              // The frame's `.fx-new .bk-t`: the new point's title in blue.
              fresh ? "text-[var(--blue)]" : "text-white",
            )}
          >
            {sentence}
          </span>
          <span
            data-point-detail=""
            className="truncate text-[11px]"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            {detail}
          </span>
        </button>

        {/* The marks, in the frame's order: what to check, what was fixed,
            then the pencil — which is the point's Reset as well, when its
            own fields have changed and it has a seed to go back to (the
            same ask as the menu's). A chip's words go before the two lines
            do — see `MarkChip` — so the tail never takes the score's room. */}
        <span data-row-tail="" className="inline-flex items-center gap-2">
          {rowMarks?.flag ? <MarkChip {...rowMarks.flag} /> : null}
          {rowMarks?.fix ? <MarkChip {...rowMarks.fix} /> : null}
          {changed ? (
            <PencilMark
              reset={
                operations && canResetPoint(point)
                  ? {
                      label: `Reset point ${number}`,
                      onClick: () => operations.onAskResetPoint(point.id),
                    }
                  : undefined
              }
            />
          ) : null}
        </span>

        {/* A new point has no score of its own yet — the frame draws a dash
            until its winner is set — whatever the scoreboard says before it. */}
        <span
          data-point-score=""
          className="mono tabular truncate text-right text-[11px]"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          {(fresh ? null : score) ?? (
            <>
              <span aria-hidden="true" className="text-white/35">
                —
              </span>
              <span className="sr-only">No score</span>
            </>
          )}
        </span>

        {/* Collapsed to nothing until the row is reached for, so the score
            keeps the tick's side; open, it takes its width and the score
            slides left. A menu open from here holds it open. */}
        <span
          data-row-actions=""
          data-cell=""
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "inline-flex items-center gap-0.5 transition-opacity duration-200",
            playing
              ? "opacity-100"
              : "w-0 overflow-hidden opacity-0 group-focus-within/row:w-auto group-focus-within/row:overflow-visible group-focus-within/row:opacity-100 group-hover/row:w-auto group-hover/row:overflow-visible group-hover/row:opacity-100 has-[[aria-expanded=true]]:w-auto has-[[aria-expanded=true]]:overflow-visible has-[[aria-expanded=true]]:opacity-100",
          )}
        >
          {showNote ? (
            <BlackNoteAction point={point} number={number} edit={edit} />
          ) : null}
          {operations ? (
            <PointMenu
              point={point}
              number={number}
              // The group above owns the reveal; inside it the ⋯ is just there.
              open
              edit={edit}
              operations={operations}
              tone="dark"
            />
          ) : null}
        </span>

        <ChromeTooltip
          label={checked ? "Point checked" : "Mark point checked"}
          side="top"
        >
          <button
            type="button"
            data-cell=""
            data-check-row=""
            aria-pressed={checked}
            aria-label={`Point ${number} checked`}
            disabled={!operations}
            onClick={(event) => {
              event.stopPropagation();
              operations?.onSetChecked(point.id, !checked);
            }}
            className={cn(
              "flex size-[22px] items-center justify-center rounded-[var(--radius-button)] transition-colors duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
              operations && "cursor-pointer",
              checked
                ? "text-[var(--success)]"
                : playing
                  ? "text-white/50"
                  : "text-white/[0.22] group-hover/row:text-white/50",
              operations && !checked && "hover:text-white",
            )}
          >
            <Check className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
          </button>
        </ChromeTooltip>

        {/* The playing row's rule, as the points rail draws it: out of the
            grid's flow, so it takes no track. */}
        {playing && playingWindow ? (
          <span
            aria-hidden="true"
            data-playing-rule=""
            className="absolute bottom-0 left-0 h-0.5 bg-[var(--blue)]"
            style={{
              width: filmProgressWidth(playingWindow.start, playingWindow.end),
            }}
          />
        ) : null}
      </div>

      {open ? (
        <div id={shotsId} data-shots-for={point.id}>
          {children}
        </div>
      ) : null}
    </>
  );
}

// ── A new point ────────────────────────────────────────────────────────────

const NEW_POINT_TITLE = "New point";
const NEW_POINT_DETAIL = "Set who won, then add its shots";

/**
 * A point the labeller added and has not touched since: no winner and no
 * live stroke. The frame's "New point" row (board 08m §5) — a "?" in a blue
 * ring, the title in blue, the detail saying what to do next. Setting the
 * winner or adding a stroke makes it an ordinary row.
 */
export function isNewPoint(
  point: Pick<LabelPoint, "status" | "winner" | "shots">,
): boolean {
  return (
    point.status === "added" &&
    point.winner === null &&
    !point.shots.some((shot) => shot.status !== "deleted")
  );
}

/**
 * The new point's detail line: "Set who won, then add its shots · between
 * {t1} and {t2}", where t1 is the last live stroke of the live point before
 * it on the rail and t2 the first live stroke of the one after, on the rail's
 * clock (`formatClockTime`). With only one neighbour timed it reads "after
 * t1" / "before t2"; with neither, the words alone.
 */
export function newPointDetail(
  point: Pick<LabelPoint, "id">,
  points: readonly LabelPoint[],
): string {
  const at = points.findIndex((p) => p.id === point.id);
  if (at === -1) return NEW_POINT_DETAIL;
  const live = (p: LabelPoint) =>
    p.shots.filter((shot) => shot.status !== "deleted");
  let t1: number | null = null;
  for (let i = at - 1; i >= 0 && t1 === null; i -= 1) {
    const p = points[i];
    if (p.status === "deleted") continue;
    t1 = live(p).findLast((shot) => shot.videoTime !== null)?.videoTime ?? null;
    break;
  }
  let t2: number | null = null;
  for (let i = at + 1; i < points.length && t2 === null; i += 1) {
    const p = points[i];
    if (p.status === "deleted") continue;
    t2 = live(p).find((shot) => shot.videoTime !== null)?.videoTime ?? null;
    break;
  }
  if (t1 !== null && t2 !== null) {
    return `${NEW_POINT_DETAIL} · between ${formatClockTime(t1)} and ${formatClockTime(t2)}`;
  }
  if (t1 !== null) return `${NEW_POINT_DETAIL} · after ${formatClockTime(t1)}`;
  if (t2 !== null) return `${NEW_POINT_DETAIL} · before ${formatClockTime(t2)}`;
  return NEW_POINT_DETAIL;
}

// ── A suggested point ──────────────────────────────────────────────────────

type PointSuggestion = Extract<LabelSuggestion, { kind: "missing_point" }>;

/**
 * The missing-point suggestions still waiting for an answer, by the flagged
 * point's id (board 08m §5): the session computes marks and has them, both
 * points of the pair are live rows of the rail, and the suggestion is
 * neither dismissed nor answered — by a point added between the two, or by
 * the second marked a replayed let (`suggestionState`). With marks off, or
 * none built, there is none.
 */
export function openPointSuggestions(
  points: readonly LabelPoint[],
  edit: Pick<EditContext, "marksEnabled">,
  marks: LabelMarks | null | undefined,
): ReadonlyMap<string, PointSuggestion> {
  const open = new Map<string, PointSuggestion>();
  if (!marks || !drawsGhosts(edit, marks)) return open;
  const byId = new Map(points.map((point) => [point.id, point]));
  for (const suggestion of marks.suggestions) {
    if (suggestion.kind !== "missing_point") continue;
    const flagged = byId.get(suggestion.pointId);
    const before = byId.get(suggestion.beforePointId);
    if (!flagged || flagged.status === "deleted") continue;
    if (!before || before.status === "deleted") continue;
    if (suggestionState(suggestion, flagged, points) !== "open") continue;
    if (!open.has(flagged.id)) open.set(flagged.id, suggestion);
  }
  return open;
}

/** The frame's `.fx-pi`: the plus in the slot's first track. */
const SLOT_PLUS_INK = "rgba(252,211,77,0.8)";

/**
 * A suggested point (board 08m §5, the frame's `.fx-psug`): two points of a
 * game were served from the same side, so one is probably missing between
 * them. A dashed amber slot between their rows — a plus on the row's number
 * track, the sentence over the reason, and three answers: "Add point" (the
 * insert, `onInsertPoint` before the flagged point), "{b} was a let" (the
 * existing point autosave, `ending: let_replayed` — the score stands, as
 * score.ts already rules), and "Dismiss" (the suggestion's key stored). The
 * answers are absent on a session that cannot be written.
 *
 * Built to fit the rail from 520px: the two lines truncate, the answers
 * never shrink or wrap (`shrink-0 whitespace-nowrap`), and at that width the
 * three take about 215px of the slot's 440, so they sit on one line with the
 * words. Nothing is added until a click.
 */
export function BlackSuggestedPoint({
  suggestion,
  point,
  edit,
}: {
  suggestion: PointSuggestion;
  /** The flagged point — the second of the pair, whose row follows the slot. */
  point: LabelPoint;
  edit: EditContext;
}) {
  const operations = edit.editable ? edit.operations : undefined;
  // The pair as the rail numbers them NOW — a point added or removed above
  // moves both — falling back to the marks' reading.
  const before = edit.points.find((p) => p.id === suggestion.beforePointId);
  const a = before ? before.pointIndex + 1 : suggestion.pointNumbers[0];
  const b = point.pointIndex + 1;
  const reason = `Points ${a} and ${b} were both served from the ${suggestion.side} side`;
  return (
    <div
      data-row="suggested-point"
      data-point-suggestion={point.id}
      className="mx-2 my-0.5 grid min-h-[44px] grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-[10px] rounded-lg border border-dashed border-[rgba(252,211,77,0.45)] bg-[rgba(253,230,138,0.06)] py-1.5 pr-[10px] pl-1.5"
    >
      <Plus
        className="size-3"
        style={{ color: SLOT_PLUS_INK }}
        strokeWidth={2}
        aria-hidden="true"
      />
      <span className="flex min-w-0 flex-col gap-px">
        <span
          data-point-suggestion-title=""
          className="truncate text-[12px] font-medium text-white"
        >
          A point is probably missing here
        </span>
        <ChromeTooltip label={reason} side="top" wrap>
          <span
            data-point-suggestion-detail=""
            className="truncate text-[11px] text-white/50"
          >
            {reason}
          </span>
        </ChromeTooltip>
      </span>
      {operations ? (
        <span
          data-point-suggestion-actions=""
          className="flex shrink-0 items-center justify-end gap-[14px]"
        >
          <button
            type="button"
            data-point-suggestion-add=""
            aria-label={`Add a point between points ${a} and ${b}`}
            onClick={(event) => {
              event.stopPropagation();
              operations.onInsertPoint(point.id);
            }}
            className="shrink-0 cursor-pointer rounded-[var(--radius-button)] px-1 text-[11px] font-medium whitespace-nowrap text-[rgba(252,211,77,1)] transition-colors duration-200 hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            Add point
          </button>
          <button
            type="button"
            data-point-suggestion-let=""
            aria-label={`Point ${b} was a let, replayed`}
            onClick={(event) => {
              event.stopPropagation();
              edit.onPatchPoint?.(point.id, { ending: "let_replayed" });
            }}
            className="shrink-0 cursor-pointer rounded-[var(--radius-button)] px-1 text-[11px] font-medium whitespace-nowrap text-white/50 transition-colors duration-200 hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            {b} was a let
          </button>
          <button
            type="button"
            data-point-suggestion-dismiss=""
            aria-label={`Dismiss the suggested point between points ${a} and ${b}`}
            onClick={(event) => {
              event.stopPropagation();
              operations.onDismissSuggestion(point.id, suggestion.key);
            }}
            className="shrink-0 cursor-pointer rounded-[var(--radius-button)] px-1 text-[11px] font-medium whitespace-nowrap text-white/50 transition-colors duration-200 hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            Dismiss
          </button>
        </span>
      ) : null}
    </div>
  );
}

// ── A deleted point ────────────────────────────────────────────────────────

/**
 * A deleted point, in the rail: ONE quiet line on the row's own first track
 * and padding — a dash where the number was, "Deleted point" and where it
 * was on the film — with Undo always at the right edge.
 *
 * The light table's tombstone (`DeletedPoint`) folds open to a ghost of the
 * row on the light table's eleven tracks, far wider than the rail, with Undo
 * in a column the rail never reaches and light-theme ink throughout. Nothing
 * folds open here, so `openTombstoneIds` is not read. A deleted point has no
 * score and no band. Undo is the same request (`onRestorePoint`), absent on
 * a session that cannot be written.
 */
export function BlackDeletedPoint({
  point,
  edit,
}: {
  point: LabelPoint;
  edit: EditContext;
}) {
  const { operations } = edit;
  const time = pointSummary(point).time;
  return (
    <div
      data-row="deleted-point"
      data-tombstone-id={point.id}
      className="grid h-[30px] grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-[10px] px-[14px]"
    >
      <span aria-hidden="true" className="mono text-[10px] text-white/25">
        –
      </span>
      <span className="min-w-0 truncate text-[11px] text-white/45">
        Deleted point
        {time ? <span className="text-white/35"> · {time}</span> : null}
      </span>
      {operations ? (
        <BlackUndoButton
          label={`Undo delete point ${point.pointIndex + 1}`}
          onClick={() => operations.onRestorePoint(point.id)}
        />
      ) : null}
    </div>
  );
}

// ── The winner mark ────────────────────────────────────────────────────────

const SIDES: readonly LabelSide[] = ["p1", "p2"];

/**
 * The frame's `.bk-mk`: a 30px square with the winner's initial — p1 on
 * `--blue`, p2 on a white wash. Two grounds, not two hues, as down the
 * table's own column. No winner yet is the wash with a dash — or, on a point
 * the labeller just added (`fresh`, the frame's `.fx-new .bk-mk`), a "?" in a
 * `--blue` ring on the room's own black: the one thing to set first.
 */
function BlackWinnerMark({
  side,
  names,
  fresh = false,
}: {
  side: LabelSide | null;
  names: SideNames;
  fresh?: boolean;
}) {
  return (
    <span
      data-winner-mark={side ?? (fresh ? "new" : "none")}
      aria-hidden="true"
      className={cn(
        "flex size-[30px] shrink-0 items-center justify-center rounded-[var(--radius-button)] text-[11px] leading-none font-medium tracking-[0.3px]",
        side === "p1"
          ? "bg-[var(--blue)] text-white"
          : side === null && fresh
            ? "bg-transparent text-[var(--blue)] shadow-[inset_0_0_0_1px_var(--blue)]"
            : "bg-white/[0.14] text-white/90",
      )}
    >
      {side ? sideInitial(side, names) : fresh ? "?" : "—"}
    </span>
  );
}

/**
 * The winner mark as the control that changes it — the table row's menu
 * (`label-point-row.tsx`'s `WinnerCell`) on the dark surface: the two players,
 * the current one checked; choosing the other saves `{ winner }`. Read-only,
 * it is the mark alone.
 */
function BlackWinnerCell({
  point,
  number,
  edit,
  fresh = false,
}: {
  point: LabelPoint;
  number: number;
  edit: EditContext;
  /** A point just added: the mark is the "?" (`BlackWinnerMark`). */
  fresh?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { names } = edit;
  const name = point.winner
    ? `Point ${number} won by ${names[point.winner]}`
    : `Point ${number} winner not labelled`;
  if (!edit.editable) {
    return (
      <span role="img" aria-label={name} className="flex">
        <BlackWinnerMark side={point.winner} names={names} fresh={fresh} />
      </span>
    );
  }
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
        tone="dark"
        label={`Who won point ${number}`}
        trigger={
          <button
            type="button"
            aria-label={name}
            aria-haspopup="menu"
            aria-expanded={open}
            className={cn(
              "cursor-pointer rounded-[var(--radius-button)] transition-shadow duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
              open && "shadow-[0_0_0_1.5px_rgba(255,255,255,0.5)]",
            )}
          >
            <BlackWinnerMark side={point.winner} names={names} fresh={fresh} />
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

// ── The note ───────────────────────────────────────────────────────────────

/**
 * The row's Note action — the frame's `.bk-ib`, white once the point has a
 * note. It opens the table row's own note cell (`EditableCell` + `TextEditor`,
 * the same parse and the same `{ note }` patch) on the dark menu surface: the
 * field is there at once, Enter or leaving it saves, and a saved note closes
 * the popover. Read-only, the popover is the note's text.
 */
function BlackNoteAction({
  point,
  number,
  edit,
}: {
  point: LabelPoint;
  number: number;
  edit: EditContext;
}) {
  const [open, setOpen] = useState(false);
  const { note } = point;
  const label = `Point ${number} note`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* The tooltip's trigger is the popover's: Radix merges the two onto
          the one button. Open, the popover already says its name. */}
      <ChromeTooltip label="Note" side="top" hidden={open}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-note-action=""
            data-has-note={note ? "" : undefined}
            aria-label={note ? `${label}: ${note}` : label}
            aria-haspopup="dialog"
            aria-expanded={open}
            className={cn(
              "flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] transition-colors duration-200 hover:bg-white/[0.08] hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
              note ? "text-white" : "text-white/55",
              open && "bg-white/[0.08] text-white",
            )}
          >
            <StickyNote
              className="size-[13px]"
              strokeWidth={1.6}
              aria-hidden="true"
            />
          </button>
        </PopoverTrigger>
      </ChromeTooltip>
      <PopoverContent
        align="end"
        sideOffset={4}
        aria-label={label}
        className={cn(floatMenuToneClasses("dark"), "w-[300px]")}
      >
        <p className="px-[9px] pt-[7px] pb-[5px] text-[11px] text-white/50">
          Note on point {number}
        </p>
        {/* The dark field pulls itself 5px left to sit over a cell's text
              and runs 2px past it; the inset here hands both back. */}
        <div className="pt-0.5 pr-[11px] pb-[7px] pl-[14px]">
          <EditableCell
            editable={edit.editable}
            rowSelected
            label={label}
            valueText={note ?? "None"}
            display={
              <span className="-ml-[5px] block text-[12px] whitespace-normal text-white/85">
                {note}
              </span>
            }
            editor={
              <TextEditor
                tone="dark"
                label={label}
                text={note ?? ""}
                parse={parseNote}
                onCommit={(value) => {
                  edit.onPatchPoint?.(point.id, {
                    note: value as string | null,
                  });
                  setOpen(false);
                }}
              />
            }
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── The game band ──────────────────────────────────────────────────────────

/** `LIST_TONE.dark`'s game header, on the row's own 14px inset. */
const BAND = "flex items-center px-[14px] pt-[13px] pb-[5px]";
const BAND_LABEL = "mono text-[9px] tracking-[1.4px] uppercase";
const BAND_META = "mono tabular text-[10px]";
/** The frame's `.bk-gl` and `.bk-gm` inks. */
const BAND_LABEL_INK = "text-white/45";
const BAND_META_INK = "text-white/40";

/**
 * A game band in the rail's dark tone — the frame's `.bk-gh`, and
 * `LabelGameBand` (`label-game-band.tsx`) word for word: "Set N · Game M"
 * (or "Set N · Tiebreak" / "Match tiebreak") on the left, the set's games
 * before it and who serves on the right. With both callbacks the game's name
 * and its server are triggers opening the same two menus on the dark
 * surface; without them — a read-only console — the band only reads.
 *
 * The model, the words and the menus' rows are that file's (`gameBandModel`,
 * `gameBandServes`, `gameBandMenus`); only the paint is this one's.
 */
export function BlackGameBand({
  band,
  points,
  names,
  onSetGameType,
  onSetGameServer,
}: {
  band: LabelGameBandScore;
  points: readonly LabelPoint[];
  names: SideNames;
  /** Both absent: no menus, the band only reads. */
  onSetGameType?: (game: LabelGame, type: LabelGameType) => void;
  onSetGameServer?: (game: LabelGame, server: LabelSide) => void;
}) {
  const model = gameBandModel(band, points);
  const serves = gameBandServes(model, names);
  const menus =
    onSetGameType && onSetGameServer
      ? gameBandMenus(model, names, { onSetGameType, onSetGameServer })
      : null;
  return (
    <div
      data-game-band={`${band.setNumber}-${band.gameNumber}`}
      data-game-type={model.type}
      className={BAND}
    >
      {menus ? (
        <span className="flex items-center">
          {model.setLabel ? (
            <span className={cn(BAND_LABEL, BAND_LABEL_INK)}>
              {model.setLabel} ·
            </span>
          ) : null}
          <BlackBandMenu
            kind="type"
            name={`Game type: ${model.gameLabel}`}
            menuLabel="Game type"
            align="start"
            rows={menus.type}
            ink={BAND_LABEL_INK}
            // With no set before it, the trigger's text starts the band.
            className={cn(BAND_LABEL, !model.setLabel && "-ml-1.5")}
          >
            {model.gameLabel}
          </BlackBandMenu>
        </span>
      ) : (
        <span className={cn(BAND_LABEL, BAND_LABEL_INK)}>
          {model.setLabel ? `${model.setLabel} · ` : ""}
          {model.gameLabel}
        </span>
      )}
      <span className="flex-1" />
      {menus ? (
        <span className="flex items-center">
          <span className={cn(BAND_META, BAND_META_INK)}>{model.score} ·</span>
          <BlackBandMenu
            kind="server"
            name={
              model.server ? `Server: ${names[model.server]}` : "Server: none"
            }
            menuLabel={`Who serves ${model.gameLabel}`}
            caption={
              model.type === "game" ? "Serving this game" : "Serving first"
            }
            align="end"
            rows={menus.server}
            ink={BAND_META_INK}
            className={cn(BAND_META, "-mr-1.5")}
          >
            {serves}
          </BlackBandMenu>
        </span>
      ) : (
        <span className={cn(BAND_META, BAND_META_INK)}>
          {model.score} · {serves}
        </span>
      )}
    </div>
  );
}

/**
 * One of the dark band's triggers and its menu — `label-game-band.tsx`'s
 * `BandMenu` on the dark surface. 22px tall for the pointer, taking 14px of
 * the band (`-my-1`), so a band with menus is as tall as one without.
 */
function BlackBandMenu({
  kind,
  name,
  menuLabel,
  caption,
  align,
  rows,
  ink,
  className,
  children,
}: {
  kind: "type" | "server";
  /** The trigger's accessible name: what it is, and what it is set to. */
  name: string;
  menuLabel: string;
  caption?: string;
  align: "start" | "end";
  rows: readonly GameBandMenuRow[];
  /** The trigger's resting ink — the label's or the meta's. */
  ink: string;
  /** The trigger's type, and any edge pull. */
  className: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <FloatMenu
      open={open}
      onOpenChange={setOpen}
      align={align}
      sideOffset={6}
      width={290}
      tone="dark"
      label={menuLabel}
      trigger={
        <button
          type="button"
          aria-label={name}
          aria-haspopup="menu"
          aria-expanded={open}
          data-game-menu={kind}
          className={cn(
            "-my-1 flex h-[22px] cursor-pointer items-center gap-[5px] rounded-[6px] px-1.5 transition-[color,background-color] duration-[var(--duration-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
            className,
            open
              ? "bg-white/[0.12] text-white"
              : cn(ink, "hover:bg-white/[0.08] hover:text-white"),
          )}
        >
          {children}
          <ChevronDown
            className="size-2.5 shrink-0 opacity-70"
            strokeWidth={1.6}
            aria-hidden="true"
          />
        </button>
      }
    >
      {caption ? <FloatMenuLabel>{caption}</FloatMenuLabel> : null}
      {rows.map((row) => (
        <FloatMenuItem
          key={row.key}
          label={row.label}
          description={row.description}
          chosen={row.chosen}
          onSelect={() => {
            setOpen(false);
            row.run();
          }}
        />
      ))}
    </FloatMenu>
  );
}
