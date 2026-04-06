"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { Match } from "@/lib/data/types";
import { getInitials } from "@/lib/data/match-utils";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

interface KeyMomentsProps {
  points: MatchPoint[];
  match: Match;
}

interface MomentItem {
  id: string;
  player: "player1" | "player2";
  title: string;
  description: string;
  context: string;
}

function getMomentTitle(point: MatchPoint): string {
  if (point.isMatchPoint) return "Match Point";
  if (point.isSetPoint) return "Set Point";
  if (point.isBreakPoint) return "Break Point";
  if (point.resultType?.toLowerCase().includes("ace")) return "Ace";
  return "Key Point";
}

function getMomentDescription(point: MatchPoint): string {
  if (point.description) return point.description;
  if (point.resultType?.toLowerCase().includes("ace")) return "Ace served";
  if (point.isBreakPoint) {
    return point.wonByPlayer1 === !point.serverIsPlayer1
      ? "Break point converted"
      : "Break point saved";
  }
  return point.resultType || "Point played";
}

export function KeyMoments({ points, match }: KeyMomentsProps) {
  const moments = useMemo<MomentItem[]>(() => {
    return points
      .filter(
        (pt) =>
          pt.isBreakPoint ||
          pt.isSetPoint ||
          pt.isMatchPoint ||
          pt.resultType?.toLowerCase().includes("ace"),
      )
      .map((pt) => ({
        id: pt.id,
        player: pt.wonByPlayer1 ? ("player1" as const) : ("player2" as const),
        title: getMomentTitle(pt),
        description: getMomentDescription(pt),
        context: `SET ${pt.setNumber} ${pt.gameScore} ${pt.pointScore}`,
      }));
  }, [points]);

  const p1Initials = getInitials(match.player1.name);
  const p2Initials = getInitials(match.player2.name);

  return (
    <div className="w-[320px] bg-white rounded-[16px] border border-[#E7E7E7] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.06)] px-6 py-4">
      <div className="mb-4">
        <h3 className="text-base font-medium text-[#0D0D0D]">Key Moments</h3>
        <p className="text-xs text-[#888888] mt-0.5">Game-by-game momentum</p>
      </div>

      {moments.length === 0 ? (
        <p className="text-sm text-[#888888] text-center py-6">
          No key moments available for this match.
        </p>
      ) : (
        <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto">
          {moments.map((moment, index) => {
            const initials = moment.player === "player1" ? p1Initials : p2Initials;
            const isP1 = moment.player === "player1";

            return (
              <motion.div
                key={moment.id}
                className="flex items-start gap-3"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.06, ease: EASE_CURVE }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold text-white"
                  style={{ backgroundColor: isP1 ? "#4A8AF4" : "#F38439" }}
                >
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#0D0D0D]">{moment.title}</p>
                  <p className="text-xs text-[#888888] mt-0.5 line-clamp-2">
                    {moment.description}
                  </p>
                  <span className="inline-block mt-1 text-[10px] font-medium text-[#888888] bg-[#F5F5F5] px-2 py-0.5 rounded-full uppercase tracking-wide">
                    {moment.context}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
