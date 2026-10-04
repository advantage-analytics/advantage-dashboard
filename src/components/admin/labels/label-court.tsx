import {
  APRON_FILL,
  COURT_FILL,
  LINE_COLOR,
} from "@/components/dashboard/matches/match-detail/shots/court-art";
import type { LabelShot } from "@/lib/services/labels/session";
import { cn } from "@/lib/utils";
import {
  COURT_LENGTH,
  COURT_HEIGHT,
  COURT_LEFT,
  COURT_TOP,
  COURT_VIEW_BOX,
  COURT_WIDTH,
  DOUBLES_HALF_WIDTH,
  FAR_SERVICE_Y,
  NEAR_SERVICE_Y,
  NET_Y,
  SINGLES_HALF_WIDTH,
  fromCourt,
  toCourt,
  type CourtPoint,
} from "./court-geometry";
import type { SideNames } from "./label-format";

/**
 * Board 08's court card, cut down to sit beside the band's small video: the
 * vertical court on its apron down the card's left edge, with the selected
 * point's strokes marked — hollow ring where the ball was hit, filled dot
 * where it landed, a dashed line between. Player 1's marks are white,
 * player 2's black, as the legend beside the court says.
 *
 * With a stroke selected (and the session open), the art box is a button
 * under a crosshair: a click is converted to metres with `toCourt` and handed
 * to `onPlace` — which end it places is court-placement.ts's sequence, and
 * the prompt at the foot of the card says which. The selected stroke's marks carry a
 * `--blue` ring so the labeller can see what they are moving.
 *
 * The court palette comes from `court-art.tsx`'s exports rather than a second
 * copy of the literals — `scripts/check-design-drift.mjs` allowlists them in
 * that one file.
 */

/** The dark mark: ink-900, the same near-black the board draws player 2 in. */
const DARK_MARK = "#0D0D0D";
const MARK_COLOR = { p1: LINE_COLOR, p2: DARK_MARK } as const;
const MARK_OUTLINE = { p1: DARK_MARK, p2: LINE_COLOR } as const;

/** A stroke on screen: its hitter's colour and whichever ends are known. */
interface Mark {
  id: string;
  selected: boolean;
  color: string;
  outline: string;
  hit: { sx: number; sy: number } | null;
  landed: { sx: number; sy: number } | null;
}

function marksFor(
  shots: readonly LabelShot[],
  selectedShotId: string | null,
): Mark[] {
  const marks: Mark[] = [];
  for (const shot of shots) {
    if (shot.status === "deleted") continue;
    const hit =
      shot.contactX !== null && shot.contactY !== null
        ? fromCourt({ x: shot.contactX, y: shot.contactY })
        : null;
    const landed =
      shot.landingX !== null && shot.landingY !== null
        ? fromCourt({ x: shot.landingX, y: shot.landingY })
        : null;
    if (!hit && !landed) continue;
    const side = shot.hitter ?? "p1";
    marks.push({
      id: shot.id,
      selected: shot.id === selectedShotId,
      color: MARK_COLOR[side],
      outline: MARK_OUTLINE[side],
      hit,
      landed,
    });
  }
  return marks;
}

const pct = (n: number) => `${n.toFixed(2)}%`;

/**
 * The art box: 194 × 86, the art's own 32.77 × 14.53 m proportions, so a
 * click converts to metres without distortion. It sits in a 216px card —
 * the video's height at the band's 384px width — which is why the marks
 * below are drawn smaller than the film tab's.
 */
const COURT_BOX = "relative h-[194px] w-[86px]";

export function LabelCourt({
  title,
  shots,
  names,
  selectedShotId = null,
  prompt = null,
  onPlace,
}: {
  /** The card's eyebrow: "Court · point 12", or "Court" with nothing chosen. */
  title: string;
  /** The selected point's strokes, in video order. Tombstones are skipped. */
  shots: readonly LabelShot[];
  names: SideNames;
  /** The stroke a click places; its marks are ringed. */
  selectedShotId?: string | null;
  /** "Click where shot 3 was hit" — null when a click would place nothing. */
  prompt?: string | null;
  /** A click on the court, in metres. Absent: the court is a picture. */
  onPlace?: (point: CourtPoint) => void;
}) {
  const marks = marksFor(shots, selectedShotId);
  const placed = marks.length;
  const placing = prompt !== null && onPlace !== undefined;
  const description =
    placed === 0
      ? "Court with no strokes placed"
      : `Court with ${placed} ${placed === 1 ? "stroke" : "strokes"} placed`;
  const art = (
    <>
      <CourtArt />
      <svg
        className="absolute inset-0 block h-full w-full overflow-visible"
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
              stroke={mark.color}
              strokeWidth="1"
              strokeDasharray="2 2"
              opacity="0.6"
            />
          ) : null,
        )}
        {marks.map((mark) =>
          mark.selected
            ? [mark.hit, mark.landed].map((end, i) =>
                end ? (
                  <circle
                    key={`${mark.id}-ring-${i}`}
                    data-selected-ring=""
                    cx={pct(end.sx)}
                    cy={pct(end.sy)}
                    r="5.5"
                    fill="none"
                    strokeWidth="1.25"
                    style={{ stroke: "var(--blue)" }}
                  />
                ) : null,
              )
            : null,
        )}
        {marks.map((mark) =>
          mark.hit ? (
            <circle
              key={`${mark.id}-hit`}
              cx={pct(mark.hit.sx)}
              cy={pct(mark.hit.sy)}
              r="3"
              fill="none"
              stroke={mark.color}
              strokeWidth="1.25"
            />
          ) : null,
        )}
        {marks.map((mark) =>
          mark.landed ? (
            <circle
              key={`${mark.id}-landed`}
              cx={pct(mark.landed.sx)}
              cy={pct(mark.landed.sy)}
              r="2.5"
              fill={mark.color}
              stroke={mark.outline}
              strokeWidth="0.5"
            />
          ) : null,
        )}
      </svg>
    </>
  );

  return (
    <section
      aria-label="Court"
      className="flex h-[216px] w-[320px] shrink-0 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]"
    >
      <div
        className="flex shrink-0 items-center justify-center px-3"
        style={{ background: APRON_FILL }}
      >
        {placing ? (
          <button
            type="button"
            data-court-target=""
            aria-label={`${prompt}. ${description}. Positions can also be typed in the stroke's row.`}
            onClick={(event) => {
              // A keyboard press has no position to place.
              if (event.detail === 0) return;
              const box = event.currentTarget.getBoundingClientRect();
              if (box.width === 0 || box.height === 0) return;
              onPlace(
                toCourt({
                  sx: ((event.clientX - box.left) / box.width) * 100,
                  sy: ((event.clientY - box.top) / box.height) * 100,
                }),
              );
            }}
            className={cn(
              COURT_BOX,
              "block cursor-crosshair rounded-[var(--radius-element)] border-0 bg-transparent p-0",
            )}
          >
            {art}
          </button>
        ) : (
          <div className={COURT_BOX} role="img" aria-label={description}>
            {art}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <span className="eyebrow truncate">{title}</span>
        <div className="flex flex-col gap-1.5 text-[11px] text-[var(--ink-700)]">
          <LegendSwatch color={LINE_COLOR} ring="rgba(0,0,0,0.35)">
            {names.p1}
          </LegendSwatch>
          <LegendSwatch color={DARK_MARK} ring="rgba(0,0,0,0.35)">
            {names.p2}
          </LegendSwatch>
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
                <circle
                  cx="5"
                  cy="5"
                  r="3.6"
                  fill="none"
                  strokeWidth="1.5"
                  style={{ stroke: "var(--ink-700)" }}
                />
              </svg>
              Hit
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
                <circle
                  cx="5"
                  cy="5"
                  r="3.6"
                  style={{ fill: "var(--ink-700)" }}
                />
              </svg>
              Landed
            </span>
          </span>
        </div>

        <div
          className={cn(
            "mt-auto text-[12px] leading-[18px]",
            placing
              ? "font-medium text-[var(--ink-900)]"
              : "text-[var(--ink-600)]",
          )}
          data-court-prompt={placing ? "" : undefined}
          aria-live="polite"
        >
          {placing
            ? prompt
            : placed === 0
              ? "No strokes placed on this point"
              : `${placed} ${placed === 1 ? "stroke" : "strokes"} placed`}
        </div>
      </div>
    </section>
  );
}

function LegendSwatch({
  color,
  ring,
  children,
}: {
  color: string;
  ring: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="size-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 0 1px ${ring}` }}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}

/**
 * The court itself, in metres: `viewBox` is the art box, the court rect runs
 * `y = 0 … 23.77`. It is drawn top-down in SVG space while `fromCourt` puts
 * the near baseline at the bottom; the lines are symmetric about the net, so
 * both frames draw the same picture.
 */
function CourtArt() {
  const lines = { vectorEffect: "non-scaling-stroke" } as const;
  return (
    <svg
      viewBox={COURT_VIEW_BOX}
      preserveAspectRatio="none"
      className="absolute inset-0 block h-full w-full"
      aria-hidden="true"
      data-court-art=""
    >
      <rect
        x={COURT_LEFT}
        y={COURT_TOP}
        width={COURT_WIDTH}
        height={COURT_HEIGHT}
        fill={APRON_FILL}
      />
      <rect
        x={-DOUBLES_HALF_WIDTH}
        y="0"
        width={2 * DOUBLES_HALF_WIDTH}
        height={COURT_LENGTH}
        fill={COURT_FILL}
      />
      <g fill="none" stroke={LINE_COLOR} strokeWidth="1.5">
        <rect
          x={-DOUBLES_HALF_WIDTH}
          y="0"
          width={2 * DOUBLES_HALF_WIDTH}
          height={COURT_LENGTH}
          style={lines}
        />
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
        <line x1="0" y1="0" x2="0" y2="0.3" style={lines} />
        <line
          x1="0"
          y1={COURT_LENGTH - 0.3}
          x2="0"
          y2={COURT_LENGTH}
          style={lines}
        />
      </g>
      <line
        x1="-6.2"
        y1={NET_Y}
        x2="6.2"
        y2={NET_Y}
        stroke={LINE_COLOR}
        strokeWidth="2.5"
        style={lines}
      />
    </svg>
  );
}
