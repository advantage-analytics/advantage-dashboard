"use client";

import { useRef } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ScoreInput,
  isTiebreakSet,
} from "@/components/dashboard/matches/new-match-wizard/ScoreBlock";
import { scoreColumns } from "@/components/dashboard/matches/new-match-wizard/score-state";
import { validateSetScore } from "@/components/dashboard/matches/new-match-wizard/utils";
import { resultLine } from "@/lib/matches/edit-match-copy";

export type Cells = (number | null)[];

export interface ScoreValue {
  player: Cells;
  opponent: Cells;
  playerTiebreaks: Cells;
  opponentTiebreaks: Cells;
}

/** The first set whose games break tennis rules, with why, or null. */
export function firstInvalidSet(
  score: ScoreValue,
  /** Games in a set — 6 unless a doubles pro-set says 8. */
  gamesTo = 6,
): { index: number; message: string } | null {
  for (let i = 0; i < score.player.length; i++) {
    const v = validateSetScore(score.player[i], score.opponent[i], gamesTo);
    if (v.kind === "invalid") {
      return { index: i, message: v.message ?? "Check this set." };
    }
  }
  return null;
}

/**
 * The Edit Match scorecard — the upload wizard's (`ScoreBlock`) cells and
 * rhythm, driven by the dialog's own score arrays rather than wizard form data.
 *
 * Names read back as text above their cells (they're edited in Players below),
 * the opponent a step quieter. A tiebreak set grows a TB cell. While nobody has
 * won, a dashed cell after the last set takes the next set's first digit; once
 * the match is decided it goes, as in the wizard. Clearing both cells of the
 * last set removes it. A grey line under the cells says who won.
 */
export function EditMatchScore({
  value,
  onChange,
  playerName,
  opponentName,
  bestOf,
  gamesTo = 6,
  disabled,
}: {
  value: ScoreValue;
  onChange: (next: ScoreValue) => void;
  playerName: string;
  opponentName: string;
  bestOf: number;
  /** Games in a set — 6 unless a doubles pro-set says 8. */
  gamesTo?: number;
  disabled?: boolean;
}) {
  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  const key = (row: "p" | "o", i: number, tb = false) =>
    `${row}${i}${tb ? "t" : ""}`;
  const focus = (k: string) =>
    window.setTimeout(() => refs.current[k]?.focus(), 0);

  const sets = value.player.length;
  let filled = 0;
  for (let i = 0; i < sets; i++) {
    if (value.player[i] != null || value.opponent[i] != null) filled = i + 1;
  }
  const { decided } = scoreColumns({
    bestOf,
    gamesTo,
    playerScores: value.player,
    opponentScores: value.opponent,
    filled,
  });
  const ghost = !decided && sets < Math.max(bestOf, 1) && !disabled;
  const invalid = firstInvalidSet(value, gamesTo);
  const tie = (i: number) =>
    isTiebreakSet(value.player[i] ?? null, value.opponent[i] ?? null);

  const setCell = (row: "player" | "opponent", i: number, raw: string) => {
    const n = raw === "" ? null : Math.min(99, Number(raw));
    const next: ScoreValue = {
      player: [...value.player],
      opponent: [...value.opponent],
      playerTiebreaks: [...value.playerTiebreaks],
      opponentTiebreaks: [...value.opponentTiebreaks],
    };
    while (next.player.length <= i) {
      next.player.push(null);
      next.opponent.push(null);
      next.playerTiebreaks.push(null);
      next.opponentTiebreaks.push(null);
    }
    next[row][i] = n;
    if (!isTiebreakSet(next.player[i], next.opponent[i])) {
      next.playerTiebreaks[i] = null;
      next.opponentTiebreaks[i] = null;
    }
    // An emptied last set (never the only one) goes away.
    const last = next.player.length - 1;
    if (
      i === last &&
      last > 0 &&
      next.player[last] == null &&
      next.opponent[last] == null
    ) {
      next.player.pop();
      next.opponent.pop();
      next.playerTiebreaks.pop();
      next.opponentTiebreaks.pop();
    }
    onChange(next);

    if (n === null || raw.length !== 1 || n > gamesTo + 1) return;
    if (isTiebreakSet(next.player[i], next.opponent[i])) {
      focus(key("p", i, true));
    } else if (row === "player") {
      focus(key("o", i));
    } else {
      focus(key("p", i + 1));
    }
  };

  const setTiebreak = (row: "player" | "opponent", i: number, raw: string) => {
    const field = row === "player" ? "playerTiebreaks" : "opponentTiebreaks";
    const nextTb = [...value[field]];
    nextTb[i] = raw === "" ? null : Math.min(999, Number(raw));
    onChange({ ...value, [field]: nextTb });
  };

  const result = resultLine({
    playerName: playerName || "Your player",
    opponentName: opponentName || "Opponent",
    player: value.player,
    opponent: value.opponent,
    bestOf,
    gamesTo,
  });

  // A render function, not a component: declared as a component it would
  // remount on every keystroke and drop the focused cell.
  const renderRow = (row: "player" | "opponent", name: string) => {
    const r = row === "player" ? "p" : "o";
    const cells = row === "player" ? value.player : value.opponent;
    const tbs =
      row === "player" ? value.playerTiebreaks : value.opponentTiebreaks;
    return (
      <div className="flex items-center gap-4">
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[14px]",
            row === "player"
              ? "text-[var(--ink-900)]"
              : "text-[var(--ink-600)]",
          )}
        >
          {name}
        </span>
        <span className="flex gap-3">
          {Array.from({ length: sets }, (_, i) => (
            <span key={i} className="flex gap-3">
              <ScoreInput
                set={i}
                value={cells[i] ?? null}
                invalid={invalid?.index === i}
                onValue={(v) => setCell(row, i, v)}
                inputRef={(el) => {
                  refs.current[key(r, i)] = el;
                }}
                label={`${name}, set ${i + 1}`}
              />
              {tie(i) && (
                <ScoreInput
                  tiebreak
                  set={i}
                  value={tbs[i] ?? null}
                  onValue={(v) => setTiebreak(row, i, v)}
                  inputRef={(el) => {
                    refs.current[key(r, i, true)] = el;
                  }}
                  label={`${name}, set ${i + 1} tiebreak`}
                  onEnter={() =>
                    row === "player"
                      ? focus(key("o", i, true))
                      : focus(key("p", i + 1))
                  }
                />
              )}
            </span>
          ))}
          {ghost && (
            <span className="relative inline-flex size-10 items-center justify-center rounded-[var(--radius-cell)] border border-dashed border-[var(--border-medium)]">
              <Plus
                className="pointer-events-none absolute size-[13px] text-[var(--ink-400)]"
                strokeWidth={1.5}
                aria-hidden
              />
              <input
                ref={(el) => {
                  refs.current[key(r, sets)] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                aria-label={`${name}, add set ${sets + 1}`}
                value=""
                onChange={(e) => {
                  const digit = e.target.value.replace(/[^0-9]/g, "");
                  if (digit) setCell(row, sets, digit);
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
    <section className="flex flex-col gap-3" aria-label="Score">
      <div className="flex items-end gap-4">
        <span className="flex-1 text-[11px] text-[var(--ink-600)]">
          Score
          <span aria-hidden="true" className="ml-0.5 text-[var(--danger)]">
            *
          </span>
        </span>
        <span className="flex gap-3" aria-hidden="true">
          {Array.from({ length: sets }, (_, i) => (
            <span key={i} className="flex gap-3">
              <span className="tabular w-10 text-center text-[11px] text-[var(--ink-500)]">
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
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {renderRow("player", playerName || "Your player")}
        {renderRow("opponent", opponentName || "Opponent")}
      </div>
      {invalid ? (
        <p role="alert" className="text-[11px] text-[var(--danger)]">
          Set {invalid.index + 1}: {invalid.message}
        </p>
      ) : result ? (
        <p className="text-[11px] text-[var(--ink-500)]">{result}</p>
      ) : null}
    </section>
  );
}
