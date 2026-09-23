"use client";

import { useRef } from "react";
import { HelpCircle, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { scoreColumns } from "./score-state";
import type { FormData } from "./types";
import { setHasData } from "./utils";
import { FieldCaption } from "./FieldCaption";
import { floatMenuCls, focusRingCls } from "./styles";

export { Required } from "./FieldCaption";

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
  onEnter,
  onTab,
  set,
}: {
  value: number | null;
  onValue: (v: string) => void;
  inputRef?: (el: HTMLInputElement | null) => void;
  label: string;
  tiebreak?: boolean;
  invalid?: boolean;
  /** Called on Enter; the keypress is always prevented so no form submits. */
  onEnter?: () => void;
  /**
   * Called on a plain Tab (no Shift or other modifier). Returns whether it
   * moved focus; only then is the keypress prevented, so a cell with nowhere
   * to send focus lets Tab leave the grid as the browser would.
   */
  onTab?: () => boolean;
  /** Zero-based set index, so a caller can find one set's cells in the DOM. */
  set?: number;
}) => (
  <input
    ref={inputRef}
    type="text"
    inputMode="numeric"
    data-set={set}
    maxLength={tiebreak ? 3 : 2}
    aria-label={label}
    aria-invalid={invalid || undefined}
    value={value === null ? "" : String(value)}
    onChange={(e) => onValue(e.target.value.replace(/[^0-9]/g, ""))}
    onFocus={(e) => e.currentTarget.select()}
    onKeyDown={(e) => {
      if (e.key === "Enter" && onEnter) {
        e.preventDefault();
        onEnter();
        return;
      }
      if (
        e.key === "Tab" &&
        onTab &&
        !e.shiftKey &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        onTab()
      )
        e.preventDefault();
    }}
    data-focus-ring="none"
    className={cn(
      CELL_CLS,
      tiebreak && "text-[13px] text-[var(--ink-700)]",
      invalid && "border-[var(--error)]",
    )}
  />
);

// ---------------------------------------------------------------------------
// "How to enter a tiebreak" — help beside the Score caption

/**
 * A smaller, read-only `CELL_CLS`: plain spans, never inputs, so the digit
 * path (and `useWizardKeys`) never counts them. Purely illustrative.
 */
const MINI_CELL_CLS =
  "tabular inline-flex size-[22px] items-center justify-center rounded-[var(--radius-cell)] border border-[var(--border-medium)] bg-white text-[11px] text-[var(--ink-900)]";

const TIEBREAK_EXAMPLES: readonly {
  rows: readonly (readonly [games: number, tiebreak: number])[];
  lead: string;
  rest: string;
}[] = [
  {
    rows: [
      [7, 7],
      [6, 4],
    ],
    lead: "A set that ends 7–6.",
    rest: "Type the games and a TB box opens beside the set. The tiebreak points go in it.",
  },
  {
    rows: [
      [1, 10],
      [0, 8],
    ],
    lead: "A match tiebreak for the third set.",
    rest: "Enter that set as 1–0 to whoever won it, then the points in its TB box.",
  },
];

function TiebreakHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex cursor-pointer items-center gap-1 text-[11px] leading-[1.4] text-[var(--ink-600)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--ink-900)]",
            focusRingCls,
          )}
        >
          <HelpCircle
            className="size-[11px]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          How to enter a tiebreak
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className={cn(floatMenuCls, "w-[360px] gap-3.5 p-4")}
      >
        <span className="text-[13px] font-medium text-[var(--ink-900)]">
          Entering a tiebreak
        </span>
        {TIEBREAK_EXAMPLES.map((ex) => (
          <div
            key={ex.lead}
            className="grid grid-cols-[auto_1fr] items-start gap-3.5"
          >
            <span aria-hidden="true" className="flex flex-col gap-[3px]">
              {ex.rows.map(([games, tb], r) => (
                <span key={r} className="flex gap-[3px]">
                  <span className={MINI_CELL_CLS}>{games}</span>
                  <span
                    className={cn(
                      MINI_CELL_CLS,
                      "border-[var(--blue)] text-[10px] text-[var(--ink-700)]",
                    )}
                  >
                    {tb}
                  </span>
                </span>
              ))}
            </span>
            <p className="text-[12px] leading-[1.45] text-[var(--ink-700)]">
              <span className="font-medium text-[var(--ink-900)]">
                {ex.lead}
              </span>
              {` ${ex.rest}`}
            </p>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function ScoreBlock({
  formData,
  playerName,
  opponentName,
  fromLine,
  opponentSlot,
  onScoreChange,
  onTiebreakChange,
  onSetsChange,
  gamesTo = 6,
  setsLabel,
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
  /** "Best of 3 · No-Ad" when a line declared the format. */
  fromLine: boolean;
  /**
   * Drawn in place of the opponent's name on their row — the score page names
   * an opponent the lineup left blank right where the name reads.
   */
  opponentSlot?: React.ReactNode;
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
  /**
   * Games in a set — 6, or 8 for a doubles line whose dual plays an 8-game
   * pro-set. Only the schedule's score page passes it; the upload wizard never
   * scores doubles, so it stays on 6.
   */
  gamesTo?: number;
  /**
   * Replaces the "Best of N" half of the format line. A doubles line is one
   * set, and "Best of 1" would not say whether it runs to 6 or is a pro-set.
   */
  setsLabel?: string;
}) {
  const bestOf = parseInt(formData.bestOf, 10) || 3;
  // Sets with anything in them, counted from the front.
  let filled = 0;
  for (let i = 0; i < bestOf; i++) {
    if (setHasData(formData, i)) filled = i + 1;
  }
  // Columns follow the match: two to start, one more once every set so far
  // is finished, and none once someone has won it (`scoreColumns`). The dashed
  // column after the last is how a set gets added while the match is open.
  const { displayed, decided } = scoreColumns({
    bestOf,
    gamesTo,
    playerScores: formData.playerScores,
    opponentScores: formData.opponentScores,
    filled,
  });
  const ghost = !decided && displayed < bestOf;

  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  const key = (row: "p" | "o", i: number, tb = false) =>
    `${row}${i}${tb ? "t" : ""}`;
  const focusKey = (k: string) =>
    window.setTimeout(() => refs.current[k]?.focus(), 0);

  const isGameEntry = (value: string) =>
    /^\d$/.test(value) && Number(value) <= gamesTo + 1;

  // A digit, whatever its value. `isGameEntry` answers "should focus move on",
  // which is a narrower question than "is this worth recording": a set can open
  // 8-6 or 9-7, and those digits have to land in the cell even though nothing
  // should advance off them yet.
  const isDigit = (value: string) => /^\d$/.test(value);

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
    // A complete game digit advances focus; tiebreak cells wait for Enter.
    // Out-of-range values stay put so they can be corrected, and the last
    // available game cell deliberately has nowhere to send focus.
    if (!isGameEntry(v)) return;
    // If this digit completes a tiebreak pair with the other row's existing
    // value (7-6, 6-7, 1-0 in either row), the tiebreak cell that just
    // appeared gets focus instead of wherever a plain game digit would send
    // it — the player's tiebreak cell for this same set.
    const typed = Number(v);
    const playerVal =
      row === "player" ? typed : (formData.playerScores[i] ?? null);
    const opponentVal =
      row === "opponent" ? typed : (formData.opponentScores[i] ?? null);
    if (isTiebreakSet(playerVal, opponentVal)) {
      focusKey(key("p", i, true));
      return;
    }
    if (row === "player") {
      focusKey(key("o", i));
      return;
    }
    // Where the opponent's digit sends focus depends on what it just did to
    // the match, so measure the columns with it in place: a split opens the
    // next set, a clinched match has nowhere left to go.
    const opponentScores = [...formData.opponentScores];
    opponentScores[i] = typed;
    const next = scoreColumns({
      bestOf,
      gamesTo,
      playerScores: formData.playerScores,
      opponentScores,
      filled: Math.max(filled, i + 1),
    });
    if (i + 1 < next.displayed) focusKey(key("p", i + 1));
  };

  // Enter in a tiebreak cell: player -> opponent tiebreak (same set);
  // opponent -> next set's player cell, or nowhere past the last set.
  const tiebreakTarget = (row: "player" | "opponent", i: number) =>
    row === "player"
      ? key("o", i, true)
      : i + 1 < displayed || ghost
        ? key("p", i + 1)
        : null;
  const enterTiebreak = (row: "player" | "opponent", i: number) => {
    const k = tiebreakTarget(row, i);
    if (k) focusKey(k);
  };

  // Tab walks the path a digit does, not DOM order (which runs along the
  // player's whole row first): player -> opponent cell of the same set;
  // opponent -> the player's tiebreak box when the set went to one (where a
  // digit completing that pair lands), else the next set's player cell or the
  // dashed add-set cell. With nowhere left to go it returns false and Tab
  // leaves the grid, so a keyboard user is never trapped in it.
  const gameTabTarget = (row: "player" | "opponent", i: number) => {
    if (row === "player") return key("o", i);
    if (tie(i)) return key("p", i, true);
    return i + 1 < displayed || ghost ? key("p", i + 1) : null;
  };
  const tabTo = (k: string | null) => {
    if (!k || !refs.current[k]) return false;
    focusKey(k);
    return true;
  };

  // Typing in the dashed column adds the set and keeps the digit.
  //
  // Records first, advances second — the same order `setDigit` uses above, and
  // for the same reason. Gating the RECORD on `isGameEntry` silently dropped
  // an 8 or a 9, so a third set opening 8-6 or 9-7 could not be started at all:
  // the cell is `maxLength={1}`, so there was no second keystroke to recover
  // with, and the same digit typed into an existing cell was accepted. The
  // range check belongs to focus movement, not to whether the value is kept.
  const ghostDigit = (row: "player" | "opponent", v: string) => {
    if (!isDigit(v)) return;
    onScoreChange(row, displayed, v);
    if (!isGameEntry(v)) return;
    focusKey(row === "player" ? key("o", displayed) : key("p", displayed + 1));
  };

  const format = `${setsLabel ?? FORMAT_OPTIONS.find((o) => o.value === formData.bestOf)?.label ?? "Best of 3"}${
    formData.adScoring === undefined
      ? ""
      : formData.adScoring
        ? " · Ad"
        : " · No-Ad"
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
        {row === "opponent" && opponentSlot ? (
          <span className="relative flex min-w-0 flex-1">{opponentSlot}</span>
        ) : (
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[14px]",
              muted ? "text-[var(--ink-600)]" : "text-[var(--ink-900)]",
            )}
          >
            {name}
          </span>
        )}
        <span className="flex gap-3">
          {Array.from({ length: displayed }, (_, i) => (
            <span key={i} className="flex gap-3">
              <ScoreInput
                set={i}
                value={scores[i] ?? null}
                onValue={(v) => setDigit(row, i, v)}
                inputRef={(el) => {
                  refs.current[key(r, i)] = el;
                }}
                label={`${name}, set ${i + 1}`}
                onTab={() => tabTo(gameTabTarget(row, i))}
              />
              {tie(i) && (
                <ScoreInput
                  tiebreak
                  set={i}
                  value={tbs[i] ?? null}
                  onValue={(v) => onTiebreakChange(row, i, v)}
                  inputRef={(el) => {
                    refs.current[key(r, i, true)] = el;
                  }}
                  label={`${name}, set ${i + 1} tiebreak`}
                  onEnter={() => enterTiebreak(row, i)}
                  onTab={() => tabTo(tiebreakTarget(row, i))}
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
                // The dashed pair follows the digit path too: the player's
                // cell tabs to the opponent's; the opponent's is the end.
                onKeyDown={(e) => {
                  if (
                    e.key === "Tab" &&
                    row === "player" &&
                    !e.shiftKey &&
                    !e.altKey &&
                    !e.ctrlKey &&
                    !e.metaKey &&
                    tabTo(key("o", displayed))
                  )
                    e.preventDefault();
                }}
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
        <FieldCaption label="Score" required />
        {/* An 8-game doubles pro-set has no 7-6 set and no match tiebreak,
            so neither worked example applies there. */}
        {gamesTo !== 8 && <TiebreakHelp />}
        <span className="flex-1" />
        <span className="text-[12px] text-[var(--ink-600)]">{format}</span>
      </div>
      {/* Set numbers over the cells, in the caption's 11px; a TB column where one is. */}
      <div className="flex justify-end gap-3 pr-0.5">
        {Array.from({ length: displayed }, (_, i) => (
          <span key={i} className="flex gap-3">
            <span className="w-10 text-center text-[11px] text-[var(--ink-500)]">
              {i + 1}
            </span>
            {tie(i) && (
              <span className="w-10 text-center text-[11px] text-[var(--ink-500)]">
                TB
              </span>
            )}
          </span>
        ))}
        {ghost && <span className="w-10" />}
      </div>
      {renderRow("player", playerName || "You", false)}
      {renderRow("opponent", opponentName || "Opponent", true)}
      {/* Size set here rather than via `text-micro`: that DS class is
          unlayered and its --ink-500 would beat this line's --ink-600. */}
      <span className="pt-0.5 text-[11px] leading-[1.4] text-[var(--ink-600)]">
        Each digit moves to the next box{" "}
        <span className="text-[var(--ink-300)]">·</span>{" "}
        <Kbd size="sm" className="align-middle">
          tab
        </Kbd>{" "}
        or{" "}
        <Kbd size="sm" className="align-middle">
          enter
        </Kbd>{" "}
        leaves a tiebreak box
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
