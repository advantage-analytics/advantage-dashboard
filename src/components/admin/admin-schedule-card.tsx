import {
  SettingsCard,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { EventMark } from "@/components/dashboard/schedule/static/event-mark";
import { ResultMark } from "@/components/dashboard/result-mark";
import { EmptyMark } from "@/components/ui/empty-mark";
import {
  ADMIN_SCHEDULE_COLUMNS,
  HEADER_ROW,
  ROW,
} from "@/components/admin/admin-schedule-table-layout";
import { formatEventShortDay, todayISO } from "@/lib/schedule/format";
import type { AdminTeamEvent } from "@/lib/data/admin-team-server";

/**
 * How somebody else's season actually went — from the admin console.
 *
 * `TeamPage.dc.html`'s Schedule & results card (canvas lines 1146–1189). Five
 * columns — `Date · Event · Type · Score · Result` — whose widths live in
 * `admin-schedule-table-layout.ts` beside the canvas lines they came from.
 *
 * **Read-only, and that is the whole design.** There is no row click, no
 * drawer, no score entry and no hover wash: an admin opening this console is
 * establishing what a program has recorded, and editing a coach's season from
 * behind their back is not a thing this page should make easy. (The canvas
 * draws an "Enter results for this team" link in the card header. It is not
 * here: the href it needs does not exist on this base — a later task adds it —
 * and a link that goes nowhere is worse than no link.)
 *
 * ── The Result column, and why it has five readings, not two ───────────────
 * The loader hands over six states (`AdminTeamEventResult`), and collapsing
 * any of them into "no result yet" would be the console claiming a coach has
 * not entered something they have. `resultCell()` below maps each one, and
 * the two that the loader deliberately cannot tell apart — a scheduled event
 * before its date and a scheduled event after it — are separated here, by the
 * date, which is the only place that information exists.
 *
 * ── One outcome register ───────────────────────────────────────────────────
 * A decided event draws `ResultMark`, and only `ResultMark` — the glyph with
 * its word as the accessible name (Data Table law 2). Not the glyph plus a
 * visible "Won": the word as an outcome register is retired product-wide, and
 * a row carrying both would put two registers in one cell. The undecided
 * readings are short phrases at `text-micro` (11px ink-500), which is what
 * that law already prescribes for "Not played", and they sit on the same x as
 * the glyph so the column does not zigzag.
 *
 * ── Order ──────────────────────────────────────────────────────────────────
 * Newest first, straight out of the loader: `readScheduleWithClient` orders
 * `program_events` by `starts_on` descending and `scheduleRowsFrom` preserves
 * it. This file does not re-sort — a second ordering here is a second thing
 * to keep in step with the program's own schedule page, which reads the same
 * rows through the same two functions.
 */

/**
 * `vs Yale University` · `at Brown University` · `Ivy Invitational`.
 *
 * The prefix is a DUAL's, and only a dual's. `AdminTeamEvent.name` is the
 * opponent school for a dual but the tournament's OWN name otherwise, so
 * "vs Ivy Invitational" would read as a team the program played.
 *
 * A neutral-site dual reads `vs`, with the US collegiate convention behind it:
 * `at` is a claim that the program travelled to the opponent's courts, and at
 * a neutral site nobody did. `vs` is the neutral form of the sentence, not a
 * second claim that the program hosted — and this card has no Venue column to
 * contradict, which is the one place the distinction would have mattered.
 */
function eventLabel(event: AdminTeamEvent): string {
  if (event.kind !== "dual") return event.name;
  return event.site === "away" ? `at ${event.name}` : `vs ${event.name}`;
}

/** The em dash a row draws when there is no team score to print. */
function ScoreCell({ event }: { event: AdminTeamEvent }) {
  if (event.teamScore === null) {
    return (
      <span className="flex items-center">
        <EmptyMark
          label={
            event.kind === "dual"
              ? "No team score yet"
              : "Tournaments have no team score"
          }
        />
      </span>
    );
  }

  return (
    <span className="tabular text-[13px] text-[var(--ink-900)]">
      {event.teamScore.us}–{event.teamScore.them}
    </span>
  );
}

/**
 * One reading per state the loader can produce. Nothing falls through to a
 * blank cell, and nothing borrows another state's words.
 *
 * - `won` / `lost` — the glyph, beside the decided score in the cell before it.
 * - `level` — the glyph's third face (`circle-minus`), because a dual that
 *   finished level IS decided; calling it "no result" would lose a real one.
 * - `playing` — "In progress". Some lines are in and the event is not decided,
 *   which is neither "nobody has played" nor "somebody forgot to enter it".
 *   The Score cell stays a dash: the loader gates `teamScore` until every line
 *   is in, and a partial dual score printed as final is a result the page
 *   invented. The program's own Schedule page prints a RUNNING score here,
 *   off the event's entries; this card is not given them, and inventing one
 *   from what it has would be a different number on the same event.
 * - `played` — a finished tournament. `EmptyMark`, the same mark the program's
 *   own schedule draws, because there is no team-vs-team result to report: a
 *   bracket has no "us" and no "them", and "Awaiting results" here would send
 *   an admin hunting for a score that is not missing, it does not exist.
 * - `scheduled` — nobody has played, and the DATE decides the sentence. Before
 *   the event, "Not played" (the canvas' word, and Data Table law 1's). After
 *   it, "Awaiting results" — the event happened and nothing was entered, which
 *   is the single most common support case this console is opened for.
 */
function ResultCell({ event }: { event: AdminTeamEvent }) {
  if (event.result === "won" || event.result === "lost") {
    return <ResultMark won={event.result === "won"} />;
  }

  if (event.result === "level") {
    return <ResultMark won={null} />;
  }

  if (event.result === "played") {
    return (
      <span className="flex items-center">
        <EmptyMark label="No team result — a tournament has no team score" />
      </span>
    );
  }

  const word =
    event.result === "playing"
      ? "In progress"
      : // `endsOn` rather than `startsOn`, so a tournament still running does
        // not get told its results are late on its second morning.
        event.endsOn < todayISO()
        ? "Awaiting results"
        : "Not played";

  return <span className="text-micro whitespace-nowrap">{word}</span>;
}

/** "12 events · 3 decided" — the season in one line, beside the card title. */
function scheduleMeta(schedule: readonly AdminTeamEvent[]): string {
  const decided = schedule.filter(
    (event) =>
      event.result === "won" ||
      event.result === "lost" ||
      event.result === "level",
  ).length;
  const events = `${schedule.length} ${schedule.length === 1 ? "event" : "events"}`;
  return `${events} · ${decided} decided`;
}

export function AdminScheduleCard({
  schedule,
}: {
  /** Every event on the program, newest first — the loader's own order. */
  schedule: readonly AdminTeamEvent[];
}) {
  return (
    <SettingsCard className="bg-[var(--surface-card)]">
      <SettingsCardTitle
        trailing={
          schedule.length > 0 ? (
            <span className="text-[11px] text-[var(--ink-500)]">
              {scheduleMeta(schedule)}
            </span>
          ) : undefined
        }
      >
        Schedule &amp; results
      </SettingsCardTitle>

      {/* The column labels render whether or not there are rows under them:
          they are the card's own chrome and they are the payload of the empty
          state below — a reader learns what a schedule row will say without a
          value being invented. */}
      <div className={HEADER_ROW}>
        {ADMIN_SCHEDULE_COLUMNS.map((label) => (
          <span
            key={label}
            className="truncate text-[12px] whitespace-nowrap text-[var(--ink-600)]"
          >
            {label}
          </span>
        ))}
      </div>

      {schedule.map((event) => (
        <div
          key={event.id}
          className={`${ROW} border-t border-[var(--border-hairline)]`}
        >
          <span className="tabular text-[12px] whitespace-nowrap text-[var(--ink-700)]">
            {formatEventShortDay(event.startsOn)}
          </span>

          <span className="flex min-w-0 items-center gap-2.5">
            {/* The opponent's initials for a dual, the tournament glyph
                otherwise — `EventMark`, the mark the program's own schedule,
                the dual picker and the event drawer all draw. A second mark
                of this card's own would be a second set of initials rules. */}
            <EventMark kind={event.kind} name={event.name} size={26} />
            <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
              {eventLabel(event)}
            </span>
          </span>

          {/* A plain word, never a type swatch. */}
          <span className="truncate text-[12px] text-[var(--ink-600)]">
            {event.kind === "dual" ? "Dual" : "Tournament"}
          </span>

          <ScoreCell event={event} />
          <ResultCell event={event} />
        </div>
      ))}

      {/* A program with no schedule is a real and common state on this console
          — a claimed program whose coach has not built a season yet — and the
          card keeps its own shape above it rather than rendering nothing,
          which would leave the `#schedule` pill scrolling to a bare heading.
          No action beside the sentence: this card is read-only, and the
          console has no way to add an event to somebody else's season. */}
      {schedule.length === 0 && (
        <div className="border-t border-[var(--border-hairline)] py-3">
          <span className="text-[12px] text-[var(--ink-500)]">
            No events on this program yet. A coach adds duals and tournaments
            from the team&rsquo;s own schedule.
          </span>
        </div>
      )}
    </SettingsCard>
  );
}
