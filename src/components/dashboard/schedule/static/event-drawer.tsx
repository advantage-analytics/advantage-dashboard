"use client";

import Link from "next/link";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { formatEventDay, siteTitle } from "@/lib/schedule/format";
import type { ScheduleRow } from "@/lib/schedule/types";

/**
 * The schedule's 340px drawer — `7d` with events, `7e` without.
 *
 * Static: it renders whatever `ScheduleRow[]` it is handed and never reads the
 * database. `StaticSchedule` hands it `POPULATED_SCHEDULE.rows` (`7d`) or
 * `EMPTY_SCHEDULE.rows` (`7e`) from `src/lib/schedule/fixtures.ts`.
 *
 * ── What is NOT in here ────────────────────────────────────────────────────
 * The artboards draw a 232px sidebar and a 44px breadcrumb topbar above this
 * drawer. Both are the app's own chrome (`app-sidebar.tsx`, `header.tsx`'s
 * `h-11`) and are already on screen by the time this renders — reproducing
 * them from the artboard would draw the shell twice.
 *
 * That leaves one drawn element with nowhere to go: the topbar's right-hand
 * count, "6 events · 2 upcoming" on `7d` and "0 events · nothing scheduled for
 * 2026–27" on `7e`. The app's header has a one-line status slot
 * (`usePublishHeaderStatus`), but it is a plain string in a differently-styled
 * position and no artboard in this run's set draws the app's header carrying
 * it. Left unrendered rather than approximated; reported as a divergence.
 *
 * ── Grouping is by played lines, not by the clock ──────────────────────────
 * `7d` puts the 26 Sep dual under Upcoming and the three older ones under
 * Completed. The fixture calendar is September 2025 (that is the only year the
 * design's own weekday labels land on), so a `startsOn >= today` split would
 * file every drawn row under Completed and the artboard would be
 * unreproducible. `playedCount` is the durable signal — an event with no line
 * played has not happened — and it costs the component a clock read it would
 * otherwise have to guard for hydration.
 */
export function EventDrawer({
  rows,
  selectedId,
  onSelect,
  canCreate,
}: {
  rows: ScheduleRow[];
  selectedId: string | null;
  onSelect: (eventId: string) => void;
  /** `isProgramStaff` upstream. False hides the drawer-footed CTA entirely. */
  canCreate: boolean;
}) {
  const upcoming = rows.filter((row) => row.playedCount === 0);
  const completed = rows.filter((row) => row.playedCount > 0);

  // `7e` is the whole-drawer empty state, not merely "this section has no
  // rows": it is the branch that adds the hint line under the sections and
  // drops the CTA block's top padding. The two artboards also space the
  // "Completed" label differently (18px on `7e`, 14px on `7d`), which is an
  // artboard-level difference rather than a per-section one.
  const isDayZero = rows.length === 0;

  return (
    <div className="flex w-[340px] shrink-0 flex-col border-r border-[var(--border-hairline)]">
      <div className="min-h-0 flex-1 overflow-auto pb-2 pt-3">
        <SectionLabel className="pt-2.5">Upcoming</SectionLabel>
        <EventGroup
          label="Upcoming"
          rows={upcoming}
          selectedId={selectedId}
          onSelect={onSelect}
        />

        <SectionLabel className={isDayZero ? "pt-[18px]" : "pt-3.5"}>
          Completed
        </SectionLabel>
        <EventGroup
          label="Completed"
          rows={completed}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </div>

      {isDayZero ? (
        <div className="shrink-0 px-5 pb-3.5">
          <span
            className="text-micro text-pretty"
            style={{ color: "var(--ink-400)" }}
          >
            Duals and tournaments list here, newest first.
          </span>
        </div>
      ) : null}

      {canCreate ? (
        <div className={cn("shrink-0 px-4 pb-4", !isDayZero && "pt-3")}>
          {/* Drawn as a `<button>`, which is how a design file draws a CTA.
              It is a link here because the artboard's own caption says this
              button opens the choose-type screen — `3b`, which is
              `/dashboard/team/schedule/new`, inside this run's rebuilt set.
              `advButton("primary", "md")` is the same 36px blue button the
              artboard draws, glow included; its `px-4` is inert on a
              full-width, centred label. */}
          <Link
            href="/dashboard/team/schedule/new"
            className={cn(advButton("primary", "md"), "w-full")}
          >
            New event
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/** "Upcoming" / "Completed". Top padding differs per artboard, so it is a prop. */
function SectionLabel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("eyebrow-sm px-5 pb-1", className)}>{children}</div>;
}

/**
 * One section's rows, or `7e`'s "None yet" when it has none.
 *
 * `role="listbox"` per section rather than one over the whole drawer: the
 * eyebrow labels sit between the groups, and they are not valid children of a
 * listbox. Carries forward the a11y intent the DB-wired `schedule-list.tsx`
 * documented — a screen reader should announce which event is active rather
 * than read a column of identical rows.
 */
function EventGroup({
  label,
  rows,
  selectedId,
  onSelect,
}: {
  label: string;
  rows: ScheduleRow[];
  selectedId: string | null;
  onSelect: (eventId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="text-micro px-5 pt-1" style={{ color: "var(--ink-400)" }}>
        None yet
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label={`${label} events`}
      className="flex flex-col gap-0.5 px-3"
    >
      {rows.map((row) => (
        <EventRow
          key={row.id}
          row={row}
          isSelected={row.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

/**
 * One drawer row.
 *
 * `7d` draws two shapes — a column of two lines for the upcoming dual, and the
 * same two lines beside a team score for the completed ones. They are one
 * element here: a single stretched child in a centred flex row lays out
 * identically to a column, so the score is the only difference and it follows
 * the data (`teamScore`) rather than a second component.
 *
 * Every row the design draws is a dual, hence the bare "vs" prefix. A
 * tournament row has no drawn treatment; none is invented here.
 *
 * ── The selected row, reconciled against `7c` ──────────────────────────────
 * `7d` has nothing selected, so T3 stood the selected state up as the same
 * `--surface-muted` wash the artboard gives hover. `7c` and `4c` draw it
 * settled, and the wash was right — but it is not the whole treatment. Both
 * artboards also raise the selected row's name to `font-weight:500` and its
 * team score from `--ink-700` to `--ink-900`, so the row reads as current even
 * where the wash is subtle. All three now follow `isSelected`.
 */
function EventRow({
  row,
  isSelected,
  onSelect,
}: {
  row: ScheduleRow;
  isSelected: boolean;
  onSelect: (eventId: string) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      onClick={() => onSelect(row.id)}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] px-3 py-2.5 text-left",
        "transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-muted)]",
        isSelected && "bg-[var(--surface-muted)]"
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="mono text-[11px] text-[var(--ink-600)]">
          {formatEventDay(row.startsOn)} · {siteTitle(row.site)}
        </span>
        <span
          className={cn(
            "text-[13px] text-[var(--ink-900)]",
            isSelected && "font-medium"
          )}
        >
          vs {row.name}
        </span>
      </span>
      {row.teamScore ? (
        <span
          className={cn(
            "tabular text-[14px]",
            isSelected ? "text-[var(--ink-900)]" : "text-[var(--ink-700)]"
          )}
        >
          {row.teamScore.us}–{row.teamScore.them}
        </span>
      ) : null}
    </button>
  );
}
