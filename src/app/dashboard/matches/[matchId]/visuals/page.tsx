"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, usePathname, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  HalfCourtSVG,
  FullCourtSVG,
  type CourtDot,
  SINGLES_LEFT,
  SINGLES_RIGHT,
  SERVICE_Y,
  BASELINE_Y,
  CENTER_X,
  COURT_W,
  FULL_SVG_FAR_BASELINE,
  FULL_SVG_NET_Y,
} from "@/components/dashboard/matches/visuals/half-court-svg";
import { FilterPills } from "@/components/dashboard/matches/visuals/filter-pills";
import type { VisualizationType } from "@/components/dashboard/matches/visuals/types/filters.types";
import { useVisualFilters } from "@/hooks/use-visual-filters";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { cn } from "@/lib/utils";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type {
  FilterGroupConfig,
  FilterOption,
  FilterContextData,
} from "@/components/dashboard/matches/visuals/types/filters.types";
import { isDynamicOption } from "@/components/dashboard/matches/visuals/types/filters.types";

const EASE_CURVE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/* ── Color modes ──────────────────────────────────────────── */

type ColorMode = "serveType" | "result";

const SERVE_TYPE_COLORS = {
  first: "rgba(59,130,246,0.5)",
  second: "rgba(129,140,248,0.5)",
};

const RESULT_COLORS = {
  ace: "#F59E0B",
  won: "#22C55E",
  lost: "#EF4444",
  doubleFault: "#94A3B8",
} as const;

type DotResult = keyof typeof RESULT_COLORS;

function classifyResult(point: MatchPoint): DotResult {
  if (point.resultType === "Double Fault") return "doubleFault";
  if (point.resultType === "Ace") return "ace";
  const serverWon =
    (point.wonByPlayer1 && point.serverIsPlayer1) ||
    (!point.wonByPlayer1 && !point.serverIsPlayer1);
  return serverWon ? "won" : "lost";
}

function isFirstServe(point: MatchPoint): boolean {
  return !(point.firstShotType?.toLowerCase().includes("second") ?? false);
}

/* ── Court side / zone helpers ────────────────────────────── */

const TENNIS_SCORE_TO_COUNT: Record<string, number> = {
  "0": 0, "15": 1, "30": 2, "40": 3, "A": 3, "AD": 3,
};

function getPointSide(point: MatchPoint): "deuce" | "ad" {
  const score = (point.pointScore ?? "").toUpperCase().trim();
  if (score === "DEUCE" || score === "40-40") return "deuce";
  if (/^AD?-|-AD?$/.test(score)) return "ad";
  const parts = score.split("-");
  const p1 = TENNIS_SCORE_TO_COUNT[parts[0]?.trim() ?? ""] ?? 0;
  const p2 = TENNIS_SCORE_TO_COUNT[parts[1]?.trim() ?? ""] ?? 0;
  return (p1 + p2) % 2 === 0 ? "deuce" : "ad";
}

function seededRandom(id: string, seed: number): number {
  let hash = seed;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  hash = ((hash * 1664525 + 1013904223) | 0) >>> 0;
  return (hash % 10000) / 10000;
}

const ZONE_W = (SINGLES_RIGHT - SINGLES_LEFT) / 6;

function getZoneXRange(zone: string, side: "deuce" | "ad"): [number, number] {
  const z = zone.toLowerCase();
  if (side === "deuce") {
    if (z === "wide") return [SINGLES_LEFT, SINGLES_LEFT + ZONE_W];
    if (z === "body") return [SINGLES_LEFT + ZONE_W, SINGLES_LEFT + 2 * ZONE_W];
    return [SINGLES_LEFT + 2 * ZONE_W, CENTER_X];
  }
  if (z === "t") return [CENTER_X, CENTER_X + ZONE_W];
  if (z === "body") return [CENTER_X + ZONE_W, CENTER_X + 2 * ZONE_W];
  return [CENTER_X + 2 * ZONE_W, SINGLES_RIGHT];
}

function deriveZoneFromX(landingX: number): string {
  const absX = Math.abs(landingX);
  if (absX >= 2.74) return "wide";
  if (absX >= 1.37) return "body";
  return "t";
}

/* Real court dimensions in meters */
const REAL_HALF_DOUBLES = 5.485;
const REAL_SERVICE_LINE_Y = 5.485;
const REAL_NET_Y = 11.885;

/* ── Dot mapping ──────────────────────────────────────────── */

function mapServeDot(point: MatchPoint, colorMode: ColorMode): CourtDot | null {
  const lx = point.firstShotLandingX;
  const ly = point.firstShotLandingY;
  const result = classifyResult(point);
  const side = getPointSide(point);

  let cx: number;
  let cy: number;

  if (lx != null && ly != null) {
    const absX = Math.abs(lx);
    const signedX = side === "deuce" ? -absX : absX;
    cx = CENTER_X + (signedX / REAL_HALF_DOUBLES) * (COURT_W / 2);
    const yFrac = (ly - REAL_SERVICE_LINE_Y) / (REAL_NET_Y - REAL_SERVICE_LINE_Y);
    cy = SERVICE_Y + yFrac * (BASELINE_Y - SERVICE_Y);

    if (result === "doubleFault") {
      cx = Math.max(4, Math.min(COURT_W - 4, cx));
      cy = Math.max(4, Math.min(BASELINE_Y + 15, cy));
    } else {
      cx = Math.max(SINGLES_LEFT + 2, Math.min(SINGLES_RIGHT - 2, cx));
      cy = Math.max(SERVICE_Y + 2, Math.min(BASELINE_Y - 2, cy));
    }
  } else if (result === "doubleFault") {
    const jx = seededRandom(point.id, 1);
    const jy = seededRandom(point.id, 2);
    cx = SINGLES_LEFT + jx * (SINGLES_RIGHT - SINGLES_LEFT);
    cy = SERVICE_Y + 8 + jy * (BASELINE_Y - SERVICE_Y - 16);
  } else {
    const zone = point.firstShotZone ?? "body";
    const [xMin, xMax] = getZoneXRange(zone, side);
    const jx = seededRandom(point.id, 1);
    const jy = seededRandom(point.id, 2);
    const margin = 8;
    cx = xMin + margin + jx * (xMax - xMin - margin * 2);
    cy = SERVICE_Y + margin + jy * (BASELINE_Y - SERVICE_Y - margin * 2);
  }

  const color =
    colorMode === "serveType"
      ? isFirstServe(point) ? SERVE_TYPE_COLORS.first : SERVE_TYPE_COLORS.second
      : RESULT_COLORS[result];

  return { cx, cy, color, opacity: 0.85, id: point.id };
}

function mapReturnDot(point: MatchPoint, colorMode: ColorMode): CourtDot | null {
  const lx = point.secondShotLandingX;
  const ly = point.secondShotLandingY;
  const result = classifyResult(point);

  const color =
    colorMode === "serveType"
      ? isFirstServe(point) ? SERVE_TYPE_COLORS.first : SERVE_TYPE_COLORS.second
      : RESULT_COLORS[result];

  const farHalfH = FULL_SVG_NET_Y - FULL_SVG_FAR_BASELINE;
  let cx: number;
  let cy: number;

  if (lx != null && ly != null) {
    cx = CENTER_X + (lx / REAL_HALF_DOUBLES) * (COURT_W / 2);
    cy = FULL_SVG_FAR_BASELINE + (ly / REAL_NET_Y) * farHalfH;
    cx = Math.max(4, Math.min(COURT_W - 4, cx));
    cy = Math.max(FULL_SVG_FAR_BASELINE + 4, Math.min(FULL_SVG_NET_Y - 4, cy));
  } else {
    const side = getPointSide(point);
    const zone = point.secondShotZone ?? "body";
    const [xMin, xMax] = getZoneXRange(zone, side);
    const jx = seededRandom(point.id, 1);
    const jy = seededRandom(point.id, 2);
    const margin = 12;
    cx = xMin + margin + jx * (xMax - xMin - margin * 2);
    cy = FULL_SVG_FAR_BASELINE + margin + jy * (farHalfH - margin * 2);
  }

  return { cx, cy, color, opacity: 0.85, id: point.id };
}

/* ── Legend configs ────────────────────────────────────────── */

const SERVE_TYPE_LEGEND = [
  { color: SERVE_TYPE_COLORS.first, label: "First Serve" },
  { color: SERVE_TYPE_COLORS.second, label: "Second Serve" },
];

const RESULT_LEGEND = [
  { color: RESULT_COLORS.ace, label: "Ace" },
  { color: RESULT_COLORS.won, label: "Point Won" },
  { color: RESULT_COLORS.lost, label: "Point Lost" },
  { color: RESULT_COLORS.doubleFault, label: "Double Fault" },
];

/* ── Filter helpers ───────────────────────────────────────── */

function resolveOptions(
  group: FilterGroupConfig,
  contextData: FilterContextData
): FilterOption[] {
  return group.options.map((option) => {
    if (isDynamicOption(option)) {
      return { value: option.value, label: contextData[option.labelKey] };
    }
    return option;
  });
}

/* ── Page component ───────────────────────────────────────── */

export default function VisualsPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const { match, points } = useMatchData();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vizParam = searchParams.get("viz") as VisualizationType | null;
  const prefersReducedMotion = useReducedMotion();

  const [colorMode, setColorMode] = useState<ColorMode>("serveType");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const {
    visualizationType,
    setVisualizationType,
    config,
    filters,
    setFilters,
  } = useVisualFilters({ initialType: vizParam ?? "serve" });

  const handleTabClick = useCallback(
    (type: VisualizationType) => {
      setVisualizationType(type);
      setFiltersOpen(false);
      router.replace(pathname + "?viz=" + type, { scroll: false });
    },
    [setVisualizationType, router, pathname]
  );

  const isReturn = visualizationType === "return";

  const activeFilterCount = useMemo(
    () => Object.values(filters).reduce((n, arr) => n + arr.length, 0),
    [filters]
  );

  const clearAllFilters = useCallback(() => {
    const cleared = Object.fromEntries(Object.keys(filters).map((k) => [k, []]));
    setFilters(cleared);
  }, [filters, setFilters]);

  const updateFilter = useCallback(
    (key: string, value: string[]) => setFilters({ ...filters, [key]: value }),
    [filters, setFilters]
  );

  // Active filter labels for empty state
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    const allGroups = config.rows.flat().filter(Boolean) as FilterGroupConfig[];
    for (const group of allGroups) {
      const selected = filters[group.key] ?? [];
      if (selected.length > 0) {
        const resolved = resolveOptions(group, {
          player1Name: match.player1.name,
          player2Name: match.player2.name,
        });
        for (const val of selected) {
          const opt = resolved.find((o) => o.value === val);
          if (opt) labels.push(opt.label);
        }
      }
    }
    return labels;
  }, [config, filters, match]);

  // Build filter sets
  const playerSet = useMemo(() => new Set(filters.player ?? []), [filters.player]);
  const typeSet = useMemo(() => new Set(filters.type ?? []), [filters.type]);
  const sideSet = useMemo(() => new Set(filters.side ?? []), [filters.side]);
  const resultSet = useMemo(() => new Set(filters.result ?? []), [filters.result]);
  const setSet = useMemo(() => new Set(filters.set ?? []), [filters.set]);
  const zoneSet = useMemo(() => new Set(filters.zone ?? []), [filters.zone]);
  const otherSet = useMemo(() => new Set(filters.other ?? []), [filters.other]);
  const spinSet = useMemo(() => new Set(filters.spin ?? []), [filters.spin]);

  const filteredPoints = useMemo(() => {
    return points.filter((p) => {
      if (isReturn) {
        if (!p.secondShotZone && p.secondShotLandingX == null) return false;
        if (playerSet.size > 0) {
          const returnerKey = p.serverIsPlayer1 ? "player2" : "player1";
          if (!playerSet.has(returnerKey)) return false;
        }
      } else {
        if (!p.firstShotZone && p.firstShotLandingX == null && p.resultType !== "Double Fault") return false;
        if (playerSet.size > 0) {
          const serverKey = p.serverIsPlayer1 ? "player1" : "player2";
          if (!playerSet.has(serverKey)) return false;
        }
      }

      if (typeSet.size > 0) {
        const first = isFirstServe(p);
        if (typeSet.has("first") && !first) return false;
        if (typeSet.has("second") && first) return false;
      }

      if (resultSet.size > 0 && !resultSet.has(classifyResult(p))) return false;
      if (setSet.size > 0 && !setSet.has(String(p.setNumber))) return false;
      if (otherSet.size > 0 && otherSet.has("doubleFault") && classifyResult(p) !== "doubleFault") return false;

      if (spinSet.size > 0) {
        const spin = (isReturn ? p.secondShotSpin : p.firstShotSpin)?.toLowerCase();
        if (!spin || !spinSet.has(spin)) return false;
      }

      return true;
    });
  }, [points, isReturn, playerSet, typeSet, resultSet, setSet, otherSet, spinSet]);

  const dots = useMemo(() => {
    const result: CourtDot[] = [];
    for (const p of filteredPoints) {
      const side = getPointSide(p);
      const activeSide: "deuce" | "ad" | "both" =
        sideSet.size === 1 ? (sideSet.has("deuce") ? "deuce" : "ad") : "both";
      const sideDimmed = (activeSide === "deuce" && side === "ad") || (activeSide === "ad" && side === "deuce");

      const shotZone = isReturn ? p.secondShotZone : p.firstShotZone;
      let effectiveZone = shotZone?.toLowerCase();
      if (!effectiveZone) {
        const lx = isReturn ? p.secondShotLandingX : p.firstShotLandingX;
        if (lx != null) effectiveZone = deriveZoneFromX(lx);
      }
      const zoneDimmed = zoneSet.size > 0 && effectiveZone && !zoneSet.has(effectiveZone);
      const dimFactor = sideDimmed || zoneDimmed ? 0.15 : 1;

      const dot = isReturn ? mapReturnDot(p, colorMode) : mapServeDot(p, colorMode);
      if (dot) {
        result.push({ ...dot, opacity: (dot.opacity ?? 0.85) * dimFactor });
      }
    }
    return result;
  }, [filteredPoints, colorMode, isReturn, sideSet, zoneSet]);

  const legend = colorMode === "serveType" ? SERVE_TYPE_LEGEND : RESULT_LEGEND;

  const contextData = useMemo(
    () => ({ player1Name: match.player1.name, player2Name: match.player2.name }),
    [match]
  );

  const flatGroups = useMemo(
    () => config.rows.flat().filter(Boolean) as FilterGroupConfig[],
    [config]
  );

  return (
    <div className="px-8 py-10">
      {/* Page heading */}
      <div className="flex flex-col gap-2 mb-8">
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[3px]">
          <Link
            href={`/dashboard/matches/${matchId}`}
            className="hover:text-[#888888] transition-colors duration-200"
          >
            {match.player1.name} vs {match.player2.name}
          </Link>
          <span className="text-[#CCCCCC]">/</span>
          <span>Visuals</span>
        </div>
        <h1 className="text-[32px] font-light text-[#0A0A0C] leading-[48px] tracking-[-0.5px]">
          Court Visualization
        </h1>
      </div>

      {/* Single unified card */}
      <motion.div
        initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_CURVE }}
        className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] overflow-hidden"
      >
        {/* ── Controls row ── */}
        <div className="flex items-center justify-between px-6 py-3.5 flex-wrap gap-3">
          {/* Left: Serve / Return primary toggle */}
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              {(["serve", "return"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => handleTabClick(type)}
                  className={cn(
                    "rounded-full h-8 px-4 text-[12px] font-medium transition-colors duration-200 active:scale-[0.97]",
                    visualizationType === type
                      ? "bg-[#60A5FA] text-white"
                      : "ring-1 ring-inset ring-[#D9D9D9] text-[#525252] bg-white hover:bg-[#EFF6FF] hover:ring-[#3B82F6]/30 hover:text-[#3B82F6]"
                  )}
                >
                  {type === "serve" ? "Serve" : "Return"}
                </button>
              ))}
            </div>

            {/* Separator */}
            <div className="w-px h-5 bg-[#F0F0F0]" />

            {/* Color mode secondary toggle */}
            <div className="flex gap-1.5">
              {(["serveType", "result"] as [ColorMode, ColorMode]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setColorMode(mode)}
                  className={cn(
                    "rounded-full h-7 px-3 text-[11px] font-medium transition-colors duration-200 active:scale-[0.97]",
                    colorMode === mode
                      ? "ring-1 ring-inset ring-[#3B82F6] text-[#3B82F6] bg-[#EBF2FD]"
                      : "ring-1 ring-inset ring-[#EAECF0] text-[#525252] bg-white hover:bg-[#EFF6FF] hover:ring-[#3B82F6]/30 hover:text-[#3B82F6]"
                  )}
                >
                  {mode === "serveType" ? "1st / 2nd" : "Win / Loss"}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Filters toggle + count */}
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            className={cn(
              "flex items-center gap-2 rounded-full h-8 px-3.5 text-[11px] font-medium transition-colors duration-200 active:scale-[0.97]",
              filtersOpen || activeFilterCount > 0
                ? "ring-1 ring-inset ring-[#3B82F6] text-[#3B82F6] bg-[#EBF2FD]"
                : "ring-1 ring-inset ring-[#EAECF0] text-[#525252] bg-white hover:bg-[#EFF6FF] hover:ring-[#3B82F6]/30 hover:text-[#3B82F6]"
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex items-center justify-center h-[18px] min-w-[18px] rounded-full bg-[#3B82F6] text-white text-[10px] font-semibold tabular-nums px-1">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* ── Inline expandable filters ── */}
        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div
              key="filters"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE_CURVE }}
              className="overflow-hidden border-t border-[#F3F3F3]"
            >
              <div className="px-6 py-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
                    Filters
                  </span>
                  <div className="flex items-center gap-3">
                    {activeFilterCount > 0 && (
                      <button
                        onClick={clearAllFilters}
                        className="text-[9px] font-medium uppercase tracking-[1.5px] text-[#3B82F6] hover:text-[#2563EB] transition-colors duration-200"
                      >
                        Clear all
                      </button>
                    )}
                    <button
                      onClick={() => setFiltersOpen(false)}
                      className="text-[#AAAAAA] hover:text-[#525252] transition-colors duration-200"
                      aria-label="Close filters"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-x-8 gap-y-4">
                  {flatGroups.map((group) => (
                    <FilterPills
                      key={group.key}
                      label={group.label}
                      options={resolveOptions(group, contextData)}
                      selected={filters[group.key] ?? []}
                      onChange={(v) => updateFilter(group.key, v)}
                      multiSelect={group.multiSelect !== false}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Court ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={visualizationType}
            initial={prefersReducedMotion ? undefined : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_CURVE }}
            className={cn(
              "bg-[#EFF4FF] flex items-center justify-center px-6 py-8",
              isReturn ? "min-h-[600px]" : "min-h-[420px]"
            )}
          >
            {dots.length === 0 ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <p className="text-[13px] text-[#888888]">
                  {activeFilterCount > 0
                    ? `No points match: ${activeFilterLabels.join(" + ")}`
                    : "No placement data available."}
                </p>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearAllFilters}
                    className="text-[11px] font-medium text-[#3B82F6] hover:text-[#2563EB] transition-colors duration-200"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className={cn("w-full", isReturn ? "max-w-[400px]" : "max-w-[550px]")}>
                {isReturn ? <FullCourtSVG dots={dots} /> : <HalfCourtSVG dots={dots} />}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* ── Legend + count ── */}
        <div className="flex items-center justify-between px-6 py-3.5">
          <div className="flex gap-5 items-center flex-wrap">
            {legend.map(({ color, label }) => (
              <div key={label} className="flex gap-1.5 items-center">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span className="text-[10px] font-normal text-[#AAAAAA] tracking-[1px] uppercase">
                  {label}
                </span>
              </div>
            ))}
          </div>
          <motion.span
            key={dots.length}
            initial={prefersReducedMotion ? undefined : { opacity: 0.4 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="text-[10px] font-normal text-[#AAAAAA] tabular-nums shrink-0"
          >
            {dots.length} point{dots.length !== 1 ? "s" : ""} shown
          </motion.span>
        </div>
      </motion.div>
    </div>
  );
}
