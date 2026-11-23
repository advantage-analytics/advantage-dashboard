"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Calendar, ChevronLeft, ChevronRight, Swords } from "lucide-react";
import type { HomeHighlight } from "@/lib/data/home-feed-server";
import { formatMatchDayShortYear } from "@/lib/data/match-day";
import { VERIFIED_BY_ADVANTAGE } from "@/lib/data/match-verification";
import { isPracticeMatch } from "@/lib/matches/match-type";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { InsightMark } from "@/components/dashboard/matches/match-detail/insight-mark";
import { VerifiedMark } from "@/components/dashboard/matches/verified-mark";
import { HEAD_LINK, SectionHead } from "./home-title";
import { MatchFrame } from "./match-frame";

/** Figures in a summary read in ink-900, as on the match report. */
const FIGURE = /(\d+(?:\.\d+)?%|\b\d+ of \d+\b)/g;

const STEP =
  "grid size-6 place-items-center rounded-[var(--radius-button)] text-[var(--ink-700)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-default disabled:text-[var(--ink-300)] disabled:hover:bg-transparent";

/**
 * The newest analyzed match, as the page's lead: a still from its video, who
 * played and how it went, and the report's own summary. A match row is a
 * record row, so the whole card opens the report. With more than one analyzed
 * match the heading's stepper walks back through the latest few.
 */
export function JustAnalyzed({ highlights }: { highlights: HomeHighlight[] }) {
  const [index, setIndex] = useState(0);
  const current = highlights[Math.min(index, highlights.length - 1)];
  if (!current) return null;
  const { match, summary } = current;
  const href = `/dashboard/matches/${match.id}`;
  const practice = isPracticeMatch(match.matchType);
  const won = match.score.winner === "player1";
  const names = `${match.player1.name} vs ${match.player2.name}`;

  return (
    <section aria-label="Just analyzed" className="flex flex-col gap-2.5">
      <SectionHead title="Just analyzed">
        {highlights.length > 1 ? (
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Newer match"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              className={STEP}
            >
              <ChevronLeft aria-hidden strokeWidth={1.5} className="size-3.5" />
            </button>
            <span className="tabular text-[11px] whitespace-nowrap text-[var(--ink-600)]">
              {index + 1} of {highlights.length}
            </span>
            <button
              type="button"
              aria-label="Older match"
              disabled={index >= highlights.length - 1}
              onClick={() =>
                setIndex((i) => Math.min(highlights.length - 1, i + 1))
              }
              className={STEP}
            >
              <ChevronRight
                aria-hidden
                strokeWidth={1.5}
                className="size-3.5"
              />
            </button>
          </span>
        ) : null}
        <Link href={href} className={HEAD_LINK}>
          Open report
        </Link>
      </SectionHead>

      <Link
        href={href}
        aria-label={`Open the report for ${names}`}
        className="surface-card flex gap-0 p-2 transition-shadow duration-[var(--duration-hover)] hover:shadow-[var(--shadow-card-emphasis)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
      >
        <MatchFrame
          key={match.id}
          matchId={match.id}
          alt={`Frame from ${names}`}
        />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 py-1 pr-4 pl-5">
          <div className="flex items-center justify-between gap-4">
            <span className="min-w-0 truncate text-[14px] leading-5 text-[var(--ink-700)]">
              <b className="font-medium text-[var(--ink-900)]">
                {match.player1.name}
              </b>
              <span className="mx-1.5 text-[var(--ink-500)]">
                {practice ? "vs" : won ? "def." : "lost to"}
              </span>
              {match.player2.name}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {practice ? null : <ResultMark won={won} />}
              <ScoreLine
                sets={match.score.sets}
                className="text-[13px] whitespace-nowrap text-[var(--ink-900)]"
              />
            </span>
          </div>

          <div className="flex items-center gap-4 text-[12px] text-[var(--ink-600)]">
            <span className="flex items-center gap-1.5">
              <Calendar
                aria-hidden
                strokeWidth={1.5}
                className="size-[13px] text-[var(--ink-400)]"
              />
              <span className="tabular text-[var(--ink-700)]">
                {formatMatchDayShortYear(match.date)}
              </span>
            </span>
            {match.tournamentName ? (
              <span className="flex min-w-0 items-center gap-1.5">
                {match.matchType === "Tournament" ? (
                  <Image
                    src="/icons/tournament-icon.svg"
                    alt=""
                    width={13}
                    height={13}
                    className="opacity-60"
                  />
                ) : match.matchType === "Dual Match" ? (
                  <Swords
                    aria-hidden
                    strokeWidth={1.5}
                    className="size-[13px] text-[var(--ink-400)]"
                  />
                ) : null}
                <span className="min-w-0 truncate">{match.tournamentName}</span>
                {match.round ? (
                  <span className="shrink-0 text-[var(--ink-500)]">
                    · {match.round}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>

          {summary ? (
            <p className="mt-0.5 max-w-[96ch] text-[12px] leading-[1.6] text-[var(--ink-700)]">
              {summary.split(FIGURE).map((part, i) =>
                i % 2 === 1 ? (
                  <span key={i} className="text-[var(--ink-900)]">
                    {part}
                  </span>
                ) : (
                  part
                ),
              )}
            </p>
          ) : null}

          {/* The footer names what wrote the summary and who checked the
              match; a match with neither (an import with no summary) has no
              footer to draw. */}
          {summary || match.verification ? (
            <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-[var(--border-hairline)] pt-3 text-[11px] text-[var(--ink-600)]">
              {summary ? (
                <span className="flex items-center gap-2">
                  <InsightMark />
                  Advantage Intelligence
                </span>
              ) : (
                <span />
              )}
              {match.verification ? (
                <span className="flex items-center gap-2 text-[var(--ink-700)]">
                  <VerifiedMark />
                  {VERIFIED_BY_ADVANTAGE}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </Link>
    </section>
  );
}
