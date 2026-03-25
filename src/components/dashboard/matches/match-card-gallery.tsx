"use client";

import Link from "next/link";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { getInitials } from "@/lib/data/match-utils";

interface GalleryPlayerRowProps {
  playerName: string;
  isWinner: boolean;
  sets: DisplayMatch["score"]["sets"];
  playerKey: "player1" | "player2";
}

function GalleryPlayerRow({
  playerName,
  isWinner,
  sets,
  playerKey,
}: GalleryPlayerRowProps): React.JSX.Element {
  const opponentKey = playerKey === "player1" ? "player2" : "player1";

  return (
    <div className="flex flex-row justify-between items-center">
      <div className="flex flex-row items-center gap-3">
        <div className="w-7 h-7 rounded bg-[#F2F2F2] flex items-center justify-center shrink-0">
          <span className="text-[10px] font-medium text-[#BFBFBF]">
            {getInitials(playerName)}
          </span>
        </div>
        <span
          className={`text-sm truncate max-w-[120px] ${
            isWinner
              ? "font-semibold text-[#0D0D0D]"
              : "font-normal text-[#ABABAB]"
          }`}
        >
          {playerName}
        </span>
      </div>
      <div className="flex flex-row gap-3">
        {sets.map((set, idx) => (
          <span
            key={idx}
            className={`text-base tabular-nums ${
              set[playerKey] > set[opponentKey]
                ? "font-semibold text-[#0D0D0D]"
                : "font-normal text-[#C8C8C8]"
            }`}
          >
            {set[playerKey]}
          </span>
        ))}
      </div>
    </div>
  );
}

interface MatchCardGalleryProps {
  match: DisplayMatch;
}

export function MatchCardGallery({
  match,
}: MatchCardGalleryProps): React.JSX.Element {
  const isWin = match.score.winner === "player1";

  return (
    <Link
      href={`/dashboard/matches/${match.id}`}
      className="group block w-full bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] hover:bg-[#FAFAFA] transition-colors duration-150"
    >
      <div className="flex flex-row gap-4 px-5 py-4">
        {/* Left accent line */}
        <div
          className={`w-0.5 self-stretch rounded-full shrink-0 ${
            isWin ? "bg-[#3986F3]" : "bg-[#E5E5E5]"
          }`}
        />

        <div className="flex flex-col gap-3 flex-1 min-w-0">
          {/* Top row: result label + duration */}
          <div className="flex flex-row justify-between items-center gap-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                isWin
                  ? "bg-[#EBF0FE] text-[#3986F3]"
                  : "bg-[#F5F5F5] text-[#999999]"
              }`}
            >
              {isWin ? "Won" : "Loss"}
            </span>
            {match.duration && (
              <span className="text-[10px] font-medium text-[#BBBBBB] tabular-nums">
                {match.duration}
              </span>
            )}
          </div>

          {/* Tournament + round */}
          <div className="-mt-1">
            <p className="text-xs font-medium text-[#0D0D0D] truncate">
              {match.tournamentName}
            </p>
            {match.round && (
              <p className="text-[11px] text-[#ABABAB] truncate mt-0.5">
                {match.round}
              </p>
            )}
          </div>

          {/* Player rows */}
          <div className="flex flex-col gap-2.5 pt-0.5">
            <GalleryPlayerRow
              playerName={match.player1.name}
              isWinner={match.score.winner === "player1"}
              sets={match.score.sets}
              playerKey="player1"
            />
            <GalleryPlayerRow
              playerName={match.player2.name}
              isWinner={match.score.winner === "player2"}
              sets={match.score.sets}
              playerKey="player2"
            />
          </div>
        </div>
      </div>
    </Link>
  );
}
