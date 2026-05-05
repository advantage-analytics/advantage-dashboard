"use client";

import { Fragment } from "react";

import { formatPlayerStyle, formatScoreboardStatus } from "@/lib/data/match-utils";
import type { Match, Player, SetScore } from "@/lib/data/types";
import { cn } from "@/lib/utils";

interface MatchSummaryRowProps {
  match: Match;
  p1Name: string;
  p2Name: string;
}

export function MatchSummaryRow({ match, p1Name, p2Name }: MatchSummaryRowProps) {
  const sets = match.score.sets;
  const winner = match.score.winner;

  const headerLeft = [
    formatScoreboardStatus(match.matchContext),
    match.matchType,
    match.round,
  ]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" · ")
    .toUpperCase();

  const durationLabel = formatDuration(match.duration);

  return (
    <section
      id="match-score"
      aria-label={`Match summary: ${p1Name} vs ${p2Name}`}
      className="surface-card scroll-mt-6 flex flex-col gap-3 overflow-hidden p-[21px]"
    >
      {/* ── Header Rail ─────────────────────────────────────── */}
      <div className="w-full min-h-[15px] border-b border-[var(--color-border-subtle)] pb-3 flex items-center justify-between">
        <p className="text-[10px] font-medium leading-[15px] tracking-[2.5px] text-[var(--color-text-dim)] whitespace-nowrap">
          {headerLeft}
        </p>
        {durationLabel && (
          <p className="text-[10px] font-medium leading-[15px] tracking-[2.5px] text-[var(--color-text-dim)] whitespace-nowrap">
            {durationLabel}
          </p>
        )}
      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      {sets.length === 0 ? (
        <p className="text-[12px] leading-[18px] text-[var(--color-text-dim)]">
          No score recorded.
        </p>
      ) : (
        <div className="w-full flex flex-col gap-1">
          {/* Set numbers */}
          <div
            className="flex justify-end gap-1.5 w-full"
            aria-hidden="true"
          >
            {sets.map((_, i) => (
              <span
                key={i}
                className="flex h-4 w-10 items-center justify-center text-[9px] font-normal tracking-[2.5px] text-[var(--color-text-dim)] tabular-nums"
              >
                {i + 1}
              </span>
            ))}
          </div>

          {/* Player rows */}
          <div className="flex flex-col gap-4 w-full">
            <PlayerRow
              name={p1Name}
              player={match.player1}
              isWinner={winner === "player1"}
              sets={sets}
              mineKey="player1"
              theirsKey="player2"
            />
            <PlayerRow
              name={p2Name}
              player={match.player2}
              isWinner={winner === "player2"}
              sets={sets}
              mineKey="player2"
              theirsKey="player1"
            />
          </div>
        </div>
      )}
    </section>
  );
}

function PlayerRow({
  name,
  player,
  isWinner,
  sets,
  mineKey,
  theirsKey,
}: {
  name: string;
  player: Player;
  isWinner: boolean;
  sets: SetScore[];
  mineKey: "player1" | "player2";
  theirsKey: "player1" | "player2";
}) {
  const meta = formatPlayerStyle(player.hand, player.backhand);

  return (
    <div className="flex items-center justify-between w-full gap-4 min-w-0">
      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-center gap-3">
          <p
            className={cn(
              "truncate text-[14px] leading-[20px] font-medium whitespace-nowrap",
              isWinner
                ? "text-[var(--color-text-primary)]"
                : "text-[var(--color-text-secondary)]",
            )}
          >
            {isWinner && <span className="sr-only">Winner: </span>}
            {name}
          </p>
          {isWinner && (
            <span className="shrink-0 text-[10px] font-medium leading-4 tracking-[2.5px] text-[var(--color-success)] whitespace-nowrap">
              WON
            </span>
          )}
        </div>
        {meta.length > 0 && (
          <div className="flex items-center gap-2 text-[9px] font-normal leading-[13.5px] text-[var(--color-text-dim)]">
            {meta.map((m, i) => (
              <Fragment key={i}>
                {i > 0 && <span aria-hidden="true">·</span>}
                <span className="tracking-[2.5px] whitespace-nowrap">{m}</span>
              </Fragment>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-1.5 shrink-0" role="presentation">
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
              aria-label={`Set ${i + 1}: ${mine}${
                showTiebreak ? ` tiebreak ${theirTiebreak}` : ""
              }`}
              className={cn(
                "flex h-6 w-10 items-baseline justify-center gap-0.5 text-[18px] leading-6 tracking-[-0.3px] tabular-nums",
                setWon
                  ? "font-medium text-[var(--color-text-primary)]"
                  : "font-normal text-[var(--color-text-secondary)]",
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

function formatDuration(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d+):(\d{1,2})$/);
  if (!m) return raw.toUpperCase();
  const hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  if (hours === 0) return `${minutes}M`;
  return `${hours}H ${String(minutes).padStart(2, "0")}M`;
}
