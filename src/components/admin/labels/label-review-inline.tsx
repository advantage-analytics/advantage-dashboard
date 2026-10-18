"use client";

import { Checkbox } from "@/components/ui/checkbox";
import {
  REVIEW_STEP_QUESTION,
  reviewItemThenLabel,
  type ReviewAnswer,
  type ReviewAnswerKind,
  type ReviewStep,
} from "@/lib/services/labels/review-step";
import {
  isLiveShot,
  liveShotsInOrder,
  type LabelPoint,
  type LabelShot,
} from "@/lib/services/labels/session";
import { cn } from "@/lib/utils";
import { behindBaseline, type CourtPoint } from "./court-geometry";
import {
  courtSlide,
  isEstimate,
  placementPrompt,
  type PlacementState,
  type PlacementTarget,
} from "./court-placement";
import { BlackTextAction, type BlackTextActionInk } from "./label-black-parts";
import { LabelCourt, type CourtStroke } from "./label-court";
import {
  CourtEndControls,
  TARGET_WORD,
  shankReadout,
} from "./label-court-panel";
import type { SideNames } from "./label-format";

/**
 * The review step, asked in the rail: one block under the stroke row the
 * step is about (`inlineReviewAnchor`), with the question and its answers on
 * the left and a compact court on the right — the same `LabelCourt` the panel
 * draws, with its zoom, drag, the shank slide, the deep run-off guides and
 * the estimate ring — showing that one stroke and placing on the step's end.
 * The left court panel follows the film meanwhile; this is the one placement
 * surface while it is open.
 *
 * Two shapes, one block:
 *
 * - **A step** (`step`): its question with "n of m", the end being placed and
 *   whose side is on screen, the named answers as text actions (the reading
 *   the data supports amber, Dismiss quiet), "Off screen, so this is an
 *   estimate" while placing, and what comes after ("Then: …").
 * - **A stroke being placed with no step about it** — the shot an answer just
 *   added, selected on its contact: the placement question alone
 *   (`REVIEW_STEP_QUESTION`), no answers, and the step still open as "Then:".
 *
 * It paints a quiet wash band on the well, never a card inside the rail's
 * card, and no stripe. Rail inks: `--color-white` is the tone's ink.
 */

// ── The count ───────────────────────────────────────────────────────────────

/** The count a point's review opened with: its id and its open items then. */
export interface OpenedCount {
  pointId: string | null;
  total: number;
}

export const NO_OPENED_COUNT: OpenedCount = { pointId: null, total: 0 };

/**
 * The count to keep after this render: the step's total when the point is a
 * new one (or more is open than it opened with), else what it opened with.
 * No step: nothing kept, so coming back to a point counts it afresh.
 */
export function openedCount(
  kept: OpenedCount,
  pointId: string | null,
  step: Pick<ReviewStep, "total"> | null,
): OpenedCount {
  if (!step) return kept.pointId === null ? kept : NO_OPENED_COUNT;
  if (kept.pointId !== pointId || step.total > kept.total) {
    return { pointId, total: step.total };
  }
  return kept;
}

/**
 * "n of m" against the count the point opened with: the items answered so
 * far plus one, of that count — answering moves 1 of 2 to 2 of 2.
 */
export function stepCount(
  opened: OpenedCount,
  step: Pick<ReviewStep, "total">,
): { index: number; total: number } {
  const total = Math.max(opened.total, step.total);
  return { index: total - step.total + 1, total };
}

// ── Where the block sits ────────────────────────────────────────────────────

/** Where the block sits in the well, and what it is about. */
export interface InlineReviewAnchor {
  /** The stroke whose row it sits under; null puts it at the well's end. */
  shotId: string | null;
  /** The stroke the court shows and places; null for a step with no stroke. */
  strokeId: string | null;
}

/** A stroke the labeller added that still lacks its contact or its landing. */
function addedAndUnplaced(
  shot: Pick<
    LabelShot,
    "status" | "contactX" | "contactY" | "landingX" | "landingY"
  >,
): boolean {
  if (shot.status !== "added") return false;
  const contact = shot.contactX !== null && shot.contactY !== null;
  const landing = shot.landingX !== null && shot.landingY !== null;
  return !contact || !landing;
}

/**
 * Where the open point's review block goes, in review mode. A stroke just
 * added and not yet placed comes first (`addedAndUnplaced`): the court opens
 * on it, contact first. Otherwise, with a step, its own target wins: under the stroke the step names (for a missing-shot slot,
 * the stroke the slot follows), or at the well's end for a step about no
 * stroke — a winner pick, the game order — whatever is still selected, so
 * the stroke the last answer placed cannot keep the block on itself and the
 * point-level question unanswerable. With no step, under the selected stroke
 * while that is one of the point's live strokes (the one an answer just
 * added — selected on its contact once saved, so the court follows it).
 * Null with nothing to ask and nothing selected: no block.
 */
export function inlineReviewAnchor(
  point: LabelPoint,
  step: ReviewStep | null,
  placement: PlacementState,
  ghosts: boolean,
): InlineReviewAnchor | null {
  const selected =
    placement.shotId === null
      ? null
      : (point.shots.find(
          (shot) => shot.id === placement.shotId && isLiveShot(shot, ghosts),
        ) ?? null);
  // A stroke the labeller has just added and not yet placed both ends of is
  // the one to place next — contact first, then landing — whatever the step
  // says: "Add the shot" answered the step's question, and its new stroke
  // is what is left of it.
  if (selected && addedAndUnplaced(selected)) {
    return { shotId: selected.id, strokeId: selected.id };
  }
  if (step) return { shotId: step.target.shotId, strokeId: step.target.shotId };
  return selected ? { shotId: selected.id, strokeId: selected.id } : null;
}

// ── Copy ────────────────────────────────────────────────────────────────────

/** An answer's ink: amber for the reading the data supports, Dismiss quiet. */
export const ANSWER_INK: Record<ReviewAnswerKind, BlackTextActionInk> = {
  suggested: "amber",
  plain: "plain",
  dismiss: "quiet",
};

/** "7.1 m back · 2.4 m off centre" — a contact placed behind its baseline. */
export function contactDepthReadout(
  half: PlacementState["half"],
  contact: CourtPoint,
): string | null {
  const back = behindBaseline(half, contact.y);
  if (back <= 0) return null;
  return `${back.toFixed(1)} m back · ${Math.abs(contact.x).toFixed(1)} m off centre`;
}

/**
 * The court's one line while placing: the end and whose side is on screen —
 * "Landing · Lee’s side", "Contact · across the net" for a short ball, the
 * run-off for a deep contact.
 */
export function placingSideLine(
  placement: PlacementState,
  stroke: LabelShot,
  names: SideNames,
): string {
  const slide = courtSlide(placement, stroke);
  const hitter = stroke.hitter;
  const own = hitter ? `${names[hitter]}’s side` : "The hitter’s side";
  const other = hitter
    ? `${names[hitter === "p1" ? "p2" : "p1"]}’s side`
    : "The other side";
  const where =
    slide?.kind === "shank"
      ? "across the net"
      : slide?.kind === "deep"
        ? `${own} · run-off to ${slide.runoff} m`
        : placement.target === "contact"
          ? own
          : placement.flipped
            ? `flipped to ${hitter ? own : "the hitter’s side"}`
            : other;
  return `${TARGET_WORD[placement.target]} · ${where}`;
}

// ── The block ───────────────────────────────────────────────────────────────

export function ReviewInlineBlock({
  point,
  names,
  step,
  anchor,
  placement,
  editable,
  ghosts = true,
  count = null,
  onAnswer,
  onEstimate,
  onPlace,
  onTarget,
  onFlip,
}: {
  point: LabelPoint;
  names: SideNames;
  /** The open point's review step, or null while only placing a stroke. */
  step: ReviewStep | null;
  anchor: InlineReviewAnchor;
  placement: PlacementState;
  /** Whether a court click may write. */
  editable: boolean;
  /**
   * Whether the session draws the site's removed strokes as ghosts
   * (`drawsGhosts`): the prompt numbers the stroke as the rail does, and a
   * ghost takes no number.
   */
  ghosts?: boolean;
  /** "n of m" for the step; null draws none. */
  count?: { index: number; total: number } | null;
  /** Makes an answer's writes. Absent (read-only): the answers are not drawn. */
  onAnswer?: (answer: ReviewAnswer) => void;
  /** "Off screen, so this is an estimate" on the end being placed. */
  onEstimate?: (estimate: boolean) => void;
  onPlace: (point: CourtPoint) => void;
  onTarget: (target: PlacementTarget) => void;
  onFlip: () => void;
}) {
  const stroke =
    anchor.strokeId === null
      ? null
      : (point.shots.find(
          (shot) => shot.id === anchor.strokeId && shot.status !== "deleted",
        ) ?? null);
  const placing = editable && stroke !== null && placement.shotId === stroke.id;
  const slide = placing && stroke ? courtSlide(placement, stroke) : null;
  const index =
    stroke === null ? -1 : liveShotsInOrder(point, ghosts).indexOf(stroke);
  const prompt = placing
    ? placementPrompt(placement, index === -1 ? null : index + 1)
    : null;
  const strokes: CourtStroke[] = stroke ? [{ shot: stroke }] : [];
  const score = step?.item.tone === "score";
  // The step's question, or the placement's while a stroke with no step
  // about it is being placed (the one an answer added).
  const ownStep = step !== null && step.target.shotId === anchor.strokeId;
  const question = ownStep
    ? step.question
    : placing
      ? REVIEW_STEP_QUESTION[placement.target]
      : (step?.question ?? null);
  const then = ownStep
    ? step.then
    : step
      ? `Then: ${reviewItemThenLabel(step.item)}`
      : null;
  const answers = ownStep && onAnswer ? step.answers : [];
  const side =
    placing && stroke ? placingSideLine(placement, stroke, names) : null;
  const shank =
    slide?.kind === "shank" && !answers.some((answer) => answer.id === "short")
      ? shankReadout(stroke?.hitter ? names[stroke.hitter] : null)
      : null;
  const depth =
    placing &&
    stroke &&
    placement.target === "contact" &&
    stroke.contactX != null &&
    stroke.contactY != null
      ? contactDepthReadout(placement.half, {
          x: stroke.contactX,
          y: stroke.contactY,
        })
      : null;

  return (
    <div
      data-review-inline={ownStep ? step.item.id : "placing"}
      data-review-inline-shot={anchor.strokeId ?? undefined}
      data-review-inline-tone={step?.item.tone}
      className={cn(
        "flex items-start gap-4 px-[14px] py-3",
        score ? "bg-[var(--rail-amber-wash-faint)]" : "bg-white/[0.05]",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <span
            data-review-question=""
            className="min-w-0 text-[13px] leading-[18px] font-medium text-white"
          >
            {question}
          </span>
          {/* An added stroke being placed is still the step's question (its
              "Add the shot" answered it), so it keeps the step's count. */}
          {count ? (
            <span
              data-review-count=""
              className={cn(
                "mono tabular shrink-0 text-[11px] leading-[18px]",
                score ? "text-[var(--rail-amber)]" : "text-white/55",
              )}
            >
              {count.index} of {count.total}
            </span>
          ) : null}
        </div>
        {side ? (
          <span
            data-review-side=""
            className="truncate text-[11px] leading-4 text-white/55"
          >
            {side}
          </span>
        ) : null}
        {shank ? (
          <span
            data-review-shank=""
            className="text-[11px] leading-4 font-medium text-[var(--rail-amber)]"
          >
            {shank}
          </span>
        ) : null}
        {depth ? (
          <span
            data-review-contact-readout=""
            className="mono tabular text-[11px] leading-4 text-white/75"
          >
            {depth}
          </span>
        ) : null}
        {answers.length > 0 ? (
          <div
            data-review-answers=""
            className="-ml-1 flex flex-wrap items-start gap-x-3 gap-y-1.5"
          >
            {answers.map((answer) => (
              <span
                key={answer.id}
                className={cn(
                  "flex min-w-0 flex-col items-start gap-0.5",
                  answer.kind === "dismiss" && "ml-auto",
                )}
              >
                <BlackTextAction
                  ink={ANSWER_INK[answer.kind]}
                  data-review-answer={answer.kind}
                  data-review-answer-id={answer.id}
                  aria-label={`${answer.label}: ${step!.question}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onAnswer?.(answer);
                  }}
                >
                  {answer.label}
                </BlackTextAction>
                {answer.detail ? (
                  <span
                    data-review-detail=""
                    className="px-1 text-[10px] leading-[13px] text-white/45"
                  >
                    {answer.detail}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
        {placing && stroke && onEstimate ? (
          <label
            data-review-estimate-box=""
            className="flex min-w-0 cursor-pointer items-center gap-[7px] text-[11px] leading-4 text-white/70"
          >
            <Checkbox
              checked={isEstimate(stroke.unclear, placement.target)}
              onChange={onEstimate}
            />
            <span className="truncate">Off screen, so this is an estimate</span>
          </label>
        ) : null}
        {then ? (
          <span
            data-review-then=""
            className="text-[11px] leading-4 text-white/50"
          >
            {then}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        <span aria-live="polite" className="sr-only" data-review-prompt="">
          {prompt}
        </span>
        <div
          data-review-court=""
          className="[container-type:size] flex h-[200px] w-[250px] items-center justify-center overflow-hidden"
        >
          <LabelCourt
            strokes={strokes}
            view={placing ? placement.half : "whole"}
            slide={slide}
            targetShotId={placing ? placement.shotId : null}
            target={placing ? placement.target : null}
            prompt={prompt}
            onPlace={placing ? onPlace : undefined}
          />
        </div>
        {placing ? (
          <div className="flex h-6 items-center gap-3">
            <CourtEndControls
              placement={placement}
              onTarget={onTarget}
              onFlip={onFlip}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
