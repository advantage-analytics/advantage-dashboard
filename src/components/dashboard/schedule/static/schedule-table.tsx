"use client";

import { ResultMark } from "@/components/dashboard/result-mark";
import { EmptyMark } from "@/components/ui/empty-mark";
import { EventMark } from "@/components/dashboard/schedule/static/event-mark";
import { dualScore } from "@/lib/schedule/entry-state";
import { formatEventDay, siteTitle } from "@/lib/schedule/format";
import { cn } from "@/lib/utils";
import type { EventDetail, ScheduleRow } from "@/lib/schedule/types";

/**
 * `Tc2` / `Tc2c` — the season as one inset table card.
 *
 * The Round 15 table laws, as the artboard applies them: eyebrow headers over
 * 52px rows, one hairline under the header and none between rows, hover as a
 * `--surface-muted` wash on a `radius-element` row inset 8px from the card's
 * edge (`-mx-4 px-4` inside the card's 24px padding). Column order is the
 * date-first grammar Matches shares — Date · Event · Type · Venue · Lines ·
 * Score · Result — every cell flush left under a flush-left header, and the
 * Event cell the one fluid column.
 *
 * Score and Result were right-aligned here and flush left on Matches, which
 * made the two most-scanned cells in the product read two ways depending on
 * the page. Left won: a score is spec'd flush left in a fixed track at one
 * precision, the outcome sits beside it and follows it, and header and value
 * then share an x in both tables — the same rule `EmptyMark` and `ResultMark`
 * follow inside their cells. The cost is that these rows no longer end on a
 * hard right edge, which Matches gets from its chevron and a container row is
 * forbidden (law 3); the Result track is 60px — sized to "Not played", its
 * widest content, not to the 52px heading, which clipped it by 4px — so the
 * trailing air is a column's, not a gap's.
 *
 * ── Row-click law (19a–c) ──────────────────────────────────────────────────
 * Event rows have NO trailing chevron. They peek: a click opens the drawer
 * beside the list, and the selected row keeps its wash for as long as the
 * drawer is open. "Open event" — the page behind the peek — lives in the
 * drawer's header, not on the row.
 *
 * ── What the cells say, beyond what the artboard draws ─────────────────────
 * The artboard draws two states of a dual: not played, and decided. A dual
 * with some lines in is neither, and the loader's `teamScore` is deliberately
 * null until every line is — "a partial dual score printed as final is a
 * result the page invented". So a dual in progress prints its RUNNING score
 * (read off the same `dualScore` the drawer shows) with "In progress" where
 * the outcome would go, and only a decided dual earns the mark. A
 * tournament has no team score, so its Score is "—" always and its Result is
 * "—" once anything under it has been played.
 */
export function ScheduleTable({
  rows,
  details,
  selectedId,
  onSelect,
}: {
  rows: ScheduleRow[];
  details: Record<string, EventDetail>;
  selectedId: string | null;
  /** `viaKeyboard` is true for Enter/Space, so the rail can take focus. */
  onSelect: (eventId: string, viaKeyboard: boolean) => void;
}) {
  return (
    <div className="surface-card min-w-0 px-6 pt-0.5 pb-1.5">
      <div
        className={cn(
          "grid items-center gap-4 border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
          SCHEDULE_GRID,
        )}
      >
        {SCHEDULE_COLUMNS.map((label) => (
          <span key={label} className="eyebrow-sm">
            {label}
          </span>
        ))}
      </div>

      {rows.map((row) => (
        <EventRow
          key={row.id}
          row={row}
          detail={details[row.id] ?? null}
          isSelected={row.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

/** The DOM id of one event's row — for focus return and `scrollIntoView` from the rail. */
export function scheduleRowId(eventId: string): string {
  return `schedule-row-${eventId}`;
}

/**
 * The artboard's seven columns, unchanged between `Tc2` and `Tc2c`.
 *
 * Exported so day zero draws THIS grid rather than a second one that agrees
 * with it today. `matches-day-zero.tsx` reads `LIST_GRID_COLS` from the row it
 * stands in for, for the same reason, and after that file drew a stale column
 * order for a while the rule is worth stating: a ghost table imports its
 * geometry, it never restates it.
 */
export const SCHEDULE_GRID =
  "grid-cols-[84px_minmax(150px,1fr)_88px_56px_56px_48px_60px]";

/**
 * The header row's labels, in `SCHEDULE_GRID` order — and the header below
 * renders FROM this, rather than restating it beside it. A constant the ghost
 * reads and the real table only agrees with is a second source of truth: rename
 * a column and day zero keeps the old word, silently, with the copy test still
 * green because it asserts the constant.
 */
export const SCHEDULE_COLUMNS = [
  "Date",
  "Event",
  "Type",
  "Venue",
  "Lines",
  "Score",
  "Result",
] as const;

function EventRow({
  row,
  detail,
  isSelected,
  onSelect,
}: {
  row: ScheduleRow;
  detail: EventDetail | null;
  isSelected: boolean;
  onSelect: (eventId: string, viaKeyboard: boolean) => void;
}) {
  const outcome = rowOutcome(row, detail);
  const isDual = row.kind === "dual";

  return (
    <button
      type="button"
      id={scheduleRowId(row.id)}
      aria-pressed={isSelected}
      // A keyboard "click" (Enter/Space on the button) arrives with detail 0;
      // a pointer click with the click count. One handler, both tell.
      onClick={(event) => onSelect(row.id, event.detail === 0)}
      className={cn(
        "-mx-4 grid h-[52px] w-[calc(100%+32px)] cursor-pointer items-center gap-4 rounded-[var(--radius-element)] px-4 text-left",
        "transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-muted)]",
        "outline-none focus-visible:shadow-[var(--focus-ring)]",
        SCHEDULE_GRID,
      )}
      style={{ background: isSelected ? "var(--surface-muted)" : undefined }}
    >
      <span
        className="tabular text-[12px] whitespace-nowrap"
        style={{ color: "var(--ink-700)" }}
      >
        {formatEventDay(row.startsOn)}
      </span>

      <span className="flex min-w-0 items-center gap-2.5">
        <EventMark kind={row.kind} name={row.name} size={26} />
        <span
          className="truncate text-[13px] font-medium"
          style={{ color: "var(--ink-900)" }}
        >
          {row.name}
        </span>
      </span>

      <span className="text-[12px]" style={{ color: "var(--ink-600)" }}>
        {isDual ? "Dual" : "Tournament"}
      </span>

      {/* A tournament at a neutral site prints "—", as drawn: the venue column
          is about where OUR team travelled, and a neutral site says nothing
          about that. A tournament we host, or travel to, still says so. */}
      <span className="text-[12px]" style={{ color: "var(--ink-600)" }}>
        {!isDual && row.site === "neutral" ? (
          <EmptyMark label="Neutral site" />
        ) : (
          siteTitle(row.site)
        )}
      </span>

      {/* Lines with a result over lines on the card. "Not set" is a dual whose
          lineup has no lines yet; a tournament with no entries has nothing to
          count and prints the dash. */}
      <span className="tabular text-[12px]" style={{ color: "var(--ink-600)" }}>
        {row.entryCount === 0 ? (
          isDual ? (
            "Not set"
          ) : (
            <EmptyMark label="No entries yet" />
          )
        ) : (
          `${row.playedCount} / ${row.entryCount}`
        )}
      </span>

      {outcome.score ? (
        <span
          className="tabular text-[13px]"
          style={{ color: "var(--ink-900)" }}
        >
          {outcome.score}
        </span>
      ) : (
        <EmptyMark label="No score yet" />
      )}

      <ResultCell result={outcome.result} />
    </button>
  );
}

type RowResult =
  "won" | "lost" | "level" | "in-progress" | "not-played" | "none";

/**
 * The two right-hand cells, decided once so they cannot disagree: a score
 * only ever sits beside the outcome it produced.
 */
function rowOutcome(
  row: ScheduleRow,
  detail: EventDetail | null,
): { score: string | null; result: RowResult } {
  if (row.kind !== "dual") {
    return { score: null, result: row.playedCount > 0 ? "none" : "not-played" };
  }

  // Decided — every line in. `teamScore` is the loader's own gate.
  if (row.teamScore) {
    const { us, them } = row.teamScore;
    return {
      score: `${us}–${them}`,
      result: us > them ? "won" : us < them ? "lost" : "level",
    };
  }

  if (row.playedCount > 0 && detail) {
    const live = dualScore(detail.entries);
    return { score: `${live.us}–${live.them}`, result: "in-progress" };
  }

  return { score: null, result: "not-played" };
}

/**
 * The outcome register: `ResultMark`'s glyph, no container. A tinted "banner"
 * result cell was built and rejected — the mark already carries the meaning,
 * and a tint would make the outcome louder than the score beside it. Undecided
 * rows draw `EmptyMark` on the same x, which is why neither takes an alignment
 * of its own.
 */
function ResultCell({ result }: { result: RowResult }) {
  // Decided — won, lost, or level on lines. One glyph register, flush right to
  // match this column's header and the `EmptyMark` an undecided row draws.
  if (result === "won" || result === "lost" || result === "level") {
    return (
      <ResultMark
        won={result === "level" ? null : result === "won"}
        className="justify-self-start"
      />
    );
  }
  if (result === "none") {
    return <EmptyMark label="No result" />;
  }
  return (
    <span
      className="text-micro whitespace-nowrap"
      style={{ color: "var(--ink-400)" }}
    >
      {result === "in-progress" ? "In progress" : "Not played"}
    </span>
  );
}
