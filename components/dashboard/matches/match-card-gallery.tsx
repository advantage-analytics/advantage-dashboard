"use client";

import Link from "next/link";
import type { DisplayMatch } from "@/lib/data/matches-list-types";

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

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
      <div className="flex flex-row items-center gap-4">
        <div className="w-10 h-10 rounded bg-[#F2F2F2] flex items-center justify-center shrink-0">
          <span className="text-xs font-medium text-[#BFBFBF]">
            {getInitials(playerName)}
          </span>
        </div>
        <span
          className={`text-sm font-semibold ${
            isWinner ? "text-[#0D0D0D]" : "text-[#999999]"
          }`}
        >
          {playerName}
        </span>
      </div>
      <div className="flex flex-row gap-4">
        {sets.map((set, idx) => (
          <span
            key={idx}
            className={`text-lg font-semibold ${
              set[playerKey] > set[opponentKey]
                ? "text-[#0D0D0D]"
                : "text-[#999999]"
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

export function MatchCardGallery({ match }: MatchCardGalleryProps): React.JSX.Element {
  return (
    <Link
      href={`/dashboard/matches/${match.id}`}
      className="group block w-full bg-white border border-[#E7E7E7] rounded-2xl shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] transition-all hover:scale-[1.01]"
    >
      <div className="flex flex-col gap-4 px-6 py-4">
        <div className="flex flex-row justify-between items-center gap-12">
          <span className="text-xs font-medium text-[#999999]">
            {match.matchContext}
          </span>
          {match.duration && (
            <span className="px-1.5 py-0.5 rounded-[10px] bg-[#F3F3F3] text-[#999999] group-hover:bg-[#6AABFF] group-hover:text-white transition-colors text-xs font-medium">
              {match.duration}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-4">
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
    </Link>
  );
}
