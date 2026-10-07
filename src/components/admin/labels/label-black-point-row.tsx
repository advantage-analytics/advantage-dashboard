"use client";

import { memo, useState } from "react";
import { Check, CornerDownRight, Plus } from "lucide-react";
import {
  FloatMenu,
  FloatMenuItem,
  FloatMenuLabel,
  floatMenuToneClasses,
} from "@/components/ui/float-menu";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { filmProgressWidth } from "@/components/dashboard/matches/match-detail/film/film-clock";
import {
  FILM_ROW_ACTION_HELD,
  FILM_ROW_ACTION_ON_REACH,
  FILM_ROW_ACTION_TRANSITION,
  FILM_ROW_SLIDE_HELD,
  FILM_ROW_SLIDE_ON_REACH,
  FILM_ROW_SLIDE_TRANSITION,
} from "@/components/dashboard/matches/match-detail/film/film-row-reveal";
import { cn } from "@/lib/utils";
import type {
  GameOverflow,
  GameShiftSummary,
} from "@/lib/services/labels/game-shift";
import type { LabelMarks, LabelSuggestion } from "@/lib/services/labels/marks";
import type { LabelPoint, LabelSide } from "@/lib/services/labels/session";
import { canResetPoint } from "@/lib/services/labels/reset";
import { suggestionState } from "@/lib/services/labels/suggestions";
import {
  formatClockTime,
  pointDetail,
  pointSentence,
  withoutGhosts,
} from "./label-black-format";
import { MarkChip, PencilMark, pointRowMarks } from "./label-black-mark";
import type { SideNames } from "./label-format";
import { PointMenu } from "./label-point-menu";
import { isCombinedTombstone } from "@/lib/services/labels/point-combine";
import {
  AMBER_SLOT_ICON_INK,
  BLACK_SLOT,
  RAIL_PRESS,
  BlackTextAction,
  BlackUndoButton,
} from "./label-black-parts";
import { drawsGhosts } from "./label-black-shot-row";
import { pointSummary } from "./label-format";
import { RAIL_TONE_CLASS, railInk } from "./label-rail-tone";
import {
  SIDES,
  sideInitial,
  type EditContext,
  type PlayingWindow,
} from "./label-row-parts";

/**
 * The rail's point rows (board 08l): the film room's points rail
 * (`film/point-list.tsx`, `ROW_TONE.dark` / `LIST_TONE.dark`) carrying the
 * labelling console's point — its labels, its writes and its requests — in
 * two lines.
 *
 * Colours are the frame's: white at an alpha on the room's black, `--blue`
 * for the one player's mark, the progress rule and the "changed" pencil,
 * `--success` for a checked tick. The same classes draw the row on the light
 * ground: there "white" is the page's ink (`label-rail-tone.ts`), so nothing
 * here names a light token, and nothing here may mean the COLOUR white by
 * writing `white` — that is `--rail-on-accent`.
 */

/**
 * The frame's `.bk-row` tracks: number · winner mark · the two lines · tail ·
 * score · tick. The row's actions take NO track: they are an overlay over
 * the score's right end (`ACTIONS_RIGHT`), revealed as the Video tab's point
 * row reveals its bookmark (`film-row-reveal.ts`) — the score slides 26px
 * left on a transform and the actions fade in where it was, so no column
 * re-lays and nothing changes width. The score's track is the Video tab's
 * 52px, which leaves the slide room inside the 10px gap before the tail.
 */
const ROW_GRID =
  "grid grid-cols-[22px_30px_minmax(0,1fr)_auto_52px_22px] items-center gap-x-[10px] min-h-[52px] px-[14px] py-1.5";

/**
 * Where the row's actions sit: over the score's right end, out of the grid —
 * the row's 14px of padding, the tick's 22px track and the 10px gap before
 * it. The Video tab puts its bookmark at the row's `right-[14px]`; the rail
 * has the tick there, so its overlay starts one track in.
 */
const ACTIONS_RIGHT = "right-[46px]";

/**
 * The rail's two additions to the Video tab's slide (`film-row-reveal.ts`).
 * The score also stays aside while the row's ⋯ menu is open — the menu is
 * portalled, so the row has neither the pointer nor the focus by then. And
 * under reduced motion the score still gets out of the way, at once: the
 * Video tab leaves it under its bookmark, a small glyph over a score's last
 * digit, but a 22px button over the rail's would hide it.
 */
const SCORE_ASIDE_FOR_MENU =
  "group-has-[[data-row-actions]_[aria-expanded=true]]/row:-translate-x-[26px]";
const SCORE_ASIDE_REDUCED =
  "motion-reduce:transition-none motion-reduce:group-focus-within/row:-translate-x-[26px] motion-reduce:group-hover/row:-translate-x-[26px]";

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
 * Left to right: the point's number · the
 * WINNER mark, which is the menu that changes who won · how the point ended
 * as a sentence over the deciding shot, the time and the rally · a tail slot
 * carrying the point's chip (board 08m: what to check, for the marks that
 * can change the score) and the blue pencil on a point the labeller has changed · the score
 * before the point · the row's actions (⋯), there only on hover, on
 * focus and on the playing row · the tick that marks the point checked.
 *
 * The PLAYING row draws the rail's progress rule along its foot, its width
 * CSS reading `--film-t` (`film-clock.ts`) so the row never re-renders to
 * move it.
 *
 * The strokes arrive as `children` and are drawn under the open row.
 *
 * Memoised, as the rail's other rows are: the film crosses into another
 * stroke every second or two, and only the rows whose own props changed —
 * the one it left, the one it entered, the open one — render for it. That
 * holds because the rail hands every row the same `edit` and callbacks that
 * keep their identity (`label-console.tsx`).
 */
export const BlackPointRow = memo(function BlackPointRow({
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
  const tone = edit.tone ?? "dark";
  const number = point.pointIndex + 1;
  const checked = point.checkedAt !== null;
  // The point as the rail reads it (board 08m §3): without the strokes the
  // site removed while the well draws them as ghosts, so the sentence, the
  // deciding stroke and the rally count say what the rally is now. With the
  // session's marks off or none built, a ghost is a stroke like any other.
  const shown = drawsGhosts(marks) ? withoutGhosts(point) : point;
  // A point the labeller just added (board 08m §5's "New point"): nothing on
  // it yet, so the two lines say what to do next rather than how it ended.
  const fresh = isNewPoint(point);
  const sentence = fresh ? NEW_POINT_TITLE : pointSentence(shown, names);
  const detail = fresh
    ? newPointDetail(point, edit.points)
    : pointDetail(shown);
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
        {/* The number: it stays put under the pointer and on the playing row. */}
        <span
          data-point-number=""
          className="mono tabular inline-flex items-center text-[10px] text-white/35"
        >
          {number}
        </span>

        <BlackWinnerCell
          point={point}
          number={number}
          edit={edit}
          fresh={fresh}
        />

        {/* The two lines, as the row's control for a keyboard and a screen
            reader — the row's own click does the same for a mouse: go to the
            point, which makes it the current one and unfolds it. Not a
            toggle: only the current point is unfolded, and nothing folds it. */}
        <button
          type="button"
          data-point-go=""
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
            style={{ color: DETAIL_INK }}
          >
            {detail}
          </span>
        </button>

        {/* The tail: what to check — the one chip, for the marks that can
            change the score — then the pencil, which is the point's Reset
            as well, when its own fields have changed and it has a seed to
            go back to (the same ask as the menu's). A chip's words go
            before the two lines do — see `MarkChip` — so the tail never
            takes the score's room. A hint is not here: it is a word in the
            open point's well (`PointHintLine`). */}
        <span data-row-tail="" className="inline-flex items-center gap-2">
          {rowMarks?.flag ? <MarkChip {...rowMarks.flag} /> : null}
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
          className={cn(
            "mono tabular truncate text-right text-[11px]",
            FILM_ROW_SLIDE_TRANSITION,
            // Only a row with actions has anything to make room for.
            operations &&
              (playing
                ? FILM_ROW_SLIDE_HELD
                : cn(
                    FILM_ROW_SLIDE_ON_REACH,
                    SCORE_ASIDE_FOR_MENU,
                    SCORE_ASIDE_REDUCED,
                  )),
          )}
          style={{ color: SCORE_INK }}
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

        {/* Over the score's right end, out of the grid: faded in as the
            score slides aside (the Video tab's reveal), lit at rest on the
            playing row. A menu open from here holds it lit. */}
        <span
          data-row-actions=""
          data-cell=""
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "absolute inset-y-0 inline-flex items-center gap-0.5",
            ACTIONS_RIGHT,
            FILM_ROW_ACTION_TRANSITION,
            playing
              ? FILM_ROW_ACTION_HELD
              : cn(
                  FILM_ROW_ACTION_ON_REACH,
                  "has-[[aria-expanded=true]]:opacity-100",
                ),
          )}
        >
          {operations ? (
            <PointMenu
              point={point}
              number={number}
              edit={edit}
              operations={operations}
              menu={tone}
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
              // The glyph answers THIS click (`label-check-in`, globals.css):
              // the mark is set here, on the element, and by nothing else —
              // so a row that mounts already checked plays nothing, and the
              // memoised row takes no state or prop for it.
              if (checked) delete event.currentTarget.dataset.justChecked;
              else event.currentTarget.dataset.justChecked = "";
              operations?.onSetChecked(point.id, !checked);
            }}
            className={cn(
              "flex size-[22px] items-center justify-center rounded-[var(--radius-button)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
              RAIL_PRESS,
              operations && "cursor-pointer",
              checked
                ? "text-[var(--success)]"
                : playing
                  ? "text-white/50"
                  : "text-white/[0.22] group-hover/row:text-white/50",
              operations && !checked && "hover:text-white",
            )}
          >
            <Check
              className="label-check-in size-3.5"
              strokeWidth={2.2}
              aria-hidden="true"
            />
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

      {open ? <div data-shots-for={point.id}>{children}</div> : null}
    </>
  );
});

/** The second line's ink — the frame's `.bk-d`. */
const DETAIL_INK = railInk(0.45);
/** The score before the point — the frame's `.bk-sc`. */
const SCORE_INK = railInk(0.85);

// ── A new point ────────────────────────────────────────────────────────────

const NEW_POINT_TITLE = "New point";
const NEW_POINT_DETAIL = "Set who won, then add its shots";

/**
 * A point the labeller added and has not touched since: no winner and no
 * live stroke. The frame's "New point" row (board 08m §5) — a "?" in a blue
 * ring, the title in blue, the detail saying what to do next. Setting the
 * winner or adding a stroke makes it an ordinary row.
 */
function isNewPoint(
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
function newPointDetail(
  point: Pick<LabelPoint, "id">,
  points: readonly LabelPoint[],
): string {
  const at = points.findIndex((p) => p.id === point.id);
  if (at === -1) return NEW_POINT_DETAIL;
  const live = (p: LabelPoint) =>
    p.shots.filter((shot) => shot.status !== "deleted");
  const isLive = (p: LabelPoint) => p.status !== "deleted";
  const before = points.slice(0, at).findLast(isLive);
  const after = points.slice(at + 1).find(isLive);
  const t1 = before
    ? (live(before).findLast((shot) => shot.videoTime !== null)?.videoTime ??
      null)
    : null;
  const t2 = after
    ? (live(after).find((shot) => shot.videoTime !== null)?.videoTime ?? null)
    : null;
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
  marks: LabelMarks | null | undefined,
): ReadonlyMap<string, PointSuggestion> {
  const open = new Map<string, PointSuggestion>();
  if (!marks) return open;
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
export const BlackSuggestedPoint = memo(function BlackSuggestedPoint({
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
      className={BLACK_SLOT}
    >
      <Plus
        className="size-3"
        style={{ color: AMBER_SLOT_ICON_INK }}
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
          <BlackTextAction
            ink="amber"
            data-point-suggestion-add=""
            aria-label={`Add a point between points ${a} and ${b}`}
            onClick={(event) => {
              event.stopPropagation();
              operations.onInsertPoint(point.id);
            }}
          >
            Add point
          </BlackTextAction>
          <BlackTextAction
            ink="quiet"
            data-point-suggestion-let=""
            aria-label={`Point ${b} was a let, replayed`}
            onClick={(event) => {
              event.stopPropagation();
              edit.onPatchPoint?.(point.id, { ending: "let_replayed" });
            }}
          >
            {b} was a let
          </BlackTextAction>
          <BlackTextAction
            ink="quiet"
            data-point-suggestion-dismiss=""
            aria-label={`Dismiss the suggested point between points ${a} and ${b}`}
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
});

// ── A game that runs over ──────────────────────────────────────────────────

/**
 * A game already won with rows still sitting in it (`game-shift.ts`): the
 * rows after the one that decided it read "Game–30", and they belong to the
 * next game. The same dashed amber slot as the suggested point, before the
 * first of them — a corner arrow on the number track, "Game {n} is already
 * won" over how many rows sit past it, and ONE answer: "Move to game {m}",
 * the console's `onShiftGameOverflow` from that first row. No Dismiss: the
 * score column keeps reading "Game–30" until the rows move, and that is the
 * cue. When the move cascades past one game, the button's tooltip says how
 * far; when a moved point's players switch with its server, it says on how
 * many. Absent on a session that cannot be written. Read off the labeller's
 * own rows, so it draws on every session — marks on or off.
 *
 * Built to fit the rail from 520px as the suggested point is: the two lines
 * truncate, the one button never shrinks or wraps.
 */
export const BlackGameOverflow = memo(function BlackGameOverflow({
  overflow,
  summary,
  point,
  edit,
}: {
  overflow: GameOverflow;
  /** `planGameShift` from the first leftover; null when it cannot be planned. */
  summary: GameShiftSummary | null;
  /** The first leftover — the row that follows the slot. */
  point: LabelPoint;
  edit: EditContext;
}) {
  const operations = edit.editable ? edit.operations : undefined;
  const count = overflow.leftovers.length;
  const gameInSet = edit.scores.get(point.id)?.gameInSet ?? null;
  const title =
    gameInSet === null
      ? "This game is already won"
      : `Game ${gameInSet} is already won`;
  const reason =
    count === 1
      ? "1 point after it belongs to the next game"
      : `${count} points after it belong to the next game`;
  const to = summary?.nextGame.gameInSet ?? (gameInSet ?? 0) + 1;
  const move = `Move to game ${to}`;
  const cascades = summary !== null && summary.games > 1;
  // What the button's tooltip warns of: a cascade past one game, and any
  // moved point whose players switch with its server (player-swap.ts).
  const details: string[] = [];
  if (summary !== null && cascades) {
    details.push(
      `Moves ${summary.points} points across ${summary.games} games`,
    );
  }
  if (summary !== null && summary.swapped > 0) {
    details.push(
      summary.swapped === 1
        ? "Players switch on 1 point"
        : `Players switch on ${summary.swapped} points`,
    );
  }
  const button = (
    <BlackTextAction
      ink="amber"
      data-game-overflow-move=""
      aria-label={`${move}: ${reason}`}
      onClick={(event) => {
        event.stopPropagation();
        operations?.onShiftGameOverflow(point.id);
      }}
    >
      {move}
    </BlackTextAction>
  );
  return (
    <div
      data-row="game-overflow"
      data-game-overflow={point.id}
      className={BLACK_SLOT}
    >
      <CornerDownRight
        className="size-3"
        style={{ color: AMBER_SLOT_ICON_INK }}
        strokeWidth={2}
        aria-hidden="true"
      />
      <span className="flex min-w-0 flex-col gap-px">
        <span
          data-game-overflow-title=""
          className="truncate text-[12px] font-medium text-white"
        >
          {title}
        </span>
        <ChromeTooltip label={reason} side="top" wrap>
          <span
            data-game-overflow-detail=""
            className="truncate text-[11px] text-white/50"
          >
            {reason}
          </span>
        </ChromeTooltip>
      </span>
      {operations ? (
        <span
          data-game-overflow-actions=""
          className="flex shrink-0 items-center justify-end"
        >
          {details.length > 0 ? (
            <ChromeTooltip
              label={move}
              detail={details.join(" · ")}
              side="top"
              align="end"
              wrap
            >
              {button}
            </ChromeTooltip>
          ) : (
            button
          )}
        </span>
      ) : null}
    </div>
  );
});

// ── A deleted point ────────────────────────────────────────────────────────

/**
 * A deleted point, in the rail: ONE quiet line on the row's own first track
 * and padding — a dash where the number was, "Deleted point" and where it
 * was on the film — with Undo always at the right edge.
 *
 * Nothing folds open: the line is the whole tombstone. A deleted point has
 * no score and no band. Undo is the console's request (`onRestorePoint`),
 * absent on a session that cannot be written.
 *
 * A tombstone with no shot rows of its own is what a combine leaves behind
 * (`isCombinedTombstone`, point-combine.ts): its line reads "Combined into
 * the point above" and offers no Undo — restoring it would bring back an
 * empty point. The way back is "Split point here" on the first moved shot.
 */
export const BlackDeletedPoint = memo(function BlackDeletedPoint({
  point,
  edit,
}: {
  point: LabelPoint;
  edit: EditContext;
}) {
  const { operations } = edit;
  const time = pointSummary(point).time;
  const combined = isCombinedTombstone(point);
  return (
    <div
      data-row="deleted-point"
      data-tombstone-id={point.id}
      data-combined={combined ? "" : undefined}
      className="grid h-[30px] grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-[10px] px-[14px]"
    >
      <span aria-hidden="true" className="mono text-[10px] text-white/25">
        –
      </span>
      <span className="min-w-0 truncate text-[11px] text-white/45">
        {combined ? "Combined into the point above" : "Deleted point"}
        {time ? <span className="text-white/35"> · {time}</span> : null}
      </span>
      {operations && !combined ? (
        <BlackUndoButton
          label={`Undo delete point ${point.pointIndex + 1}`}
          onClick={() => operations.onRestorePoint(point.id)}
        />
      ) : null}
    </div>
  );
});

// ── The winner mark ────────────────────────────────────────────────────────

/**
 * The frame's `.bk-mk`: a 30px square with the winner's initial — p1 on
 * `--blue` (its letter white on either ground: `--rail-on-accent`), p2 on a
 * white wash. Two grounds, not two hues, down the rail's own column. No
 * winner yet is the wash with a dash — or, on a point
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
          ? "bg-[var(--blue)] text-[var(--rail-on-accent)]"
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
 * The winner mark as the control that changes it — a menu in the rail's
 * tone: the two players, the current one checked; choosing the other saves
 * `{ winner }`. Read-only, it is the mark alone.
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
  // A let or a non-point keeps its winner — so counting it again restores a
  // whole point — but nobody won it: the mark steps back.
  const uncounted =
    point.ending === "let_replayed" || point.ending === "not_a_point";
  if (!edit.editable) {
    return (
      <span
        role="img"
        aria-label={name}
        className={cn("flex", uncounted && "opacity-40")}
      >
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
      data-winner-uncounted={uncounted ? "" : undefined}
      className={cn("flex", uncounted && "opacity-40")}
      onClick={(event) => event.stopPropagation()}
    >
      <FloatMenu
        open={open}
        onOpenChange={setOpen}
        align="start"
        sideOffset={8}
        width={260}
        tone={edit.tone ?? "dark"}
        label={`Who won point ${number}`}
        trigger={
          <button
            type="button"
            aria-label={name}
            aria-haspopup="menu"
            aria-expanded={open}
            className={cn(
              "cursor-pointer rounded-[var(--radius-button)] transition-shadow duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
              open &&
                "shadow-[0_0_0_1.5px_color-mix(in_oklab,var(--color-white)_50%,transparent)]",
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
