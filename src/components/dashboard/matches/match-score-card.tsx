"use client";

import { motion } from "framer-motion";
import type { Match } from "@/lib/data/types";
import { getInitials, shortName } from "@/lib/data/match-utils";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

interface MatchScoreCardProps {
  match: Match;
}

export function MatchScoreCard({ match }: MatchScoreCardProps) {
  return (
    <motion.div
      className="w-[320px] flex flex-col gap-4 px-6 py-4 bg-white rounded-[16px] border border-[#E7E7E7] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.06)]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [...EASE_CURVE] }}
    >
      <motion.div
        className="flex flex-row justify-between items-center gap-12"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.03, ease: [...EASE_CURVE] }}
      >
        <span className="text-xs font-medium text-[#888888]">
          {match.matchContext}
        </span>
        <span className="px-1.5 py-0.5 rounded-[10px] bg-[#6AABFF] text-xs font-medium text-white">
          {match.duration ?? "—"}
        </span>
      </motion.div>

      <div className="flex flex-col gap-4">
        {/* Player 1 */}
        <motion.div
          className="flex flex-row justify-between items-center gap-[52px]"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1, ease: [...EASE_CURVE] }}
        >
          <div className="flex flex-row items-center gap-4">
            <div className="w-10 h-10 rounded bg-[#F2F2F2] flex items-center justify-center shrink-0">
              <span className="text-xs font-medium text-[#BFBFBF]">
                {getInitials(match.player1.name)}
              </span>
            </div>
            <span
              className={`text-sm font-semibold truncate ${
                match.score.winner === "player1"
                  ? "text-[#0D0D0D]"
                  : "text-[#888888]"
              }`}
            >
              {shortName(match.player1.name)}
            </span>
          </div>
          <div className="flex flex-row gap-4">
            {match.score.sets.map((set, idx) => (
              <span
                key={idx}
                className={`text-lg font-semibold ${
                  set.player1 > set.player2
                    ? "text-[#0D0D0D]"
                    : "text-[#888888]"
                }`}
              >
                {set.player1}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Player 2 */}
        <motion.div
          className="flex flex-row justify-between items-center gap-[52px]"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.17, ease: [...EASE_CURVE] }}
        >
          <div className="flex flex-row items-center gap-4">
            <div className="w-10 h-10 rounded bg-[#F2F2F2] flex items-center justify-center shrink-0">
              <span className="text-xs font-medium text-[#BFBFBF]">
                {getInitials(match.player2.name)}
              </span>
            </div>
            <span
              className={`text-sm font-semibold truncate ${
                match.score.winner === "player2"
                  ? "text-[#0D0D0D]"
                  : "text-[#888888]"
              }`}
            >
              {shortName(match.player2.name)}
            </span>
          </div>
          <div className="flex flex-row gap-4">
            {match.score.sets.map((set, idx) => (
              <span
                key={idx}
                className={`text-lg font-semibold ${
                  set.player2 > set.player1
                    ? "text-[#0D0D0D]"
                    : "text-[#888888]"
                }`}
              >
                {set.player2}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

