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

const COURT_COLOR = "#D6E4F9";
const SOLID_WEIGHT = 1.5;

export interface CourtDot {
  cx: number;
  cy: number;
  color: string;
  opacity?: number;
  id?: string;
}

/* ── Half court (serve mode) ──────────────────────────────── */

export function HalfCourtSVG({ dots }: { dots: CourtDot[] }) {
  return (
    <svg
      viewBox={`-1 -1 ${COURT_W + 2} ${COURT_H + 2}`}
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Serve placement court diagram"
    >
      <rect x="0" y="0" width={COURT_W} height={COURT_H} fill="#EFF4FF" />
      {/* Doubles outline — top + sides only, no bottom */}
      <line x1={DOUBLES_LEFT} y1={DOUBLES_TOP} x2={DOUBLES_RIGHT} y2={DOUBLES_TOP} stroke={COURT_COLOR} strokeWidth={SOLID_WEIGHT} />
      <line x1={DOUBLES_LEFT} y1={DOUBLES_TOP} x2={DOUBLES_LEFT} y2={BASELINE_Y} stroke={COURT_COLOR} strokeWidth={SOLID_WEIGHT} />
      <line x1={DOUBLES_RIGHT} y1={DOUBLES_TOP} x2={DOUBLES_RIGHT} y2={BASELINE_Y} stroke={COURT_COLOR} strokeWidth={SOLID_WEIGHT} />
      {/* Singles sidelines */}
      <line x1={SINGLES_LEFT} y1={DOUBLES_TOP} x2={SINGLES_LEFT} y2={BASELINE_Y} stroke={COURT_COLOR} strokeWidth={SOLID_WEIGHT} />
      <line x1={SINGLES_RIGHT} y1={DOUBLES_TOP} x2={SINGLES_RIGHT} y2={BASELINE_Y} stroke={COURT_COLOR} strokeWidth={SOLID_WEIGHT} />
      {/* Service line */}
      <line x1={SINGLES_LEFT} y1={SERVICE_Y} x2={SINGLES_RIGHT} y2={SERVICE_Y} stroke={COURT_COLOR} strokeWidth={SOLID_WEIGHT} />
      {/* Baseline (net) — extends past court */}
      <line x1={0} y1={BASELINE_Y} x2={COURT_W} y2={BASELINE_Y} stroke={COURT_COLOR} strokeWidth={2} />
      {/* Center service line */}
      <line x1={CENTER_X} y1={SERVICE_Y} x2={CENTER_X} y2={BASELINE_Y} stroke={COURT_COLOR} strokeWidth={SOLID_WEIGHT} />
      {/* Dots */}
      {dots.map((dot, i) => (
        <circle
          key={dot.id ?? i}
          cx={dot.cx}
          cy={dot.cy}
          r={3}
          fill={dot.color}
          opacity={dot.opacity ?? 0.85}
        />
      ))}
    </svg>
  );
}

/* ── Full court (return mode) ─────────────────────────────── */

const FULL_COURT_H = COURT_H * 2;
const NET_Y = COURT_H;

const FAR_BL = 0;
const FAR_SVC = BASELINE_Y - SERVICE_Y;
const NEAR_SVC = NET_Y + SERVICE_Y;
const NEAR_BL = FULL_COURT_H;

export const FULL_SVG_FAR_BASELINE = FAR_BL;
export const FULL_SVG_NET_Y = NET_Y;
export const FULL_SVG_NEAR_BASELINE = NEAR_BL;

export function FullCourtSVG({ dots }: { dots: CourtDot[] }) {
  return (
    <svg
      viewBox={`-1 -1 ${COURT_W + 2} ${FULL_COURT_H + 2}`}
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Full court return placement diagram"
    >
      {/* Background */}
      <rect x="0" y={FAR_BL} width={COURT_W} height={FULL_COURT_H} fill="#EFF4FF" />

      {/* Doubles sidelines — full height */}
      <line x1={DOUBLES_LEFT} y1={FAR_BL} x2={DOUBLES_LEFT} y2={NEAR_BL} stroke={COURT_COLOR} strokeWidth={SOLID_WEIGHT} />
      <line x1={DOUBLES_RIGHT} y1={FAR_BL} x2={DOUBLES_RIGHT} y2={NEAR_BL} stroke={COURT_COLOR} strokeWidth={SOLID_WEIGHT} />

      {/* Singles sidelines — full height */}
      <line x1={SINGLES_LEFT} y1={FAR_BL} x2={SINGLES_LEFT} y2={NEAR_BL} stroke={COURT_COLOR} strokeWidth={SOLID_WEIGHT} />
      <line x1={SINGLES_RIGHT} y1={FAR_BL} x2={SINGLES_RIGHT} y2={NEAR_BL} stroke={COURT_COLOR} strokeWidth={SOLID_WEIGHT} />

      {/* Far baseline */}
      <line x1={DOUBLES_LEFT} y1={FAR_BL} x2={DOUBLES_RIGHT} y2={FAR_BL} stroke={COURT_COLOR} strokeWidth={SOLID_WEIGHT} />

      {/* Far service line + center */}
      <line x1={SINGLES_LEFT} y1={FAR_SVC} x2={SINGLES_RIGHT} y2={FAR_SVC} stroke={COURT_COLOR} strokeWidth={SOLID_WEIGHT} />
      <line x1={CENTER_X} y1={FAR_BL} x2={CENTER_X} y2={FAR_SVC} stroke={COURT_COLOR} strokeWidth={SOLID_WEIGHT} />

      {/* Near service line + center */}
      <line x1={SINGLES_LEFT} y1={NEAR_SVC} x2={SINGLES_RIGHT} y2={NEAR_SVC} stroke={COURT_COLOR} strokeWidth={SOLID_WEIGHT} />
      <line x1={CENTER_X} y1={NEAR_SVC} x2={CENTER_X} y2={NEAR_BL} stroke={COURT_COLOR} strokeWidth={SOLID_WEIGHT} />

      {/* Near baseline */}
      <line x1={DOUBLES_LEFT} y1={NEAR_BL} x2={DOUBLES_RIGHT} y2={NEAR_BL} stroke={COURT_COLOR} strokeWidth={SOLID_WEIGHT} />

      {/* Net — extends past court */}
      <line x1={0} y1={NET_Y} x2={COURT_W} y2={NET_Y} stroke={COURT_COLOR} strokeWidth={2} />

      {/* Dots */}
      {dots.map((dot, i) => (
        <circle
          key={dot.id ?? i}
          cx={dot.cx}
          cy={dot.cy}
          r={3}
          fill={dot.color}
          opacity={dot.opacity ?? 0.85}
        />
      ))}
    </svg>
  );
}
