"use client";

/**
 * DetailsContent — the Match details step.
 *
 * Match name → Score → one grid of editable cells. The grid replaced a column of
 * underline selects behind an "Add match details" disclosure: thirteen facts
 * that each read as a settled value until you click one, rather than thirteen
 * empty form controls demanding to be filled. Nothing is hidden, because
 * hiding the optional half is what made people miss the required half.
 *
 * The two video answers live in the same grid, below a hairline, for processing
 * providers only. They used to be a separate segmented control above this
 * component; splitting them made the required fields look optional.
 *
 * `docs/ui-revamp-guardrails.md` §3.1 and §4 govern the five vendor-required
 * fields — both player names, a non-zero set score, the end at video start, the
 * camera answer and ad/no-ad. None of them may acquire a default, and the end
 * question is camera-relative at the FIRST FRAME; its wording is carried
 * verbatim into the menu hint.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CircleMinus,
  CirclePlus,
  Video,
  VideoOff,
} from "lucide-react";
import { FormData, DetailField } from "./types";
import {
  getAdjustedScores,
  validateSetScore,
  deriveOutcome,
  setHasData,
  formatHoursMinutes,
  leadingOnSets,
  pulseOnce,
} from "./utils";
import { eyebrowLabelCls, focusRingCls } from "./styles";
import { ScoreCell } from "./ScoreCell";
import {
  CellOption,
  EditorCell,
  InlineSelect,
  ReadOnlyCell,
  SelectCell,
  TextCell,
} from "./FieldCell";
import { OpponentProgramField } from "./OpponentProgramField";

const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;
const onlyDigits = (s: string) => s.replace(/[^0-9]/g, "");

export interface DetailsContentProps {
  formData: FormData;
  /** Team workspace — offer the opponent-program field. */
  showOpponentProgram?: boolean;
  onInputChange: (field: keyof FormData, value: string | number | boolean | undefined) => void;
  onScoreChange: (player: "player" | "opponent", index: number, value: string) => void;
  onTiebreakChange?: (player: "player" | "opponent", index: number, value: string) => void;
  /** Video provider — show the two camera answers in the grid. */
  isProcessingProvider?: boolean;
  /** Set when Confirm wants Match to focus a specific detail cell. */
  pendingDetailFocus?: DetailField | null;
  /** Called once DetailsContent has applied the pending focus. */
  onPendingDetailFocusConsumed?: () => void;
}

function needsTiebreak(p: number | null, o: number | null): boolean {
  if (p === null || o === null) return false;
  return (p === 7 && o === 6) || (p === 6 && o === 7);
}

type Hand = "right" | "left";
type Backhand = "one-handed" | "two-handed";

const HAND_OPTIONS: readonly CellOption<Hand>[] = [
  { value: "right", label: "Right-Handed" },
  { value: "left", label: "Left-Handed" },
];
const BACKHAND_OPTIONS: readonly CellOption<Backhand>[] = [
  { value: "two-handed", label: "2-Handed Backhand" },
  { value: "one-handed", label: "1-Handed Backhand" },
];

const ROUND_OPTIONS: readonly CellOption<string>[] = [
  { value: "Round of 128", label: "Round of 128" },
  { value: "Round of 64", label: "Round of 64" },
  { value: "Round of 32", label: "Round of 32" },
  { value: "Round of 16", label: "Round of 16" },
  { value: "Quarterfinals", label: "Quarterfinals" },
  { value: "Semifinals", label: "Semifinals" },
  { value: "Finals", label: "Finals" },
];

const MATCH_TYPE_OPTIONS: readonly CellOption<string>[] = [
  { value: "Tournament", label: "Tournament" },
  { value: "Dual Match", label: "Dual Match" },
  { value: "Practice", label: "Practice" },
];

const COURT_OPTIONS: readonly CellOption<string>[] = [
  { value: "Indoor Hard Court", label: "Indoor Hard Court" },
  { value: "Outdoor Hard Court", label: "Outdoor Hard Court" },
  { value: "Clay Court", label: "Clay Court" },
  { value: "Grass Court", label: "Grass Court" },
];

const FORMAT_OPTIONS: readonly CellOption<string>[] = [
  { value: "1", label: "Best of 1" },
  { value: "3", label: "Best of 3" },
  { value: "5", label: "Best of 5" },
];

const SCORING_OPTIONS: readonly CellOption<boolean>[] = [
  { value: true, label: "Ad" },
  { value: false, label: "No-ad" },
];

const LETS_OPTIONS: readonly CellOption<boolean>[] = [
  { value: false, label: "Stop on Lets" },
  { value: true, label: "Play on Lets" },
];

const CAMERA_OPTIONS: readonly CellOption<boolean>[] = [
  {
    value: true,
    label: "Fixed position",
    icon: <Video className="size-3.5" strokeWidth={1.5} />,
  },
  {
    value: false,
    label: "Moved or panned",
    icon: <VideoOff className="size-3.5" strokeWidth={1.5} />,
  },
];

const END_OPTIONS: readonly CellOption<boolean>[] = [
  {
    value: true,
    label: "Top of frame",
    icon: <ArrowUp className="size-3.5" strokeWidth={1.5} />,
  },
  {
    value: false,
    label: "Bottom of frame",
    icon: <ArrowDown className="size-3.5" strokeWidth={1.5} />,
  },
];

const editorInputCls = `h-8 w-full rounded-[6px] border border-[#EAECF0] bg-white px-2 text-[13px] text-[#0D0D0D] outline-none tabular-nums ${focusRingCls}`;

/**
 * The hours/minutes editor, for providers that bring no video.
 *
 * A component rather than state in DetailsContent so its inputs can be RESET BY
 * KEY when the stored duration changes — a parsed file pre-fills it — instead of
 * by an effect that mirrors props into state. It also stops existing entirely on
 * the video path, where the duration is derived from the trim window and this
 * would be an echo nothing can reach.
 */
function DurationEditorCell({
  durationMs,
  onChange,
}: {
  durationMs: number;
  onChange: (ms: number) => void;
}) {
  const [hoursInput, setHoursInput] = useState(() => {
    const h = Math.floor(durationMs / MS_PER_HOUR);
    return h ? String(h) : "";
  });
  const [minutesInput, setMinutesInput] = useState(() => {
    const m = Math.floor((durationMs % MS_PER_HOUR) / MS_PER_MINUTE);
    return m ? String(m) : "";
  });

  const commit = () => {
    const h = parseInt(hoursInput, 10) || 0;
    const m = Math.min(59, parseInt(minutesInput, 10) || 0);
    onChange(h * MS_PER_HOUR + m * MS_PER_MINUTE);
    setMinutesInput(m ? String(m) : "");
  };

  return (
    <EditorCell
      label="Duration"
      placeholder="Not set"
      value={durationMs ? formatHoursMinutes(durationMs / 1000) : ""}
      tabular
      menuWidth={200}
    >
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className={eyebrowLabelCls}>Hours</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={2}
            aria-label="Match length hours"
            placeholder="0"
            value={hoursInput}
            onChange={(e) => setHoursInput(onlyDigits(e.target.value))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className={editorInputCls}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className={eyebrowLabelCls}>Minutes</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={2}
            aria-label="Match length minutes"
            placeholder="00"
            value={minutesInput}
            onChange={(e) => setMinutesInput(onlyDigits(e.target.value))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className={editorInputCls}
          />
        </label>
      </div>
    </EditorCell>
  );
}

export function DetailsContent({
  formData,
  showOpponentProgram = false,
  onInputChange,
  onScoreChange,
  onTiebreakChange,
  isProcessingProvider = false,
  pendingDetailFocus,
  onPendingDetailFocusConsumed,
}: DetailsContentProps) {
  const [eventNameTouched, setEventNameTouched] = useState(false);
  const [playerNameTouched, setPlayerNameTouched] = useState(false);
  const [opponentNameTouched, setOpponentNameTouched] = useState(false);
  const [pendingRemoveAt, setPendingRemoveAt] = useState<number | null>(null);

  const eventNameError = eventNameTouched && !formData.eventName.trim();
  const playerNameError = playerNameTouched && !formData.playerName.trim();
  const opponentNameError = opponentNameTouched && !formData.opponentName.trim();

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

  // Confirm deep-linked back to focus a specific cell. Wait a frame for the
  // grid, then focus and scroll it into view. Clears the request so a manual
  // back-and-forth doesn't re-fire.
  useEffect(() => {
    if (!pendingDetailFocus) return;
    const id = `detail-${pendingDetailFocus}`;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // A programmatic focus does not satisfy :focus-visible after a mouse
        // click, so the cell the user asked for would otherwise look exactly
        // like the eleven around it. One pulse says "this one".
        pulseOnce(el);
      }
      onPendingDetailFocusConsumed?.();
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingDetailFocus, onPendingDetailFocusConsumed]);

  // Land in the first empty set box. The score is the one thing nobody can
  // guess for you, and arriving with the caret already in it is the difference
  // between typing 6 3 6 4 and hunting for where to type it. Once per mount,
  // and never when Confirm deep-linked somewhere else.
  const autofocused = useRef(false);
  useEffect(() => {
    if (autofocused.current || pendingDetailFocus) return;
    autofocused.current = true;
    const idx = playerScores.findIndex((s) => s === null);
    if (idx >= 0) playerScoreRefs.current[idx]?.focus();
  }, [playerScores, pendingDetailFocus]);

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
    setPendingRemoveAt(null);
    const newSets = Math.max(1, Math.min(bestOfNum, displayedSets + delta));
    if (newSets === displayedSets) return;
    if (newSets < displayedSets) {
      const droppedHasData = Array.from(
        { length: displayedSets - newSets },
        (_, k) => setHasData(formData, newSets + k)
      ).some(Boolean);
      if (droppedHasData) {
        setPendingRemoveAt(newSets);
        return;
      }
    }
    onInputChange("numberOfSets", newSets);
  };

  const confirmRemoveSets = () => {
    if (pendingRemoveAt === null) return;
    onInputChange("numberOfSets", pendingRemoveAt);
    setPendingRemoveAt(null);
  };

  // Computed once instead of at each of the three places that ask, one of
  // which used to pass its arguments in the opposite order — readable only if
  // you already knew needsTiebreak was symmetric.
  const tieAtSet = useMemo(
    () => playerScores.map((p, i) => needsTiebreak(p, opponentScores[i])),
    [playerScores, opponentScores]
  );

  const setValidations = useMemo(
    () => playerScores.map((p, i) => validateSetScore(p, opponentScores[i])),
    [playerScores, opponentScores]
  );
  const firstInvalid = setValidations.findIndex((v) => v.kind === "invalid");
  const invalidMessage =
    firstInvalid >= 0 ? setValidations[firstInvalid].message : null;

  const playerNm = formData.playerName || "Player";
  const opponentNm = formData.opponentName || "Opponent";

  const derivedOutcome = useMemo(
    () => deriveOutcome(playerNm, opponentNm, playerScores, opponentScores, bestOfNum),
    [playerNm, opponentNm, playerScores, opponentScores, bestOfNum]
  );
  useEffect(() => {
    if (derivedOutcome && !formData.result) {
      onInputChange("result", derivedOutcome);
    }
  }, [derivedOutcome, formData.result, onInputChange]);

  const setWinner = leadingOnSets(playerScores, opponentScores);

  /**
   * Result options.
   *
   * The empty value means "follow the score" — picking it clears the override
   * and the derivation immediately writes its own answer back, which is the
   * behaviour the placeholder promises. A stored result that matches none of
   * these (a rename after the fact) is prepended so the cell never shows a
   * placeholder over a value that exists.
   */
  const resultOptions = useMemo(() => {
    const options: CellOption<string>[] = [
      { value: "", label: "Derived from the score" },
      { value: `${playerNm} Wins`, label: `${playerNm} Wins` },
      { value: `${opponentNm} Wins`, label: `${opponentNm} Wins` },
      { value: `${playerNm} Withdrew`, label: `${playerNm} Withdrew` },
      { value: `${opponentNm} Withdrew`, label: `${opponentNm} Withdrew` },
      { value: `${playerNm} Defaulted`, label: `${playerNm} Defaulted` },
      { value: `${opponentNm} Defaulted`, label: `${opponentNm} Defaulted` },
      { value: "Unfinished", label: "Unfinished" },
    ];
    const stored = formData.result;
    if (stored && !options.some((o) => o.value === stored)) {
      options.splice(1, 0, { value: stored, label: stored });
    }
    return options;
  }, [playerNm, opponentNm, formData.result]);

  const dateTimeLabel = formData.date
    ? `${formData.date}${formData.time ? ` ${formData.time}` : ""}`
    : "";
  const durationLabel = formData.duration
    ? formatHoursMinutes(formData.duration / 1000)
    : "";

  return (
    <div className="flex flex-col gap-6">
      <TextCell
        className="-mx-3 max-w-[480px]"
        label="Match name"
        required
        placeholder="e.g. State Open"
        value={formData.eventName}
        onChange={(v) => onInputChange("eventName", v)}
        onBlur={() => setEventNameTouched(true)}
        invalid={eventNameError}
        error={eventNameError ? "A name helps you find this match later." : undefined}
      />

      {/* Score — editorial scoreboard. gap-2 tucks the label and the stepper
          against the hairline below, so they read as part of the frame. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h4 className={eyebrowLabelCls}>Score</h4>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleSetsChange(-1)}
              disabled={displayedSets <= 1}
              aria-label="Remove a set"
              aria-controls="scoreboard-frame"
              className={`flex size-7 items-center justify-center rounded-full text-[#3B82F6] transition-colors duration-150 hover:bg-[#F5F5F5] hover:text-[#2563EB] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent ${focusRingCls}`}
            >
              <CircleMinus className="size-3.5" strokeWidth={1.75} />
            </button>
            <span className="w-4 text-center text-[12px] font-medium tabular-nums text-[#525252]">
              {displayedSets}
            </span>
            <button
              type="button"
              onClick={() => handleSetsChange(1)}
              disabled={displayedSets >= bestOfNum}
              aria-label="Add a set"
              aria-controls="scoreboard-frame"
              className={`flex size-7 items-center justify-center rounded-full text-[#3B82F6] transition-colors duration-150 hover:bg-[#F5F5F5] hover:text-[#2563EB] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent ${focusRingCls}`}
            >
              <CirclePlus className="size-3.5" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {pendingRemoveAt !== null && (
          <div className="flex items-center justify-end gap-2 text-[11px] text-[#525252]">
            <span>Remove set {pendingRemoveAt + 1}? Scores will be cleared.</span>
            <button
              type="button"
              onClick={() => setPendingRemoveAt(null)}
              className={`rounded-full px-2 py-0.5 text-[#525252] transition-colors duration-150 hover:bg-[#F5F5F5] hover:text-[#0D0D0D] ${focusRingCls}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmRemoveSets}
              className="rounded-full px-2 py-0.5 text-[#E51837] transition-colors duration-150 hover:bg-[rgba(229,24,55,0.08)] focus-visible:outline-none"
            >
              Remove
            </button>
          </div>
        )}

        <div id="scoreboard-frame" className="flex flex-col border-t border-[#F3F3F3] pt-4">
          {/* Set headers. The TIE column only exists once a 7-6 does. */}
          <div className="flex justify-end pb-2">
            <div className="flex gap-4">
              {playerScores.map((_, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div className="w-7 text-center text-[9px] font-normal uppercase tracking-[2.5px] tabular-nums text-[#AAAAAA]">
                      {i + 1}
                    </div>
                    {tieAtSet[i] && (
                      <span className="w-7 text-center text-[9px] font-normal uppercase tracking-[1px] text-[#AAAAAA]">
                        Tie
                      </span>
                    )}
                  </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {/* Player 1 row */}
            <div className="flex items-start justify-between gap-4">
              <div className="group/name flex min-w-0 max-w-[320px] flex-1 flex-col">
                <div className="flex items-center gap-3 pb-1.5">
                  <input
                    placeholder="Your name"
                    aria-label="Your name"
                    aria-required="true"
                    aria-invalid={playerNameError || undefined}
                    value={formData.playerName}
                    onChange={(e) => onInputChange("playerName", e.target.value)}
                    onBlur={() => setPlayerNameTouched(true)}
                    data-focus-ring="none" /* the rule below carries focus */
                    /* Sized to its own text so the WON tag sits against the
                       name rather than at the far edge of the column. Falls
                       back to filling the row where field-sizing is missing,
                       which is the old behaviour, not a broken one. */
                    className="min-w-[9rem] max-w-full bg-transparent text-[16px] font-normal tracking-[-0.4px] text-[#0D0D0D] outline-none [field-sizing:content] placeholder:font-normal placeholder:text-[#AAAAAA]"
                  />
                  {setWinner === "player" && (
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-[2.5px] text-[#5DB955]">
                      Won
                    </span>
                  )}
                </div>
                <div
                  className={
                    playerNameError
                      ? "h-[1px] w-full bg-[#E51837]"
                      : "h-[1px] w-full bg-[#F3F3F3] transition-all duration-300 group-focus-within/name:h-[2px] group-focus-within/name:bg-[#3B82F6]"
                  }
                />
                {/* Reserved height so both player rows stay aligned whether or
                    not an error is showing — alignment is scoreboard-critical. */}
                <div className="mt-1 min-h-[12px]">
                  {playerNameError && (
                    <span className="text-[11px] leading-none text-[#E51837]">
                      Add your name.
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <InlineSelect
                    ariaLabel="Dominant hand"
                    placeholder="Hand"
                    options={HAND_OPTIONS}
                    value={formData.playerHand}
                    onChange={(v) => onInputChange("playerHand", v)}
                    onClear={() => onInputChange("playerHand", undefined)}
                  />
                  <span className="text-[10px] text-[#CCCCCC]">·</span>
                  <InlineSelect
                    ariaLabel="Backhand style"
                    placeholder="Backhand"
                    options={BACKHAND_OPTIONS}
                    value={formData.playerBackhand}
                    onChange={(v) => onInputChange("playerBackhand", v)}
                    onClear={() => onInputChange("playerBackhand", undefined)}
                  />
                </div>
              </div>
              <div className="flex gap-4 pt-1">
                {playerScores.map((score, i) => (
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
                      {tieAtSet[i] && (
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
                ))}
              </div>
            </div>

            {/* Player 2 row */}
            <div className="flex items-start justify-between gap-4">
              <div className="group/name flex min-w-0 max-w-[320px] flex-1 flex-col">
                <div className="flex items-center gap-3 pb-1.5">
                  <input
                    placeholder="Opponent name"
                    aria-label="Opponent name"
                    aria-required="true"
                    aria-invalid={opponentNameError || undefined}
                    value={formData.opponentName}
                    onChange={(e) => onInputChange("opponentName", e.target.value)}
                    onBlur={() => setOpponentNameTouched(true)}
                    data-focus-ring="none" /* the rule below carries focus */
                    /* Sized to its own text so the WON tag sits against the
                       name rather than at the far edge of the column. Falls
                       back to filling the row where field-sizing is missing,
                       which is the old behaviour, not a broken one. */
                    className="min-w-[9rem] max-w-full bg-transparent text-[16px] font-normal tracking-[-0.4px] text-[#0D0D0D] outline-none [field-sizing:content] placeholder:font-normal placeholder:text-[#AAAAAA]"
                  />
                  {setWinner === "opponent" && (
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-[2.5px] text-[#5DB955]">
                      Won
                    </span>
                  )}
                </div>
                <div
                  className={
                    opponentNameError
                      ? "h-[1px] w-full bg-[#E51837]"
                      : "h-[1px] w-full bg-[#F3F3F3] transition-all duration-300 group-focus-within/name:h-[2px] group-focus-within/name:bg-[#3B82F6]"
                  }
                />
                <div className="mt-1 min-h-[12px]">
                  {opponentNameError && (
                    <span className="text-[11px] leading-none text-[#E51837]">
                      Add their name.
                    </span>
                  )}
                </div>

                {/* Team workspaces only. In a personal workspace there is no
                    program to scout for, and the field would be one more thing
                    to skip on every upload. */}
                {showOpponentProgram && (
                  <div className="mb-1.5">
                    <OpponentProgramField
                      schoolName={formData.opponentSchool}
                      onChange={(school, programKey) => {
                        onInputChange("opponentSchool", school ?? undefined);
                        onInputChange("opponentProgramKey", programKey ?? undefined);
                      }}
                    />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <InlineSelect
                    ariaLabel="Opponent dominant hand"
                    placeholder="Hand"
                    options={HAND_OPTIONS}
                    value={formData.opponentHand}
                    onChange={(v) => onInputChange("opponentHand", v)}
                    onClear={() => onInputChange("opponentHand", undefined)}
                  />
                  <span className="text-[10px] text-[#CCCCCC]">·</span>
                  <InlineSelect
                    ariaLabel="Opponent backhand style"
                    placeholder="Backhand"
                    options={BACKHAND_OPTIONS}
                    value={formData.opponentBackhand}
                    onChange={(v) => onInputChange("opponentBackhand", v)}
                    onClear={() => onInputChange("opponentBackhand", undefined)}
                  />
                </div>
              </div>
              <div className="flex gap-4 pt-1">
                {opponentScores.map((score, i) => (
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
                      {tieAtSet[i] && (
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
                ))}
              </div>
            </div>
          </div>

          {/* Anchored inside the frame so it sits near the offending set. */}
          {invalidMessage && (
            <div className="mt-3 flex justify-start">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(229,24,55,0.18)] bg-[rgba(229,24,55,0.06)] py-1 pl-2 pr-2.5">
                <AlertCircle className="size-3 text-[#E51837]" strokeWidth={1.75} />
                <span className="text-[12px] font-medium text-[#E51837]">
                  Set {firstInvalid + 1}: {invalidMessage}
                </span>
              </div>
            </div>
          )}

          <div className="mt-2 h-px bg-[#F3F3F3]" />
        </div>
      </div>

      {/* The details grid. Bled sideways so the cells' hover frames overhang the
          column edge and the text still lines up with everything above. */}
      <div className="-mx-3 grid grid-cols-3 gap-x-3 gap-y-1">
        <SelectCell
          className="col-span-3"
          label="Result"
          placeholder="Derived from the score"
          // `|| undefined` so an empty result reads as unset — the empty option
          // exists to CLEAR the override, and matching it would paint the
          // placeholder in settled ink.
          value={formData.result || undefined}
          options={resultOptions}
          onChange={(v) => onInputChange("result", v)}
        />
        <SelectCell
          id="detail-round"
          label="Round"
          placeholder="Not set"
          value={formData.round || undefined}
          options={ROUND_OPTIONS}
          onChange={(v) => onInputChange("round", v)}
          onClear={() => onInputChange("round", "")}
        />
        <SelectCell
          id="detail-matchType"
          label="Match type"
          placeholder="Not set"
          value={formData.matchType || undefined}
          options={MATCH_TYPE_OPTIONS}
          onChange={(v) => onInputChange("matchType", v)}
          onClear={() => onInputChange("matchType", "")}
          hint="A tournament is sanctioned draw play. A dual match is team competition — college or high school. Practice won't count toward competitive records."
        />
        <SelectCell
          id="detail-courtType"
          label="Court"
          placeholder="Not set"
          value={formData.courtType || undefined}
          options={COURT_OPTIONS}
          onChange={(v) => onInputChange("courtType", v)}
          onClear={() => onInputChange("courtType", "")}
        />
        <SelectCell
          label="Format"
          required
          placeholder="Choose"
          value={formData.bestOf || undefined}
          options={FORMAT_OPTIONS}
          onChange={(v) => onInputChange("bestOf", v)}
        />
        <SelectCell
          label="Scoring"
          // Marked required only where it IS: the vendor's job payload demands
          // it, an imported file may simply not record it. An asterisk on a
          // field nothing enforces teaches people to ignore asterisks.
          required={isProcessingProvider}
          placeholder="Choose"
          value={formData.adScoring}
          options={SCORING_OPTIONS}
          onChange={(v) => onInputChange("adScoring", v)}
          hint="Ad scoring needs two straight points after 40-all. No-ad ends the game on the next point, and the receiver picks the side."
        />
        <SelectCell
          label="Lets"
          required
          placeholder="Choose"
          value={formData.playOnLets}
          options={LETS_OPTIONS}
          onChange={(v) => onInputChange("playOnLets", v)}
          hint="Stop on lets replays a serve that clips the net. Play on lets keeps net cords live — college and some leagues."
        />
        <EditorCell
          label="Date & time"
          placeholder="Not set"
          value={dateTimeLabel}
          tabular
          menuWidth={220}
        >
          <label className="flex flex-col gap-1">
            <span className={eyebrowLabelCls}>Date</span>
            <input
              type="date"
              aria-label="Date"
              max={new Date().toISOString().slice(0, 10)}
              value={formData.date}
              onChange={(e) => onInputChange("date", e.target.value)}
              className={editorInputCls}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={eyebrowLabelCls}>Time</span>
            <input
              type="time"
              aria-label="Time"
              value={formData.time}
              onChange={(e) => onInputChange("time", e.target.value)}
              className={editorInputCls}
            />
          </label>
        </EditorCell>
        {isProcessingProvider ? (
          /* Derived, not asked: the trim window is the match, so its length is
             the match's. An editable field here could contradict the analysed
             window printed on the next screen. */
          <ReadOnlyCell
            label="Duration"
            value={durationLabel}
            placeholder="From the trimmed video"
            tabular
          />
        ) : (
          <DurationEditorCell
            key={formData.duration ?? 0}
            durationMs={formData.duration ?? 0}
            onChange={(ms) => onInputChange("duration", ms)}
          />
        )}

        {/* The two video answers. Same cells, own band — they are about the
            recording, not the match, and both are required by the analysis. */}
        {isProcessingProvider && (
          <>
            <div className="col-span-3 mx-3 mb-0.5 mt-1.5 h-px bg-[#F3F3F3]" />
            <SelectCell
              label="Camera"
              required
              placeholder="Choose"
              value={formData.fixedCamera}
              options={CAMERA_OPTIONS}
              onChange={(v) => onInputChange("fixedCamera", v)}
              menuWidth={260}
              hint="A tripod or a phone propped against the fence is fixed. Handheld or following the play is not."
            />
            <SelectCell
              label="Your end at start"
              required
              placeholder="Choose"
              value={formData.initialTopPlayerIsPlayer1}
              options={END_OPTIONS}
              onChange={(v) => onInputChange("initialTopPlayerIsPlayer1", v)}
              menuWidth={260}
              hint="Where you were standing when the video begins — not where you served from first. Ends change through the match; we only need the opening."
            />
          </>
        )}
      </div>
    </div>
  );
}
