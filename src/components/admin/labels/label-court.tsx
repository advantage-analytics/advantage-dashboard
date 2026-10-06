import {
  MARK_FADE_TRANSITION,
  MARK_IN_ANIMATION,
} from "@/components/dashboard/matches/match-detail/film/film-court";
import type { LabelShot } from "@/lib/services/labels/session";
import { cn } from "@/lib/utils";
import {
  COURT_HEIGHT,
  COURT_LENGTH,
  COURT_VIEW_BOX,
  COURT_WIDTH,
  DOUBLES_HALF_WIDTH,
  FAR_SERVICE_Y,
  NEAR_SERVICE_Y,
  NET_Y,
  SINGLES_HALF_WIDTH,
  fromCourt,
  fromCourtInHalf,
  halfCourtViewBox,
  toCourtInHalf,
  type CourtHalf,
  type CourtPoint,
  type ScreenPoint,
} from "./court-geometry";
import type { PlacementTarget } from "./court-placement";

/**
 * Board 08i's court, as it is drawn inside the court panel
 * (`label-court-panel.tsx`): white lines on the panel's dark ground, the open
 * point's strokes marked on it — a hollow ring where the ball was hit, a
 * filled dot where it landed, a dashed line between.
 *
 * Two views of the same art:
 *
 * - `view="whole"` — the whole court (`COURT_VIEW_BOX`), read-only: a
 *   picture of the point as it happens.
 * - `view="near" | "far"` — zoomed to that half (`halfCourtViewBox`) with its
 *   run-off, as a button under a crosshair: a click ANYWHERE in the box —
 *   lines or surround, for a ball that went out — becomes metres through
 *   `toCourtInHalf` and goes to `onPlace`. Which end it places is
 *   court-placement.ts's sequence; that end of the target stroke carries the
 *   `--blue` ring, so the labeller sees what the click will move.
 *
 * What is drawn is the caller's: each stroke comes with an opacity for each
 * end (`label-court-marks.ts` for the fading rally, 1 for a selected stroke),
 * an end at 0 is not drawn at all, and the dashed path between them takes the
 * fainter of the two. Each end eases between opacity steps with the Video
 * tab's own `MARK_FADE_TRANSITION` and rises in on mount with its
 * `MARK_IN_ANIMATION`, so the two courts read as one.
 *
 * The box is the largest one of the art's proportions that fits its size
 * container — the panel's court box — so it shrinks and grows with the
 * panel. The marks are placed in percent and a click is read against the
 * box's own bounding rect, so neither notices the scale.
 *
 * Both views keep the art's own proportions (0.4434 for the whole court,
 * 276 × 222 for a half), so a click converts to metres without distortion.
 * Marks whose end is off the zoomed half are clipped by the box, and their
 * dashed path runs out to the edge toward it.
 */

/** One step up from the panel's ground, for the court's surface. */
const SURFACE_FILL = "rgba(255,255,255,0.07)";
const LINE_STRONG = "rgba(255,255,255,0.55)";
const LINE_THIN = "rgba(255,255,255,0.32)";
const NET_LINE = "rgba(255,255,255,0.85)";
const MARK = "rgba(255,255,255,1)";

/** The art's own height; both views are proportioned against it. */
const BOX_HEIGHT = 222;
/** The whole court at that height, in the art's 14.53 × 32.77 proportions. */
const WHOLE_WIDTH = (BOX_HEIGHT * COURT_WIDTH) / COURT_HEIGHT;
/** A half at that height. */
const HALF_BOX_WIDTH = 276;

export type CourtView = "whole" | CourtHalf;

/** How strongly each end of a stroke is drawn, 0–1. An end at 0 is not. */
export interface MarkOpacity {
  hit: number;
  landed: number;
}

const FULL_OPACITY: MarkOpacity = { hit: 1, landed: 1 };

/** One stroke to draw, with its ends' opacities (both 1 when left out). */
export interface CourtStroke {
  shot: LabelShot;
  opacity?: MarkOpacity;
}

/** A stroke on screen: whichever ends are drawn, in percent of the box. */
interface Mark {
  id: string;
  hit: (ScreenPoint & { opacity: number }) | null;
  landed: (ScreenPoint & { opacity: number }) | null;
}

function marksFor(strokes: readonly CourtStroke[], view: CourtView): Mark[] {
  const project = (point: CourtPoint) =>
    view === "whole" ? fromCourt(point) : fromCourtInHalf(view, point);
  const marks: Mark[] = [];
  for (const { shot, opacity = FULL_OPACITY } of strokes) {
    if (shot.status === "deleted") continue;
    const hit =
      opacity.hit > 0 && shot.contactX !== null && shot.contactY !== null
        ? {
            ...project({ x: shot.contactX, y: shot.contactY }),
            opacity: opacity.hit,
          }
        : null;
    const landed =
      opacity.landed > 0 && shot.landingX !== null && shot.landingY !== null
        ? {
            ...project({ x: shot.landingX, y: shot.landingY }),
            opacity: opacity.landed,
          }
        : null;
    if (!hit && !landed) continue;
    marks.push({ id: shot.id, hit, landed });
  }
  return marks;
}

const pct = (n: number) => `${n.toFixed(2)}%`;

/** A mark's opacity, eased between steps and risen in on mount. */
const markStyle = (opacity: number) => ({
  opacity,
  transition: MARK_FADE_TRANSITION,
  animation: MARK_IN_ANIMATION,
});

export function LabelCourt({
  strokes,
  view,
  targetShotId = null,
  target = null,
  prompt = null,
  onPlace,
  fadeOnZoom = false,
}: {
  /**
   * Fade the art in when the court changes between the whole court and a
   * half (`label-court-view-in`, globals.css): the zoom reads as one court
   * changing scale, not a cut. Opacity only — the SVG's geometry is never
   * animated. Off (the default, and the panel's first court), the art is
   * simply there. Near ↔ far is not a zoom and does not fade: it happens on
   * every placing click.
   */
  fadeOnZoom?: boolean;
  /** The strokes to draw, each at its ends' opacities. Tombstones are skipped. */
  strokes: readonly CourtStroke[];
  /** The whole court, or the half a click is being taken on. */
  view: CourtView;
  /** The stroke being placed: its `target` end carries the ring. */
  targetShotId?: string | null;
  /** The end of the target stroke the next click places; it is ringed. */
  target?: PlacementTarget | null;
  /** "Click where shot 3 was hit" — the button's name while placing. */
  prompt?: string | null;
  /** A click on a half, in metres. Absent: the court is a picture. */
  onPlace?: (point: CourtPoint) => void;
}) {
  const marks = marksFor(strokes, view);
  const placed = marks.length;
  const zoomed = view !== "whole";
  const placing = zoomed && prompt !== null && onPlace !== undefined;
  // Zoomed, a mark covers a fifth more court per pixel, so it is drawn larger.
  const size = zoomed
    ? { hit: 4.5, hitStroke: 2, landed: 4, ring: 10 }
    : { hit: 3, hitStroke: 1.5, landed: 2.5, ring: 6.5 };
  const description =
    placed === 0
      ? "Court with no strokes placed"
      : `Court with ${placed} ${placed === 1 ? "stroke" : "strokes"} placed`;
  const net = zoomed ? fromCourtInHalf(view, { x: 6.9, y: NET_Y }) : null;

  const art = (
    // Keyed by the scale, so a zoom mounts a fresh layer and the fade plays
    // from its mount; a half-to-half flip keeps the layer and replays nothing.
    <span
      key={zoomed ? "half" : "whole"}
      data-court-layer=""
      className={cn(
        "absolute inset-0 block",
        fadeOnZoom && "label-court-view-in",
      )}
    >
      <CourtArt view={view} />
      <svg
        className="absolute inset-0 block h-full w-full"
        aria-hidden="true"
        data-court-marks=""
      >
        {marks.map((mark) =>
          mark.hit && mark.landed ? (
            <line
              key={`${mark.id}-path`}
              x1={pct(mark.hit.sx)}
              y1={pct(mark.hit.sy)}
              x2={pct(mark.landed.sx)}
              y2={pct(mark.landed.sy)}
              stroke={MARK}
              strokeWidth="1"
              strokeDasharray="3 4"
              style={markStyle(
                0.4 * Math.min(mark.hit.opacity, mark.landed.opacity),
              )}
            />
          ) : null,
        )}
        {marks.map((mark) =>
          mark.hit ? (
            <circle
              key={`${mark.id}-hit`}
              data-court-hit=""
              cx={pct(mark.hit.sx)}
              cy={pct(mark.hit.sy)}
              r={size.hit}
              fill="none"
              stroke={MARK}
              strokeWidth={size.hitStroke}
              style={markStyle(mark.hit.opacity)}
            />
          ) : null,
        )}
        {marks.map((mark) =>
          mark.landed ? (
            <circle
              key={`${mark.id}-landed`}
              data-court-landed=""
              cx={pct(mark.landed.sx)}
              cy={pct(mark.landed.sy)}
              r={size.landed}
              fill={MARK}
              style={markStyle(mark.landed.opacity)}
            />
          ) : null,
        )}
        {marks.map((mark) => {
          if (mark.id !== targetShotId || target === null) return null;
          const end = target === "contact" ? mark.hit : mark.landed;
          return end ? (
            <circle
              key={`${mark.id}-ring`}
              data-selected-ring={target}
              cx={pct(end.sx)}
              cy={pct(end.sy)}
              r={size.ring}
              fill="none"
              strokeWidth="1.5"
              style={{ stroke: "var(--blue)" }}
            />
          ) : null;
        })}
      </svg>
      {net ? (
        <span
          aria-hidden="true"
          className="mono pointer-events-none absolute -translate-y-1/2 text-[8px] tracking-[1px] text-white/50 uppercase"
          style={{ left: pct(net.sx), top: pct(net.sy) }}
        >
          Net
        </span>
      ) : null}
    </span>
  );

  const box = cn(
    "relative block shrink-0 overflow-hidden",
    zoomed &&
      "rounded-[8px] border border-dashed border-white/[0.22] bg-white/[0.07]",
  );
  const width = zoomed ? HALF_BOX_WIDTH : WHOLE_WIDTH;
  // "Contain" in the nearest size container (`container-type: size`): as
  // wide as the container, unless its height runs out first.
  const style = {
    width: `min(100cqw, calc(100cqh * ${(width / BOX_HEIGHT).toFixed(4)}))`,
    aspectRatio: `${width.toFixed(2)} / ${BOX_HEIGHT}`,
  };

  return placing ? (
    <button
      type="button"
      data-court-target=""
      data-court-view={view}
      aria-label={`${prompt}. ${description}. Anywhere in the box counts, including outside the lines for a ball that went out. Positions can also be typed in the stroke's row.`}
      onClick={(event) => {
        // A keyboard press has no position to place.
        if (event.detail === 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        onPlace(
          toCourtInHalf(view, {
            sx: ((event.clientX - rect.left) / rect.width) * 100,
            sy: ((event.clientY - rect.top) / rect.height) * 100,
          }),
        );
      }}
      className={cn(
        box,
        "cursor-crosshair p-0 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
      )}
      style={style}
    >
      {art}
    </button>
  ) : (
    <div
      className={box}
      style={style}
      role="img"
      aria-label={description}
      data-court-view={view}
    >
      {art}
    </div>
  );
}

/**
 * The court itself, in metres: the court rect runs `y = 0 … 23.77`, drawn
 * top-down in SVG space while the conversions put the near baseline at the
 * bottom; the lines are symmetric about the net, so both frames draw the
 * same picture — and a half is just a different `viewBox` onto it.
 */
function CourtArt({ view }: { view: CourtView }) {
  const lines = { vectorEffect: "non-scaling-stroke" } as const;
  return (
    <svg
      viewBox={view === "whole" ? COURT_VIEW_BOX : halfCourtViewBox(view)}
      preserveAspectRatio="none"
      className="absolute inset-0 block h-full w-full"
      aria-hidden="true"
      data-court-art=""
    >
      <rect
        x={-DOUBLES_HALF_WIDTH}
        y="0"
        width={2 * DOUBLES_HALF_WIDTH}
        height={COURT_LENGTH}
        fill={SURFACE_FILL}
      />
      <g fill="none" stroke={LINE_THIN} strokeWidth="1">
        <line
          x1={-SINGLES_HALF_WIDTH}
          y1="0"
          x2={-SINGLES_HALF_WIDTH}
          y2={COURT_LENGTH}
          style={lines}
        />
        <line
          x1={SINGLES_HALF_WIDTH}
          y1="0"
          x2={SINGLES_HALF_WIDTH}
          y2={COURT_LENGTH}
          style={lines}
        />
        <line
          x1={-SINGLES_HALF_WIDTH}
          y1={NEAR_SERVICE_Y}
          x2={SINGLES_HALF_WIDTH}
          y2={NEAR_SERVICE_Y}
          style={lines}
        />
        <line
          x1={-SINGLES_HALF_WIDTH}
          y1={FAR_SERVICE_Y}
          x2={SINGLES_HALF_WIDTH}
          y2={FAR_SERVICE_Y}
          style={lines}
        />
        <line
          x1="0"
          y1={NEAR_SERVICE_Y}
          x2="0"
          y2={FAR_SERVICE_Y}
          style={lines}
        />
        <line x1="0" y1="0" x2="0" y2="0.36" style={lines} />
        <line
          x1="0"
          y1={COURT_LENGTH - 0.36}
          x2="0"
          y2={COURT_LENGTH}
          style={lines}
        />
      </g>
      <rect
        x={-DOUBLES_HALF_WIDTH}
        y="0"
        width={2 * DOUBLES_HALF_WIDTH}
        height={COURT_LENGTH}
        fill="none"
        stroke={LINE_STRONG}
        strokeWidth="1"
        style={lines}
      />
      <line
        x1="-6.36"
        y1={NET_Y}
        x2="6.36"
        y2={NET_Y}
        stroke={NET_LINE}
        strokeWidth="2"
        style={lines}
      />
    </svg>
  );
}
