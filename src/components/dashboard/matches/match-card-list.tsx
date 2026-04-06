"use client";

import Link from "next/link";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { providers } from "@/lib/providers";

const LIST_GRID_COLS = { gridTemplateColumns: "1.5fr 55px 1fr 1.2fr 0.6fr 0.6fr 0.7fr 0.7fr 1fr 0.7fr" } as const;

function formatScore(sets: DisplayMatch["score"]["sets"]): string {
  return sets.map((s) => `${s.player1}-${s.player2}`).join(", ");
}

interface MatchCardListProps {
  match: DisplayMatch;
}

export function MatchCardList({ match }: MatchCardListProps): React.JSX.Element {
  const isWin = match.score.winner === "player1";
  const provider = providers.find((p) => p.id === match.sourceProvider);

  return (
    <Link
      href={`/dashboard/matches/${match.id}`}
      className="group grid gap-x-4 items-center px-4 h-11 rounded-lg hover:bg-[#FAFAFA] transition-[background-color,transform] duration-200 ease-out active:scale-[0.998] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/50 focus-visible:ring-offset-1"
      style={LIST_GRID_COLS}
    >
      {/* Event */}
      <div className="min-w-0">
        <p className="text-[12px] font-normal text-[#0D0D0D] truncate leading-tight">
          {match.tournamentName}
        </p>
        {match.round && (
          <p className="text-[10px] text-[#AAAAAA] truncate leading-tight mt-0.5">{match.round}</p>
        )}
      </div>

      {/* Result */}
      <div className="min-w-0">
        <span
          className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[10px] font-medium ${
            isWin
              ? "bg-[rgba(93,185,85,0.1)] text-[#5DB955]"
              : "bg-[rgba(229,24,55,0.1)] text-[#E51837]"
          }`}
        >
          {isWin ? "Won" : "Loss"}
        </span>
      </div>

      {/* Score */}
      <div className="min-w-0">
        <span className="text-[12px] font-normal text-[#71717A] tabular-nums tracking-[0.3px] truncate block">
          {formatScore(match.score.sets)}
        </span>
      </div>

      {/* Opponent */}
      <div className="min-w-0">
        <span className="text-[12px] font-normal text-[#0D0D0D] truncate block">{match.player2.name}</span>
      </div>

      {/* Hand */}
      <div className="min-w-0">
        {match.player2Hand ? (
          <span className="text-[12px] text-[#888888] capitalize truncate block">{match.player2Hand}</span>
        ) : (
          <span className="text-[12px] text-[#D9D9D9]">&mdash;</span>
        )}
      </div>

      {/* Backhand */}
      <div className="min-w-0">
        {match.player2Backhand ? (
          <span className="text-[12px] text-[#888888] truncate block">{match.player2Backhand}</span>
        ) : (
          <span className="text-[12px] text-[#D9D9D9]">&mdash;</span>
        )}
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
