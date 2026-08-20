"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ScoreEntry } from "@/components/dashboard/schedule/score-entry";
import type { EventEntry } from "@/lib/schedule/types";

const ROUNDS = ["Q1", "Q2", "Q3", "R64", "R32", "R16", "QF", "SF", "F", "C1", "C2"];

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
      onClick={() => setOpen(true)}
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
