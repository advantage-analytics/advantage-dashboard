"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ChevronRight, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { advButton } from "@/lib/ui/adv-button";
import {
  divisionLabel,
  programDisplayName,
  teamLabel,
} from "@/lib/data/programs-server";
import {
  formatOpponentRecord,
  opponentHistoryFor,
  type OpponentDualHistory,
} from "@/lib/schedule/opponent-history";
import type { LadderPlayer } from "@/lib/data/roster-server";
import type { ProgramSearchResult } from "@/lib/data/programs-server";

/**
 * Everything `/dashboard/team/schedule/new/dual` reads, for both of its steps.
 *
 * The same set of props the dormant `DualForm` took, plus `directoryTotal` —
 * the route reads once for the whole flow, as it always did.
 *
 * ── Why a context and not props ────────────────────────────────────────────
 * `StaticDualBuilder` is the two steps' shell: it owns which step is showing
 * and nothing else, deliberately, so that neither step's work has to be read
 * through it. Threading one screen's data through that shell as props would
 * undo exactly that. So the route wraps it in the provider below and each step
 * takes what it needs — step one the directory half, `ourConference` through
 * `directoryTotal`, and step two the rest.
 *
 * `ladder` and `defaultSurface` are therefore read on a
 * screen that does not use them: they are step two's, and this route is the
 * flow's one read.
 */
export interface NewDualData {
  /** The viewer's own program, for step two's header and its squad warning. */
  /** `getLadder` — step two's lineup. Step one does not read it. */
  ladder: LadderPlayer[];
  /** `getTeamSettings` — step two's surface default. */
  defaultSurface: string | null;
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
   * A Map would probably survive the server/client boundary, but an array of
   * its entries is the shape that needs no assumption about what the
   * serializer supports, and rebuilding it costs one `useMemo` over a list the
   * size of this program's opponents.
   */
  historyEntries: [string, OpponentDualHistory][];
  /**
   * How many programs the directory holds — a real `count` over `programs`,
   * null when that count could not be read.
   */
  directoryTotal: number | null;
}

const NewDualDataContext = createContext<NewDualData | null>(null);

export function NewDualDataProvider({
  data,
  children,
}: {
  data: NewDualData;
  children: ReactNode;
}) {
  return (
    <NewDualDataContext.Provider value={data}>
      {children}
    </NewDualDataContext.Provider>
  );
}

/** Loud rather than empty: a missing provider is a broken route, not a screen
 *  with no schools in it. */
export function useNewDualData(): NewDualData {
  const data = useContext(NewDualDataContext);
  if (!data) {
    throw new Error("useNewDualData must be used inside <NewDualDataProvider>");
  }
  return data;
}

/**
 * `2c` — step one of a new dual: which school.
 *
 * The question this screen exists to ask is the one every other field on the
 * builder depends on, which is why it is a step rather than one input among
 * nine courts, a date and a format. Three ways to answer it, in the order the
 * design puts them: your conference, then the whole directory, then free text
 * for a club side the ITA scrape never had.
 *
 * ── Wired, as of the schedule re-wiring ────────────────────────────────────
 * The rows are real programs. The conference list is `getConferenceTable`'s,
 * already in memory and narrowed here rather than by a round trip; the
 * directory list is `/api/programs/search`, debounced and aborted per
 * keystroke; every subline's head-to-head half is this program's own duals,
 * from `opponentDualHistory()`. The field is an `<input>`, and the pills and
 * "Clear" are buttons that filter what is listed.
 *
 * The sidebar and the 44px "… › Schedule › New dual" topbar the artboard draws
 * are the app's own chrome and already on screen — the crumb trail comes from
 * `getStaticBreadcrumbs()` in `app/dashboard/header.tsx`.
 *
 * ── Two drawn slots are gone, deliberately ─────────────────────────────────
 * Nothing here fabricates a figure to fill a slot the schema cannot back, so
 * two of the three figures the artboard draws are absent rather than invented:
 *
 *   "Region ⌄"     `programs` has `state`, `division` and `conference`. There
 *                  is no region column and no mapping to invent one from, so
 *                  the pill is gone rather than drawn dead.
 *   "18–4"         the opponent's OWN season record, from matches this program
 *                  never saw. `opponent-history.ts` says it "does not exist
 *                  anywhere in this app"; the subline keeps its other three
 *                  facts and drops this one.
 *
 * The third — "5 of 1,940" — IS backable, and is real: the left figure counts
 * the rows on screen, the right is a `count` over `programs` taken by the
 * route. `/api/programs/search` answers with a capped page and no total, which
 * is why the count is the route's and not this component's.
 *
 * ── What the choice carries ────────────────────────────────────────────────
 * `onContinue` takes the answer with it: the directory row beside the
 * school's own name for a pick, the typed text and a null row for a club side
 * or a school the directory never had — the dormant `SchoolSearch.onChosen`'s
 * contract. Step two names whichever it was given and nothing else; see
 * `static-dual-builder.tsx`'s header for the defect that shaped this.
 */
export function DualSchoolStep({
  onContinue,
}: {
  onContinue: (name: string, program: ProgramSearchResult | null) => void;
}) {
  const {
    ourConference,
    ourDivision,
    ourProgramKey,
    conferencePrograms,
    historyEntries,
    directoryTotal,
  } = useNewDualData();

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

    // Debounced and aborted on the next keystroke: the route is cached for
    // five minutes, but a request per character still queues them.
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

  // The whole conference on arrival, narrowed as the term is typed. The table
  // is already in memory — 1,941 rows are seeded with a conference, so this is
  // a real list on day one — and a substring match over a few dozen rows is not
  // worth a round trip. Listing it unfiltered is the one departure from the
  // dormant `SchoolSearch`, which showed nothing until two characters were
  // typed: behind a field that is now genuinely empty on arrival, that reads as
  // a program with no opponents rather than as a directory waiting for a term.
  const conferenceRows = conferencePrograms
    .filter(
      (program) =>
        query.length === 0 || program.schoolName.toLowerCase().includes(query)
    )
    .filter(passesChips);

  const listedKeys = new Set(conferenceRows.map((row) => row.programKey));
  const searchRows = results
    .filter((program) => program.programKey !== ourProgramKey)
    .filter((program) => !listedKeys.has(program.programKey))
    .filter(passesChips);

  const listed = conferenceRows.length + searchRows.length;
  const chipsOn = conferenceOnly || divisionOnly;

  /**
   * What Continue carries — a picked directory row, or whatever is in the box.
   *
   * Free text is a choice, not a fallback: a coach who types "Riverside Racquet
   * Club" has answered the question this screen asks, and Continue has to take
   * it. The escape row below is the same commitment with the reasoning printed
   * on it.
   */
  const chosen: string | null = picked ? picked.schoolName : term.trim() || null;

  function commit() {
    if (chosen === null) return;
    onContinue(chosen, picked);
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-[var(--surface-card)]">
      {/* `padding:32px 40px` — the artboard's, not `EventShell`'s 26/48/32. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-10 py-8">
        <div className="max-w-[720px]">
          <span className="eyebrow">New dual · step 1 of 2</span>
          <h1
            className="mt-[9px] text-[30px] font-light leading-[34px] text-[var(--ink-900)]"
            style={{ letterSpacing: "-.6px" }}
          >
            Which school are you playing?
          </h1>

          <div className="mt-5 flex items-center gap-3 border-b-2 border-[var(--blue)] pb-[13px] pt-3">
            <Search
              size={17}
              strokeWidth={1.5}
              className="shrink-0 text-[var(--ink-600)]"
            />
            {/* Autofocused, which is how `2c` draws it: a field with the caret
                already in it. The blue rule under the row is the drawn focus
                state and stays put. */}
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
                // text, because typing clears the picked row above.
                commit();
              }}
              placeholder="Search programs, or type any opponent"
              aria-label="Search programs"
              className="w-full bg-transparent text-[16px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-300)]"
            />
            <span
              className="text-micro tabular shrink-0"
              style={{ color: "var(--ink-500)" }}
            >
              {directoryTotal === null
                ? // No total rather than a made-up one, on the one path where
                  // the count did not come back.
                  `${listed} listed`
                : `${listed} of ${directoryTotal.toLocaleString("en-US")}`}
            </span>
          </div>

          {ourConference || ourDivision ? (
            <div className="mt-4 flex items-center gap-2">
              {/* Two pills, not three. Both are real filters over the two
                  columns `programs` actually carries; the artboard's third,
                  "Region", has no column behind it and is not drawn. */}
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
              {/* `--blue`, not `--blue-text`. The artboard states this colour
                  outright (`color:var(--blue)`), where `7e`'s links only set
                  size and weight and inherited theirs from a stylesheet this
                  app does not load. 11px blue on white measures 3.68:1 and
                  fails WCAG 1.4.3 AA; drawn as drawn, and reported. */}
              {chipsOn ? (
                <button
                  type="button"
                  onClick={() => {
                    setConferenceOnly(false);
                    setDivisionOnly(false);
                  }}
                  className="cursor-pointer text-[11px] font-medium text-[var(--blue)]"
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
                    onSelect={() => setPicked(program)}
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
                    onSelect={() => setPicked(program)}
                  />
                ))}
              </div>
            </>
          ) : null}

          {/* The escape hatch, available once something is typed. A dual against
              a club side or a school the ITA scrape missed is a real fixture,
              and a picker that only offered the directory would make the coach
              lie about who they played to get past the field. */}
          {term.trim() ? (
            <button
              type="button"
              onClick={() => {
                setPicked(null);
                // The row's own promise — the typed text, whatever row may
                // have been picked above it.
                onContinue(term.trim(), null);
              }}
              className="mt-[18px] flex w-full cursor-pointer items-center gap-2.5 border-t border-[var(--border-hairline)] pt-4 text-left"
            >
              <Plus
                size={13}
                strokeWidth={1.5}
                className="shrink-0 text-[var(--blue)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-[var(--blue)]">
                  {`Add "${term.trim()}" as an unlisted school or club side`}
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
          ) : null}
        </div>
      </div>

      {/* `padding:16px 40px 20px` — again the artboard's own, not the shell's. */}
      <div className="flex shrink-0 items-center gap-3 border-t border-[var(--border-hairline)] px-10 pb-5 pt-4">
        {/* Inside the rebuilt set. */}
        <Link
          href="/dashboard/team/schedule"
          className={advButton("ghost", "md")}
        >
          Cancel
        </Link>
        <div className="flex-1" />
        {chosen ? (
          <span className="text-[11px]" style={{ color: "var(--ink-600)" }}>
            {chosen} · date, site and lineup come next
          </span>
        ) : null}
        <button
          type="button"
          onClick={commit}
          disabled={chosen === null}
          className={advButton("primary", "md")}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/**
 * One directory row.
 *
 * The subline is squad · where they play · how it has gone against US —
 * `teamLabel`, `divisionLabel` and `formatOpponentRecord`. The design's third
 * slot, the opponent's own season record, is absent rather than approximated:
 * see this file's header, and `opponent-history.ts`.
 */
function SchoolRow({
  program,
  history,
  selected,
  onSelect,
}: {
  program: ProgramSearchResult;
  history: OpponentDualHistory;
  selected: boolean;
  onSelect: () => void;
}) {
  // Exactly one of the two per row, which is what the artboard prints: most
  // rows show a conference, a row without one shows its division.
  const where = program.conference ?? divisionLabel(program.division);
  const subline = [teamLabel(program.team), where, formatOpponentRecord(history)]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "-mx-3 grid cursor-pointer grid-cols-[minmax(0,1fr)_96px_13px] items-center gap-4",
        "rounded-[var(--radius-element)] px-3 py-2.5 text-left",
        "transition-colors duration-[var(--duration-hover)]",
        selected
          ? "bg-[var(--surface-muted)]"
          : "hover:bg-[var(--surface-muted)]"
      )}
    >
      <span className="min-w-0">
        <span
          className={cn(
            "block truncate text-[13px] text-[var(--ink-900)]",
            selected ? "font-medium" : "font-normal"
          )}
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
        {/* "04-12", not `formatLastPlayed`'s "12 Apr". The artboard's cell is
            month and day with no year, so the year on `lastPlayedOn` is sliced
            off rather than formatted. */}
        {history.lastPlayedOn ? history.lastPlayedOn.slice(5) : "—"}
      </span>
      <ChevronRight
        size={13}
        strokeWidth={1.5}
        className="text-[var(--ink-300)]"
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
      className={cn(
        "inline-flex h-[26px] cursor-pointer items-center gap-[5px] rounded-full px-[11px] text-[12px]",
        "transition-colors duration-[var(--duration-hover)]",
        active
          ? "bg-[var(--surface-subtle)] font-medium text-[var(--ink-900)]"
          : "border border-[var(--border-hairline)] font-normal text-[var(--ink-600)] hover:bg-[var(--surface-subtle)]"
      )}
    >
      {label}
    </button>
  );
}

/**
 * This program's record against one school row.
 *
 * One lookup, on the name a dual is actually recorded under:
 * `programDisplayName()`, which is the bare school name for a program that
 * fields no squad and "Ridgeline University Men's Tennis" for one that does.
 *
 * ── Why there is no fall back to the bare school name ──────────────────────
 * The dormant `school-search.tsx` tries the squad-qualified key first and
 * falls back to `program.schoolName` when it finds nothing. That fallback
 * cannot be right. `programDisplayName(name, null)` already *is* the bare
 * name, so the fallback never fires for a school fielding one team — it fires
 * only for a squad-bearing row, and the record it then returns is keyed on a
 * name that by definition does not name that squad. A school fielding both
 * teams surfaces as two rows here, so a dual stored under the bare name (which
 * this screen's own free-text escape hatch produces) would print on *both* of
 * them: "you lead 3–0" against a squad this program has never played.
 *
 * A row with no squad-qualified history therefore reads "never played". That
 * loses a true fact on the free-text path — a bare-named dual no longer shows
 * against the directory row for the same school — and refuses to state a false
 * one, which is the trade the brief asks for. Recovering it properly means
 * recording the opponent by `programKey` rather than by name; that is a data
 * change, not this screen's to make.
 *
 * Not imported from `school-search.tsx`: that file is scheduled for deletion,
 * and a live screen importing from it would take this row's record with it.
 */
function historyForProgram(
  histories: Map<string, OpponentDualHistory>,
  program: ProgramSearchResult
): OpponentDualHistory {
  return opponentHistoryFor(
    histories,
    programDisplayName(program.schoolName, program.team)
  );
}
