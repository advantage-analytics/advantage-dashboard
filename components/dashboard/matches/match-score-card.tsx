"use client";

import type { Match } from "@/lib/data/types";

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface MatchScoreCardProps {
  match: Match;
}

export function MatchScoreCard({ match }: MatchScoreCardProps) {
  return (
    <div className="w-[320px] flex flex-col gap-4 px-6 py-4 bg-white rounded-2xl border border-[#E7E7E7] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]">
      <div className="flex flex-row justify-between items-center gap-12">
        <span className="text-xs font-medium text-[#999999]">
          {match.matchContext}
        </span>
        <span className="px-1.5 py-0.5 rounded-[10px] bg-[#6AABFF] text-xs font-medium text-white">
          {match.duration ?? "—"}
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {/* Player 1 */}
        <div className="flex flex-row justify-between items-center gap-[52px]">
          <div className="flex flex-row items-center gap-4">
            <div className="w-10 h-10 rounded bg-[#F2F2F2] flex items-center justify-center shrink-0">
              <span className="text-xs font-medium text-[#BFBFBF]">
                {getInitials(match.player1.name)}
              </span>
            </div>
            <span
              className={`text-sm font-semibold ${
                match.score.winner === "player1"
                  ? "text-[#0D0D0D]"
                  : "text-[#999999]"
              }`}
            >
              {match.player1.name}
            </span>
          </div>
          <div className="flex flex-row gap-4">
            {match.score.sets.map((set, idx) => (
              <span
                key={idx}
                className={`text-lg font-semibold ${
                  set.player1 > set.player2
                    ? "text-[#0D0D0D]"
                    : "text-[#999999]"
                }`}
              >
                {set.player1}
              </span>
            ))}
          </div>
        </div>

        {/* Player 2 */}
        <div className="flex flex-row justify-between items-center gap-[52px]">
          <div className="flex flex-row items-center gap-4">
            <div className="w-10 h-10 rounded bg-[#F2F2F2] flex items-center justify-center shrink-0">
              <span className="text-xs font-medium text-[#BFBFBF]">
                {getInitials(match.player2.name)}
              </span>
            </div>
            <span
              className={`text-sm font-semibold ${
                match.score.winner === "player2"
                  ? "text-[#0D0D0D]"
                  : "text-[#999999]"
              }`}
            >
              {match.player2.name}
            </span>
          </div>
          <div className="flex flex-row gap-4">
            {match.score.sets.map((set, idx) => (
              <span
                key={idx}
                className={`text-lg font-semibold ${
                  set.player2 > set.player1
                    ? "text-[#0D0D0D]"
                    : "text-[#999999]"
                }`}
              >
                {set.player2}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

