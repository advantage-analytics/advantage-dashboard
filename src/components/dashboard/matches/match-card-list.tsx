"use client";

import Link from "next/link";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { getInitials } from "@/lib/data/match-utils";
import { providers } from "@/lib/providers";

const LIST_GRID_COLS = { gridTemplateColumns: "2fr 60px 1.4fr 1fr 1fr 1.2fr 0.8fr 1fr" } as const;

interface MatchCardListProps {
  match: DisplayMatch;
}

export function MatchCardList({ match }: MatchCardListProps): React.JSX.Element {
  const isWin = match.score.winner === "player1";
  const provider = providers.find((p) => p.id === match.sourceProvider);

  return (
    <Link
      href={`/dashboard/matches/${match.id}`}
      className="group grid gap-x-4 items-center px-4 h-11 rounded-lg hover:bg-[#FAFAFA] transition-colors duration-150"
      style={LIST_GRID_COLS}
    >
      {/* Event */}
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-[#0D0D0D] truncate leading-tight">
          {match.tournamentName}
        </p>
        {match.round && (
          <p className="text-[10px] text-[#CCCCCC] truncate leading-tight mt-0.5">{match.round}</p>
        )}
      </div>

      {/* Result */}
      <div className="min-w-0">
        <span
          className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[10px] font-medium ${
            isWin
              ? "bg-[#D1FADF] text-[#05603A]"
              : "bg-[#FEE4E2] text-[#D92D20]"
          }`}
        >
          {isWin ? "Won" : "Loss"}
        </span>
      </div>

      {/* Opponent */}
      <div className="min-w-0 flex items-center gap-2">
        <div className="w-5 h-5 rounded-full bg-[#F2F2F2] flex items-center justify-center shrink-0">
          <span className="text-[8px] font-medium text-[#BFBFBF] leading-none">
            {getInitials(match.player2.name)}
          </span>
        </div>
        <span className="text-[12px] font-medium text-[#0D0D0D] truncate">{match.player2.name}</span>
      </div>

      {/* Match Type */}
      <div className="min-w-0">
        {match.matchType ? (
          <span className="text-[12px] text-[#888888] capitalize truncate block">{match.matchType}</span>
        ) : (
          <span className="text-[12px] text-[#D9D9D9]">&mdash;</span>
        )}
      </div>

      {/* Court Type */}
      <div className="min-w-0">
        {match.courtType ? (
          <span className="text-[12px] text-[#888888] capitalize truncate block">{match.courtType}</span>
        ) : (
          <span className="text-[12px] text-[#D9D9D9]">&mdash;</span>
        )}
      </div>

      {/* Date */}
      <div className="min-w-0">
        <span className="text-[12px] text-[#888888] tabular-nums whitespace-nowrap">{match.date}</span>
      </div>

      {/* Duration */}
      <div className="min-w-0">
        {match.duration ? (
          <span className="text-[12px] text-[#888888] tabular-nums">{match.duration}</span>
        ) : (
          <span className="text-[12px] text-[#D9D9D9]">&mdash;</span>
        )}
      </div>

      {/* Source */}
      <div className="min-w-0">
        {provider ? (
          <span className="text-[12px] text-[#888888] truncate block">{provider.name}</span>
        ) : (
          <span className="text-[12px] text-[#D9D9D9]">&mdash;</span>
        )}
      </div>
    </Link>
  );
}
