"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { PeekDrawerFrame } from "@/components/dashboard/matches/match-drawer";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import {
  Sparkline,
  StatPill,
  drawerPercent,
  type SparkPoint,
} from "@/components/dashboard/shared/drawer-stat-chart";
import { RECENT_MATCH_GRID } from "@/components/dashboard/team/player-drawer-layout";
import { EmptyMark } from "@/components/ui/empty-mark";
import { formatDelta, getInitials } from "@/lib/data/match-utils";
import type {
  PersonalOpponent,
  PersonalOpponentMeasureKey,
} from "@/lib/data/personal-opponents";
import { PERSONAL_NAV } from "@/lib/dashboard/nav";
import { advButton } from "@/lib/ui/adv-button";
import { formatMatchDayShortYear } from "@/lib/data/match-day";
import { playedSets } from "@/lib/ui/score-format";
import { cn } from "@/lib/utils";
import {
  RECENT_ROWS,
  askAboutOpponentHref,
  opponentDrawerFooter,
  opponentFirstName,
  opponentMatchesHref,
  rowDate,
} from "./opponent-drawer-shared";
import { opponentBackhandLabel, opponentHandLabel } from "./opponent-style";

/**
 * The personal Opponents page's 340px peek drawer — one opponent, read from
 * the viewer's side of the net.
 *
 * The shell is `PeekDrawerFrame`, the rail Matches, Roster and Schedule share:
 * ↑ ↓ stepping, "Opponent n / N", a divider and the close. There is no ⋯ — an
 * opponent has nothing to edit or remove — so the header holds navigation,
 * position and dismissal only (`reference/tables.md` → Peek Drawer).
 *
 * Body, top to bottom: identity → the stat block (a one-line header, the
 * sparkline over the measured recent matches, four pills that switch it) →
 * three recent matches as record rows that open their report → the pinned
 * footer. The chart and the pills are the roster drawer's own
 * (`shared/drawer-stat-chart.tsx`), gated the same way: with no measured
 * figure they are absent, not empty, and one sentence under Recent matches
 * says what will arrive.
 *
 * Nothing in the drawer leads to a coming-soon page. Statistics and Ask are
 * both stubs today, so while the nav still flags them the name and the primary
 * button open the Matches list searched for this opponent, and the Ask button
 * is absent. Each returns on its own the day its nav flag is lifted
 * (`opponentDrawerFooter` reads `PERSONAL_NAV` through the `isLive` it shares
 * with the team drawer — `opponent-drawer-shared.ts`).
 */
export function OpponentDrawer({
  opponent,
  index,
  total,
  closing,
  autoFocus,
  onPrev,
  onNext,
  onClose,
  onClosed,
}: {
  opponent: PersonalOpponent;
  /** Zero-based position in the chipped, filtered and sorted order ↑/↓ walk. */
  index: number;
  total: number;
  /** Playing the slide-out; `onClosed` fires when it finishes. */
  closing: boolean;
  /** Opened from the keyboard — take focus so `Tab` continues inside. */
  autoFocus: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onClosed: () => void;
}) {
  // Which of the four the chart shows. Held here rather than per opponent so
  // stepping ↑↓ through the list compares opponents on the same figure.
  const [activeKey, setActiveKey] = useState<PersonalOpponentMeasureKey>(
    opponent.measures[0].key,
  );
  const active =
    opponent.measures.find((m) => m.key === activeKey) ?? opponent.measures[0];

  // Is there a figure to show at all? Not "has matches" — an opponent whose
  // only meeting is still in analysis has a recent row and no numbers, which
  // is the same nothing to chart (`player-drawer.tsx` → `hasStats`).
  const hasStats = opponent.measures.some((measure) => measure.value !== null);

  // Oldest first — a rivalry reads left to right — and only the meetings that
  // measured this figure; a video still in analysis is a gap, not a zero.
  const points: SparkPoint[] = opponent.recent
    .slice()
    .reverse()
    .flatMap((match) => {
      const value = match.values[active.key];
      return value === null || value === undefined
        ? []
        : [
            {
              value,
              match: {
                id: match.id,
                opponent: opponent.name,
                date: match.date
                  ? formatMatchDayShortYear(match.date)
                  : "No date",
              },
            },
          ];
    });
  const heroDelta = active.trend !== null ? formatDelta(active.trend) : null;

  const hand = opponentHandLabel(opponent.hand);
  const backhand = opponentBackhandLabel(opponent.backhand);
  // What the footer buttons and the placeholder call them.
  const firstName = opponentFirstName(opponent.name);
  // The Matches list filtered to this opponent by its own search box, so the
  // count in "All N" is the count on the page it opens.
  const allMatchesHref = opponentMatchesHref(opponent.name);
  const footer = opponentDrawerFooter({
    nav: PERSONAL_NAV,
    statisticsHref: "/dashboard/statistics",
    askHref: "/dashboard/ask",
    name: opponent.name,
  });
  const primaryHref = footer.primary.href;

  return (
    <PeekDrawerFrame
      kind="Opponent"
      label={opponent.name}
      index={index}
      total={total}
      canPrev={index > 0}
      canNext={index < total - 1}
      closing={closing}
      autoFocus={autoFocus}
      focusKey={opponent.key}
      onPrev={onPrev}
      onNext={onNext}
      onClose={onClose}
      onClosed={onClosed}
      footer={
        <>
          {footer.ghost && (
            <Link
              // Into Ask with this opponent already tagged.
              href={askAboutOpponentHref(footer.ghost.href, opponent.name)}
              className={cn(advButton("ghost", "md"), "w-full")}
            >
              {footer.ghost.label}
            </Link>
          )}
          <Link
            href={primaryHref}
            className={cn(advButton("primary", "md"), "w-full")}
          >
            {footer.primary.label}
          </Link>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-[22px] pt-6 pb-[22px]">
        {/* Identity. `items-start`, not `items-center`: the avatar stays level
            with the first line of a name that runs to two. */}
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden
            className="mt-0.5 flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[14px] font-medium text-[var(--ink-700)]"
          >
            {getInitials(opponent.name)}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            {/* Ink at rest, blue on hover, and it WRAPS — a name in its own
                drawer never truncates (Peek Drawer). */}
            <h2 className="text-title-lg min-w-0">
              <Link
                href={primaryHref}
                className="block rounded-[var(--radius-cell)] [text-wrap:balance] text-[var(--ink-900)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              >
                {opponent.name}
              </Link>
            </h2>
            {/* "Right-handed · Two-handed backhand" — a fact nobody recorded
                is the one dash, never a guess. */}
            <span className="text-[12px] text-[var(--ink-600)]">
              {hand ?? <EmptyMark label="Hand not recorded" />}
              {" · "}
              {backhand ? (
                `${backhand} backhand`
              ) : (
                <EmptyMark label="Backhand not recorded" />
              )}
            </span>
            {/* The viewer's wins, then losses — the table's Record figure. */}
            <span className="tabular text-[12px] text-[var(--ink-600)]">
              <span aria-hidden>
                {opponent.wins}-{opponent.losses} against you
              </span>
              <span className="sr-only">
                You won {opponent.wins} and lost {opponent.losses}
              </span>
              {" · "}
              {opponent.analyzed} of {opponent.played} analyzed
            </span>
          </div>
        </div>

        {/* One-line stat header, the sparkline, and the four pills that switch
            it — only where a figure exists. */}
        {hasStats && (
          <div className="flex flex-col gap-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] text-[var(--ink-600)]">
                {active.label}
              </span>
              <span className="inline-flex items-baseline gap-1.5">
                <span className="tabular text-[16px] text-[var(--ink-900)]">
                  {drawerPercent(active.value)}
                </span>
                {heroDelta && (
                  <span
                    className="tabular text-[11px] font-medium"
                    style={{ color: heroDelta.color }}
                  >
                    {heroDelta.label}
                  </span>
                )}
              </span>
            </div>
            <Sparkline label={active.label} points={points} />
            <div className="flex justify-between">
              <span className="mono text-[10px] text-[var(--ink-400)]">
                {points[0]?.match.date ?? ""}
              </span>
              <span className="mono text-[10px] text-[var(--ink-400)]">
                {points.length > 1 ? points[points.length - 1].match.date : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 border-t border-[var(--border-hairline)] pt-4">
              {opponent.measures.map((measure) => (
                <StatPill
                  key={measure.key}
                  measure={{ ...measure, pill: measure.label }}
                  selected={measure.key === active.key}
                  onSelect={() => setActiveKey(measure.key)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Three recent matches — record rows, chevron, open the match page. */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center pb-2">
            <span className="eyebrow-sm flex-1">Recent matches</span>
            {/* "All 0" is a link to nothing. */}
            {opponent.played > 0 && (
              <Link
                href={allMatchesHref}
                className="rounded-sm text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              >
                All {opponent.played}
              </Link>
            )}
          </div>
          {opponent.recent.slice(0, RECENT_ROWS).map((match) => {
            const sets = playedSets(match.sets);
            return (
              <Link
                key={match.id}
                href={`/dashboard/matches/${match.id}`}
                className={cn(
                  "-mx-2 grid h-9 items-center gap-2.5 rounded-[var(--radius-element)] px-2 transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                  RECENT_MATCH_GRID,
                )}
              >
                {match.won === null ? (
                  <span className="inline-flex">
                    <EmptyMark label="No result yet" />
                  </span>
                ) : (
                  <ResultMark won={match.won} />
                )}
                <span className="truncate text-[12px] text-[var(--ink-900)]">
                  {match.event ?? "Match"}
                </span>
                {sets.length > 0 ? (
                  <ScoreLine
                    sets={sets}
                    className="text-right text-[11px] whitespace-nowrap text-[var(--ink-600)]"
                  />
                ) : (
                  <span className="text-right">
                    <EmptyMark label="No score" />
                  </span>
                )}
                <span className="mono text-right text-[10px] whitespace-nowrap text-[var(--ink-400)]">
                  {match.date ? (
                    rowDate(match.date)
                  ) : (
                    <EmptyMark label="No date" />
                  )}
                </span>
                <ChevronRight
                  className="size-3 text-[var(--ink-300)]"
                  strokeWidth={1.5}
                  aria-hidden
                />
              </Link>
            );
          })}
          {/* The labels the pills would have carried, in a sentence, since the
              pills are gone. */}
          {!hasStats && (
            <p className="pt-2 text-[12px] leading-[1.6] text-[var(--ink-500)]">
              Your numbers against {firstName} appear here once a match against
              them is analyzed.
            </p>
          )}
        </div>
      </div>
    </PeekDrawerFrame>
  );
}
