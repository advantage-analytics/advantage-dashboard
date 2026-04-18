"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { MatchPoint } from "@/lib/data/match-points-server";

const MomentumChartCompact = dynamic(
  () =>
    import("@/components/dashboard/matches/performance-tracker").then(
      (m) => m.MomentumChartCompact,
    ),
  { ssr: false, loading: () => <div className="h-[180px]" aria-hidden="true" /> },
);

const RadarChartSection = dynamic(
  () =>
    import(
      "@/components/dashboard/matches/match-detail/radar-chart-section"
    ).then((m) => m.RadarChartSection),
  { ssr: false, loading: () => <div className="h-[340px]" aria-hidden="true" /> },
);

const CARD =
  "bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5";
const LABEL =
  "text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px]";
const EASE_OUT_QUINT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const P1_COLOR = "#4A8AF4";
const P2_COLOR = "#6366F1";

type TabKey = "momentum" | "sets" | "pressure" | "comparison";

const TAB_LABELS: { key: TabKey; label: string }[] = [
  { key: "momentum", label: "Momentum" },
  { key: "sets", label: "Sets" },
  { key: "pressure", label: "Pressure" },
  { key: "comparison", label: "Comparison" },
];

/* ── Computations ─────────────────────────────────────── */

interface SetBreakdown {
  setNumber: number;
  p1: number;
  p2: number;
}

interface PressureStat {
  won: number;
  total: number;
}

interface PressureStats {
  breakPoints: PressureStat;
  setPoints: PressureStat;
  longRallies: PressureStat;
}

function computeSetsBreakdown(points: MatchPoint[]): SetBreakdown[] {
  const sets = new Map<number, { p1: number; p2: number }>();
  for (const p of points) {
    const existing = sets.get(p.setNumber) ?? { p1: 0, p2: 0 };
    if (p.wonByPlayer1) existing.p1 += 1;
    else existing.p2 += 1;
    sets.set(p.setNumber, existing);
  }
  return Array.from(sets.entries())
    .sort(([a], [b]) => a - b)
    .map(([setNumber, counts]) => ({ setNumber, ...counts }));
}

function computePressureStats(points: MatchPoint[]): PressureStats {
  const stats: PressureStats = {
    breakPoints: { won: 0, total: 0 },
    setPoints: { won: 0, total: 0 },
    longRallies: { won: 0, total: 0 },
  };
  for (const p of points) {
    if (p.isBreakPoint && !p.serverIsPlayer1) {
      stats.breakPoints.total += 1;
      if (p.wonByPlayer1) stats.breakPoints.won += 1;
    }
    if (p.isSetPoint) {
      stats.setPoints.total += 1;
      if (p.wonByPlayer1) stats.setPoints.won += 1;
    }
    if (p.rallyLength >= 9) {
      stats.longRallies.total += 1;
      if (p.wonByPlayer1) stats.longRallies.won += 1;
    }
  }
  return stats;
}

/* ── Sub-components ───────────────────────────────────── */

function SetRow({ set }: { set: SetBreakdown }) {
  const total = set.p1 + set.p2;
  const p1Pct = total > 0 ? (set.p1 / total) * 100 : 0;
  const p2Pct = total > 0 ? (set.p2 / total) * 100 : 0;
  return (
    <li className="flex items-center gap-4">
      <span className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[1.5px] w-[44px] shrink-0">
        Set {set.setNumber}
      </span>
      <div className="flex-1 h-[4px] rounded-full bg-[#F3F3F3] overflow-hidden flex">
        {p1Pct > 0 ? (
          <div
            className="h-full"
            style={{ width: `${p1Pct}%`, backgroundColor: P1_COLOR }}
          />
        ) : null}
        {p2Pct > 0 ? (
          <div
            className="h-full"
            style={{ width: `${p2Pct}%`, backgroundColor: P2_COLOR }}
          />
        ) : null}
      </div>
      <span className="text-[12px] font-medium text-[#0D0D0D] tabular-nums tracking-[0.3px] min-w-[52px] text-right">
        {set.p1}–{set.p2}
      </span>
    </li>
  );
}

function PressureRow({ label, stat }: { label: string; stat: PressureStat }) {
  const pct = stat.total > 0 ? Math.round((stat.won / stat.total) * 100) : 0;
  return (
    <li className="flex items-center gap-4">
      <span className="text-[11px] font-normal text-[#0D0D0D] leading-[1.5] flex-1">
        {label}
      </span>
      {stat.total > 0 ? (
        <>
          <span className="text-[11px] font-normal text-[#525252] tabular-nums tracking-[0.3px] min-w-[44px] text-right">
            {stat.won}/{stat.total}
          </span>
          <span className="text-[12px] font-medium text-[#0D0D0D] tabular-nums tracking-[0.3px] min-w-[44px] text-right">
            {pct}%
          </span>
        </>
      ) : (
        <span className="text-[11px] text-[#CCCCCC] tabular-nums">—</span>
      )}
    </li>
  );
}

/* ── Widget ───────────────────────────────────────────── */

interface PerformanceWidgetProps {
  points: MatchPoint[];
  p1Name: string;
  p2Name: string;
  p1Short: string;
  p2Short: string;
  p1TotalPoints: number;
  p2TotalPoints: number;
  radarData: Array<{ stat: string; p1: number; p2: number }>;
}

export function PerformanceWidget({
  points,
  p1Name,
  p2Name,
  p1Short,
  p2Short,
  p1TotalPoints,
  p2TotalPoints,
  radarData,
}: PerformanceWidgetProps) {
  const [tab, setTab] = useState<TabKey>("momentum");
  const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({
    momentum: null,
    sets: null,
    pressure: null,
    comparison: null,
  });
  const idBase = useId();
  const pillLayoutId = `${idBase}-active-pill`;
  const prefersReducedMotion = useReducedMotion();

  const setsBreakdown = useMemo(() => computeSetsBreakdown(points), [points]);
  const pressureStats = useMemo(() => computePressureStats(points), [points]);

  const hasSets = setsBreakdown.length > 0;
  const hasMomentum = points.length >= 2;
  const hasRadar = radarData.length > 0;
  const hasPoints = p1TotalPoints + p2TotalPoints > 0;

  const handleTabKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (
      e.key !== "ArrowRight" &&
      e.key !== "ArrowLeft" &&
      e.key !== "Home" &&
      e.key !== "End"
    ) {
      return;
    }
    e.preventDefault();
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % TAB_LABELS.length;
    if (e.key === "ArrowLeft")
      next = (index - 1 + TAB_LABELS.length) % TAB_LABELS.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = TAB_LABELS.length - 1;
    const nextKey = TAB_LABELS[next].key;
    setTab(nextKey);
    tabRefs.current[nextKey]?.focus();
  };

  return (
    <section className={cn(CARD, "flex flex-col")}>
      {/* Header cluster — title + tabs read as a single unit (mirrors MatchStatisticsTable) */}
      <header className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className={LABEL}>Performance</h2>
          {hasPoints ? (
            <p className="text-[10px] font-normal text-[#AAAAAA] tabular-nums tracking-[0.3px]">
              <span style={{ color: P1_COLOR }}>{p1TotalPoints}</span>
              <span className="mx-1.5 text-[#CCCCCC]">·</span>
              <span style={{ color: P2_COLOR }}>{p2TotalPoints}</span>
              <span className="ml-1.5 text-[#AAAAAA]">pts</span>
            </p>
          ) : null}
        </div>
        <div
          role="tablist"
          aria-label="Performance views"
          className="flex items-center gap-1.5"
        >
          {TAB_LABELS.map((t, i) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                ref={(el) => {
                  tabRefs.current[t.key] = el;
                }}
                role="tab"
                id={`${idBase}-tab-${t.key}`}
                aria-selected={active}
                aria-controls={`${idBase}-panel-${t.key}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(t.key)}
                onKeyDown={(e) => handleTabKeyDown(e, i)}
                className={cn(
                  "relative rounded-full px-3 py-1.5 text-[10px] font-medium uppercase tracking-[2.5px] border",
                  "transition-colors duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40",
                  active
                    ? "border-transparent text-white"
                    : "bg-white border-[#EAECF0] text-[#525252] hover:bg-[#F5F5F5]",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId={pillLayoutId}
                    aria-hidden="true"
                    className="absolute inset-0 bg-[#3B82F6] rounded-full"
                    transition={
                      prefersReducedMotion
                        ? { duration: 0 }
                        : { type: "spring", bounce: 0.15, visualDuration: 0.35 }
                    }
                  />
                ) : null}
                <span className="relative z-10">{t.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      <motion.div
        key={tab}
        role="tabpanel"
        id={`${idBase}-panel-${tab}`}
        aria-labelledby={`${idBase}-tab-${tab}`}
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: prefersReducedMotion ? 0.12 : 0.22,
          ease: EASE_OUT_QUINT,
        }}
        className="mt-7"
      >
          {tab === "momentum" ? (
            hasMomentum ? (
              <MomentumChartCompact
                points={points}
                player1Name={p1Name}
                player2Name={p2Name}
              />
            ) : (
              <EmptyPanel>Needs at least 2 points to render momentum.</EmptyPanel>
            )
          ) : tab === "sets" ? (
            hasSets ? (
              <ul className="flex flex-col gap-4">
                {setsBreakdown.map((set) => (
                  <SetRow key={set.setNumber} set={set} />
                ))}
              </ul>
            ) : (
              <EmptyPanel>Set breakdown appears once points are tracked.</EmptyPanel>
            )
          ) : tab === "pressure" ? (
            <ul className="flex flex-col gap-4">
              <PressureRow label="Break Points Won" stat={pressureStats.breakPoints} />
              <PressureRow label="Set Points" stat={pressureStats.setPoints} />
              <PressureRow label="Long Rallies" stat={pressureStats.longRallies} />
            </ul>
          ) : (
            hasRadar ? (
              <RadarChartSection
                data={radarData}
                p1Name={p1Short}
                p2Name={p2Short}
              />
            ) : (
              <EmptyPanel>Comparison appears once stats are computed.</EmptyPanel>
            )
          )}
      </motion.div>
    </section>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-8 flex items-center justify-center">
      <p className="text-[11px] font-normal text-[#888888] leading-[1.6]">
        {children}
      </p>
    </div>
  );
}
