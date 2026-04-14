"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Info, ArrowLeft } from "lucide-react";
import Link from "next/link";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { motion, useReducedMotion } from "framer-motion";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { MomentumChartCompact } from "@/components/dashboard/matches/performance-tracker";
import { MatchStatistics } from "@/components/dashboard/matches/match-statistics";
import { CourtPlacementSection } from "@/components/dashboard/matches/sections/court-placement-section";
import { VideoSection } from "@/components/dashboard/matches/sections/video-section";
import { TacticalPatterns } from "@/components/dashboard/matches/tactical-patterns";
import { StatSnapshotCard } from "@/components/dashboard/matches/stat-snapshot-card";
import { shortName } from "@/lib/data/match-utils";
import { cn } from "@/lib/utils";
import type { PlayerStatistics } from "@/lib/data/types";

/* ── Constants ──────────────────────────────────────────── */

const P1_COLOR = "#3B82F6";
const P2_COLOR = "#F38439";
const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];
const FADE_INITIAL = { opacity: 0, y: 8 };
const FADE_ANIMATE = { opacity: 1, y: 0 };
const FADE_TRANSITION = { duration: 0.3, ease: EASE };

const RADAR_STATS: { key: keyof PlayerStatistics; label: string }[] = [
  { key: "firstServeInPct", label: "First Serve In" },
  { key: "firstServeWinPct", label: "First Serve Points Won" },
  { key: "secondServeWinPct", label: "Second Serve Points Won" },
  { key: "serviceGamesWonPct", label: "Service Games Won" },
  { key: "breakpointsWonPct", label: "Breakpoints Won" },
  { key: "firstReturnWonPct", label: "First Serve Return Won" },
  { key: "secondReturnWonPct", label: "Second Return Points Won" },
  { key: "returnGamesWonPct", label: "Return Games" },
];

const SNAPSHOT_STATS: {
  key: keyof PlayerStatistics;
  label: string;
  isPercentage: boolean;
}[] = [
  { key: "firstServeInPct", label: "1st Serve %", isPercentage: true },
  { key: "firstServeWinPct", label: "Serve Points Won", isPercentage: true },
  { key: "netPointsWonPct", label: "Net Rating", isPercentage: true },
  { key: "breakpointsWonPct", label: "BP Converted", isPercentage: true },
  { key: "secondServeWinPct", label: "2nd Serve Won", isPercentage: true },
  { key: "returnGamesWonPct", label: "Return Games", isPercentage: true },
  { key: "shortRallyWonPct", label: "Short Rally", isPercentage: true },
  { key: "longRallyWonPct", label: "Long Rally", isPercentage: true },
  { key: "serviceGamesWonPct", label: "Service Games", isPercentage: true },
  { key: "firstReturnWonPct", label: "Return Won", isPercentage: true },
  { key: "mediumRallyWonPct", label: "Medium Rally", isPercentage: true },
  { key: "secondReturnWonPct", label: "2nd Return Won", isPercentage: true },
];

const TOC_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Performance" },
  { id: "court", label: "Court" },
  { id: "statistics", label: "Statistics" },
  { id: "video", label: "Video" },
] as const;

/* ── Hooks ──────────────────────────────────────────────── */

function useActiveSection(): string {
  const [active, setActive] = useState("result");

  useEffect(() => {
    const ids = TOC_SECTIONS.map((s) => s.id);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  return active;
}

/* ── Helpers ────────────────────────────────────────────── */

function getRatingLabel(score: number): string {
  if (score >= 85) return "Dominant";
  if (score >= 75) return "Excellent";
  if (score >= 65) return "Very Good";
  if (score >= 55) return "Solid";
  if (score >= 45) return "Average";
  if (score >= 35) return "Below Average";
  if (score >= 25) return "Needs Work";
  return "Poor";
}

function renderPolarAngleLabel(props: {
  payload: { value: string };
  x: number;
  y: number;
  cx: number;
  cy: number;
}) {
  const { payload, x, y, cx, cy } = props;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const offsetX = (dx / dist) * 14;
  const offsetY = (dy / dist) * 14;

  return (
    <text
      x={x + offsetX}
      y={y + offsetY}
      textAnchor={x > cx ? "start" : x < cx ? "end" : "middle"}
      dominantBaseline={y > cy ? "hanging" : y < cy ? "auto" : "central"}
      className="fill-[#AAAAAA] text-[10px]"
    >
      {payload.value}
    </text>
  );
}

/** Pick the 6 most interesting stats: 3 best vs opponent, 3 worst. */
function pickDynamicStats(
  p1: PlayerStatistics,
  p2: PlayerStatistics,
): typeof SNAPSHOT_STATS {
  const scored = SNAPSHOT_STATS.map((stat) => {
    const v1 = (p1[stat.key] as number) ?? 0;
    const v2 = (p2[stat.key] as number) ?? 0;
    return { ...stat, diff: v1 - v2 };
  });

  scored.sort((a, b) => b.diff - a.diff);
  const best = scored.slice(0, 3);
  const worst = scored.slice(-3).reverse();
  return [...best, ...worst];
}

/* ── Page ───────────────────────────────────────────────── */

export default function MatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const {
    match,
    statsResult,
    insights,
    keyMoments,
    points,
    playerAverages,
  } = useMatchData();
  const prefersReduced = useReducedMotion();
  const activeSection = useActiveSection();

  const p1 = statsResult?.statistics?.player1Stats;
  const p2 = statsResult?.statistics?.player2Stats;
  const p1Short = shortName(
    statsResult?.player1Name ?? match.player1.name,
    14,
  );
  const p2Short = shortName(
    statsResult?.player2Name ?? match.player2.name,
    14,
  );

  const radarData = useMemo(() => {
    if (!p1 || !p2) return [];
    return RADAR_STATS.map((stat) => ({
      stat: stat.label,
      p1: (p1[stat.key] as number) ?? 0,
      p2: (p2[stat.key] as number) ?? 0,
    }));
  }, [p1, p2]);

  const overallRating = p1
    ? Math.round(
        (p1.serveRating + p1.returnRating + p1.underPressureRating) / 3,
      )
    : null;
  const ratingLabel =
    overallRating !== null ? getRatingLabel(overallRating) : null;

  const strengths = insights?.player1?.strengths ?? [];
  const weaknesses = insights?.player1?.weaknesses ?? [];
  const matchSummary =
    strengths[0]?.description || weaknesses[0]?.description || null;

  const dynamicStats = useMemo(
    () => (p1 && p2 ? pickDynamicStats(p1, p2) : []),
    [p1, p2],
  );

  const tacticalItems = useMemo(
    () => [
      ...strengths.map(s => ({ ...s, type: "strength" as const })),
      ...weaknesses.map(w => ({ ...w, type: "weakness" as const })),
    ],
    [strengths, weaknesses],
  );

  return (
    <div className="flex">
      {/* ── Main content ───────────────────────────────── */}
      <div className="flex-1 min-w-0 px-8 pt-6 pb-20">
        {/* ═══ OVERVIEW ═══════════════════════════════ */}
        <section id="overview" className="mb-20">
          {/* Result */}
          <motion.div
            className="mb-8"
            initial={prefersReduced ? false : FADE_INITIAL}
            animate={FADE_ANIMATE}
            transition={FADE_TRANSITION}
          >
            <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px] mb-3">
              Match Result
            </p>
            <div className="flex items-center gap-3">
              <span className="text-[40px] font-light text-[#0D0D0D] tracking-[-0.5px] tabular-nums leading-[48px]">
                {match.score.finalScore}
              </span>
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-1 rounded-[6px] text-[10px] font-semibold",
                  match.won
                    ? "bg-[rgba(115,230,104,0.15)] text-[#5DB955]"
                    : "bg-[rgba(229,24,55,0.15)] text-[#E51837]",
                )}
              >
                {match.won ? "Won" : "Lost"}
              </span>
            </div>
          </motion.div>

          {/* Analysis + Radar */}
          <motion.div
            className="flex gap-8 mb-10"
            initial={prefersReduced ? false : FADE_INITIAL}
            animate={FADE_ANIMATE}
            transition={{ duration: 0.3, delay: 0.1, ease: EASE }}
          >
            <div className="min-w-[300px] max-w-[420px] shrink-0 flex flex-col gap-8">
              {ratingLabel && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px]">
                      Your Rating
                    </p>
                    <span
                      title={`Computed from Serve Rating (${p1?.serveRating ?? 0}), Return Rating (${p1?.returnRating ?? 0}), and Under Pressure Rating (${p1?.underPressureRating ?? 0})`}
                      className="cursor-help"
                    >
                      <Info className="h-3 w-3 text-[#8A8A8E]" aria-hidden="true" />
                    </span>
                  </div>
                  <p className="text-[24px] font-light text-[#0D0D0D] tracking-[-0.4px]">
                    {ratingLabel}
                  </p>
                </div>
              )}

              {matchSummary && (
                <CollapsibleAnalysis summary={matchSummary} />
              )}
            </div>

            {radarData.length > 0 && (
              <div
                className="flex-1 min-w-0"
                role="img"
                aria-label={`Radar chart comparing ${p1Short} and ${p2Short}`}
              >
                <ResponsiveContainer width="100%" height={340}>
                  <RadarChart cx="50%" cy="50%" outerRadius="68%" data={radarData}>
                    <PolarGrid stroke="#E5E5EA" strokeWidth={0.5} />
                    <PolarAngleAxis dataKey="stat" tick={renderPolarAngleLabel as never} tickLine={false} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name={p1Short} dataKey="p1" stroke={P1_COLOR} fill={P1_COLOR} fillOpacity={0.15} strokeWidth={1.5} dot={{ r: 3, fill: P1_COLOR, strokeWidth: 0 }} />
                    <Radar name={p2Short} dataKey="p2" stroke={P2_COLOR} fill={P2_COLOR} fillOpacity={0.15} strokeWidth={1.5} dot={{ r: 3, fill: P2_COLOR, strokeWidth: 0 }} />
                    <Legend verticalAlign="bottom" iconType="circle" iconSize={6} wrapperStyle={{ fontSize: "10px", color: "#AAAAAA", paddingTop: "8px" }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
          </motion.div>

          {/* Tactical Patterns */}
          {tacticalItems.length > 0 && (
            <TacticalPatterns items={tacticalItems} />
          )}
        </section>

        {/* ═══ PERFORMANCE ════════════════════════════ */}
        <section id="performance" className="mb-20">
          {/* Momentum Tracker */}
          {points.length > 0 && (
            <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] overflow-hidden p-5 flex flex-col gap-4 mb-12">
              <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px]">
                Performance Tracker
              </p>
              <MomentumChartCompact
                points={points}
                player1Name={statsResult?.player1Name ?? "Player 1"}
                player2Name={statsResult?.player2Name ?? "Player 2"}
              />
            </div>
          )}

          {/* Key Moments */}
          {keyMoments.length > 0 && (
            <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5">
              <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px] mb-4">
                Key Moments
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {keyMoments.slice(0, 6).map((moment, i) => (
                  <motion.div
                    key={moment.moment || `moment-${i}`}
                    className="flex gap-3 items-start py-2.5 px-3 rounded-lg hover:bg-[#FAFAFA] transition-colors duration-200"
                    initial={prefersReduced ? false : { opacity: 0, y: 6 }}
                    animate={FADE_ANIMATE}
                    transition={{ duration: 0.3, delay: i * 0.05, ease: EASE }}
                  >
                    <div
                      className="w-[2px] h-5 rounded-full shrink-0 mt-0.5"
                      style={{ backgroundColor: i === 0 ? "#3B82F6" : "#D9D9D9" }}
                    />
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      {moment.moment && (
                        <p className="text-[12px] font-medium text-[#525252]">{moment.moment}</p>
                      )}
                      <p className="text-[11px] text-[#71717A] leading-[1.65]">{moment.description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ═══ COURT ══════════════════════════════════ */}
        <section id="court" className="mb-20">
          <CourtPlacementSection />
        </section>

        {/* ═══ STATISTICS ═════════════════════════════ */}
        <section id="statistics" className="mb-20">
          {/* Key Stats Snapshot */}
          {dynamicStats.length > 0 && p1 && p2 && (
            <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5 mb-12">
              <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px] mb-1">
                Key Statistics Snapshot
              </p>
              <p className="text-[11px] text-[#71717A] mb-4">
                Top differentiators vs your opponent
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {dynamicStats.map((stat, i) => (
                  <StatSnapshotCard
                    key={stat.key}
                    label={stat.label}
                    value={p1[stat.key] as number}
                    opponentValue={p2[stat.key] as number}
                    averageValue={
                      playerAverages
                        ? ((playerAverages[stat.key] as number) ?? null)
                        : null
                    }
                    isPercentage={stat.isPercentage}
                    fraction={p1.fractions[stat.key] ?? undefined}
                    index={i}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Full Match Statistics */}
          <MatchStatistics
            statistics={statsResult?.statistics ?? null}
            player1Name={statsResult?.player1Name ?? match.player1.name}
            player2Name={statsResult?.player2Name ?? match.player2.name}
          />
        </section>

        {/* ═══ VIDEO ══════════════════════════════════ */}
        <section id="video" className="mb-16">
          <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px] mb-3">
            Match Video
          </p>
          <VideoSection matchId={matchId} />
        </section>

        {/* ── Closing navigation ─────────────────────── */}
        <div className="border-t border-[#F3F3F3] pt-6 flex items-center justify-between">
          <Link
            href="/dashboard/matches"
            className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[#3B82F6] uppercase tracking-[1.5px] hover:text-[#2563EB] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-[6px] h-7 px-2.5"
          >
            <ArrowLeft className="h-3 w-3" /> All Matches
          </Link>
          <p className="text-[10px] text-[#767676]">
            {match.player1.name} vs {match.player2.name} &middot; {match.date}
          </p>
        </div>
      </div>

      {/* ── Table of Contents ──────────────────────── */}
      <div className="hidden xl:block w-[160px] shrink-0 ml-6" />
      <TableOfContents activeSection={activeSection} />
    </div>
  );
}

/* ── Collapsible AI Analysis ────────────────────────────── */

function CollapsibleAnalysis({ summary }: { summary: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = summary.length > 200;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px]">
          AI Analysis
        </p>
        {isLong && (
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="text-[10px] font-medium text-[#3B82F6] uppercase tracking-[2px] hover:text-[#2563EB] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-[4px] px-1 -mx-1"
          >
            {expanded ? "View Less" : "View More"}
          </button>
        )}
      </div>
      <p
        className={cn(
          "text-[11px] text-[#71717A] leading-[1.65] transition-all duration-300",
          !expanded && isLong && "line-clamp-3",
        )}
      >
        {summary}
      </p>
    </div>
  );
}

/* ── Table of Contents ──────────────────────────────────── */

function TableOfContents({ activeSection }: { activeSection: string }) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      e.preventDefault();
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    },
    [],
  );

  return (
    <nav
      className="hidden xl:block fixed right-6 top-0 w-[148px] h-screen pointer-events-none"
      aria-label="Page sections"
    >
      <div className="sticky top-[140px] pointer-events-auto">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] mb-4 pl-3">
          On this page
        </p>

        {/* Track rail + items */}
        <div className="relative">
          {/* Continuous faint track line */}
          <div
            className="absolute left-0 top-0 bottom-0 w-px bg-[#EBEBEB]"
            aria-hidden="true"
          />

          <ul className="flex flex-col">
            {TOC_SECTIONS.map((section) => {
              const isActive = activeSection === section.id;
              return (
                <li key={section.id} className="relative">
                  {/* Active indicator — sits on top of the track */}
                  {isActive && (
                    <div className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-[#3B82F6] transition-all duration-200" />
                  )}
                  <a
                    href={`#${section.id}`}
                    onClick={(e) => handleClick(e, section.id)}
                    className={cn(
                      "text-[11px] block py-[6px] pl-3 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-[2px]",
                      isActive
                        ? "text-[#0D0D0D] font-medium"
                        : "text-[#767676] hover:text-[#525252]",
                    )}
                  >
                    {section.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </nav>
  );
}
