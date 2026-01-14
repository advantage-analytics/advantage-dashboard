"use client";

/**
 * ConfirmContent - Step 5 content
 * Summary display of all entered data
 */

import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { FormData, UploadedFile } from "./types";
import { getAdjustedScores } from "./utils";

export interface ConfirmContentProps {
  formData: FormData;
  uploadedFile: UploadedFile | null;
  isPrivateMatch: boolean;
  error: string | null;
}

// Helper function to get initials from a name
function getInitials(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(" ");
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function ConfirmContent({ formData, uploadedFile, isPrivateMatch, error }: ConfirmContentProps) {
  const playerScores = getAdjustedScores(
    formData.playerScores,
    formData.bestOf
  );
  const opponentScores = getAdjustedScores(
    formData.opponentScores,
    formData.bestOf
  );

  const playerName = formData.playerName || "N/A";
  const opponentName = formData.opponentName || "N/A";

  return (
    <div className="flex flex-col gap-6">
      {/* Event Information */}
      <div className="space-y-3">
        <h4 className="text-[#0D0D0D] font-semibold text-xs">Event Information</h4>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[#999999] font-normal text-xs">Event Name:</span>
            <span className="text-[#0D0D0D] font-normal text-xs">{formData.eventName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#999999] font-normal text-xs">Round:</span>
            <span className="text-[#0D0D0D] font-normal text-xs">{formData.round}</span>
          </div>
        </div>
        <Separator className="bg-[#E5E5E5]" />
      </div>

      {/* Match Information */}
      <div className="space-y-3">
        <h4 className="text-[#0D0D0D] font-semibold text-xs">Match Information</h4>
        <div className="space-y-3">
          {/* Player Rows with Set Headers */}
          <div className="space-y-1 justify-end">
            {/* Set Headers */}
            <div className="flex items-center justify-end gap-4">
              <div className="flex gap-4">
                {playerScores.map((_, i) => (
                  <div
                    key={i}
                    className="w-6 text-center text-sm text-[#999999] font-normal"
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {/* Player 1 */}
              <div className="flex justify-between items-center">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#F7F7F7] flex items-center justify-center text-sm font-medium text-[#999999]">
                    {getInitials(playerName)}
                  </div>
                  <div className="flex-1 flex items-center">
                    <span className="w-40 text-[#0D0D0D] font-medium text-xs">
                      {playerName} (You)
                    </span>
                  </div>
                </div>

                <div className="flex gap-4">
                  {playerScores.map((score, i) => (
                    <div
                      key={i}
                      className="w-6 h-8 flex items-center justify-center text-center text-[#0D0D0D] bg-white border border-[#E5E5E5] rounded-[4px] text-xs"
                    >
                      {score}
                    </div>
                  ))}
                </div>
              </div>

              {/* Player 2 */}
              <div className="flex justify-between items-center">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#F7F7F7] flex items-center justify-center text-sm font-medium text-[#999999]">
                    {getInitials(opponentName)}
                  </div>
                  <div className="flex-1 flex items-center">
                    <span className="w-40 text-[#0D0D0D] font-medium text-xs">
                      {opponentName}
                    </span>
                  </div>
                </div>

                <div className="flex gap-4">
                  {opponentScores.map((score, i) => (
                    <div
                      key={i}
                      className="w-6 h-8 flex items-center justify-center text-center text-[#0D0D0D] bg-white border border-[#E5E5E5] rounded-[4px] text-xs"
                    >
                      {score}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <Separator className="bg-[#E5E5E5]" />

          {/* Additional Match Details */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[#999999] font-normal text-xs">Date:</span>
              <span className="text-[#0D0D0D] font-normal text-xs">{formData.date}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#999999] font-normal text-xs">Match Type:</span>
              <span className="text-[#0D0D0D] font-normal text-xs">{formData.matchType || "N/A"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#999999] font-normal text-xs">Court Type:</span>
              <span className="text-[#0D0D0D] font-normal text-xs">{formData.courtType || "N/A"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#999999] font-normal text-xs">Result:</span>
              <span className="text-[#0D0D0D] font-normal text-xs">{formData.result}</span>
            </div>
          </div>
        </div>
        <Separator className="bg-[#E5E5E5]" />
      </div>

      {/* Scoring Format */}
      <div className="space-y-3">
        <h4 className="text-[#0D0D0D] font-semibold text-xs">Scoring Format</h4>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[#999999] font-normal text-xs">Scoring:</span>
            <span className="text-[#0D0D0D] font-normal text-xs">Best of {formData.bestOf}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#999999] font-normal text-xs">Ad Scoring:</span>
            <span className="text-[#0D0D0D] font-normal text-xs">{formData.adScoring ? "Yes" : "No"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#999999] font-normal text-xs">Play on Lets:</span>
            <span className="text-[#0D0D0D] font-normal text-xs">{formData.playOnLets ? "Yes" : "No"}</span>
          </div>
        </div>
        <Separator className="bg-[#E5E5E5]" />
      </div>

      {/* Privacy Setting */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h4 className="text-[#0D0D0D] font-semibold text-xs">Private Match</h4>
          <p className="text-[#999999] font-normal text-xs">
            Note: All matches will be private during our Beta Testing
          </p>
        </div>
        <Switch
          checked={isPrivateMatch}
          disabled={true}
          className="opacity-50 cursor-not-allowed"
        />
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
    </div>
  );
}
