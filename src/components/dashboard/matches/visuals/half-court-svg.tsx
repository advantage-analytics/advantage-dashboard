"use client";

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
  meta?: DotMeta;
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

function CourtDefs({ interactive }: { interactive: boolean }) {
  return (
    <defs>
      {interactive && (
        <>
          <filter id="dot-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="2"
              floodColor="rgba(0,0,0,0.15)"
            />
          </filter>
          <style>{`
            @keyframes courtDotIn{from{opacity:0}}
            .court-dot{animation:courtDotIn .3s cubic-bezier(.25,.46,.45,.94) both}
            @media(prefers-reduced-motion:reduce){.court-dot{animation:none}}
          `}</style>
        </>
      )}
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

function renderDots(
  dots: CourtDot[],
  interactive: InteractiveProps | null,
) {
  return dots.map((dot, i) => {
    const dotOpacity = dot.opacity ?? 0.85;

    /* Non-interactive mode (widget usage) */
    if (!interactive || !dot.id) {
      return dot.isSecondServe ? (
        <rect
          key={dot.id ?? i}
          x={dot.cx - 2.5}
          y={dot.cy - 2.5}
          width={5}
          height={5}
          rx={1}
          fill={dot.color}
          opacity={dotOpacity}
        />
      ) : (
        <circle
          key={dot.id ?? i}
          cx={dot.cx}
          cy={dot.cy}
          r={3}
          fill={dot.color}
          opacity={dotOpacity}
        />
      );
    }

    /* Interactive mode */
    const isActive =
      interactive.hoveredId === dot.id || interactive.pinnedId === dot.id;

    const sharedStyle = {
      transition: "all 0.15s ease",
      animationDelay: `${Math.min(i * 0.008, 0.8)}s`,
    };

    const shape = dot.isAce ? (
      <polygon
        points={starPoints(
          dot.cx,
          dot.cy,
          isActive ? 9 : 7,
          isActive ? 4.5 : 3.5,
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
    ) : (
      <circle
        cx={dot.cx}
        cy={dot.cy}
        r={isActive ? 6 : 3.5}
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

  return (
    <svg
      viewBox={`-1 -1 ${COURT_W + 2} ${FULL_COURT_H + 2}`}
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
      <line x1={DOUBLES_LEFT} y1={FAR_BL} x2={DOUBLES_LEFT} y2={NEAR_BL} {...lineProps} />
      <line x1={DOUBLES_RIGHT} y1={FAR_BL} x2={DOUBLES_RIGHT} y2={NEAR_BL} {...lineProps} />

      {/* Singles sidelines — full height */}
      <line x1={SINGLES_LEFT} y1={FAR_BL} x2={SINGLES_LEFT} y2={NEAR_BL} {...lineProps} />
      <line x1={SINGLES_RIGHT} y1={FAR_BL} x2={SINGLES_RIGHT} y2={NEAR_BL} {...lineProps} />

      {/* Far baseline */}
      <line x1={DOUBLES_LEFT} y1={FAR_BL} x2={DOUBLES_RIGHT} y2={FAR_BL} {...lineProps} />

      {/* Far service line + center */}
      <line x1={SINGLES_LEFT} y1={FAR_SVC} x2={SINGLES_RIGHT} y2={FAR_SVC} {...lineProps} />
      <line x1={CENTER_X} y1={FAR_BL} x2={CENTER_X} y2={FAR_SVC} {...lineProps} />

      {/* Near service line + center */}
      <line x1={SINGLES_LEFT} y1={NEAR_SVC} x2={SINGLES_RIGHT} y2={NEAR_SVC} {...lineProps} />
      <line x1={CENTER_X} y1={NEAR_SVC} x2={CENTER_X} y2={NEAR_BL} {...lineProps} />

      {/* Near baseline */}
      <line x1={DOUBLES_LEFT} y1={NEAR_BL} x2={DOUBLES_RIGHT} y2={NEAR_BL} {...lineProps} />

      {/* Net — shadow + main line */}
      <line x1={0} y1={NET_Y + 2} x2={COURT_W} y2={NET_Y + 2} stroke={COURT_LINE} strokeWidth={1.5} opacity={0.4} strokeLinecap="round" />
      <line x1={0} y1={NET_Y} x2={COURT_W} y2={NET_Y} stroke={COURT_LINE} strokeWidth={2.5} strokeLinecap="round" />

      {/* Center marks at baselines */}
      <line x1={CENTER_X} y1={FAR_BL} x2={CENTER_X} y2={FAR_BL - 4} stroke={COURT_LINE} strokeWidth={LINE_W} strokeLinecap="round" />
      <line x1={CENTER_X} y1={NEAR_BL} x2={CENTER_X} y2={NEAR_BL + 4} stroke={COURT_LINE} strokeWidth={LINE_W} strokeLinecap="round" />

      {/* Dots */}
      {renderDots(dots, interactive)}
    </svg>
  );
}
