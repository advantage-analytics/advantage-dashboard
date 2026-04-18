"use client";

import { memo, useCallback, useRef } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { MatchMetadataRow } from "@/components/dashboard/matches/match-metadata-row";
import type { EventGroup, MatchRow } from "@/app/dashboard/(home)/recent-activity";

// Strong ease-out (Emil: instant feedback, smooth settle)
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

interface RecentMatchesProps {
  event: EventGroup;
  isNewEvent?: boolean;
}

function MatchLink({ match }: { match: MatchRow }) {
  return (
    <Link
      href={`/dashboard/matches/${match.id}`}
      aria-label={`${match.won ? "Win" : "Loss"} vs ${match.opponentName}, ${match.score}`}
      className="flex items-center justify-between rounded-lg px-2 py-2.5 -mx-2 transition-[background-color,transform] duration-200 ease-out hover:bg-[#FAFAFA] active:scale-[0.998] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:ring-offset-1"
    >
      {/* Left: Vertical indicator + opponent info */}
      <div className="flex gap-3 items-center">
        <div
          className={`w-px h-10 rounded-full shrink-0 ${
            match.won ? "bg-[#5DB955]" : "bg-[#E51837]"
          }`}
        />
        <div className="flex flex-col gap-2 flex-1 min-w-0 max-w-[255px] overflow-hidden">
          <div className="flex items-end gap-3 overflow-hidden whitespace-nowrap leading-normal">
            <span className="text-[14px] font-normal text-[#0D0D0D]">
              {match.opponentName}
            </span>
            <span className="text-[12px] font-normal text-[#888888] tracking-[0.3px]">
              {match.score}
            </span>
          </div>
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

      {/* Right: Stat columns — hidden on small screens */}
      <div className="hidden md:flex items-center gap-4">
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

/**
 * Animated wrapper — only new rows get the entrance animation.
 * Existing rows render the static MatchLink directly (no motion overhead).
 */
const MatchRowItem = memo(
  function MatchRowItem({
    match,
    isNew,
    newIndex,
    baseDelay = 0,
  }: {
    match: MatchRow;
    isNew: boolean;
    newIndex: number;
    baseDelay?: number;
  }) {
    const shouldReduceMotion = useReducedMotion();

    if (!isNew) {
      return <MatchLink match={match} />;
    }

    const tint = match.won
      ? "rgba(93,185,85,0.06)"
      : "rgba(229,24,55,0.06)";
    const delay = baseDelay + newIndex * 0.08;

    return (
      <motion.div
        initial={
          shouldReduceMotion
            ? { opacity: 0 }
            : { opacity: 0, y: 12, scaleY: 0.97, filter: "blur(3px)" }
        }
        animate={{
          opacity: 1,
          y: 0,
          scaleY: 1,
          filter: "blur(0px)",
          backgroundColor: "rgba(0,0,0,0)",
        }}
        transition={{
          duration: 0.5,
          ease: EASE_OUT,
          delay,
          backgroundColor: { duration: 1.2, ease: EASE_OUT, delay },
        }}
        style={{
          backgroundColor: tint,
          transformOrigin: "top",
          borderRadius: 8,
        }}
      >
        <MatchLink match={match} />
      </motion.div>
    );
  },
  (prev, next) =>
    prev.match.id === next.match.id &&
    prev.match.score === next.match.score &&
    prev.match.firstServePct === next.match.firstServePct &&
    prev.match.winners === next.match.winners &&
    prev.match.errors === next.match.errors &&
    prev.isNew === next.isNew &&
    prev.baseDelay === next.baseDelay
);

export default function RecentMatches({ event, isNewEvent = false }: RecentMatchesProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string> | null>(null);
  const shouldReduceMotion = useReducedMotion();

  // Determine which match IDs are new (not seen in previous render)
  const currentIds = event.matches.map((m) => m.id);
  const newIds = new Set<string>();

  if (seenIdsRef.current === null) {
    // First render — if this is a new event, all matches are "new"
    seenIdsRef.current = new Set(isNewEvent ? [] : currentIds);
    if (isNewEvent) {
      for (const id of currentIds) newIds.add(id);
    }
  } else {
    for (const id of currentIds) {
      if (!seenIdsRef.current.has(id)) {
        newIds.add(id);
      }
    }
    seenIdsRef.current = new Set(currentIds);
  }

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

  const rowBaseDelay = isNewEvent ? 0.3 : 0;
  let newIndex = 0;

  const headerContent = (
    <>
      <p className="text-[16px] font-normal text-[#0D0D0D] tracking-[-0.4px] leading-[24px]">
        {event.tournamentName}
      </p>
      <MatchMetadataRow
        date={event.date}
        matchType={event.matchType ?? undefined}
        courtType={event.courtType ?? undefined}
        verificationStatus={event.verificationStatus ?? undefined}
      />
    </>
  );

  return (
    <div className="flex flex-col gap-3 px-5">
      {/* Event Header */}
      {isNewEvent && !shouldReduceMotion ? (
        <motion.div
          className="flex flex-col gap-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
        >
          {headerContent}
        </motion.div>
      ) : (
        <div className="flex flex-col gap-2">{headerContent}</div>
      )}

      {/* Match Rows */}
      <div
        className="flex flex-col gap-5"
        onKeyDown={handleArrowNav}
        ref={listRef}
        role="list"
        aria-label="Match results, use arrow keys to navigate"
      >
        {event.matches.map((match) => {
          const isNew = newIds.has(match.id);
          const staggerIdx = isNew ? newIndex++ : 0;
          return (
            <MatchRowItem
              key={match.id}
              match={match}
              isNew={isNew}
              newIndex={staggerIdx}
              baseDelay={rowBaseDelay}
            />
          );
        })}
      </div>
    </div>
  );
}
