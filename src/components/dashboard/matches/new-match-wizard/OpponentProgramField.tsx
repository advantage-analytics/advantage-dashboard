"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { ProgramSearchResult } from "@/lib/data/programs-server";

/**
 * Which program the opponent plays for.
 *
 * ── Why this is a separate field and not a replacement ──────────────────────
 * The name input beside it is untouched. It is on the file-import path that
 * `docs/ui-revamp-guardrails.md` §2 says to leave alone, every existing upload
 * flows through it, and a coach uploading a practice set against a hitting
 * partner has no program to name. So this is additive and skippable: the name
 * is still the whole requirement, and this only ever adds an identity to it.
 *
 * ── What picking one does ───────────────────────────────────────────────────
 * The typed name plus this program become a `program_players` row on the
 * opponent's roster, via `contribute_opponent_player` — converging on the row
 * if another program already recorded them. That id lands in
 * `matches.opponent_player_id`, which is what lets an opponent's profile
 * aggregate across every time you played them rather than string-matching a
 * name that drifts.
 *
 * Deliberately NOT `matches.player2_id`: that column is in the `matches` SELECT
 * policy and would hand the opponent our statistics the day they claim the
 * profile. Migration 20260823090000 has the long version.
 */
export function OpponentProgramField({
  schoolName,
  onChange,
}: {
  schoolName: string | undefined;
  onChange: (schoolName: string | null, programKey: string | null) => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ProgramSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const query = term.trim();
    // Same shape as the schedule's picker: clearing below the threshold is the
    // input handler's job, so this effect never sets state synchronously on a
    // keystroke that cannot produce results.
    if (!open || query.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/programs/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        if (!response.ok) return;
        const body = (await response.json()) as { results: ProgramSearchResult[] };
        setResults(body.results.slice(0, 5));
      } catch {
        // An aborted fetch is the normal case on the next keystroke.
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, open]);

  if (schoolName) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="truncate text-[12px] text-[#666666]">{schoolName}</span>
        <button
          type="button"
          aria-label="Remove opponent program"
          onClick={() => {
            onChange(null, null);
            setTerm("");
            setResults([]);
          }}
          className="cursor-pointer text-[#AAAAAA] transition-colors hover:text-[#0D0D0D]"
        >
          <X className="size-3" strokeWidth={1.5} aria-hidden />
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          queueMicrotask(() => inputRef.current?.focus());
        }}
        className="cursor-pointer text-[12px] text-[#3B82F6] transition-opacity hover:opacity-80"
      >
        Add their program
      </button>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5">
        <Search strokeWidth={1.5} className="size-3 shrink-0 text-[#AAAAAA]" aria-hidden />
        <input
          ref={inputRef}
          value={term}
          onChange={(event) => {
            const next = event.target.value;
            setTerm(next);
            if (next.trim().length < 2) setResults([]);
          }}
          onBlur={() => {
            // Closing on blur would fire before the result's click lands.
            if (!term.trim()) setOpen(false);
          }}
          placeholder="Search programs"
          aria-label="Opponent program"
          className="w-full min-w-0 bg-transparent text-[12px] text-[#0D0D0D] outline-none placeholder:text-[#AAAAAA]"
        />
      </div>

      {results.length > 0 && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-30 w-[260px] rounded-[var(--radius-dropdown)] border border-[var(--border-medium)] bg-white p-1.5 shadow-[var(--shadow-floating)]">
          {results.map((result) => (
            <button
              key={result.programKey}
              type="button"
              // `onMouseDown`, not `onClick` — blur fires first otherwise and
              // the field closes out from under the pointer.
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(result.schoolName, result.programKey);
                setOpen(false);
                setResults([]);
                setTerm("");
              }}
              className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-element)] px-2 py-1.5 text-left transition-colors hover:bg-[#F7F7F7]"
            >
              <span className="min-w-0 flex-1 truncate text-[12px] text-[#0D0D0D]">
                {result.schoolName}
              </span>
              <span className="shrink-0 text-[10px] text-[#888888]">
                {result.division ?? result.state ?? ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
