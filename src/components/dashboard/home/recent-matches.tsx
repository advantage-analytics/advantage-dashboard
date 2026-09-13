"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { MatchMetadataRow } from "@/components/dashboard/matches/match-metadata-row";
import type { EventGroup, MatchRow } from "@/app/dashboard/(home)/recent-activity";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const STAT_COLUMNS: Array<{ label: string; format: (m: MatchRow) => string }> = [
  {
    label: "FIRST SERVE",
    format: (m) => (m.firstServePct != null ? `${m.firstServePct}%` : "—"),
  },
  {
    label: "WINNERS / ERRORS",
    format: (m) =>
      m.winners != null && m.errors != null ? `${m.winners}/${m.errors}` : "—",
  },
  {
    label: "BREAKPOINTS",
    format: (m) =>
      m.breakpointsWon != null && m.breakpointsTotal != null
        ? `${m.breakpointsWon}/${m.breakpointsTotal}`
        : "—",
  },
];

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
      <div className="flex gap-3 items-center">
        <div
          className={`w-px h-10 rounded-full shrink-0 ${
            match.won ? "bg-[#5DB955]" : "bg-[#E51837]"
          }`}
        />
        <div className="flex flex-col gap-2 flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap leading-normal">
            <span className="text-[14px] font-normal text-[#0D0D0D]">
              {match.opponentName}
            </span>
            <span className="text-[12px] font-normal text-[#888888] tracking-[0.3px]">
              {match.score}
            </span>
            <span
              className={`text-[10px] leading-[16px] font-medium uppercase tracking-[2.5px] ${
                match.won ? "text-[#5DB955]" : "text-[#E51837]"
              }`}
            >
              {match.won ? "Won" : "Lost"}
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

      <div className="hidden md:flex items-center gap-4">
        {STAT_COLUMNS.map(({ label, format }) => (
          <div key={label} className="flex flex-col gap-2 items-end shrink-0">
            <span className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2.5px] leading-[13.5px]">
              {label}
            </span>
            <span className="text-[13px] font-light text-[#0D0D0D] tabular-nums">
              {format(match)}
            </span>
          </div>
        ))}
      </div>
    </Link>
  );
}

const MatchRowItem = memo(function MatchRowItem({
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

  const tint = match.won ? "rgba(93,185,85,0.06)" : "rgba(229,24,55,0.06)";
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
      style={{ backgroundColor: tint }}
      className="rounded-lg origin-top"
    >
      <MatchLink match={match} />
    </motion.div>
  );
});

export default function RecentMatches({ event, isNewEvent = false }: RecentMatchesProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string> | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const newIds = new Set<string>();
  if (seenIdsRef.current === null) {
    if (isNewEvent) {
      for (const m of event.matches) newIds.add(m.id);
    }
  } else {
    for (const m of event.matches) {
      if (!seenIdsRef.current.has(m.id)) newIds.add(m.id);
    }
  }

  useEffect(() => {
    const ids = new Set<string>();
    for (const m of event.matches) ids.add(m.id);
    seenIdsRef.current = ids;
  }, [event.matches]);

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

  return (
    <div className="flex flex-col gap-3 px-5">
      <motion.div
        className="flex flex-col gap-2"
        initial={isNewEvent && !shouldReduceMotion ? { opacity: 0, y: 8 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
      >
        <p className="text-[16px] font-normal text-[#0D0D0D] tracking-[-0.4px] leading-[24px]">
          {event.tournamentName}
        </p>
        <MatchMetadataRow
          date={event.date}
          matchType={event.matchType ?? undefined}
          courtType={event.courtType ?? undefined}
          verificationStatus={event.verificationStatus ?? undefined}
        />
      </motion.div>

      <div
        className="flex flex-col gap-3"
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
