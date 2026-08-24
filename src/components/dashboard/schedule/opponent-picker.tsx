"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { ProgramSearchResult } from "@/lib/data/programs-server";
import { programDisplayName, teamLabel } from "@/lib/data/programs-server";

/**
 * 25b's opponent field.
 *
 * Searches the program directory, but accepts free text too. A dual against a
 * club side or a school the ITA scrape missed is a real fixture, and a picker
 * that only offers the directory would make the coach lie about who they
 * played to get past the field.
 *
 * `onChange` carries the directory key ALONGSIDE the name, and null when the
 * name was typed. The name alone is what this used to return, and it is what
 * made an opponent unaggregatable: "Stanford", "Stanford University" and "STAN"
 * are three programs to a GROUP BY and one to a human. The key is what lets a
 * recorded line point at a directory row, and everything on the Opponents page
 * hangs off that.
 *
 * The squad rides along as the third argument for the same reason the key
 * does: the caller already has the row in hand here, and asking the directory
 * a second question to learn something this component just read would be a
 * round-trip for a value that was never lost. Null whenever the key is null —
 * typed text has no squad to report.
 */
export function OpponentPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (
    name: string,
    programKey: string | null,
    team: ProgramSearchResult["team"] | null
  ) => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ProgramSearchResult[]>([]);
  const [editing, setEditing] = useState(value === "");
  // The bare school name behind whichever row was picked, so "Change" can put
  // the coach back where they started. `value` carries the squad by then —
  // "Louisiana State University Men's Tennis" — and the directory matches on
  // the school name, so seeding the search with it would find nothing.
  const [pickedSchool, setPickedSchool] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const query = term.trim();
    // Clearing on a too-short term is the input handler's job, not this
    // effect's — a synchronous setState here cascades a render on every
    // keystroke below the threshold.
    if (!editing || query.length < 2) return;

    // Debounced, and aborted on the next keystroke — the directory route is
    // cached for five minutes, but a request per character still queues them.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/programs/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        if (!response.ok) return;
        const body = (await response.json()) as { results: ProgramSearchResult[] };
        setResults(body.results.slice(0, 6));
      } catch {
        // An aborted fetch is the normal case here, not a failure worth showing.
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, editing]);

  if (!editing) {
    return (
      <div className="flex items-center gap-3 border-b border-[var(--border-hairline)] pb-2 pt-1.5">
        <span
          className="text-[22px] font-light tracking-[-0.4px]"
          style={{ color: "var(--ink-900)" }}
        >
          {value}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            setTerm(pickedSchool ?? value);
            setEditing(true);
            queueMicrotask(() => inputRef.current?.focus());
          }}
          className="cursor-pointer text-[11px] font-medium text-[var(--blue-text)]"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-3 border-b-2 border-[var(--blue)] pb-2 pt-1.5">
        <Search strokeWidth={1.5} className="size-3.5 text-[var(--ink-600)]" />
        <input
          ref={inputRef}
          autoFocus
          value={term}
          onChange={(event) => {
            const next = event.target.value;
            setTerm(next);
            if (next.trim().length < 2) setResults([]);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (!term.trim()) return;
            // Exactly what was typed. A coach naming a club side, or typing a
            // school the directory happens to hold, gets their own words back
            // with no squad appended and no key attached.
            onChange(term.trim(), null, null);
            setPickedSchool(null);
            setEditing(false);
          }}
          placeholder="Search programs, or type any opponent"
          className="w-full bg-transparent text-[22px] font-light tracking-[-0.4px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-300)]"
        />
      </div>

      {results.length > 0 ? (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-[var(--radius-dropdown)] border border-[var(--border-medium)] bg-[var(--surface-card)] p-1.5 shadow-[var(--shadow-floating)]">
          {results.map((result) => (
            <button
              key={result.programKey}
              type="button"
              onClick={() => {
                // The squad, not the school. Two rows come back for a program
                // that fields both, and "Louisiana State University" alone is
                // the same string on either — on the schedule, in the lineup
                // header, and in the event this dual becomes.
                onChange(
                  programDisplayName(result.schoolName, result.team),
                  result.programKey,
                  result.team
                );
                setPickedSchool(result.schoolName);
                setEditing(false);
                setResults([]);
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] px-[11px] py-2.5 text-left transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]"
            >
              <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                <span className="truncate text-[13px] text-[var(--ink-900)]">
                  {result.schoolName}
                </span>
                {/* Beside the name, not out at the meta edge: it is what tells
                    one identical-looking row from the other. */}
                <span
                  className="text-micro shrink-0"
                  style={{ color: "var(--ink-600)" }}
                >
                  {teamLabel(result.team)}
                </span>
              </span>
              <span
                className="text-micro shrink-0"
                style={{ color: "var(--ink-600)" }}
              >
                {result.division ?? result.state ?? ""}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
