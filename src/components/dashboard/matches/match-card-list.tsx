"use client";

import Link from "next/link";
import Image from "next/image";
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
      className="group flex items-center px-4 py-3 border-b border-[#F0F0F0] last:border-b-0 hover:bg-[#FAFAFA] transition-colors duration-150 cursor-pointer"
    >
      {/* Event */}
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm font-medium text-[#0D0D0D] truncate">
          {match.tournamentName}
        </p>
        {match.round && (
          <p className="text-[11px] text-[#BBBBBB] mt-0.5 truncate">{match.round}</p>
        )}
      </div>

      {/* Result */}
      <div className="w-16 shrink-0 pr-4">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
            isWin
              ? "bg-[#EBF0FE] text-[#3986F3]"
              : "bg-[#F5F5F5] text-[#999999]"
          }`}
        >
          {isWin ? "Won" : "Loss"}
        </span>
      </div>

      {/* Opponent */}
      <div className="w-44 shrink-0 flex items-center gap-2.5 pr-4">
        <div className="w-6 h-6 rounded bg-[#F2F2F2] flex items-center justify-center shrink-0">
          <span className="text-[9px] font-medium text-[#BFBFBF]">
            {getInitials(match.player2.name)}
          </span>
        </div>
        <span className="text-sm text-[#333333] truncate">{match.player2.name}</span>
      </div>

      {/* Date */}
      <div className="w-32 shrink-0 pr-4">
        <span className="text-xs text-[#888888] tabular-nums">{match.date}</span>
      </div>

      {/* Duration */}
      <div className="w-20 shrink-0 pr-4">
        {match.duration ? (
          <span className="text-xs text-[#888888] tabular-nums">{match.duration}</span>
        ) : (
          <span className="text-xs text-[#CCCCCC]">&mdash;</span>
        )}
      </div>

      {/* Source */}
      <div className="w-32 shrink-0">
        {provider ? (
          <div className="flex items-center gap-1.5">
            <Image
              src={provider.logo}
              alt={provider.name}
              width={16}
              height={16}
              className="rounded-sm object-contain shrink-0"
            />
            <span className="text-[11px] font-medium text-[#555555] truncate">
              {provider.name}
            </span>
          </div>
        ) : (
          <span className="text-xs text-[#CCCCCC]">&mdash;</span>
        )}
      </div>
    </Link>
  );
}
