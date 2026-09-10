"use client";

import Link from "next/link";
import Image from "next/image";
import { Calendar, Swords, BadgeCheck } from "lucide-react";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { MatchActionsMenu } from "@/components/dashboard/matches/match-actions/match-actions-menu";

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
      className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${
        isWinner ? "bg-[#FAFAFA]" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={`truncate text-[13px] ${
            isWinner
              ? "font-semibold text-[#0D0D0D]"
              : "font-normal text-[#888888]"
          }`}
        >
          {playerName}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        {sets.map((set, idx) => (
          <span
            key={idx}
            className={`w-5 text-center text-[14px] tabular-nums ${
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
  isNew?: boolean;
}

export function MatchCardGallery({
  match,
  isNew,
}: MatchCardGalleryProps): React.JSX.Element {
  return (
    <div
      className={`group relative w-full${isNew ? "animate-[highlight-new-match_1.5s_ease-out_0.4s_both]" : ""}`}
    >
      <div className="absolute top-3 right-3 z-10 opacity-100 transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
        <MatchActionsMenu
          matchId={match.id}
          matchLabel={match.tournamentName}
        />
      </div>
      <Link
        href={`/dashboard/matches/${match.id}`}
        className="block w-full overflow-hidden rounded-[14px] border border-[#F3F3F3] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[box-shadow,border-color] duration-200 hover:border-[#E5E5EA] hover:shadow-[0px_6px_20px_0px_rgba(0,0,0,0.10)] focus-visible:outline-none"
      >
        <div className="p-5">
          {/* Header: match context + verified + duration */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium tracking-[2.5px] text-[#AAAAAA] uppercase">
                {match.matchContext ?? "Final Score"}
              </span>
              {match.verificationStatus && (
                <span title="Verified result">
                  <BadgeCheck
                    className="size-3.5 shrink-0 text-[#3B82F6]"
                    strokeWidth={1.5}
                    aria-label="Verified result"
                  />
                </span>
              )}
            </div>
            {match.duration && (
              <span className="text-[10px] font-medium text-[#AAAAAA] tabular-nums">
                {match.duration}
              </span>
            )}
          </div>

          {/* Set column headers — aligned with ScoreRow scores via matching px-3 offset */}
          <div className="mb-1 flex items-center justify-end px-3">
            <div className="flex items-center gap-4">
              {match.score.sets.map((_, idx) => (
                <span
                  key={idx}
                  className="w-5 text-center text-[9px] font-medium text-[#AAAAAA] uppercase"
                >
                  {idx + 1}
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
          <div className="mt-3 flex items-center gap-3 border-t border-[var(--border-hairline)] pt-3">
            {match.courtType && (
              <div className="flex items-center gap-1">
                <Image
                  src="/icons/tennis-court-icon.svg"
                  alt=""
                  width={14}
                  height={14}
                  aria-hidden="true"
                />
                <span className="text-[10px] leading-[16px] font-normal text-[#888888] capitalize">
                  {match.courtType}
                </span>
              </div>
            )}
            {match.matchType && (
              <div className="flex items-center gap-1">
                {match.matchType === "Tournament" ? (
                  <Image
                    src="/icons/tournament-icon.svg"
                    alt=""
                    width={14}
                    height={14}
                    aria-hidden="true"
                  />
                ) : (
                  <Swords
                    className="size-[14px] text-[#888888]"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                )}
                <span className="text-[10px] leading-[16px] font-normal text-[#888888]">
                  {match.matchType}
                </span>
              </div>
            )}
            {match.date && (
              <div className="ml-auto flex items-center gap-1">
                <Calendar
                  className="size-[14px] text-[#888888]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span className="text-[10px] leading-[16px] font-normal text-[#888888] tabular-nums">
                  {match.date}
                </span>
              </div>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}
