"use client";

/**
 * DetailsContent - Step 4 content
 * Match details form with player scores and result
 */

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { CircleMinus, CirclePlus, SquarePen } from "lucide-react";
import { FormData } from "./types";
import { getAdjustedScores } from "./utils";

export interface DetailsContentProps {
  formData: FormData;
  onInputChange: (field: keyof FormData, value: any) => void;
  onScoreChange: (
    player: "player" | "opponent",
    index: number,
    value: string
  ) => void;
}

// Helper function to get initials from a name
function getInitials(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(" ");
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function DetailsContent({
  formData,
  onInputChange,
  onScoreChange,
}: DetailsContentProps) {
  const playerScores = getAdjustedScores(
    formData.playerScores,
    formData.bestOf
  );
  const opponentScores = getAdjustedScores(
    formData.opponentScores,
    formData.bestOf
  );
  const bestOfNum = parseInt(formData.bestOf);

  const handleSetsChange = (delta: number) => {
    const newSets = Math.max(1, Math.min(5, bestOfNum + delta));
    onInputChange("bestOf", newSets.toString());
  };

  // Determine winner name for result dropdown
  const playerName = formData.playerName || "Player";
  const opponentName = formData.opponentName || "Opponent";
  const playerWins = `${playerName} Wins`;
  const opponentWins = `${opponentName} Wins`;

  // Use existing result if it matches a winner pattern, otherwise default to player wins
  const resultValue =
    formData.result === opponentWins ? opponentWins : playerWins;

  return (
    <div className="flex flex-col gap-9">
      <div className="space-y-4">
        <div className="space-y-3">
          {/* Sets Configuration */}
          <div className="flex justify-between items-center">
            <span className="text-[#999999] font-normal text-xs">
              {formData.bestOf} Sets
            </span>
            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={() => handleSetsChange(-1)}
                disabled={bestOfNum <= 1}
                className="text-blue-500 disabled:opacity-50 disabled:cursor-not-allowed hover:text-blue-600 transition-colors"
              >
                <CircleMinus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleSetsChange(1)}
                disabled={bestOfNum >= 5}
                className="text-blue-500 disabled:opacity-50 disabled:cursor-not-allowed hover:text-blue-600 transition-colors"
              >
                <CirclePlus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <Separator className="bg-[#E5E5E5]" />
        </div>

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
                  <button
                    type="button"
                    className="w-4 h-4 flex items-center justify-center text-[#999999] hover:text-[#0D0D0D] transition-colors"
                  >
                    <SquarePen className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex gap-4">
                {playerScores.map((score, i) => (
                  <Input
                    key={i}
                    className="!w-6 h-8 text-center text-[#0D0D0D] bg-white border border-[#E5E5E5] rounded-[4px] px-0 shadow-none focus-visible:ring-1 focus-visible:ring-[#E5E5E5]"
                    value={score}
                    onChange={(e) => onScoreChange("player", i, e.target.value)}
                  />
                ))}
              </div>
            </div>

            {/* Player 2 */}
            <div className="flex justify-between items-center">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F7F7F7] flex items-center justify-center text-sm font-medium text-[#999999]">
                  {getInitials(playerName)}
                </div>
                <div className="flex-1 flex items-center">
                  <span className="w-40 text-[#0D0D0D] font-medium text-xs">
                    {opponentName}
                  </span>
                  <button
                    type="button"
                    className="w-4 h-4 flex items-center justify-center text-[#999999] hover:text-[#0D0D0D] transition-colors"
                  >
                    <SquarePen className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex gap-4">
                {playerScores.map((score, i) => (
                  <Input
                    key={i}
                    className="!w-6 h-8 text-center text-[#0D0D0D] bg-white border border-[#E5E5E5] rounded-[4px] px-0 shadow-none focus-visible:ring-1 focus-visible:ring-[#E5E5E5]"
                    value={score}
                    onChange={(e) => onScoreChange("player", i, e.target.value)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Result Section */}
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <span className="text-[#0D0D0D] font-medium text-xs">Result</span>
          <Select
            value={resultValue}
            onValueChange={(value) => onInputChange("result", value)}
          >
            <SelectTrigger className="w-[180px] h-7 bg-white border-[#E5E5E5] border rounded-full text-[#999999] text-xs shadow-none [&_svg]:size-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="shadow-none border-[#E5E5E5] text-[#999999] text-xs">
              <SelectItem value={playerWins} className="text-[#999999] text-xs">{playerWins}</SelectItem>
              <SelectItem value={opponentWins} className="text-[#999999] text-xs">{opponentWins}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <button
          type="button"
          className="text-[10px] text-[#999999] underline underline-offset-[19.89%] hover:text-[#666666] transition-colors"
        >
          Advanced Settings (Optional)
        </button>
      </div>
    </div>
  );
}
