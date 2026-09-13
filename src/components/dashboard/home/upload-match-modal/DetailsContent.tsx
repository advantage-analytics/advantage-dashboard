"use client";

/**
 * DetailsContent — Match step body.
 * Match name → Score (with player meta + per-set scores) → Result (Winner + Outcome)
 * → Details (Round, Court, Format, Date, Time, Duration, optional Scoring/Lets).
 */

import {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  useId,
  useLayoutEffect,
} from "react";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  ChevronDown,
  CircleMinus,
  CirclePlus,
  Info,
  Plus,
} from "lucide-react";
import { FormData, DetailField } from "./types";
import {
  getAdjustedScores,
  validateSetScore,
  deriveOutcome,
  setHasData,
} from "./utils";
import { eyebrowLabelCls } from "./styles";
import { ScoreCell } from "./ScoreCell";

const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;
const onlyDigits = (s: string) => s.replace(/[^0-9]/g, "");

export interface DetailsContentProps {
  formData: FormData;
  onInputChange: (field: keyof FormData, value: string | number | boolean | undefined) => void;
  onScoreChange: (player: "player" | "opponent", index: number, value: string) => void;
  onTiebreakChange?: (player: "player" | "opponent", index: number, value: string) => void;
  /** Set when Confirm wants Match to expand Details and focus a specific field. */
  pendingDetailFocus?: DetailField | null;
  /** Called once DetailsContent has applied the pending focus. */
  onPendingDetailFocusConsumed?: () => void;
}

function needsTiebreak(p: number | null, o: number | null): boolean {
  if (p === null || o === null) return false;
  return (p === 7 && o === 6) || (p === 6 && o === 7);
}

// Auth-style underline field — matches src/components/auth/form-field.tsx.
// Details fields render a small uppercase label above the control so the
// field's identity persists after selection (placeholder-as-label fails post-fill).
// Color is applied per-control: filledTextCls when value is set, emptyTextCls when blank,
// so empty selects don't inherit the dark text color from their disabled placeholder option.
const fieldControlCls =
  "w-full appearance-none bg-transparent text-[14px] outline-none placeholder:text-[#AAAAAA] [&:invalid]:text-[#AAAAAA] transition-colors duration-150";

// Selects and date/time inputs are interactive in a way text inputs aren't —
// add cursor-pointer + hover preview color so the empty state reads as actionable.
const interactiveFieldCls = "cursor-pointer hover:[&:not(:focus)]:text-[#525252]";

const filledTextCls = "text-[#0D0D0D]";
const emptyTextCls = "text-[#AAAAAA]";

const fieldRuleCls =
  "h-[1px] w-full bg-[#F3F3F3] transition-all duration-200 group-hover:bg-[#E5E5EA] group-focus-within:h-[2px] group-focus-within:bg-[#3B82F6]";

// Inline help. Sits next to a field label as a small Info trigger; reveals a
// quiet definition-list popover on hover / focus / click. The popover is an
// editorial aside — restrained surface, no glassmorphism, no semantic accent
// unless the term itself carries it elsewhere.
function InfoTooltip({
  label,
  items,
}: {
  label: string;
  items: { term: string; def: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState<"left" | "right">("left");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const id = useId();

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  // 100ms grace so the cursor can traverse the gap from trigger to popover.
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 100);
  };

  // Mount/unmount with a 150ms fade so the popover doesn't snap in/out.
  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), 150);
    return () => clearTimeout(t);
  }, [open]);

  // Anchor right when the trigger is near the viewport's right edge so the
  // 260px popover doesn't clip on narrow screens / right-column fields.
  // Recomputes on resize so the anchor stays accurate if the user drags the
  // viewport narrower while the tooltip is open.
  useLayoutEffect(() => {
    if (!mounted) return;
    const compute = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const POPOVER_WIDTH = 260;
      const MARGIN = 16;
      setAnchor(
        rect.left + POPOVER_WIDTH + MARGIN > window.innerWidth ? "right" : "left"
      );
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [mounted]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) {
        return;
      }
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useEffect(() => () => cancelClose(), []);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => {
          cancelClose();
          setOpen(true);
        }}
        onBlur={scheduleClose}
        className="inline-flex items-center justify-center size-3 rounded-full text-[#CCCCCC] hover:text-[#525252] aria-expanded:text-[#525252] focus-visible:text-[#3B82F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/30 focus-visible:ring-offset-1 transition-colors duration-150"
      >
        <Info className="size-3" strokeWidth={1.75} aria-hidden="true" />
      </button>
      {mounted && (
        <div
          ref={popoverRef}
          id={id}
          role="tooltip"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className={`absolute z-30 ${
            anchor === "right" ? "right-0" : "left-0"
          } top-full mt-2 w-[260px] bg-white border border-[#F3F3F3] rounded-[10px] shadow-[0_4px_14px_rgba(0,0,0,0.04)] p-3 flex flex-col gap-2.5 transition-opacity duration-150 ${
            visible ? "opacity-100" : "opacity-0"
          }`}
        >
          {items.map((item, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <p className="text-[12px] leading-[18px] font-medium text-[#0D0D0D] tracking-[-0.1px]">
                {item.term}
              </p>
              <p className="text-[11px] leading-[16px] text-[#525252]">
                {item.def}
              </p>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

// Uniform label box for all form fields — fixed 12px height with leading-none
// so labels with and without trailing tooltips occupy the exact same vertical
// space. Without this, controls below tooltip-bearing labels would shift in
// the grid relative to their neighbors.
function FieldLabel({
  children,
  tooltip,
}: {
  children: React.ReactNode;
  tooltip?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 h-3">
      <p className={`${eyebrowLabelCls} leading-none`}>{children}</p>
      {tooltip}
    </div>
  );
}

// Chevron for native <select> — gives them visible affordance.
// Tracks group hover/focus so it reads as part of the same interactive surface.
function SelectChevron({ disabled }: { disabled?: boolean }) {
  return (
    <ChevronDown
      aria-hidden="true"
      className={`pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 size-3 transition-colors duration-150 ${
        disabled
          ? "text-[#CCCCCC]"
          : "text-[#AAAAAA] group-hover:text-[#525252] group-focus-within:text-[#3B82F6]"
      }`}
      strokeWidth={1.75}
    />
  );
}

type Hand = "right" | "left";
type Backhand = "one-handed" | "two-handed";

interface CompactSelectOption<T extends string> {
  value: T;
  label: string;
}

// Quiet inline select for ancillary metadata (player hand / backhand).
// Matches the chevron-select language used elsewhere in the form, but smaller
// and label-less so it can sit under the player name without crowding the scoreboard.
function CompactSelect<T extends string>({
  value,
  onChange,
  ariaLabel,
  placeholder,
  options,
}: {
  value: T | undefined;
  onChange: (v: T | undefined) => void;
  ariaLabel: string;
  placeholder: string;
  options: readonly CompactSelectOption<T>[];
}) {
  return (
    <div className="group relative inline-flex items-center">
      <select
        aria-label={ariaLabel}
        value={value ?? ""}
        onChange={(e) =>
          onChange((e.target.value === "" ? undefined : (e.target.value as T)))
        }
        className="appearance-none bg-transparent pr-3.5 text-[10px] font-normal outline-none cursor-pointer transition-colors duration-150 text-[#AAAAAA] group-hover:text-[#525252] focus-visible:text-[#0D0D0D]"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-0 size-2.5 text-[#AAAAAA] transition-colors duration-150 group-hover:text-[#525252] group-focus-within:text-[#3B82F6]"
        strokeWidth={1.75}
      />
    </div>
  );
}

const handOptions: readonly CompactSelectOption<Hand>[] = [
  { value: "right", label: "Right-Handed" },
  { value: "left", label: "Left-Handed" },
];
const backhandOptions: readonly CompactSelectOption<Backhand>[] = [
  { value: "two-handed", label: "2-Handed Backhand" },
  { value: "one-handed", label: "1-Handed Backhand" },
];

export function DetailsContent({
  formData,
  onInputChange,
  onScoreChange,
  onTiebreakChange,
  pendingDetailFocus,
  onPendingDetailFocusConsumed,
}: DetailsContentProps) {
  const [eventNameTouched, setEventNameTouched] = useState(false);
  const [playerNameTouched, setPlayerNameTouched] = useState(false);
  const [opponentNameTouched, setOpponentNameTouched] = useState(false);
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(
    formData.adScoring !== undefined || formData.playOnLets !== undefined
  );
  // Match details (Round, Court, Format, Date, Time, Duration, Advanced) collapse
  // behind a toggle so the Match step doesn't render 13 controls at once. Auto-opens
  // when stored data has any non-pure-default value, or when Confirm deep-linked
  // back to focus a specific field. Date and Time are excluded from the heuristic
  // because getDefaultFormData() always populates them.
  const [showDetails, setShowDetails] = useState(
    Boolean(pendingDetailFocus) ||
      Boolean(formData.round) ||
      Boolean(formData.matchType) ||
      Boolean(formData.courtType) ||
      (formData.duration ?? 0) > 0 ||
      formData.adScoring !== undefined ||
      formData.playOnLets !== undefined
  );
  const [pendingRemoveAt, setPendingRemoveAt] = useState<number | null>(null);

  // Confirm deep-linked back to focus a specific detail field. Wait for the
  // Details disclosure to render, then focus + scroll the target select into
  // view. Clears the request so a manual back-and-forth doesn't re-fire.
  useEffect(() => {
    if (!pendingDetailFocus) return;
    const id = `detail-${pendingDetailFocus}`;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      onPendingDetailFocusConsumed?.();
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingDetailFocus, onPendingDetailFocusConsumed]);

  // Duration is split into two number fields — users shouldn't have to type units.
  // Local string state keeps editing fluid; commit to formData on blur.
  const initialDurationMs = formData.duration ?? 0;
  const [hoursInput, setHoursInput] = useState(() => {
    const h = Math.floor(initialDurationMs / MS_PER_HOUR);
    return h ? String(h) : "";
  });
  const [minutesInput, setMinutesInput] = useState(() => {
    const m = Math.floor((initialDurationMs % MS_PER_HOUR) / MS_PER_MINUTE);
    return m ? String(m) : "";
  });
  useEffect(() => {
    const ms = formData.duration ?? 0;
    const h = Math.floor(ms / MS_PER_HOUR);
    const m = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE);
    setHoursInput(h ? String(h) : "");
    setMinutesInput(m ? String(m) : "");
  }, [formData.duration]);
  const commitDuration = () => {
    const h = parseInt(hoursInput, 10) || 0;
    const m = Math.min(59, parseInt(minutesInput, 10) || 0);
    onInputChange("duration", h * MS_PER_HOUR + m * MS_PER_MINUTE);
    setMinutesInput(m ? String(m) : "");
  };
  const eventNameMissing = !formData.eventName.trim();
  const eventNameError = eventNameTouched && eventNameMissing;
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

  // Result is stored as a single string ("Player Wins" / "Opponent Withdrew" / "Unfinished").
  // We expose it as two fields — Winner + Outcome — to keep the per-decision option count under 4.
  const playerNm = formData.playerName || "Player";
  const opponentNm = formData.opponentName || "Opponent";
  type WinnerKey = "" | "player" | "opponent";
  type OutcomeKey = "" | "Wins" | "Withdrew" | "Defaulted" | "Unfinished";
  const currentWinner: WinnerKey = !formData.result || formData.result === "Unfinished"
    ? ""
    : formData.result.startsWith(playerNm)
    ? "player"
    : formData.result.startsWith(opponentNm)
    ? "opponent"
    : "";
  const currentOutcome: OutcomeKey = !formData.result
    ? ""
    : formData.result === "Unfinished"
    ? "Unfinished"
    : formData.result.endsWith(" Wins")
    ? "Wins"
    : formData.result.endsWith(" Withdrew")
    ? "Withdrew"
    : formData.result.endsWith(" Defaulted")
    ? "Defaulted"
    : "";

  // Only suggest the auto-derived correction when the user's outcome is "Wins" —
  // Withdrew / Defaulted / Unfinished are deliberate non-completion choices.
  // Compared against structured currentOutcome rather than substring-matching the
  // result string, which would false-fire on names containing those words.
  const outcomeMismatch =
    !!derivedOutcome &&
    currentOutcome === "Wins" &&
    formData.result !== derivedOutcome;
  const writeResult = (winner: WinnerKey, outcome: OutcomeKey) => {
    if (outcome === "Unfinished") {
      onInputChange("result", "Unfinished");
      return;
    }
    if (!winner || !outcome) {
      onInputChange("result", "");
      return;
    }
    const name = winner === "player" ? playerNm : opponentNm;
    onInputChange("result", `${name} ${outcome}`);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Match name — primary required field, underline-style */}
      <div className="group flex flex-col gap-1.5 max-w-[480px]">
        <h4 className={eyebrowLabelCls}>
          Match name <span className="text-[#E51837]">*</span>
        </h4>
        <div className="flex w-full items-center pb-2">
          <input
            placeholder="e.g. State Open"
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
            A name helps you find this match later.
          </span>
        )}
      </div>

      {/* Score — editorial scoreboard.
          gap-2 (8px) tucks the "Score" label and the sets stepper close to
          the hairline below, signaling they belong to the scoreboard frame
          rather than floating between sections. */}
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

        {pendingRemoveAt !== null && (
          <div className="flex items-center justify-end gap-2 text-[11px] text-[#525252]">
            <span>
              Remove set {pendingRemoveAt + 1}? Scores will be cleared.
            </span>
            <button
              type="button"
              onClick={() => setPendingRemoveAt(null)}
              className="px-2 py-0.5 rounded-full text-[#525252] hover:text-[#0D0D0D] hover:bg-[#F5F5F5] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmRemoveSets}
              className="px-2 py-0.5 rounded-full text-[#E51837] hover:bg-[rgba(229,24,55,0.08)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E51837]/40"
            >
              Remove
            </button>
          </div>
        )}

        {/* Scoreboard frame */}
        <div id="scoreboard-frame" className="flex flex-col border-t border-[#F3F3F3] pt-4">
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
            <div className="flex justify-between items-start gap-4">
              <div className="group/name flex flex-col flex-1 min-w-0 max-w-[320px]">
                <input
                  placeholder="Your name"
                  aria-label="Your name"
                  aria-required="true"
                  aria-invalid={playerNameError || undefined}
                  value={formData.playerName}
                  onChange={(e) => onInputChange("playerName", e.target.value)}
                  onBlur={() => setPlayerNameTouched(true)}
                  className="w-full bg-transparent text-[16px] font-normal tracking-[-0.4px] text-[#0D0D0D] outline-none placeholder:text-[#AAAAAA] placeholder:font-normal pb-1.5"
                />
                <div
                  className={
                    playerNameError
                      ? "h-[1px] w-full bg-[#E51837]"
                      : "h-[1px] w-full bg-[#F3F3F3] transition-all duration-300 group-focus-within/name:h-[2px] group-focus-within/name:bg-[#3B82F6]"
                  }
                />
                {/* Reserved height so the row stays aligned with the opponent
                    row whether or not the error is showing — alignment is
                    scoreboard-critical. Sized to the error line-height (12px)
                    so it doesn't push the metadata row down by more than needed. */}
                <div className="min-h-[12px] mt-1">
                  {playerNameError && (
                    <span className="text-[11px] text-[#E51837] leading-none">
                      Add your name.
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <CompactSelect
                    ariaLabel="Dominant hand"
                    placeholder="Hand"
                    options={handOptions}
                    value={formData.playerHand}
                    onChange={(v) => onInputChange("playerHand", v)}
                  />
                  <span className="text-[#CCCCCC] text-[10px]">·</span>
                  <CompactSelect
                    ariaLabel="Backhand style"
                    placeholder="Backhand"
                    options={backhandOptions}
                    value={formData.playerBackhand}
                    onChange={(v) => onInputChange("playerBackhand", v)}
                  />
                </div>
              </div>
              <div className="flex gap-4 pt-1">
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
            <div className="flex justify-between items-start gap-4">
              <div className="group/name flex flex-col flex-1 min-w-0 max-w-[320px]">
                <input
                  placeholder="Opponent name"
                  aria-label="Opponent name"
                  aria-required="true"
                  aria-invalid={opponentNameError || undefined}
                  value={formData.opponentName}
                  onChange={(e) => onInputChange("opponentName", e.target.value)}
                  onBlur={() => setOpponentNameTouched(true)}
                  className="w-full bg-transparent text-[16px] font-normal tracking-[-0.4px] text-[#0D0D0D] outline-none placeholder:text-[#AAAAAA] placeholder:font-normal pb-1.5"
                />
                <div
                  className={
                    opponentNameError
                      ? "h-[1px] w-full bg-[#E51837]"
                      : "h-[1px] w-full bg-[#F3F3F3] transition-all duration-300 group-focus-within/name:h-[2px] group-focus-within/name:bg-[#3B82F6]"
                  }
                />
                <div className="min-h-[12px] mt-1">
                  {opponentNameError && (
                    <span className="text-[11px] text-[#E51837] leading-none">
                      Add their name.
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <CompactSelect
                    ariaLabel="Opponent dominant hand"
                    placeholder="Hand"
                    options={handOptions}
                    value={formData.opponentHand}
                    onChange={(v) => onInputChange("opponentHand", v)}
                  />
                  <span className="text-[#CCCCCC] text-[10px]">·</span>
                  <CompactSelect
                    ariaLabel="Opponent backhand style"
                    placeholder="Backhand"
                    options={backhandOptions}
                    value={formData.opponentBackhand}
                    onChange={(v) => onInputChange("opponentBackhand", v)}
                  />
                </div>
              </div>
              <div className="flex gap-4 pt-1">
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

          {/* Validation message — anchored inside the scoreboard frame so it sits
              near the offending set rather than far below the player rows. */}
          {invalidMessage && (
            <div className="flex justify-start mt-3">
              <div className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 bg-[rgba(229,24,55,0.06)] border border-[rgba(229,24,55,0.18)] rounded-full">
                <AlertCircle className="size-3 text-[#E51837]" strokeWidth={1.75} />
                <span className="text-[#E51837] text-[12px] font-medium">
                  Set {firstInvalid + 1}: {invalidMessage}
                </span>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Result — split into Winner + Outcome so each decision is at most 4 options.
          Both feed back into the existing single-string formData.result via writeResult(). */}
      <div className="flex flex-col gap-4 pt-6 border-t border-[#F3F3F3]">
        <h4 className={eyebrowLabelCls}>Result</h4>
        <div className="flex flex-col gap-[6px]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
            {(() => {
              // Winner asks the user to pick between the two named players. If
              // either name is empty, the options collapse to placeholders
              // ("Player" / "Opponent") which is recognition-as-recall. Disable
              // the field until both names are present and tell the user why.
              const namesReady =
                !!formData.playerName.trim() && !!formData.opponentName.trim();
              const winnerDisabled = currentOutcome === "Unfinished" || !namesReady;
              return (
                <div className="group flex flex-col gap-[6px]">
                  <FieldLabel>Winner</FieldLabel>
                  <div className="relative pb-[10px]">
                    <select
                      aria-label="Match winner"
                      value={currentWinner}
                      onChange={(e) =>
                        writeResult(e.target.value as WinnerKey, currentOutcome)
                      }
                      disabled={winnerDisabled}
                      className={`${fieldControlCls} ${interactiveFieldCls} pr-5 ${currentWinner ? filledTextCls : emptyTextCls} disabled:text-[#CCCCCC] disabled:cursor-not-allowed`}
                    >
                      <option value="" disabled>
                        {namesReady ? "Select winner" : "Add player names above"}
                      </option>
                      <option value="player">{playerNm}</option>
                      <option value="opponent">{opponentNm}</option>
                    </select>
                    <SelectChevron disabled={winnerDisabled} />
                  </div>
                  <div className={fieldRuleCls} />
                </div>
              );
            })()}
            <div className="group flex flex-col gap-[6px]">
              <FieldLabel
                tooltip={
                  <InfoTooltip
                    label="Outcome"
                    items={[
                      { term: "Wins", def: "Match completed to a winner." },
                      { term: "Withdrew", def: "Forfeit, often due to injury. Counts as a loss." },
                      { term: "Defaulted", def: "Forfeit by rule (code violation, no-show)." },
                      { term: "Unfinished", def: "Match was interrupted and not resumed." },
                    ]}
                  />
                }
              >
                Outcome <span className="text-[#E51837]">*</span>
              </FieldLabel>
              <div className="relative pb-[10px]">
                <select
                  aria-label="Match outcome"
                  aria-required="true"
                  value={currentOutcome}
                  onChange={(e) =>
                    writeResult(currentWinner, e.target.value as OutcomeKey)
                  }
                  className={`${fieldControlCls} ${interactiveFieldCls} pr-5 ${currentOutcome ? filledTextCls : emptyTextCls}`}
                >
                  {/* Required field — placeholder not clearable. */}
                  <option value="" disabled>
                    Select outcome
                  </option>
                  <option value="Wins">Wins</option>
                  <option value="Withdrew">Withdrew</option>
                  <option value="Defaulted">Defaulted</option>
                  <option value="Unfinished">Unfinished</option>
                </select>
                <SelectChevron />
              </div>
              <div className={fieldRuleCls} />
            </div>
          </div>
          {outcomeMismatch && derivedOutcome && (
            <button
              type="button"
              onClick={() => onInputChange("result", derivedOutcome)}
              className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 bg-[#F3F3F3] border border-[#EAECF0] rounded-full hover:bg-[#EAECF0] transition-colors self-start"
            >
              <AlertCircle className="size-3 text-[#525252]" strokeWidth={1.75} />
              <span className="text-[#525252] text-[12px] font-medium">
                Use {derivedOutcome}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Match details — uniform 2-column grid so chevron selects align with date/time/text inputs.
          Collapsed by default; the user opts in to refine round/court/format/date/time/duration
          + scoring rules. Format defaults to "Best of 3" and Date/Time auto-populate to "now",
          so a user submitting without expanding still gets a sensible record. */}
      {showDetails ? (
      <div className="flex flex-col gap-4">
        <h4 className={eyebrowLabelCls}>Details</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
          {/* Round */}
          <div className="group flex flex-col gap-[6px]">
            <FieldLabel>Round</FieldLabel>
            <div className="relative pb-[10px]">
              <select
                id="detail-round"
                aria-label="Round"
                value={formData.round || ""}
                onChange={(e) => onInputChange("round", e.target.value)}
                className={`${fieldControlCls} ${interactiveFieldCls} pr-5 ${formData.round ? filledTextCls : emptyTextCls}`}
              >
                <option value="">Round</option>
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

          {/* Match type */}
          <div className="group flex flex-col gap-[6px]">
            <FieldLabel
              tooltip={
                <InfoTooltip
                  label="Match type"
                  items={[
                    { term: "Tournament", def: "Sanctioned event with a draw — singles or doubles bracket play." },
                    { term: "Dual Match", def: "Team competition (college, high school) — multiple lines played head-to-head." },
                    { term: "Practice", def: "Casual or training match. Won't count toward competitive records." },
                  ]}
                />
              }
            >
              Match type
            </FieldLabel>
            <div className="relative pb-[10px]">
              <select
                id="detail-matchType"
                aria-label="Match type"
                value={formData.matchType || ""}
                onChange={(e) => onInputChange("matchType", e.target.value)}
                className={`${fieldControlCls} ${interactiveFieldCls} pr-5 ${formData.matchType ? filledTextCls : emptyTextCls}`}
              >
                <option value="">Match type</option>
                <option value="Tournament">Tournament</option>
                <option value="Dual Match">Dual Match</option>
                <option value="Practice">Practice</option>
              </select>
              <SelectChevron />
            </div>
            <div className={fieldRuleCls} />
          </div>

          {/* Court type */}
          <div className="group flex flex-col gap-[6px]">
            <FieldLabel>Court</FieldLabel>
            <div className="relative pb-[10px]">
              <select
                id="detail-courtType"
                aria-label="Court type"
                value={formData.courtType || ""}
                onChange={(e) => onInputChange("courtType", e.target.value)}
                className={`${fieldControlCls} ${interactiveFieldCls} pr-5 ${formData.courtType ? filledTextCls : emptyTextCls}`}
              >
                <option value="">Court type</option>
                <option value="Indoor Hard Court">Indoor Hard Court</option>
                <option value="Outdoor Hard Court">Outdoor Hard Court</option>
                <option value="Clay Court">Clay Court</option>
                <option value="Grass Court">Grass Court</option>
              </select>
              <SelectChevron />
            </div>
            <div className={fieldRuleCls} />
          </div>

          {/* Match format */}
          <div className="group flex flex-col gap-[6px]">
            <FieldLabel>Format</FieldLabel>
            <div className="relative pb-[10px]">
              <select
                aria-label="Match format"
                value={formData.bestOf || ""}
                onChange={(e) => onInputChange("bestOf", e.target.value)}
                className={`${fieldControlCls} ${interactiveFieldCls} pr-5 ${formData.bestOf ? filledTextCls : emptyTextCls}`}
              >
                {/* Required field — every match has a format. Placeholder not clearable. */}
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

          {/* Date */}
          <div className="group flex flex-col gap-[6px]">
            <FieldLabel>Date</FieldLabel>
            <div className="pb-[10px]">
              <input
                type="date"
                aria-label="Date"
                max={new Date().toISOString().slice(0, 10)}
                value={formData.date}
                onChange={(e) => onInputChange("date", e.target.value)}
                className={`${fieldControlCls} ${interactiveFieldCls} ${formData.date ? filledTextCls : emptyTextCls}`}
              />
            </div>
            <div className={fieldRuleCls} />
          </div>

          {/* Time */}
          <div className="group flex flex-col gap-[6px]">
            <FieldLabel>Time</FieldLabel>
            <div className="pb-[10px]">
              <input
                type="time"
                aria-label="Time"
                value={formData.time}
                onChange={(e) => onInputChange("time", e.target.value)}
                className={`${fieldControlCls} ${interactiveFieldCls} ${formData.time ? filledTextCls : emptyTextCls}`}
              />
            </div>
            <div className={fieldRuleCls} />
          </div>

          {/* Match length — two number fields so users don't have to type unit letters.
              Digits at 14px to match the row's field type size; H/M anchors at 10px.
              Tight gap-0.5 keeps each (digit · unit) reading as one pair; ml-2 on
              the minutes input separates the two pairs visually. */}
          <div className="group flex flex-col gap-[6px]">
            <FieldLabel>Duration</FieldLabel>
            <div className="pb-[10px] flex items-baseline gap-0.5">
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                aria-label="Match length hours"
                placeholder="0"
                value={hoursInput}
                onChange={(e) => setHoursInput(onlyDigits(e.target.value))}
                onBlur={commitDuration}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                className={`[field-sizing:content] min-w-[8px] mr-1 bg-transparent text-[14px] font-normal outline-none tabular-nums text-left placeholder:text-[#AAAAAA] transition-colors duration-150 ${hoursInput ? filledTextCls : emptyTextCls}`}
              />
              <span
                className={`text-[10px] font-medium uppercase tracking-[2px] transition-colors duration-150 ${
                  hoursInput ? "text-[#525252]" : "text-[#AAAAAA]"
                }`}
              >
                H
              </span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                aria-label="Match length minutes"
                placeholder="00"
                value={minutesInput}
                onChange={(e) => setMinutesInput(onlyDigits(e.target.value))}
                onBlur={commitDuration}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                className={`w-5 ml-2 bg-transparent text-[14px] font-normal outline-none tabular-nums text-left placeholder:text-[#AAAAAA] transition-colors duration-150 ${minutesInput ? filledTextCls : emptyTextCls}`}
              />
              <span
                className={`text-[10px] font-medium uppercase tracking-[2px] transition-colors duration-150 ${
                  minutesInput ? "text-[#525252]" : "text-[#AAAAAA]"
                }`}
              >
                M
              </span>
            </div>
            <div className={fieldRuleCls} />
          </div>

          {/* Advanced — Scoring + Lets, or a quiet "Add scoring rules" trigger */}
          {showAdvancedDetails ? (
            <>
              <div className="group flex flex-col gap-[6px]">
                <FieldLabel
                  tooltip={
                    <InfoTooltip
                      label="Scoring"
                      items={[
                        { term: "Ad scoring", def: "Win 2 consecutive points after 40-all to take the game." },
                        { term: "No-Ad scoring", def: "First point after 40-all wins. Receiver chooses serve side." },
                      ]}
                    />
                  }
                >
                  Scoring
                </FieldLabel>
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
                    className={`${fieldControlCls} ${interactiveFieldCls} pr-5 ${formData.adScoring === undefined ? emptyTextCls : filledTextCls}`}
                  >
                    {/* Optional boolean — clear by collapsing the disclosure, not via the select. */}
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
              <div className="group flex flex-col gap-[6px]">
                <FieldLabel
                  tooltip={
                    <InfoTooltip
                      label="Lets"
                      items={[
                        { term: "Stop on lets", def: "Replay the serve when the ball touches the net." },
                        { term: "Play on lets", def: "Net cords stay in play. Used in college and some leagues." },
                      ]}
                    />
                  }
                >
                  Lets
                </FieldLabel>
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
                    className={`${fieldControlCls} ${interactiveFieldCls} pr-5 ${formData.playOnLets === undefined ? emptyTextCls : filledTextCls}`}
                  >
                    {/* Optional boolean — clear by collapsing the disclosure, not via the select. */}
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
            </>
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
      ) : (
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          className="self-start inline-flex items-center gap-1 text-[11px] text-[#3B82F6] hover:text-[#2563EB] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-sm"
        >
          <Plus className="size-3" strokeWidth={1.75} />
          <span>Add match details</span>
        </button>
      )}
    </div>
  );
}
