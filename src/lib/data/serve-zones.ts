/**
 * Serve placement — the pure half: real-court metres → the normalised
 * service-box coordinates the dots plot in, which zone a dot fell in, and the
 * per-zone tallies under a serve map.
 *
 * No React and no `"use client"`, on purpose. `serve-placement-widget.tsx`
 * is a client module, and a server loader (`player-profile-server.ts`)
 * cannot call a client module's functions at all — Next refuses at runtime.
 * The widget re-exports everything here, so its callers are unchanged; this
 * file is simply where the arithmetic lives now.
 *
 * ── Whose serves ────────────────────────────────────────────────────────────
 * Nothing here decides whose point a row is. `serverIsPlayer1` arrives on
 * the input and is only ever compared, never inferred — the caller filters
 * to the side it means before a point reaches `pointToServeDot`.
 */

export type ServeResult = "won" | "lost" | "ace" | "doubleFault";

export interface ServeDot {
  id?: string; // stable point id — enables exit animation when filtered out
  x: number;
  y: number;
  isFirstServe: boolean;
  result?: ServeResult;
  setNumber?: number;
  pointScore?: string | null;
  gameScore?: string | null;
}

export interface ServePointInput {
  id: string;
  serverIsPlayer1: boolean;
  firstShotLandingX: number | null;
  firstShotLandingY: number | null;
  firstShotZone?: string | null;
  firstShotSpin?: string | null;
  firstShotType?: string | null;
  firstShotResult?: string | null; // SwingVision In/Out/Net for the serve shot
  resultType?: string | null;
  wonByPlayer1?: boolean;
  setNumber?: number;
  pointScore?: string | null;
  gameScore?: string | null;
  // Return (second shot of the point when the first serve was in). Optional —
  // only the match-detail card supplies these; the home widget skips Return.
  secondShotLandingX?: number | null;
  secondShotLandingY?: number | null;
  secondShotContactX?: number | null;
  secondShotContactY?: number | null;
  secondShotType?: string | null;
  secondShotSpin?: string | null;
  secondShotResult?: string | null; // SwingVision In/Out/Net for the return shot
  rallyLength?: number;
}

export const COURT_W = 447;
export const COURT_H = 350;

export const DOUBLES_LEFT = 37.4;
export const DOUBLES_RIGHT = 410.9;

export const SINGLES_LEFT = 84.2;
export const SINGLES_RIGHT = 362.4;
export const SERVICE_Y = 155;
export const BASELINE_Y = 331;
export const CENTER_X = (SINGLES_LEFT + SINGLES_RIGHT) / 2;
export const BOX_HALF = (SINGLES_RIGHT - SINGLES_LEFT) / 2;

export const ZONE_LINES_X = [
  SINGLES_LEFT + BOX_HALF / 3,
  SINGLES_LEFT + (BOX_HALF * 2) / 3,
  CENTER_X + BOX_HALF / 3,
  CENTER_X + (BOX_HALF * 2) / 3,
];

export const REAL_HALF_DOUBLES = 5.485;
export const REAL_SERVICE_Y = 5.485;
export const REAL_NET_Y = 11.885;
export const REAL_COURT_LENGTH = 23.77;

/**
 * SwingVision records landing coordinates in a fixed world frame. When the
 * server is at the far end (after end-changes on odd games), ly exceeds
 * REAL_NET_Y and lx is mirrored. Flip both so every serve plots in the same
 * canonical half-court [SERVICE_Y .. NET].
 */
export function normalizeLanding(lx: number, ly: number): { lx: number; ly: number } {
  if (ly > REAL_NET_Y) {
    return { lx: -lx, ly: REAL_COURT_LENGTH - ly };
  }
  return { lx, ly };
}

export function mapRealCoordsToServeDot(
  lx: number,
  ly: number,
  isFirstServe: boolean,
  servedIn = false,
): ServeDot {
  const n = normalizeLanding(lx, ly);
  const DOUBLES_HALF_W = (DOUBLES_RIGHT - DOUBLES_LEFT) / 2;
  const cx = CENTER_X + (n.lx / REAL_HALF_DOUBLES) * DOUBLES_HALF_W;
  const yFrac = (n.ly - REAL_SERVICE_Y) / (REAL_NET_Y - REAL_SERVICE_Y);
  const cy = SERVICE_Y + yFrac * (BASELINE_Y - SERVICE_Y);
  // When SwingVision flags the serve as In, trust that ruling and keep the dot
  // inside the service box (boundary-landing serves can otherwise read as out
  // due to coord imputation or float precision). Otherwise clamp to the full
  // canvas so faults — long, wide, or into the net — render at their real spot.
  const [minX, maxX, minY, maxY] = servedIn
    ? [SINGLES_LEFT + 2, SINGLES_RIGHT - 2, SERVICE_Y + 2, BASELINE_Y - 2]
    : [4, COURT_W - 4, 4, COURT_H - 4];
  const clampedX = Math.max(minX, Math.min(maxX, cx));
  const clampedY = Math.max(minY, Math.min(maxY, cy));
  return {
    x: (clampedX - SINGLES_LEFT) / (SINGLES_RIGHT - SINGLES_LEFT),
    y: (clampedY - SERVICE_Y) / (BASELINE_Y - SERVICE_Y),
    isFirstServe,
  };
}

const SCORE_MAP: Record<string, number> = { "0": 0, "15": 1, "30": 2, "40": 3, A: 3, AD: 3 };

export function getPointSide(p: ServePointInput): "deuce" | "ad" {
  const s = (p.pointScore ?? "").toUpperCase().trim();
  if (s === "DEUCE" || s === "40-40") return "deuce";
  if (/^AD?-|-AD?$/.test(s)) return "ad";
  const parts = s.split("-");
  return ((SCORE_MAP[parts[0]?.trim() ?? ""] ?? 0) + (SCORE_MAP[parts[1]?.trim() ?? ""] ?? 0)) % 2 === 0
    ? "deuce"
    : "ad";
}

export function isFirstServePoint(p: ServePointInput): boolean {
  return !(p.firstShotType?.toLowerCase().includes("second") ?? false);
}

export type PointResult = "ace" | "doubleFault" | "won" | "lost";

export function classifyPointResult(p: ServePointInput): PointResult {
  if (p.resultType === "Double Fault") return "doubleFault";
  if (p.resultType === "Ace") return "ace";
  const won = (p.wonByPlayer1 && p.serverIsPlayer1) || (!p.wonByPlayer1 && !p.serverIsPlayer1);
  return won ? "won" : "lost";
}

export function deriveZoneFromX(lx: number): string {
  const a = Math.abs(lx);
  return a >= 2.74 ? "wide" : a >= 1.37 ? "body" : "t";
}

export type ZoneKey = "deuce-wide" | "deuce-body" | "deuce-t" | "ad-t" | "ad-body" | "ad-wide";

export const ZONES: { key: ZoneKey; label: string; x1: number; x2: number }[] = [
  { key: "deuce-wide", label: "Wide", x1: SINGLES_LEFT, x2: ZONE_LINES_X[0] },
  { key: "deuce-body", label: "Body", x1: ZONE_LINES_X[0], x2: ZONE_LINES_X[1] },
  { key: "deuce-t", label: "T", x1: ZONE_LINES_X[1], x2: CENTER_X },
  { key: "ad-t", label: "T", x1: CENTER_X, x2: ZONE_LINES_X[2] },
  { key: "ad-body", label: "Body", x1: ZONE_LINES_X[2], x2: ZONE_LINES_X[3] },
  { key: "ad-wide", label: "Wide", x1: ZONE_LINES_X[3], x2: SINGLES_RIGHT },
];

export function classifyZone(x: number): ZoneKey {
  const cx = SINGLES_LEFT + x * (SINGLES_RIGHT - SINGLES_LEFT);
  for (const z of ZONES) if (cx >= z.x1 && cx < z.x2) return z.key;
  return cx < CENTER_X ? "deuce-t" : "ad-t";
}

export interface ZoneStats {
  count: number;
  pct: number;
  first: number;
  second: number;
  won: number;
  lost: number;
  ace: number;
  doubleFault: number;
  winPct: number;
}

function emptyZoneStats(): ZoneStats {
  return { count: 0, pct: 0, first: 0, second: 0, won: 0, lost: 0, ace: 0, doubleFault: 0, winPct: 0 };
}

export function computeZoneStats(dots: ServeDot[]): Record<ZoneKey, ZoneStats> | null {
  if (dots.length === 0) return null;
  const result: Record<ZoneKey, ZoneStats> = {
    "deuce-wide": emptyZoneStats(),
    "deuce-body": emptyZoneStats(),
    "deuce-t": emptyZoneStats(),
    "ad-t": emptyZoneStats(),
    "ad-body": emptyZoneStats(),
    "ad-wide": emptyZoneStats(),
  };
  for (const d of dots) {
    const z = classifyZone(d.x);
    const zs = result[z];
    zs.count++;
    if (d.isFirstServe) zs.first++;
    else zs.second++;
    if (d.result) zs[d.result]++;
  }
  const total = dots.length;
  for (const key of Object.keys(result) as ZoneKey[]) {
    const zs = result[key];
    zs.pct = Math.round((zs.count / total) * 100);
    const resolved = zs.won + zs.lost + zs.ace + zs.doubleFault;
    zs.winPct = resolved > 0 ? Math.round(((zs.won + zs.ace) / resolved) * 100) : 0;
  }
  return result;
}

// Keep serves landing within the service box plus a ~20cm line-call tolerance,
// expressed in the dot's normalized [0,1] box coordinates. x spans the ~8.23m
// singles width; y spans the service-box depth (REAL_NET_Y − REAL_SERVICE_Y, ~6.4m).
const SERVE_LINE_TOL_M = 0.2;
const SERVE_BOX_W_M = 8.23;
const SERVE_BOX_D_M = REAL_NET_Y - REAL_SERVICE_Y;
const SERVE_TOL_X = SERVE_LINE_TOL_M / SERVE_BOX_W_M;
const SERVE_TOL_Y = SERVE_LINE_TOL_M / SERVE_BOX_D_M;

export function pointToServeDot(p: ServePointInput): ServeDot | null {
  if (p.firstShotLandingX == null || p.firstShotLandingY == null) return null;
  const servedIn = p.firstShotResult === "In";
  const result = classifyPointResult(p);
  const base = mapRealCoordsToServeDot(
    p.firstShotLandingX,
    p.firstShotLandingY,
    isFirstServePoint(p),
    servedIn,
  );

  // Data-quality gate for serves NOT flagged "In" (these would otherwise plot
  // outside the box). Keep double faults regardless — a DF's out/net 2nd serve
  // is real and meaningful. For everything else (first-serve faults, and rows
  // whose coords land outside the box without an out/net result), keep only when
  // the landing is within the box plus a ~20cm line-call tolerance — so near-line
  // serves (possible missed calls) stay, while clearly-out serves are dropped.
  if (!servedIn && result !== "doubleFault") {
    const inBoxWithTolerance =
      base.x >= -SERVE_TOL_X &&
      base.x <= 1 + SERVE_TOL_X &&
      base.y >= -SERVE_TOL_Y &&
      base.y <= 1 + SERVE_TOL_Y;
    if (!inBoxWithTolerance) return null;
  }

  return {
    ...base,
    id: p.id,
    result,
    setNumber: p.setNumber,
    pointScore: p.pointScore ?? null,
    gameScore: p.gameScore ?? null,
  };
}
