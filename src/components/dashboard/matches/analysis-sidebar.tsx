"use client";

import { motion } from "framer-motion";
import { Brain, CircleDot, Zap } from "lucide-react";
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

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#F0F0F0] last:border-0">
      <span className="text-xs text-[#999999]">{label}</span>
      <span className="text-xs font-semibold text-[#0D0D0D]">{value}</span>
    </div>
  );
}

export function AnalysisSidebar({
  match,
  statsResult,
  keyMoments,
  insights,
}: AnalysisSidebarProps) {
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
      className="w-[320px] bg-white rounded-[16px] border border-[#E7E7E7] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.06)] overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_CURVE }}
    >
      {/* AI Status header */}
      <div className="px-5 py-4 border-b border-[#F0F0F0]">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-[#4A8AF4]" />
            <span className="text-sm font-medium text-[#0D0D0D]">AI Readiness</span>
          </div>
          <span
            className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full ${
              aiReady
                ? "bg-[#16A34A]/10 text-[#22C55E]"
                : "bg-[#F5F5F5] text-[#BBBBBB]"
            }`}
          >
            <CircleDot className="w-2.5 h-2.5" />
            {aiReady ? "Ready" : "No Data"}
          </span>
        </div>
        <p className="text-[11px] text-[#999999] leading-relaxed">
          {aiReady
            ? `${hasKeyMoments ? keyMoments.length + " key moments" : ""}${hasKeyMoments && hasInsights ? " · " : ""}${hasInsights ? "insights available" : ""}`
            : "No AI data has been processed for this match yet."}
        </p>
      </div>

      {/* Quick match stats */}
      {p1 && p2 && (
        <div className="px-5 py-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Zap className="w-3 h-3 text-[#999999]" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#999999]">
              Quick Stats
            </p>
          </div>
          <div className="flex flex-col">
            <StatPill label="Total Points" value={(p1.totalPoints ?? 0) + (p2.totalPoints ?? 0)} />
            <StatPill label={`${match.player1.name.split(" ")[0]} Winners`} value={p1.winners ?? "—"} />
            <StatPill label={`${match.player2.name.split(" ")[0]} Winners`} value={p2.winners ?? "—"} />
            <StatPill label={`${match.player1.name.split(" ")[0]} Unforced Errors`} value={p1.unforcedErrors ?? "—"} />
            <StatPill label={`${match.player2.name.split(" ")[0]} Unforced Errors`} value={p2.unforcedErrors ?? "—"} />
          </div>
        </div>
      )}

      {!p1 && !p2 && (
        <div className="px-5 py-6 flex items-center justify-center">
          <p className="text-xs text-[#BBBBBB]">No statistics available</p>
        </div>
      )}
    </motion.div>
  );
}
