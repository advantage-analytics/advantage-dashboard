"use client";

import Link from "next/link";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { getInitials } from "@/lib/data/match-utils";
import { providers } from "@/lib/providers";

interface MatchCardListProps {
  match: DisplayMatch;
}

export function MatchCardList({ match }: MatchCardListProps): React.JSX.Element {
  const isWin = match.score.winner === "player1";
  const provider = providers.find((p) => p.id === match.sourceProvider);

  return (
    <Link
      href={`/dashboard/matches/${match.id}`}
      className="group flex items-center px-4 h-12 border-b border-[#F0F0F0] last:border-b-0 hover:bg-[#FAFAFA] transition-colors duration-150 cursor-pointer"
    >
      {/* Event */}
      <div className="flex-1 min-w-0 pr-6">
        <p className="text-[13px] font-normal text-[#333333] truncate leading-tight">
          {match.tournamentName}
        </p>
        {match.round && (
          <p className="text-[11px] text-[#BBBBBB] truncate leading-tight mt-0.5">{match.round}</p>
        )}
      </div>

      {/* Result */}
      <div className="w-20 shrink-0 pr-6">
        <span
          className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-[11px] font-medium ${
            isWin
              ? "bg-[#D1FADF] text-[#05603A]"
              : "bg-[#FEE4E2] text-[#D92D20]"
          }`}
        >
          {isWin ? "Won" : "Loss"}
        </span>
      </div>

      {/* Opponent */}
      <div className="w-44 shrink-0 flex items-center gap-2 pr-6">
        <div className="w-6 h-6 rounded-full bg-[#F2F2F2] flex items-center justify-center shrink-0">
          <span className="text-[9px] font-medium text-[#BFBFBF] leading-none">
            {getInitials(match.player2.name)}
          </span>
        </div>
        <span className="text-[13px] text-[#333333] truncate">{match.player2.name}</span>
      </div>

      {/* Court Type */}
      <div className="w-20 shrink-0 pr-6">
        {match.courtType ? (
          <span className="text-[12px] text-[#888888] capitalize">{match.courtType}</span>
        ) : (
          <span className="text-[12px] text-[#D9D9D9]">&mdash;</span>
        )}
      </div>

      {/* Date */}
      <div className="w-36 shrink-0 pr-6">
        <span className="text-[12px] text-[#888888] tabular-nums whitespace-nowrap">{match.date}</span>
      </div>

      {/* Duration */}
      <div className="w-20 shrink-0 pr-6">
        {match.duration ? (
          <span className="text-[12px] text-[#888888] tabular-nums">{match.duration}</span>
        ) : (
          <span className="text-[12px] text-[#D9D9D9]">&mdash;</span>
        )}
      </div>

      {/* Source */}
      <div className="w-32 shrink-0">
        {provider ? (
          <span className="text-[12px] text-[#888888]">{provider.name}</span>
        ) : (
          <span className="text-[12px] text-[#D9D9D9]">&mdash;</span>
        )}
      </div>
    </Link>
  );
}
