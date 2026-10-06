"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ArrowUpDown } from "lucide-react";
import type { LabelPoint, LabelShot } from "@/lib/services/labels/session";
import { cn } from "@/lib/utils";
import type { CourtPoint } from "./court-geometry";
import {
  placementPrompt,
  type PlacementState,
  type PlacementTarget,
} from "./court-placement";
import { LabelCourt, type CourtStroke } from "./label-court";
import {
  courtMarksAt,
  courtMarksKey,
  parseCourtMarksKey,
} from "./label-court-marks";
import type { SideNames } from "./label-format";
import type { VideoClock } from "./video-clock";

/**
 * The court panel's body (board 08i): the two-line readout header, the court
 * itself, and the foot — the Contact / Landing switch and "Flip side" while
 * placing, the Hit / Landed legend otherwise.
 *
 * The console renders it into each layout's court region, and the view owns
 * that region — ground, padding, radius, shadow and the blue outline while
 * placing — so this body never paints its own ground.
 *
 * The court box takes the rest of the panel's height and is the court's size
 * container: the court scales to the largest box of its own proportions that
 * fits (`LabelCourt`), centred, so a region shorter or taller than the art
 * shrinks or grows the court rather than clipping it.
 *
 * ── Two states ──────────────────────────────────────────────────────────────
 * - **Not placing** (the film is playing, nothing is selected, or the session
 *   is read-only): the WHOLE court, read-only. A click does nothing. There is
 *   no shot list — the rail is the list.
 * - **Placing** (a stroke is selected and the console is editable): the court
 *   ZOOMS to the half the next click belongs on (court-placement.ts), with the
 *   run-off round it clickable for a ball that went out. The foot holds the
 *   Contact / Landing switch — which end the click places — and "Flip side",
 *   for a ball into the net.
 *
 * ── What is on the court ────────────────────────────────────────────────────
 * Never the whole point at once. With nothing selected the marks follow the
 * film the way the Video tab's court does (`label-court-marks.ts`): each
 * contact appears at its stroke, each landing when the ball comes down, holds,
 * fades and goes — so the panel reads the rally one stroke at a time, and
 * pausing freezes it. The body subscribes to the console's `VideoClock`
 * itself, with the marks' string key as its snapshot, so an opacity step
 * re-renders this body and nothing else.
 *
 * With a stroke selected — editable or not — the court shows THAT stroke
 * alone, both ends at full strength: the labeller is looking at one shot and
 * placing it, so the end just clicked appears at once and nothing else
 * competes with it. A selected stroke with no coordinates yet is a blank
 * court, still clickable where editable.
 */

/** No point open: one shared empty list, so the marks memo holds. */
const NO_SHOTS: readonly LabelShot[] = [];

interface CourtReadout {
  title: string;
  subtitle: string | null;
}

/**
 * The panel's two header lines.
 *
 * Placing: "Shot 3 · contact" over whose half is on screen — the hitter's
 * for a contact, the other player's for a landing, and "Flipped to <hitter>'s
 * side · Net" when Flip side has brought a landing back across.
 *
 * Otherwise: "Point 15" over "Shot 3 of 4 · Ace" for the lit (playing)
 * stroke, or just the stroke count; "Court" with no point open.
 */
function courtReadout(
  point: LabelPoint | null,
  placement: PlacementState | null,
  litShotId: string | null,
  names: SideNames,
): CourtReadout {
  if (!point) return { title: "Court", subtitle: "No point open" };
  const live = point.shots.filter((shot) => shot.status !== "deleted");
  const numberOf = (shotId: string | null) => {
    const index = live.findIndex((shot) => shot.id === shotId);
    return index === -1 ? null : index + 1;
  };

  const placing = placement ? numberOf(placement.shotId) : null;
  if (placement && placing !== null) {
    const hitter = live[placing - 1].hitter;
    const own = hitter ? `${names[hitter]}’s side` : "The hitter’s side";
    const other = hitter
      ? `${names[hitter === "p1" ? "p2" : "p1"]}’s side`
      : "The other side";
    return {
      title: `Shot ${placing} · ${placement.target}`,
      subtitle:
        placement.target === "contact"
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
      title,
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

export function LabelCourtPanel({
  point,
  names,
  placement,
  editable,
  playingShotId = null,
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
  /** The console's video clock (analysis seconds): what the marks follow. */
  clock: VideoClock;
  /** A click on the zoomed half, in metres. */
  onPlace: (point: CourtPoint) => void;
  /** The Contact / Landing switch. */
  onTarget: (target: PlacementTarget) => void;
  /** "Flip side". */
  onFlip: () => void;
}) {
  const shots = point?.shots ?? NO_SHOTS;
  const selected = selectedStroke(point, placement);
  const placing = editable && selected !== null;
  const readout = courtReadout(
    point,
    placing ? placement : null,
    placement.shotId ?? playingShotId,
    names,
  );
  const selectedNumber =
    placing && selected
      ? shots.filter((shot) => shot.status !== "deleted").indexOf(selected) + 1
      : null;
  const prompt = placing ? placementPrompt(placement, selectedNumber) : null;
  // The court crossfades between the whole court and the zoomed half
  // (`label-court-view-in`, globals.css) — but only once the labeller has
  // made it switch: the court this panel mounted with, on page load or after
  // a layout change, is simply there. Latched in render, so the first
  // switched court already mounts with it.
  const [zoomAtMount] = useState(placing);
  const [zoomSwitched, setZoomSwitched] = useState(false);
  if (!zoomSwitched && placing !== zoomAtMount) setZoomSwitched(true);

  // The marks the film is showing right now, as a string snapshot: React
  // re-renders this body only when an opacity steps, and the console — which
  // owns the clock but never subscribes to this — not at all. Taken from the
  // current strokes on every render, so a retimed stroke moves at once.
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

  return (
    <div data-court-panel="" className="flex min-h-0 flex-1 flex-col">
      <span aria-live="polite" className="sr-only" data-court-prompt="">
        {prompt}
      </span>

      <div className="flex h-[34px] shrink-0 items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
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
      </div>

      <div
        data-court-box=""
        className="[container-type:size] my-2 flex min-h-0 flex-1 items-center justify-center overflow-hidden"
      >
        <LabelCourt
          strokes={strokes}
          view={placing ? placement.half : "whole"}
          targetShotId={placing ? placement.shotId : null}
          target={placing ? placement.target : null}
          prompt={prompt}
          onPlace={placing ? onPlace : undefined}
          fadeOnZoom={zoomSwitched}
        />
      </div>

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
                    {target === "contact" ? "Contact" : "Landing"}
                  </button>
                );
              })}
            </span>
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
    </div>
  );
}
