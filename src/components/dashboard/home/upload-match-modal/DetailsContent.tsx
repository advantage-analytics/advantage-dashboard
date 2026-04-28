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
import { Calendar, ChevronDown, Clock, Minus, Plus, SquarePen, Info } from "lucide-react";
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

// Shared input/select class strings
const INPUT_CLASS =
  "h-9 rounded-[8px] border border-[#EAECF0] bg-white text-sm text-[#0D0D0D] placeholder:text-[#888] shadow-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/20 focus-visible:border-[#3B82F6]";
const SELECT_TRIGGER_CLASS =
  "h-9 rounded-[8px] border border-[#EAECF0] bg-white text-sm text-[#0D0D0D] shadow-none data-[placeholder]:text-[#888] focus:ring-2 focus:ring-[#3B82F6]/20 focus:border-[#3B82F6]";
const SELECT_CONTENT_CLASS =
  "border border-[#EAECF0] shadow-md text-sm text-[#0D0D0D]";
const SELECT_ITEM_CLASS = "text-sm text-[#0D0D0D]";
const SCORE_CHIP_CLASS =
  "!w-9 h-9 rounded-[6px] border border-[#EAECF0] bg-white text-sm font-medium text-[#0D0D0D] text-center px-0 shadow-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/20 focus-visible:border-[#3B82F6] placeholder:text-[#888]";
const SECTION_LABEL_CLASS =
  "text-xs font-medium text-[#666] uppercase tracking-wide";

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

  const bestOfNum = parseInt(formData.bestOf) || 3;
  const displayedSets = formData.numberOfSets ?? bestOfNum;

  // Get scores first (needed by focus functions)
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

  // Refs for all input fields to manage autofocus
  const playerScoreRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const opponentScoreRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const playerTiebreakRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const opponentTiebreakRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);

  // Focus management logic
  const focusNextInput = useCallback((currentType: "playerScore" | "opponentScore" | "playerTiebreak" | "opponentTiebreak", setIndex: number) => {
    const numSets = playerScores.length;

    setTimeout(() => {
      switch (currentType) {
        case "playerScore":
          if (opponentScoreRefs.current[setIndex]) {
            opponentScoreRefs.current[setIndex]?.focus();
          }
          break;

        case "opponentScore":
          const playerScore = playerScores[setIndex];
          const opponentScore = opponentScores[setIndex];

          if (needsTiebreak(playerScore, opponentScore)) {
            if (playerTiebreakRefs.current[setIndex]) {
              playerTiebreakRefs.current[setIndex]?.focus();
            }
          } else if (setIndex < numSets - 1) {
            if (playerScoreRefs.current[setIndex + 1]) {
              playerScoreRefs.current[setIndex + 1]?.focus();
            }
          }
          break;

        case "playerTiebreak":
          if (opponentTiebreakRefs.current[setIndex]) {
            opponentTiebreakRefs.current[setIndex]?.focus();
          }
          break;

        case "opponentTiebreak":
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
          if (playerScoreRefs.current[setIndex]) {
            playerScoreRefs.current[setIndex]?.focus();
          }
          break;

        case "playerTiebreak":
          if (opponentScoreRefs.current[setIndex]) {
            opponentScoreRefs.current[setIndex]?.focus();
          }
          break;

        case "opponentTiebreak":
          if (playerTiebreakRefs.current[setIndex]) {
            playerTiebreakRefs.current[setIndex]?.focus();
          }
          break;
      }
    }, 0);
  }, [playerScores, opponentScores]);

  const handleSetsChange = (delta: number) => {
    const newSets = Math.max(1, Math.min(bestOfNum, displayedSets + delta));
    onInputChange("numberOfSets", newSets);
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
    <div className="flex flex-col gap-8">
      {/* Auto-fill Banner */}
      {parsingState?.parseSuccess && (
        <div className="animate-slideDown rounded-xl bg-[#3B82F6]/[0.06] border border-[#3B82F6]/20 text-[#1D4ED8] px-4 py-3 text-sm flex items-start gap-3">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div className="flex flex-col gap-0.5">
            <p className="font-medium">Data auto-filled from file</p>
            <p className="text-[13px] text-[#1D4ED8]/80">
              Please review the information below and make any necessary corrections.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {/* Sets Configuration */}
        <div className="flex justify-between items-center">
          <span className={SECTION_LABEL_CLASS}>
            {displayedSets} {displayedSets === 1 ? "Set" : "Sets"}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleSetsChange(-1)}
              disabled={displayedSets <= 1}
              aria-label="Decrease sets"
              className="w-7 h-7 rounded-md flex items-center justify-center text-[#3B82F6] hover:bg-[#3B82F6]/10 disabled:text-[#CCC] disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleSetsChange(1)}
              disabled={displayedSets >= bestOfNum}
              aria-label="Increase sets"
              className="w-7 h-7 rounded-md flex items-center justify-center text-[#3B82F6] hover:bg-[#3B82F6]/10 disabled:text-[#CCC] disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="border-t border-[#EAECF0]" />

        {/* Player Rows with Set Headers */}
        <div className="flex flex-col gap-2">
          {/* Set Headers - mirrors the score row structure */}
          <div className="flex items-center justify-end gap-3">
            {playerScores.map((score, i) => {
              const hasTiebreak = needsTiebreak(score, opponentScores[i]);
              return (
                <div key={i} className="flex items-center gap-1">
                  <div className="w-9 text-center text-[11px] font-medium text-[#888] uppercase tracking-wide">
                    {i + 1}
                  </div>
                  {hasTiebreak && (
                    <span className="w-9 text-center text-[9px] font-medium text-[#888] uppercase tracking-wide">
                      TIE
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-3">
            {/* Player 1 */}
            <div className="flex justify-between items-center gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#F4F4F4] text-[#666] text-sm font-medium flex items-center justify-center flex-shrink-0">
                  {getInitials(playerName)}
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {editingPlayer ? (
                    <Input
                      placeholder="Enter your name..."
                      value={formData.playerName}
                      onChange={(e) => onInputChange("playerName", e.target.value)}
                      onBlur={() => setEditingPlayer(false)}
                      onKeyDown={(e) => e.key === "Enter" && setEditingPlayer(false)}
                      autoFocus
                      className={`${INPUT_CLASS} max-w-[220px] px-3`}
                    />
                  ) : (
                    <span className="text-sm font-medium text-[#0D0D0D] truncate">
                      {playerName} <span className="text-[#888] font-normal">(You)</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingPlayer(!editingPlayer)}
                    aria-label="Edit player name"
                    className="w-6 h-6 flex items-center justify-center rounded-md text-[#888] hover:text-[#0D0D0D] hover:bg-[#F4F4F4] transition-colors flex-shrink-0"
                  >
                    <SquarePen className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
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
                        className={SCORE_CHIP_CLASS}
                        maxLength={2}
                        value={score === null ? "" : score}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          onScoreChange("player", i, newValue);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const newValue = e.currentTarget.value;

                            if (newValue === "") {
                              focusPreviousInput("playerScore", i);
                            } else if (newValue.length > 0) {
                              const playerNum = Number(newValue);
                              const currentOpponentScore = opponentScores[i];

                              if (needsTiebreak(playerNum, currentOpponentScore)) {
                                setTimeout(() => {
                                  if (playerTiebreakRefs.current[i]) {
                                    playerTiebreakRefs.current[i]?.focus();
                                  }
                                }, 0);
                              } else {
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
                          className={SCORE_CHIP_CLASS}
                          value={formData.playerTiebreaks[i] === null ? "" : String(formData.playerTiebreaks[i])}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            onTiebreakChange?.("player", i, newValue);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const newValue = e.currentTarget.value;

                              if (newValue === "") {
                                focusPreviousInput("playerTiebreak", i);
                              } else if (newValue.length > 0) {
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
            <div className="flex justify-between items-center gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#F4F4F4] text-[#666] text-sm font-medium flex items-center justify-center flex-shrink-0">
                  {getInitials(opponentName)}
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {editingOpponent ? (
                    <Input
                      placeholder="Enter opponent name..."
                      value={formData.opponentName}
                      onChange={(e) => onInputChange("opponentName", e.target.value)}
                      onBlur={() => setEditingOpponent(false)}
                      onKeyDown={(e) => e.key === "Enter" && setEditingOpponent(false)}
                      autoFocus
                      className={`${INPUT_CLASS} max-w-[220px] px-3`}
                    />
                  ) : (
                    <span className="text-sm font-medium text-[#0D0D0D] truncate">
                      {opponentName}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingOpponent(!editingOpponent)}
                    aria-label="Edit opponent name"
                    className="w-6 h-6 flex items-center justify-center rounded-md text-[#888] hover:text-[#0D0D0D] hover:bg-[#F4F4F4] transition-colors flex-shrink-0"
                  >
                    <SquarePen className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
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
                        className={SCORE_CHIP_CLASS}
                        maxLength={2}
                        value={score === null ? "" : score}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          onScoreChange("opponent", i, newValue);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const newValue = e.currentTarget.value;

                            if (newValue === "") {
                              focusPreviousInput("opponentScore", i);
                            } else if (newValue.length > 0) {
                              const opponentNum = Number(newValue);
                              const currentPlayerScore = playerScores[i];

                              if (needsTiebreak(currentPlayerScore, opponentNum)) {
                                setTimeout(() => {
                                  if (playerTiebreakRefs.current[i]) {
                                    playerTiebreakRefs.current[i]?.focus();
                                  }
                                }, 0);
                              } else {
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
                          className={SCORE_CHIP_CLASS}
                          value={formData.opponentTiebreaks[i] === null ? "" : String(formData.opponentTiebreaks[i])}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            onTiebreakChange?.("opponent", i, newValue);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const newValue = e.currentTarget.value;

                              if (newValue === "") {
                                focusPreviousInput("opponentTiebreak", i);
                              } else if (newValue.length > 0) {
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
      <div className="flex flex-col gap-2">
        <span className={SECTION_LABEL_CLASS}>Result</span>
        <Select
          value={formData.result || undefined}
          onValueChange={(value) => onInputChange("result", value)}
        >
          <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-[220px]`}>
            <SelectValue placeholder="Select Result..." />
          </SelectTrigger>
          <SelectContent className={SELECT_CONTENT_CLASS}>
            {resultOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} className={SELECT_ITEM_CLASS}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Advanced Settings disclosure */}
      <div className="flex flex-col">
        <div className="border-t border-[#EAECF0]" />
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
          className="flex items-center justify-between py-3 text-left group"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-[#0D0D0D]">
              Advanced Settings
            </span>
            <span className="text-xs text-[#888]">
              Optional event, scoring, and duration details
            </span>
          </div>
          <ChevronDown
            className="h-4 w-4 text-[#666] group-hover:text-[#0D0D0D] transition-transform"
            style={{
              transform: showAdvanced ? "rotate(180deg)" : "rotate(0deg)",
              transitionDuration: "300ms",
              transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            }}
          />
        </button>

        {/* Advanced Settings Section */}
        <div
          className={`grid transition-all duration-300 ${
            showAdvanced ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
          style={{ transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)" }}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-6 pt-2 pb-1">
              {/* Event Information */}
              <div className="flex flex-col gap-3">
                <h4 className={SECTION_LABEL_CLASS}>Event Information</h4>
                <div className="flex flex-wrap gap-3">
                  <Input
                    placeholder="Type Event Name..."
                    value={formData.eventName}
                    onChange={(e) => onInputChange("eventName", e.target.value)}
                    className={`${INPUT_CLASS} w-[220px] px-3`}
                  />
                  <Select
                    value={formData.round || undefined}
                    onValueChange={(value) => onInputChange("round", value)}
                  >
                    <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-[150px]`}>
                      <SelectValue placeholder="Round of..." />
                    </SelectTrigger>
                    <SelectContent className={SELECT_CONTENT_CLASS}>
                      <SelectItem value="None" className={SELECT_ITEM_CLASS}>None</SelectItem>
                      <SelectItem value="Round of 128" className={SELECT_ITEM_CLASS}>Round of 128</SelectItem>
                      <SelectItem value="Round of 64" className={SELECT_ITEM_CLASS}>Round of 64</SelectItem>
                      <SelectItem value="Round of 32" className={SELECT_ITEM_CLASS}>Round of 32</SelectItem>
                      <SelectItem value="Round of 16" className={SELECT_ITEM_CLASS}>Round of 16</SelectItem>
                      <SelectItem value="Quarterfinals" className={SELECT_ITEM_CLASS}>Quarterfinals</SelectItem>
                      <SelectItem value="Semifinals" className={SELECT_ITEM_CLASS}>Semifinals</SelectItem>
                      <SelectItem value="Finals" className={SELECT_ITEM_CLASS}>Finals</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-3">
                  <div
                    className="relative w-fit cursor-pointer"
                    onClick={() => dateInputRef.current?.showPicker()}
                  >
                    <Input
                      ref={dateInputRef}
                      type="date"
                      value={formData.date}
                      onChange={(e) => onInputChange("date", e.target.value)}
                      className={`${INPUT_CLASS} w-auto pl-3 pr-9 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-datetime-edit]:p-0 [&::-webkit-datetime-edit-fields-wrapper]:p-0`}
                    />
                    <Calendar className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-[#888]" />
                  </div>
                  <div
                    className="relative w-fit cursor-pointer"
                    onClick={() => timeInputRef.current?.showPicker()}
                  >
                    <Input
                      ref={timeInputRef}
                      type="time"
                      value={formData.time}
                      onChange={(e) => onInputChange("time", e.target.value)}
                      className={`${INPUT_CLASS} w-auto pl-3 pr-9 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-datetime-edit]:p-0 [&::-webkit-datetime-edit-fields-wrapper]:p-0`}
                    />
                    <Clock className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-[#888]" />
                  </div>
                  <Select
                    value={formData.matchType || undefined}
                    onValueChange={(value) => onInputChange("matchType", value)}
                  >
                    <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-[150px]`}>
                      <SelectValue placeholder="Match Type..." />
                    </SelectTrigger>
                    <SelectContent className={SELECT_CONTENT_CLASS}>
                      <SelectItem value="None" className={SELECT_ITEM_CLASS}>None</SelectItem>
                      <SelectItem value="Tournament" className={SELECT_ITEM_CLASS}>Tournament</SelectItem>
                      <SelectItem value="Dual Match" className={SELECT_ITEM_CLASS}>Dual Match</SelectItem>
                      <SelectItem value="Practice" className={SELECT_ITEM_CLASS}>Practice</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={formData.courtType || undefined}
                    onValueChange={(value) => onInputChange("courtType", value)}
                  >
                    <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-[180px]`}>
                      <SelectValue placeholder="Court Type..." />
                    </SelectTrigger>
                    <SelectContent className={SELECT_CONTENT_CLASS}>
                      <SelectItem value="None" className={SELECT_ITEM_CLASS}>None</SelectItem>
                      <SelectItem value="Indoor Hard Court" className={SELECT_ITEM_CLASS}>Indoor Hard Court</SelectItem>
                      <SelectItem value="Outdoor Hard Court" className={SELECT_ITEM_CLASS}>Outdoor Hard Court</SelectItem>
                      <SelectItem value="Clay Court" className={SELECT_ITEM_CLASS}>Clay Court</SelectItem>
                      <SelectItem value="Grass Court" className={SELECT_ITEM_CLASS}>Grass Court</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Scoring Format */}
              <div className="flex flex-col gap-3">
                <h4 className={SECTION_LABEL_CLASS}>Scoring Format</h4>
                <div className="flex flex-wrap gap-3">
                  <Select
                    value={formData.bestOf || undefined}
                    onValueChange={(value) => onInputChange("bestOf", value)}
                  >
                    <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-[150px]`}>
                      <SelectValue placeholder="Best of..." />
                    </SelectTrigger>
                    <SelectContent className={SELECT_CONTENT_CLASS}>
                      <SelectItem value="1" className={SELECT_ITEM_CLASS}>Best of 1 Set</SelectItem>
                      <SelectItem value="3" className={SELECT_ITEM_CLASS}>Best of 3 Sets</SelectItem>
                      <SelectItem value="5" className={SELECT_ITEM_CLASS}>Best of 5 Sets</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={formData.adScoring === undefined ? undefined : (formData.adScoring ? "ad" : "no-ad")}
                    onValueChange={(value) => onInputChange("adScoring", value === "ad")}
                  >
                    <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-[160px]`}>
                      <SelectValue placeholder="Ad Scoring..." />
                    </SelectTrigger>
                    <SelectContent className={SELECT_CONTENT_CLASS}>
                      <SelectItem value="ad" className={SELECT_ITEM_CLASS}>Ad Scoring</SelectItem>
                      <SelectItem value="no-ad" className={SELECT_ITEM_CLASS}>No-Ad Scoring</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={formData.playOnLets === undefined ? undefined : (formData.playOnLets ? "play-on" : "lets")}
                    onValueChange={(value) => onInputChange("playOnLets", value === "play-on")}
                  >
                    <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-[150px]`}>
                      <SelectValue placeholder="Lets..." />
                    </SelectTrigger>
                    <SelectContent className={SELECT_CONTENT_CLASS}>
                      <SelectItem value="lets" className={SELECT_ITEM_CLASS}>Lets</SelectItem>
                      <SelectItem value="play-on" className={SELECT_ITEM_CLASS}>Play on Lets</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Match Duration */}
              <div className="flex flex-col gap-3">
                <h4 className={SECTION_LABEL_CLASS}>Match Duration (Hours:Minutes)</h4>
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
                  className={`${INPUT_CLASS} w-[220px] px-3 font-mono`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
