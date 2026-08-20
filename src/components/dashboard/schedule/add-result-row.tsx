"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ScoreEntry } from "@/components/dashboard/schedule/score-entry";
import { ROUND_ORDER } from "@/lib/schedule/format";
import type { EventEntry } from "@/lib/schedule/types";

// The same ladder the run is sorted by. Two lists would let the picker offer a
// round the sort does not know, which sends that match to the end of the run.
const ROUNDS = ROUND_ORDER;

/**
 * "Add first result" / "Add result" under a tournament entry.
 *
 * A tournament entry produces a match per round, so this asks for the round
 * before the score — that is the one thing a dual line never needs, because its
 * court IS its round.
 */
export function AddResultRow({ entry }: { entry: EventEntry }) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(() => nextRound(entry));

  /**
   * Recompute the suggested round every time the form OPENS, not once at mount.
   *
   * This component stays mounted across the refresh that follows a save, so a
   * `useState` initializer keeps offering the round that was just recorded.
   * Combined with recordResult's (entry, round) de-duplication that is worse
   * than a wrong default: saving would UPDATE the round just entered instead of
   * adding the next one, and the coach's previous result would vanish with no
   * error.
   */
  function openForm() {
    setRound(nextRound(entry));
    setOpen(true);
  }

  if (open) {
    return (
      <div className="flex flex-col gap-2 pt-2">
        <div className="flex items-center gap-3">
          <span className="eyebrow">Round</span>
          <select
            value={round}
            onChange={(event) => setRound(event.target.value)}
            className="cursor-pointer border-b border-[var(--border-hairline)] bg-transparent pb-1 text-[13px] text-[var(--ink-900)] outline-none"
          >
            {ROUNDS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <ScoreEntry
          entryId={entry.id}
          ourLabel={entry.playerLabels[0] ?? "Our player"}
          round={round}
          initialOpponent=""
          onDone={() => setOpen(false)}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={openForm}
      className="inline-flex cursor-pointer items-center gap-1.5 py-2.5 text-[11px] font-medium text-[var(--blue)]"
    >
      <Plus strokeWidth={2} className="size-3" />
      {entry.matches.length === 0 ? "Add first result" : "Add result"}
    </button>
  );
}

/** The round after the last one recorded, so the common case is pre-picked. */
function nextRound(entry: EventEntry): string {
  const last = entry.matches[entry.matches.length - 1]?.round;
  if (!last) {
    return entry.draw?.toLowerCase().includes("qualif") ? "Q1" : "R32";
  }
  const index = ROUNDS.indexOf(last);
  return index >= 0 && index < ROUNDS.length - 1 ? ROUNDS[index + 1] : last;
}
