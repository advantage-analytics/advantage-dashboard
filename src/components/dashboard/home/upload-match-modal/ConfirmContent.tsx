"use client";

/**
 * ConfirmContent - Step 5 content
 * Summary display of all entered data
 */

import { motion } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { MatchMetadataRow } from "@/components/dashboard/matches/match-metadata-row";
import { FormData, UploadedFile } from "./types";
import { getAdjustedScores, formatDuration } from "./utils";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [...EASE_CURVE] }}
      className="space-y-6"
    >
      {/* Event Name and Metadata Row */}
      <div className="flex flex-col gap-4">
        <p className="text-[16px] font-normal text-[#0D0D0D] tracking-[-0.4px]">
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
        <div className="w-0.5 bg-[#3B82F6] self-stretch rounded-full"></div>
        <div className="flex flex-col space-y-4 flex-1">
          {/* Match Header */}
          <div className="flex flex-row justify-between items-center font-normal text-xs text-[#888888]">
            <p>{getMatchStatus(formData.result)} | {formData.round || "Round of 16"}</p>
            <span className="rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium bg-[#3B82F6] text-white">
              {formatDuration(formData.duration)}
            </span>
          </div>

          {/* Player Names + Scores */}
          <div className="flex flex-col space-y-2">
            {/* Player 1 */}
            <div className="flex flex-row justify-between items-center">
              <div className="flex flex-row items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-[#F5F5F5] flex items-center justify-center shrink-0">
                  <span className="text-[11px] font-semibold text-[#888888]">
                    {getInitials(playerName)}
                  </span>
                </div>
                <p className={`text-[14px] font-medium ${winner === "player" ? "text-[#0D0D0D]" : "text-[#B3B3B3]"}`}>
                  {playerName}
                </p>
              </div>
              <div className="flex flex-row gap-4 text-[16px] font-semibold tabular-nums tracking-[0.3px]">
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
                <div className="w-10 h-10 rounded-lg bg-[#F5F5F5] flex items-center justify-center shrink-0">
                  <span className="text-[11px] font-semibold text-[#888888]">
                    {getInitials(opponentName)}
                  </span>
                </div>
                <p className={`text-[14px] font-medium ${winner === "opponent" ? "text-[#0D0D0D]" : "text-[#B3B3B3]"}`}>
                  {opponentName}
                </p>
              </div>
              <div className="flex flex-row gap-4 text-[16px] font-semibold tabular-nums tracking-[0.3px]">
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
        <h4 className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">Scoring Format</h4>
        <div className="flex flex-row gap-3">
          <div className="px-3 py-1.5 bg-[#F5F5F5] rounded-[6px]">
            <p className="text-[11px] font-medium text-[#525252]">Best of {formData.bestOf} Sets</p>
          </div>
          <div className="px-3 py-1.5 bg-[#F5F5F5] rounded-[6px]">
            <p className="text-[11px] font-medium text-[#525252]">{formData.adScoring ? "Ad Scoring" : "No-Ad Scoring"}</p>
          </div>
          <div className="px-3 py-1.5 bg-[#F5F5F5] rounded-[6px]">
            <p className="text-[11px] font-medium text-[#525252]">{formData.playOnLets ? "Play on Lets" : "Lets"}</p>
          </div>
        </div>
      </div>

      {/* Opponent Details - only show if fields exist */}
      {((formData as any).opponentHand || (formData as any).opponentBackhand) && (
        <div className="space-y-3">
          <h4 className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
            Opponent Details
          </h4>
          <div className="flex flex-row gap-3">
            {(formData as any).opponentHand && (
              <div className="px-3 py-1.5 bg-[#F5F5F5] rounded-[6px]">
                <p className="text-[11px] font-medium text-[#525252]">{(formData as any).opponentHand}-Handed</p>
              </div>
            )}
            {(formData as any).opponentBackhand && (
              <div className="px-3 py-1.5 bg-[#F5F5F5] rounded-[6px]">
                <p className="text-[11px] font-medium text-[#525252]">{(formData as any).opponentBackhand} Backhand</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Public/Private Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h4 className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">Public</h4>
          <p className="text-[12px] font-normal text-[#888888]">
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
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [...EASE_CURVE] }}
        >
          <div className="bg-red-50 border border-red-200 rounded-lg p-4" role="alert">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
