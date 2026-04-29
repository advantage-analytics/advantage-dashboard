"use client";

/**
 * ConfirmContent — Step 4 of 4 (peak-end summary)
 */

import { Clock, FileSpreadsheet } from "lucide-react";
import { MatchMetadataRow } from "@/components/dashboard/matches/match-metadata-row";
import { FormData, UploadedFile } from "./types";
import { getAdjustedScores, formatDuration } from "./utils";

export interface ConfirmContentProps {
  formData: FormData;
  uploadedFile: UploadedFile | null;
  isPrivateMatch: boolean;
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
              className={`w-10 inline-flex items-baseline justify-center gap-0.5 ${
                won ? "font-medium text-[#0D0D0D]" : "font-normal text-[#525252]"
              }`}
            >
              <span>{ps}</span>
              {showTb && (
                <span
                  aria-hidden="true"
                  className="text-[10px] font-medium leading-none relative -top-2 text-[#AAAAAA]"
                >
                  {tb}
                </span>
              )}
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
      {/* Hero — event title + metadata */}
      <div className="flex flex-col gap-2.5">
        <h3 className="text-[22px] font-light tracking-[-0.5px] leading-[26px] text-[#0D0D0D]">
          {eventTitle}
        </h3>
        <MatchMetadataRow
          date={formatDate(formData.date)}
          matchType={matchType}
          courtType={courtType}
        />
      </div>

      {/* Scoreboard */}
      <div className="flex flex-col mt-8">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <p className={labelCls}>
            {getMatchStatus(formData.result)}
            {round ? ` · ${round}` : ""}
          </p>
        </div>

        <div className="h-px bg-[#F3F3F3] mt-2" />

        {/* Player rows */}
        <div className="flex flex-col gap-3 mt-4">
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
      </div>

      {/* Match details — duration + format in a single quiet strip */}
      {(() => {
        const items: React.ReactNode[] = [];
        if (formData.duration) {
          items.push(
            <span key="duration" className="inline-flex items-center gap-1.5 tabular-nums">
              <Clock
                className="size-[13px] text-[#AAAAAA]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {formatDuration(formData.duration)}
            </span>
          );
        }
        if (formData.bestOf) {
          items.push(<span key="bestOf">Best of {formData.bestOf}</span>);
        }
        if (formData.adScoring !== undefined) {
          items.push(
            <span key="ad">{formData.adScoring ? "Ad scoring" : "No-ad scoring"}</span>
          );
        }
        if (formData.playOnLets !== undefined) {
          items.push(
            <span key="lets">{formData.playOnLets ? "Play on lets" : "Stop on lets"}</span>
          );
        }
        if (items.length === 0) return null;
        return (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-normal text-[#525252] leading-[16px] mt-6">
            {items.map((node, i) => (
              <span key={i} className="inline-flex items-center gap-x-3">
                {i > 0 && (
                  <span className="text-[#E5E5E5]" aria-hidden="true">·</span>
                )}
                {node}
              </span>
            ))}
          </div>
        );
      })()}

      {/* Source file */}
      {uploadedFile && (
        <div className="flex items-center gap-3 pt-5 mt-7 border-t border-[#F3F3F3]">
          <div className="size-8 rounded-[10px] bg-[#F3F3F3] flex items-center justify-center shrink-0">
            <FileSpreadsheet className="size-4 text-[#525252]" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1 flex flex-col gap-0.5">
            <p className={labelCls}>Source file</p>
            <p className="text-[12px] leading-[18px] text-[#525252] truncate tabular-nums">
              {uploadedFile.name}
              <span className="text-[#CCCCCC] mx-1.5">·</span>
              {uploadedFile.size}
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-[rgba(229,24,55,0.06)] border border-[rgba(229,24,55,0.15)] rounded-[10px] p-3 mt-5">
          <p className="text-[12px] leading-[18px] text-[#E51837]">{error}</p>
        </div>
      )}
    </div>
  );
}
