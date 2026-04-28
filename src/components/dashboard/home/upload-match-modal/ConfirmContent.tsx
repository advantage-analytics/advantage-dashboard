"use client";

/**
 * ConfirmContent - Step 5 content
 * Summary display of all entered data
 */

import { AlertCircle, Calendar, Clock, MapPin } from "lucide-react";
import { Switch } from "@/components/ui/switch";
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
function determineWinner(
  playerScores: (number | null)[],
  opponentScores: (number | null)[]
): "player" | "opponent" | null {
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

interface PlayerRowProps {
  name: string;
  scores: (number | null)[];
  opponentScores: (number | null)[];
  isWinner: boolean;
}

function PlayerRow({ name, scores, opponentScores, isWinner }: PlayerRowProps) {
  const nameClass = isWinner
    ? "text-[#0D0D0D] font-semibold"
    : "text-[#888888] font-medium";

  return (
    <div className="flex flex-row justify-between items-center">
      <div className="flex flex-row items-center gap-3 min-w-0 flex-1">
        <div className="w-10 h-10 rounded-full bg-[#F4F4F4] text-[#666666] text-sm font-medium flex items-center justify-center shrink-0">
          {getInitials(name)}
        </div>
        <p className={`text-sm truncate ${nameClass}`}>{name}</p>
      </div>
      <div className="flex flex-row gap-4 text-base font-semibold tabular-nums">
        {scores.map((score, idx) => {
          const ownScore = score ?? 0;
          const otherScore = opponentScores[idx] ?? 0;
          const wonSet = ownScore > otherScore;
          return (
            <p
              key={idx}
              className={wonSet ? "text-[#0D0D0D]" : "text-[#888888]"}
            >
              {ownScore}
            </p>
          );
        })}
      </div>
    </div>
  );
}

export function ConfirmContent({
  formData,
  isPrivateMatch,
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

  const playerName = formData.playerName || "N/A";
  const opponentName = formData.opponentName || "N/A";
  const winner = determineWinner(playerScores, opponentScores);

  const formattedDate = formatDate(formData.date);
  const metadataItems = [
    { icon: Calendar, label: formattedDate },
    { icon: MapPin, label: formData.courtType },
    { icon: Clock, label: formData.matchType },
  ].filter((item) => item.label);

  const formatPills = [
    `Best of ${formData.bestOf} Sets`,
    formData.adScoring ? "Ad Scoring" : "No-Ad Scoring",
    formData.playOnLets ? "Play on Lets" : "Lets",
  ];

  return (
    <div className="space-y-6">
      {/* Event Name and Metadata Row */}
      <div className="flex flex-col gap-2">
        <p className="text-xl font-medium text-[#0D0D0D]">
          {formData.eventName ||
            `${formData.playerName} vs ${formData.opponentName}`}
        </p>
        {metadataItems.length > 0 && (
          <div className="flex flex-row flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#666666]">
            {metadataItems.map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5 text-[#888888]" />
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Match Score Section */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-row justify-between items-center text-xs text-[#888888]">
          <p>
            {getMatchStatus(formData.result)} | {formData.round || "Round of 16"}
          </p>
          <span className="rounded-full px-2.5 py-1 text-xs font-medium bg-[#3B82F6]/10 text-[#3B82F6]">
            {formatDuration(formData.duration)}
          </span>
        </div>
        <div className="flex flex-col">
          <div className="py-2 border-b border-[#EAECF0]">
            <PlayerRow
              name={playerName}
              scores={playerScores}
              opponentScores={opponentScores}
              isWinner={winner === "player"}
            />
          </div>
          <div className="py-2">
            <PlayerRow
              name={opponentName}
              scores={opponentScores}
              opponentScores={playerScores}
              isWinner={winner === "opponent"}
            />
          </div>
        </div>
      </div>

      {/* Scoring Format Section */}
      <div className="space-y-3">
        <h4 className="text-[#0D0D0D] font-medium text-sm">Scoring Format</h4>
        <div className="flex flex-row flex-wrap gap-2">
          {formatPills.map((label) => (
            <span
              key={label}
              className="bg-[#F4F4F4] text-[#0D0D0D] rounded-full px-2.5 py-1 text-xs font-medium"
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Public/Private Toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-medium text-[#0D0D0D]">Public</h4>
          <p className="text-xs text-[#888888]">
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
        <div className="rounded-xl border border-[#E51837]/20 bg-[#E51837]/[0.04] p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-[#E51837] shrink-0 mt-0.5" />
          <p className="text-sm text-[#0D0D0D]">{error}</p>
        </div>
      )}
    </div>
  );
}
