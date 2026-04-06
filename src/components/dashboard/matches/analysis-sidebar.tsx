"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Brain, CircleDot } from "lucide-react";
import type { Match } from "@/lib/data/types";
import type { MatchStatisticsResult } from "@/lib/data/match-stats-server";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

interface AnalysisSidebarProps {
  match: Match;
  statsResult: MatchStatisticsResult | null;
  keyMoments: Array<{ moment: string; description: string }>;
  insights: {
    player1?: { strengths?: Array<{ name: string; value: number; description: string }>; weaknesses?: Array<{ name: string; value: number; description: string }> };
    player2?: { strengths?: Array<{ name: string; value: number; description: string }>; weaknesses?: Array<{ name: string; value: number; description: string }> };
  } | null;
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-[12px] text-[#525252]">{label}</span>
      <span className="text-[13px] font-medium text-[#0D0D0D] tabular-nums">{value}</span>
    </div>
  );
}

export function AnalysisSidebar({
  match,
  statsResult,
  keyMoments,
  insights,
}: AnalysisSidebarProps) {
  const prefersReduced = useReducedMotion();
  const hasKeyMoments = keyMoments.length > 0;
  const hasInsights =
    (insights?.player1?.strengths?.length ?? 0) > 0 ||
    (insights?.player1?.weaknesses?.length ?? 0) > 0 ||
    (insights?.player2?.strengths?.length ?? 0) > 0 ||
    (insights?.player2?.weaknesses?.length ?? 0) > 0;
  const aiReady = hasKeyMoments || hasInsights;

  const stats = statsResult?.statistics;
  const p1 = stats?.player1Stats;
  const p2 = stats?.player2Stats;

  return (
    <motion.div
      className="w-[320px] bg-white rounded-[14px] border border-[#F3F3F3] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] overflow-hidden"
      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_CURVE }}
    >
      {/* AI Status header */}
      <div className="p-5 border-b border-[#F0F0F0]">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-[#3B82F6]" />
            <span className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
              AI Readiness
            </span>
          </div>
          <span
            className={`flex items-center gap-1 text-[10px] font-medium rounded-full px-2.5 py-0.5 ${
              aiReady
                ? "bg-[rgba(93,185,85,0.1)] text-[#5DB955]"
                : "bg-[#F3F3F3] text-[#888888]"
            }`}
          >
            <CircleDot className="w-2.5 h-2.5 text-[#888888]" />
            {aiReady ? "Ready" : "No Data"}
          </span>
        </div>
        <p className="text-[11px] text-[#888888] leading-relaxed">
          {aiReady
            ? `${hasKeyMoments ? keyMoments.length + " key moments" : ""}${hasKeyMoments && hasInsights ? " · " : ""}${hasInsights ? "insights available" : ""}`
            : "No AI data has been processed for this match yet."}
        </p>
      </div>

      {/* Quick match stats */}
      {p1 && p2 && (
        <div className="p-5">
          <p className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA] mb-3">
            Quick Stats
          </p>
          <div className="flex flex-col divide-y divide-[#F0F0F0]">
            <StatRow label="Total Points" value={(p1.totalPoints ?? 0) + (p2.totalPoints ?? 0)} />
            <StatRow label={`${match.player1.name.split(" ")[0]} Winners`} value={p1.winners ?? "—"} />
            <StatRow label={`${match.player2.name.split(" ")[0]} Winners`} value={p2.winners ?? "—"} />
            <StatRow label={`${match.player1.name.split(" ")[0]} UE`} value={p1.unforcedErrors ?? "—"} />
            <StatRow label={`${match.player2.name.split(" ")[0]} UE`} value={p2.unforcedErrors ?? "—"} />
          </div>
        </div>
      )}

      {!p1 && !p2 && (
        <div className="p-5 flex items-center justify-center">
          <p className="text-[12px] text-[#AAAAAA]">No statistics available</p>
        </div>
      )}
    </motion.div>
  );
}
