"use client";

/**
 * DetailsContent - Step 4 content
 * Match details form with player scores and result
 */

import { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, CircleMinus, CirclePlus, SquarePen, Info } from "lucide-react";
import { FormData, ParsingState } from "./types";
import { getAdjustedScores, formatDuration, parseDuration } from "./utils";

export interface DetailsContentProps {
  formData: FormData;
  onInputChange: (field: keyof FormData, value: string | number | boolean) => void;
  onScoreChange: (
    player: "player" | "opponent",
    index: number,
    value: string
  ) => void;
  onTiebreakChange?: (
    player: "player" | "opponent",
    index: number,
    value: string
  ) => void;
  parsingState?: ParsingState;
}

// Helper function to get initials from a name
function getInitials(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(" ");
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Helper function to check if a set needs a tiebreak (7-6 or 6-7)
function needsTiebreak(playerScore: number | null, opponentScore: number | null): boolean {
  if (playerScore === null || opponentScore === null) return false;
  return (playerScore === 7 && opponentScore === 6) || (playerScore === 6 && opponentScore === 7);
}

export function DetailsContent({
  formData,
  onInputChange,
  onScoreChange,
  onTiebreakChange,
  parsingState,
}: DetailsContentProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState(false);
  const [editingOpponent, setEditingOpponent] = useState(false);

  // Get scores first (needed by focus functions)
  const playerScores = getAdjustedScores(
    formData.playerScores,
    formData.bestOf
  );
  const opponentScores = getAdjustedScores(
    formData.opponentScores,
    formData.bestOf
  );
  const bestOfNum = parseInt(formData.bestOf) || 3;

  // Refs for all input fields to manage autofocus
  const playerScoreRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const opponentScoreRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const playerTiebreakRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const opponentTiebreakRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Focus management logic
  const focusNextInput = useCallback((currentType: "playerScore" | "opponentScore" | "playerTiebreak" | "opponentTiebreak", setIndex: number) => {
    const numSets = playerScores.length;

    setTimeout(() => {
      switch (currentType) {
        case "playerScore":
          // From player score → opponent score (same set)
          if (opponentScoreRefs.current[setIndex]) {
            opponentScoreRefs.current[setIndex]?.focus();
          }
          break;

        case "opponentScore":
          // From opponent score → next player score OR player tiebreak if 7-6/6-7
          const playerScore = playerScores[setIndex];
          const opponentScore = opponentScores[setIndex];

          if (needsTiebreak(playerScore, opponentScore)) {
            // Jump to player tiebreak
            if (playerTiebreakRefs.current[setIndex]) {
              playerTiebreakRefs.current[setIndex]?.focus();
            }
          } else if (setIndex < numSets - 1) {
            // Jump to next set's player score
            if (playerScoreRefs.current[setIndex + 1]) {
              playerScoreRefs.current[setIndex + 1]?.focus();
            }
          }
          break;

        case "playerTiebreak":
          // From player tiebreak → opponent tiebreak (same set)
          if (opponentTiebreakRefs.current[setIndex]) {
            opponentTiebreakRefs.current[setIndex]?.focus();
          }
          break;

        case "opponentTiebreak":
          // From opponent tiebreak → next set's player score
          if (setIndex < numSets - 1) {
            if (playerScoreRefs.current[setIndex + 1]) {
              playerScoreRefs.current[setIndex + 1]?.focus();
            }
          }
          break;
      }
    }, 0);
  }, [playerScores, opponentScores]);

  // Focus previous input when deleting
  const focusPreviousInput = useCallback((currentType: "playerScore" | "opponentScore" | "playerTiebreak" | "opponentTiebreak", setIndex: number) => {
    setTimeout(() => {
      switch (currentType) {
        case "playerScore":
          // From player score → previous opponent tiebreak (if exists)
          if (setIndex > 0) {
            const prevPlayerScore = playerScores[setIndex - 1];
            const prevOpponentScore = opponentScores[setIndex - 1];

            if (needsTiebreak(prevPlayerScore, prevOpponentScore)) {
              if (opponentTiebreakRefs.current[setIndex - 1]) {
                opponentTiebreakRefs.current[setIndex - 1]?.focus();
              }
            } else {
              if (opponentScoreRefs.current[setIndex - 1]) {
                opponentScoreRefs.current[setIndex - 1]?.focus();
              }
            }
          }
          break;

        case "opponentScore":
          // From opponent score → player score (same set)
          if (playerScoreRefs.current[setIndex]) {
            playerScoreRefs.current[setIndex]?.focus();
          }
          break;

        case "playerTiebreak":
          // From player tiebreak → opponent score (same set)
          if (opponentScoreRefs.current[setIndex]) {
            opponentScoreRefs.current[setIndex]?.focus();
          }
          break;

        case "opponentTiebreak":
          // From opponent tiebreak → player tiebreak (same set)
          if (playerTiebreakRefs.current[setIndex]) {
            playerTiebreakRefs.current[setIndex]?.focus();
          }
          break;
      }
    }, 0);
  }, [playerScores, opponentScores]);

  const handleSetsChange = (delta: number) => {
    const newSets = Math.max(1, Math.min(5, bestOfNum + delta));
    onInputChange("bestOf", newSets.toString());
  };

  // Determine player names and result options for dropdown
  const playerName = formData.playerName || "Player";
  const opponentName = formData.opponentName || "Opponent";

  // Result options
  const resultOptions = [
    { value: `${playerName} Wins`, label: `${playerName} Wins` },
    { value: `${opponentName} Wins`, label: `${opponentName} Wins` },
    { value: `${playerName} Withdrew`, label: `${playerName} Withdrew` },
    { value: `${opponentName} Withdrew`, label: `${opponentName} Withdrew` },
    { value: `${playerName} Defaulted`, label: `${playerName} Defaulted` },
    { value: `${opponentName} Defaulted`, label: `${opponentName} Defaulted` },
    { value: "Unfinished", label: "Unfinished" },
  ];

  return (
    <div className="flex flex-col gap-9">
      {/* Auto-fill Banner */}
      {parsingState?.parseSuccess && (
        <div className="animate-slideDown p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2.5">
          <Info className="h-4 w-4 text-blue-500 mt-0 flex-shrink-0" />
          <div>
            <p className="text-blue-600 text-xs font-medium">
              Data auto-filled from file
            </p>
            <p className="text-blue-600 text-xs mt-1">
              Please review the information below and make any necessary corrections.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-3">
          {/* Sets Configuration */}
          <div className="flex justify-between items-center">
            <span className="text-[#999999] font-normal text-xs">
              {formData.bestOf || 3} Sets
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
          {/* Set Headers - mirrors the score row structure */}
          <div className="flex items-center justify-end gap-4">
            {playerScores.map((score, i) => {
              const hasTiebreak = needsTiebreak(score, opponentScores[i]);
              return (
                <div key={i} className="flex items-center gap-1">
                  <div className="w-6 text-center text-sm text-[#999999] font-normal">
                    {i + 1}
                  </div>
                  {hasTiebreak && (
                    <span className="w-6 text-center text-[8px] text-[#999999] font-normal">
                      TIE
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="space-y-3">
            {/* Player 1 */}
            <div className="flex justify-between items-start">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F7F7F7] flex items-center justify-center text-sm font-medium text-[#999999]">
                  {getInitials(playerName)}
                </div>
                <div className="flex-1 flex items-center gap-2">
                  {editingPlayer ? (
                    <Input
                      placeholder="Enter your name..."
                      value={formData.playerName}
                      onChange={(e) => onInputChange("playerName", e.target.value)}
                      onBlur={() => setEditingPlayer(false)}
                      onKeyDown={(e) => e.key === "Enter" && setEditingPlayer(false)}
                      autoFocus
                      className="w-40 h-7 bg-white border-[#E5E5E5] border rounded-full text-[#999999] text-xs shadow-none placeholder:text-[#999999] px-3"
                    />
                  ) : (
                    <span className="w-40 text-[#0D0D0D] font-medium text-xs">
                      {playerName} (You)
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingPlayer(!editingPlayer)}
                    className="w-4 h-4 flex items-center justify-center text-[#999999] hover:text-[#0D0D0D] transition-colors"
                  >
                    <SquarePen className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex gap-4">
                {playerScores.map((score, i) => {
                  const opponentScore = opponentScores[i];
                  const hasTiebreak = needsTiebreak(score, opponentScore);

                  return (
                    <div key={i} className="flex items-center gap-1">
                      {/* Set Score */}
                      <Input
                        ref={(el) => {
                          if (el) playerScoreRefs.current[i] = el;
                        }}
                        placeholder="-"
                        inputMode="numeric"
                        pattern="\d*"
                        className="!w-6 h-8 text-center text-[#0D0D0D] bg-[#F7F7F7] border border-[#E5E5E5] rounded-[4px] px-0 shadow-none focus-visible:ring-1 focus-visible:ring-[#E5E5E5] placeholder:text-[#999999]"
                        value={score === null ? "" : score}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          onScoreChange("player", i, newValue);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const newValue = e.currentTarget.value;

                            if (newValue === "") {
                              // User is deleting - focus previous
                              focusPreviousInput("playerScore", i);
                            } else if (newValue.length > 0) {
                              // Check if this creates a tiebreak situation (7-6 or 6-7)
                              const playerNum = Number(newValue);
                              const currentOpponentScore = opponentScores[i];

                              if (needsTiebreak(playerNum, currentOpponentScore)) {
                                // Jump directly to player tiebreak
                                setTimeout(() => {
                                  if (playerTiebreakRefs.current[i]) {
                                    playerTiebreakRefs.current[i]?.focus();
                                  }
                                }, 0);
                              } else {
                                // User pressed enter - focus next
                                focusNextInput("playerScore", i);
                              }
                            }
                          }
                        }}
                      />
                      {/* Tiebreak Score - inline on the right */}
                      {hasTiebreak && (
                        <Input
                          ref={(el) => {
                            if (el) playerTiebreakRefs.current[i] = el;
                          }}
                          placeholder="-"
                          inputMode="numeric"
                          pattern="\d*"
                          className="!w-6 h-8 text-center text-[#0D0D0D] bg-[#F7F7F7] border border-[#E5E5E5] rounded-[4px] px-0 shadow-none focus-visible:ring-1 focus-visible:ring-[#E5E5E5] placeholder:text-[#999999]"
                          value={formData.playerTiebreaks[i] === null ? "" : String(formData.playerTiebreaks[i])}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            onTiebreakChange?.("player", i, newValue);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const newValue = e.currentTarget.value;

                              if (newValue === "") {
                                // User is deleting - focus previous
                                focusPreviousInput("playerTiebreak", i);
                              } else if (newValue.length > 0) {
                                // User pressed enter - focus next
                                focusNextInput("playerTiebreak", i);
                              }
                            }
                          }}
                          maxLength={3}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Player 2 */}
            <div className="flex justify-between items-start">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F7F7F7] flex items-center justify-center text-sm font-medium text-[#999999]">
                  {getInitials(opponentName)}
                </div>
                <div className="flex-1 flex items-center gap-2">
                  {editingOpponent ? (
                    <Input
                      placeholder="Enter opponent name..."
                      value={formData.opponentName}
                      onChange={(e) => onInputChange("opponentName", e.target.value)}
                      onBlur={() => setEditingOpponent(false)}
                      onKeyDown={(e) => e.key === "Enter" && setEditingOpponent(false)}
                      autoFocus
                      className="w-40 h-7 bg-white border-[#E5E5E5] border rounded-full text-[#999999] text-xs shadow-none placeholder:text-[#999999] px-3"
                    />
                  ) : (
                    <span className="w-40 text-[#0D0D0D] font-medium text-xs">
                      {opponentName}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingOpponent(!editingOpponent)}
                    className="w-4 h-4 flex items-center justify-center text-[#999999] hover:text-[#0D0D0D] transition-colors"
                  >
                    <SquarePen className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex gap-4">
                {opponentScores.map((score, i) => {
                  const playerScore = playerScores[i];
                  const hasTiebreak = needsTiebreak(playerScore, score);

                  return (
                    <div key={i} className="flex items-center gap-1">
                      {/* Set Score */}
                      <Input
                        ref={(el) => {
                          if (el) opponentScoreRefs.current[i] = el;
                        }}
                        placeholder="-"
                        inputMode="numeric"
                        pattern="\d*"
                        className="!w-6 h-8 text-center text-[#0D0D0D] bg-[#F7F7F7] border border-[#E5E5E5] rounded-[4px] px-0 shadow-none focus-visible:ring-1 focus-visible:ring-[#E5E5E5] placeholder:text-[#999999]"
                        value={score === null ? "" : score}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          onScoreChange("opponent", i, newValue);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const newValue = e.currentTarget.value;

                            if (newValue === "") {
                              // User is deleting - focus previous
                              focusPreviousInput("opponentScore", i);
                            } else if (newValue.length > 0) {
                              // Check if this creates a tiebreak situation (7-6 or 6-7)
                              const opponentNum = Number(newValue);
                              const currentPlayerScore = playerScores[i];

                              if (needsTiebreak(currentPlayerScore, opponentNum)) {
                                // Jump directly to player tiebreak (since player tiebreak comes before opponent tiebreak in the flow)
                                setTimeout(() => {
                                  if (playerTiebreakRefs.current[i]) {
                                    playerTiebreakRefs.current[i]?.focus();
                                  }
                                }, 0);
                              } else {
                                // User pressed enter - focus next
                                focusNextInput("opponentScore", i);
                              }
                            }
                          }
                        }}
                      />
                      {/* Tiebreak Score - inline on the right */}
                      {hasTiebreak && (
                        <Input
                          ref={(el) => {
                            if (el) opponentTiebreakRefs.current[i] = el;
                          }}
                          placeholder="-"
                          inputMode="numeric"
                          pattern="\d*"
                          className="!w-6 h-8 text-center text-[#0D0D0D] bg-[#F7F7F7] border border-[#E5E5E5] rounded-[4px] px-0 shadow-none focus-visible:ring-1 focus-visible:ring-[#E5E5E5] placeholder:text-[#999999]"
                          value={formData.opponentTiebreaks[i] === null ? "" : String(formData.opponentTiebreaks[i])}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            onTiebreakChange?.("opponent", i, newValue);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const newValue = e.currentTarget.value;

                              if (newValue === "") {
                                // User is deleting - focus previous
                                focusPreviousInput("opponentTiebreak", i);
                              } else if (newValue.length > 0) {
                                // User pressed enter - focus next
                                focusNextInput("opponentTiebreak", i);
                              }
                            }
                          }}
                          maxLength={3}
                        />
                      )}
                    </div>
                  );
                })}
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
            value={formData.result || undefined}
            onValueChange={(value) => onInputChange("result", value)}
          >
            <SelectTrigger className="w-[180px] h-7 bg-white border-[#E5E5E5] border rounded-full text-[#999999] text-xs shadow-none [&_svg]:size-3">
              <SelectValue placeholder="Select Result..." />
            </SelectTrigger>
            <SelectContent className="shadow-none border-[#E5E5E5] text-[#999999] text-xs">
              {resultOptions.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-[#999999] text-xs">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-[10px] text-[#999999] hover:text-[#666666] transition-colors"
        >
          <span className="underline underline-offset-[19.89%]">Advanced Settings (Optional)</span>
          <ChevronDown
            className={`h-3 w-3 transition-transform duration-300 ${showAdvanced ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Advanced Settings Section */}
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          showAdvanced ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-6 pt-2">
          {/* Event Information */}
          <div className="space-y-3">
            <h4 className="text-[#0D0D0D] font-medium text-xs">Event Information</h4>
            <div className="flex flex-wrap gap-3">
              <Input
                placeholder="Type Event Name..."
                value={formData.eventName}
                onChange={(e) => onInputChange("eventName", e.target.value)}
                className="w-[200px] h-7 bg-white border-[#E5E5E5] border rounded-full text-[#999999] text-xs shadow-none placeholder:text-[#999999] px-3"
              />
              <Select
                value={formData.round || undefined}
                onValueChange={(value) => onInputChange("round", value)}
              >
                <SelectTrigger className="w-[130px] h-7 bg-white border-[#E5E5E5] border rounded-full text-[#999999] text-xs shadow-none [&_svg]:size-3">
                  <SelectValue placeholder="Round of..." />
                </SelectTrigger>
                <SelectContent className="shadow-none border-[#E5E5E5] text-[#999999] text-xs">
                  <SelectItem value="Round of 128" className="text-[#999999] text-xs">Round of 128</SelectItem>
                  <SelectItem value="Round of 64" className="text-[#999999] text-xs">Round of 64</SelectItem>
                  <SelectItem value="Round of 32" className="text-[#999999] text-xs">Round of 32</SelectItem>
                  <SelectItem value="Round of 16" className="text-[#999999] text-xs">Round of 16</SelectItem>
                  <SelectItem value="Quarterfinals" className="text-[#999999] text-xs">Quarterfinals</SelectItem>
                  <SelectItem value="Semifinals" className="text-[#999999] text-xs">Semifinals</SelectItem>
                  <SelectItem value="Finals" className="text-[#999999] text-xs">Finals</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-3">
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => onInputChange("date", e.target.value)}
                className="w-[130px] h-7 bg-white border-[#E5E5E5] border rounded-full text-[#999999] text-xs shadow-none pl-3 pr-1 [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:p-0 [&::-webkit-calendar-picker-indicator]:m-0"
              />
              <Input
                type="time"
                value={formData.time}
                onChange={(e) => onInputChange("time", e.target.value)}
                className="w-[95px] h-7 bg-white border-[#E5E5E5] border rounded-full text-[#999999] text-xs shadow-none pl-3 pr-1 [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:p-0 [&::-webkit-calendar-picker-indicator]:m-0"
              />
              <Select
                value={formData.matchType || undefined}
                onValueChange={(value) => onInputChange("matchType", value)}
              >
                <SelectTrigger className="w-[130px] h-7 bg-white border-[#E5E5E5] border rounded-full text-[#999999] text-xs shadow-none [&_svg]:size-3">
                  <SelectValue placeholder="Match Type..." />
                </SelectTrigger>
                <SelectContent className="shadow-none border-[#E5E5E5] text-[#999999] text-xs">
                  <SelectItem value="Tournament" className="text-[#999999] text-xs">Tournament</SelectItem>
                  <SelectItem value="Dual Match" className="text-[#999999] text-xs">Dual Match</SelectItem>
                  <SelectItem value="Practice" className="text-[#999999] text-xs">Practice</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={formData.courtType || undefined}
                onValueChange={(value) => onInputChange("courtType", value)}
              >
                <SelectTrigger className="w-[160px] h-7 bg-white border-[#E5E5E5] border rounded-full text-[#999999] text-xs shadow-none [&_svg]:size-3">
                  <SelectValue placeholder="Court Type..." />
                </SelectTrigger>
                <SelectContent className="shadow-none border-[#E5E5E5] text-[#999999] text-xs">
                  <SelectItem value="Indoor Hard Court" className="text-[#999999] text-xs">Indoor Hard Court</SelectItem>
                  <SelectItem value="Outdoor Hard Court" className="text-[#999999] text-xs">Outdoor Hard Court</SelectItem>
                  <SelectItem value="Clay Court" className="text-[#999999] text-xs">Clay Court</SelectItem>
                  <SelectItem value="Grass Court" className="text-[#999999] text-xs">Grass Court</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Scoring Format */}
          <div className="space-y-3">
            <h4 className="text-[#0D0D0D] font-medium text-xs">Scoring Format</h4>
            <div className="flex flex-wrap gap-3">
              <Select
                value={formData.bestOf || undefined}
                onValueChange={(value) => onInputChange("bestOf", value)}
              >
                <SelectTrigger className="w-[130px] h-7 bg-white border-[#E5E5E5] border rounded-full text-[#999999] text-xs shadow-none [&_svg]:size-3">
                  <SelectValue placeholder="Best of..." />
                </SelectTrigger>
                <SelectContent className="shadow-none border-[#E5E5E5] text-[#999999] text-xs">
                  <SelectItem value="1" className="text-[#999999] text-xs">Best of 1 Set</SelectItem>
                  <SelectItem value="3" className="text-[#999999] text-xs">Best of 3 Sets</SelectItem>
                  <SelectItem value="5" className="text-[#999999] text-xs">Best of 5 Sets</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={formData.adScoring === undefined ? undefined : (formData.adScoring ? "ad" : "no-ad")}
                onValueChange={(value) => onInputChange("adScoring", value === "ad")}
              >
                <SelectTrigger className="w-[140px] h-7 bg-white border-[#E5E5E5] border rounded-full text-[#999999] text-xs shadow-none [&_svg]:size-3">
                  <SelectValue placeholder="Ad Scoring..." />
                </SelectTrigger>
                <SelectContent className="shadow-none border-[#E5E5E5] text-[#999999] text-xs">
                  <SelectItem value="ad" className="text-[#999999] text-xs">Ad Scoring</SelectItem>
                  <SelectItem value="no-ad" className="text-[#999999] text-xs">No-Ad Scoring</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={formData.playOnLets === undefined ? undefined : (formData.playOnLets ? "play-on" : "lets")}
                onValueChange={(value) => onInputChange("playOnLets", value === "play-on")}
              >
                <SelectTrigger className="w-[130px] h-7 bg-white border-[#E5E5E5] border rounded-full text-[#999999] text-xs shadow-none [&_svg]:size-3">
                  <SelectValue placeholder="Lets..." />
                </SelectTrigger>
                <SelectContent className="shadow-none border-[#E5E5E5] text-[#999999] text-xs">
                  <SelectItem value="lets" className="text-[#999999] text-xs">Lets</SelectItem>
                  <SelectItem value="play-on" className="text-[#999999] text-xs">Play on Lets</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Match Duration */}
          <div className="space-y-3">
            <h4 className="text-[#0D0D0D] font-medium text-xs">Match Duration (Hours:Minutes)</h4>
            <Input
              type="text"
              placeholder="-:--"
              value={formatDuration(formData.duration)}
              onChange={(e) => {
                const displayValue = e.target.value;
                if (displayValue === "" || displayValue === "-") {
                  onInputChange("duration", 0);
                } else {
                  const seconds = parseDuration(displayValue);
                  onInputChange("duration", seconds);
                }
              }}
              className="w-[200px] h-7 bg-white border-[#E5E5E5] border rounded-full text-[#999999] text-xs shadow-none placeholder:text-[#999999] px-3 font-mono"
            />
          </div>
          </div>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-slideDown {
          animation: slideDown 300ms ease-out;
        }
      `}</style>
    </div>
  );
}