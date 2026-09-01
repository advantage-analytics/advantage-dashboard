"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Calendar, Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { advButton } from "@/lib/ui/adv-button";
import { EventShell } from "@/components/dashboard/schedule/event-shell";
import { OpponentPopup } from "@/components/dashboard/schedule/static/opponent-popup";
import { useNewDualData } from "@/components/dashboard/schedule/static/dual-school-step";
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
import { DUAL_DRAFT_LINES } from "@/lib/schedule/fixtures";
import type { LineupLine } from "@/components/dashboard/schedule/lineup-editor";
import type { ProgramSearchResult } from "@/lib/data/programs-server";
import type { EventSite } from "@/lib/schedule/types";

/**
 * The school step one chose, as step two receives it.
 *
 * Two shapes rather than a name beside a nullable row, so the name and the
 * row cannot disagree: a directory pick carries the row and nothing else — its
 * name is read off the row wherever it is printed — and a typed opponent
 * carries the text and no row. `createDual` takes the two apart again at
 * submit (T23): the squad-qualified `programDisplayName` and the key for a
 * pick, the text and a null key for the rest.
 */
export type ChosenSchool =
  | { kind: "program"; program: ProgramSearchResult }
  | { kind: "text"; name: string };

/**
 * One row of the Format control: the option it is, and what it means.
 *
 * ── Why this is a table and not an encoding ────────────────────────────────
 * The dormant `dual-form.tsx` carries the format through a `<select>` as the
 * string `"<bestOf>|<adScoring>"` and decodes it with `format.split("|")` →
 * `Number(bestOf)` and `adScoring === "true"`. Until this change the cell here
 * held the same string, hard-coded to `"3|false"` — because `adScoring` is
 * `boolean | null` on `EventFormat`, a null interpolates into that string as
 * the four characters `null`, and `=== "true"` reads those as a confident
 * `false`: a wrong answer that looks like a real one. That is the recorded
 * cause of a real outage — format arrived as `{}`, `adScoring` arrived null,
 * and every tournament video failed vendor submission long after the coach had
 * left. See `docs/ui-revamp-guardrails.md` §3.1 and §4, and `TournamentFormat`
 * in `static-tournament-builder.tsx`, which made this same call first.
 *
 * So there is no encoding to get wrong. `value` is an opaque option name that
 * is only ever compared, never parsed; `bestOf` and `adScoring` are stated as
 * literals in `FORMATS` and travel as themselves. `adScoring` is typed
 * `boolean` rather than `boolean | null`, which makes "the control carries a
 * real boolean" a compile error to break rather than a convention to
 * remember: no null can be assigned into this shape, so none can reach
 * `createDual`'s `format` jsonb.
 *
 * `sets` and `scoring` are the two strings `2b` prints — the sets half inside
 * the underline, the scoring half under it. Both are read off the chosen row,
 * so the label and the value cannot drift into disagreeing about which format
 * this dual is.
 */
interface DualFormat {
  /** The `<select>` option's value — matched against, never split. */
  value: string;
  /** What the dropdown lists, once open. */
  label: string;
  /** What the closed cell prints. */
  sets: string;
  /** What prints under the underline. */
  scoring: string;
  bestOf: number;
  adScoring: boolean;
}

/**
 * The four formats the control offers.
 *
 * `2b` draws one — "Best of 3 sets" over "No-ad scoring" — and no dropdown
 * contents, so the other three are built from vocabulary that already exists
 * rather than invented: "One set", "ad" and "no-ad" are the dormant
 * `FORMATS`' words, in that table's order. The first row is what the artboard
 * draws, and what a new dual opens on.
 */
const FORMATS: readonly DualFormat[] = [
  {
    value: "bo3-no-ad",
    label: "Best of 3 sets · no-ad",
    sets: "Best of 3 sets",
    scoring: "No-ad scoring",
    bestOf: 3,
    adScoring: false,
  },
  {
    value: "bo3-ad",
    label: "Best of 3 sets · ad",
    sets: "Best of 3 sets",
    scoring: "Ad scoring",
    bestOf: 3,
    adScoring: true,
  },
  {
    value: "one-set-no-ad",
    label: "One set · no-ad",
    sets: "One set",
    scoring: "No-ad scoring",
    bestOf: 1,
    adScoring: false,
  },
  {
    value: "one-set-ad",
    label: "One set · ad",
    sets: "One set",
    scoring: "Ad scoring",
    bestOf: 1,
    adScoring: true,
  },
];

/** What `2b` draws: best of 3, no-ad. Explicit — never a default standing in
 *  for a null. */
const DEFAULT_FORMAT = FORMATS[0];

/**
 * The three sites a dual can be at, labelled as the dormant form labels them
 * and in its order. `EventSite` on `value`, so the union is checked here rather
 * than cast at the change handler.
 */
const SITES: readonly { value: EventSite; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "away", label: "Away" },
  { value: "neutral", label: "Neutral" },
];

/**
 * The surfaces a dual can be on — `programs.default_surface`'s own vocabulary,
 * which is the settings form's `SURFACE_OPTIONS` (`team-settings-form.tsx`).
 *
 * Not the dormant form's "Hard"/"Indoor hard" list: the column stores the
 * lowercase key, this cell opens on that column's value, and the event page
 * prints `event.surface` verbatim — so a dual written from here has to spell
 * its surface the way the program's default already does, or one schedule
 * reads "hard" on one row and "Hard" on the next. The first option is none,
 * under the app's own glyph for an absent value; `createDual` stores it as a
 * null column.
 */
const SURFACES: readonly { value: string; label: string }[] = [
  { value: "", label: "—" },
  { value: "hard", label: "Hard" },
  { value: "clay", label: "Clay" },
  { value: "grass", label: "Grass" },
  { value: "carpet", label: "Carpet" },
];

/** The four facts `2b`'s top row asks for, held as what the coach entered. */
interface DualDraft {
  /** YYYY-MM-DD, as `program_events.starts_on` stores it. */
  date: string;
  site: EventSite;
  /** One of `SURFACES`' values; `""` is none. */
  surface: string;
  format: DualFormat;
}

/**
 * Local today, in the `YYYY-MM-DD` shape a date input and the column share.
 * `static-tournament-builder.tsx`'s own, repeated rather than exported from a
 * screen: `toISOString()` is UTC and puts a dual on yesterday for anyone west
 * of Greenwich after dinner.
 */
function todayISO(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * `2b` — step two of a new dual: the master–detail builder.
 *
 * The conference stays on the left while the fixture fills in on the right, so
 * the answer step one asked for is revisable without a screen hop. Date, site,
 * surface and format across the top; six singles and three doubles under them.
 *
 * ── The shell ──────────────────────────────────────────────────────────────
 * `EventShell` with `flush`, which is the prop that exists for this artboard by
 * name (see its doc comment). In `flush` mode the shell contributes
 * `flex min-h-0 flex-1 overflow-hidden` and NO padding, so the rail and the
 * detail pane own their own insets and each scrolls on its own — two panes edge
 * to edge, not one padded column. The default body would put 48/32/26 around
 * both of them and scroll them together, which is a different screen.
 *
 * The footer is `2b`'s own `16px 32px 20px` rather than the shell's `footer`
 * slot, whose `px-12 pb-[22px]` is 48/22 — the same call `dual-school-step.tsx`
 * made for `2c`. The shell's body padding is what `flush` exists to remove; its
 * footer padding belongs to the four create screens its comment names, and this
 * artboard draws different numbers. Where the design and the shell disagree the
 * design wins.
 *
 * ── Reading again, as of the schedule re-wiring ────────────────────────────
 * The school is the one step one chose — a `ChosenSchool`, handed down by
 * `static-dual-builder.tsx`, which holds nothing else. It names the header,
 * the rail's check, the subline, the footer and the popup, and every one of
 * those reads the same object, so they cannot drift. This used to be a module
 * const pinned to Ridgeline, and that const was the fix for a real defect:
 * step two's date, site, format and nine lines were Ridgeline's fixtures,
 * drawn and unvarying, so a header that followed step one's pick put one
 * school's name over another school's data. The pin comes out now because the
 * data travels with the school — see below — not because the guard was
 * unwanted.
 *
 * Date, site, surface and format are controlled state, opened on today, home,
 * the program's `default_surface` and `2b`'s own format. The rail lists the
 * real conference — `getConferenceTable`'s rows, own program already dropped —
 * with the chosen school checked, and pins that school on top when it is not
 * a conference row: a searched school, or a club side typed past the
 * directory. Sublines are this program's own head-to-head, from
 * `opponentDualHistory()`. All of it arrives through `useNewDualData()`; the
 * route reads once for both steps.
 *
 * The nine lines are still `DUAL_DRAFT_LINES`, the design's sample lineup for
 * OUR side. They are not the opponent's data, so no school's name sits over
 * them wrongly — but they are a lineup nobody on this program entered, and
 * seeding them from the ladder and editing them is T23, which also calls
 * `createDual`. `dual-form.tsx` is the dormant DB-wired implementation of that
 * half and stays where it is until then.
 *
 * ── What is a control and what is still a picture ──────────────────────────
 *   date/site/surface   Real: an `<input type="date">` and two native
 *                       `<select>`s under the artboard's own underline
 *                       treatment, with the drawn glyph beside each.
 *   Format              Real, and the one cell a plain native select could not
 *                       draw: `2b` prints the sets half inside the underline
 *                       and the scoring half BELOW it, and a select prints one
 *                       label. So the select is a real one laid over the cell
 *                       at `opacity:0` — it owns the click, the keyboard and
 *                       the dropdown — while the two strings the cell prints
 *                       are read off the chosen `FORMATS` row underneath it.
 *   the rail rows       Still drawn: a hover wash and no `cursor:pointer`,
 *                       which is what `2b` gives the unselected rows. A row
 *                       that re-targeted the dual would have to clear every
 *                       opposing name typed against the old school AND swap
 *                       the popup's saved roster for the new school's, or a
 *                       name can silently attach to a real, different person
 *                       at the new one — that second half is T23's, so the
 *                       rows wait for it. The search field above them is a
 *                       picture for the same reason.
 *   "Create dual"       Inert. Creating writes nine lines to the database,
 *                       which is T23's, and lands on
 *                       `/dashboard/team/schedule/[eventId]`.
 *
 * The opponent cells ("Add name" / "Add pair") are live: each is an
 * `OpponentPopup` (T7) writing to the row's own local state and nowhere else.
 * It is handed this school's name and NO saved roster — `candidates` is empty
 * until T23 fetches the school's own pool, so `2d`'s "already has a close name
 * saved" card cannot appear yet, and no fixture person can be offered under a
 * real school. That is deliberate: the popup's school and its roster must
 * travel together or it dedupes against the wrong pool, and a fixture roster
 * under a real name is exactly that.
 *
 * ── What the design draws that this app cannot know ────────────────────────
 * "18–4" and its five siblings on the rail were each opponent's OWN season
 * record, from matches this program never saw — `opponent-history.ts`'s header
 * says outright that the figure does not exist anywhere in this app. The slot
 * is gone rather than filled, the same call `2c` made in the previous task:
 * the rail's subline is squad · head-to-head now, two facts instead of three.
 */
export function DualBuildStep({ school }: { school: ChosenSchool }) {
  const { ourConference, conferencePrograms, historyEntries, defaultSurface } =
    useNewDualData();

  const [draft, setDraft] = useState<DualDraft>(() => ({
    date: todayISO(),
    site: "home",
    // The program's own default, or none — not "Hard". A court type nobody
    // stated is a fact about the fixture we would be inventing.
    surface: defaultSurface ?? "",
    format: DEFAULT_FORMAT,
  }));

  function edit(patch: Partial<DualDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  const histories = useMemo(() => new Map(historyEntries), [historyEntries]);

  const program = school.kind === "program" ? school.program : null;
  const schoolName =
    school.kind === "program" ? school.program.schoolName : school.name;
  // `OpponentTarget.key`'s mechanism (`opponent-name-cell.tsx`): every name on
  // a line is typed against ONE school, and this key rides in each row's React
  // key so a change of school remounts the row and drops the name with it.
  const schoolKey =
    school.kind === "program"
      ? `program:${school.program.programKey}`
      : `text:${school.name}`;

  // "Big Ten · D-I" — conference first. `programSubtitle()` prints the two the
  // other way round ("D-I · Big Sky") and four claim-flow call sites depend on
  // that order, so this composes its own rather than reversing a shared helper
  // for one screen. The artboard's order, and reported. Only a directory row
  // knows either, so a typed opponent renders no subline rather than an
  // invented one.
  const headerSubline = program
    ? [program.conference, divisionLabel(program.division)]
        .filter(Boolean)
        .join(" · ")
    : "";

  // The chosen school always has a row carrying the check. When it is a
  // conference row that row is it; when it is not — a searched school, or a
  // club side typed past the directory — it is pinned on top rather than
  // silently absent. The dormant `OpponentRail`'s rule.
  const pinned =
    program === null ||
    !conferencePrograms.some((row) => row.programKey === program.programKey);

  // A line counts once our side is named, and a forfeited line counts with
  // nobody named on either side — `dual-form.tsx`'s rule, which is why the
  // footer reads 9 over a lineup whose S6 is forfeited. Dropping it would
  // write eight lines under a dual that has nine points to give.
  const lineCount = DUAL_DRAFT_LINES.filter(
    (line) => line.ourLabels.length > 0 || line.forfeit !== null
  ).length;

  const singles = DUAL_DRAFT_LINES.filter(
    (line) => line.discipline === "singles"
  );
  const doubles = DUAL_DRAFT_LINES.filter(
    (line) => line.discipline === "doubles"
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-[var(--surface-card)]">
      <EventShell flush>
        {/* ── The rail ─────────────────────────────────────────────────── */}
        <div className="flex w-80 min-h-0 shrink-0 flex-col border-r border-[var(--border-hairline)]">
          <div className="px-5 pb-3 pt-[18px]">
            <span className="eyebrow">Opponent</span>
            {/* Drawn, not wired — see the header. */}
            <div className="mt-2.5 flex h-8 items-center gap-[9px] rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-2.5">
              <Search
                size={14}
                strokeWidth={1.5}
                className="shrink-0 text-[var(--ink-500)]"
              />
              <span
                className="text-[12px]"
                style={{ color: "var(--ink-600)" }}
              >
                {/* The artboard's sentence in full where the program has a
                    conference to name, and its second half alone where it
                    does not — never a separator with nothing before it. */}
                {ourConference
                  ? `${ourConference} · type to search all`
                  : "type to search all"}
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
            {pinned ? (
              <RailRow
                name={schoolName}
                subline={
                  program
                    ? railSubline(program, histories)
                    : // "unlisted" is the dormant rail's own word for a typed
                      // opponent, and `2c`'s escape row's. No squad — nothing
                      // said one. Looked up under the typed text, which is the
                      // name a free-text dual is recorded under.
                      [
                        "unlisted",
                        formatOpponentRecord(
                          opponentHistoryFor(histories, schoolName)
                        ),
                      ].join(" · ")
                }
                selected
              />
            ) : null}
            {conferencePrograms.map((row) => (
              <RailRow
                key={row.programKey}
                name={row.schoolName}
                subline={railSubline(row, histories)}
                selected={program?.programKey === row.programKey}
              />
            ))}
          </div>
        </div>

        {/* ── The detail pane ──────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col gap-[22px] overflow-auto px-8 py-6">
          <div className="flex items-end gap-3 border-b border-[var(--border-hairline)] pb-3">
            <div className="min-w-0 flex-1">
              <span className="eyebrow">Dual</span>
              <div className="mt-1.5 flex items-baseline gap-2.5">
                <span
                  className="text-[30px] font-light leading-none tracking-[-0.6px]"
                  style={{ color: "var(--ink-600)" }}
                >
                  vs
                </span>
                <span
                  className="min-w-0 truncate text-[30px] font-light leading-none tracking-[-0.6px]"
                  style={{ color: "var(--ink-900)" }}
                >
                  {schoolName}
                </span>
              </div>
            </div>
            {headerSubline ? (
              <span
                className="text-micro shrink-0"
                style={{ color: "var(--ink-500)" }}
              >
                {headerSubline}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-4 gap-6">
            <FieldCell label="Date" glyph="calendar">
              {/* `2b` draws "09-26", month and day; a native date input
                  prints the platform's own form of the same value. The
                  tournament builder made the same trade on its two dates. */}
              <input
                type="date"
                value={draft.date}
                onChange={(event) => edit({ date: event.target.value })}
                className="mono w-full bg-transparent text-[13px] text-[var(--ink-900)] outline-none"
              />
            </FieldCell>

            <FieldCell label="Site" glyph="chevron">
              <FieldSelect
                value={draft.site}
                options={SITES}
                onChange={(value) => {
                  const chosen = SITES.find((option) => option.value === value);
                  if (chosen) edit({ site: chosen.value });
                }}
              />
            </FieldCell>

            <FieldCell label="Surface" glyph="chevron">
              <FieldSelect
                value={draft.surface}
                options={SURFACES}
                onChange={(value) => edit({ surface: value })}
              />
            </FieldCell>

            {/* `2b` draws the ad half BELOW the underline rather than inside
                the value — see the header for how the select is laid over
                the cell rather than being it. */}
            <FieldCell
              label="Format"
              glyph="chevron"
              note={draft.format.scoring}
            >
              <span className="text-[13px] text-[var(--ink-900)]">
                {draft.format.sets}
              </span>
              <select
                aria-label="Format"
                value={draft.format.value}
                onChange={(event) => {
                  // The chosen ROW, not a parse of the chosen string. This is
                  // the only assignment `format` has, and every row of that
                  // table states `adScoring` as a literal boolean.
                  const chosen = FORMATS.find(
                    (option) => option.value === event.target.value
                  );
                  if (chosen) edit({ format: chosen });
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              >
                {FORMATS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FieldCell>
          </div>

          <LineupBlock
            title="Lineup · singles"
            note="six required · from your ladder"
            lines={singles}
            addLabel="Add name"
            schoolKey={schoolKey}
            schoolName={schoolName}
          />

          <div>
            <LineupBlock
              title="Lineup · doubles"
              note="three required · pairs carried from singles"
              lines={doubles}
              addLabel="Add pair"
              schoolKey={schoolKey}
              schoolName={schoolName}
            />
            <div
              className="text-micro mt-2.5"
              style={{ color: "var(--ink-500)" }}
            >
              All nine lines are expected — forfeit a line only when a team
              can&apos;t field a player for it.
            </div>
          </div>
        </div>
      </EventShell>

      {/* `padding:16px 32px 20px` — the artboard's, not `EventShell`'s footer
          slot at 16/48/22. See the header. */}
      <div className="flex shrink-0 items-center gap-3 border-t border-[var(--border-hairline)] px-8 pb-5 pt-4">
        {/* Inside the rebuilt set. */}
        <Link
          href="/dashboard/team/schedule"
          className={advButton("ghost", "md")}
        >
          Cancel
        </Link>
        <div className="flex-1" />
        <span className="text-[11px]" style={{ color: "var(--ink-600)" }}>
          Creates <span className="tabular">{lineCount}</span>{" "}
          {lineCount === 1 ? "line" : "lines"} vs {schoolName}
        </span>
        {/* Inert — see the header. A button rather than a span because this is
            the screen's one primary action and the artboard draws it as the
            design system's Button; it simply has nothing it may do yet. */}
        <button type="button" className={advButton("primary", "md")}>
          Create dual
        </button>
      </div>
    </div>
  );
}

/**
 * A rail row's subline: squad · how it has gone against us.
 *
 * The history is looked up under the name a dual is actually recorded under —
 * `programDisplayName()`, squad-qualified — and under nothing else. Step one's
 * `historyForProgram` (`dual-school-step.tsx`) explains why there is
 * deliberately no fall back to the bare school name: a school fielding both
 * squads is two rows here, and a record keyed on the bare name would print
 * on both of them.
 */
function railSubline(
  program: ProgramSearchResult,
  histories: Map<string, OpponentDualHistory>
): string {
  const history = opponentHistoryFor(
    histories,
    programDisplayName(program.schoolName, program.team)
  );
  return [teamLabel(program.team), formatOpponentRecord(history)].join(" · ");
}

/**
 * One rail row.
 *
 * Subline is squad · how it has gone against us — `teamLabel` and
 * `formatOpponentRecord`. No conference and no division: `2b` keeps those for
 * the detail header, unlike `2c`'s list, which prints one of them per row. And
 * no season record — see the header.
 *
 * The selected row is not washed — it is weighted and carries a blue check,
 * which is the whole of what the artboard distinguishes it by — and it is the
 * one row with no hover state.
 */
function RailRow({
  name,
  subline,
  selected,
}: {
  name: string;
  subline: string;
  selected: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-[var(--radius-element)] p-2.5",
        "transition-colors duration-[var(--duration-hover)]",
        selected ? null : "hover:bg-[var(--surface-subtle)]"
      )}
    >
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-[13px] text-[var(--ink-900)]",
            selected ? "font-medium" : null
          )}
        >
          {name}
        </div>
        <div
          className="text-micro mt-0.5 truncate"
          style={{ color: "var(--ink-600)" }}
        >
          {subline}
        </div>
      </div>
      {selected ? (
        <Check
          size={13}
          strokeWidth={1.5}
          className="shrink-0 text-[var(--blue)]"
        />
      ) : null}
    </div>
  );
}

/**
 * One underlined fact — `2b` draws all four the same way, with a trailing
 * glyph that says how it is answered.
 *
 * A `<label>` rather than a `<div>`, now that every cell holds a real control:
 * the eyebrow is the control's name, so it labels it rather than sitting beside
 * it. The underlined row is `relative` so the Format cell's overlaid select
 * has something to fill.
 *
 * Not `field-row.tsx`'s `FieldCellText`/`FieldCellSelect`: those are 25b's row
 * and carry its `FieldRow` spacing (`mt-3.5`, `gap-8`) where this artboard
 * draws a plain four-up at `gap:24px`. Everything below the label matches those
 * cells exactly, `pt-1.5 pb-[7px]` and a 12px glyph included.
 */
function FieldCell({
  label,
  glyph,
  note,
  children,
}: {
  label: string;
  glyph: "calendar" | "chevron";
  /** Drawn under the underline, on Format alone. */
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <span className="relative flex items-center border-b border-[var(--border-hairline)] pb-[7px] pt-1.5">
        {children}
        <span className="flex-1" />
        {glyph === "calendar" ? (
          <Calendar
            size={12}
            strokeWidth={1.5}
            className="pointer-events-none shrink-0 text-[var(--ink-400)]"
          />
        ) : (
          <ChevronDown
            size={12}
            strokeWidth={1.5}
            className="pointer-events-none shrink-0 text-[var(--ink-400)]"
          />
        )}
      </span>
      {note ? (
        <span
          className="text-micro mt-[5px] block"
          style={{ color: "var(--ink-600)" }}
        >
          {note}
        </span>
      ) : null}
    </label>
  );
}

/**
 * The Site and Surface cells: a native `<select>` under the artboard's own
 * underline treatment, so the value the app will store is in the document
 * rather than implied by a label. `appearance-none` is what stops the platform
 * drawing a second chevron beside `FieldCell`'s.
 */
function FieldSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full cursor-pointer appearance-none bg-transparent text-[13px] text-[var(--ink-900)] outline-none"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Six singles or three doubles, under a ruled heading. */
function LineupBlock({
  title,
  note,
  lines,
  addLabel,
  schoolKey,
  schoolName,
}: {
  title: string;
  note: string;
  lines: LineupLine[];
  addLabel: string;
  /** `OpponentTarget.key` — see `DualBuildStep`. Rides in every row's key. */
  schoolKey: string;
  schoolName: string;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2.5 border-b border-[var(--border-hairline)] pb-[9px]">
        <span className="eyebrow">{title}</span>
        <span className="text-micro" style={{ color: "var(--ink-500)" }}>
          {note}
        </span>
      </div>
      <div className="mt-1 flex flex-col">
        {lines.map((line, index) => (
          <LineRow
            // The school's key rides in the row key on purpose: every name on
            // this row was typed against ONE school, and
            // `contribute_opponent_player` matches by name WITHIN the target
            // program, so a name that survived a change of school could
            // attach to a real, different person at the new one. This key
            // remounts the row and drops the resolved name with it.
            key={`${schoolKey}:${line.key}`}
            line={line}
            addLabel={addLabel}
            schoolName={schoolName}
            last={index === lines.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

const LINE_GRID = "grid grid-cols-[34px_1fr_20px_1fr_70px] items-center gap-2.5";

/**
 * One line.
 *
 * A forfeited line names nobody on either side, so its two middle cells are
 * empty — spans rather than nothing, because the grid's five columns are what
 * keeps "Forfeited" under "Forfeit" on the rows above it. `2b` draws the last
 * row of each block without the rule and without the hover wash; both follow
 * `last`.
 *
 * ── The one piece of per-row state on this screen ──────────────────────────
 * The opposing name, and it lives HERE rather than in a map upstream. The
 * failure this screen has to be incapable of is a name landing on a line
 * nobody meant, and a keyed map is where that happens: one stale key, one
 * index off by one, and a name typed on S1 is submitted under D3. A row that
 * holds its own name cannot be addressed by another row at all — `onCommit`
 * is a closure over this row's own setter, and the popup is handed no line id,
 * no index and no way to reach a sibling.
 *
 * Seeded from `line.theirLabels`, which is empty on all nine draft lines. The
 * fixture is never mutated; a reload is nine unnamed lines again.
 *
 * `active` is the popup saying it is open or still holding `2e`'s
 * confirmation. `2d` and `2e` both draw that row lifted above the rows below
 * it (`z-index:20`) with the Forfeit affordance showing — the resting row `2b`
 * draws keeps it hidden until the pointer is on it, which is what T6 built and
 * what stays.
 */
function LineRow({
  line,
  addLabel,
  schoolName,
  last,
}: {
  line: LineupLine;
  addLabel: string;
  schoolName: string;
  last: boolean;
}) {
  const forfeited = line.forfeit !== null;
  const [theirLabel, setTheirLabel] = useState(line.theirLabels.join(" / "));
  const [active, setActive] = useState(false);

  return (
    <div
      className={cn(
        LINE_GRID,
        "py-[7px]",
        // The popup's containing block: `2d` anchors it to `right:0` of the
        // row, so the row is what it is positioned against.
        "relative",
        active ? "z-20" : null,
        last
          ? null
          : [
              "border-b border-[var(--border-hairline)]",
              "transition-colors duration-[var(--duration-hover)]",
              "hover:bg-[var(--surface-subtle)]",
            ]
      )}
    >
      <span
        className="mono text-[11px]"
        style={{ color: "var(--ink-600)" }}
      >
        {line.slot}
      </span>

      {forfeited ? (
        // The one string a forfeited builder line prints, and the one
        // `line-row.tsx` prints for the same state on the event page.
        <span className="text-[13px]" style={{ color: "var(--ink-500)" }}>
          — no available player
        </span>
      ) : (
        <span className="truncate text-[13px] text-[var(--ink-900)]">
          {line.ourLabels.join(" / ")}
        </span>
      )}

      {forfeited ? (
        <span />
      ) : (
        <span className="text-micro" style={{ color: "var(--ink-400)" }}>
          vs
        </span>
      )}

      {forfeited ? (
        <span />
      ) : (
        // `2d`/`2e`. The trigger `2b` draws is this component's closed state,
        // unchanged — 11px ink-400, a 9px plus, and the block's own
        // "Add name"/"Add pair".
        <OpponentPopup
          value={theirLabel}
          addLabel={addLabel}
          discipline={line.discipline}
          // The header's name, the rail's tick and `2e`'s confirmation all
          // read the one school step one chose. `programs` holds no short
          // form of a name, so the full name serves for both.
          schoolName={schoolName}
          schoolShortName={schoolName}
          // No saved roster until T23 fetches this school's own — see the
          // header. An empty list is the popup's "nothing to warn about"
          // state, not an error.
          candidates={[]}
          draftName=""
          onCommit={setTheirLabel}
          onActiveChange={setActive}
        />
      )}

      {forfeited ? (
        <span
          className="text-micro text-right"
          style={{ color: "var(--ink-500)" }}
        >
          Forfeited
        </span>
      ) : (
        // `opacity:0` with `style-hover="opacity:1"` on the span itself, which
        // is what `2b` draws — the row's own hover is a separate wash. Drawn
        // as drawn, and reported: an invisible target is not a discoverable
        // control.
        //
        // `active` is the second half of the same drawing rather than a
        // softening of it: `2d` and `2e` draw this word plainly visible on the
        // row their popup is anchored to, and `2b` draws it hidden on a row at
        // rest. Both are reproduced — the resting row is untouched.
        <span
          className={cn(
            "text-micro text-right transition-opacity duration-[var(--duration-hover)] hover:opacity-100",
            active ? "opacity-100" : "opacity-0"
          )}
          style={{ color: "var(--blue)" }}
        >
          Forfeit
        </span>
      )}
    </div>
  );
}
