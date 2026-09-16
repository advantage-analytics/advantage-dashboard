"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { Calendar, CircleCheck, Swords } from "lucide-react";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { shortMonthDate } from "@/components/dashboard/matches/match-detail/format-clock";
import { cn } from "@/lib/utils";

/** 13px lucide glyph at stroke 1.5 in ink-700 — the frame's fact icon. */
const FACT_ICON = "size-[13px] shrink-0 text-[var(--ink-700)]";

/**
 * The facts line under the title (design 04 F1/F4/F5/F6): what was played,
 * when, where, on what, and whether the result is verified — one line, never
 * wrapping.
 *
 * Each fact draws only when the match carries it, so a sparse match gets a
 * shorter line rather than an icon beside nothing. Two of the frame's facts
 * are left out on purpose (spec › Decisions 7): "Away" (`MapPin`), because
 * `Match` has no home/away field, and the `GraduationCap` "vs Ridgeline
 * University", an opponent school `Match` does not carry — the tournament
 * name takes that slot with the tournament icon.
 *
 * The games count is the sum of both players' games, so it reads
 * `match.score.sets` directly: a total has no side to get wrong
 * (guardrails §4 governs who a figure belongs to, not a sum of both).
 */
export function MatchReportFacts() {
  const { match, points } = useMatchData();

  const games = match.score.sets.reduce(
    (total, set) => total + set.player1 + set.player2,
    0,
  );

  return (
    <div className="mt-[9px] flex h-[18px] flex-nowrap items-center gap-3.5">
      {points.length > 0 ? (
        <Fact
          tabular
          icon={
            <Swords
              className={FACT_ICON}
              strokeWidth={1.5}
              aria-hidden="true"
            />
          }
        >
          {points.length} points · {games} games
        </Fact>
      ) : null}

      {match.date ? (
        <Fact
          tabular
          icon={
            <Calendar
              className={FACT_ICON}
              strokeWidth={1.5}
              aria-hidden="true"
            />
          }
        >
          {shortMonthDate(match.date)}
        </Fact>
      ) : null}

      {/* The two asset icons carry their own stroke colour; an <img> cannot
          take `currentColor`, so they draw as `match-rail.tsx` drew them. */}
      {match.tournamentName ? (
        <Fact
          icon={
            <Image
              src="/icons/tournament-icon.svg"
              width={13}
              height={13}
              alt=""
              aria-hidden="true"
            />
          }
        >
          {match.tournamentName}
        </Fact>
      ) : null}

      {match.courtType ? (
        <Fact
          icon={
            <Image
              src="/icons/tennis-court-icon.svg"
              width={13}
              height={13}
              alt=""
              aria-hidden="true"
            />
          }
        >
          {match.courtType}
        </Fact>
      ) : null}

      {match.verificationStatus ? (
        <Fact
          icon={
            <CircleCheck
              className={FACT_ICON}
              strokeWidth={1.5}
              aria-hidden="true"
            />
          }
        >
          Verified result
        </Fact>
      ) : null}
    </div>
  );
}

function Fact({
  icon,
  tabular = false,
  children,
}: {
  icon: ReactNode;
  /** Figures that should line up — counts and dates. */
  tabular?: boolean;
  children: ReactNode;
}) {
  return (
    // `shrink-0` is the frame's `flex:0 0 auto`: a fact never squeezes, the
    // line runs on instead.
    <span className="inline-flex shrink-0 items-center gap-1.5">
      {icon}
      {/* `.text-micro` is an unlayered DS class that paints ink-500, and
          unlayered CSS beats a Tailwind colour utility — so ink-700 goes
          inline. */}
      <span
        className={cn("text-micro whitespace-nowrap", tabular && "tabular")}
        style={{ color: "var(--ink-700)" }}
      >
        {children}
      </span>
    </span>
  );
}
