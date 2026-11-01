"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ArrowUpDown, Link2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  isLetServe,
  isLiveShot,
  liveShotsInOrder,
  opponent,
  type LabelPoint,
  type LabelShot,
} from "@/lib/services/labels/session";
import {
  landingLink,
  withFilledLandings,
} from "@/lib/services/labels/volley-link";
import { cn } from "@/lib/utils";
import type { CourtPoint } from "./court-geometry";
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
import type { SideNames } from "./label-format";
import { PointInfoLine, type PointInfo } from "./label-point-info";
import { RAIL_TONE_CLASS } from "./label-rail-tone";
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
 * - Not placing, with `info`: one quiet line under the header about the open
 *   point — its score, server, how far the rally has got and what is still
 *   to review (`pointInfoLine`, label-point-info.tsx). The review step itself
 *   is asked in the rail (`ReviewInlineBlock`, label-review-inline.tsx), never
 *   here: while it is open this panel follows the film and takes no click.
 * - Placing the landing of a stroke before an air stroke (volley-link.ts): the
 *   header carries the link's toggle, and the court that stroke's contact as a
 *   faint ring. A filled landing's dot is drawn a step down from a placed one.
 */

/** No point open: one shared empty list, so the marks memo holds. */
const NO_SHOTS: readonly LabelShot[] = [];

interface CourtReadout {
  title: string;
  subtitle: string | null;
}

/**
 * The live strokes, in the rail's numbering (1…n): not deleted and, while
 * the session draws them (`ghosts`, marks.ts `drawsGhosts`), not a stroke
 * the site removed — the rail numbers a ghost's line not at all.
 */
const liveShots = (point: LabelPoint, ghosts = true) =>
  point.shots.filter((shot) => isLiveShot(shot, ghosts));

/** "Didn’t clear the net · error by Lee" — the short ball's readout. */
export function shankReadout(hitter: string | null): string {
  return `Didn’t clear the net${hitter ? ` · error by ${hitter}` : ""}`;
}

/** "Lee’s side · run-off to 5.5 m" — a deep contact's readout. */
function deepReadout(own: string, runoff: number): string {
  return `${own} · run-off to ${runoff} m`;
}

/**
 * The end's glyph, as the court draws its marks: a hollow ring where the ball
 * was hit, a filled dot where it landed — on the contact / landing switch
 * (7px ring / 6px dot). The header's prompt dropped its larger copy on
 * 2026-10-26: the words already name the end.
 */
export function EndGlyph({ end }: { end: PlacementTarget }) {
  return (
    <span
      aria-hidden="true"
      data-end-glyph={end}
      className={cn(
        "shrink-0 rounded-full",
        end === "contact"
          ? "size-[7px] border-[1.5px] border-current"
          : "size-1.5 bg-current",
      )}
    />
  );
}

/**
 * The panel's two header lines. Placing: "Shot 3 · contact" — the panel draws
 * the prompt (`placementPrompt`) in this title's place —
 * over whose half is on screen, or "Flipped to <hitter>'s side · Net" when Flip side has brought a
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
  ghosts = true,
): CourtReadout {
  if (!point) return { title: "Court", subtitle: "No point open" };
  const live = liveShots(point, ghosts);
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

/** The end being placed, as the switch and the placing lines name it. */
export const TARGET_WORD: Record<PlacementTarget, string> = {
  contact: "Contact",
  landing: "Landing",
};

export function LabelCourtPanel({
  point,
  names,
  placement,
  editable,
  playingShotId = null,
  ghosts = true,
  info = null,
  notice = null,
  landingOnly = false,
  onLandingLink,
  onEstimate,
  clock,
  onPlace,
  onSelectShot,
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
  /**
   * Whether the session draws the site's removed strokes as ghosts
   * (`drawsGhosts`): then they take no number here, as on the rail.
   */
  ghosts?: boolean;
  /** One line about the open point, drawn under the header while not placing. */
  info?: PointInfo | null;
  /**
   * "Landing placed · next: shot 4 contact" (court-placement.ts
   * `placementNotice`): drawn in the subtitle's place while placing, after a
   * landing moved the court on to the next stroke. Null: the usual subtitle.
   */
  notice?: string | null;
  /** The next click moves the landing and leaves the next stroke's contact. */
  landingOnly?: boolean;
  /** The link's toggle (volley-link.ts). Absent: never drawn. */
  onLandingLink?: () => void;
  /**
   * "Off screen, so this is an estimate" on the end being placed. Absent:
   * the box is not drawn.
   */
  onEstimate?: (estimate: boolean) => void;
  /** The console's video clock (analysis seconds): what the marks follow. */
  clock: VideoClock;
  /** A click on the zoomed half, in metres. */
  onPlace: (point: CourtPoint) => void;
  /**
   * A click on a drawn end other than the one being placed: select that
   * stroke on that end (label-court.tsx `markEndAt`). Absent: every click
   * places.
   */
  onSelectShot?: (shotId: string, end: PlacementTarget) => void;
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
    ghosts,
  );
  const selectedNumber =
    placing && selected
      ? liveShots(point!, ghosts).indexOf(selected) + 1
      : null;
  const prompt = placing ? placementPrompt(placement, selectedNumber) : null;
  // The court crossfades between the whole court and the zoomed half
  // (`label-court-view-in`, globals.css) only once the labeller has made it
  // switch, never for the court this panel mounted with. Latched in render.
  const [zoomAtMount] = useState(placing);
  const [zoomSwitched, setZoomSwitched] = useState(false);
  if (!zoomSwitched && placing !== zoomAtMount) setZoomSwitched(true);
  // The marks the film is showing right now, as a string snapshot: React
  // re-renders this body only when an opacity steps.
  const marksSnapshot = () => courtMarksKey(courtMarksAt(shots, clock.get()));
  const marksKey = useSyncExternalStore(
    clock.subscribe,
    marksSnapshot,
    marksSnapshot,
  );
  // Each live stroke with the landing the next air stroke gives it.
  const drawn = useMemo(
    () => (point ? withFilledLandings(point, ghosts) : NO_SHOTS),
    [point, ghosts],
  );
  const inOrder = useMemo(
    () => (point ? liveShotsInOrder(point, ghosts) : NO_SHOTS),
    [point, ghosts],
  );
  const selectedAt = selected
    ? inOrder.findIndex((shot) => shot.id === selected.id)
    : -1;
  const nextStroke =
    selectedAt === -1 ? null : (inOrder[selectedAt + 1] ?? null);
  const link = selected ? landingLink(selected, nextStroke) : null;
  const linkShown = placing && placement.target === "landing" && link !== null;
  const strokes = useMemo<CourtStroke[]>(() => {
    const byId = new Map(drawn.map((shot) => [shot.id, shot]));
    // A selected stroke alone, at full strength; none of it yet is a blank court.
    if (placement.shotId !== null) {
      const shot = selected ? byId.get(selected.id) : null;
      if (!shot) return [];
      const own: CourtStroke =
        link === "filled"
          ? { shot, opacity: { hit: 1, landed: 0.65 } }
          : { shot };
      return linkShown && nextStroke
        ? [own, { shot: nextStroke, opacity: { hit: 0.55, landed: 0 } }]
        : [own];
    }
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
  }, [
    placement.shotId,
    selected,
    drawn,
    marksKey,
    link,
    linkShown,
    nextStroke,
  ]);

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
        onSelectShot={placing ? onSelectShot : undefined}
        fadeOnZoom={zoomSwitched}
      />
    </div>
  );

  const foot = (
    <>
      <div className="flex h-6 shrink-0 items-center gap-3 text-[10px] text-white/55">
        {placing ? (
          <CourtEndControls
            placement={placement}
            onTarget={onTarget}
            onFlip={onFlip}
          >
            {estimate}
          </CourtEndControls>
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
    </>
  );

  // Placing, the header's title is what the next click does, in words alone
  // (the cursor and the switch carry the end's glyph); a let serve keeps its
  // " · let".
  const isLet = selected !== null && isLetServe(selected);
  const nextNumber = selectedAt + 2;
  const linkOn = link !== "apart" && !landingOnly;
  const linkLine = !linkShown
    ? null
    : landingOnly
      ? "Next click moves the landing only"
      : link === "filled"
        ? `Filled from shot ${nextNumber} · moves with its contact`
        : link === "agrees"
          ? `Moves with shot ${nextNumber} contact`
          : `Apart from shot ${nextNumber} contact`;
  const titleLine =
    placing && prompt ? (
      <span
        data-court-title=""
        className="flex min-w-0 items-center gap-[7px] text-[13px] leading-[16px] font-medium text-white"
      >
        <span aria-live="polite" data-court-prompt="" className="truncate">
          {prompt}
        </span>
        {isLet ? <span className="shrink-0">· let</span> : null}
      </span>
    ) : (
      <span
        data-court-title=""
        className="tabular truncate text-[12px] leading-[15px] font-medium text-white"
      >
        {readout.title}
      </span>
    );

  return (
    <div
      data-court-panel=""
      className={cn("flex min-h-0 flex-1 flex-col", RAIL_TONE_CLASS.dark)}
    >
      <div className="flex h-[34px] min-w-0 shrink-0 items-start gap-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {titleLine}
          {placing && notice ? (
            <span
              data-court-subtitle=""
              data-placement-notice=""
              className="truncate text-[10px] leading-[13px] text-white/70"
            >
              {notice}
            </span>
          ) : (
            <span
              data-court-subtitle=""
              className="truncate text-[10px] leading-[13px] text-white/55"
            >
              {linkLine ?? readout.subtitle}
            </span>
          )}
        </div>
        {linkShown && onLandingLink ? (
          <button
            type="button"
            aria-pressed={linkOn}
            data-court-link=""
            onClick={onLandingLink}
            className={cn(
              "inline-flex h-6 shrink-0 cursor-pointer items-center gap-[5px] rounded-[6px] px-2 text-[11px] transition-colors duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
              linkOn
                ? "bg-white/[0.16] text-white"
                : "text-white/70 hover:bg-white/[0.08] hover:text-white",
            )}
          >
            <Link2
              className="size-[13px]"
              strokeWidth={1.6}
              aria-hidden="true"
            />
            {linkOn
              ? `Linked to shot ${nextNumber}`
              : `Link to shot ${nextNumber}`}
          </button>
        ) : null}
      </div>
      {info && !placing ? <PointInfoLine info={info} /> : null}

      {court}
      {foot}
    </div>
  );
}

/**
 * The Contact / Landing switch and "Flip side", on one 24px row: the court
 * panel's foot while it places, and the inline review block's under its
 * court. `children` sit between the switch and Flip side (the panel's
 * estimate box).
 */
export function CourtEndControls({
  placement,
  onTarget,
  onFlip,
  children,
}: {
  placement: PlacementState;
  onTarget: (target: PlacementTarget) => void;
  onFlip: () => void;
  children?: React.ReactNode;
}) {
  return (
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
              aria-keyshortcuts="C"
              onClick={() => onTarget(target)}
              className={cn(
                "inline-flex h-5 cursor-pointer items-center gap-[5px] rounded-[5px] px-[9px] text-[11px] transition-colors duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                on
                  ? "bg-white/[0.16] font-medium text-white"
                  : "text-white/60 hover:text-white",
              )}
            >
              <EndGlyph end={target} />
              {TARGET_WORD[target]}
            </button>
          );
        })}
      </span>
      {children}
      <span className="flex-1" />
      <button
        type="button"
        aria-pressed={placement.flipped}
        data-court-flip=""
        aria-keyshortcuts="X"
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
  );
}
