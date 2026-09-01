"use client";

/*
 * DORMANT — no route renders this file. Its rail is now the left pane of
 * `static/dual-build-step.tsx`, which folded step one's school list into the
 * builder rather than keeping a separate rail component.
 *
 * See `./README.md` for the full live/dormant map.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import {
  historyForProgram,
  schoolRowSubline,
} from "@/components/dashboard/schedule/school-search";
import {
  formatOpponentRecord,
  opponentHistoryFor,
  type OpponentDualHistory,
} from "@/lib/schedule/opponent-history";
import { programDisplayName } from "@/lib/data/programs-server";
import type { ProgramSearchResult } from "@/lib/data/programs-server";

/**
 * 2b — the dual builder's persistent opponent rail.
 *
 * Step one asked which school; this keeps the answer on screen and revisable
 * without a screen hop. The conference list is always in view, a typed term
 * searches all 1,940 programs, and clicking a row re-targets the dual through
 * `onPick` — which upstream is `takeOpponent`, the one setter that moves the
 * name and the directory row together. The date, the site, the surface, the
 * format and our own lineup belong to the fixture, not to the opponent, and
 * survive a re-target untouched; the opposing names belong to the school that
 * was on screen when they were typed, so switching schools clears them.
 *
 * Rows and their sublines are `school-search.tsx`'s, via the helpers it
 * exports — same history lookup, same "Men's · Big Ten · you lead 3–1"
 * vocabulary — so the school a coach picked on step one reads identically
 * when it reappears here.
 */
export function OpponentRail({
  ourConference,
  ourProgramKey,
  conferencePrograms,
  historyEntries,
  currentName,
  currentProgram,
  onPick,
}: {
  /** From `getTeamSettings` — names the search placeholder's home turf. */
  ourConference: string | null;
  /** So a program cannot re-target a dual onto itself out of the directory. */
  ourProgramKey: string | null;
  /** `getConferenceTable`'s rows, own program already dropped. */
  conferencePrograms: ProgramSearchResult[];
  /** `opponentDualHistory()`'s map, flattened — see `SchoolSearch`. */
  historyEntries: [string, OpponentDualHistory][];
  /** The dual's current opponent as stored — squad-qualified for a pick. */
  currentName: string;
  /** The directory row behind `currentName`, null for a free-text opponent. */
  currentProgram: ProgramSearchResult | null;
  /**
   * Same contract as `SchoolSearch.onChosen`: the directory row rides
   * ALONGSIDE the name, null when the name was typed. The key on that row is
   * what keeps a re-targeted dual aggregatable — `SchoolSearch.onChosen`'s
   * doc comment states the rule.
   */
  onPick: (name: string, program: ProgramSearchResult | null) => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ProgramSearchResult[]>([]);

  const histories = useMemo(() => new Map(historyEntries), [historyEntries]);

  useEffect(() => {
    const query = term.trim();
    // Clearing below the threshold belongs to the input handler, not here — a
    // synchronous setState in this effect cascades a render per keystroke.
    if (query.length < 2) return;

    // Debounced and aborted on the next keystroke, matching `school-search`:
    // the route is cached for five minutes, but a request per character still
    // queues them.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/programs/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        if (!response.ok) return;
        const body = (await response.json()) as {
          results: ProgramSearchResult[];
        };
        setResults(body.results);
      } catch {
        // An aborted fetch is the normal case here, not a failure worth showing.
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  const query = term.trim().toLowerCase();

  // No term shows the whole conference — the rail's reason to exist is that
  // this list never leaves the screen. A term narrows it and brings in the
  // directory beside it, exactly step one's split.
  const conferenceRows =
    query.length === 0
      ? conferencePrograms
      : conferencePrograms.filter((program) =>
          program.schoolName.toLowerCase().includes(query)
        );

  const listedKeys = new Set(conferenceRows.map((row) => row.programKey));
  const searchRows =
    query.length === 0
      ? []
      : results
          .filter((program) => program.programKey !== ourProgramKey)
          .filter((program) => !listedKeys.has(program.programKey));

  // The current opponent always has a row carrying the check. When it is
  // already in view — a conference school, or a search hit — that row is it;
  // when it is not (a free-text club side, or a searched school after the
  // term was cleared), it is pinned on top rather than silently absent.
  const visibleKeys = new Set(
    [...conferenceRows, ...searchRows].map((row) => row.programKey)
  );
  const pinCurrent =
    currentName.trim() !== "" &&
    (currentProgram === null || !visibleKeys.has(currentProgram.programKey));

  function pick(program: ProgramSearchResult) {
    // The squad-qualified name, matching step one's commit — the school name
    // alone is the same string for both of a school's squads.
    onPick(programDisplayName(program.schoolName, program.team), program);
    setTerm("");
    setResults([]);
  }

  function pickFreeText() {
    const name = term.trim();
    if (!name) return;
    onPick(name, null);
    setTerm("");
    setResults([]);
  }

  return (
    <div className="flex w-[320px] shrink-0 flex-col border-r border-[var(--border-hairline)]">
      <div className="px-5 pb-3 pt-[18px]">
        <span className="eyebrow">Opponent</span>
        <label className="mt-2.5 flex h-8 items-center gap-2 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-2.5">
          <Search
            strokeWidth={1.5}
            className="size-3.5 shrink-0 text-[var(--ink-500)]"
          />
          <input
            value={term}
            onChange={(event) => {
              const next = event.target.value;
              setTerm(next);
              if (next.trim().length < 2) setResults([]);
            }}
            placeholder={
              ourConference
                ? `${ourConference} · type to search all`
                : "Type to search all programs"
            }
            aria-label="Search opponents"
            className="w-full bg-transparent text-[12px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)]"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {pinCurrent ? (
          <RailRow
            name={currentProgram ? currentProgram.schoolName : currentName}
            subline={
              currentProgram
                ? schoolRowSubline(
                    currentProgram,
                    historyForProgram(histories, currentProgram)
                  )
                : ["unlisted", formatOpponentRecord(
                    opponentHistoryFor(histories, currentName)
                  )].join(" · ")
            }
            checked
            onClick={() =>
              currentProgram ? pick(currentProgram) : onPick(currentName, null)
            }
          />
        ) : null}

        {query.length > 0 && conferenceRows.length > 0 && searchRows.length > 0 ? (
          <div
            className="eyebrow-sm px-[10px] pb-1.5 pt-2"
            style={{ color: "var(--ink-400)" }}
          >
            Your conference
          </div>
        ) : null}
        {conferenceRows.map((program) => (
          <RailRow
            key={program.programKey}
            name={program.schoolName}
            subline={schoolRowSubline(
              program,
              historyForProgram(histories, program)
            )}
            checked={currentProgram?.programKey === program.programKey}
            onClick={() => pick(program)}
          />
        ))}

        {searchRows.length > 0 ? (
          <>
            <div
              className="eyebrow-sm px-[10px] pb-1.5 pt-2"
              style={{ color: "var(--ink-400)" }}
            >
              All programs
            </div>
            {searchRows.map((program) => (
              <RailRow
                key={program.programKey}
                name={program.schoolName}
                subline={schoolRowSubline(
                  program,
                  historyForProgram(histories, program)
                )}
                checked={currentProgram?.programKey === program.programKey}
                onClick={() => pick(program)}
              />
            ))}
          </>
        ) : null}

        {/* The escape hatch step one has, for the same reason: a club side or
            a school the ITA scrape missed is a real fixture, and a rail that
            only re-targeted within the directory would strand a typo'd
            free-text opponent behind a restart. */}
        {term.trim() ? (
          <button
            type="button"
            onClick={pickFreeText}
            className="mt-2 flex w-full cursor-pointer items-center gap-2.5 border-t border-[var(--border-hairline)] px-[10px] pt-3 text-left"
          >
            <Plus
              strokeWidth={1.5}
              className="size-[13px] shrink-0 text-[var(--blue)]"
            />
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--blue)]">
              Use &ldquo;{term.trim()}&rdquo; as an unlisted school or club side
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One rail row — name over its T4 subline, a check on the current opponent.
 *
 * Deliberately not `SchoolRow`: this rail is 320px wide, and step one's
 * last-played column and chevron have no room here. The subline and the
 * history behind it are shared instead, which is the half that must not
 * drift.
 */
function RailRow({
  name,
  subline,
  checked,
  onClick,
}: {
  name: string;
  subline: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] px-[10px] py-2.5 text-left transition-colors duration-[var(--duration-hover)] ${
        checked ? "" : "hover:bg-[var(--surface-subtle)]"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[13px] ${checked ? "font-medium" : "font-normal"}`}
          style={{ color: "var(--ink-900)" }}
        >
          {name}
        </span>
        <span
          className="text-micro mt-0.5 block truncate"
          style={{ color: "var(--ink-600)" }}
        >
          {subline}
        </span>
      </span>
      {checked ? (
        <Check
          strokeWidth={1.5}
          className="size-[13px] shrink-0 text-[var(--blue)]"
        />
      ) : null}
    </button>
  );
}
