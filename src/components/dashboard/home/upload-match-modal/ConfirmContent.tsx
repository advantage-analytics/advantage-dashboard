"use client";

/**
 * ConfirmContent - Step 5 content
 * Summary display of all entered data
 */

import { Switch } from "@/components/ui/switch";
import { MatchMetadataRow } from "@/components/dashboard/matches/match-metadata-row";
import { FormData, UploadedFile } from "./types";
import { getAdjustedScores, formatDuration } from "./utils";

export interface ConfirmContentProps {
  formData: FormData;
  uploadedFile: UploadedFile | null;
  isPrivateMatch: boolean;
  error: string | null;
}

// Helper function to get initials from a name
function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Helper to format date as "Month Day, Year"
function formatDate(dateString: string): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Helper to determine winner based on scores
function determineWinner(playerScores: (number | null)[], opponentScores: (number | null)[]): "player" | "opponent" | null {
  let playerSetsWon = 0;
  let opponentSetsWon = 0;

  for (let i = 0; i < playerScores.length; i++) {
    const pScore = playerScores[i] ?? 0;
    const oScore = opponentScores[i] ?? 0;
    if (pScore > oScore) {
      playerSetsWon++;
    } else if (oScore > pScore) {
      opponentSetsWon++;
    }
  }

  if (playerSetsWon > opponentSetsWon) return "player";
  if (opponentSetsWon > playerSetsWon) return "opponent";
  return null;
}

// Helper to determine match status from result
function getMatchStatus(result: string | undefined): string {
  if (!result) return "Final Score";
  if (result === "Unfinished") return "Unfinished";
  if (result.includes("Withdrew")) return "Withdrew";
  if (result.includes("Defaulted")) return "Defaulted";
  if (result.includes("Wins")) return "Final Score";
  return "Final Score";
}

export function ConfirmContent({ formData, uploadedFile, isPrivateMatch, error }: ConfirmContentProps) {
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

  const playerName = formData.playerName || "N/A";
  const opponentName = formData.opponentName || "N/A";
  const winner = determineWinner(playerScores, opponentScores);

  return (
    <div className="space-y-6">
      {/* Event Name and Metadata Row */}
      <div className="flex flex-col gap-4">
        <p className="text-xl font-medium text-[#000000]">
          {formData.eventName || `${formData.playerName} vs ${formData.opponentName}`}
        </p>
        <MatchMetadataRow
          date={formatDate(formData.date)}
          matchType={formData.matchType}
          courtType={formData.courtType}
        />
      </div>

      {/* Match Score Section */}
      <div className="pl-2 pr-4 py-3 flex flex-row gap-6">
        {/* Vertical Separator */}
        <div className="w-0.5 bg-[#6AABFF] self-stretch rounded-full"></div>
        <div className="flex flex-col space-y-4 flex-1">
          {/* Match Header */}
          <div className="flex flex-row justify-between items-center font-normal text-xs text-[#888888]">
            <p>{getMatchStatus(formData.result)} | {formData.round || "Round of 16"}</p>
            <span className="rounded-[10px] px-1.5 py-0.5 text-xs font-medium bg-[#6AABFF] text-white">
              {formatDuration(formData.duration)}
            </span>
          </div>

          {/* Player Names + Scores */}
          <div className="flex flex-col space-y-2">
            {/* Player 1 */}
            <div className="flex flex-row justify-between items-center">
              <div className="flex flex-row items-center gap-4">
                <div className="w-10 h-10 rounded bg-[#F2F2F2] flex items-center justify-center shrink-0">
                  <span className="text-xs font-medium text-[#BFBFBF]">
                    {getInitials(playerName)}
                  </span>
                </div>
                <p className={`font-semibold text-sm ${winner === "player" ? "text-[#0D0D0D]" : "text-[#B3B3B3]"}`}>
                  {playerName}
                </p>
              </div>
              <div className="flex flex-row gap-4 font-semibold text-[18px]">
                {playerScores.map((score, idx) => {
                  const pScore = score ?? 0;
                  const oScore = opponentScores[idx] ?? 0;
                  return (
                    <p
                      key={idx}
                      className={pScore > oScore ? "text-[#0D0D0D]" : "text-[#B3B3B3]"}
                    >
                      {pScore}
                    </p>
                  );
                })}
              </div>
            </div>

            {/* Player 2 (Opponent) */}
            <div className="flex flex-row justify-between items-center">
              <div className="flex flex-row items-center gap-4">
                <div className="w-10 h-10 rounded bg-[#F2F2F2] flex items-center justify-center shrink-0">
                  <span className="text-xs font-medium text-[#BFBFBF]">
                    {getInitials(opponentName)}
                  </span>
                </div>
                <p className={`font-semibold text-sm ${winner === "opponent" ? "text-[#0D0D0D]" : "text-[#B3B3B3]"}`}>
                  {opponentName}
                </p>
              </div>
              <div className="flex flex-row gap-4 font-semibold text-[18px]">
                {opponentScores.map((score, idx) => {
                  const oScore = score ?? 0;
                  const pScore = playerScores[idx] ?? 0;
                  return (
                    <p
                      key={idx}
                      className={oScore > pScore ? "text-[#0D0D0D]" : "text-[#B3B3B3]"}
                    >
                      {oScore}
                    </p>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scoring Format Section */}
      <div className="space-y-3">
        <h4 className="text-[#0D0D0D] font-medium text-sm">Scoring Format</h4>
        <div className="flex flex-row gap-3">
          <div className="px-3 py-2 bg-[#F7F7F7] rounded-lg">
            <p className="text-xs font-medium text-[#666666]">Best of {formData.bestOf} Sets</p>
          </div>
          <div className="px-3 py-2 bg-[#F7F7F7] rounded-lg">
            <p className="text-xs font-medium text-[#666666]">{formData.adScoring ? "Ad Scoring" : "No-Ad Scoring"}</p>
          </div>
          <div className="px-3 py-2 bg-[#F7F7F7] rounded-lg">
            <p className="text-xs font-medium text-[#666666]">{formData.playOnLets ? "Play on Lets" : "Lets"}</p>
          </div>
        </div>
      </div>

      {/* Public/Private Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h4 className="text-[#0D0D0D] font-medium text-sm">Public</h4>
          <p className="text-[#888888] font-normal text-xs">
            Note: All matches will be private during our Beta Testing
          </p>
        </div>
        <Switch
          checked={!isPrivateMatch}
          disabled={true}
          className="opacity-50 cursor-not-allowed"
        />
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}
