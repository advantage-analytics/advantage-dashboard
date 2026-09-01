"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { advButton } from "@/lib/ui/adv-button";
import { divisionLabel, teamLabel } from "@/lib/data/programs-server";
import { formatOpponentRecord } from "@/lib/schedule/opponent-history";
import {
  ALL_PROGRAM_SCHOOLS,
  CONFERENCE_SCHOOLS,
  DIRECTORY_TERM,
  DIRECTORY_TOTAL,
  OUR_CONFERENCE,
  OUR_DIVISION,
  type DirectorySchool,
} from "@/lib/schedule/fixtures";

/**
 * `2c` — step one of a new dual: which school, rendered from fixtures.
 *
 * The question this screen exists to ask is the one every other field on the
 * builder depends on, which is why it is a step rather than one input among
 * nine courts, a date and a format. Three ways to answer it, in the order the
 * design puts them: your conference, then the whole directory, then free text
 * for a club side the ITA scrape never had.
 *
 * ── Static ─────────────────────────────────────────────────────────────────
 * Nothing here fetches. `school-search.tsx` is the DB-wired implementation of
 * this same screen and stays exactly where it is, dormant, for the re-wiring —
 * this component is not a replacement for it and does not import it. The rows
 * come from `CONFERENCE_SCHOOLS` / `ALL_PROGRAM_SCHOOLS` in
 * `lib/schedule/fixtures.ts`, typed as the `ProgramSearchResult` +
 * `OpponentDualHistory` pair the dormant component already takes.
 *
 * The sidebar and the 44px "Meridian State › Schedule › New dual" topbar the
 * artboard draws are the app's own chrome and already on screen — the crumb
 * trail comes from `getStaticBreadcrumbs()` in `app/dashboard/header.tsx`.
 *
 * ── The search field is drawn, not wired ───────────────────────────────────
 * `2c` draws a focused field mid-term: the glyphs "Ridg", a caret rule, and
 * "5 of 1,940" at the far end. It is reproduced as that — a rendering of a
 * field, not an `<input>` — because there is no directory behind this screen
 * for a second term to search. An input that accepted keystrokes and never
 * changed the five rows below it would be a worse lie than a static one. The
 * pills and "Clear" are inert for the same reason.
 *
 * ── What the design draws that this app cannot know ────────────────────────
 * Three figures on `2c` have no source in this codebase. The dormant
 * `SchoolSearch` omits all three and says why in its own header; this rebuild
 * draws all three, because the artboard draws them, and each is reported:
 *
 *   "5 of 1,940"   the 5 is the rows below; the total is a fixture literal.
 *                  `/api/programs/search` answers with a capped page and no
 *                  total.
 *   "Region ⌄"     `programs` has `state`, `division` and `conference`. There
 *                  is no region column and no mapping to invent one from.
 *   "18–4"         the opponent's OWN season record, from matches this program
 *                  never saw. See `DirectorySchool` in the fixtures.
 */
export function DualSchoolStep({ onContinue }: { onContinue: () => void }) {
  // The artboard opens with the first conference row picked — its own row is
  // filled and weighted, and the footer names it. Local, and the only state
  // this step owns: the step itself belongs to `StaticDualBuilder`.
  const [selectedKey, setSelectedKey] = useState(
    CONFERENCE_SCHOOLS[0].program.programKey
  );

  const listed = CONFERENCE_SCHOOLS.length + ALL_PROGRAM_SCHOOLS.length;
  const selected =
    [...CONFERENCE_SCHOOLS, ...ALL_PROGRAM_SCHOOLS].find(
      (school) => school.program.programKey === selectedKey
    ) ?? null;

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
            <span className="text-[16px] text-[var(--ink-900)]">
              {DIRECTORY_TERM}
            </span>
            {/* The caret. Drawn, because the field is drawn focused. */}
            <span className="h-[19px] w-px bg-[var(--blue)]" />
            <div className="flex-1" />
            <span
              className="text-micro tabular shrink-0"
              style={{ color: "var(--ink-500)" }}
            >
              {listed} of {DIRECTORY_TOTAL}
            </span>
          </div>

          <div className="mt-4 flex items-center gap-2">
            {/* Drawn ACTIVE, over a list that includes three programs outside
                this conference and a total that counts all 1,940. Reproduced
                as drawn — the pills are a picture of a filter, not one — and
                reported. */}
            <FilterPill label={OUR_CONFERENCE} active />
            <FilterPill label={OUR_DIVISION} />
            <FilterPill label="Region" trailing={<ChevronDownIcon />} />
            <div className="flex-1" />
            {/* `--blue`, not `--blue-text`. The artboard states this colour
                outright (`color:var(--blue)`), where `7e`'s links only set size
                and weight and inherited theirs from a stylesheet this app does
                not load — so the substitution `static-schedule.tsx` documents
                does not apply here. 11px blue on white measures 3.68:1 and
                fails WCAG 1.4.3 AA; drawn as drawn, and reported. */}
            <span className="cursor-pointer text-[11px] font-medium text-[var(--blue)]">
              Clear
            </span>
          </div>

          <div
            className="eyebrow-sm pb-1.5 pt-[22px]"
            style={{ color: "var(--ink-400)" }}
          >
            Your conference
          </div>
          <div className="flex flex-col">
            {CONFERENCE_SCHOOLS.map((school) => (
              <SchoolRow
                key={school.program.programKey}
                school={school}
                selected={school.program.programKey === selectedKey}
                onSelect={() => setSelectedKey(school.program.programKey)}
              />
            ))}
          </div>

          <div
            className="eyebrow-sm pb-1.5 pt-5"
            style={{ color: "var(--ink-400)" }}
          >
            All programs
          </div>
          <div className="flex flex-col">
            {ALL_PROGRAM_SCHOOLS.map((school) => (
              <SchoolRow
                key={school.program.programKey}
                school={school}
                selected={school.program.programKey === selectedKey}
                onSelect={() => setSelectedKey(school.program.programKey)}
              />
            ))}
          </div>

          {/* The escape hatch, drawn and inert. Choosing it would carry a
              free-text opponent into step two, and step two is a stub — so it
              renders exactly as the artboard draws it, `cursor:pointer` and
              all, and moves nothing. The same treatment `7e`'s "One-off match
              in Matches" gets. */}
          <div className="mt-[18px] flex cursor-pointer items-center gap-2.5 border-t border-[var(--border-hairline)] pt-4">
            <Plus
              size={13}
              strokeWidth={1.5}
              className="shrink-0 text-[var(--blue)]"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium text-[var(--blue)]">
                {`Add "${DIRECTORY_TERM}" as an unlisted school or club side`}
              </div>
              <div
                className="text-micro mt-0.5"
                style={{ color: "var(--ink-600)" }}
              >
                No program record — their lineup gets typed by hand.
              </div>
            </div>
            <span
              className="mono shrink-0 text-[10px]"
              style={{ color: "var(--ink-500)" }}
            >
              ↵
            </span>
          </div>
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
        {selected ? (
          <span className="text-[11px]" style={{ color: "var(--ink-600)" }}>
            {selected.program.schoolName} · date, site and lineup come next
          </span>
        ) : null}
        <button
          type="button"
          onClick={onContinue}
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
 * The subline is squad · where they play · their season · how it has gone
 * against US — `teamLabel`, `divisionLabel` and `formatOpponentRecord`, the
 * same three primitives `schoolRowSubline()` composes, with the design's
 * season record between the second and the third. Not a call to
 * `schoolRowSubline()` itself: that function deliberately omits the record
 * (see `opponent-history.ts`), and widening it would change a dormant
 * component's output to suit this one.
 */
function SchoolRow({
  school,
  selected,
  onSelect,
}: {
  school: DirectorySchool;
  selected: boolean;
  onSelect: () => void;
}) {
  const { program, history, seasonRecord } = school;
  // Exactly one of the two per row, which is what the artboard prints and what
  // `schoolRowSubline` already does. Four rows show a conference; the fifth
  // shows a division. Reproduced, and reported.
  const where = program.conference ?? divisionLabel(program.division);
  const subline = [
    teamLabel(program.team),
    where,
    seasonRecord,
    formatOpponentRecord(history),
  ]
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
 *
 * A span rather than a button: these are drawn, not wired, and a `<button>`
 * that takes focus and does nothing is worse than a picture of one.
 */
function FilterPill({
  label,
  active = false,
  trailing,
}: {
  label: string;
  active?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[26px] cursor-pointer items-center gap-[5px] rounded-full px-[11px] text-[12px]",
        "transition-colors duration-[var(--duration-hover)]",
        active
          ? "bg-[var(--surface-subtle)] font-medium text-[var(--ink-900)]"
          : "border border-[var(--border-hairline)] font-normal text-[var(--ink-600)] hover:bg-[var(--surface-subtle)]"
      )}
    >
      {label}
      {trailing}
    </span>
  );
}

function ChevronDownIcon() {
  return (
    <ChevronDown
      size={12}
      strokeWidth={1.5}
      className="text-[var(--ink-400)]"
    />
  );
}
