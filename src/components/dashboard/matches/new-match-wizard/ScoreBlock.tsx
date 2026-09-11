"use client";

import { useRef } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FormData } from "./types";
import { setHasData } from "./utils";

export function Required() {
  return (
    <span
      aria-label="Required"
      className="text-[12px] leading-none text-[var(--error)]"
    >
      *
    </span>
  );
}

export const FORMAT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "1", label: "Best of 1" },
  { value: "3", label: "Best of 3" },
  { value: "5", label: "Best of 5" },
];

/** A set whose games say a tiebreak was played — 7-6, or 1-0 for a match tiebreak. */
export function isTiebreakSet(p: number | null, o: number | null): boolean {
  if (p === null || o === null) return false;
  const high = Math.max(p, o);
  const low = Math.min(p, o);
  return (high >= 7 && high - low === 1) || (high === 1 && low === 0);
}

// ---------------------------------------------------------------------------
// The score

export const CELL_CLS =
  "tabular inline-flex size-10 items-center justify-center rounded-[var(--radius-cell)] border border-[var(--border-medium)] bg-white text-center text-[16px] text-[var(--ink-900)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[1.5px] focus:border-[var(--blue)] focus:shadow-[0_0_0_2px_var(--blue-tint-12)]";

export const ScoreInput = ({
  value,
  onValue,
  inputRef,
  label,
  tiebreak = false,
  invalid = false,
}: {
  value: number | null;
  onValue: (v: string) => void;
  inputRef?: (el: HTMLInputElement | null) => void;
  label: string;
  tiebreak?: boolean;
  invalid?: boolean;
}) => (
  <input
    ref={inputRef}
    type="text"
    inputMode="numeric"
    maxLength={tiebreak ? 3 : 2}
    aria-label={label}
    aria-invalid={invalid || undefined}
    value={value === null ? "" : String(value)}
    onChange={(e) => onValue(e.target.value.replace(/[^0-9]/g, ""))}
    onFocus={(e) => e.currentTarget.select()}
    data-focus-ring="none"
    className={cn(
      CELL_CLS,
      tiebreak && "text-[13px] text-[var(--ink-700)]",
      invalid && "border-[var(--error)]",
    )}
  />
);

export function ScoreBlock({
  formData,
  playerName,
  opponentName,
  fromLine,
  onScoreChange,
  onTiebreakChange,
  onSetsChange,
}: {
  formData: Pick<
    FormData,
    | "bestOf"
    | "adScoring"
    | "playerScores"
    | "opponentScores"
    | "playerTiebreaks"
    | "opponentTiebreaks"
    | "numberOfSets"
  >;
  playerName: string;
  opponentName: string;
  /** "Best of 3 · no-ad" when a line declared the format. */
  fromLine: boolean;
  onScoreChange: (
    player: "player" | "opponent",
    index: number,
    value: string,
  ) => void;
  onTiebreakChange: (
    player: "player" | "opponent",
    index: number,
    value: string,
  ) => void;
  onSetsChange: (count: number) => void;
}) {
  const bestOf = parseInt(formData.bestOf, 10) || 3;
  // Sets with anything in them, counted from the front.
  let filled = 0;
  for (let i = 0; i < bestOf; i++) {
    if (setHasData(formData, i)) filled = i + 1;
  }
  // Two columns to start, one more than is filled after that, never past the
  // format. The dashed column after the last is how a set gets added.
  const displayed = Math.min(bestOf, Math.max(2, filled + 1));
  const ghost = displayed < bestOf;

  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  const key = (row: "p" | "o", i: number, tb = false) =>
    `${row}${i}${tb ? "t" : ""}`;
  const focusKey = (k: string) =>
    window.setTimeout(() => refs.current[k]?.focus(), 0);

  const isGameEntry = (value: string) =>
    /^\d$/.test(value) && Number(value) <= 7;

  const tie = (i: number) =>
    isTiebreakSet(
      formData.playerScores[i] ?? null,
      formData.opponentScores[i] ?? null,
    );

  const setDigit = (row: "player" | "opponent", i: number, v: string) => {
    onScoreChange(row, i, v);
    if (v.length === 0) {
      // Clearing the last set's cells removes it.
      const other =
        row === "player"
          ? formData.opponentScores[i]
          : formData.playerScores[i];
      if (
        i === displayed - 1 &&
        i >= 2 &&
        (other === null || other === undefined)
      )
        onSetsChange(i);
      return;
    }
    // A complete game digit advances focus; tiebreak cells wait for Tab.
    // Out-of-range values stay put so they can be corrected, and the last
    // available game cell deliberately has nowhere to send focus.
    if (!isGameEntry(v)) return;
    if (row === "player") focusKey(key("o", i));
    else if (i + 1 < displayed || ghost) focusKey(key("p", i + 1));
  };

  // Typing in the dashed column adds the set and keeps the digit.
  const ghostDigit = (row: "player" | "opponent", v: string) => {
    if (!isGameEntry(v)) return;
    onScoreChange(row, displayed, v);
    focusKey(row === "player" ? key("o", displayed) : key("p", displayed + 1));
  };

  const format = `${FORMAT_OPTIONS.find((o) => o.value === formData.bestOf)?.label ?? "Best of 3"}${
    formData.adScoring === undefined
      ? ""
      : formData.adScoring
        ? " · ad"
        : " · no-ad"
  }`;

  // A render function, not a component: declared inside render, a component
  // would remount on every keystroke and lose the cell that has focus.
  const renderRow = (
    row: "player" | "opponent",
    name: string,
    muted: boolean,
  ) => {
    const scores =
      row === "player" ? formData.playerScores : formData.opponentScores;
    const tbs =
      row === "player" ? formData.playerTiebreaks : formData.opponentTiebreaks;
    const r = row === "player" ? "p" : "o";
    return (
      <div className="flex items-center gap-4">
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[14px]",
            muted ? "text-[var(--ink-600)]" : "text-[var(--ink-900)]",
          )}
        >
          {name}
        </span>
        <span className="flex gap-3">
          {Array.from({ length: displayed }, (_, i) => (
            <span key={i} className="flex gap-3">
              <ScoreInput
                value={scores[i] ?? null}
                onValue={(v) => setDigit(row, i, v)}
                inputRef={(el) => {
                  refs.current[key(r, i)] = el;
                }}
                label={`${name}, set ${i + 1}`}
              />
              {tie(i) && (
                <ScoreInput
                  tiebreak
                  value={tbs[i] ?? null}
                  onValue={(v) => onTiebreakChange(row, i, v)}
                  inputRef={(el) => {
                    refs.current[key(r, i, true)] = el;
                  }}
                  label={`${name}, set ${i + 1} tiebreak`}
                />
              )}
            </span>
          ))}
          {ghost && (
            <span
              key={displayed}
              className="relative inline-flex size-10 items-center justify-center rounded-[var(--radius-cell)] border border-dashed border-[var(--border-medium)]"
            >
              <Plus
                className="pointer-events-none absolute size-[13px] text-[var(--ink-400)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <input
                ref={(el) => {
                  refs.current[key(r, displayed)] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                aria-label={`${name}, add set ${displayed + 1}`}
                value=""
                onChange={(e) =>
                  ghostDigit(row, e.target.value.replace(/[^0-9]/g, ""))
                }
                data-focus-ring="none"
                className="size-full cursor-text bg-transparent text-center text-[16px] text-[var(--ink-900)] outline-none focus:rounded-[var(--radius-cell)] focus:shadow-[0_0_0_1.5px_var(--blue)]"
              />
            </span>
          )}
        </span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-baseline gap-3">
        <span className="inline-flex items-center gap-1">
          <span className="eyebrow">Score</span>
          <Required />
        </span>
        <span className="flex-1" />
        <span className="text-[12px] text-[var(--ink-600)]">{format}</span>
      </div>
      {/* Set numbers as eyebrows over the cells; a TB column where one is. */}
      <div className="flex justify-end gap-3 pr-0.5">
        {Array.from({ length: displayed }, (_, i) => (
          <span key={i} className="flex gap-3">
            <span
              className="eyebrow-sm w-10 text-center"
              style={{ color: "var(--ink-400)" }}
            >
              {i + 1}
            </span>
            {tie(i) && (
              <span
                className="eyebrow-sm w-10 text-center"
                style={{ color: "var(--ink-400)" }}
              >
                TB
              </span>
            )}
          </span>
        ))}
        {ghost && <span className="w-10" />}
      </div>
      {renderRow("player", playerName || "You", false)}
      {renderRow("opponent", opponentName || "Opponent", true)}
      <span className="text-micro pt-0.5">
        Digits move on <span className="text-[var(--ink-300)]">·</span> tiebreak
        cells appear on their own
        {ghost && (
          <>
            {" "}
            <span className="text-[var(--ink-300)]">·</span> type in the dashed
            column to add a set
          </>
        )}
        {fromLine && (
          <>
            {" "}
            <span className="text-[var(--ink-300)]">·</span> format from the
            event
          </>
        )}
      </span>
    </div>
  );
}
