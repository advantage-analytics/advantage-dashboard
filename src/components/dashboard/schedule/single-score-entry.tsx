"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advButton } from "@/lib/ui/adv-button";

const SET_COUNT = 3;

/**
 * Adding a score to a single match.
 *
 * Goes through `PATCH /api/matches/[matchId]` rather than `recordResult`: that
 * action mints a match FROM an entry, and a single match has no entry — it
 * already exists. The route is the shipped path for editing a score and it
 * validates the shape server-side, so this stays a form rather than a second
 * copy of the rules.
 *
 * Games, never tiebreak points. A 7-6 set is 7 here with the tiebreak in the
 * small cell; sending the tiebreak as the game count makes the set unreadable
 * and the winner wrong.
 */
export function SingleScoreEntry({
  matchId,
  playerName,
  onDone,
}: {
  matchId: string;
  playerName: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [ours, setOurs] = useState<string[]>(Array(SET_COUNT).fill(""));
  const [theirs, setTheirs] = useState<string[]>(Array(SET_COUNT).fill(""));
  const [breaks, setBreaks] = useState<string[]>(Array(SET_COUNT).fill(""));

  function submit() {
    setError(null);
    const played = [0, 1, 2].filter(
      (index) => ours[index] !== "" || theirs[index] !== ""
    );
    if (played.length === 0) {
      setError("Enter at least one set.");
      return;
    }

    startTransition(async () => {
      // The tiebreak belongs to whoever LOST the set — the winner took it 7-x.
      const ourTb: (number | null)[] = [];
      const theirTb: (number | null)[] = [];
      for (const index of played) {
        const value = breaks[index] === "" ? null : Number(breaks[index]);
        const weWon = Number(ours[index] || 0) > Number(theirs[index] || 0);
        ourTb.push(weWon ? null : value);
        theirTb.push(weWon ? value : null);
      }

      const response = await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          score: {
            player1: played.map((index) => Number(ours[index] || 0)),
            player2: played.map((index) => Number(theirs[index] || 0)),
            player1_tiebreaks: ourTb,
            player2_tiebreaks: theirTb,
          },
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error ?? "Couldn't save that score.");
        return;
      }
      onDone();
      router.refresh();
    });
  }

  function replace(list: string[], index: number, value: string) {
    const next = [...list];
    next[index] = value.replace(/[^0-9]/g, "");
    return next;
  }

  return (
    <div className="flex flex-col gap-3 py-3.5">
      <div className="flex flex-wrap items-center gap-4">
        <span className="eyebrow">Score</span>
        <div className="flex items-center gap-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex gap-1">
              <Cell
                value={ours[index]}
                onChange={(value) => setOurs(replace(ours, index, value))}
              />
              <Cell
                value={theirs[index]}
                onChange={(value) => setTheirs(replace(theirs, index, value))}
              />
              <Cell
                small
                value={breaks[index]}
                onChange={(value) => setBreaks(replace(breaks, index, value))}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-micro" style={{ color: "var(--ink-500)" }}>
          {playerName}&rsquo;s games first · tiebreak in the small cell
        </span>
        <div className="flex-1" />
        {error ? (
          <span className="text-[11px]" style={{ color: "var(--danger)" }}>
            {error}
          </span>
        ) : null}
        <button type="button" className={advButton("ghost", "sm")} onClick={onDone}>
          Cancel
        </button>
        <button
          type="button"
          disabled={pending}
          className={advButton("primary", "sm")}
          onClick={submit}
        >
          {pending ? "Saving…" : "Save score"}
        </button>
      </div>
    </div>
  );
}

function Cell({
  value,
  onChange,
  small,
}: {
  value: string;
  onChange: (value: string) => void;
  small?: boolean;
}) {
  return (
    <input
      value={value}
      inputMode="numeric"
      maxLength={2}
      placeholder={small ? "" : "–"}
      aria-label={small ? "Tiebreak points for the side that lost it" : "Games"}
      onChange={(event) => onChange(event.target.value)}
      className={`tabular h-[30px] w-[26px] rounded-[6px] border border-[#EAECF0] bg-white text-center outline-none focus-visible:border-[#E5E5E5] ${
        small
          ? "text-[11px] text-[#525252]"
          : "text-[13px] text-[#0D0D0D] placeholder:text-[#CCCCCC]"
      }`}
    />
  );
}
