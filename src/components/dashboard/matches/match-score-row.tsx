import type { Match } from "@/lib/data/types";
import { getInitials } from "@/lib/data/match-utils";

interface MatchScoreRowProps {
  match: Match;
}

export function MatchScoreRow({ match }: MatchScoreRowProps) {
  const { sets, winner } = match.score;

  return (
    <div className="w-full flex items-center justify-between rounded-2xl bg-white">
      {/* Player 1 — left */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-[4px] bg-[#F2F2F2] flex items-center justify-center shrink-0">
          <span className="text-xs font-medium text-[#BFBFBF]">
            {getInitials(match.player1.name)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-medium text-[#0D0D0D]">
            {match.player1.name}
          </span>
          {match.player1.school && (
            <span className="text-[10px] text-[#999999]">
              {match.player1.school}
            </span>
          )}
        </div>
      </div>

      {/* Set scores — center */}
      <div className="flex items-center gap-6">
        {sets.map((set, idx) => {
          const p1Won = set.player1 > set.player2;
          return (
            <div key={idx} className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-medium tracking-[0.5px] uppercase text-[#D9D9D9]">
                SET {idx + 1}
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={`text-2xl font-semibold ${
                    p1Won ? "text-[#0D0D0D]" : "text-[#D9D9D9]"
                  }`}
                >
                  {set.player1}
                </span>
                <span className="text-[10px] text-[#D9D9D9]">-</span>
                <span
                  className={`text-2xl font-semibold ${
                    !p1Won ? "text-[#0D0D0D]" : "text-[#D9D9D9]"
                  }`}
                >
                  {set.player2}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Player 2 — right */}
      <div className="flex items-center gap-3 flex-row-reverse">
        <div className="w-12 h-12 rounded-[4px] bg-[#F2F2F2] flex items-center justify-center shrink-0">
          <span className="text-xs font-medium text-[#BFBFBF]">
            {getInitials(match.player2.name)}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs font-medium text-[#0D0D0D]">
            {match.player2.name}
          </span>
          {match.player2.school && (
            <span className="text-[10px] text-[#999999]">
              {match.player2.school}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
