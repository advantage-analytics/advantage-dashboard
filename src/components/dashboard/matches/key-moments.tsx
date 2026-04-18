"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Zap } from "lucide-react";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { Match } from "@/lib/data/types";
import { getInitials } from "@/lib/data/match-utils";

const EASE_CURVE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

const P1_COLOR = "#4A8AF4";
const P2_COLOR = "#6366F1";
const P1_TINT = "rgba(74,138,244,0.12)";
const P2_TINT = "rgba(243,132,57,0.12)";

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
  isHighPriority: boolean;
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
  const prefersReduced = useReducedMotion();

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
        context: `SET ${pt.setNumber} · ${pt.gameScore} · ${pt.pointScore}`,
        isHighPriority: pt.isMatchPoint || pt.isSetPoint,
      }));
  }, [points]);

  const p1Initials = getInitials(match.player1.name);
  const p2Initials = getInitials(match.player2.name);

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 h-14">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          Key Moments
        </p>
        {moments.length > 0 && (
          <span className="text-[10px] font-medium text-[#AAAAAA] tabular-nums">
            {moments.length}
          </span>
        )}
      </div>

      {/* Content */}
      {moments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <div className="bg-[#F5F5F5] p-4 rounded-full mb-3">
            <Zap
              className="h-8 w-8 text-[#888888]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </div>
          <p className="text-[12px] text-[#888888] leading-[1.6]">
            No key moments available for this match.
          </p>
        </div>
      ) : (
        <div className="flex flex-col pb-3 max-h-[520px] overflow-y-auto">
          {moments.map((moment, index) => {
            const initials =
              moment.player === "player1" ? p1Initials : p2Initials;
            const isP1 = moment.player === "player1";
            const color = isP1 ? P1_COLOR : P2_COLOR;
            const tint = isP1 ? P1_TINT : P2_TINT;

            return (
              <motion.div
                key={moment.id}
                className="flex items-start gap-3 py-2.5 px-5 transition-[background-color,transform] duration-200 ease-out hover:bg-[#FAFAFA] active:scale-[0.998]"
                initial={prefersReduced ? false : { opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.3,
                  delay: 0.1 + index * 0.05,
                  ease: EASE_CURVE,
                }}
              >
                {/* Player indicator */}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-px"
                  style={{ backgroundColor: tint }}
                  aria-hidden="true"
                >
                  <span
                    className="text-[9px] font-semibold leading-none"
                    style={{ color }}
                  >
                    {initials}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <p
                      className={`text-[12px] font-medium leading-none ${moment.isHighPriority ? "text-[#0D0D0D]" : "text-[#525252]"}`}
                    >
                      {moment.title}
                    </p>
                    {moment.isHighPriority && (
                      <div
                        className="w-1 h-1 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <p className="text-[12px] text-[#888888] leading-[16px] line-clamp-1">
                    {moment.description}
                  </p>
                </div>

                {/* Context badge */}
                <span className="shrink-0 mt-0.5 text-[9px] font-medium text-[#AAAAAA] bg-[#F5F5F5] px-2 py-1 rounded-[4px] uppercase tracking-[1.5px] tabular-nums whitespace-nowrap">
                  {moment.context}
                </span>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
