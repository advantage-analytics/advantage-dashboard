"use client";

import Link from "next/link";
import { MatchMetadataRow } from "@/components/dashboard/matches/match-metadata-row";
import type { EventGroup, MatchRow } from "@/app/dashboard/(home)/recent-activity";

interface RecentMatchesProps {
  event: EventGroup;
}

function MatchRowItem({ match }: { match: MatchRow }) {
  return (
    <Link
      href={`/dashboard/matches/${match.id}`}
      aria-label={`${match.won ? "Win" : "Loss"} vs ${match.opponentName}, ${match.score}`}
      className="flex gap-4 items-center px-1 py-2 transition-[background-color,transform] duration-200 hover:bg-[#FAFAFA] active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3986F3]/50 focus-visible:ring-offset-1"
    >
      {/* W/L Badge */}
      <div
        className={`size-[24px] rounded-[4px] flex items-center justify-center shrink-0 ${
          match.won
            ? "bg-[rgba(93,185,85,0.1)] text-[#5DB955]"
            : "bg-[rgba(229,24,55,0.1)] text-[#E51837]"
        }`}
      >
        <span className="text-[11px] font-semibold text-center leading-none">
          {match.won ? "W" : "L"}
        </span>
      </div>

      {/* Player name + score */}
      <div className="flex items-center gap-4 shrink-0">
        <span className="text-[14px] font-normal text-[#0A0A0C]">
          {match.opponentName}
        </span>
        <div className="flex items-center gap-1.5 tabular-nums">
          {match.score.split(" ").map((set, i) => {
            const parts = set.split("-");
            const userGames = parseInt(parts[0], 10);
            const oppGames = parseInt(parts[1], 10);
            const wonSet = userGames > oppGames;
            return (
              <span key={i} className="text-[12px] tracking-[0.3px]">
                <span className={wonSet ? "font-medium text-[#0D0D0D]" : "font-normal text-[#B3B3B3]"}>
                  {userGames}
                </span>
                <span className="text-[#DDDDDD] font-light">-</span>
                <span className={wonSet ? "font-normal text-[#B3B3B3]" : "font-medium text-[#0D0D0D]"}>
                  {oppGames}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Per-row stat columns */}
      <div className="flex-1 flex items-center justify-end gap-4">
        <div className="flex flex-col gap-2 items-end shrink-0">
          <span className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2px] leading-[13.5px]">
            FIRST SERVE
          </span>
          <span className="text-[13px] font-light text-[#0A0A0C] tabular-nums">
            {match.firstServePct != null ? `${match.firstServePct}%` : "\u2014"}
          </span>
        </div>
        <div className="flex flex-col gap-2 items-end shrink-0">
          <span className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2px] leading-[13.5px]">
            WINNERS / ERRORS
          </span>
          <span className="text-[13px] font-light text-[#0A0A0C] tabular-nums">
            {match.winners != null && match.errors != null
              ? `${match.winners}/${match.errors}`
              : "\u2014"}
          </span>
        </div>
        <div className="flex flex-col gap-2 items-end shrink-0">
          <span className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2px] leading-[13.5px]">
            BREAKPOINTS
          </span>
          <span className="text-[13px] font-light text-[#0A0A0C] tabular-nums">
            {match.breakpointsWon != null && match.breakpointsTotal != null
              ? `${match.breakpointsWon}/${match.breakpointsTotal}`
              : "\u2014"}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function RecentMatches({ event }: RecentMatchesProps) {
  return (
    <div className="flex flex-col gap-3 px-5">
      {/* Event Header */}
      <div className="flex flex-col gap-2">
        <p className="text-[16px] font-normal text-black tracking-[-0.4px] leading-[24px]">
          {event.tournamentName}
        </p>
        <MatchMetadataRow
          date={event.date}
          matchType={event.matchType ?? undefined}
          courtType={event.courtType ?? undefined}
          verificationStatus={event.verificationStatus ?? undefined}
        />
      </div>

      {/* Match Rows */}
      <div className="flex flex-col">
        {event.matches.map((match, i) => (
          <div key={match.id}>
            <MatchRowItem match={match} />
            {i < event.matches.length - 1 && (
              <div className="h-px bg-[#F0F0F0]" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
