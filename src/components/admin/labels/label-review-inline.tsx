"use client";

import {
  reviewItemThenLabel,
  type ReviewStep,
} from "@/lib/services/labels/review-step";
import {
  isLiveShot,
  type LabelPoint,
  type LabelShot,
} from "@/lib/services/labels/session";
import { cn } from "@/lib/utils";
import type { PlacementState } from "./court-placement";

/**
 * The review step, noted in the rail: one quiet line under the stroke row the
 * step is about (`inlineReviewAnchor`) saying what to fix — "Place the last
 * bounce", "Add the missing shot" — with "n of m" when the point has several. No question block, no answers and no
 * court of its own: the step's stroke end is placed on the left court panel,
 * which arms for it, and every other fix is the row's own editing (stroke
 * keys, the winner, the menu). `]` / `[` still walk the flags, a placement
 * still advances to the next one, and Enter still checks the point.
 *
 * Settled 2026-10-19 after #489 drew a compact court and named answers in
 * every flagged row: the labeller wanted the court once, beside the film, and
 * only a note of what is wrong in the rows (canvas option C).
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

/** What a note says: the end to place, else what the step's item asks. */
export function reviewNoteText(
  step: ReviewStep | null,
  placement: PlacementState,
  strokeId: string | null,
): string | null {
  const placing = strokeId !== null && placement.shotId === strokeId;
  const ownStep = step !== null && step.target.shotId === strokeId;
  if (placing && (!ownStep || step?.target.place)) {
    return placement.target === "contact"
      ? "Place where it was hit"
      : "Place where it landed";
  }
  if (!step) return null;
  const fix = reviewItemThenLabel(step.item);
  return fix.charAt(0).toUpperCase() + fix.slice(1);
}

/** The one-line note under the flagged stroke. */
export function ReviewNote({
  step,
  anchor,
  placement,
  count,
}: {
  step: ReviewStep | null;
  anchor: InlineReviewAnchor;
  placement: PlacementState;
  count: { index: number; total: number } | null;
}) {
  const note = reviewNoteText(step, placement, anchor.strokeId);
  if (!note) return null;
  const score = step?.item.tone === "score";
  return (
    <div
      data-review-inline={step ? step.item.id : "placing"}
      data-review-inline-shot={anchor.strokeId ?? undefined}
      data-review-inline-tone={step?.item.tone}
      className="flex items-center gap-2 px-[14px] py-1.5"
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
          score
            ? "bg-[var(--rail-amber-wash)] text-[var(--rail-amber)]"
            : "bg-white/[0.08] text-white/80",
        )}
      >
        <span aria-hidden="true">●</span>
        {note}
      </span>
      {count && count.total > 1 ? (
        <span className="font-mono text-[11px] text-white/45">
          {count.index} of {count.total}
        </span>
      ) : null}
    </div>
  );
}
