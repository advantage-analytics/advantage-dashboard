"use client";

import { useEffect, useRef, useState } from "react";

import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

/* Court dimensions (matches Figma frame 98:4736) */
export const COURT_W = 447;
export const COURT_H = 350;
export const DOUBLES_LEFT = 37.4;
export const DOUBLES_RIGHT = 410.9;
export const DOUBLES_TOP = 0;
export const DOUBLES_BOTTOM = 349.7;
export const SINGLES_LEFT = 84.2;
export const SINGLES_RIGHT = 362.4;
export const SERVICE_Y = 155;
export const BASELINE_Y = 331;
export const CENTER_X = (SINGLES_LEFT + SINGLES_RIGHT) / 2;

const COURT_FILL = "#EFF4FF";
const COURT_LINE = "#D6E4F9";
const LINE_W = 1.5;

/* ── Types ──────────────────────────────────────────────── */

export interface DotMeta {
  resultLabel: string;
  gameScore: string;
  pointScore: string;
  setNumber: number;
  rallyLength: number;
  serveType: string;
}

export interface CourtDot {
  cx: number;
  cy: number;
  color: string;
  opacity?: number;
  id?: string;
  isAce?: boolean;
  isSecondServe?: boolean;
  variant?: "landing" | "contact";
  shape?: "circle" | "triangle";
  pairId?: string; // shared id between landing + contact dots of the same point
  meta?: DotMeta;
  exiting?: boolean; // set by useDotExit while the dot fades out before unmount
}

interface InteractiveProps {
  hoveredId: string | null;
  pinnedId: string | null;
  onDotHover: (id: string | null) => void;
  onDotClick: (id: string) => void;
  onBackgroundClick: () => void;
}

export type CourtSVGProps = { dots: CourtDot[] } & Partial<InteractiveProps>;

/* ── Helpers ─────────────────────────────────────────────── */

// Area-match a triangle to a circle of the same nominal `size` (radius): a
// circle's area is π·size² but this triangle's is only 1.7825·size² (~57%), so
// at equal radius the triangle reads visibly smaller. Scale by √(π/1.7825) ≈ 1.33
// so circle (forehand) and triangle (backhand) markers carry equal visual weight.
const TRIANGLE_AREA_SCALE = 1.33;

function trianglePoints(cx: number, cy: number, size: number): string {
  // Upward triangle (base 2·s, height 1.7825·s) recentered so its centroid —
  // not its bounding box — sits exactly on (cx, cy), keeping each marker anchored
  // on its true landing/contact coordinate alongside the circles.
  const s = size * TRIANGLE_AREA_SCALE;
  const apexY = cy - s * 1.1883;
  const baseY = cy + s * 0.5942;
  return `${cx},${apexY} ${cx - s},${baseY} ${cx + s},${baseY}`;
}

function starPoints(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  pts: number,
): string {
  const step = Math.PI / pts;
  const coords: string[] = [];
  for (let i = 0; i < 2 * pts; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = i * step - Math.PI / 2;
    coords.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return coords.join(" ");
}

/* ── Shared SVG defs ─────────────────────────────────────── */

// Data-point enter/exit motion. A strong ease-out curve gives the entrance
// immediate "punch"; dots scale up from 0.6 (never from nothing) and fade in.
// Exit is deliberately faster than enter and shrinks slightly — a quick, quiet
// retreat rather than a vanish. `both` fill keeps the `to` state implicit so each
// dot settles at its own `opacity` attribute. transform-box/origin make the SVG
// scale happen around each dot's own center. Reduced motion keeps the fade,
// drops the movement.
const DOT_ANIM_CSS = `
.court-dot{transform-box:fill-box;transform-origin:center;animation:courtDotIn .28s cubic-bezier(.23,1,.32,1) both}
.court-dot--exit{transform-box:fill-box;transform-origin:center;animation:courtDotOut .16s cubic-bezier(.23,1,.32,1) both;pointer-events:none}
@keyframes courtDotIn{from{opacity:0;transform:scale(.6)}}
@keyframes courtDotOut{to{opacity:0;transform:scale(.7)}}
@media(prefers-reduced-motion:reduce){
.court-dot{animation:courtDotInRM .2s ease both}
.court-dot--exit{animation:courtDotOutRM .12s ease both}
@keyframes courtDotInRM{from{opacity:0}}
@keyframes courtDotOutRM{to{opacity:0}}
}
`;

/** Shared <style> for dot enter/exit; render inside any court <svg>. */
export function CourtDotStyles() {
  return <style>{DOT_ANIM_CSS}</style>;
}

/**
 * Keeps just-removed dots mounted for `holdMs` so they can play an exit
 * animation before unmounting, then drops them. Returned dots carry an
 * `exiting` flag while they fade. Re-adding an id mid-exit cancels the exit
 * (the live dot simply re-enters). Dots without an `id` are passed through
 * untouched — exit needs stable identity.
 */
export function useDotExit<T extends { id?: string }>(
  dots: T[],
  holdMs = 160,
): Array<T & { exiting?: boolean }> {
  const [extra, setExtra] = useState<Array<T & { exiting: true }>>([]);
  const prev = useRef<Map<string, T>>(new Map());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const curr = new Map<string, T>();
    for (const d of dots) if (d.id) curr.set(d.id, d);

    // An id that reappeared is alive again — cancel its pending exit.
    let cancelled = false;
    for (const id of curr.keys()) {
      const t = timers.current.get(id);
      if (t) {
        clearTimeout(t);
        timers.current.delete(id);
        cancelled = true;
      }
    }
    if (cancelled) setExtra((ex) => ex.filter((d) => !curr.has(d.id as string)));

    // Newly removed ids start their exit countdown.
    const removed: Array<T & { exiting: true }> = [];
    for (const [id, d] of prev.current) {
      if (!curr.has(id) && !timers.current.has(id)) {
        removed.push({ ...d, exiting: true });
        const t = setTimeout(() => {
          timers.current.delete(id);
          setExtra((ex) => ex.filter((x) => x.id !== id));
        }, holdMs);
        timers.current.set(id, t);
      }
    }
    if (removed.length) {
      setExtra((ex) => [
        ...ex.filter((x) => !removed.some((r) => r.id === x.id)),
        ...removed,
      ]);
    }

    prev.current = curr;
  }, [dots, holdMs]);

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  const currIds = new Set<string>();
  for (const d of dots) if (d.id) currIds.add(d.id);
  const visibleExtra = extra.filter((d) => !currIds.has(d.id as string));
  return (
    visibleExtra.length ? [...dots, ...visibleExtra] : dots
  ) as Array<T & { exiting?: boolean }>;
}

/** Soft drop-shadow that lifts a hovered/active dot. Referenced via url(#dot-glow). */
export function CourtGlowFilter() {
  return (
    <filter id="dot-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="rgba(0,0,0,0.15)" />
    </filter>
  );
}

function CourtDefs({ interactive }: { interactive: boolean }) {
  return (
    <defs>
      <CourtDotStyles />
      {interactive && <CourtGlowFilter />}
    </defs>
  );
}

/* ── Dot tooltip content ─────────────────────────────────── */

function DotTooltipContent({ dot }: { dot: CourtDot }) {
  const meta = dot.meta!;
  return (
    <div className="flex flex-col w-[200px]">
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-xl"
        style={{ backgroundColor: `${dot.color}18` }}
      >
        {dot.isAce ? (
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className="shrink-0"
          >
            <polygon
              points={starPoints(5, 5, 5, 2.5, 5)}
              fill={dot.color}
            />
          </svg>
        ) : (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: dot.color }}
          />
        )}
        <span
          className="text-[11px] font-semibold tracking-wide uppercase"
          style={{ color: dot.color }}
        >
          {meta.resultLabel}
        </span>
      </div>
      <div className="flex flex-col gap-2 px-3 py-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-medium text-[#0D0D0D] tracking-tight">
            {meta.gameScore}
          </span>
          <span className="text-[11px] text-[#525252]">
            {meta.pointScore}
          </span>
        </div>
        <div className="h-px bg-[#F0F0F0]" />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[#525252]">
            Set {meta.setNumber}
          </span>
          <span className="text-[11px] text-[#525252]">
            {meta.rallyLength} {meta.rallyLength === 1 ? "shot" : "shots"}
          </span>
        </div>
        <span className="text-[10px] text-[#888888]">{meta.serveType}</span>
      </div>
    </div>
  );
}

/* ── Dot rendering ───────────────────────────────────────── */

function dotSizes(r: number) {
  return {
    r,
    rInactive: r * 1.17,
    rActive: r * 2,
    rContact: r * 0.85,
    aceOuter: r * 2.33,
    aceOuterActive: r * 3,
    aceInner: r * 1.17,
    aceInnerActive: r * 1.5,
    squareHalf: r * 0.83,
  };
}

// Cap the cascade so a full court of dots still finishes entering quickly
// (~400ms) instead of trickling in. Decorative — never gates interaction.
export const dotStagger = (i: number) => `${Math.min(i * 0.006, 0.4)}s`;

/**
 * Plain, non-interactive shape for a dot — used for widget previews
 * (`court-dot` entrance) and for exiting ghosts (`court-dot--exit`).
 */
function staticDotShape(
  dot: CourtDot,
  s: ReturnType<typeof dotSizes>,
  className: string,
  i: number,
) {
  const dotOpacity = dot.opacity ?? 0.85;
  const style = { animationDelay: className === "court-dot" ? dotStagger(i) : "0s" };
  const key = `${className === "court-dot--exit" ? "exit-" : ""}${dot.id ?? i}`;
  if (dot.variant === "contact") {
    return dot.shape === "triangle" ? (
      <polygon key={key} className={className} style={style} points={trianglePoints(dot.cx, dot.cy, s.rContact)} fill="transparent" stroke={dot.color} strokeWidth={1.5} opacity={dotOpacity} />
    ) : (
      <circle key={key} className={className} style={style} cx={dot.cx} cy={dot.cy} r={s.rContact} fill="transparent" stroke={dot.color} strokeWidth={1.5} opacity={dotOpacity} />
    );
  }
  if (dot.shape === "triangle") {
    return <polygon key={key} className={className} style={style} points={trianglePoints(dot.cx, dot.cy, s.r)} fill={dot.color} opacity={dotOpacity} />;
  }
  return dot.isSecondServe ? (
    <rect key={key} className={className} style={style} x={dot.cx - s.squareHalf} y={dot.cy - s.squareHalf} width={s.squareHalf * 2} height={s.squareHalf * 2} rx={1} fill={dot.color} opacity={dotOpacity} />
  ) : (
    <circle key={key} className={className} style={style} cx={dot.cx} cy={dot.cy} r={s.r} fill={dot.color} opacity={dotOpacity} />
  );
}

function renderDots(
  dots: CourtDot[],
  interactive: InteractiveProps | null,
  radius = 3,
) {
  const s = dotSizes(radius);
  const { r, rInactive, rActive, rContact, aceOuter, aceOuterActive, aceInner, aceInnerActive } = s;

  return dots.map((dot, i) => {
    const dotOpacity = dot.opacity ?? 0.85;
    const isContact = dot.variant === "contact";
    const isTriangle = dot.shape === "triangle";

    /* Exiting ghost — fading out before unmount, no interaction */
    if (dot.exiting) {
      return staticDotShape(dot, s, "court-dot--exit", i);
    }

    /* Non-interactive mode (widget usage) */
    if (!interactive || !dot.id) {
      return staticDotShape(dot, s, "court-dot", i);
    }

    /* Interactive mode */
    const pairMatch = dot.pairId != null
      && (interactive.hoveredId === dot.pairId || interactive.pinnedId === dot.pairId);
    const isActive =
      interactive.hoveredId === dot.id || interactive.pinnedId === dot.id || pairMatch;

    const sharedStyle = {
      transition: "all 0.15s ease",
      animationDelay: dotStagger(i),
    };

    const shape = isContact ? (
      isTriangle ? (
        <polygon
          points={trianglePoints(dot.cx, dot.cy, isActive ? r * 1.7 : rContact)}
          fill="transparent"
          stroke={dot.color}
          strokeWidth={isActive ? 2 : 1.5}
          opacity={dotOpacity}
          filter={isActive ? "url(#dot-glow)" : undefined}
          className="court-dot"
          style={sharedStyle}
        />
      ) : (
        <circle
          cx={dot.cx}
          cy={dot.cy}
          r={isActive ? r * 1.7 : rContact}
          fill="transparent"
          stroke={dot.color}
          strokeWidth={isActive ? 2 : 1.5}
          opacity={dotOpacity}
          filter={isActive ? "url(#dot-glow)" : undefined}
          className="court-dot"
          style={sharedStyle}
        />
      )
    ) : dot.isAce ? (
      <polygon
        points={starPoints(
          dot.cx,
          dot.cy,
          isActive ? aceOuterActive : aceOuter,
          isActive ? aceInnerActive : aceInner,
          5,
        )}
        fill={dot.color}
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1}
        opacity={dotOpacity}
        filter={isActive ? "url(#dot-glow)" : undefined}
        className="court-dot"
        style={sharedStyle}
      />
    ) : isTriangle ? (
      <polygon
        points={trianglePoints(dot.cx, dot.cy, isActive ? rActive : rInactive)}
        fill={dot.color}
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1}
        opacity={dotOpacity}
        filter={isActive ? "url(#dot-glow)" : undefined}
        className="court-dot"
        style={sharedStyle}
      />
    ) : (
      <circle
        cx={dot.cx}
        cy={dot.cy}
        r={isActive ? rActive : rInactive}
        fill={dot.color}
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1}
        opacity={dotOpacity}
        filter={isActive ? "url(#dot-glow)" : undefined}
        className="court-dot"
        style={sharedStyle}
      />
    );

    const trigger = (
      <g
        onMouseEnter={() => interactive.onDotHover(dot.id!)}
        onMouseLeave={() => interactive.onDotHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          interactive.onDotClick(dot.id!);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            interactive.onDotClick(dot.id!);
          }
          if (e.key === "Escape" && interactive.pinnedId === dot.id) {
            interactive.onBackgroundClick();
          }
        }}
        className="cursor-pointer outline-none"
        tabIndex={0}
        role="button"
        aria-label={
          dot.meta
            ? `${dot.meta.resultLabel}, ${dot.meta.pointScore}`
            : "Point"
        }
      >
        {shape}
      </g>
    );

    if (!dot.meta) return <g key={dot.id}>{trigger}</g>;

    return (
      <Tooltip key={dot.id} open={isActive}>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={10}
          className="!bg-white !rounded-xl !px-0 !py-0 !text-left !w-auto !border !border-[#E7E7E7] !shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] [&>:last-child]:!hidden"
        >
          <DotTooltipContent dot={dot} />
        </TooltipContent>
      </Tooltip>
    );
  });
}

/* ── Court line helpers ──────────────────────────────────── */

const lineProps = {
  stroke: COURT_LINE,
  strokeWidth: LINE_W,
  strokeLinecap: "round" as const,
};

/* ── Half court (serve mode) ─────────────────────────────── */

export function HalfCourtSVG({
  dots,
  hoveredId,
  pinnedId,
  onDotHover,
  onDotClick,
  onBackgroundClick,
}: CourtSVGProps) {
  const interactive: InteractiveProps | null =
    onDotHover && onDotClick && onBackgroundClick
      ? {
          hoveredId: hoveredId ?? null,
          pinnedId: pinnedId ?? null,
          onDotHover,
          onDotClick,
          onBackgroundClick,
        }
      : null;

  return (
    <svg
      viewBox={`-1 -1 ${COURT_W + 2} ${COURT_H + 2}`}
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Serve placement court diagram"
      onClick={interactive?.onBackgroundClick}
    >
      <CourtDefs interactive={!!interactive} />

      {/* Court surface */}
      <rect x="0" y="0" width={COURT_W} height={COURT_H} fill={COURT_FILL} />

      {/* Doubles outline — top + sides */}
      <line x1={DOUBLES_LEFT} y1={DOUBLES_TOP} x2={DOUBLES_RIGHT} y2={DOUBLES_TOP} {...lineProps} />
      <line x1={DOUBLES_LEFT} y1={DOUBLES_TOP} x2={DOUBLES_LEFT} y2={BASELINE_Y} {...lineProps} />
      <line x1={DOUBLES_RIGHT} y1={DOUBLES_TOP} x2={DOUBLES_RIGHT} y2={BASELINE_Y} {...lineProps} />

      {/* Singles sidelines */}
      <line x1={SINGLES_LEFT} y1={DOUBLES_TOP} x2={SINGLES_LEFT} y2={BASELINE_Y} {...lineProps} />
      <line x1={SINGLES_RIGHT} y1={DOUBLES_TOP} x2={SINGLES_RIGHT} y2={BASELINE_Y} {...lineProps} />

      {/* Service line */}
      <line x1={SINGLES_LEFT} y1={SERVICE_Y} x2={SINGLES_RIGHT} y2={SERVICE_Y} {...lineProps} />

      {/* Baseline */}
      <line x1={DOUBLES_LEFT} y1={BASELINE_Y} x2={DOUBLES_RIGHT} y2={BASELINE_Y} {...lineProps} />

      {/* Center service line */}
      <line x1={CENTER_X} y1={SERVICE_Y} x2={CENTER_X} y2={BASELINE_Y} {...lineProps} />

      {/* Dots */}
      {renderDots(dots, interactive)}
    </svg>
  );
}

/* ── Full court (return mode) ────────────────────────────── */

const FULL_COURT_H = COURT_H * 2;
const NET_Y = COURT_H;

const FAR_BL = 0;
const FAR_SVC = BASELINE_Y - SERVICE_Y;
const NEAR_SVC = NET_Y + SERVICE_Y;
const NEAR_BL = FULL_COURT_H;

export const FULL_SVG_FAR_BASELINE = FAR_BL;
export const FULL_SVG_NET_Y = NET_Y;
export const FULL_SVG_NEAR_BASELINE = NEAR_BL;
// Extra canvas space above and below the court so data points (especially
// returner contact positions behind the near baseline) render in-frame. Kept
// tight so the court itself fills the frame — the bottom pad still clears ~3.4m
// behind the baseline (deeper outliers clamp to the edge); the top is cosmetic
// margin above the far baseline.
export const FULL_SVG_PAD_TOP = 20;
export const FULL_SVG_PAD_BOTTOM = 100;

export function FullCourtSVG({
  dots,
  hoveredId,
  pinnedId,
  onDotHover,
  onDotClick,
  onBackgroundClick,
}: CourtSVGProps) {
  const interactive: InteractiveProps | null =
    onDotHover && onDotClick && onBackgroundClick
      ? {
          hoveredId: hoveredId ?? null,
          pinnedId: pinnedId ?? null,
          onDotHover,
          onDotClick,
          onBackgroundClick,
        }
      : null;

  // Hold just-removed dots briefly so filter/legend changes fade out instead of
  // popping. Tab/mode switches unmount the whole SVG, so those swap cleanly.
  const dotsWithExit = useDotExit(dots);

  const fullLine = { stroke: COURT_LINE, strokeWidth: 2.25, strokeLinecap: "round" as const };
  return (
    <svg
      viewBox={`-1 ${-1 - FULL_SVG_PAD_TOP} ${COURT_W + 2} ${FULL_COURT_H + 2 + FULL_SVG_PAD_TOP + FULL_SVG_PAD_BOTTOM}`}
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Full court return placement diagram"
      onClick={interactive?.onBackgroundClick}
    >
      <CourtDefs interactive={!!interactive} />

      {/* Court surface */}
      <rect x="0" y={FAR_BL} width={COURT_W} height={FULL_COURT_H} fill={COURT_FILL} />

      {/* Doubles sidelines — full height */}
      <line x1={DOUBLES_LEFT} y1={FAR_BL} x2={DOUBLES_LEFT} y2={NEAR_BL} {...fullLine} />
      <line x1={DOUBLES_RIGHT} y1={FAR_BL} x2={DOUBLES_RIGHT} y2={NEAR_BL} {...fullLine} />

      {/* Singles sidelines — full height */}
      <line x1={SINGLES_LEFT} y1={FAR_BL} x2={SINGLES_LEFT} y2={NEAR_BL} {...fullLine} />
      <line x1={SINGLES_RIGHT} y1={FAR_BL} x2={SINGLES_RIGHT} y2={NEAR_BL} {...fullLine} />

      {/* Far baseline */}
      <line x1={DOUBLES_LEFT} y1={FAR_BL} x2={DOUBLES_RIGHT} y2={FAR_BL} {...fullLine} />

      {/* Far service line + center */}
      <line x1={SINGLES_LEFT} y1={FAR_SVC} x2={SINGLES_RIGHT} y2={FAR_SVC} {...fullLine} />
      <line x1={CENTER_X} y1={FAR_SVC} x2={CENTER_X} y2={NET_Y} {...fullLine} />

      {/* Near service line + center */}
      <line x1={SINGLES_LEFT} y1={NEAR_SVC} x2={SINGLES_RIGHT} y2={NEAR_SVC} {...fullLine} />
      <line x1={CENTER_X} y1={NET_Y} x2={CENTER_X} y2={NEAR_SVC} {...fullLine} />

      {/* Near baseline */}
      <line x1={DOUBLES_LEFT} y1={NEAR_BL} x2={DOUBLES_RIGHT} y2={NEAR_BL} {...fullLine} />

      {/* Net */}
      <line x1={0} y1={NET_Y} x2={COURT_W} y2={NET_Y} stroke={COURT_LINE} strokeWidth={3} strokeLinecap="round" />

      {/* Dots */}
      {renderDots(dotsWithExit, interactive, 3.75)}
    </svg>
  );
}
