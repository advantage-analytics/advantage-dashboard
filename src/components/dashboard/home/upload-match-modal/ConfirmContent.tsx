"use client";

/**
 * ConfirmContent — Step 4 of 4 (peak-end summary)
 */

import { FileSpreadsheet } from "lucide-react";
import { MatchMetadataRow } from "@/components/dashboard/matches/match-metadata-row";
import { FormData, UploadedFile } from "./types";
import { getAdjustedScores, formatDuration } from "./utils";

export interface ConfirmContentProps {
  formData: FormData;
  uploadedFile: UploadedFile | null;
  isPrivateMatch: boolean;
  error: string | null;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
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

  const playerName = formData.playerName || "Player";
  const opponentName = formData.opponentName || "Opponent";
  const winner = determineWinner(playerScores, opponentScores);
  const eventTitle =
    formData.eventName?.trim() || `${playerName} vs ${opponentName}`;

  return (
    <div className="flex flex-col gap-7">
      {/* Hero — event title + metadata */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[22px] font-light tracking-[-0.5px] leading-[26px] text-[#0D0D0D]">
          {eventTitle}
        </h3>
        <MatchMetadataRow
          date={formatDate(formData.date)}
          matchType={formData.matchType}
          courtType={formData.courtType}
        />
      </div>

      {/* Scoreboard */}
      <div className="flex flex-col gap-4">
        {/* Header row: status + duration */}
        <div className="flex items-center justify-between">
          <p className={labelCls}>
            {getMatchStatus(formData.result)}
            {formData.round ? ` · ${formData.round}` : ""}
          </p>
          {formData.duration ? (
            <span className="text-[10px] font-medium text-[#525252] tabular-nums">
              {formatDuration(formData.duration)}
            </span>
          ) : null}
        </div>

        <div className="h-px bg-[#F3F3F3]" />

        {/* Player rows */}
        <div className="flex flex-col gap-2.5">
          {/* Player 1 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-10 rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0">
                <span className="text-[12px] font-medium text-[#525252]">
                  {getInitials(playerName)}
                </span>
              </div>
              <p
                className={`text-[14px] font-medium truncate ${
                  winner === "player" ? "text-[#0D0D0D]" : "text-[#AAAAAA]"
                }`}
              >
                {playerName}
              </p>
              {winner === "player" && (
                <span className="text-[10px] font-medium text-[#5DB955] uppercase tracking-[1.5px]">
                  Won
                </span>
              )}
            </div>
            <div className="flex gap-4 font-medium text-[18px] tabular-nums tracking-[-0.3px]">
              {playerScores.map((score, idx) => {
                const ps = score ?? 0;
                const os = opponentScores[idx] ?? 0;
                return (
                  <p
                    key={idx}
                    className={ps > os ? "text-[#0D0D0D]" : "text-[#CCCCCC]"}
                  >
                    {ps}
                  </p>
                );
              })}
            </div>
          </div>

          {/* Player 2 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-10 rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0">
                <span className="text-[12px] font-medium text-[#525252]">
                  {getInitials(opponentName)}
                </span>
              </div>
              <p
                className={`text-[14px] font-medium truncate ${
                  winner === "opponent" ? "text-[#0D0D0D]" : "text-[#AAAAAA]"
                }`}
              >
                {opponentName}
              </p>
              {winner === "opponent" && (
                <span className="text-[10px] font-medium text-[#5DB955] uppercase tracking-[1.5px]">
                  Won
                </span>
              )}
            </div>
            <div className="flex gap-4 font-medium text-[18px] tabular-nums tracking-[-0.3px]">
              {opponentScores.map((score, idx) => {
                const os = score ?? 0;
                const ps = playerScores[idx] ?? 0;
                return (
                  <p
                    key={idx}
                    className={os > ps ? "text-[#0D0D0D]" : "text-[#CCCCCC]"}
                  >
                    {os}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Format details — each label/value paired so screen readers read in order */}
      <dl className="grid grid-cols-3 gap-x-4">
        <div className="flex flex-col gap-1">
          <dt className={labelCls}>Format</dt>
          <dd className="text-[13px] font-normal text-[#0D0D0D]">
            Best of {formData.bestOf || "3"}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className={labelCls}>Scoring</dt>
          <dd className="text-[13px] font-normal text-[#0D0D0D]">
            {formData.adScoring ? "Ad" : "No-Ad"}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className={labelCls}>Lets</dt>
          <dd className="text-[13px] font-normal text-[#0D0D0D]">
            {formData.playOnLets ? "Play on" : "Stop"}
          </dd>
        </div>
      </dl>

      {/* Source file */}
      {uploadedFile && (
        <div className="flex items-center gap-3 pt-3 border-t border-[#F3F3F3]">
          <div className="size-8 rounded-[10px] bg-[#3B82F6] flex items-center justify-center shrink-0">
            <FileSpreadsheet className="size-4 text-white" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
              Source file
            </p>
            <p className="text-[12px] text-[#525252] truncate tabular-nums">
              {uploadedFile.name}
              <span className="text-[#CCCCCC] mx-1.5">·</span>
              {uploadedFile.size}
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-[rgba(229,24,55,0.06)] border border-[rgba(229,24,55,0.15)] rounded-[10px] p-3">
          <p className="text-[12px] text-[#E51837]">{error}</p>
        </div>
      )}
    </div>
  );
}
