"use client";

/**
 * ConfirmContent — Step 4 of 4 (peak-end summary)
 */

import { AlertCircle, FileSpreadsheet } from "lucide-react";
import { MatchMetadataRow } from "@/components/dashboard/matches/match-metadata-row";
import { FormData, UploadedFile } from "./types";
import { getAdjustedScores, formatDuration } from "./utils";

export interface ConfirmContentProps {
  formData: FormData;
  uploadedFile: UploadedFile | null;
  error: string | null;
}

function formatDate(dateString: string): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function determineWinner(
  playerScores: (number | null)[],
  opponentScores: (number | null)[]
): "player" | "opponent" | null {
  let p = 0;
  let o = 0;
  for (let i = 0; i < playerScores.length; i++) {
    const ps = playerScores[i] ?? 0;
    const os = opponentScores[i] ?? 0;
    if (ps > os) p++;
    else if (os > ps) o++;
  }
  if (p > o) return "player";
  if (o > p) return "opponent";
  return null;
}

function getMatchStatus(result: string | undefined): string {
  if (!result) return "Final score";
  if (result === "Unfinished") return "Unfinished";
  if (result.includes("Withdrew")) return "Withdrew";
  if (result.includes("Defaulted")) return "Defaulted";
  return "Final score";
}

function clean(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.trim().toLowerCase() === "none" ? undefined : value;
}

function PlayerRow({
  name,
  style,
  isWinner,
  mineScores,
  theirScores,
  theirTiebreaks,
}: {
  name: string;
  style: string[];
  isWinner: boolean;
  mineScores: (number | null)[];
  theirScores: (number | null)[];
  theirTiebreaks: (number | null)[];
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <p
            className={`text-[14px] leading-[20px] truncate ${
              isWinner ? "font-medium text-[#0D0D0D]" : "font-normal text-[#525252]"
            }`}
          >
            {name}
          </p>
          {isWinner && (
            <span className="text-[10px] leading-[16px] font-medium text-[#5DB955] uppercase tracking-[2.5px]">
              Won
            </span>
          )}
        </div>
        {style.length > 0 && (
          <div className="flex items-start gap-2 text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2.5px] leading-[13.5px] overflow-hidden whitespace-nowrap">
            {style.map((meta, i) => (
              <span key={i} className="shrink-0">
                {i > 0 && <span className="mr-2">·</span>}
                {meta}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-1.5 text-[18px] leading-[24px] tabular-nums tracking-[-0.3px] shrink-0">
        {mineScores.map((score, idx) => {
          const ps = score ?? 0;
          const os = theirScores[idx] ?? 0;
          const won = ps > os;
          const isTbSet = ps === 7 && os === 6;
          const tb = theirTiebreaks[idx];
          const showTb = isTbSet && won && tb != null;
          return (
            <span
              key={idx}
              className={`w-10 inline-flex items-baseline justify-center ${
                won ? "font-medium text-[#0D0D0D]" : "font-normal text-[#525252]"
              }`}
            >
              <span className="relative">
                {ps}
                {showTb && (
                  <span
                    aria-hidden="true"
                    className="absolute left-full top-0 ml-0.5 text-[10px] font-medium leading-none text-[#AAAAAA] -translate-y-1.5"
                  >
                    {tb}
                  </span>
                )}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function formatPlayerStyle(
  hand: "right" | "left" | undefined,
  backhand: "one-handed" | "two-handed" | undefined
): string[] {
  const parts: string[] = [];
  if (hand) parts.push(hand === "right" ? "RIGHT HANDED" : "LEFT HANDED");
  if (backhand) {
    parts.push(
      backhand === "one-handed" ? "1-HANDED BACKHAND" : "2-HANDED BACKHAND"
    );
  }
  return parts;
}

const labelCls =
  "text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]";

export function ConfirmContent({
  formData,
  uploadedFile,
  error,
}: ConfirmContentProps) {
  const playerScores = getAdjustedScores(
    formData.playerScores,
    formData.bestOf,
    formData.numberOfSets
  );
  const opponentScores = getAdjustedScores(
    formData.opponentScores,
    formData.bestOf,
    formData.numberOfSets
  );
  const playerTiebreaks = getAdjustedScores(
    formData.playerTiebreaks,
    formData.bestOf,
    formData.numberOfSets
  );
  const opponentTiebreaks = getAdjustedScores(
    formData.opponentTiebreaks,
    formData.bestOf,
    formData.numberOfSets
  );

  const playerName = formData.playerName || "Player";
  const opponentName = formData.opponentName || "Opponent";
  const winner = determineWinner(playerScores, opponentScores);
  const playerStyle = formatPlayerStyle(
    formData.playerHand,
    formData.playerBackhand
  );
  const opponentStyle = formatPlayerStyle(
    formData.opponentHand,
    formData.opponentBackhand
  );
  const eventTitle =
    clean(formData.eventName?.trim()) || `${playerName} vs ${opponentName}`;
  const round = clean(formData.round);
  const matchType = clean(formData.matchType);
  const courtType = clean(formData.courtType);

  return (
    <div className="flex flex-col">
      {/* Error — pinned to the top so it's visible after a failed save even if the modal scrolled.
          Leads with the reason, ends with the recovery path. */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 bg-[rgba(229,24,55,0.06)] border border-[rgba(229,24,55,0.15)] rounded-[10px] p-3 mb-6"
        >
          <AlertCircle
            className="size-4 text-[#E51837] mt-px flex-shrink-0"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-[12px] leading-[18px] font-medium text-[#E51837]">
              We couldn&apos;t save this match
            </p>
            <p className="text-[12px] leading-[18px] text-[#E51837]/80 break-words">
              {error}
            </p>
            <p className="text-[12px] leading-[18px] text-[#E51837]/70">
              Review the details below, then try Save again.
            </p>
          </div>
        </div>
      )}

      {/* Hero — event title + metadata. Skip the meta row entirely when there's
          nothing to render so it doesn't claim its gap slot below the title. */}
      {(() => {
        const formattedDate = formatDate(formData.date);
        const hasMeta = !!(formattedDate || matchType || courtType);
        return (
          <div className={`flex flex-col ${hasMeta ? "gap-2.5" : ""}`}>
            <h3 className="text-[22px] font-normal tracking-[-0.5px] leading-[26px] text-[#0D0D0D]">
              {eventTitle}
            </h3>
            {hasMeta && (
              <MatchMetadataRow
                date={formattedDate}
                matchType={matchType}
                courtType={courtType}
                showVerification={false}
              />
            )}
          </div>
        );
      })()}

      {/* Scoreboard */}
      <div className="flex flex-col mt-8">
        {/* Header row */}
        <div className="flex items-center justify-between gap-3">
          <p className={labelCls}>
            {getMatchStatus(formData.result)}
            {round ? ` · ${round}` : ""}
          </p>
          {(formData.duration ?? 0) > 0 && (
            <span className={`${labelCls} tabular-nums`}>
              {formatDuration(formData.duration)}
            </span>
          )}
        </div>

        <div className="h-px bg-[#F3F3F3] mt-3" />

        {/* Set headers — column labels aligned with the score cells below */}
        <div className="flex justify-end mt-4">
          <div className="flex gap-1.5">
            {playerScores.map((_, i) => (
              <div
                key={i}
                className="w-10 text-center text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2.5px] tabular-nums"
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Player rows */}
        <div className="flex flex-col gap-4 mt-3">
          {/* Player 1 */}
          <PlayerRow
            name={playerName}
            style={playerStyle}
            isWinner={winner === "player"}
            mineScores={playerScores}
            theirScores={opponentScores}
            theirTiebreaks={opponentTiebreaks}
          />

          {/* Player 2 */}
          <PlayerRow
            name={opponentName}
            style={opponentStyle}
            isWinner={winner === "opponent"}
            mineScores={opponentScores}
            theirScores={playerScores}
            theirTiebreaks={playerTiebreaks}
          />
        </div>

        <div className="h-px bg-[#F3F3F3] mt-4" />
      </div>

      {/* Match format — quiet 3-column definition grid.
          Defaulted values render lighter so users can tell what they chose vs what's implied. */}
      {(() => {
        type Item = { label: string; value: string; defaulted: boolean };
        const items: Item[] = [
          {
            label: "Format",
            value: `Best of ${formData.bestOf || 3} sets`,
            defaulted: !formData.bestOf,
          },
          {
            label: "Scoring",
            value: formData.adScoring === false ? "No-ad" : "Ad",
            defaulted: formData.adScoring === undefined,
          },
          {
            label: "Lets",
            value: formData.playOnLets ? "Play on" : "Stop on",
            defaulted: formData.playOnLets === undefined,
          },
        ];
        return (
          <dl className="grid grid-cols-3 gap-x-6 mt-8">
            {items.map((item) => (
              <div key={item.label} className="flex flex-col gap-2">
                <dt className={labelCls}>{item.label}</dt>
                <dd
                  className={`text-[13px] leading-[18px] font-normal tracking-[-0.1px] ${
                    item.defaulted ? "text-[#AAAAAA]" : "text-[#0D0D0D]"
                  }`}
                >
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        );
      })()}

      {/* Source file */}
      {uploadedFile && (
        <div className="flex flex-col gap-2 mt-8">
          <p className={labelCls}>Source file</p>
          <div className="flex items-center gap-2 min-w-0">
            <FileSpreadsheet
              className="size-3.5 text-[#AAAAAA] shrink-0"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <p className="text-[13px] leading-[18px] text-[#525252] truncate">
              {uploadedFile.name}
              <span className="text-[#CCCCCC] mx-1.5">·</span>
              <span className="tabular-nums">{uploadedFile.size}</span>
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
