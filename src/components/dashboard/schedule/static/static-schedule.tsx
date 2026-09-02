"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, CircleCheck, CircleX } from "lucide-react";
import { cn } from "@/lib/utils";
import { DualWidget } from "@/components/dashboard/schedule/static/dual-widget";
import { EventDrawer } from "@/components/dashboard/schedule/static/event-drawer";
import { formatEventDay, siteTitle } from "@/lib/schedule/format";
import { lineCoverageFrom } from "@/lib/schedule/entry-state";
/**
 * `import type`, and only ever `import type`.
 *
 * `schedule-server.ts` builds a cookie-scoped Supabase client; a value import
 * from it would follow this `"use client"` file into a route bundle. The type
 * is erased at build, which is the same lifeline `fixtures.ts` used for
 * `ProgramSearchResult` and `OpponentDualHistory` and the one `README.md` §4
 * documents. `SeasonSummary` lives beside the function that derives it because
 * the two are one contract — the doc comment there is the spec for what each
 * figure counts and, more importantly, what it deliberately does not.
 */
import type { SeasonSummary } from "@/lib/data/schedule-server";
import type { EventDetail, ScheduleRow } from "@/lib/schedule/types";

/**
 * One program's schedule, as this component reads it.
 *
 * `ScheduleRow[]` and `EventDetail` are `scheduleRowsFrom()`'s and
 * `eventDetailFrom()`'s own return types, composed and redeclared nowhere —
 * `fixtures.ts` declared this same pair and said why: "it is the same pair the
 * live route already hands `ScheduleList`, so a component taking this takes the
 * loader's output unchanged later." Later is now, and the claim held: the
 * fixture import became a loader call and no prop moved.
 */
export interface ScheduleData {
  rows: ScheduleRow[];
  details: Record<string, EventDetail>;
}

/**
 * `7e`, `7d`, `7c` and `4c` — the schedule's drawer-plus-pane frame.
 *
 * Two branches over one `ScheduleData`, and `rows.length` is what picks:
 *
 *   rows        → `7d`, the landing state: the program's events in the drawer
 *                 and a pane that prompts, carrying the two facts that hold
 *                 without a selection.
 *   no rows     → `7e`, day zero: "None yet" in both drawer sections and the
 *                 empty state over the nine-line scaffold.
 *
 * The branch is on the rows rather than on a flag, because `7e` is not `7d`
 * with the rows removed — its pane is different copy over different structure —
 * and because no boolean can then drift out of step with what the drawer draws.
 * `EMPTY_SCHEDULE` used to stand in for the second branch; a program that has
 * scheduled nothing reaches it for real.
 *
 * ── Selection ─────────────────────────────────────────────────────────────
 * The drawer's rows and the pane's "Jump to" rows both move one piece of local
 * state and nothing else — no route change, no fetch. The route hands down
 * every event's detail with the rows, so selecting an event whose detail
 * carries a lineup swaps the prompt pane for `DualWidget` — `7c` at 620px and
 * `4c` at 860px — with no round-trip; that walk `7d` → `7c` → `4c` is one
 * `useState` and a window resize, and nothing else moves.
 *
 * A selection the details map cannot answer falls back to the same prompt
 * pane. Two real shapes land there and both are designed states rather than
 * gaps: a tournament, which has no `DualWidget`, and a dual whose lineup is not
 * set, which `7d` describes in as many words.
 *
 * ── Chrome ────────────────────────────────────────────────────────────────
 * The sidebar and the 44px breadcrumb topbar the artboards draw are the app's
 * own and already on screen. See `event-drawer.tsx`'s header for the one drawn
 * element that has nowhere to go — the topbar's event count.
 */
export function StaticSchedule({
  schedule,
  season,
  today,
  canCreate,
  canAddOwnMatch,
}: {
  schedule: ScheduleData;
  /**
   * `seasonSummaryFrom()` upstream — the three figures `7d`'s season block
   * draws. Structured, never pre-formatted: the en dash, the `·` and the
   * `tabularNumerals()` treatment are this component's business, and the
   * loader's header says so.
   */
  season: SeasonSummary;
  /**
   * Today in UTC, `YYYY-MM-DD`.
   *
   * A prop rather than a clock read, because this is a `"use client"` component
   * that also renders on the server: `new Date()` here would give the two
   * renders different answers and React would report a hydration mismatch on
   * the "Next" row. UTC, so a reader far enough east or west can see a boundary
   * case off by one — a coarse label being a day out near midnight is a much
   * smaller claim than the fixed "in 4 days" it replaces, which was wrong every
   * time.
   */
  today: string;
  /** `isProgramStaff` upstream — gates the drawer-footed "New event" CTA. */
  canCreate: boolean;
  /**
   * `canUploadForProgram` upstream — gates `7e`'s "One-off match in Matches".
   * `7e` is the only artboard in this task's set that draws such a control, so
   * the prop stays rather than being dropped with the rest of the route's data.
   */
  canAddOwnMatch: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // A dual with at least one entry is the only thing `DualWidget` can draw:
  // `7c`/`4c` are a lineup, and a lineup with no lines is `7d`'s "lineup not
  // set", not an empty widget. The `kind` test is not redundant with it — a
  // tournament detail would satisfy the entry count and is a different pane.
  const selected = selectedId ? (schedule.details[selectedId] ?? null) : null;
  const dual =
    selected && selected.event.kind === "dual" && selected.entries.length > 0
      ? selected
      : null;

  return (
    <div className="flex min-h-0 w-full flex-1 bg-[var(--surface-card)]">
      <EventDrawer
        rows={schedule.rows}
        selectedId={selectedId}
        onSelect={setSelectedId}
        canCreate={canCreate}
      />
      {schedule.rows.length === 0 ? (
        <DayZeroPane canAddOwnMatch={canAddOwnMatch} />
      ) : dual ? (
        <DualWidget detail={dual} />
      ) : (
        <SelectAnEventPane
          today={today}
          schedule={schedule}
          season={season}
          onSelect={setSelectedId}
        />
      )}
    </div>
  );
}

/** The pane's own box — `padding: 32px 32px 24px` on both artboards. */
function Pane({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col px-8 pb-6 pt-8">{children}</div>
  );
}

/**
 * How far off an event is, as `7d`'s trailing micro-copy words it.
 *
 * Both arguments are plain `YYYY-MM-DD` civil dates, differenced as UTC
 * midnights so no zone or daylight-saving shift can move the count: these are
 * days on a calendar, not instants.
 *
 * Returns null for an event too far out to phrase this way — the row then
 * prints nothing rather than a number nobody asked for, and the date is already
 * on the line above it.
 */
function daysAway(startsOn: string, today: string): string | null {
  const day = 24 * 60 * 60 * 1000;
  const from = Date.parse(`${today}T00:00:00Z`);
  const to = Date.parse(`${startsOn}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;

  const days = Math.round((to - from) / day);
  if (days < 0) return null;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 30) return `in ${days} days`;
  return null;
}

/**
 * `7d`'s prompt pane: the title, the season strip, and the two jump rows.
 */
function SelectAnEventPane({
  schedule,
  season,
  today,
  onSelect,
}: {
  schedule: ScheduleData;
  season: SeasonSummary;
  today: string;
  onSelect: (eventId: string) => void;
}) {
  // `findLast` for Next, `find` for Last, and the asymmetry is the point:
  // `rows` is newest first, so the soonest event still ahead is at the END of
  // the run that is ahead, and the most recent played one is at the FRONT of
  // the played run.
  //
  // Next is chosen by DATE, not by played count. A played count of zero means
  // "no result recorded", which a January dual nobody scored has all year and
  // which every tournament has for weeks after it finishes — so the old
  // predicate offered the oldest unscored event as "Next" and never offered
  // the real one. The row now prints how far away it is, which would have made
  // that read "4 months ago" under a heading that says Next.
  const next =
    schedule.rows.findLast((row) => row.startsOn >= today) ?? null;
  const last = schedule.rows.find((row) => row.playedCount > 0) ?? null;

  // "hard". A surface belongs to the event, not to the row the drawer lists,
  // so it comes from the detail — and the detail map is deliberately partial,
  // hence the optional chain rather than an assumed hit.
  const nextSurface = next ? schedule.details[next.id]?.event.surface : null;

  // Counted off the same detail the pane already holds, so the row needs no
  // second read. `?? []` for the same reason `nextSurface` optional-chains:
  // the detail map is built for every event, but a row without one prints
  // "0 of 0" rather than throwing.
  const lastCoverage = lineCoverageFrom(
    last ? (schedule.details[last.id]?.entries ?? []) : []
  );

  return (
    <Pane>
      <span className="text-title-lg" style={{ letterSpacing: "-.5px" }}>
        Select an event
      </span>
      <div className="text-body-sm mt-2.5 max-w-[46ch] text-pretty">
        Pick a dual or tournament on the left to see its lineup, every
        line&apos;s result and the report behind each one.
      </div>

      {/* `flex-wrap`, on the row and on the rail, is the whole of what a real
          season needs that the artboard did not. `7d` drew four marks; a D-I
          program plays twenty-five duals and a program mid-February has played
          six. Wrapping keeps every mark — no cap, no ellipsis, no "last ten"
          rule the design never wrote — and a season short enough to fit lays
          out exactly as drawn, because nothing wraps until it must. */}
      <div className="mt-[22px] flex flex-wrap items-center gap-3.5">
        <span className="eyebrow-sm">Season</span>
        {/* One mark per DECIDED dual, oldest first — `seasonSummaryFrom()`'s
            order, which is a form strip's own reading order. Undecided duals
            and tournaments contribute no mark rather than a third glyph; the
            loader's header is the spec for which is which.

            Empty is a real season: a program whose duals are all still ahead
            of it has no form yet. The rail AND the divider both go in that
            case — a divider with one thing on its left separates nothing —
            leaving "Season" against the facts line, which still reads. */}
        {season.form.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {season.form.map((result, index) =>
                result === "won" ? (
                  <CircleCheck
                    key={index}
                    size={14}
                    strokeWidth={1.5}
                    className="text-[var(--viz-good)]"
                  />
                ) : (
                  <CircleX
                    key={index}
                    size={14}
                    strokeWidth={1.5}
                    className="text-[var(--viz-bad)]"
                  />
                )
              )}
            </div>
            <span className="h-3 w-px bg-[var(--border-medium)]" />
          </>
        ) : null}
        <span className="text-body-sm">
          {tabularNumerals(seasonFacts(season))}
        </span>
      </div>

      <div className="min-h-0 flex-1" />

      <div className="flex flex-col gap-0.5 border-t border-[var(--border-hairline)] pt-3.5">
        <span className="eyebrow-sm pb-1.5">Jump to</span>

        {next ? (
          <JumpRow
            label="Next"
            row={next}
            detail={
              <>
                {factsLine(next)}
                {nextSurface ? ` · ${nextSurface}` : null}
                {next.entryCount === 0 ? " · lineup not set" : null}
              </>
            }
            /* The design draws "in 4 days". Derived now rather than drawn:
               against fixtures the literal was flagged and harmless, against a
               real event it asserted a date. `today` is a prop rather than a
               clock read here, so the server and the client render the same
               string and there is no hydration mismatch. */
            trailing={
              <span className="text-micro tabular text-right">
                {daysAway(next.startsOn, today)}
              </span>
            }
            onSelect={onSelect}
          />
        ) : null}

        {last ? (
          <JumpRow
            label="Last"
            row={last}
            detail={
              <>
                {factsLine(last)} ·{" "}
                {/* The design draws "8 of 9 lines analyzed". Counted now, by
                    the same `lineCoverageFrom` the season strip sums — two
                    spellings of "analyzed" on one screen is how the drawn
                    figure came to sit under a computed one that disagreed
                    with it. */}
                <span className="tabular">{lastCoverage.analyzed}</span> of{" "}
                <span className="tabular">{lastCoverage.total}</span> lines
                analyzed
              </>
            }
            trailing={
              last.teamScore ? (
                <span className="tabular text-right text-[14px] text-[var(--ink-900)]">
                  {last.teamScore.us}–{last.teamScore.them}
                </span>
              ) : null
            }
            onSelect={onSelect}
          />
        ) : null}
      </div>
    </Pane>
  );
}

/** "Fri 26 Sep · Home" — the two facts every drawn row carries. */
function factsLine(row: ScheduleRow): string {
  return `${formatEventDay(row.startsOn)} · ${siteTitle(row.site)}`;
}

/**
 * "3–1 in duals · 31 of 36 lines analyzed" — the season block's sentence.
 *
 * One string rather than four interpolations in the JSX, so `tabularNumerals()`
 * below can find the digit runs and wrap each one exactly as `7d` draws them.
 * The punctuation is the design's and is checked at byte level by
 * `tests/schedule-static-copy.spec.ts`: `–` is U+2013 and `·` is U+00B7.
 *
 * Every figure comes from `seasonSummaryFrom()`. Nothing here decides what
 * counts as a dual, a decided dual or an analyzed line — that is the loader's
 * header, deliberately, so the marks beside this sentence and the record inside
 * it are one fact counted once.
 */
function seasonFacts({ dualRecord, lines }: SeasonSummary): string {
  return (
    `${dualRecord.won}–${dualRecord.lost} in duals · ` +
    `${lines.analyzed} of ${lines.total} lines analyzed`
  );
}

/**
 * One "Jump to" row. Selects its event — the same local state the drawer moves.
 */
function JumpRow({
  label,
  row,
  detail,
  trailing,
  onSelect,
}: {
  label: string;
  row: ScheduleRow;
  detail: React.ReactNode;
  trailing: React.ReactNode;
  onSelect: (eventId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(row.id)}
      className={cn(
        "-mx-3 grid cursor-pointer grid-cols-[60px_minmax(0,1fr)_92px_13px] items-center gap-4",
        "rounded-[var(--radius-element)] px-3 py-[11px] text-left",
        "transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-muted)]"
      )}
    >
      <span className="text-micro">{label}</span>
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="text-[13px] font-medium text-[var(--ink-900)]">
          vs {row.name}
        </span>
        <span className="text-micro" style={{ color: "var(--ink-600)" }}>
          {detail}
        </span>
      </span>
      {trailing}
      <ChevronRight
        size={13}
        strokeWidth={1.5}
        className="text-[var(--ink-300)]"
      />
    </button>
  );
}

/** `7e`'s pane: the empty state over the nine-line scaffold. */
function DayZeroPane({ canAddOwnMatch }: { canAddOwnMatch: boolean }) {
  return (
    <Pane>
      <span className="text-title-lg" style={{ letterSpacing: "-.5px" }}>
        No events yet
      </span>
      <div className="text-body-sm mt-2.5 max-w-[46ch] text-pretty">
        Create a dual and the lineup card builds itself — every slot becomes a
        real match the moment you set the line.
      </div>

      <div className="mt-3.5 flex items-center gap-2.5">
        {/* The artboard points these at `#3b` and `#3c`, which are the
            choose-type and tournament screens — `/dashboard/team/schedule/new`
            and `.../new/tournament`, both inside this run's rebuilt set. */}
        <Link href="/dashboard/team/schedule/new" className={LINK_CLASS}>
          New dual
        </Link>
        <Separator />
        <Link
          href="/dashboard/team/schedule/new/tournament"
          className={LINK_CLASS}
        >
          New tournament
        </Link>
        {canAddOwnMatch ? (
          <>
            <Separator />
            {/* Inert on purpose. The artboard points this one at `#7e` — its
                own frame, i.e. nowhere — and its real destination
                `/dashboard/matches/new` is outside the four routes this run
                rebuilds, which the brief puts off to later work. Drawn, gated
                by the same `canUploadForProgram` the DB-wired empty state used,
                and not wired. */}
            <span className={LINK_CLASS}>One-off match in Matches</span>
          </>
        ) : null}
      </div>

      <div className="mt-6 flex min-h-0 flex-1 flex-col self-stretch overflow-hidden rounded-[var(--radius-element)] border border-dashed border-[var(--border-medium)] px-5 pb-[18px] pt-4">
        <div className="flex items-baseline gap-2.5 border-b border-[var(--border-hairline)] pb-2.5">
          <span className="eyebrow">What a dual creates</span>
          <div className="flex-1" />
          <span className="text-micro" style={{ color: "var(--ink-400)" }}>
            <span className="tabular">9</span> lines · none set
          </span>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-[auto_repeat(6,minmax(34px,1fr))] gap-x-7 pt-2">
          <span className="eyebrow-sm self-center">Singles</span>
          <span className="eyebrow-sm self-center">Doubles</span>

          <ScaffoldSlot slot="S1" />
          <ScaffoldSlot slot="D1" />
          <ScaffoldSlot slot="S2" />
          <ScaffoldSlot slot="D2" />
          <ScaffoldSlot slot="S3" />
          <ScaffoldSlot slot="D3" />
          {/* Explicitly column one, or auto-placement would run S5 into the
              doubles column beside S4. */}
          <ScaffoldSlot slot="S4" className="col-start-1" />
          <ScaffoldSlot slot="S5" className="col-start-1" />
          <ScaffoldSlot slot="S6" className="col-start-1" />

          <div className="col-start-2 row-start-5 row-end-8 flex flex-col gap-[5px] self-end">
            <span className="text-micro max-w-[32ch] text-pretty">
              Opponent, format and lets are typed once and inherit down every
              line.
            </span>
            <span className="text-micro" style={{ color: "var(--ink-400)" }}>
              The team score adds itself up as lines resolve.
            </span>
          </div>
        </div>
      </div>
    </Pane>
  );
}

/** One scaffold line: the slot's label and the dot standing in for its result. */
function ScaffoldSlot({
  slot,
  className,
}: {
  slot: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="mono w-[22px] text-[11px] font-normal text-[var(--ink-500)]">
        {slot}
      </span>
      <span className="h-[5px] w-[5px] rounded-full bg-[var(--ink-200)]" />
    </div>
  );
}

/**
 * `--blue-text`, not the `--blue` the design file's `a` rule resolves to.
 *
 * The artboard sets only size and weight on these links and inherits colour
 * from DS v3's `tokens/base.css` (`a{color:var(--blue)}`) — a file
 * `src/styles/design-system/index.css` deliberately does not import, because
 * globals.css owns the anchor reset. `--blue` measures 3.68:1 on white and
 * fails WCAG 1.4.3 AA under 24px; `colors.css` added `--blue-text` for exactly
 * this ("use this the moment blue becomes a word") and twelve surfaces already
 * use it. Same hover target the rest of them take.
 */
const LINK_CLASS =
  "text-[12px] font-medium text-[var(--blue-text)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)]";

function Separator() {
  return <span className="text-[12px] text-[var(--ink-300)]">·</span>;
}

/**
 * Wrap each run of digits in a `.tabular` span.
 *
 * `seasonFacts()` returns one flat string; `7d` draws its numerals — 3, 1, 31,
 * 36 — each inside `<span class="tabular">`, with the en dash between the first
 * two left outside. Splitting on digit runs reproduces that markup exactly and
 * keeps the sentence itself in one place, whatever the figures turn out to be:
 * a 12–4 record wraps two digits where the artboard wrapped one, and the rule
 * does not change. Writing the spans out by hand would put a second copy of the
 * copy here, which is the drift `schedule-static-copy.spec.ts` exists to catch.
 */
function tabularNumerals(text: string): React.ReactNode[] {
  return text
    .split(/(\d+)/)
    .filter(Boolean)
    .map((part, index) =>
      /^\d+$/.test(part) ? (
        <span key={index} className="tabular">
          {part}
        </span>
      ) : (
        part
      )
    );
}
