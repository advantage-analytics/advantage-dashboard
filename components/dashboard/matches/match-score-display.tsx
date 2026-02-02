"use client";

import type { Match } from "@/lib/data/types";

interface MatchScoreDisplayProps {
  match: Match;
}

export function MatchScoreDisplay({ match }: MatchScoreDisplayProps) {
  return (
    <div className="bg-white ring-2 ring-inset ring-[#D9D9D9] px-6 py-4 space-y-4 rounded-2xl">
      <div className="flex flex-row h-4 text-center justify-between font-normal text-xs text-[#999999]">
        <p>{match.matchContext}</p>
        <p>{match.duration}</p>
      </div>

      <div className="space-y-4">
        {/* Player 1 */}
        <div className="flex flex-row justify-between items-center">
          <div className="flex flex-row items-center justify-between gap-4">
            <div className="h-10 w-10 rounded-full bg-[#F2F2F2]"></div>
            <div className="flex flex-col">
              <p
                className={`font-semibold text-sm ${match.score.winner === "player1" ? "text-[#0D0D0D]" : "text-[#BFBFBF]"}`}
              >
                {match.player1.name}
              </p>
            </div>
          </div>
          <div className="flex flex-row gap-4 font-semibold text-[18px]">
            {match.score.sets.map((set, idx) => (
              <p
                key={idx}
                className={
                  set.player1 > set.player2
                    ? "text-[#0D0D0D]"
                    : "text-[#BFBFBF]"
                }
              >
                {set.player1}
              </p>
            ))}
          </div>
        </div>
        {/* Player 2 */}
        <div className="flex flex-row justify-between items-center">
          <div className="flex flex-row items-center justify-between gap-4">
            <div className="h-10 w-10 rounded-full bg-[#F2F2F2]"></div>
            <div className="flex flex-col">
              <p
                className={`font-semibold text-sm ${match.score.winner === "player2" ? "text-[#0D0D0D]" : "text-[#BFBFBF]"}`}
              >
                {match.player2.name}
              </p>
            </div>
          </div>
          <div className="flex flex-row gap-4 font-semibold text-[18px]">
            {match.score.sets.map((set, idx) => (
              <p
                key={idx}
                className={
                  set.player2 > set.player1
                    ? "text-[#0D0D0D]"
                    : "text-[#BFBFBF]"
                }
              >
                {set.player2}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
