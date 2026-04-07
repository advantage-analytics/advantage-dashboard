"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import type { Match } from "@/lib/data/types";
import type { MatchStatisticsResult } from "@/lib/data/match-stats-server";
import { shortName, PLAYER_COLORS } from "@/lib/data/match-utils";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

/* ── Private sub-components (shared) ─────────────────────── */

function SectionHeader({ children }: { children: string }) {
  return (
    <div className="text-[10px] font-medium tracking-[2.5px] uppercase text-[#AAAAAA]">
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
    <div className="flex flex-row gap-2">
      <button
        type="button"
        onClick={() => onSelectPlayer("player1")}
        className={`h-8 rounded-full px-3.5 text-xs font-medium ring-1 ring-inset transition-colors duration-200 ${
          selectedPlayer === "player1"
            ? "ring-[#3B82F6] text-[#3B82F6] bg-[#EBF2FD]"
            : "ring-[#EAECF0] text-[#525252] bg-white"
        }`}
      >
        {shortName(match.player1.name)}
      </button>
      <button
        type="button"
        onClick={() => onSelectPlayer("player2")}
        className={`h-8 rounded-full px-3.5 text-xs font-medium ring-1 ring-inset transition-colors duration-200 ${
          selectedPlayer === "player2"
            ? "ring-[#3B82F6] text-[#3B82F6] bg-[#EBF2FD]"
            : "ring-[#EAECF0] text-[#525252] bg-white"
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
  index = 0,
  reduceMotion = false,
}: {
  label: string;
  valuePct: number;
  fillPct: number;
  barColor: string;
  index?: number;
  reduceMotion?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, fillPct));
  return (
    <motion.div
      className="flex flex-col gap-3 self-stretch"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE, delay: index * 0.04 }}
    >
      <div className="flex flex-row justify-between items-end self-stretch">
        <span className="text-[12px] text-[#525252]">{label}</span>
        <span className="text-[13px] font-medium text-[#0D0D0D] tabular-nums">
          {valuePct}%
        </span>
      </div>
      <div className="h-2 w-full bg-[#F3F3F3] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
    </motion.div>
  );
}

/* ── MatchOverallSidebar sub-components ───────────────────── */

function PlayerHeader({ match }: { match: Match }) {
  return (
    <div className="flex flex-row items-center justify-between">
      <span className="text-[12px] font-medium text-[#0D0D0D] truncate">
        {shortName(match.player1.name)}
      </span>
      <span className="text-[12px] font-medium text-[#0D0D0D] truncate text-right">
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
        <div className="h-2 w-full rounded-full overflow-hidden flex">
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
  reduceMotion = false,
}: {
  label: string;
  p1Value: string;
  p2Value: string;
  index?: number;
  reduceMotion?: boolean;
}) {
  return (
    <motion.div
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE, delay: index * 0.04 }}
    >
      <span
        className="text-[13px] font-medium tabular-nums text-left"
        style={{ color: PLAYER_COLORS.player1 }}
      >
        {p1Value}
      </span>
      <div className="flex flex-col items-center min-w-[80px]">
        <span className="text-[12px] text-[#525252] text-center leading-none">
          {label}
        </span>
      </div>
      <span
        className="text-[13px] font-medium tabular-nums text-right"
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
        <span className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA] text-center">
          {label}
        </span>
        <span className="text-[12px] tabular-nums text-[#525252] font-medium">
          {won} / {total} pts
        </span>
      </div>

      {/* Animated progress bar */}
      <div className="h-2 w-full bg-[#F3F3F3] rounded-full overflow-hidden">
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
  const prefersReducedMotion = useReducedMotion();

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
    "bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-5";

  if (!hasStats) {
    return (
      <div className={`w-[320px] flex flex-col gap-5 ${cardClass}`}>
        <PlayerHeader match={match} />
        <div className="flex items-center justify-center py-12">
          <span className="text-[12px] text-[#525252] font-medium">
            No stats available
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[320px] flex flex-col gap-5">
      {/* Points Won card */}
      <div className={`flex flex-col gap-5 ${cardClass}`}>
        <SectionHeader>Points Won</SectionHeader>
        <PointsSplit
          match={match}
          p1TotalWon={p1TotalWon}
          p2TotalWon={p2TotalWon}
        />
      </div>

      {/* Performance card */}
      <div className={`flex flex-col gap-5 ${cardClass}`}>
        <SectionHeader>Performance</SectionHeader>
        <div className="flex flex-col gap-2.5">
          <ComparisonRow
            label="Serve Rating"
            p1Value={fmt(p1Stats.serveRating, 1)}
            p2Value={fmt(p2Stats.serveRating, 1)}
            index={0}
            reduceMotion={!!prefersReducedMotion}
          />
          <div className="h-px bg-[#F0F0F0]" />
          <ComparisonRow
            label="Return Rating"
            p1Value={fmt(p1Stats.returnRating, 1)}
            p2Value={fmt(p2Stats.returnRating, 1)}
            index={1}
            reduceMotion={!!prefersReducedMotion}
          />
          <div className="h-px bg-[#F0F0F0]" />
          <ComparisonRow
            label="Under Pressure"
            p1Value={fmt(p1Stats.underPressureRating, 1)}
            p2Value={fmt(p2Stats.underPressureRating, 1)}
            index={2}
            reduceMotion={!!prefersReducedMotion}
          />
        </div>
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
  const prefersReducedMotion = useReducedMotion();
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

  const cardClass =
    "bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-5";

  return (
    <div className="w-[320px] flex flex-col gap-5">
      {/* Player selection + stat hero card */}
      <div className={`flex flex-col gap-5 ${cardClass}`}>
        <SectionHeader>Shot Analysis</SectionHeader>

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
      </div>

      {breakdownView === "serve" && (
        <div className={`flex flex-col gap-5 ${cardClass}`}>
          <SectionHeader>Serve Placement Distribution</SectionHeader>
          <div className="flex flex-col gap-4 self-stretch">
            <PercentageBarRow
              label="Wide"
              valuePct={playerStats?.serveWidePct ?? 0}
              fillPct={playerStats?.serveWidePct ?? 0}
              barColor={barColor}
              index={0}
              reduceMotion={!!prefersReducedMotion}
            />
            <div className="h-px bg-[#F0F0F0]" />
            <PercentageBarRow
              label="Body"
              valuePct={playerStats?.serveBodyPct ?? 0}
              fillPct={playerStats?.serveBodyPct ?? 0}
              barColor={barColor}
              index={1}
              reduceMotion={!!prefersReducedMotion}
            />
            <div className="h-px bg-[#F0F0F0]" />
            <PercentageBarRow
              label="T"
              valuePct={playerStats?.serveTpct ?? 0}
              fillPct={playerStats?.serveTpct ?? 0}
              barColor={barColor}
              index={2}
              reduceMotion={!!prefersReducedMotion}
            />
          </div>
        </div>
      )}

      {breakdownView === "return" && (
        <>
          <div className={`flex flex-col gap-5 ${cardClass}`}>
            <SectionHeader>Return Placement Distribution</SectionHeader>
            <div className="flex flex-col gap-4 self-stretch">
              <PercentageBarRow
                label="Cross Court"
                valuePct={playerStats?.returnCrossCourtPct ?? 0}
                fillPct={playerStats?.returnCrossCourtPct ?? 0}
                barColor={barColor}
                index={0}
                reduceMotion={!!prefersReducedMotion}
              />
              <div className="h-px bg-[#F0F0F0]" />
              <PercentageBarRow
                label="Down The Line"
                valuePct={playerStats?.returnDownTheLinePct ?? 0}
                fillPct={playerStats?.returnDownTheLinePct ?? 0}
                barColor={barColor}
                index={1}
                reduceMotion={!!prefersReducedMotion}
              />
              <div className="h-px bg-[#F0F0F0]" />
              <PercentageBarRow
                label="Middle"
                valuePct={playerStats?.returnMiddlePct ?? 0}
                fillPct={playerStats?.returnMiddlePct ?? 0}
                barColor={barColor}
                index={2}
                reduceMotion={!!prefersReducedMotion}
              />
            </div>
          </div>

          <div className={`flex flex-col gap-5 ${cardClass}`}>
            <SectionHeader>Return Contact Distribution</SectionHeader>
            <div className="flex flex-col gap-4 self-stretch">
              <PercentageBarRow
                label="Inside"
                valuePct={playerStats?.returnContactInsidePct ?? 0}
                fillPct={playerStats?.returnContactInsidePct ?? 0}
                barColor={barColor}
                index={0}
                reduceMotion={!!prefersReducedMotion}
              />
              <div className="h-px bg-[#F0F0F0]" />
              <PercentageBarRow
                label="Middle"
                valuePct={playerStats?.returnContactMiddlePct ?? 0}
                fillPct={playerStats?.returnContactMiddlePct ?? 0}
                barColor={barColor}
                index={1}
                reduceMotion={!!prefersReducedMotion}
              />
              <div className="h-px bg-[#F0F0F0]" />
              <PercentageBarRow
                label="Deep"
                valuePct={playerStats?.returnContactDeepPct ?? 0}
                fillPct={playerStats?.returnContactDeepPct ?? 0}
                barColor={barColor}
                index={2}
                reduceMotion={!!prefersReducedMotion}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
