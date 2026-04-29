"use client";

/**
 * DetailsContent — Step 4
 * Match details form: names, per-set scores, result, and advanced settings.
 */

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  CircleMinus,
  CirclePlus,
  Clock,
  Sparkles,
} from "lucide-react";
import { FormData, ParsingState } from "./types";
import {
  getAdjustedScores,
  formatDuration,
  parseDuration,
  validateSetScore,
  deriveOutcome,
  setHasData,
} from "./utils";

export interface DetailsContentProps {
  formData: FormData;
  onInputChange: (field: keyof FormData, value: string | number | boolean) => void;
  onScoreChange: (player: "player" | "opponent", index: number, value: string) => void;
  onTiebreakChange?: (player: "player" | "opponent", index: number, value: string) => void;
  parsingState?: ParsingState;
}

function getInitials(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(" ");
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function needsTiebreak(p: number | null, o: number | null): boolean {
  if (p === null || o === null) return false;
  return (p === 7 && o === 6) || (p === 6 && o === 7);
}

const inputCls =
  "h-7 bg-white border-[#EAECF0] border rounded-[6px] text-[#525252] text-xs shadow-none placeholder:text-[#888888] px-3 focus-visible:ring-1 focus-visible:ring-[#3B82F6]/40";

const selectTriggerCls =
  "h-7 bg-white border-[#EAECF0] border rounded-[6px] text-[#525252] text-xs shadow-none [&_svg]:size-3 focus-visible:ring-1 focus-visible:ring-[#3B82F6]/40";

const selectContentCls =
  "shadow-none border-[#EAECF0] text-[#525252] text-xs";

const selectItemCls = "text-[#525252] text-xs";

const sectionLabelCls =
  "text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]";

interface ScoreCellProps {
  refMap: React.MutableRefObject<Record<number, HTMLInputElement | null>>;
  keyPrefix: string;
  i: number;
  value: number | null;
  onValueChange: (v: string) => void;
  onEnterValue: (raw: string) => void;
  onEnterEmpty: () => void;
  maxLength: number;
  invalid?: boolean;
}

function ScoreCell({
  refMap,
  keyPrefix,
  i,
  value,
  onValueChange,
  onEnterValue,
  onEnterEmpty,
  maxLength,
  invalid,
}: ScoreCellProps) {
  return (
    <Input
      ref={(el) => {
        if (el) refMap.current[i] = el;
      }}
      placeholder="–"
      inputMode="numeric"
      pattern="\d*"
      maxLength={maxLength}
      aria-invalid={invalid || undefined}
      value={value === null ? "" : value}
      onChange={(e) => onValueChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        const v = e.currentTarget.value;
        if (v === "") onEnterEmpty();
        else onEnterValue(v);
      }}
      className={`!w-7 h-8 text-center text-[#0D0D0D] bg-white border rounded-[6px] px-0 shadow-none focus-visible:ring-1 placeholder:text-[#CCCCCC] tabular-nums ${
        invalid
          ? "border-[#E51837] focus-visible:ring-[#E51837]/40"
          : "border-[#EAECF0] focus-visible:ring-[#3B82F6]/40"
      } ${keyPrefix}`}
    />
  );
}

export function DetailsContent({
  formData,
  onInputChange,
  onScoreChange,
  onTiebreakChange,
  parsingState,
}: DetailsContentProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const bestOfNum = parseInt(formData.bestOf) || 3;
  const displayedSets = formData.numberOfSets ?? bestOfNum;

  const playerScores = useMemo(
    () => getAdjustedScores(formData.playerScores, formData.bestOf, formData.numberOfSets),
    [formData.playerScores, formData.bestOf, formData.numberOfSets]
  );
  const opponentScores = useMemo(
    () => getAdjustedScores(formData.opponentScores, formData.bestOf, formData.numberOfSets),
    [formData.opponentScores, formData.bestOf, formData.numberOfSets]
  );

  // Refs for keyboard-driven focus chain
  const playerScoreRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const opponentScoreRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const playerTiebreakRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const opponentTiebreakRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);

  const focusNextInput = useCallback(
    (
      currentType: "playerScore" | "opponentScore" | "playerTiebreak" | "opponentTiebreak",
      i: number
    ) => {
      const numSets = playerScores.length;
      setTimeout(() => {
        switch (currentType) {
          case "playerScore":
            opponentScoreRefs.current[i]?.focus();
            break;
          case "opponentScore":
            if (needsTiebreak(playerScores[i], opponentScores[i])) {
              playerTiebreakRefs.current[i]?.focus();
            } else if (i < numSets - 1) {
              playerScoreRefs.current[i + 1]?.focus();
            }
            break;
          case "playerTiebreak":
            opponentTiebreakRefs.current[i]?.focus();
            break;
          case "opponentTiebreak":
            if (i < numSets - 1) playerScoreRefs.current[i + 1]?.focus();
            break;
        }
      }, 0);
    },
    [playerScores, opponentScores]
  );

  const focusPreviousInput = useCallback(
    (
      currentType: "playerScore" | "opponentScore" | "playerTiebreak" | "opponentTiebreak",
      i: number
    ) => {
      setTimeout(() => {
        switch (currentType) {
          case "playerScore":
            if (i > 0) {
              if (needsTiebreak(playerScores[i - 1], opponentScores[i - 1])) {
                opponentTiebreakRefs.current[i - 1]?.focus();
              } else {
                opponentScoreRefs.current[i - 1]?.focus();
              }
            }
            break;
          case "opponentScore":
            playerScoreRefs.current[i]?.focus();
            break;
          case "playerTiebreak":
            opponentScoreRefs.current[i]?.focus();
            break;
          case "opponentTiebreak":
            playerTiebreakRefs.current[i]?.focus();
            break;
        }
      }, 0);
    },
    [playerScores, opponentScores]
  );

  const handleSetsChange = (delta: number) => {
    const newSets = Math.max(1, Math.min(bestOfNum, displayedSets + delta));
    if (newSets < displayedSets) {
      const droppedHasData = Array.from(
        { length: displayedSets - newSets },
        (_, k) => setHasData(formData, newSets + k)
      ).some(Boolean);
      if (droppedHasData) {
        const ok = window.confirm(
          `Remove set ${newSets + 1}? Any scores entered there will be cleared.`
        );
        if (!ok) return;
      }
    }
    onInputChange("numberOfSets", newSets);
  };

  const setValidations = useMemo(
    () => playerScores.map((p, i) => validateSetScore(p, opponentScores[i])),
    [playerScores, opponentScores]
  );
  const firstInvalid = setValidations.findIndex((v) => v.kind === "invalid");
  const invalidMessage =
    firstInvalid >= 0 ? setValidations[firstInvalid].message : null;

  const derivedOutcome = useMemo(
    () =>
      deriveOutcome(
        formData.playerName || "Player",
        formData.opponentName || "Opponent",
        playerScores,
        opponentScores,
        bestOfNum
      ),
    [formData.playerName, formData.opponentName, playerScores, opponentScores, bestOfNum]
  );
  useEffect(() => {
    if (derivedOutcome && !formData.result) {
      onInputChange("result", derivedOutcome);
    }
  }, [derivedOutcome, formData.result, onInputChange]);

  const outcomeMismatch =
    !!derivedOutcome &&
    !!formData.result &&
    formData.result !== derivedOutcome &&
    !formData.result.includes("Withdrew") &&
    !formData.result.includes("Defaulted") &&
    formData.result !== "Unfinished";

  const playerName = formData.playerName || "Player";
  const opponentName = formData.opponentName || "Opponent";

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
    <div className="flex flex-col gap-7">
      {/* Auto-fill pill */}
      {parsingState?.parseSuccess && (
        <div className="animate-slideDown inline-flex items-center self-start gap-1.5 pl-2 pr-2.5 py-1 bg-[rgba(59,130,246,0.06)] border border-[rgba(59,130,246,0.15)] rounded-full">
          <Sparkles className="size-3 text-[#3B82F6]" strokeWidth={1.5} />
          <span className="text-[#3B82F6] text-[12px] font-medium">
            Auto-filled from your file
          </span>
        </div>
      )}

      {/* Score block: unified players + scores + sets stepper */}
      <div className="flex flex-col gap-3">
        {/* Top row: section label (left) + stepper (right) */}
        <div className="flex items-center justify-between">
          <span className={sectionLabelCls}>Score</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSetsChange(-1)}
              disabled={displayedSets <= 1}
              aria-label="Remove a set"
              className="text-[#3B82F6] disabled:opacity-30 disabled:cursor-not-allowed hover:text-[#2563EB] transition-colors"
            >
              <CircleMinus className="h-3.5 w-3.5" />
            </button>
            <span className="w-4 text-center text-[12px] font-medium text-[#525252] tabular-nums">
              {displayedSets}
            </span>
            <button
              type="button"
              onClick={() => handleSetsChange(1)}
              disabled={displayedSets >= bestOfNum}
              aria-label="Add a set"
              className="text-[#3B82F6] disabled:opacity-30 disabled:cursor-not-allowed hover:text-[#2563EB] transition-colors"
            >
              <CirclePlus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="h-px bg-[#F3F3F3]" />

        {/* Set number headers (right, aligned with score columns) */}
        <div className="flex justify-end">
          <div className="flex gap-4">
            {playerScores.map((score, i) => {
              const hasTie = needsTiebreak(score, opponentScores[i]);
              return (
                <div key={i} className="flex items-center gap-1">
                  <div className="w-7 text-center text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[1.5px] tabular-nums">
                    {i + 1}
                  </div>
                  {hasTie && (
                    <span className="w-7 text-center text-[9px] font-medium text-[#AAAAAA] uppercase tracking-[1.2px]">
                      Tie
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Player rows */}
        <div className="space-y-3">
          {/* Player 1 */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="size-9 rounded-full bg-[#F5F5F5] flex items-center justify-center text-[12px] font-medium text-[#525252] shrink-0">
                {getInitials(playerName)}
              </div>
              <Input
                placeholder="Your name"
                value={formData.playerName}
                onChange={(e) => onInputChange("playerName", e.target.value)}
                className="w-44 h-7 bg-transparent border border-transparent rounded-[6px] text-[#0D0D0D] text-[13px] font-medium shadow-none placeholder:text-[#888888] px-2 hover:bg-[#FAFAFA] hover:border-[#F3F3F3] focus:bg-white focus:border-[#EAECF0] focus-visible:ring-0 transition-colors"
              />
              <span className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[1.5px]">You</span>
            </div>
            <div className="flex gap-4">
              {playerScores.map((score, i) => {
                const hasTie = needsTiebreak(score, opponentScores[i]);
                return (
                  <div key={i} className="flex items-center gap-1">
                    <ScoreCell
                      refMap={playerScoreRefs}
                      keyPrefix=""
                      i={i}
                      value={score}
                      maxLength={2}
                      invalid={setValidations[i]?.kind === "invalid"}
                      onValueChange={(v) => onScoreChange("player", i, v)}
                      onEnterEmpty={() => focusPreviousInput("playerScore", i)}
                      onEnterValue={(v) => {
                        if (needsTiebreak(Number(v), opponentScores[i])) {
                          setTimeout(() => playerTiebreakRefs.current[i]?.focus(), 0);
                        } else {
                          focusNextInput("playerScore", i);
                        }
                      }}
                    />
                    {hasTie && (
                      <ScoreCell
                        refMap={playerTiebreakRefs}
                        keyPrefix=""
                        i={i}
                        value={formData.playerTiebreaks[i]}
                        maxLength={3}
                        onValueChange={(v) => onTiebreakChange?.("player", i, v)}
                        onEnterEmpty={() => focusPreviousInput("playerTiebreak", i)}
                        onEnterValue={() => focusNextInput("playerTiebreak", i)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Player 2 */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="size-9 rounded-full bg-[#F5F5F5] flex items-center justify-center text-[12px] font-medium text-[#525252] shrink-0">
                {getInitials(opponentName)}
              </div>
              <Input
                placeholder="Opponent name"
                value={formData.opponentName}
                onChange={(e) => onInputChange("opponentName", e.target.value)}
                className="w-44 h-7 bg-transparent border border-transparent rounded-[6px] text-[#0D0D0D] text-[13px] font-medium shadow-none placeholder:text-[#888888] px-2 hover:bg-[#FAFAFA] hover:border-[#F3F3F3] focus:bg-white focus:border-[#EAECF0] focus-visible:ring-0 transition-colors"
              />
            </div>
            <div className="flex gap-4">
              {opponentScores.map((score, i) => {
                const hasTie = needsTiebreak(playerScores[i], score);
                return (
                  <div key={i} className="flex items-center gap-1">
                    <ScoreCell
                      refMap={opponentScoreRefs}
                      keyPrefix=""
                      i={i}
                      value={score}
                      maxLength={2}
                      invalid={setValidations[i]?.kind === "invalid"}
                      onValueChange={(v) => onScoreChange("opponent", i, v)}
                      onEnterEmpty={() => focusPreviousInput("opponentScore", i)}
                      onEnterValue={(v) => {
                        if (needsTiebreak(playerScores[i], Number(v))) {
                          setTimeout(() => playerTiebreakRefs.current[i]?.focus(), 0);
                        } else {
                          focusNextInput("opponentScore", i);
                        }
                      }}
                    />
                    {hasTie && (
                      <ScoreCell
                        refMap={opponentTiebreakRefs}
                        keyPrefix=""
                        i={i}
                        value={formData.opponentTiebreaks[i]}
                        maxLength={3}
                        onValueChange={(v) => onTiebreakChange?.("opponent", i, v)}
                        onEnterEmpty={() => focusPreviousInput("opponentTiebreak", i)}
                        onEnterValue={() => focusNextInput("opponentTiebreak", i)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {invalidMessage && (
          <div className="inline-flex items-center self-start gap-1.5 pl-2 pr-2.5 py-1 bg-[rgba(229,24,55,0.06)] border border-[rgba(229,24,55,0.18)] rounded-full">
            <AlertCircle className="size-3 text-[#E51837]" strokeWidth={1.75} />
            <span className="text-[#E51837] text-[12px] font-medium">
              Set {firstInvalid + 1}: {invalidMessage}
            </span>
          </div>
        )}
      </div>

      {/* Result */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1.5">
          <span className={sectionLabelCls}>Outcome</span>
          <Select
            value={formData.result || undefined}
            onValueChange={(v) => onInputChange("result", v)}
          >
            <SelectTrigger className={`w-[200px] ${selectTriggerCls}`}>
              <SelectValue placeholder="Final score" />
            </SelectTrigger>
            <SelectContent className={selectContentCls}>
              {resultOptions.map((o) => (
                <SelectItem key={o.value} value={o.value} className={selectItemCls}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {outcomeMismatch && derivedOutcome && (
            <button
              type="button"
              onClick={() => onInputChange("result", derivedOutcome)}
              className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 bg-[rgba(229,24,55,0.06)] border border-[rgba(229,24,55,0.18)] rounded-full hover:bg-[rgba(229,24,55,0.1)] transition-colors self-start"
            >
              <AlertCircle className="size-3 text-[#E51837]" strokeWidth={1.75} />
              <span className="text-[#E51837] text-[12px] font-medium">
                Scores show {derivedOutcome} — fix
              </span>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-[12px] text-[#888888] hover:text-[#525252] transition-colors self-end pb-1.5"
        >
          <span className="underline underline-offset-2">
            {showAdvanced ? "Hide advanced" : "Advanced settings"}
          </span>
          <ChevronDown
            className={`h-3 w-3 transition-transform duration-300 ${showAdvanced ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {/* Advanced Settings */}
      <div
        className={`grid transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] ${
          showAdvanced ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-6 pt-2">
            {/* Event Information */}
            <div className="space-y-3">
              <h4 className={sectionLabelCls}>Event</h4>
              <div className="flex flex-wrap gap-2.5">
                <Input
                  placeholder="Event name"
                  value={formData.eventName}
                  onChange={(e) => onInputChange("eventName", e.target.value)}
                  className={`w-[220px] ${inputCls}`}
                />
                <Select
                  value={formData.round || undefined}
                  onValueChange={(v) => onInputChange("round", v)}
                >
                  <SelectTrigger className={`w-[140px] ${selectTriggerCls}`}>
                    <SelectValue placeholder="Round" />
                  </SelectTrigger>
                  <SelectContent className={selectContentCls}>
                    <SelectItem value="None" className={selectItemCls}>None</SelectItem>
                    <SelectItem value="Round of 128" className={selectItemCls}>Round of 128</SelectItem>
                    <SelectItem value="Round of 64" className={selectItemCls}>Round of 64</SelectItem>
                    <SelectItem value="Round of 32" className={selectItemCls}>Round of 32</SelectItem>
                    <SelectItem value="Round of 16" className={selectItemCls}>Round of 16</SelectItem>
                    <SelectItem value="Quarterfinals" className={selectItemCls}>Quarterfinals</SelectItem>
                    <SelectItem value="Semifinals" className={selectItemCls}>Semifinals</SelectItem>
                    <SelectItem value="Finals" className={selectItemCls}>Finals</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={formData.matchType || undefined}
                  onValueChange={(v) => onInputChange("matchType", v)}
                >
                  <SelectTrigger className={`w-[140px] ${selectTriggerCls}`}>
                    <SelectValue placeholder="Match type" />
                  </SelectTrigger>
                  <SelectContent className={selectContentCls}>
                    <SelectItem value="None" className={selectItemCls}>None</SelectItem>
                    <SelectItem value="Tournament" className={selectItemCls}>Tournament</SelectItem>
                    <SelectItem value="Dual Match" className={selectItemCls}>Dual Match</SelectItem>
                    <SelectItem value="Practice" className={selectItemCls}>Practice</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* When & Where */}
            <div className="space-y-3">
              <h4 className={sectionLabelCls}>When &amp; Where</h4>
              <div className="flex flex-wrap gap-2.5">
                <div
                  className="relative cursor-pointer"
                  onClick={() => dateInputRef.current?.showPicker()}
                >
                  <Input
                    ref={dateInputRef}
                    type="date"
                    value={formData.date}
                    onChange={(e) => onInputChange("date", e.target.value)}
                    className={`w-[150px] pr-8 ${inputCls} [&::-webkit-calendar-picker-indicator]:hidden`}
                  />
                  <Calendar className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-3 text-[#888888]" />
                </div>
                <div
                  className="relative cursor-pointer"
                  onClick={() => timeInputRef.current?.showPicker()}
                >
                  <Input
                    ref={timeInputRef}
                    type="time"
                    value={formData.time}
                    onChange={(e) => onInputChange("time", e.target.value)}
                    className={`w-[120px] pr-8 ${inputCls} [&::-webkit-calendar-picker-indicator]:hidden`}
                  />
                  <Clock className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-3 text-[#888888]" />
                </div>
                <Select
                  value={formData.courtType || undefined}
                  onValueChange={(v) => onInputChange("courtType", v)}
                >
                  <SelectTrigger className={`w-[170px] ${selectTriggerCls}`}>
                    <SelectValue placeholder="Court type" />
                  </SelectTrigger>
                  <SelectContent className={selectContentCls}>
                    <SelectItem value="None" className={selectItemCls}>None</SelectItem>
                    <SelectItem value="Indoor Hard Court" className={selectItemCls}>Indoor Hard Court</SelectItem>
                    <SelectItem value="Outdoor Hard Court" className={selectItemCls}>Outdoor Hard Court</SelectItem>
                    <SelectItem value="Clay Court" className={selectItemCls}>Clay Court</SelectItem>
                    <SelectItem value="Grass Court" className={selectItemCls}>Grass Court</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Format */}
            <div className="space-y-3">
              <h4 className={sectionLabelCls}>Format</h4>
              <div className="flex flex-wrap gap-2.5">
                <Select
                  value={formData.bestOf || undefined}
                  onValueChange={(v) => onInputChange("bestOf", v)}
                >
                  <SelectTrigger className={`w-[140px] ${selectTriggerCls}`}>
                    <SelectValue placeholder="Best of" />
                  </SelectTrigger>
                  <SelectContent className={selectContentCls}>
                    <SelectItem value="1" className={selectItemCls}>Best of 1 Set</SelectItem>
                    <SelectItem value="3" className={selectItemCls}>Best of 3 Sets</SelectItem>
                    <SelectItem value="5" className={selectItemCls}>Best of 5 Sets</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={
                    formData.adScoring === undefined
                      ? undefined
                      : formData.adScoring
                      ? "ad"
                      : "no-ad"
                  }
                  onValueChange={(v) => onInputChange("adScoring", v === "ad")}
                >
                  <SelectTrigger className={`w-[140px] ${selectTriggerCls}`}>
                    <SelectValue placeholder="Scoring" />
                  </SelectTrigger>
                  <SelectContent className={selectContentCls}>
                    <SelectItem value="ad" className={selectItemCls}>Ad scoring</SelectItem>
                    <SelectItem value="no-ad" className={selectItemCls}>No-Ad scoring</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={
                    formData.playOnLets === undefined
                      ? undefined
                      : formData.playOnLets
                      ? "play-on"
                      : "lets"
                  }
                  onValueChange={(v) => onInputChange("playOnLets", v === "play-on")}
                >
                  <SelectTrigger className={`w-[130px] ${selectTriggerCls}`}>
                    <SelectValue placeholder="Lets" />
                  </SelectTrigger>
                  <SelectContent className={selectContentCls}>
                    <SelectItem value="lets" className={selectItemCls}>Stop on lets</SelectItem>
                    <SelectItem value="play-on" className={selectItemCls}>Play on lets</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="text"
                  placeholder="Duration · h:mm"
                  value={formatDuration(formData.duration)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || v === "-") onInputChange("duration", 0);
                    else onInputChange("duration", parseDuration(v));
                  }}
                  className={`w-[140px] font-mono ${inputCls}`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
