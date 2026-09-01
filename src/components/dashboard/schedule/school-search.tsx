"use client";

/*
 * DORMANT — no route renders this file. Step one of the dual builder is now
 * `static/dual-school-step.tsx`. Note `historyForProgram`/`schoolRowSubline`
 * are exported from here for `opponent-rail.tsx`, which is dormant as well.
 *
 * See `./README.md` for the full live/dormant map.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Search } from "lucide-react";
import { advButton } from "@/lib/ui/adv-button";
import { EventShell } from "@/components/dashboard/schedule/event-shell";
import {
  divisionLabel,
  programDisplayName,
  teamLabel,
} from "@/lib/data/programs-server";
import {
  formatLastPlayed,
  formatOpponentRecord,
  opponentHistoryFor,
  type OpponentDualHistory,
} from "@/lib/schedule/opponent-history";
import type { ProgramSearchResult } from "@/lib/data/programs-server";

/**
 * 2c — step one of a new dual: which school.
 *
 * The dual builder used to open on nine courts, a date, a site, a surface and a
 * format, with the opponent one field among them. Everything on that screen
 * depends on the answer to one question, so this asks it first and shows
 * nothing else until it is answered.
 *
 * ── What the design draws that this app cannot know ────────────────────────
 * Three things in screen 2c are figures nothing here holds, and none of them
 * is rendered:
 *
 *   "5 of 1,940"   `/api/programs/search` returns a capped page (8 rows) and no
 *                  total. A count of what is listed is honest; a total is not.
 *   "Region ⌄"     `programs` has `state`, `division` and `conference`. There is
 *                  no region column and no mapping to invent one from.
 *   "18–4"         an opponent's OWN season record. It comes from matches this
 *                  program never saw. `opponent-history.ts` says the same thing
 *                  at more length — the record half of every subline below is
 *                  strictly THIS program's duals against that school.
 */
export function SchoolSearch({
  ourConference,
  ourDivision,
  ourProgramKey,
  conferencePrograms,
  historyEntries,
  onChosen,
}: {
  /** From `getTeamSettings` — the label the own-conference chip carries. */
  ourConference: string | null;
  /** Already label-formatted ("D-I"), so the chip and the sublines agree. */
  ourDivision: string | null;
  /** So a program cannot schedule a dual against itself out of the directory. */
  ourProgramKey: string | null;
  /** `getConferenceTable`'s rows, own program already dropped. */
  conferencePrograms: ProgramSearchResult[];
  /**
   * `opponentDualHistory()`'s map, flattened to entries.
   *
   * A Map would survive the server/client boundary, but an array of its entries
   * is the shape that needs no assumption about what the serializer supports,
   * and rebuilding it here costs one `useMemo` over a list the size of this
   * program's opponents.
   */
  historyEntries: [string, OpponentDualHistory][];
  /**
   * Carries the directory row ALONGSIDE the name, null when the name was typed.
   *
   * The name alone is what this flow used to return, and it is what made an
   * opponent unaggregatable: "Stanford", "Stanford University" and "STAN" are
   * three programs to a GROUP BY and one to a human. The key is what lets a
   * recorded dual point at a directory row, and a step that returned only a
   * string would silently make every opponent picked here unaggregatable with
   * nothing looking broken.
   */
  onChosen: (name: string, program: ProgramSearchResult | null) => void;
}) {
  const router = useRouter();

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ProgramSearchResult[]>([]);
  const [conferenceOnly, setConferenceOnly] = useState(false);
  const [divisionOnly, setDivisionOnly] = useState(false);
  const [picked, setPicked] = useState<ProgramSearchResult | null>(null);

  const histories = useMemo(() => new Map(historyEntries), [historyEntries]);

  useEffect(() => {
    const query = term.trim();
    // Clearing below the threshold belongs to the input handler, not here — a
    // synchronous setState in this effect cascades a render per keystroke.
    if (query.length < 2) return;

    // Debounced and aborted on the next keystroke, matching `opponent-rail`:
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

  function passesChips(program: ProgramSearchResult): boolean {
    if (conferenceOnly && program.conference !== ourConference) return false;
    if (divisionOnly && divisionLabel(program.division) !== ourDivision) {
      return false;
    }
    return true;
  }

  // The conference table arrives whole — 1,940 rows are seeded with a
  // conference, so this is a real list on day one — and is narrowed here rather
  // than by a round trip. The directory route has no "within my conference"
  // mode, and adding one to answer a substring match over a few dozen rows
  // already in memory would be a query for nothing.
  const conferenceRows = conferencePrograms
    .filter(
      (program) =>
        query.length > 0 && program.schoolName.toLowerCase().includes(query)
    )
    .filter(passesChips);

  const listedKeys = new Set(conferenceRows.map((row) => row.programKey));
  const searchRows = results
    .filter((program) => program.programKey !== ourProgramKey)
    .filter((program) => !listedKeys.has(program.programKey))
    .filter(passesChips);

  const listed = conferenceRows.length + searchRows.length;
  const chipsOn = conferenceOnly || divisionOnly;

  function choose(program: ProgramSearchResult) {
    setPicked(program);
  }

  /** The typed name, no squad appended and no key attached. */
  function chooseFreeText() {
    const name = term.trim();
    if (!name) return;
    onChosen(name, null);
  }

  /**
   * What Continue would carry — a picked directory row, or whatever is in the
   * box.
   *
   * Free text is a choice, not a fallback: a coach who types "Riverside Racquet
   * Club" has answered the question this screen asks, and Continue has to take
   * it. The escape row below is the same commitment with the reasoning printed
   * on it; both end in `onChosen(name, null)`.
   */
  const chosen: string | null = picked
    ? picked.schoolName
    : term.trim() || null;

  function commit() {
    if (picked) {
      // The squad, not the school. Two rows come back for a program that
      // fields both, and the school name alone is the same string on either —
      // on the schedule, in the lineup header, and in the event this dual
      // becomes.
      onChosen(programDisplayName(picked.schoolName, picked.team), picked);
      return;
    }
    chooseFreeText();
  }

  return (
    <EventShell
      footer={
        <>
          <button
            type="button"
            className={advButton("ghost", "md")}
            onClick={() => router.push("/dashboard/team/schedule")}
          >
            Cancel
          </button>
          <div className="flex-1" />
          {chosen ? (
            <span className="text-[11px]" style={{ color: "var(--ink-600)" }}>
              {chosen} · date, site and lineup come next
            </span>
          ) : null}
          <button
            type="button"
            disabled={chosen === null}
            className={advButton("primary", "md")}
            onClick={commit}
          >
            Continue
          </button>
        </>
      }
    >
      <div className="max-w-[720px]">
        <span className="eyebrow">New dual · step 1 of 2</span>
        <h1
          className="mt-[9px] text-[30px] font-light leading-[34px] tracking-[-0.6px]"
          style={{ color: "var(--ink-900)" }}
        >
          Which school are you playing?
        </h1>

        <div className="mt-5 flex items-center gap-3 border-b-2 border-[var(--blue)] pb-[13px] pt-3">
          <Search
            strokeWidth={1.5}
            className="size-[17px] shrink-0 text-[var(--ink-600)]"
          />
          <input
            autoFocus
            value={term}
            onChange={(event) => {
              const next = event.target.value;
              setTerm(next);
              setPicked(null);
              if (next.trim().length < 2) setResults([]);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              // Whatever is chosen — which after any keystroke is the typed
              // text, because typing clears the picked row above. A coach who
              // clicked a school and then hit Return meant that school, not the
              // fragment still sitting in the box.
              commit();
            }}
            placeholder="Search programs, or type any opponent"
            aria-label="Search programs"
            className="w-full bg-transparent text-[16px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-300)]"
          />
          {/* What is on screen, never a total: the directory route answers with
              a capped page and no count of the rows it did not send. */}
          {listed > 0 ? (
            <span
              className="text-micro tabular shrink-0"
              style={{ color: "var(--ink-500)" }}
            >
              {listed} listed
            </span>
          ) : null}
        </div>

        {ourConference || ourDivision ? (
          <div className="mt-4 flex items-center gap-2">
            {ourConference ? (
              <FilterPill
                label={ourConference}
                active={conferenceOnly}
                onClick={() => setConferenceOnly((on) => !on)}
              />
            ) : null}
            {ourDivision ? (
              <FilterPill
                label={ourDivision}
                active={divisionOnly}
                onClick={() => setDivisionOnly((on) => !on)}
              />
            ) : null}
            <div className="flex-1" />
            {chipsOn ? (
              <button
                type="button"
                onClick={() => {
                  setConferenceOnly(false);
                  setDivisionOnly(false);
                }}
                className="cursor-pointer text-[11px] font-medium text-[var(--blue-text)]"
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}

        {conferenceRows.length > 0 ? (
          <>
            <div
              className="eyebrow-sm pb-1.5 pt-[22px]"
              style={{ color: "var(--ink-400)" }}
            >
              Your conference
            </div>
            <div className="flex flex-col">
              {conferenceRows.map((program) => (
                <SchoolRow
                  key={program.programKey}
                  program={program}
                  history={historyForProgram(histories, program)}
                  selected={picked?.programKey === program.programKey}
                  onClick={() => choose(program)}
                />
              ))}
            </div>
          </>
        ) : null}

        {searchRows.length > 0 ? (
          <>
            <div
              className="eyebrow-sm pb-1.5 pt-5"
              style={{ color: "var(--ink-400)" }}
            >
              All programs
            </div>
            <div className="flex flex-col">
              {searchRows.map((program) => (
                <SchoolRow
                  key={program.programKey}
                  program={program}
                  history={historyForProgram(histories, program)}
                  selected={picked?.programKey === program.programKey}
                  onClick={() => choose(program)}
                />
              ))}
            </div>
          </>
        ) : null}

        {/* The escape hatch, always available once something is typed. A dual
            against a club side or a school the ITA scrape missed is a real
            fixture, and a picker that only offered the directory would make the
            coach lie about who they played to get past the field. */}
        {term.trim() ? (
          <button
            type="button"
            onClick={chooseFreeText}
            className="mt-[18px] flex w-full cursor-pointer items-center gap-2.5 border-t border-[var(--border-hairline)] pt-4 text-left"
          >
            <Plus
              strokeWidth={1.5}
              className="size-[13px] shrink-0 text-[var(--blue)]"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-[var(--blue)]">
                Add &ldquo;{term.trim()}&rdquo; as an unlisted school or club
                side
              </span>
              <span
                className="text-micro mt-0.5 block"
                style={{ color: "var(--ink-600)" }}
              >
                No program record — their lineup gets typed by hand.
              </span>
            </span>
            {picked === null ? (
              <span
                className="mono shrink-0 text-[10px]"
                style={{ color: "var(--ink-500)" }}
              >
                ↵
              </span>
            ) : null}
          </button>
        ) : (
          <p className="text-micro mt-[22px]" style={{ color: "var(--ink-500)" }}>
            Type two letters to search your conference and the full program
            directory — or any name at all for a club side.
          </p>
        )}
      </div>
    </EventShell>
  );
}

/**
 * One directory row.
 *
 * The subline is squad · where they play · how it has gone against US. The
 * design's third slot also carries the opponent's own season record; see the
 * header comment for why that half is absent rather than approximated.
 */
function SchoolRow({
  program,
  history,
  selected,
  onClick,
}: {
  program: ProgramSearchResult;
  history: OpponentDualHistory;
  selected: boolean;
  onClick: () => void;
}) {
  const subline = schoolRowSubline(program, history);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`-mx-3 grid cursor-pointer grid-cols-[minmax(0,1fr)_96px_13px] items-center gap-4 rounded-[var(--radius-element)] px-3 py-2.5 text-left transition-colors duration-[var(--duration-hover)] ${
        selected
          ? "bg-[var(--surface-muted)]"
          : "hover:bg-[var(--surface-muted)]"
      }`}
    >
      <span className="min-w-0">
        <span
          className={`block truncate text-[13px] ${selected ? "font-medium" : "font-normal"}`}
          style={{ color: "var(--ink-900)" }}
        >
          {program.schoolName}
        </span>
        <span
          className="text-micro mt-0.5 block truncate"
          style={{ color: "var(--ink-600)" }}
        >
          {subline}
        </span>
      </span>
      <span
        className="mono text-right text-[11px]"
        style={{ color: "var(--ink-500)" }}
      >
        {formatLastPlayed(history)}
      </span>
      <ChevronRight
        strokeWidth={1.5}
        className="size-[13px] text-[var(--ink-300)]"
      />
    </button>
  );
}

/**
 * A filter pill — `rounded-full`, which is what the design system reserves for
 * pills, tabs, avatars and indicators. Buttons stay on `--radius-button`.
 */
function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-[26px] cursor-pointer items-center rounded-full px-[11px] text-[12px] transition-colors duration-[var(--duration-hover)] ${
        active
          ? "bg-[var(--surface-subtle)] font-medium text-[var(--ink-900)]"
          : "border border-[var(--border-hairline)] font-normal text-[var(--ink-600)] hover:bg-[var(--surface-subtle)]"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * This program's record against one school row.
 *
 * Two lookups, because a dual records the opponent under whatever string was
 * stored as its name: `programDisplayName()` when the coach picked a
 * directory row — "Ridgeline University Men's Tennis" — and the bare typed
 * text when they did not. Keying only on the school name would report "never
 * played" for every dual ever entered through the picker.
 *
 * Exported because step one's list and the builder's opponent rail
 * (`opponent-rail.tsx`) print the same rows; two copies of this lookup is how
 * one of them ends up reporting "never played" against a school the other
 * knows.
 */
export function historyForProgram(
  histories: Map<string, OpponentDualHistory>,
  program: ProgramSearchResult
): OpponentDualHistory {
  const withSquad = opponentHistoryFor(
    histories,
    programDisplayName(program.schoolName, program.team)
  );
  if (withSquad.played > 0) return withSquad;
  return opponentHistoryFor(histories, program.schoolName);
}

/** "Men's · Big Ten · you lead 3–1" — the subline both opponent lists print. */
export function schoolRowSubline(
  program: ProgramSearchResult,
  history: OpponentDualHistory
): string {
  const where = program.conference ?? divisionLabel(program.division);
  return [teamLabel(program.team), where, formatOpponentRecord(history)]
    .filter(Boolean)
    .join(" · ");
}
