"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ArrowUpDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Kbd } from "@/components/ui/kbd";
import type {
  ReviewAnswer,
  ReviewAnswerKind,
  ReviewStep,
} from "@/lib/services/labels/review-step";
import {
  isLetServe,
  opponent,
  type LabelPoint,
  type LabelShot,
} from "@/lib/services/labels/session";
import { cn } from "@/lib/utils";
import { behindBaseline, type CourtPoint } from "./court-geometry";
import { BlackTextAction, type BlackTextActionInk } from "./label-black-parts";
import {
  courtSlide,
  isEstimate,
  placementPrompt,
  type CourtSlide,
  type PlacementState,
  type PlacementTarget,
} from "./court-placement";
import { LabelCourt, type CourtStroke } from "./label-court";
import {
  courtMarksAt,
  courtMarksKey,
  parseCourtMarksKey,
} from "./label-court-marks";
import { STROKE_LABEL, type SideNames } from "./label-format";
import { RAIL_TONE_CLASS } from "./label-rail-tone";
import { STROKE_KEY_HINTS } from "./stroke-keys";
import type { VideoClock } from "./video-clock";

/**
 * The court panel's body: the two-line readout header, the court, and the foot
 * (the Contact / Landing switch and "Flip side" while placing, the Hit / Landed
 * legend otherwise). The view owns the region's ground and outline, so this
 * body never paints its own. The court box is the court's size container
 * (`LabelCourt` scales to fit).
 *
 * - Not placing: the whole court, read-only. With nothing selected the marks
 *   follow the film as the Video tab's court does (`label-court-marks.ts`). The
 *   body subscribes to the console's `VideoClock` itself, with the marks'
 *   string key as its snapshot, so an opacity step re-renders this body and
 *   nothing else.
 * - Placing (a stroke selected, the console editable): the court zooms to the
 *   half the next click belongs on (court-placement.ts), run-off included —
 *   slid back for a deep contact, across the net for a short ball
 *   (`courtSlide`) — with "Off screen, so this is an estimate" beside the
 *   switch, which calls the end's position an estimate (`unclear`).
 * - With a stroke selected, editable or not, the court shows that stroke alone
 *   at full strength; one with no coordinates yet is a blank court.
 * - With a review step on the open point (`step`, review-step.ts
 *   `reviewStep`) the panel is two columns (layout A): the step on the left —
 *   the stroke it is about, its question and "n of m", one line of
 *   explanation, its answers as text actions and what comes after it — and
 *   the court on the right, at the same box size, with the same foot. An
 *   answer goes to `onAnswer`, which makes its writes. With no step the panel
 *   is the readout, the court and the foot alone.
 */

/** No point open: one shared empty list, so the marks memo holds. */
const NO_SHOTS: readonly LabelShot[] = [];

interface CourtReadout {
  title: string;
  subtitle: string | null;
}

/** The live strokes, in the rail's numbering (1…n). */
const liveShots = (point: LabelPoint) =>
  point.shots.filter((shot) => shot.status !== "deleted");

/** "Didn’t clear the net · error by Lee" — the short ball's readout. */
export function shankReadout(hitter: string | null): string {
  return `Didn’t clear the net${hitter ? ` · error by ${hitter}` : ""}`;
}

/** "Lee’s side · run-off to 5.5 m" — a deep contact's readout. */
function deepReadout(own: string, runoff: number): string {
  return `${own} · run-off to ${runoff} m`;
}

/**
 * The panel's two header lines. Placing: "Shot 3 · contact" over whose half is
 * on screen, or "Flipped to <hitter>'s side · Net" when Flip side has brought a
 * landing back across. Otherwise: "Point 15" over "Shot 3 of 4 · Ace" for the
 * playing stroke, or just the stroke count; "Court" with no point open. A let
 * serve, placed or lit, adds " · let" to the title. A slid box says why: the
 * short ball's "Didn’t clear the net · error by …", a deep contact's run-off.
 */
function courtReadout(
  point: LabelPoint | null,
  placement: PlacementState | null,
  litShotId: string | null,
  names: SideNames,
  slide: CourtSlide | null = null,
): CourtReadout {
  if (!point) return { title: "Court", subtitle: "No point open" };
  const live = liveShots(point);
  const numberOf = (shotId: string | null) => {
    const index = live.findIndex((shot) => shot.id === shotId);
    return index === -1 ? null : index + 1;
  };

  const placing = placement ? numberOf(placement.shotId) : null;
  if (placement && placing !== null) {
    const hitter = live[placing - 1].hitter;
    const own = hitter ? `${names[hitter]}’s side` : "The hitter’s side";
    const other = hitter
      ? `${names[opponent(hitter)]}’s side`
      : "The other side";
    const isLet = isLetServe(live[placing - 1]);
    return {
      title: `Shot ${placing} · ${placement.target}${isLet ? " · let" : ""}`,
      subtitle:
        slide?.kind === "shank"
          ? shankReadout(hitter ? names[hitter] : null)
          : slide?.kind === "deep"
            ? deepReadout(own, slide.runoff)
            : placement.target === "contact"
              ? own
              : placement.flipped
                ? `Flipped to ${hitter ? own : "the hitter’s side"} · Net`
                : other,
    };
  }

  const title = `Point ${point.pointIndex + 1}`;
  const lit = numberOf(litShotId);
  if (lit !== null) {
    const hitter = live[lit - 1].hitter;
    return {
      title: isLetServe(live[lit - 1]) ? `${title} · let` : title,
      subtitle: [`Shot ${lit} of ${live.length}`, hitter ? names[hitter] : null]
        .filter((part) => part !== null)
        .join(" · "),
    };
  }
  return {
    title,
    subtitle:
      live.length === 0
        ? "No shots"
        : `${live.length} ${live.length === 1 ? "shot" : "shots"}`,
  };
}

/** The selected stroke, if it is one of the open point's live strokes. */
function selectedStroke(
  point: LabelPoint | null,
  placement: PlacementState,
): LabelShot | null {
  if (placement.shotId === null) return null;
  return (
    point?.shots.find(
      (shot) => shot.id === placement.shotId && shot.status !== "deleted",
    ) ?? null
  );
}

/**
 * Whether the court is taking clicks: a live stroke of the open point is
 * selected and the console may write. The view draws its blue outline from
 * this, the body its zoomed half and its foot.
 */
export function isPlacing(
  point: LabelPoint | null,
  placement: PlacementState,
  editable: boolean,
): boolean {
  return editable && selectedStroke(point, placement) !== null;
}

// ── The review column ───────────────────────────────────────────────────────

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

/** An answer's ink: amber for the reading the data supports, Dismiss quiet. */
export const ANSWER_INK: Record<ReviewAnswerKind, BlackTextActionInk> = {
  suggested: "amber",
  plain: "plain",
  dismiss: "quiet",
};

/** "Shot 1 · Lee · first serve" — the stroke a step is about. */
export function stepShotLine(
  point: LabelPoint,
  shotId: string | null,
  names: SideNames,
): string | null {
  if (shotId === null) return null;
  const live = liveShots(point);
  const index = live.findIndex((shot) => shot.id === shotId);
  if (index === -1) return null;
  const shot = live[index];
  return [
    `Shot ${index + 1}`,
    shot.hitter ? names[shot.hitter] : null,
    shot.stroke ? STROKE_LABEL[shot.stroke].toLowerCase() : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

/** "7.1 m back · 2.4 m off centre" — a contact placed behind its baseline. */
export function contactDepthReadout(
  half: PlacementState["half"],
  contact: CourtPoint,
): string | null {
  const back = behindBaseline(half, contact.y);
  if (back <= 0) return null;
  return `${back.toFixed(1)} m back · ${Math.abs(contact.x).toFixed(1)} m off centre`;
}

const TARGET_WORD: Record<PlacementTarget, string> = {
  contact: "Contact",
  landing: "Landing",
};

export function LabelCourtPanel({
  point,
  names,
  placement,
  editable,
  playingShotId = null,
  step = null,
  onAnswer,
  onEstimate,
  clock,
  onPlace,
  onTarget,
  onFlip,
}: {
  /** The open point; its live strokes are the marks. Null: an empty court. */
  point: LabelPoint | null;
  names: SideNames;
  /** The selected stroke and the end and half its next click places. */
  placement: PlacementState;
  /** Whether a click may write. Read-only: always the whole court. */
  editable: boolean;
  /** The stroke on screen in the video — named in the header while nothing is selected. */
  playingShotId?: string | null;
  /** The open point's review step (`reviewStep`); null with nothing open. */
  step?: ReviewStep | null;
  /** Makes an answer's writes. Absent (read-only): the answers are not drawn. */
  onAnswer?: (answer: ReviewAnswer) => void;
  /**
   * "Off screen, so this is an estimate" on the end being placed. Absent:
   * the box is not drawn.
   */
  onEstimate?: (estimate: boolean) => void;
  /** The console's video clock (analysis seconds): what the marks follow. */
  clock: VideoClock;
  /** A click on the zoomed half, in metres. */
  onPlace: (point: CourtPoint) => void;
  onTarget: (target: PlacementTarget) => void;
  onFlip: () => void;
}) {
  const shots = point?.shots ?? NO_SHOTS;
  const selected = selectedStroke(point, placement);
  const placing = editable && selected !== null;
  const slide = placing ? courtSlide(placement, selected) : null;
  const readout = courtReadout(
    point,
    placing ? placement : null,
    placement.shotId ?? playingShotId,
    names,
    slide,
  );
  const selectedNumber =
    placing && selected ? liveShots(point!).indexOf(selected) + 1 : null;
  const prompt = placing ? placementPrompt(placement, selectedNumber) : null;
  // The court crossfades between the whole court and the zoomed half
  // (`label-court-view-in`, globals.css) only once the labeller has made it
  // switch, never for the court this panel mounted with. Latched in render.
  const [zoomAtMount] = useState(placing);
  const [zoomSwitched, setZoomSwitched] = useState(false);
  if (!zoomSwitched && placing !== zoomAtMount) setZoomSwitched(true);
  // "n of m": the count the point's review opened with, latched in render.
  const pointId = point?.id ?? null;
  const [opened, setOpened] = useState<OpenedCount>(() =>
    openedCount(NO_OPENED_COUNT, pointId, step),
  );
  const keep = openedCount(opened, pointId, step);
  if (keep !== opened) setOpened(keep);

  // The marks the film is showing right now, as a string snapshot: React
  // re-renders this body only when an opacity steps.
  const marksSnapshot = () => courtMarksKey(courtMarksAt(shots, clock.get()));
  const marksKey = useSyncExternalStore(
    clock.subscribe,
    marksSnapshot,
    marksSnapshot,
  );
  const strokes = useMemo<CourtStroke[]>(() => {
    // A selected stroke alone, at full strength; none of it yet is a blank court.
    if (placement.shotId !== null) return selected ? [{ shot: selected }] : [];
    const byId = new Map(shots.map((shot) => [shot.id, shot]));
    const out: CourtStroke[] = [];
    for (const mark of parseCourtMarksKey(marksKey)) {
      const shot = byId.get(mark.shotId);
      if (!shot) continue;
      out.push({
        shot,
        opacity: { hit: mark.contactOpacity, landed: mark.landingOpacity },
      });
    }
    return out;
  }, [placement.shotId, selected, shots, marksKey]);

  const estimate =
    placing && selected && onEstimate ? (
      <label
        data-court-estimate-box=""
        className="flex min-w-0 cursor-pointer items-center gap-[7px] text-[11px] text-white/70"
      >
        <Checkbox
          checked={isEstimate(selected.unclear, placement.target)}
          onChange={onEstimate}
        />
        <span className="truncate">Off screen, so this is an estimate</span>
      </label>
    ) : null;

  const court = (
    <div
      data-court-box=""
      className="[container-type:size] my-2 flex min-h-0 flex-1 items-center justify-center overflow-hidden"
    >
      <LabelCourt
        strokes={strokes}
        view={placing ? placement.half : "whole"}
        slide={slide}
        targetShotId={placing ? placement.shotId : null}
        target={placing ? placement.target : null}
        prompt={prompt}
        onPlace={placing ? onPlace : undefined}
        fadeOnZoom={zoomSwitched}
      />
    </div>
  );

  const foot = (
    <>
      <div className="flex h-6 shrink-0 items-center gap-3 text-[10px] text-white/55">
        {placing ? (
          <>
            <span
              role="group"
              aria-label="What you are placing"
              data-court-steps=""
              className="inline-flex rounded-[7px] bg-white/[0.08] p-0.5"
            >
              {(["contact", "landing"] as const).map((target) => {
                const on = placement.target === target;
                return (
                  <button
                    key={target}
                    type="button"
                    aria-pressed={on}
                    data-court-step={target}
                    onClick={() => onTarget(target)}
                    className={cn(
                      "h-5 cursor-pointer rounded-[5px] px-[9px] text-[11px] transition-colors duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                      on
                        ? "bg-white/[0.16] font-medium text-white"
                        : "text-white/60 hover:text-white",
                    )}
                  >
                    {TARGET_WORD[target]}
                  </button>
                );
              })}
            </span>
            {step ? null : estimate}
            <span className="flex-1" />
            <button
              type="button"
              aria-pressed={placement.flipped}
              data-court-flip=""
              onClick={onFlip}
              className={cn(
                "inline-flex h-6 cursor-pointer items-center gap-[5px] rounded-[6px] px-2 text-[11px] transition-colors duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                placement.flipped
                  ? "bg-white/[0.16] text-white"
                  : "text-white/70 hover:bg-white/[0.08] hover:text-white",
              )}
            >
              <ArrowUpDown
                className="size-[13px]"
                strokeWidth={1.6}
                aria-hidden="true"
              />
              Flip side
            </button>
          </>
        ) : (
          <span
            data-court-legend=""
            className="flex w-full items-center justify-center gap-3"
          >
            <span className="inline-flex items-center gap-[5px]">
              <span
                aria-hidden="true"
                className="size-[7px] rounded-full border-[1.5px] border-white"
              />
              Hit
            </span>
            <span className="inline-flex items-center gap-[5px]">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-white"
              />
              Landed
            </span>
          </span>
        )}
      </div>
      {placing ? (
        <p
          data-court-keys=""
          className="mt-1 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 overflow-hidden text-[10px] text-white/45"
        >
          {STROKE_KEY_HINTS.map((hint) => (
            <span key={hint.key} className="inline-flex items-center gap-[5px]">
              <Kbd
                size="sm"
                variant="flat"
                mono
                className="bg-white/[0.08] text-white/60 shadow-none"
              >
                {hint.key}
              </Kbd>
              {hint.label}
            </span>
          ))}
        </p>
      ) : null}
    </>
  );

  const live = (
    <span aria-live="polite" className="sr-only" data-court-prompt="">
      {prompt}
    </span>
  );

  if (step && point) {
    const count = stepCount(keep, step);
    const shotLine = stepShotLine(point, step.target.shotId, names);
    const score = step.item.tone === "score";
    const contact =
      placing &&
      placement.target === "contact" &&
      selected?.contactX != null &&
      selected.contactY != null
        ? contactDepthReadout(placement.half, {
            x: selected.contactX,
            y: selected.contactY,
          })
        : null;
    const answers = onAnswer ? step.answers : [];
    // The short ball's readout is the step's own line, in the box.
    const side = placing
      ? `${TARGET_WORD[placement.target]} · ${
          slide?.kind === "shank" ? "across the net" : (readout.subtitle ?? "")
        }`
      : "Whole court";
    return (
      <div
        data-court-panel=""
        data-court-layout="review"
        className={cn("flex min-h-0 flex-1 gap-8", RAIL_TONE_CLASS.dark)}
      >
        {live}
        <div
          data-court-review-column=""
          className="flex w-[312px] min-w-0 shrink-0 flex-col gap-4 overflow-y-auto"
        >
          <div className="flex min-w-0 flex-col gap-[3px]">
            <span
              data-court-title=""
              className="truncate text-[13px] leading-4 font-medium text-white"
            >
              Point {point.pointIndex + 1}
            </span>
            <span
              data-court-subtitle=""
              className="truncate text-[12px] leading-4 text-white/55"
            >
              {shotLine ?? readout.subtitle}
            </span>
          </div>
          <div
            data-court-review={step.item.id}
            data-court-review-tone={step.item.tone}
            className={cn(
              "flex flex-col gap-2.5 rounded-[8px] px-4 py-3.5",
              score ? "bg-[var(--rail-amber-wash-faint)]" : "bg-white/[0.05]",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span
                data-court-review-question=""
                className="text-[14px] leading-5 font-medium text-white"
              >
                {step.question}
              </span>
              <span
                data-court-review-count=""
                className={cn(
                  "mono tabular shrink-0 text-[11px]",
                  score ? "text-[var(--rail-amber)]" : "text-white/55",
                )}
              >
                {count.index} of {count.total}
              </span>
            </div>
            <span
              data-court-review-explanation=""
              className="text-[12px] leading-[18px] text-white/60"
            >
              {step.explanation}
            </span>
            {slide?.kind === "shank" ? (
              <span
                data-court-shank=""
                className="text-[12px] leading-[18px] font-medium text-[var(--rail-amber)]"
              >
                {readout.subtitle}
              </span>
            ) : null}
            {estimate}
            {contact ? (
              <span
                data-court-contact-readout=""
                className="mono tabular text-[12px] text-white/75"
              >
                {contact}
              </span>
            ) : null}
            {answers.length > 0 ? (
              <div
                data-court-review-answers=""
                className="-ml-1 flex flex-wrap items-start gap-x-3.5 gap-y-2 pt-0.5"
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
                      large
                      data-court-review-answer={answer.kind}
                      data-court-review-answer-id={answer.id}
                      aria-label={`${answer.label}: ${step.question}`}
                      onClick={() => onAnswer?.(answer)}
                    >
                      {answer.label}
                    </BlackTextAction>
                    {answer.detail ? (
                      <span
                        data-court-review-detail=""
                        className="px-1 text-[11px] leading-[14px] text-white/45"
                      >
                        {answer.detail}
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {step.then ? (
            <span
              data-court-review-then=""
              className="text-[12px] text-white/50"
            >
              {step.then}
            </span>
          ) : null}
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <span
            data-court-side=""
            className="h-4 shrink-0 truncate text-[12px] leading-4 text-white/60"
          >
            {side}
          </span>
          {court}
          {foot}
        </div>
      </div>
    );
  }

  return (
    <div
      data-court-panel=""
      className={cn("flex min-h-0 flex-1 flex-col", RAIL_TONE_CLASS.dark)}
    >
      {live}

      <div className="flex h-[34px] min-w-0 shrink-0 flex-col gap-0.5">
        <span
          data-court-title=""
          className="tabular truncate text-[12px] leading-[15px] font-medium text-white"
        >
          {readout.title}
        </span>
        <span
          data-court-subtitle=""
          className="truncate text-[10px] leading-[13px] text-white/55"
        >
          {readout.subtitle}
        </span>
      </div>

      {court}
      {foot}
    </div>
  );
}
