"use client";

/**
 * DetailsContent — Match step body.
 * Match name (required) → Players (name + hand + backhand) → Score → Outcome → Event/When/Format.
 */

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  ChevronDown,
  CircleMinus,
  CirclePlus,
  Plus,
} from "lucide-react";
import { FormData } from "./types";
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
  onInputChange: (field: keyof FormData, value: string | number | boolean | undefined) => void;
  onScoreChange: (player: "player" | "opponent", index: number, value: string) => void;
  onTiebreakChange?: (player: "player" | "opponent", index: number, value: string) => void;
}

function needsTiebreak(p: number | null, o: number | null): boolean {
  if (p === null || o === null) return false;
  return (p === 7 && o === 6) || (p === 6 && o === 7);
}

const sectionLabelCls =
  "text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]";

// Auth-style underline field — matches src/components/auth/form-field.tsx.
// No visible labels in Match Details — placeholders + section heading carry context.
const fieldControlCls =
  "w-full appearance-none bg-transparent text-[14px] text-[#0D0D0D] outline-none placeholder:text-[#888888] [&:invalid]:text-[#888888]";

const fieldRuleCls =
  "h-[1px] w-full bg-[#F3F3F3] transition-all duration-300 group-focus-within:h-[2px] group-focus-within:bg-[#3B82F6]";

// Chevron for native <select> — gives them visible affordance.
function SelectChevron() {
  return (
    <ChevronDown
      aria-hidden="true"
      className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 size-3 text-[#AAAAAA]"
      strokeWidth={1.75}
    />
  );
}

type Hand = "right" | "left";
type Backhand = "one-handed" | "two-handed";

const cycleHand = (v: Hand | undefined): Hand | undefined => {
  if (v === undefined) return "right";
  if (v === "right") return "left";
  return undefined;
};
const cycleBackhand = (v: Backhand | undefined): Backhand | undefined => {
  if (v === undefined) return "two-handed";
  if (v === "two-handed") return "one-handed";
  return undefined;
};
const handLabel = (v: Hand | undefined) =>
  v === "right" ? "Right" : v === "left" ? "Left" : null;
const backhandLabel = (v: Backhand | undefined) =>
  v === "two-handed" ? "2-handed" : v === "one-handed" ? "1-handed" : null;

interface ScoreCellProps {
  refMap: React.MutableRefObject<Record<number, HTMLInputElement | null>>;
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
      }`}
    />
  );
}

export function DetailsContent({
  formData,
  onInputChange,
  onScoreChange,
  onTiebreakChange,
}: DetailsContentProps) {
  const [outcomeOverride, setOutcomeOverride] = useState(false);
  const [eventNameTouched, setEventNameTouched] = useState(false);
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(
    formData.adScoring !== undefined || formData.playOnLets !== undefined
  );
  const eventNameMissing = !formData.eventName.trim();
  const eventNameError = eventNameTouched && eventNameMissing;

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

  const resultOptions = [
    { value: `${formData.playerName || "Player"} Wins`, label: `${formData.playerName || "Player"} Wins` },
    { value: `${formData.opponentName || "Opponent"} Wins`, label: `${formData.opponentName || "Opponent"} Wins` },
    { value: `${formData.playerName || "Player"} Withdrew`, label: `${formData.playerName || "Player"} Withdrew` },
    { value: `${formData.opponentName || "Opponent"} Withdrew`, label: `${formData.opponentName || "Opponent"} Withdrew` },
    { value: `${formData.playerName || "Player"} Defaulted`, label: `${formData.playerName || "Player"} Defaulted` },
    { value: `${formData.opponentName || "Opponent"} Defaulted`, label: `${formData.opponentName || "Opponent"} Defaulted` },
    { value: "Unfinished", label: "Unfinished" },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Match name — primary required field, underline-style */}
      <div className="group flex flex-col gap-1.5 max-w-[480px]">
        <div className="flex w-full items-center pb-2">
          <input
            placeholder="e.g. Fall Invitational · Round of 16"
            value={formData.eventName}
            onChange={(e) => onInputChange("eventName", e.target.value)}
            onBlur={() => setEventNameTouched(true)}
            aria-invalid={eventNameError || undefined}
            aria-required="true"
            className="w-full bg-transparent text-[18px] font-medium tracking-[-0.3px] text-[#0D0D0D] outline-none placeholder:text-[#CCCCCC] placeholder:font-normal"
          />
        </div>
        <div
          className={
            eventNameError
              ? "h-[1px] w-full bg-[#E51837]"
              : "h-[1px] w-full bg-[#F3F3F3] transition-all duration-300 group-focus-within:h-[2px] group-focus-within:bg-[#3B82F6]"
          }
        />
        {eventNameError && (
          <span className="text-[11px] text-[#E51837]">
            Add a name so this match is easy to find later.
          </span>
        )}
      </div>

      {/* Score — editorial scoreboard */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={sectionLabelCls}>Score</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleSetsChange(-1)}
              disabled={displayedSets <= 1}
              aria-label="Remove a set"
              aria-controls="scoreboard-frame"
              className="size-7 flex items-center justify-center rounded-full text-[#3B82F6] hover:text-[#2563EB] hover:bg-[#F5F5F5] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
            >
              <CircleMinus className="size-3.5" strokeWidth={1.75} />
            </button>
            <span className="w-4 text-center text-[12px] font-medium text-[#525252] tabular-nums">
              {displayedSets}
            </span>
            <button
              type="button"
              onClick={() => handleSetsChange(1)}
              disabled={displayedSets >= bestOfNum}
              aria-label="Add a set"
              aria-controls="scoreboard-frame"
              className="size-7 flex items-center justify-center rounded-full text-[#3B82F6] hover:text-[#2563EB] hover:bg-[#F5F5F5] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
            >
              <CirclePlus className="size-3.5" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Scoreboard frame */}
        <div id="scoreboard-frame" className="flex flex-col border-y border-[#F3F3F3] py-4">
          {/* Set headers */}
          <div className="flex justify-end pb-2">
            <div className="flex gap-4">
              {playerScores.map((score, i) => {
                const hasTie = needsTiebreak(score, opponentScores[i]);
                return (
                  <div key={i} className="flex items-center gap-1">
                    <div className="w-7 text-center text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2.5px] tabular-nums">
                      {i + 1}
                    </div>
                    {hasTie && (
                      <span className="w-7 text-center text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[1px]">
                        Tie
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {/* Player 1 row */}
            <div className="flex justify-between items-center gap-4">
              <div className="group/name flex flex-col flex-1 min-w-0 max-w-[260px]">
                <input
                  placeholder="Your name"
                  value={formData.playerName}
                  onChange={(e) => onInputChange("playerName", e.target.value)}
                  className="w-full bg-transparent text-[16px] font-normal tracking-[-0.4px] text-[#0D0D0D] outline-none placeholder:text-[#888888] placeholder:font-normal pb-1.5"
                />
                <div className="h-[1px] w-full bg-[#F3F3F3] transition-all duration-300 group-focus-within/name:h-[2px] group-focus-within/name:bg-[#3B82F6]" />
                <div className="flex items-center gap-1 mt-1.5 -ml-1.5">
                  <button
                    type="button"
                    onClick={() => onInputChange("playerHand", cycleHand(formData.playerHand))}
                    aria-label="Cycle dominant hand"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-normal text-[#888888] hover:text-[#0D0D0D] hover:bg-[#F5F5F5] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
                  >
                    <span>{handLabel(formData.playerHand) ?? "Set hand"}</span>
                    <ChevronDown className="size-3 text-[#CCCCCC]" strokeWidth={1.5} />
                  </button>
                  <span className="text-[#CCCCCC] text-[11px]">·</span>
                  <button
                    type="button"
                    onClick={() => onInputChange("playerBackhand", cycleBackhand(formData.playerBackhand))}
                    aria-label="Cycle backhand style"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-normal text-[#888888] hover:text-[#0D0D0D] hover:bg-[#F5F5F5] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
                  >
                    <span>{backhandLabel(formData.playerBackhand) ?? "Set backhand"}</span>
                    <ChevronDown className="size-3 text-[#CCCCCC]" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
              <div className="flex gap-4">
                {playerScores.map((score, i) => {
                  const hasTie = needsTiebreak(score, opponentScores[i]);
                  return (
                    <div key={i} className="flex items-center gap-1">
                      <ScoreCell
                        refMap={playerScoreRefs}
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

            {/* Player 2 row */}
            <div className="flex justify-between items-center gap-4">
              <div className="group/name flex flex-col flex-1 min-w-0 max-w-[260px]">
                <input
                  placeholder="Opponent name"
                  value={formData.opponentName}
                  onChange={(e) => onInputChange("opponentName", e.target.value)}
                  className="w-full bg-transparent text-[16px] font-normal tracking-[-0.4px] text-[#0D0D0D] outline-none placeholder:text-[#888888] placeholder:font-normal pb-1.5"
                />
                <div className="h-[1px] w-full bg-[#F3F3F3] transition-all duration-300 group-focus-within/name:h-[2px] group-focus-within/name:bg-[#3B82F6]" />
                <div className="flex items-center gap-1 mt-1.5 -ml-1.5">
                  <button
                    type="button"
                    onClick={() => onInputChange("opponentHand", cycleHand(formData.opponentHand))}
                    aria-label="Cycle opponent dominant hand"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-normal text-[#888888] hover:text-[#0D0D0D] hover:bg-[#F5F5F5] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
                  >
                    <span>{handLabel(formData.opponentHand) ?? "Set hand"}</span>
                    <ChevronDown className="size-3 text-[#CCCCCC]" strokeWidth={1.5} />
                  </button>
                  <span className="text-[#CCCCCC] text-[11px]">·</span>
                  <button
                    type="button"
                    onClick={() => onInputChange("opponentBackhand", cycleBackhand(formData.opponentBackhand))}
                    aria-label="Cycle opponent backhand style"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-normal text-[#888888] hover:text-[#0D0D0D] hover:bg-[#F5F5F5] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
                  >
                    <span>{backhandLabel(formData.opponentBackhand) ?? "Set backhand"}</span>
                    <ChevronDown className="size-3 text-[#CCCCCC]" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
              <div className="flex gap-4">
                {opponentScores.map((score, i) => {
                  const hasTie = needsTiebreak(playerScores[i], score);
                  return (
                    <div key={i} className="flex items-center gap-1">
                      <ScoreCell
                        refMap={opponentScoreRefs}
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

          {/* Outcome — anchored inside scoreboard as footer */}
          {(() => {
            const derivedAndAccepted =
              !!derivedOutcome &&
              !outcomeOverride &&
              formData.result === derivedOutcome;
            return (
              <div className="mt-3 pt-3 border-t border-[#F3F3F3]">
                {derivedAndAccepted ? (
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-medium text-[#0D0D0D] tracking-[-0.1px]">
                      {derivedOutcome}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOutcomeOverride(true)}
                      className="text-[11px] text-[#888888] hover:text-[#525252] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-sm"
                    >
                      Override
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-[6px]">
                    <div className="group flex flex-col gap-[6px]">
                      <div className="relative pb-[10px]">
                        <select
                          aria-label="Match outcome"
                          value={formData.result || ""}
                          onChange={(e) => onInputChange("result", e.target.value)}
                          required
                          className={`${fieldControlCls} pr-5`}
                        >
                          <option value="" disabled>
                            Outcome
                          </option>
                          {resultOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <SelectChevron />
                      </div>
                      <div className={fieldRuleCls} />
                    </div>
                    {outcomeMismatch && derivedOutcome && (
                      <button
                        type="button"
                        onClick={() => {
                          onInputChange("result", derivedOutcome);
                          setOutcomeOverride(false);
                        }}
                        className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 bg-[#F3F3F3] border border-[#EAECF0] rounded-full hover:bg-[#EAECF0] transition-colors self-start"
                      >
                        <AlertCircle className="size-3 text-[#525252]" strokeWidth={1.75} />
                        <span className="text-[#525252] text-[12px] font-medium">
                          Use {derivedOutcome}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
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

      {/* Match details — auth-style underline pairs */}
      <div className="flex flex-col gap-5">
        <h4 className={sectionLabelCls}>Match details</h4>

        <div className="flex flex-col gap-5">
          {/* Round · Match type */}
          <div className="flex flex-wrap gap-x-[16px] gap-y-5">
            <div className="group flex flex-1 min-w-[160px] flex-col gap-[6px]">
              <div className="relative pb-[10px]">
                <select
                  aria-label="Round"
                  value={formData.round || ""}
                  onChange={(e) => onInputChange("round", e.target.value)}
                  className={`${fieldControlCls} pr-5`}
                >
                  <option value="" disabled>
                    Round
                  </option>
                  <option value="None">None</option>
                  <option value="Round of 128">Round of 128</option>
                  <option value="Round of 64">Round of 64</option>
                  <option value="Round of 32">Round of 32</option>
                  <option value="Round of 16">Round of 16</option>
                  <option value="Quarterfinals">Quarterfinals</option>
                  <option value="Semifinals">Semifinals</option>
                  <option value="Finals">Finals</option>
                </select>
                <SelectChevron />
              </div>
              <div className={fieldRuleCls} />
            </div>
            <div className="group flex flex-1 min-w-[160px] flex-col gap-[6px]">
              <div className="relative pb-[10px]">
                <select
                  aria-label="Match type"
                  value={formData.matchType || ""}
                  onChange={(e) => onInputChange("matchType", e.target.value)}
                  className={`${fieldControlCls} pr-5`}
                >
                  <option value="" disabled>
                    Match type
                  </option>
                  <option value="None">None</option>
                  <option value="Tournament">Tournament</option>
                  <option value="Dual Match">Dual Match</option>
                  <option value="Practice">Practice</option>
                </select>
                <SelectChevron />
              </div>
              <div className={fieldRuleCls} />
            </div>
          </div>

          {/* Date · Time · Duration — packed 3-up, wrap on narrow */}
          <div className="flex flex-wrap gap-x-[16px] gap-y-5">
            <div className="group flex w-[160px] flex-col gap-[6px]">
              <div className="pb-[10px]">
                <input
                  type="date"
                  aria-label="Date"
                  value={formData.date}
                  onChange={(e) => onInputChange("date", e.target.value)}
                  className={fieldControlCls}
                />
              </div>
              <div className={fieldRuleCls} />
            </div>
            <div className="group flex w-[120px] flex-col gap-[6px]">
              <div className="pb-[10px]">
                <input
                  type="time"
                  aria-label="Time"
                  value={formData.time}
                  onChange={(e) => onInputChange("time", e.target.value)}
                  className={fieldControlCls}
                />
              </div>
              <div className={fieldRuleCls} />
            </div>
            <div className="group flex flex-1 min-w-[140px] flex-col gap-[6px]">
              <div className="pb-[10px]">
                <input
                  type="text"
                  aria-label="Duration"
                  placeholder="Duration · e.g. 1:32"
                  value={formatDuration(formData.duration)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || v === "-") onInputChange("duration", 0);
                    else onInputChange("duration", parseDuration(v));
                  }}
                  className={`${fieldControlCls} tabular-nums`}
                />
              </div>
              <div className={fieldRuleCls} />
            </div>
          </div>

          {/* Court · Best of */}
          <div className="flex flex-wrap gap-x-[16px] gap-y-5">
            <div className="group flex flex-1 min-w-[160px] flex-col gap-[6px]">
              <div className="relative pb-[10px]">
                <select
                  aria-label="Court type"
                  value={formData.courtType || ""}
                  onChange={(e) => onInputChange("courtType", e.target.value)}
                  className={`${fieldControlCls} pr-5`}
                >
                  <option value="" disabled>
                    Court type
                  </option>
                  <option value="None">None</option>
                  <option value="Indoor Hard Court">Indoor Hard Court</option>
                  <option value="Outdoor Hard Court">Outdoor Hard Court</option>
                  <option value="Clay Court">Clay Court</option>
                  <option value="Grass Court">Grass Court</option>
                </select>
                <SelectChevron />
              </div>
              <div className={fieldRuleCls} />
            </div>
            <div className="group flex flex-1 min-w-[160px] flex-col gap-[6px]">
              <div className="relative pb-[10px]">
                <select
                  aria-label="Match format"
                  value={formData.bestOf || ""}
                  onChange={(e) => onInputChange("bestOf", e.target.value)}
                  className={`${fieldControlCls} pr-5`}
                >
                  <option value="" disabled>
                    Match format
                  </option>
                  <option value="1">Best of 1 Set</option>
                  <option value="3">Best of 3 Sets</option>
                  <option value="5">Best of 5 Sets</option>
                </select>
                <SelectChevron />
              </div>
              <div className={fieldRuleCls} />
            </div>
          </div>

          {/* Advanced (Scoring · Lets) — disclosed on demand */}
          {showAdvancedDetails ? (
            <div className="flex flex-wrap gap-x-[16px] gap-y-5">
              <div className="group flex flex-1 min-w-[160px] flex-col gap-[6px]">
                <div className="relative pb-[10px]">
                  <select
                    aria-label="Scoring"
                    value={
                      formData.adScoring === undefined
                        ? ""
                        : formData.adScoring
                        ? "ad"
                        : "no-ad"
                    }
                    onChange={(e) => onInputChange("adScoring", e.target.value === "ad")}
                    className={`${fieldControlCls} pr-5`}
                  >
                    <option value="" disabled>
                      Scoring
                    </option>
                    <option value="ad">Ad scoring</option>
                    <option value="no-ad">No-Ad scoring</option>
                  </select>
                  <SelectChevron />
                </div>
                <div className={fieldRuleCls} />
              </div>
              <div className="group flex flex-1 min-w-[160px] flex-col gap-[6px]">
                <div className="relative pb-[10px]">
                  <select
                    aria-label="Lets rule"
                    value={
                      formData.playOnLets === undefined
                        ? ""
                        : formData.playOnLets
                        ? "play-on"
                        : "lets"
                    }
                    onChange={(e) => onInputChange("playOnLets", e.target.value === "play-on")}
                    className={`${fieldControlCls} pr-5`}
                  >
                    <option value="" disabled>
                      Lets rule
                    </option>
                    <option value="lets">Stop on lets</option>
                    <option value="play-on">Play on lets</option>
                  </select>
                  <SelectChevron />
                </div>
                <div className={fieldRuleCls} />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdvancedDetails(true)}
              className="self-start inline-flex items-center gap-1 text-[11px] text-[#3B82F6] hover:text-[#2563EB] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-sm"
            >
              <Plus className="size-3" strokeWidth={1.75} />
              <span>Add scoring rules</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
