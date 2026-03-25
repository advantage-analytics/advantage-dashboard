"use client";

import Link from "next/link";
import { Calendar, Layers, MapPin } from "lucide-react";
import type { DisplayMatch } from "@/lib/data/matches-list-types";

interface ScoreRowProps {
  playerName: string;
  isWinner: boolean;
  sets: DisplayMatch["score"]["sets"];
  playerKey: "player1" | "player2";
}

function ScoreRow({
  playerName,
  isWinner,
  sets,
  playerKey,
}: ScoreRowProps): React.JSX.Element {
  const opponentKey = playerKey === "player1" ? "player2" : "player1";

  return (
    <div
      className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${
        isWinner ? "bg-[#F7F9FF]" : ""
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={`w-[2px] self-stretch rounded-full shrink-0 ${
            isWinner ? "bg-[#3986F3]" : "bg-transparent"
          }`}
        />
        <span
          className={`text-[13px] truncate ${
            isWinner
              ? "font-semibold text-[#0D0D0D]"
              : "font-normal text-[#999999]"
          }`}
        >
          {playerName}
        </span>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {sets.map((set, idx) => (
          <span
            key={idx}
            className={`w-5 text-center text-[15px] tabular-nums ${
              set[playerKey] > set[opponentKey]
                ? "font-semibold text-[#0D0D0D]"
                : "font-normal text-[#CCCCCC]"
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
  return (
    <Link
      href={`/dashboard/matches/${match.id}`}
      className="group block w-full bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-[rgba(0,0,0,0.10)] transition-all duration-150"
    >
      <div className="px-5 pt-4 pb-4">
        {/* Header: status + duration */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-medium text-[#D9D9D9] uppercase tracking-[0.5px]">
            {match.matchContext ?? "Final Score"}
          </span>
          {match.duration && (
            <span className="text-[10px] font-medium text-[#D9D9D9] tabular-nums">
              {match.duration}
            </span>
          )}
        </div>

        {/* Set column headers — aligned with ScoreRow scores via matching px-3 offset */}
        <div className="flex items-center justify-end mb-1 px-3">
          <div className="flex items-center gap-4">
            {match.score.sets.map((_, idx) => (
              <span
                key={idx}
                className="w-5 text-center text-[9px] font-medium text-[#D9D9D9] uppercase"
              >
                S{idx + 1}
              </span>
            ))}
          </div>
        </div>

        {/* Scoreboard */}
        <div className="flex flex-col gap-0.5">
          <ScoreRow
            playerName={match.player1.name}
            isWinner={match.score.winner === "player1"}
            sets={match.score.sets}
            playerKey="player1"
          />
          <ScoreRow
            playerName={match.player2.name}
            isWinner={match.score.winner === "player2"}
            sets={match.score.sets}
            playerKey="player2"
          />
        </div>

        {/* Footer metadata with icons */}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#F0F0F0]">
          {match.courtType && (
            <div className="flex items-center gap-1">
              <MapPin className="w-3 h-3 text-[#D9D9D9]" strokeWidth={2} />
              <span className="text-[11px] text-[#999999] capitalize">
                {match.courtType}
              </span>
            </div>
          )}
          {match.matchType && (
            <div className="flex items-center gap-1">
              <Layers className="w-3 h-3 text-[#D9D9D9]" strokeWidth={2} />
              <span className="text-[11px] text-[#999999]">
                {match.matchType}
              </span>
            </div>
          )}
          {match.date && (
            <div className="flex items-center gap-1 ml-auto">
              <Calendar className="w-3 h-3 text-[#D9D9D9]" strokeWidth={2} />
              <span className="text-[11px] text-[#999999] tabular-nums">
                {match.date}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
