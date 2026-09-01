"use client";

import { useState } from "react";
import Link from "next/link";
import { Calendar, Check, ChevronDown, Search } from "lucide-react";
import { capitalize, cn } from "@/lib/utils";
import { advButton } from "@/lib/ui/adv-button";
import { EventShell } from "@/components/dashboard/schedule/event-shell";
import { OpponentPopup } from "@/components/dashboard/schedule/static/opponent-popup";
import { divisionLabel, teamLabel } from "@/lib/data/programs-server";
import { formatOpponentRecord } from "@/lib/schedule/opponent-history";
import { siteTitle } from "@/lib/schedule/format";
import {
  DUAL_DRAFT_EVENT,
  DUAL_DRAFT_LINES,
  DUAL_DRAFT_OPPONENT_SHORT,
  DUAL_DRAFT_SAVED_ROSTER,
  DUAL_DRAFT_TYPED_NAME,
  OUR_CONFERENCE,
  RAIL_SCHOOLS,
  type DirectorySchool,
} from "@/lib/schedule/fixtures";
import type { LineupLine } from "@/components/dashboard/schedule/lineup-editor";

/**
 * The Format cell's value, in the `"<bestOf>|<adScoring>"` encoding
 * `dual-form.tsx:266` decodes with `format.split("|")` — this run's one live
 * guardrail seam (`docs/ui-revamp-guardrails.md` §3.1 and §4, and `FORMATS`'
 * first entry at `dual-form.tsx:53`). It is the same answer
 * `DUAL_DRAFT_EVENT.format` carries as an `EventFormat`: best of 3, no-ad.
 *
 * Written out rather than interpolated from that `EventFormat`, because
 * `adScoring` is `boolean | null` and a null interpolates as the STRING
 * "null" — which the decoder's `adScoring === "true"` reads as a confident
 * `false`. That is a wrong answer that looks like a real one, and it is the
 * exact failure `tournament-form.tsx`'s header records: format arrived as
 * `{}`, `adScoring` arrived null, and every tournament video failed submission
 * long after the coach had left. The draft's answer is an explicit `false`, so
 * that is what the control carries.
 */
const FORMAT_VALUE = "3|false";

/**
 * `2b` — step two of a new dual: the master–detail builder, from fixtures.
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
 * ── Static ─────────────────────────────────────────────────────────────────
 * Nothing here fetches and nothing here writes. `dual-form.tsx` is the DB-wired
 * implementation of this same screen — its own header describes 2b — and stays
 * exactly where it is, dormant, along with `OpponentRail` and `LineupEditor`.
 * This component imports none of them; the rows come from
 * `RAIL_SCHOOLS` / `DUAL_DRAFT_LINES` / `DUAL_DRAFT_EVENT` in
 * `lib/schedule/fixtures.ts`, and the nine lines are typed as the same
 * `LineupLine` the dormant editor takes.
 *
 * The sidebar and the 44px "Meridian State › Schedule › New dual" topbar the
 * artboard draws are the app's own chrome and already on screen.
 *
 * ── What is drawn and what is wired ────────────────────────────────────────
 * Four things on this screen are pictures of controls, for the same reason
 * `2c`'s search field is:
 *
 *   the rail rows       `2b` gives the five unselected rows a hover wash and no
 *                       `cursor:pointer`. Re-targeting a dual is not a
 *                       highlight — `dual-form.tsx`'s `takeOpponent` has to
 *                       clear every opposing name typed against the old school
 *                       or a name can silently attach to a real, different
 *                       person at the new one — and none of that is drawn here.
 *   date/site/surface   Underlined cells with a trailing glyph. A native
 *                       `<input type="date">` cannot render "09-26", and a
 *                       `<select>` over three sites that commits nothing is a
 *                       control whose only effect is to disagree with the
 *                       artboard.
 *   Format              See `FORMAT_VALUE` above — the drawn label is the sets
 *                       half only, so no native `<select>` can both carry the
 *                       whole encoding and print what `2b` prints.
 *   "Create dual"       Inert. Creating writes nine lines to the database,
 *                       which this run does not do, and lands on
 *                       `/dashboard/team/schedule/[eventId]`, which is outside
 *                       the set of screens rebuilt here.
 *
 * The opponent cells ("Add name" / "Add pair") are the one exception, and the
 * only live control on this screen: `2d` and `2e` draw the popup behind them,
 * so each cell is an `OpponentPopup` (T7). It writes to the row's own local
 * state and nowhere else — no fixture is mutated, nothing is persisted, and a
 * reload is back to nine unnamed lines.
 *
 * ── What the design draws that this app cannot know ────────────────────────
 * "18–4" and its five siblings on the rail are each opponent's OWN season
 * record, from matches this program never saw — `opponent-history.ts`'s header
 * says outright that the figure does not exist anywhere in this app. Drawn
 * because the artboard draws it, held as the literal string the design wrote,
 * and reported. The head-to-head half beside it ("you lead 3–1") IS the app's
 * own vocabulary, through `formatOpponentRecord`.
 */
/**
 * The school `2b` draws, and the only one it can draw.
 *
 * `RAIL_SCHOOLS[0]` is `CONFERENCE_SCHOOLS[0]` by reference — the same
 * Ridgeline row `2c` lists and this rail draws checked — so the header's name
 * and the rail's tick cannot drift apart. It is read from the rail rather than
 * passed in, and that is the fix for a real defect: this screen's date, site,
 * format and nine lines are Ridgeline's, drawn and fixed, so a header that
 * followed `2c`'s selection put one school's name over another school's data
 * for four of the five rows `2c` offers.
 *
 * The artboard has one path; the reproduction has one path. The header
 * following the selection was invented beyond the design, not required by it.
 *
 * **The re-wiring must undo this.** Once a real dual is being built, the
 * school genuinely does travel from step one, and this constant becomes the
 * prop it used to be — alongside `DUAL_DRAFT_EVENT` and `DUAL_DRAFT_LINES`,
 * which become the event and lineup under construction. Re-pointing the
 * loaders without re-threading the school would pin every new dual to
 * Ridgeline.
 */
const DUAL_DRAFT_SCHOOL: DirectorySchool = RAIL_SCHOOLS[0];

export function DualBuildStep() {
  const { program } = DUAL_DRAFT_SCHOOL;

  // Decoded back the way `dual-form.tsx:266` decodes it — `split("|")`, then
  // `Number()` on the first half and `=== "true"` on the second. The two
  // strings `2b` prints are that round trip, so the label and the value cannot
  // drift into disagreeing about which format this dual is.
  const [encodedBestOf, encodedAdScoring] = FORMAT_VALUE.split("|");
  const formatSets = `Best of ${Number(encodedBestOf)} sets`;
  const formatScoring =
    encodedAdScoring === "true" ? "Ad scoring" : "No-ad scoring";

  // "Big Ten · D-I" — conference first. `programSubtitle()` prints the two the
  // other way round ("D-I · Big Sky") and four claim-flow call sites depend on
  // that order, so this composes its own rather than reversing a shared helper
  // for one screen. The artboard's order, and reported.
  const headerSubline = [program.conference, divisionLabel(program.division)]
    .filter(Boolean)
    .join(" · ");

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
            {/* Drawn, not wired — see the header. A field that took keystrokes
                over six fixture rows would be a worse lie than a picture of
                one, the same call `2c`'s search field gets. */}
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
                {OUR_CONFERENCE} · type to search all
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
            {RAIL_SCHOOLS.map((row) => (
              <RailRow
                key={row.program.programKey}
                school={row}
                selected={row.program.programKey === program.programKey}
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
                  {program.schoolName}
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
              <span className="mono text-[13px] text-[var(--ink-900)]">
                {/* "09-26", not `formatEventSpan`'s "26 Sep". The artboard's
                    cell is month and day, so the year on the draft's
                    `startsOn` is sliced off rather than formatted — the same
                    slice `2c`'s last-played cell takes. */}
                {DUAL_DRAFT_EVENT.startsOn.slice(5)}
              </span>
            </FieldCell>

            <FieldCell label="Site" glyph="chevron">
              <span className="text-[13px] text-[var(--ink-900)]">
                {siteTitle(DUAL_DRAFT_EVENT.site)}
              </span>
            </FieldCell>

            <FieldCell label="Surface" glyph="chevron">
              <span className="text-[13px] text-[var(--ink-900)]">
                {/* The fixture holds the dataset's own lowercase "hard" — 7d
                    draws it that way in a facts line. `2b` draws it as a
                    field's value, title-cased, so it is title-cased here: the
                    same treatment `siteTitle()` gives site one cell over. */}
                {DUAL_DRAFT_EVENT.surface ? capitalize(DUAL_DRAFT_EVENT.surface) : ""}
              </span>
            </FieldCell>

            {/* `2b` draws the ad half BELOW the underline rather than inside
                the value, which is the whole reason no native `<select>` can
                print this cell — see `FORMAT_VALUE`. */}
            <FieldCell label="Format" glyph="chevron" note={formatScoring}>
              <span className="text-[13px] text-[var(--ink-900)]">
                {formatSets}
              </span>
            </FieldCell>
          </div>

          <LineupBlock
            title="Lineup · singles"
            note="six required · from your ladder"
            lines={singles}
            addLabel="Add name"
          />

          <div>
            <LineupBlock
              title="Lineup · doubles"
              note="three required · pairs carried from singles"
              lines={doubles}
              addLabel="Add pair"
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
          {lineCount === 1 ? "line" : "lines"} vs {program.schoolName}
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
 * One rail row.
 *
 * Subline is squad · their own season · how it has gone against us —
 * `teamLabel`, the fixture's literal `seasonRecord`, and
 * `formatOpponentRecord`. No conference and no division: `2b` keeps those for
 * the detail header, unlike `2c`'s list, which prints one of them per row.
 *
 * The selected row is not washed — it is weighted and carries a blue check,
 * which is the whole of what the artboard distinguishes it by — and it is the
 * one row with no hover state.
 */
function RailRow({
  school,
  selected,
}: {
  school: DirectorySchool;
  selected: boolean;
}) {
  const { program, history, seasonRecord } = school;
  const subline = [
    teamLabel(program.team),
    seasonRecord,
    formatOpponentRecord(history),
  ].join(" · ");

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
          {program.schoolName}
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
 * glyph that says how it would be answered.
 *
 * Not `field-row.tsx`'s `FieldCellText`/`FieldCellSelect`: those are 25b's row
 * and carry its `FieldRow` spacing (`mt-3.5`, `gap-8`) where this artboard
 * draws a plain four-up at `gap:24px`, and they render real inputs — see the
 * header for why these are drawn. Everything below the label matches those
 * cells exactly, `pt-1.5 pb-[7px]` and a 12px glyph included, so the two read
 * as one control when the screen is re-wired.
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
    <div>
      <span className="eyebrow">{label}</span>
      <div className="flex items-center border-b border-[var(--border-hairline)] pb-[7px] pt-1.5">
        {children}
        <div className="flex-1" />
        {glyph === "calendar" ? (
          <Calendar
            size={12}
            strokeWidth={1.5}
            className="shrink-0 text-[var(--ink-400)]"
          />
        ) : (
          <ChevronDown
            size={12}
            strokeWidth={1.5}
            className="shrink-0 text-[var(--ink-400)]"
          />
        )}
      </div>
      {note ? (
        <span
          className="text-micro mt-[5px] block"
          style={{ color: "var(--ink-600)" }}
        >
          {note}
        </span>
      ) : null}
    </div>
  );
}

/** Six singles or three doubles, under a ruled heading. */
function LineupBlock({
  title,
  note,
  lines,
  addLabel,
}: {
  title: string;
  note: string;
  lines: LineupLine[];
  addLabel: string;
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
            // The program key rides in the row key on purpose, and it is
            // `OpponentTarget.key`'s mechanism (`opponent-name-cell.tsx`):
            // every name on this row was typed against ONE school, and
            // `contribute_opponent_player` matches by name WITHIN the target
            // program, so a name that survived a re-target could attach to a
            // real, different person at the new school. Re-targeting cannot
            // happen while the school is a module const — but when the
            // re-wiring makes it travel again, this key already remounts the
            // row and drops the resolved name with it. Nothing to remember.
            key={`${DUAL_DRAFT_SCHOOL.program.programKey}:${line.key}`}
            line={line}
            addLabel={addLabel}
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
 * ── The one piece of state on this screen ──────────────────────────────────
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
  last,
}: {
  line: LineupLine;
  addLabel: string;
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
          // The header's name and the rail's tick read the same object, and so
          // does `2e`'s confirmation. One school, one source, no drift.
          schoolName={DUAL_DRAFT_SCHOOL.program.schoolName}
          schoolShortName={DUAL_DRAFT_OPPONENT_SHORT}
          candidates={DUAL_DRAFT_SAVED_ROSTER}
          draftName={DUAL_DRAFT_TYPED_NAME}
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
