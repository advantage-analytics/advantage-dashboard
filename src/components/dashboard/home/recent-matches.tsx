"use client";

import { useCallback, useRef } from "react";
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
      className="flex items-center justify-between rounded-lg px-2 py-2.5 -mx-2 transition-[background-color,transform] duration-200 ease-out hover:bg-[#FAFAFA] active:scale-[0.998] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/50 focus-visible:ring-offset-1"
    >
      {/* Left: Vertical indicator + opponent info */}
      <div className="flex gap-3 items-center">
        {/* Win/loss indicator line */}
        <div
          className={`w-px h-10 rounded-full shrink-0 ${
            match.won ? "bg-[#5DB955]" : "bg-[#E51837]"
          }`}
        />

        {/* Opponent info */}
        <div className="flex flex-col gap-2 w-[255px] overflow-hidden">
          {/* Name + Score */}
          <div className="flex items-end gap-3 overflow-hidden whitespace-nowrap leading-normal">
            <span className="text-[14px] font-normal text-[#0D0D0D]">
              {match.opponentName}
            </span>
            <span className="text-[12px] font-normal text-[#71717A] tracking-[0.3px]">
              {match.score}
            </span>
          </div>

          {/* Opponent metadata (handedness, backhand) */}
          {match.opponentMeta && match.opponentMeta.length > 0 && (
            <div className="flex items-start gap-2 text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2.5px] leading-[13.5px] overflow-hidden whitespace-nowrap">
              {match.opponentMeta.map((meta, i) => (
                <span key={i} className="shrink-0">
                  {i > 0 && <span className="mr-2">·</span>}
                  {meta}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Stat columns */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col gap-2 items-end shrink-0">
          <span className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2.5px] leading-[13.5px]">
            FIRST SERVE
          </span>
          <span className="text-[13px] font-light text-[#0D0D0D] tabular-nums">
            {match.firstServePct != null ? `${match.firstServePct}%` : "\u2014"}
          </span>
        </div>
        <div className="flex flex-col gap-2 items-end shrink-0">
          <span className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2.5px] leading-[13.5px]">
            WINNERS / ERRORS
          </span>
          <span className="text-[13px] font-light text-[#0D0D0D] tabular-nums">
            {match.winners != null && match.errors != null
              ? `${match.winners}/${match.errors}`
              : "\u2014"}
          </span>
        </div>
        <div className="flex flex-col gap-2 items-end shrink-0">
          <span className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2.5px] leading-[13.5px]">
            BREAKPOINTS
          </span>
          <span className="text-[13px] font-light text-[#0D0D0D] tabular-nums">
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
  const listRef = useRef<HTMLDivElement>(null);

  const handleArrowNav = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const list = listRef.current;
    if (!list) return;
    const links = Array.from(list.querySelectorAll<HTMLAnchorElement>("a"));
    const idx = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (idx === -1) return;
    e.preventDefault();
    const next = e.key === "ArrowDown" ? idx + 1 : idx - 1;
    links[next]?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-3 px-5">
      {/* Event Header */}
      <div className="flex flex-col gap-2">
        <p className="text-[16px] font-normal text-[#0D0D0D] tracking-[-0.4px] leading-[24px]">
          {event.tournamentName}
        </p>
        <MatchMetadataRow
          date={event.date}
          matchType={event.matchType ?? undefined}
          courtType={event.courtType ?? undefined}
          verificationStatus={event.verificationStatus ?? undefined}
        />
      </div>

      {/* Match Rows — arrow key navigation within group */}
      <div
        className="flex flex-col gap-5"
        onKeyDown={handleArrowNav}
        ref={listRef}
      >
        {event.matches.map((match) => (
          <MatchRowItem key={match.id} match={match} />
        ))}
      </div>
    </div>
  );
}
