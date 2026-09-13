"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { Loader2, TriangleAlert, ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { MatchMetadataRow } from "@/components/dashboard/matches/match-metadata-row";
import { ScoreLine } from "@/components/dashboard/score-line";
import { ResultMark } from "@/components/dashboard/result-mark";
import { StatusChip } from "@/components/ui/status-chip";
import {
  ANALYSIS_LABEL,
  isAnalysisFailed,
  isWorking,
  type AnalysisStatus,
} from "@/lib/data/match-analysis";
import { formatScoreText } from "@/lib/ui/score-format";
import type {
  EventGroup,
  MatchRow,
} from "@/app/dashboard/(home)/recent-activity";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

// Rows pull back 12px (`-mx-3`) for the hover wash inside the card's 20px
// side padding — the 8px inset DS r21.6 designs (it states it as 24 with a
// 16px bleed; Home's cards share one 20px padding, so the bleed follows).
//
// 64 / 56 / 52 — the cell widths Pa2 draws (the eyebrow-sm label is the
// widest thing in each, so the width is the label's, not the number's).
const STAT_CELLS: Array<{
  label: string;
  width: string;
  format: (m: MatchRow) => string;
}> = [
  {
    label: "1st serve",
    width: "64px",
    format: (m) => (m.firstServePct != null ? `${m.firstServePct}%` : "—"),
  },
  {
    label: "Winners",
    width: "56px",
    format: (m) => (m.winners != null ? `${m.winners}` : "—"),
  },
  {
    label: "Errors",
    width: "52px",
    format: (m) => (m.errors != null ? `${m.errors}` : "—"),
  },
];

interface RecentMatchesProps {
  event: EventGroup;
  isNewEvent?: boolean;
}

function StatCell({
  label,
  width,
  value,
}: {
  label: string;
  width: string;
  value: string;
}) {
  return (
    <span
      className="flex shrink-0 flex-col items-end gap-[3px]"
      style={{ width }}
    >
      <span className="eyebrow-sm whitespace-nowrap">{label}</span>
      <span className="tabular text-[12px] text-[var(--ink-900)]">{value}</span>
    </span>
  );
}

function MatchLink({ match }: { match: MatchRow }) {
  return (
    <Link
      href={`/dashboard/matches/${match.id}`}
      aria-label={`${match.won ? "Win" : "Loss"} vs ${match.opponentName}, ${formatScoreText(match.score)}`}
      className="-mx-3 flex min-h-[52px] items-center gap-4 rounded-[var(--radius-element)] px-3 py-[5px] transition-colors duration-200 hover:bg-[var(--surface-muted)] focus-visible:outline-none"
    >
      <ResultMark won={match.won} className="shrink-0" />

      <span className="w-[170px] shrink-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
        <span className="font-normal text-[var(--ink-600)]">
          {match.won ? "def. " : "l. "}
        </span>
        {match.opponentName}
      </span>

      <ScoreLine
        sets={match.score}
        className="text-scoreboard-sm w-[110px] shrink-0"
      />

      <div className="flex-1" />

      {/* Shown from a 672px card inward (`@2xl` of the `matches` container
          `RecentActivity` declares), which is what the row needs to hold the
          three cells beside a 170px name and a 110px score. It used to key off
          the viewport (`md:`), but the column's width depends on the sidebar
          as much as the window: at 1280 with the panel open the row is 516px
          wide, and three fixed cells landed on top of the score. */}
      <div className="hidden items-center gap-4 @2xl/matches:flex">
        {STAT_CELLS.map((cell) => (
          <StatCell
            key={cell.label}
            label={cell.label}
            width={cell.width}
            value={cell.format(match)}
          />
        ))}
      </div>

      <ChevronRight
        className="size-[13px] shrink-0 text-[var(--ink-300)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </Link>
  );
}

function InFlightLink({ match }: { match: MatchRow }) {
  const status = match.analysisStatus as AnalysisStatus;
  const failed = isAnalysisFailed(status);

  return (
    <Link
      href={`/dashboard/matches/${match.id}`}
      aria-label={`vs ${match.opponentName}, ${ANALYSIS_LABEL[status]}`}
      className="-mx-3 flex min-h-[52px] items-center gap-4 rounded-[var(--radius-element)] px-3 py-[5px] transition-colors duration-200 hover:bg-[var(--surface-muted)] focus-visible:outline-none"
    >
      <span className="flex w-3.5 shrink-0 items-center justify-center">
        {failed ? (
          /* Not `CircleX` — that shape is `ResultMark`'s alone (won/lost),
             and reusing it here would say this match was *lost* rather than
             *unanalyzed*. `TriangleAlert` is the team page's own glyph for
             this exact state (`needs-attention.tsx`'s "match-failed"). */
          <TriangleAlert
            className="size-3.5 text-[var(--danger)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        ) : (
          <Loader2
            className={cn(
              "size-3.5 text-[var(--ink-400)]",
              // Same question `StatusChip`'s `live` prop answers below — a
              // spinner turning for `uploaded` or `processed` claims work is
              // happening when nothing is; both are idle until something
              // outside the pipeline moves them.
              // 1.2s per turn, the frame's `advspin`; Tailwind's default spin is 1s.
              isWorking(status) && "animate-[spin_1.2s_linear_infinite]",
            )}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        )}
      </span>
      <span className="w-[170px] shrink-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
        vs {match.opponentName}
      </span>
      <div className="flex-1" />
      <StatusChip
        tone={failed ? "loss" : "blue"}
        live={!failed && isWorking(status)}
      >
        {ANALYSIS_LABEL[status]}
      </StatusChip>
      <ChevronRight
        className="size-[13px] shrink-0 text-[var(--ink-300)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
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
  const inFlight = !!match.analysisStatus;
  const link = inFlight ? (
    <InFlightLink match={match} />
  ) : (
    <MatchLink match={match} />
  );

  if (!isNew) return link;

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
      style={{ backgroundColor: inFlight ? "transparent" : tint }}
      className="origin-top rounded-lg"
    >
      {link}
    </motion.div>
  );
});

export default function RecentMatches({
  event,
  isNewEvent = false,
}: RecentMatchesProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string> | null>(null);
  const shouldReduceMotion = useReducedMotion();

  // Which rows arrived since the last commit, so they can animate in once. See
  // the identical pattern (and its rationale) in recent-activity.tsx.
  const newIds = new Set<string>();
  if (seenIdsRef.current === null) {
    if (isNewEvent) {
      for (const m of event.matches) newIds.add(m.id);
    }
  } else {
    for (const m of event.matches) {
      // eslint-disable-next-line react-hooks/refs -- see recent-activity.tsx
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
    // Pa2's event block: 14px above the name (12px for the first group, the
    // gap every sibling card keeps between its header row and its body),
    // 5px to the metadata row, 4px to the first match row. No hairline
    // between groups — the air and the 12px/500 name are the separation.
    <div className="flex flex-col pt-3.5 first:pt-3">
      <motion.div
        className="flex flex-col gap-[5px] pb-1"
        initial={
          isNewEvent && !shouldReduceMotion ? { opacity: 0, y: 8 } : false
        }
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
      >
        <p className="text-[12px] font-medium text-[var(--ink-900)]">
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
        className="flex flex-col"
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
