"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import type { Match } from "@/lib/data/types";
import type { MatchStatisticsResult } from "@/lib/data/match-stats-server";
import { shortName, PLAYER_COLORS } from "@/lib/data/match-utils";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

/* ── Private sub-components (shared) ─────────────────────── */

function SectionHeader({ children }: { children: string }) {
  return (
    <div className="text-[10px] font-medium tracking-[0.16em] uppercase text-[#888888]">
      {children}
    </div>
  );
}

/* ── MatchVisualsSidebar sub-components ──────────────────── */

function PlayerTabs({
  match,
  selectedPlayer,
  onSelectPlayer,
}: {
  match: Match;
  selectedPlayer: "player1" | "player2";
  onSelectPlayer: (p: "player1" | "player2") => void;
}) {
  return (
    <div className="flex flex-row shadow-[inset_0_-1px_0_0_#D9D9D9]">
      <button
        type="button"
        onClick={() => onSelectPlayer("player1")}
        className={`h-[31px] flex-1 py-2 px-4 text-xs font-medium border-b-2 transition-colors ${
          selectedPlayer === "player1"
            ? "text-[#4A8AF4] border-[#4A8AF4]"
            : "text-[#888888] border-transparent hover:text-[#666666]"
        }`}
      >
        {shortName(match.player1.name)}
      </button>
      <button
        type="button"
        onClick={() => onSelectPlayer("player2")}
        className={`h-[31px] flex-1 py-2 px-4 text-xs font-medium border-b-2 transition-colors ${
          selectedPlayer === "player2"
            ? "text-[#F38439] border-[#F38439]"
            : "text-[#888888] border-transparent hover:text-[#666666]"
        }`}
      >
        {shortName(match.player2.name)}
      </button>
    </div>
  );
}

function PercentageBarRow({
  label,
  valuePct,
  fillPct,
  barColor,
}: {
  label: string;
  valuePct: number;
  fillPct: number;
  barColor: string;
}) {
  const pct = Math.min(100, Math.max(0, fillPct));
  return (
    <div className="flex flex-col gap-3 self-stretch">
      <div className="flex flex-row justify-between items-end self-stretch">
        <span className="text-[10px] font-normal text-[#888888] leading-[1.1]">{label}</span>
        <span className="text-[16px] leading-[1.1] font-medium text-[#0D0D0D] tabular-nums">
          {valuePct}%
        </span>
      </div>
      <div className="h-[6px] w-full bg-[#D9D9D9] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
    </div>
  );
}

/* ── MatchOverallSidebar sub-components ───────────────────── */

function PlayerHeader({ match }: { match: Match }) {
  return (
    <div className="flex flex-row items-center justify-between">
      <span className="text-[10px] font-medium text-[#D9D9D9] uppercase tracking-[0.5px] truncate">
        {shortName(match.player1.name)}
      </span>
      <span className="text-[10px] font-medium text-[#D9D9D9] uppercase tracking-[0.5px] truncate text-right">
        {shortName(match.player2.name)}
      </span>
    </div>
  );
}

/**
 * Points Split — ATP-style face-off: two large numbers + animated split bar.
 * No circular elements. Matches the bar-chart aesthetic of the dashboard.
 */
function PointsSplit({
  match,
  p1TotalWon,
  p2TotalWon,
}: {
  match: Match;
  p1TotalWon: number;
  p2TotalWon: number;
}) {
  const total = p1TotalWon + p2TotalWon;
  const p1Pct = total > 0 ? (p1TotalWon / total) * 100 : 50;
  const p2Pct = 100 - p1Pct;

  return (
    <div className="flex flex-col gap-4">
      <PlayerHeader match={match} />

      {/* Large numbers — ATP broadcast style */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 min-w-0">
        <motion.div
          className="flex flex-col gap-0.5 min-w-0"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
        >
          <span
            className="text-[42px] font-bold tabular-nums leading-none"
            style={{ color: PLAYER_COLORS.player1 }}
          >
            {p1TotalWon}
          </span>
        </motion.div>

        {/* Center: total */}
        <div className="flex items-center gap-1 pb-[2px] shrink-0">
          <span className="text-[10px] font-semibold tabular-nums text-[#BBBBBB]">{total}</span>
          <span className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#D5D5D5]">total</span>
        </div>

        <motion.div
          className="flex flex-col items-end gap-0.5 min-w-0"
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
        >
          <span
            className="text-[42px] font-bold tabular-nums leading-none text-right"
            style={{ color: PLAYER_COLORS.player2 }}
          >
            {p2TotalWon}
          </span>
        </motion.div>
      </div>

      {/* Animated split bar */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center">
          <span
            className="text-xs font-semibold tabular-nums"
            style={{ color: PLAYER_COLORS.player1 }}
          >
            {p1Pct.toFixed(1)}%
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#BBBBBB]">
            Points Split
          </span>
          <span
            className="text-xs font-semibold tabular-nums"
            style={{ color: PLAYER_COLORS.player2 }}
          >
            {p2Pct.toFixed(1)}%
          </span>
        </div>
        <div className="h-[7px] w-full rounded-full overflow-hidden flex">
          <motion.div
            className="h-full"
            style={{ backgroundColor: PLAYER_COLORS.player1 }}
            initial={{ width: "50%" }}
            animate={{ width: `${p1Pct}%` }}
            transition={{ duration: 0.7, ease: EASE }}
          />
          <div
            className="h-full flex-1"
            style={{ backgroundColor: PLAYER_COLORS.player2 }}
          />
        </div>
      </div>
    </div>
  );
}

function ComparisonRow({
  label,
  p1Value,
  p2Value,
  index = 0,
}: {
  label: string;
  p1Value: string;
  p2Value: string;
  index?: number;
}) {
  return (
    <motion.div
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
    >
      <span
        className="text-sm font-semibold tabular-nums text-left"
        style={{ color: PLAYER_COLORS.player1 }}
      >
        {p1Value}
      </span>
      <div className="flex flex-col items-center min-w-[80px]">
        <span className="text-[9px] font-medium tracking-[0.14em] uppercase text-[#AAAAAA] text-center leading-none">
          {label}
        </span>
      </div>
      <span
        className="text-sm font-semibold tabular-nums text-right"
        style={{ color: PLAYER_COLORS.player2 }}
      >
        {p2Value}
      </span>
    </motion.div>
  );
}

/**
 * Stat Hero — large bold percentage + animated bar.
 * Replaces the circular gauge. Matches the "big number" pattern
 * used across premium sports analytics dashboards.
 */
function StatHero({
  pct,
  won,
  total,
  label,
  barColor,
}: {
  pct: number;
  won: number;
  total: number;
  label: string;
  barColor: string;
}) {
  const clampedPct = Math.min(100, Math.max(0, pct));
  return (
    <div className="flex flex-col gap-3">
      {/* Hero number */}
      <div className="flex flex-col items-center gap-1 py-2">
        <motion.span
          key={`${barColor}-${pct}`}
          className="text-[48px] font-bold tabular-nums leading-none"
          style={{ color: barColor }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
        >
          {clampedPct.toFixed(1)}%
        </motion.span>
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#888888] text-center">
          {label}
        </span>
        <span className="text-xs tabular-nums text-[#BBBBBB] font-medium">
          {won} / {total} pts
        </span>
      </div>

      {/* Animated progress bar */}
      <div className="h-[6px] w-full bg-[#F0F0F0] rounded-full overflow-hidden">
        <motion.div
          key={`bar-${barColor}-${pct}`}
          className="h-full rounded-full"
          style={{ backgroundColor: barColor }}
          initial={{ width: 0 }}
          animate={{ width: `${clampedPct}%` }}
          transition={{ duration: 0.85, ease: EASE }}
        />
      </div>
    </div>
  );
}

/* ── Named exports (explicit variants) ────────────────────── */

interface MatchOverallSidebarProps {
  match: Match;
  statsResult: MatchStatisticsResult | null;
}

export function MatchOverallSidebar({
  match,
  statsResult,
}: MatchOverallSidebarProps) {
  const p1Stats = statsResult?.statistics?.player1Stats ?? null;
  const p2Stats = statsResult?.statistics?.player2Stats ?? null;

  const p1TotalWon = p1Stats?.totalPointsWon ?? 0;
  const p2TotalWon = p2Stats?.totalPointsWon ?? 0;

  const hasStats = statsResult !== null && p1Stats !== null && p2Stats !== null;

  const fmt = (v: number | null | undefined, decimals = 0, suffix = "") => {
    if (v === null || v === undefined) return "—";
    return `${v.toFixed(decimals)}${suffix}`;
  };

  const cardClass =
    "w-[320px] flex flex-col gap-5 px-5 py-4 bg-white rounded-[16px] border border-[#E7E7E7] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.06)]";

  if (!hasStats) {
    return (
      <div className={cardClass}>
        <PlayerHeader match={match} />
        <div className="flex items-center justify-center py-12">
          <span className="text-xs text-[#BBBBBB] font-medium">
            No stats available
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <div>
        <h2 className="text-base font-medium text-[#0D0D0D]">Match Summary</h2>
        <p className="text-xs text-[#888888] mt-1">
          Points won and performance ratings comparison
        </p>
      </div>

      <SectionHeader>Points Won</SectionHeader>
      <PointsSplit
        match={match}
        p1TotalWon={p1TotalWon}
        p2TotalWon={p2TotalWon}
      />

      <div className="h-px w-full bg-[#F0F0F0]" />

      <SectionHeader>Performance</SectionHeader>
      <div className="flex flex-col gap-2.5">
        <ComparisonRow
          label="Serve Rating"
          p1Value={fmt(p1Stats.serveRating, 1)}
          p2Value={fmt(p2Stats.serveRating, 1)}
          index={0}
        />
        <div className="h-px w-full bg-[#F4F4F4]" />
        <ComparisonRow
          label="Return Rating"
          p1Value={fmt(p1Stats.returnRating, 1)}
          p2Value={fmt(p2Stats.returnRating, 1)}
          index={1}
        />
        <div className="h-px w-full bg-[#F4F4F4]" />
        <ComparisonRow
          label="Under Pressure"
          p1Value={fmt(p1Stats.underPressureRating, 1)}
          p2Value={fmt(p2Stats.underPressureRating, 1)}
          index={2}
        />
      </div>
    </div>
  );
}

interface MatchVisualsSidebarProps {
  match: Match;
  statsResult: MatchStatisticsResult | null;
}

export function MatchVisualsSidebar({
  match,
  statsResult,
}: MatchVisualsSidebarProps) {
  const searchParams = useSearchParams();
  const vizParam = searchParams.get("viz");
  const breakdownView: "serve" | "return" =
    vizParam === "return" ? "return" : "serve";

  const [selectedPlayer, setSelectedPlayer] = useState<"player1" | "player2">(
    "player1"
  );

  const playerStats = statsResult?.statistics
    ? selectedPlayer === "player1"
      ? statsResult.statistics.player1Stats
      : statsResult.statistics.player2Stats
    : null;

  const barColor = PLAYER_COLORS[selectedPlayer];

  const totalPoints      = playerStats?.totalPoints ?? 0;
  const servicePointsWon = playerStats?.servicePointsWon ?? 0;
  const returnPointsWon  = playerStats?.returnPointsWon ?? 0;

  const circleWon = breakdownView === "serve" ? servicePointsWon : returnPointsWon;
  const circlePct = totalPoints > 0 ? (circleWon / totalPoints) * 100 : 0;
  const circleLabel =
    breakdownView === "serve"
      ? "Total Serve Points Won"
      : "Total Return Points Won";

  return (
    <div className="w-[320px] flex flex-col gap-6 px-6 py-4 bg-white rounded-[16px] border border-[#E7E7E7] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.06)]">
      <div>
        <h2 className="text-base font-medium text-[#0D0D0D]">Shot Analysis</h2>
        <p className="text-xs text-[#888888] mt-1">
          Points won and shot placement breakdown by player
        </p>
      </div>

      <PlayerTabs
        match={match}
        selectedPlayer={selectedPlayer}
        onSelectPlayer={setSelectedPlayer}
      />

      <StatHero
        key={`${selectedPlayer}-${breakdownView}`}
        pct={circlePct}
        won={circleWon}
        total={totalPoints}
        label={circleLabel}
        barColor={barColor}
      />

      {breakdownView === "serve" && (
        <div className="flex flex-col items-stretch gap-5">
          <SectionHeader>Serve Placement Distribution</SectionHeader>
          <div className="flex flex-col gap-5 self-stretch">
            <PercentageBarRow
              label="Wide"
              valuePct={playerStats?.serveWidePct ?? 0}
              fillPct={playerStats?.serveWidePct ?? 0}
              barColor={barColor}
            />
            <PercentageBarRow
              label="Body"
              valuePct={playerStats?.serveBodyPct ?? 0}
              fillPct={playerStats?.serveBodyPct ?? 0}
              barColor={barColor}
            />
            <PercentageBarRow
              label="T"
              valuePct={playerStats?.serveTpct ?? 0}
              fillPct={playerStats?.serveTpct ?? 0}
              barColor={barColor}
            />
          </div>
        </div>
      )}

      {breakdownView === "return" && (
        <>
          <div className="flex flex-col items-stretch gap-5">
            <SectionHeader>Return Placement Distribution</SectionHeader>
            <div className="flex flex-col gap-5 self-stretch">
              <PercentageBarRow
                label="Cross Court"
                valuePct={playerStats?.returnCrossCourtPct ?? 0}
                fillPct={playerStats?.returnCrossCourtPct ?? 0}
                barColor={barColor}
              />
              <PercentageBarRow
                label="Down The Line"
                valuePct={playerStats?.returnDownTheLinePct ?? 0}
                fillPct={playerStats?.returnDownTheLinePct ?? 0}
                barColor={barColor}
              />
              <PercentageBarRow
                label="Middle"
                valuePct={playerStats?.returnMiddlePct ?? 0}
                fillPct={playerStats?.returnMiddlePct ?? 0}
                barColor={barColor}
              />
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-5">
            <SectionHeader>Return Contact Distribution</SectionHeader>
            <div className="flex flex-col gap-5 self-stretch">
              <PercentageBarRow
                label="Inside"
                valuePct={playerStats?.returnContactInsidePct ?? 0}
                fillPct={playerStats?.returnContactInsidePct ?? 0}
                barColor={barColor}
              />
              <PercentageBarRow
                label="Middle"
                valuePct={playerStats?.returnContactMiddlePct ?? 0}
                fillPct={playerStats?.returnContactMiddlePct ?? 0}
                barColor={barColor}
              />
              <PercentageBarRow
                label="Deep"
                valuePct={playerStats?.returnContactDeepPct ?? 0}
                fillPct={playerStats?.returnContactDeepPct ?? 0}
                barColor={barColor}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
