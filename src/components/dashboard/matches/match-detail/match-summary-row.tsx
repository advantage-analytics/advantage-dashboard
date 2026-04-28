"use client";

import { BadgeCheck, Calendar, Check, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Match, SetScore } from "@/lib/data/types";

interface MatchSummaryRowProps {
  match: Match;
  p1Name: string;
  p2Name: string;
}

export function MatchSummaryRow({ match, p1Name, p2Name }: MatchSummaryRowProps) {
  const sets = match.score.sets;
  const winner = match.score.winner;

  const dateLabel = formatDate(match.date);
  const footerDateLabel = formatFooterDate(match.date);

  const roundType = [match.round, match.matchType].filter(Boolean).join(" | ");
  const eyebrow = (roundType || dateLabel || "Match").toUpperCase();
  // Avoid duplicating the date when the eyebrow falls back to it.
  const showFooterDate = !!roundType && !!footerDateLabel;

  const tournamentTitle = match.tournamentName?.trim() || "Match";
  const verification = parseVerification(match.verificationStatus);

  return (
    <section
      id="match-score"
      aria-label={`Match summary: ${p1Name} vs ${p2Name}`}
      className="surface-card scroll-mt-6 flex flex-col md:flex-row md:items-stretch gap-5 md:gap-6 px-5 py-5"
    >
      {/* ── Left: Match info ───────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3 md:min-h-[92px]">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="w-full truncate text-[9px] font-normal text-[var(--color-text-dim)] uppercase tracking-[2.5px] leading-[13.5px] tabular-nums">
            {eyebrow}
          </p>
          <p className="w-full truncate text-[15px] font-light text-[var(--color-text-primary)] tracking-[-0.6px] leading-[24px]">
            {tournamentTitle}
          </p>
        </div>
        <div className="flex items-center gap-4 mt-auto h-4 text-[10px] leading-4 text-[var(--color-text-muted)] whitespace-nowrap">
          {showFooterDate && (
            <span className="flex items-center gap-1">
              <Calendar
                className="size-3.5 shrink-0"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {footerDateLabel}
            </span>
          )}
          {verification && (
            <span className="flex items-center gap-1" title={verification.label}>
              {verification.verified ? (
                <BadgeCheck
                  className="size-3.5 shrink-0 text-[var(--color-success)]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              ) : (
                <CircleAlert
                  className="size-3.5 shrink-0"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              )}
              {verification.label}
            </span>
          )}
        </div>
      </div>

      {/* ── Divider (vertical desktop, horizontal mobile) ─── */}
      <div
        aria-hidden="true"
        className="shrink-0 self-stretch bg-[var(--color-border-subtle)] h-px md:h-auto md:w-px"
      />

      {/* ── Right: Scoreboard ──────────────────────────────── */}
      <div className="flex-[1.1] min-w-0 flex flex-col justify-between gap-3 md:gap-0 md:min-h-[92px]">
        <ScoreLine
          name={p1Name}
          isWinner={winner === "player1"}
          sets={sets}
          mineKey="player1"
          theirsKey="player2"
        />
        <ScoreLine
          name={p2Name}
          isWinner={winner === "player2"}
          sets={sets}
          mineKey="player2"
          theirsKey="player1"
        />
      </div>
    </section>
  );
}

function ScoreLine({
  name,
  isWinner,
  sets,
  mineKey,
  theirsKey,
}: {
  name: string;
  isWinner: boolean;
  sets: SetScore[];
  mineKey: "player1" | "player2";
  theirsKey: "player1" | "player2";
}) {
  return (
    <div className="flex items-center justify-between gap-4 min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        {isWinner ? (
          <Check
            className="size-3.5 shrink-0 text-[var(--color-success)]"
            strokeWidth={2.5}
            aria-hidden="true"
          />
        ) : (
          <span aria-hidden="true" className="size-3.5 shrink-0" />
        )}
        <p
          className={cn(
            "truncate text-[14px] leading-[20px] whitespace-nowrap",
            isWinner
              ? "font-medium text-[var(--color-text-primary)]"
              : "font-normal text-[var(--color-text-secondary)]",
          )}
        >
          {isWinner && <span className="sr-only">Winner: </span>}
          {name}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0" role="presentation">
        {sets.map((set, i) => {
          const mine = set[mineKey];
          const theirs = set[theirsKey];
          const setWon = mine > theirs;
          const theirTiebreak =
            mineKey === "player1" ? set.player2Tiebreak : set.player1Tiebreak;
          const isTiebreakSet = set.tiebreak && mine === 7 && theirs === 6;
          const showTiebreak = isTiebreakSet && setWon && theirTiebreak != null;
          return (
            <span
              key={i}
              aria-label={`Set ${i + 1}: ${mine}${showTiebreak ? ` tiebreak ${theirTiebreak}` : ""}`}
              className={cn(
                "w-10 text-center text-[16px] leading-[28px] tracking-[-0.3px] tabular-nums inline-flex items-baseline justify-center gap-0.5",
                setWon
                  ? "font-normal text-[var(--color-text-primary)]"
                  : "font-light text-[var(--color-text-dim)]",
              )}
            >
              <span>{mine}</span>
              {showTiebreak && (
                <span
                  aria-hidden="true"
                  className="text-[10px] font-medium text-[var(--color-text-dim)] leading-none relative -top-2.5"
                >
                  {theirTiebreak}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function parseVerification(
  raw: string | undefined,
): { verified: boolean; label: string } | null {
  if (!raw) return null;
  const verified = !/unverified/i.test(raw);
  return { verified, label: raw };
}

function formatDate(date: string | undefined): string | null {
  if (!date) return null;
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    return d
      .toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      .toUpperCase();
  } catch {
    return null;
  }
}

function formatFooterDate(date: string | undefined): string | null {
  if (!date) return null;
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return null;
  }
}
