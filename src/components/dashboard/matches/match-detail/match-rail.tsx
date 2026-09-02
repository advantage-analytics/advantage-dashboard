"use client";

import Image from "next/image";
import Link from "next/link";
import { Calendar, Check, Clock, Swords } from "lucide-react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { MatchDataBlock } from "@/components/dashboard/matches/match-detail/match-data-block";
import { RailInsightCard } from "@/components/dashboard/matches/match-detail/rail-insight-card";
import { shortMonthDate, formatClock } from "@/components/dashboard/matches/match-detail/format-clock";
import { ScoreLine } from "@/components/dashboard/score-line";
import { cn } from "@/lib/utils";

/**
 * The 300px match rail (frame 47f): an identity block (names + verified check +
 * 26px score), one fact group, and — pinned to the bottom — the derived-match
 * `MatchDataBlock`, the no-video note strip, and the Advantage Intelligence
 * `RailInsightCard`, in that order. 47f retires the two round-46 pieces the
 * rail used to carry: the standalone AI blurb (the card now holds the summary,
 * on every tab) and the film cross-link card (the Film tab is reached from the
 * tab row).
 *
 * Which side is "you" comes exclusively from `useMatchSides()`
 * (guardrails §4) — nothing here looks at player1/player2 directly.
 */

interface MatchRailProps {
  /** The viewer's insight summary, already picked by side in `page.tsx`. */
  aiSummary: string | null;
  /**
   * The no-video note in the bottom slot. There is no longer a "video present"
   * variant — a match with video shows nothing here (its Film tab is on the tab
   * row), so `page.tsx` passes `"none"` in that case. The two note variants
   * render the same 44a strip shape but must not share copy: a `.xlsx` import
   * genuinely has no video behind it, but an Advantage Intelligence–analyzed
   * match with no `video` only means its trimmed copy is missing or was
   * reclaimed — it was never a SwingVision import, and saying so would misstate
   * where the stats came from.
   * `note-swingvision` = true SwingVision import, no video ever existed ·
   * `note-neutral` = video-analyzed match whose trimmed copy isn't available ·
   * `none` = video exists, or the match is still analysing/failed.
   */
  film: "note-swingvision" | "note-neutral" | "none";
  /**
   * Video-derived match with published statistics — renders `MatchDataBlock`
   * above the note/insight slots. Defaults to `false` so the awaiting-analysis
   * short-circuit (which never mounts a stats section at all) never has to
   * pass it; `page.tsx` threads the real value once stats are on the page.
   */
  isDerived?: boolean;
}

function FactRow({
  icon,
  mono = false,
  children,
}: {
  icon: React.ReactNode;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="grid grid-cols-[16px_1fr] items-center gap-x-2">
      {icon}
      <span
        className={cn("text-micro tabular", mono && "mono")}
        style={{ color: "var(--ink-700)" }}
      >
        {children}
      </span>
    </span>
  );
}

export function MatchRail({ aiSummary, film, isDerived = false }: MatchRailProps) {
  const { match, points } = useMatchData();
  const sides = useMatchSides();

  const games = match.score.sets.reduce(
    (total, set) => total + set.player1 + set.player2,
    0,
  );
  const duration =
    typeof match.durationSec === "number" && match.durationSec > 0
      ? formatClock(match.durationSec, { alwaysShowHours: true })
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 py-[18px]">
      {/* Identity */}
      <div className="flex flex-col gap-3">
        <span className="eyebrow">Match</span>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-medium text-[var(--ink-900)]">
              {sides.you.name}
            </span>
            {match.verificationStatus ? (
              <Check
                className="h-3 w-3 text-[var(--viz-good)]"
                strokeWidth={2}
                aria-label="Verified result"
              />
            ) : null}
            <span className="mx-0.5 text-[12px] text-[var(--ink-500)]">vs</span>
            <span className="text-[13px] text-[var(--ink-600)]">
              {sides.opp.name}
            </span>
          </div>
          <ScoreLine
            sets={sides.sets}
            className="text-score"
            style={{ fontSize: "26px" }}
          />
        </div>
      </div>

      {/* Facts — one group */}
      <div className="flex flex-col gap-2">
        <FactRow
          icon={
            <Calendar
              className="h-[13px] w-[13px] text-[var(--ink-400)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          }
        >
          {shortMonthDate(match.date)}
        </FactRow>
        {match.courtType ? (
          <FactRow
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
          </FactRow>
        ) : null}
        {match.tournamentName ? (
          <FactRow
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
          </FactRow>
        ) : null}
        {duration ? (
          <FactRow
            mono
            icon={
              <Clock
                className="h-[13px] w-[13px] text-[var(--ink-400)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            }
          >
            {duration}
          </FactRow>
        ) : null}
        {points.length > 0 ? (
          <FactRow
            icon={
              <Swords
                className="h-[13px] w-[13px] text-[var(--ink-400)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            }
          >
            {points.length} points · {games} games
          </FactRow>
        ) : null}
      </div>

      {/* Bottom group: the derived-match MatchDataBlock (46c), then the
          no-video note, then the insight card — all pinned to the rail's
          bottom together. Each self-gates, so the wrapper only mounts when at
          least one has something to show. */}
      {isDerived || film !== "none" || Boolean(aiSummary) ? (
        <div className="mt-auto flex flex-col gap-3">
          {isDerived ? <MatchDataBlock /> : null}

          {film === "note-swingvision" || film === "note-neutral" ? (
            <div className="flex flex-col gap-[5px] rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3 py-[11px]">
              <span className="text-[11px] leading-[1.5] text-[var(--ink-700)] [text-wrap:pretty]">
                {film === "note-swingvision"
                  ? "No video on this match — the stats came from the SwingVision export."
                  : "No video available for this match."}
              </span>
              <Link
                href="/dashboard/matches/new"
                className="text-[11px] font-medium text-[var(--blue)]"
              >
                Add video
              </Link>
            </div>
          ) : null}

          <RailInsightCard summary={aiSummary} matchId={match.id} />
        </div>
      ) : null}
    </div>
  );
}
