"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advButton } from "@/lib/ui/adv-button";
import { recordResult } from "@/lib/schedule/actions";

const SET_COUNT = 3;

/**
 * The inline row "Add score" opens — and the thing that mints the match.
 *
 * Games, never tiebreak points. A 7-6 set is 7 in the main cell with the
 * tiebreak in the small one, because that is what the vision pipeline is sent
 * and what every score on this page is counted from. Sending 7-6 as the
 * tiebreak points would make the set unreadable and the winner wrong.
 *
 * Our games go first, always. `player1` is our side everywhere downstream —
 * the set ordering sent to the vendor, `transformDbMatch`'s winner, `matchWon`
 * on this page — and flipping it here would attribute the match to the
 * opponent with nothing on screen looking wrong.
 */
export function ScoreEntry({
  entryId,
  ourLabel,
  round,
  initialOpponent,
  onDone,
}: {
  entryId: string;
  ourLabel: string;
  round: string | null;
  initialOpponent: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [opponent, setOpponent] = useState(initialOpponent);
  const [ours, setOurs] = useState<string[]>(Array(SET_COUNT).fill(""));
  const [theirs, setTheirs] = useState<string[]>(Array(SET_COUNT).fill(""));
  const [ourBreaks, setOurBreaks] = useState<string[]>(Array(SET_COUNT).fill(""));
  const [theirBreaks, setTheirBreaks] = useState<string[]>(
    Array(SET_COUNT).fill("")
  );

  function submit() {
    setError(null);

    const played = ours
      .map((_, index) => index)
      .filter((index) => ours[index] !== "" || theirs[index] !== "");

    if (played.length === 0) {
      setError("Enter at least one set.");
      return;
    }
    if (!opponent.trim()) {
      setError("Name the opponent.");
      return;
    }

    startTransition(async () => {
      const result = await recordResult({
        entryId,
        round,
        opponentLabels: opponent.split("/").map((part) => part.trim()).filter(Boolean),
        ourGames: played.map((index) => Number(ours[index] || 0)),
        theirGames: played.map((index) => Number(theirs[index] || 0)),
        ourTiebreaks: played.map((index) =>
          ourBreaks[index] === "" ? null : Number(ourBreaks[index])
        ),
        theirTiebreaks: played.map((index) =>
          theirBreaks[index] === "" ? null : Number(theirBreaks[index])
        ),
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-4">
        <span className="eyebrow">Opponent</span>
        <input
          autoFocus
          value={opponent}
          onChange={(event) => setOpponent(event.target.value)}
          placeholder="Name"
          className="min-w-[160px] border-b border-[var(--border-hairline)] bg-transparent pb-1 text-[13px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-300)]"
        />

        <span className="eyebrow">Score</span>
        <div className="flex items-center gap-3">
          {Array.from({ length: SET_COUNT }).map((_, index) => (
            <div key={index} className="flex gap-1">
              <SetCell
                value={ours[index]}
                onChange={(value) => setOurs(replace(ours, index, value))}
              />
              <SetCell
                value={theirs[index]}
                onChange={(value) => setTheirs(replace(theirs, index, value))}
              />
              <TiebreakCell
                value={ourBreaks[index] || theirBreaks[index]}
                onChange={(value) => {
                  // One cell, whichever side lost the breaker. The set winner
                  // took it 7-x, so the number here belongs to the other side.
                  const ourGames = Number(ours[index] || 0);
                  const theirGames = Number(theirs[index] || 0);
                  if (ourGames > theirGames) {
                    setTheirBreaks(replace(theirBreaks, index, value));
                    setOurBreaks(replace(ourBreaks, index, ""));
                  } else {
                    setOurBreaks(replace(ourBreaks, index, value));
                    setTheirBreaks(replace(theirBreaks, index, ""));
                  }
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-micro" style={{ color: "var(--ink-500)" }}>
          {ourLabel}&rsquo;s games first · tiebreak in the small cell
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
          {pending ? "Saving…" : "Save result"}
        </button>
      </div>
    </div>
  );
}

function replace(list: string[], index: number, value: string): string[] {
  const next = [...list];
  next[index] = value;
  return next;
}

function SetCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={value}
      inputMode="numeric"
      maxLength={2}
      placeholder="–"
      onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, ""))}
      className="tabular h-[30px] w-[26px] rounded-[6px] border border-[#EAECF0] bg-white text-center text-[13px] text-[#0D0D0D] outline-none placeholder:text-[#CCCCCC] focus-visible:border-[#E5E5E5] focus-visible:ring-[#E5E5E5]/30 focus-visible:ring-[1px]"
    />
  );
}

function TiebreakCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={value}
      inputMode="numeric"
      maxLength={2}
      placeholder=""
      aria-label="Tiebreak points for the side that lost it"
      onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, ""))}
      className="tabular h-[30px] w-[26px] rounded-[6px] border border-[#EAECF0] bg-white text-center text-[11px] text-[#525252] outline-none focus-visible:border-[#E5E5E5] focus-visible:ring-[#E5E5E5]/30 focus-visible:ring-[1px]"
    />
  );
}
