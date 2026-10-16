"use client";

import { useState } from "react";
import { Flag, Pencil } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import type {
  LabelMark,
  LabelMarkCode,
  LabelMarks,
} from "@/lib/services/labels/marks";
import {
  clearedByLabel,
  HINT_ACTION_LABEL,
  hintLabel,
  LAST_BALL_IN_LABEL,
  lastCallAction,
  LOOKS_RIGHT_LABEL,
  markHover,
  ownedEndingPhrase,
  PLACE_BOUNCE_LABEL,
  REVIEW_BLOCK_TITLE,
  REVIEW_DISMISS_LABEL,
  reviewPointerLine,
  reviewThenLine,
  staleEndingAction,
  removeAfterLabel,
} from "@/lib/services/labels/marks-copy";
import {
  drawsGhosts,
  endingStale,
  hoverLine,
  lastCallAnswer,
  lastLandingMissing,
  missingPointAdded,
  pointEndedEarly,
  pointRowMarkList,
  reviewChip,
  reviewFlag,
  reviewItemQuestion,
  secondServeAsFirst,
  serveAfterServeIn,
  serveInLandingOut,
  stateHoverParts,
  type MarkState,
  type MarkTone,
  type ReviewItem,
} from "@/lib/services/labels/marks-state";
import {
  reviewBlockRows,
  reviewItemPointer,
  wellShotNumbers,
} from "@/lib/services/labels/review-block";
import {
  isMissedResult,
  liveShotsInOrder,
  type LabelPoint,
} from "@/lib/services/labels/session";
import {
  hintDismissKey,
  isSuggestionKey,
  pointEndedKey,
} from "@/lib/services/labels/suggestions";
import { cn } from "@/lib/utils";
import { pointSentence } from "./label-black-format";
import { BlackTextAction } from "./label-black-parts";
import type { SideNames } from "./label-format";
import { railInk } from "./label-rail-tone";
import type { EditContext, LabelRowOperations } from "./label-row-parts";

/**
 * The rail's marks: a point's review flag (`reviewFlag`, marks-state.ts) is
 * the one chip on its row (`MarkChip`) — amber when it can move the score,
 * grey when it is about the data — and the open point asks the same flag in
 * its well as a review block (`ReviewBlock`), item by item with the answers
 * each offers. These components only draw: `pointRowMarks`, `pointHints`,
 * `reviewItemAnswers` and review-block.ts decide what, with words and states
 * from marks-copy.ts and marks-state.ts.
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
  /** The tooltip's first line: the chip's words, or a quiet mark's state. */
  name: string;
  /** The tooltip's second line; a line each for several items or marks. */
  detail?: string | readonly string[];
}

/**
 * One chip. Amber while its flag is open and can move the score; grey,
 * filled, while it is only about the data (`tone`); a quiet outline, and no
 * words, once nothing on it is open. Under a 600px row (the nearest
 * `@container`) the words are not drawn and the chip is its icon, so the
 * point's two lines keep their room. Not a tab stop: a click on it is a click
 * on its row.
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

/** One hint of the open point: its label, its sentence and its answers. */
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
   * under the stroke that ended the point, "Second serve?" under its serve,
   * not on a line away from it. "Was the last ball in?" names none: the
   * review block asks it as item 4.
   */
  afterShotId?: string;
  /** The key Dismiss stores, for a hint the labeller can wave away. */
  dismissKey?: string;
}

/** The block's quiet ink: its title and an item's evidence lines. */
const EVIDENCE_INK = railInk(0.45);
/** The "Then:" line, a step above the evidence. */
const THEN_INK = railInk(0.5);
/** A collapsed row's words and number. */
const DONE_INK = railInk(0.3);

/**
 * What the block's answers write through: the hint writes, the console's
 * stroke selection (item 4's "Place the bounce") and its check tick (the
 * header's "Looks right", `operations.onSetChecked`).
 */
export type ReviewEdit = HintEdit & Pick<EditContext, "onSelectShot">;

/** Item 4's "Then:" line: the ending the strokes add up to, and its write. */
interface ReviewThen {
  phrase: string;
  action: PointHintAction | null;
}

/**
 * An open item's answers, each only where the console has the write. Item 4
 * asked as the vendor called the last ball ("Was the last ball out?") is
 * "Yes, make it out" (`lastCallAction`'s patch), "It was in" (a shot patch,
 * when the call was not in already) and "Place the bounce" (selects the
 * last live stroke on the court's landing end); with no landing on the last
 * stroke instead, it leads with "Place the bounce". Every other item is
 * answered at its stroke or not at all here: the block adds no second copy
 * of a stroke row's answers.
 */
export function reviewItemAnswers(
  item: ReviewItem,
  point: LabelPoint,
  marks: LabelMarks,
  edit: ReviewEdit | undefined,
): PointHintAction[] {
  if (!edit || item.id !== 4) return [];
  const asks = (code: LabelMarkCode) =>
    item.members.some(
      (member) => member.mark.code === code && member.state === "open",
    );
  const ghosts = drawsGhosts(marks);
  const last = liveShotsInOrder(point, ghosts).at(-1);
  const { onPatchShot, onSelectShot } = edit;
  const placeBounce: PointHintAction[] =
    onSelectShot && last
      ? [
          {
            label: PLACE_BOUNCE_LABEL,
            run: () => onSelectShot(last.id, "landing"),
          },
        ]
      : [];
  const lastCall = asks("last_call_overruled")
    ? lastCallAnswer(point, pointRowMarkList(point, marks).count, ghosts)
    : null;
  if (lastCall) {
    const { vendorCall } = lastCall.mark.params;
    const patch = (result: "in" | "out" | "net") => () =>
      onPatchShot?.(lastCall.shotId, { result });
    return [
      ...(onPatchShot
        ? [{ label: lastCallAction(vendorCall), run: patch(vendorCall) }]
        : []),
      ...(onPatchShot && vendorCall !== "in"
        ? [{ label: LAST_BALL_IN_LABEL, run: patch("in") }]
        : []),
      ...placeBounce,
    ];
  }
  return asks("last_landing_missing") ? placeBounce : [];
}

/**
 * Item 4's "Then:" line, while "Different ending?" is open under it: the
 * ending the strokes add up to (`ownedEndingPhrase`) with its one answer,
 * `staleEndingAction`'s point patch (`hintActions`). Never an item of its
 * own: it is what the last ball's answer leads to.
 */
function reviewThen(
  item: ReviewItem,
  point: LabelPoint,
  names: SideNames,
  edit: ReviewEdit | undefined,
): ReviewThen | null {
  if (item.id !== 4) return null;
  for (const { mark, state } of item.members) {
    if (mark.code !== "ending_stale" || state !== "open") continue;
    const { ending, endedBy, winner } = mark.params;
    return {
      phrase: ownedEndingPhrase(ending, endedBy, winner, names),
      action: hintActions(mark, point, edit)[0] ?? null,
    };
  }
  return null;
}

/**
 * An item's Dismiss: every member's stored key (`ReviewMember.dismissKey`),
 * each said once, through `onDismissSuggestion` — one call a key. Null when
 * no member has one ("Missing shot?" is dismissed at its slot) or the console
 * cannot write.
 */
export function reviewItemDismiss(
  item: ReviewItem,
  point: Pick<LabelPoint, "id">,
  operations: LabelRowOperations | undefined,
): PointHintAction | null {
  const keys = [
    ...new Set(
      item.members
        .map((member) => member.dismissKey)
        .filter((key): key is string => isSuggestionKey(key)),
    ),
  ];
  if (!operations || keys.length === 0) return null;
  return {
    label: REVIEW_DISMISS_LABEL,
    run: () => {
      for (const key of keys) operations.onDismissSuggestion(point.id, key);
    },
  };
}

/**
 * The header's "Looks right": the check tick's own handler
 * (`operations.onSetChecked`), never a write of its own. Only on a point not
 * yet checked, where the console can write.
 */
export function reviewLooksRight(
  point: Pick<LabelPoint, "id" | "checkedAt">,
  operations: LabelRowOperations | undefined,
): PointHintAction | null {
  if (!operations || point.checkedAt !== null) return null;
  return {
    label: LOOKS_RIGHT_LABEL,
    run: () => operations.onSetChecked(point.id, true),
  };
}

/**
 * The open point's review block, the last row of the shots well: the
 * point's flag (`reviewFlag`) as its items in
 * the order they are answered, under a "Review · in this order" header whose
 * "Looks right" is the check tick's own write. A demoted flag draws the same
 * items with no header: the row leaves it off, the open point still asks.
 *
 * Each open item is its number, its question (`reviewItemQuestion`), its open
 * members' evidence (`markHover`, each said once), its answers
 * (`reviewItemAnswers`) and a Dismiss that stores every member's key. An item
 * that lives on its strokes (`reviewItemPointer`) is one pointer line to the
 * stroke instead: its suggestion row there keeps its answers. Items answered
 * while the point is open collapse to what became of them
 * (`stateHoverParts`), and items an answer took away to "Cleared by N"
 * (`reviewBlockRows`), against the items as they stood when the well opened —
 * held from the first render, since the well mounts as the point opens.
 * Nothing at all when no item is open now and none was then.
 */
export function ReviewBlock({
  point,
  marks,
  edit,
  className,
  style,
}: {
  point: LabelPoint;
  marks: LabelMarks;
  edit: EditContext;
  className?: string;
  style?: React.CSSProperties;
}) {
  const flag = reviewFlag(point, marks, edit.points);
  const [previous] = useState(() => flag?.items ?? null);
  const isOpen = (items: readonly ReviewItem[] | null | undefined) =>
    items?.some((item) => item.state === "open") ?? false;
  if (!isOpen(flag?.items) && !isOpen(previous)) return null;
  const { names } = edit;
  const writes = edit.editable ? edit : undefined;
  const operations = writes?.operations;
  const rows = reviewBlockRows(previous, flag);
  const numbers = wellShotNumbers(point, drawsGhosts(marks));
  const sentence = pointSentence(point, names);
  const pointAdded = missingPointAdded(point, marks.suggestions, edit.points);
  const looksRight = reviewLooksRight(point, operations);
  return (
    <div
      data-review-block=""
      data-review-demoted={flag?.demoted ? "" : undefined}
      className={cn(
        "mx-[10px] my-[6px] flex shrink-0 cursor-default flex-col rounded-[6px] bg-[var(--rail-amber-wash-faint)] px-[10px] py-[8px]",
        className,
      )}
      style={style}
    >
      {flag?.demoted ? null : (
        <div
          data-review-header=""
          className="flex h-[18px] items-center justify-between gap-3"
        >
          <span
            className="text-[10px] font-medium tracking-[1.5px] uppercase"
            style={{ color: EVIDENCE_INK }}
          >
            {REVIEW_BLOCK_TITLE}
          </span>
          {looksRight ? (
            <BlackTextAction
              ink="quiet"
              data-review-looks-right=""
              onClick={(event) => {
                event.stopPropagation();
                looksRight.run();
              }}
            >
              {looksRight.label}
            </BlackTextAction>
          ) : null}
        </div>
      )}
      {rows.map((row, index) => {
        const { item } = row;
        const question = reviewItemQuestion(item);
        const rule = index > 0 || !flag?.demoted;
        const numberInk =
          row.display !== "open"
            ? DONE_INK
            : item.tone === "score"
              ? "var(--rail-amber)"
              : EVIDENCE_INK;
        const number = (
          <span
            aria-hidden="true"
            className="mono tabular pt-px text-[11px] leading-[16px]"
            style={{ color: numberInk }}
          >
            {row.id}
          </span>
        );
        const frame = cn(
          "grid grid-cols-[16px_1fr] gap-x-[6px] py-[6px]",
          rule &&
            "shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-white)_6%,transparent)]",
        );
        if (row.display !== "open") {
          const member =
            item.members.find((m) => m.state === item.state) ?? item.members[0];
          const parts = stateHoverParts(
            member.mark,
            member.state,
            names,
            sentence,
            pointAdded,
          );
          const words =
            row.display === "done"
              ? `✓ ${parts.detail ?? parts.name}`
              : `– ${question} ${clearedByLabel(row.clearedBy)}`;
          return (
            <div
              key={row.id}
              data-review-item={row.id}
              data-review-state={row.display}
              className={frame}
            >
              {number}
              <span
                className="min-w-0 truncate text-[11px] leading-[16px]"
                style={{ color: DONE_INK }}
              >
                {words}
              </span>
            </div>
          );
        }
        const shot = reviewItemPointer(item, point, marks, numbers);
        if (shot !== null) {
          const line = reviewPointerLine(row.id, question, shot);
          return (
            <div
              key={row.id}
              data-review-item={row.id}
              data-review-state="pointer"
              aria-label={line}
              className={frame}
            >
              {number}
              <span className="min-w-0 truncate text-[12px] leading-[16px] text-white/[0.92]">
                {question}
                <span style={{ color: EVIDENCE_INK }}> — at shot {shot}</span>
              </span>
            </div>
          );
        }
        const evidence = [
          ...new Set(
            item.members
              .filter((member) => member.state === "open")
              .map((member) => markHover(member.mark, names)),
          ),
        ];
        const answers = reviewItemAnswers(item, point, marks, writes);
        const then = reviewThen(item, point, names, writes);
        const dismiss = reviewItemDismiss(item, point, operations);
        return (
          <div
            key={row.id}
            data-review-item={row.id}
            data-review-state="open"
            className={frame}
          >
            {number}
            <div className="flex min-w-0 flex-col gap-[3px]">
              <span className="text-[12px] leading-[16px] text-white/[0.92]">
                {question}
              </span>
              {evidence.map((line) => (
                <span
                  key={line}
                  data-review-evidence=""
                  className="text-[11px] leading-[15px]"
                  style={{ color: EVIDENCE_INK }}
                >
                  {line}
                </span>
              ))}
              {answers.length > 0 || dismiss ? (
                <span
                  data-review-answers=""
                  className="-ml-1 flex flex-wrap items-center gap-x-[10px]"
                >
                  {answers.map((answer, i) => (
                    <BlackTextAction
                      key={answer.label}
                      ink={i === 0 ? "amber" : "quiet"}
                      data-review-answer={row.id}
                      aria-label={`${answer.label}: ${question}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        answer.run();
                      }}
                    >
                      {answer.label}
                    </BlackTextAction>
                  ))}
                  {dismiss ? (
                    <BlackTextAction
                      ink="muted"
                      data-review-dismiss={row.id}
                      aria-label={`${dismiss.label}: ${question}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        dismiss.run();
                      }}
                    >
                      {dismiss.label}
                    </BlackTextAction>
                  ) : null}
                </span>
              ) : null}
              {then ? (
                <span
                  data-review-then=""
                  className="-ml-1 flex flex-wrap items-center gap-x-[10px] text-[11px] leading-[16px]"
                  style={{ color: THEN_INK }}
                >
                  <span className="px-1">{reviewThenLine(then.phrase)}</span>
                  {then.action ? (
                    <BlackTextAction
                      ink="quiet"
                      data-review-then-action=""
                      aria-label={`${then.action.label}: ${reviewThenLine(then.phrase)}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        then.action!.run();
                      }}
                    >
                      {then.action.label}
                    </BlackTextAction>
                  ) : null}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
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

/** A hover's two parts, with the accessible name as `hoverLine` reads them. */
function chipHover(name: string, lines: readonly string[]): ChipHover {
  const detail =
    lines.length === 0 ? undefined : lines.length === 1 ? lines[0] : lines;
  return {
    hover: hoverLine({ name, detail: lines.length ? lines.join(" ") : null }),
    name,
    detail,
  };
}

/** `lines` with each said once, in order. */
const once = (lines: readonly string[]) => [...new Set(lines)];

/**
 * What the point row draws of its review flag (`reviewFlag`, through
 * `reviewChip`), or null when the session has no marks. `point` is the row as
 * stored, ghosts and all; `sentence` is the point as the row reads it;
 * `points` lets a "Same side twice" question read settled once a point was
 * added between the two.
 *
 * The hover's name is the chip's words. One open item has its open members'
 * evidence under it, a line each; several are "N · question", one line an
 * item. With nothing open, the members say what became of them
 * (`stateHoverParts`).
 */
export function pointRowMarks(
  point: LabelPoint,
  marks: LabelMarks | null | undefined,
  names: SideNames,
  sentence: string,
  points: readonly LabelPoint[],
): PointRowMarks | null {
  if (!marks) return null;
  const flag = reviewFlag(point, marks, points);
  const chip = flag ? reviewChip(flag) : null;
  if (!flag || !chip) return { flag: null };
  const { open, text, ...drawn } = chip;
  let hover: ChipHover;
  if (text !== null && open.length === 1) {
    const [item] = open;
    hover = chipHover(
      text,
      once(
        item.members
          .filter((member) => member.state === "open")
          .map((member) => markHover(member.mark, names)),
      ),
    );
  } else if (text !== null) {
    hover = chipHover(
      text,
      open.map((item) => `${item.id} · ${reviewItemQuestion(item)}`),
    );
  } else {
    const pointAdded = missingPointAdded(point, marks.suggestions, points);
    const parts = flag.items.flatMap((item) =>
      item.members.map((member) =>
        stateHoverParts(member.mark, member.state, names, sentence, pointAdded),
      ),
    );
    const lines = once(parts.map(hoverLine));
    hover =
      lines.length === 1
        ? {
            hover: lines[0],
            name: parts[0].name,
            detail: parts[0].detail ?? undefined,
          }
        : chipHover(
            "Nothing left to check",
            once(
              parts.map((part) =>
                part.detail ? `${part.name} — ${part.detail}` : part.name,
              ),
            ),
          );
  }
  return { flag: { ...drawn, text, ...hover } };
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
  // "Was the last ball in?" is a counted mark; its answer is offered (in the
  // review block) until the labeller changes the last ball's result.
  const lastCall = lastCallAnswer(point, count, ghosts);
  const hints = [
    ...(lastCall ? [lastCall.mark] : []),
    // "Net or out?" asks about the same last ball; with that answer offered
    // it is one question too many.
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
    const afterShotId = ended ?? hintShotId(mark);
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
function hintShotId(mark: LabelMark): string | undefined {
  switch (mark.code) {
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
