"use client";

import { Flag, Pencil } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import type {
  LabelMark,
  LabelMarkCode,
  LabelMarks,
} from "@/lib/services/labels/marks";
import {
  HINT_ACTION_LABEL,
  hintLabel,
  lastCallAction,
  markHover,
  staleEndingAction,
  removeAfterLabel,
} from "@/lib/services/labels/marks-copy";
import {
  drawsGhosts,
  endingStale,
  hoverLine,
  lastCallAnswer,
  lastLandingMissing,
  markStates,
  markTone,
  missingPointAdded,
  pointWinnerContradicted,
  pointEndedEarly,
  pointRowMarkList,
  secondServeAsFirst,
  serveAfterServeIn,
  serveInLandingOut,
  rollupMarks,
  stateHoverParts,
  type MarkHoverParts,
  type MarkState,
  type MarkTone,
} from "@/lib/services/labels/marks-state";
import { isMissedResult, type LabelPoint } from "@/lib/services/labels/session";
import {
  hintDismissKey,
  isSuggestionKey,
  pointEndedKey,
} from "@/lib/services/labels/suggestions";
import { cn } from "@/lib/utils";
import { BlackTextAction } from "./label-black-parts";
import type { SideNames } from "./label-format";
import { railInk } from "./label-rail-tone";
import type { EditContext } from "./label-row-parts";

/**
 * The rail's marks, drawn by tier (`LabelMarkTier`, marks.ts): a mark that can
 * change the score is the amber chip on the point's row (`MarkChip`), the only
 * thing the header counts; a mark about how the point ended is a word on one
 * quiet line in the open point (`PointHintLine`), some with the answers they
 * offer beside the word. These components only draw: `pointRowMarks` and
 * `pointHints` decide what, with words and states from marks-copy.ts and
 * marks-state.ts.
 */

export interface MarkChipProps {
  /** The chip's words; null for the icon-only short form. */
  text: string | null;
  count: number;
  state: MarkState;
  /** Amber for a mark that can move the score, grey for one about the data. */
  tone?: MarkTone;
  /** The accessible name: a Radix tooltip renders nothing until it opens. */
  hover: string;
  /** The tooltip's first line: the mark's name and state, or "3 to check". */
  name: string;
  /** The tooltip's second line; a line each for several marks. */
  detail?: string | readonly string[];
}

/**
 * One chip. Amber while a mark it stands for is open and can move the score;
 * grey, filled, while the open ones are only about the data (`tone`); a quiet
 * outline, and no words, once none is open. Under a 600px row (the nearest `@container`) the words
 * are not drawn and the chip is its icon, so the point's two lines keep their
 * room. Not a tab stop: a click on it is a click on its row.
 */
export function MarkChip({
  text,
  count,
  state,
  tone = "score",
  hover,
  name,
  detail,
}: MarkChipProps) {
  const quiet = state !== "open";
  const words = quiet ? null : text;
  return (
    <ChromeTooltip
      label={name}
      detail={detail}
      side="top"
      wrap={detail !== undefined}
    >
      <span
        role="img"
        data-mark-chip=""
        data-mark-state={state}
        data-mark-tone={tone}
        data-mark-count={count}
        aria-label={hover}
        className={cn(
          "inline-flex h-[18px] shrink-0 items-center gap-[5px] rounded-full px-1.5 text-[10px] font-medium whitespace-nowrap",
          quiet
            ? "bg-transparent text-white/[0.38] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-white)_14%,transparent)]"
            : tone === "data"
              ? "bg-white/[0.10] text-white/70"
              : "bg-[var(--rail-amber-wash)] text-[var(--rail-amber)]",
          words && "@min-[600px]:px-[7px]",
        )}
      >
        <Flag className="size-2.5" strokeWidth={1.8} aria-hidden="true" />
        {words ? (
          <span data-mark-text="" className="hidden @min-[600px]:inline">
            {words}
          </span>
        ) : null}
      </span>
    </ChromeTooltip>
  );
}

/** One answer a hint offers: a text action after its word. */
export interface PointHintAction {
  label: string;
  run: () => void;
}

/** One word of the open point's quiet line: a hint's label and its sentence. */
export interface PointHint {
  code: LabelMarkCode;
  /** The hint's words — `hintLabel`. */
  label: string;
  /** Its hover sentence — `markHover`, with the players' names. */
  detail: string;
  /** The answers the hint offers, when the console can write them. */
  actions: readonly PointHintAction[];
  /**
   * The stroke the hint is about, when it is one: "Point ended here" sits
   * under the stroke that ended the point and "Was the last ball in?" under
   * the last ball, not on a line away from it.
   */
  afterShotId?: string;
  /** The key Dismiss stores, for a hint the labeller can wave away. */
  dismissKey?: string;
}

/** The line's ink — the well's quiet ink, a tombstone's and a ghost line's. */
const HINT_INK = railInk(0.45);
/** The dot between two hints: a step quieter than the words it separates. */
const HINT_DOT_INK = railInk(0.25);

/**
 * The open point's quiet line: its hints by their labels, each with its
 * sentence on hover, and a hint's answers as text actions after its word
 * (`RAIL_PRESS`, through `BlackTextAction`). Counted nowhere. Drawn as the
 * last row of the shots well, under the rally it is about, it takes the
 * well's own arrival (`className` / `style`). Only the hints with nothing to
 * click and no stroke of their own are left to it: the rest are suggestion
 * rows (`BlackShotsWell`).
 */
export function PointHintLine({
  hints,
  className,
  style,
}: {
  hints: readonly PointHint[];
  className?: string;
  style?: React.CSSProperties;
}) {
  if (hints.length === 0) return null;
  return (
    <div
      data-point-hints=""
      className={cn(
        "flex h-[26px] shrink-0 items-center gap-[6px] overflow-hidden pr-[14px] pl-[44px] text-[11px] whitespace-nowrap",
        className,
      )}
      style={{ color: HINT_INK, ...style }}
    >
      {hints.map((hint, index) => (
        <span key={hint.code} className="contents">
          {index > 0 ? (
            <span aria-hidden="true" style={{ color: HINT_DOT_INK }}>
              ·
            </span>
          ) : null}
          <ChromeTooltip
            label={hint.label}
            detail={hint.detail}
            side="top"
            wrap
          >
            <span
              role="img"
              data-point-hint={hint.code}
              aria-label={hoverLine({ name: hint.label, detail: hint.detail })}
              className="min-w-0 truncate"
            >
              {hint.label}
            </span>
          </ChromeTooltip>
          {hint.actions.map((action) => (
            <BlackTextAction
              key={action.label}
              ink="quiet"
              data-point-hint-action={hint.code}
              aria-label={`${action.label}: ${hint.detail}`}
              onClick={(event) => {
                event.stopPropagation();
                action.run();
              }}
            >
              {action.label}
            </BlackTextAction>
          ))}
        </span>
      ))}
    </div>
  );
}

/**
 * The blue "Changed by you" pencil. With `reset` it is the row's Reset as well:
 * a button the size of the glyph that only asks (the console opens the
 * confirm); a click on it is not a click on its row. Without `reset` it is the
 * plain indicator, with no tooltip. Either way it is 11px wide.
 */
export function PencilMark({
  reset,
}: {
  reset?: { label: string; onClick: () => void };
} = {}) {
  const glyph = (
    <Pencil
      className="size-[11px] text-[var(--blue)]"
      strokeWidth={2}
      aria-hidden="true"
    />
  );
  if (!reset) {
    return (
      <span
        role="img"
        data-pencil=""
        aria-label="Changed by you"
        className="inline-flex"
      >
        {glyph}
      </span>
    );
  }
  return (
    <ChromeTooltip label="Changed by you" detail="Click to reset" side="top">
      <button
        type="button"
        data-pencil=""
        data-reset-pencil=""
        data-cell=""
        aria-label={reset.label}
        onClick={(event) => {
          event.stopPropagation();
          reset.onClick();
        }}
        className="inline-flex shrink-0 cursor-pointer items-center rounded-[var(--radius-button)] transition-[color,background-color,scale] duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.96] active:duration-100 motion-reduce:active:scale-100 [&>svg]:transition-colors [&>svg]:duration-200 hover:[&>svg]:text-[var(--blue-hover)]"
      >
        {glyph}
      </button>
    </ChromeTooltip>
  );
}

// ── What a row shows ───────────────────────────────────────────────────────

export interface PointRowMarks {
  flag: MarkChipProps | null;
}

/** What a chip's hover says: its accessible name and the tooltip's lines. */
type ChipHover = Pick<MarkChipProps, "hover" | "name" | "detail">;

/** A chip's hover: one mark's own lines, or `many` over a line each. */
function chipHover(parts: readonly MarkHoverParts[], many: string): ChipHover {
  const said = new Set<string>();
  const unique = parts.filter((part) => {
    const line = hoverLine(part);
    if (said.has(line)) return false;
    said.add(line);
    return true;
  });
  if (unique.length === 1) {
    const [only] = unique;
    return {
      hover: hoverLine(only),
      name: only.name,
      detail: only.detail ?? undefined,
    };
  }
  return {
    hover: `${many}. ${unique.map(hoverLine).join(" ")}`,
    name: many,
    detail: unique.map((part) =>
      part.detail ? `${part.name} — ${part.detail}` : part.name,
    ),
  };
}

/**
 * What the point row draws of its marks: `rollupMarks` over the point's `count`
 * marks (`pointRowMarkList`), or null when the session has no marks. `point` is
 * the row as stored, ghosts and all; `sentence` is the point as the row reads
 * it; `points` lets a "Same side twice" question read settled once a point was
 * added between the two.
 */
export function pointRowMarks(
  point: LabelPoint,
  marks: LabelMarks | null | undefined,
  names: SideNames,
  sentence: string,
  points: readonly LabelPoint[],
): PointRowMarks | null {
  if (!marks) return null;
  const { count } = pointRowMarkList(point, marks);
  const states = markStates(count, point, marks.suggestions, points);
  const pointAdded = missingPointAdded(point, marks.suggestions, points);
  const chip = rollupMarks(
    count,
    states,
    count.map((mark) => markTone(mark, point, marks.suggestions)),
  );
  // Nothing counted is open: the row speaks for its hints instead, as a grey
  // chip, until the point is checked. They were words on the open point's
  // line alone, so a closed row with only data to fix looked finished.
  if (!chip || chip.state !== "open") {
    // A winner the strokes contradict is the score, not data: its chip is
    // amber and outlasts the point being checked.
    const contradicted = pointWinnerContradicted(point, marks);
    const data =
      point.checkedAt === null || contradicted
        ? dataChip(point, marks, names, contradicted)
        : null;
    if (data) return { flag: data };
  }
  if (!chip) return { flag: null };

  const members = count.map((mark, i) => ({ mark, state: states[i] }));
  const open = members.filter((m) => m.state === "open");
  return {
    flag: {
      ...chip,
      ...chipHover(
        (open.length > 0 ? open : members).map((m) =>
          stateHoverParts(m.mark, m.state, names, sentence, pointAdded),
        ),
        // Several still open are the chip's own words, "3 to check".
        chip.text ?? "Nothing left to check",
      ),
    },
  };
}

/**
 * The grey chip of a closed row: the point's hints (`pointHints`, the marks'
 * own and the ones read off the rows), one by its own words, several as
 * "N data". Null with none.
 */
function dataChip(
  point: LabelPoint,
  marks: LabelMarks,
  names: SideNames,
  contradicted = false,
): MarkChipProps | null {
  const every = pointHints(point, marks, names);
  // Checked, only the contradicted winner is still a question.
  const hints =
    point.checkedAt === null
      ? every
      : every.filter((hint) => hint.code === "ending_stale");
  if (hints.length === 0) return null;
  const text = hints.length === 1 ? hints[0].label : `${hints.length} data`;
  return {
    text,
    count: hints.length,
    state: "open",
    tone: contradicted ? "score" : "data",
    ...chipHover(
      hints.map((hint) => ({ name: hint.label, detail: hint.detail })),
      text,
    ),
  };
}

/**
 * What a hint's answers write through. `onRemoveShotsAfter` drops the live
 * strokes after one of the point's shots — "Point ended here"'s "Remove N".
 */
export type HintEdit = Pick<
  EditContext,
  "onPatchPoint" | "onPatchShot" | "onRemoveShotsAfter" | "operations"
>;

/**
 * The open point's hints: the marks' own, then the six read off the rows —
 * "Point ended here", "Different ending?", "Second serve?", "No landing on
 * the last shot" and "Serve after a serve in play". Each carries its answers
 * when `edit` can write them (`hintActions`). Nothing without marks: a
 * session labelled blind reads none of these, and its ghosts are strokes,
 * which is why `ghosts` is true here.
 */
export function pointHints(
  point: LabelPoint,
  marks: LabelMarks | null | undefined,
  names: SideNames,
  edit?: HintEdit,
): PointHint[] {
  if (!marks) return [];
  const ghosts = drawsGhosts(marks);
  const live: (LabelMark | null)[] = [
    pointEndedEarly(point, ghosts),
    endingStale(point, ghosts),
    secondServeAsFirst(point, ghosts),
    lastLandingMissing(point, ghosts),
    serveAfterServeIn(point, ghosts),
    serveInLandingOut(point, ghosts),
  ];
  const { hints: own, count } = pointRowMarkList(point, marks);
  // "Was the last ball in?" is a chip; its answer is offered on this line
  // until the labeller changes the last ball's result.
  const lastCall = lastCallAnswer(point, count, ghosts);
  const hints = [
    ...(lastCall ? [lastCall.mark] : []),
    // "Net or out?" asks about the same last ball; with that answer on the
    // line it is one question too many.
    ...(lastCall
      ? own.filter((mark) => mark.code !== "net_hit_contradicts_height")
      : own),
    ...live.filter((mark): mark is LabelMark => mark !== null),
  ];
  return hints.flatMap((mark) => {
    // "Point ended here" is a suggestion: once dismissed it is not drawn.
    const ended =
      mark.code === "shot_after_point_end" ? mark.params.shotId : undefined;
    const key = ended ? pointEndedKey(ended) : undefined;
    // A draft stroke has no id to store yet: no Dismiss until it lands.
    const actions = hintActions(mark, point, edit, lastCall?.shotId);
    const afterShotId = ended ?? hintShotId(mark, lastCall?.shotId);
    // Every hint drawn as a question (a row of its own: one with an answer,
    // or about one stroke) can be answered "no": Dismiss stores its code.
    const asked = actions.length > 0 || afterShotId !== undefined;
    const candidate = key ?? (asked ? hintDismissKey(mark.code) : undefined);
    const dismissKey =
      candidate && isSuggestionKey(candidate) ? candidate : undefined;
    if (dismissKey && point.dismissed.includes(dismissKey)) return [];
    return [
      {
        code: mark.code,
        label: hintLabel(mark, names),
        detail: markHover(mark, names),
        actions,
        afterShotId,
        dismissKey,
      },
    ];
  });
}

/** The stroke a hint asks about, for the hints that name one. */
function hintShotId(
  mark: LabelMark,
  lastCallShotId?: string,
): string | undefined {
  switch (mark.code) {
    case "last_call_overruled":
      return lastCallShotId;
    case "second_serve_as_first":
    case "serve_after_serve_in":
    case "serve_in_landing_out":
      return mark.params.shotId;
    default:
      return undefined;
  }
}

/**
 * A hint's answers, each only where the console has the write for it: the
 * derived ending as a point patch (the winner only when the rows settle one),
 * `{ stroke: "second_serve" }` on the serve, the strokes after the out ball
 * removed, and a split at the first stroke of the second point.
 */
function hintActions(
  mark: LabelMark,
  point: LabelPoint,
  edit: HintEdit | undefined,
  lastCallShotId?: string,
): PointHintAction[] {
  if (!edit) return [];
  const { onPatchPoint, onPatchShot, onRemoveShotsAfter, operations } = edit;
  const splitAt = (label: string, shotId: string): PointHintAction[] =>
    operations
      ? [{ label, run: () => operations.onSplitPoint(point.id, shotId) }]
      : [];
  switch (mark.code) {
    case "ending_stale": {
      if (!onPatchPoint) return [];
      const { ending, endedBy, winner } = mark.params;
      return [
        {
          label: staleEndingAction(ending),
          run: () =>
            onPatchPoint(point.id, {
              ending,
              ended_by: endedBy,
              ...(winner !== null ? { winner } : {}),
            }),
        },
      ];
    }
    case "last_call_overruled": {
      if (!onPatchShot || !lastCallShotId) return [];
      const { vendorCall } = mark.params;
      return [
        {
          label: lastCallAction(vendorCall),
          run: () => onPatchShot(lastCallShotId, { result: vendorCall }),
        },
      ];
    }
    case "second_serve_as_first": {
      if (!onPatchShot) return [];
      const { shotId } = mark.params;
      return [
        {
          label: HINT_ACTION_LABEL.second_serve_as_first,
          run: () => onPatchShot(shotId, { stroke: "second_serve" }),
        },
      ];
    }
    case "shot_after_point_end": {
      const { shotId, after } = mark.params;
      // Yes: the ball is out as stored, not only by its landing. Marking it
      // out takes the stroke after it in the same write (operations.ts
      // `deadBallsAfterMiss`) and settles the ending; one stored as a miss
      // already has only the stroke after it left to go.
      const stored = point.shots.find((shot) => shot.id === shotId)?.result;
      const marksOut = onPatchShot && !isMissedResult(stored);
      return [
        ...(onRemoveShotsAfter
          ? [
              {
                label: removeAfterLabel(after.length),
                run: () =>
                  marksOut
                    ? onPatchShot(shotId, { result: "out" })
                    : onRemoveShotsAfter(point.id, shotId),
              },
            ]
          : []),
        // Split also answers the question for good: the strokes after go to
        // a new point, so nothing after this one is left to say it was seen.
        ...(operations
          ? [
              {
                label: HINT_ACTION_LABEL.shot_after_point_end,
                run: () => {
                  const key = pointEndedKey(shotId);
                  if (isSuggestionKey(key)) {
                    operations.onDismissSuggestion(point.id, key);
                  }
                  operations.onSplitPoint(point.id, after[0]);
                },
              },
            ]
          : []),
      ];
    }
    case "serve_after_serve_in":
      return splitAt(
        HINT_ACTION_LABEL.serve_after_serve_in,
        mark.params.shotId,
      );
    default:
      return [];
  }
}
