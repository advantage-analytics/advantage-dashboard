"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Filter as FilterIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  MatchesFilterPanel,
  type FilterPanelSection,
} from "@/components/dashboard/matches/matches-filter-panel";
import {
  DRAWER_ATTR,
  EventDrawer,
} from "@/components/dashboard/schedule/static/event-drawer";
import { ScheduleDayZero } from "./schedule-day-zero";
import { Chip } from "./chip";
import {
  ScheduleTable,
  scheduleRowId,
} from "@/components/dashboard/schedule/static/schedule-table";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
/**
 * `import type`, and only ever `import type`.
 *
 * `schedule-server.ts` builds a cookie-scoped Supabase client; a value import
 * from it would follow this `"use client"` file into a route bundle. The type
 * is erased at build. `SeasonSummary` lives beside the function that derives
 * it because the two are one contract — the doc comment there is the spec for
 * what each figure counts and, more importantly, what it deliberately does
 * not. `OpponentProgram` is the same story one paragraph down.
 */
import type { OpponentProgram, SeasonSummary } from "@/lib/data/schedule-server";
import type {
  EventDetail,
  EventKind,
  EventSite,
  ScheduleRow,
} from "@/lib/schedule/types";

/**
 * One program's schedule, as this component reads it.
 *
 * `ScheduleRow[]` and `EventDetail` are `scheduleRowsFrom()`'s and
 * `eventDetailFrom()`'s own return types, composed and redeclared nowhere.
 */
export interface ScheduleData {
  rows: ScheduleRow[];
  details: Record<string, EventDetail>;
}

type Lifecycle = "all" | "upcoming" | "completed";
type SortOrder = "newest" | "oldest";
type FacetKey = "kind" | "site";
interface Facets {
  kind: EventKind | null;
  site: EventSite | null;
}

/**
 * `Tc2` / `Tc2c` — the schedule, in the page shape Matches and Roster share.
 *
 * Title with a one-line summary, ghost Import beside primary New event, the
 * All · Upcoming · Completed pills with Filters and sort, one white event
 * table at full width in the date-first grammar, and a season footer with
 * "Set next lineup". `Tc2c` is the page a coach lands on: no event selected,
 * no drawer. `Tc2` is the same page after a row is clicked — the event's
 * detail arrives as a dismissable 340px rail beside the full-width list, not
 * as a permanent half-screen split.
 *
 * ── Selection ─────────────────────────────────────────────────────────────
 * A row click moves one piece of local state and nothing else: no route
 * change, no fetch. The route hands down every event's detail with the rows,
 * so the rail, and stepping through the season with ‹ › or ↑ ↓, is a
 * `useState` and no round trip. The rail counts its position within the list
 * ON SCREEN — "2 / 8" is two of the eight the chips and filters left — and a
 * cut that drops the selected event closes the rail rather than leaving it
 * describing a row that is no longer there.
 *
 * The selection machinery is the roster's, so the two rails behave as one:
 * clicking the selected row again closes the rail; `selectedId` is the row's
 * wash and `drawerId` is what the rail shows, which differ only while the
 * slide-out plays; `?event=` mirrors the selection so a link can open the
 * rail. Esc and the arrows are a window listener that stands down for fields,
 * open menus and modal dialogs — the rail's own `role="dialog"` is told from
 * those by `DRAWER_ATTR`.
 *
 * ── Upcoming and Completed ────────────────────────────────────────────────
 * By the calendar, not by played lines: an event whose last day is still
 * ahead of the program's `today` is upcoming, everything else is completed.
 * The drawer this page used to carry grouped by `playedCount` instead, which
 * filed a January dual nobody scored under Upcoming all year. Every event is
 * in exactly one of the two. The pills carry no counts (Data Table law 7) —
 * the summary line under the title is where the season's numbers live.
 *
 * ── Day zero ──────────────────────────────────────────────────────────────
 * Not drawn on either artboard, so it follows the table-page law the design
 * system locks: the title, primary action and season footer render exactly as
 * on the populated page — the frame never moves — the chips and the table are
 * absent, and the middle carries one light line, one sentence and the quiet
 * paths into the two builders.
 *
 * ── Chrome ────────────────────────────────────────────────────────────────
 * The sidebar and the 44px header the artboards draw are the app's own and
 * already on screen; the header's "Schedule" is `nav.ts`'s crumb.
 */
export function StaticSchedule({
  schedule,
  season,
  today,
  canCreate,
  canAddOwnMatch,
  programName,
  opponents,
  initialSelectedId,
}: {
  schedule: ScheduleData;
  /**
   * `seasonSummaryFrom()` upstream — the three figures the footer draws.
   * Structured, never pre-formatted: the en dash, the `·` and the
   * `tabularNumerals()` treatment are this component's business.
   */
  season: SeasonSummary;
  /**
   * Today in the PROGRAM's zone, `YYYY-MM-DD`. A prop rather than a clock
   * read, because this component also renders on the server and `new Date()`
   * here would give the two renders different answers.
   */
  today: string;
  /** `isProgramStaff` upstream — gates New event, Import, and every write the drawer points at. */
  canCreate: boolean;
  /** `canUploadForProgram` upstream — gates day zero's "One-off match in Matches". */
  canAddOwnMatch: boolean;
  /** The workspace's name, which the summary line opens with. */
  programName: string;
  /** `getOpponentPrograms()` upstream — the conference under an opponent's name. */
  opponents: Record<string, OpponentProgram>;
  /** `?event=` from the URL, or null. Ignored unless it names a row. */
  initialSelectedId: string | null;
}) {
  const { rows, details } = schedule;

  const initial =
    initialSelectedId && rows.some((row) => row.id === initialSelectedId)
      ? initialSelectedId
      : null;
  const [selectedId, setSelectedId] = useState<string | null>(initial);
  const [drawerId, setDrawerId] = useState<string | null>(initial);
  const [closing, setClosing] = useState(false);
  const [openedByKeyboard, setOpenedByKeyboard] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lifecycle, setLifecycle] = useState<Lifecycle>("all");
  const [facets, setFacets] = useState<Facets>({ kind: null, site: null });
  const [sort, setSort] = useState<SortOrder>("newest");

  const upcomingCount = rows.filter((row) => isUpcoming(row, today)).length;

  // The facet cut first, the lifecycle pill second: a pill is a view of what
  // the panel left, never the other way round.
  const faceted = useMemo(() => cutByFacets(rows, facets), [rows, facets]);
  const visible = useMemo(
    () => order(cutByLifecycle(faceted, lifecycle, today), sort),
    [faceted, lifecycle, sort, today]
  );

  const drawer = drawerId ? (details[drawerId] ?? null) : null;
  const drawerIndex = drawerId
    ? visible.findIndex((row) => row.id === drawerId)
    : -1;

  const finishClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setDrawerId(null);
    setClosing(false);
  }, []);

  const select = useCallback((eventId: string, viaKeyboard: boolean) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setClosing(false);
    setSelectedId(eventId);
    setDrawerId(eventId);
    setOpenedByKeyboard(viaKeyboard);
    syncUrl(eventId);
  }, []);

  const close = useCallback(
    (returnFocusTo: string | null) => {
      setSelectedId(null);
      setClosing(true);
      syncUrl(null);
      // `onAnimationEnd` normally finishes this; the timer covers reduced
      // motion, where no animation runs, and is harmless when both fire.
      closeTimer.current = setTimeout(finishClose, 240);
      if (returnFocusTo) {
        document.getElementById(scheduleRowId(returnFocusTo))?.focus();
      }
    },
    [finishClose]
  );

  /** A row click: open the rail on it, or close the rail if it is already there. */
  const toggle = useCallback(
    (eventId: string, viaKeyboard: boolean) => {
      if (selectedId === eventId) close(viaKeyboard ? eventId : null);
      else select(eventId, viaKeyboard);
    },
    [selectedId, select, close]
  );

  const step = useCallback(
    (delta: -1 | 1) => {
      if (!selectedId) return;
      const index = visible.findIndex((row) => row.id === selectedId);
      const next = visible[index + delta];
      if (!next) return;
      select(next.id, true);
      document
        .getElementById(scheduleRowId(next.id))
        ?.scrollIntoView({ block: "nearest" });
    },
    [visible, selectedId, select]
  );

  /**
   * Every cut goes through here so a selection the cut drops is cleared in
   * the same handler, not in an effect that runs a render late.
   */
  function applyCut(next: {
    lifecycle?: Lifecycle;
    facets?: Facets;
    sort?: SortOrder;
  }) {
    const nextLifecycle = next.lifecycle ?? lifecycle;
    const nextFacets = next.facets ?? facets;
    const nextSort = next.sort ?? sort;
    const nextVisible = order(
      cutByLifecycle(cutByFacets(rows, nextFacets), nextLifecycle, today),
      nextSort
    );
    if (selectedId !== null && !nextVisible.some((row) => row.id === selectedId)) {
      close(null);
    }
    if (next.lifecycle !== undefined) setLifecycle(next.lifecycle);
    if (next.facets !== undefined) setFacets(next.facets);
    if (next.sort !== undefined) setSort(next.sort);
  }

  // The row the rail showed is gone — a cut, or data that changed underneath.
  // Adjusted during render rather than in an effect, so nothing paints a rail
  // for a row that no longer exists.
  if (drawerId && !drawer) {
    setSelectedId(null);
    setDrawerId(null);
    setClosing(false);
  }

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
        return;
      // `instanceof`, not a cast: a keydown dispatched on `window` or
      // `document` has no `closest`, and the guard must stand down rather
      // than throw.
      const target = event.target instanceof Element ? event.target : null;
      if (target) {
        if (target.closest("input, textarea, select, [contenteditable=true]"))
          return;
        if (target.closest(`[role="dialog"]:not([${DRAWER_ATTR}] [role="dialog"])`))
          return;
        if (target.closest("[data-radix-popper-content-wrapper]")) return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        close(selectedId);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        step(-1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, close, step]);

  const hasFacets = facets.kind !== null || facets.site !== null;

  // "Set next lineup" — the soonest dual still ahead whose lineup has a gap:
  // no lines at all, or a line nobody is named on. Rows arrive newest first,
  // so the soonest upcoming one is the FIRST match walking the reverse.
  const nextDual = [...rows]
    .reverse()
    .find((row) => row.kind === "dual" && isUpcoming(row, today));
  const nextLineupHref =
    canCreate &&
    nextDual &&
    (nextDual.entryCount === 0 ||
      (details[nextDual.id]?.entries ?? []).some(
        (entry) => entry.forfeit === null && entry.playerLabels.length === 0
      ))
      ? `/dashboard/team/schedule/${nextDual.id}`
      : null;

  return (
    <div className="flex w-full flex-1 bg-[var(--surface-card)]">
      <div className="flex min-w-0 flex-1 flex-col gap-[18px] px-14 pb-6 pt-5">
        {/* Day zero is the whole frame, not a panel inside it: the offer
            carries the page's one primary, so the title row and the season
            footer stand down until the season has an event. See
            `ScheduleDayZero` for why the rule changed, and where the program's
            name lives while this is on screen. */}
        {rows.length === 0 ? (
          <ScheduleDayZero canCreate={canCreate} canAddOwnMatch={canAddOwnMatch} />
        ) : (
        <>
        {/* Title slot with summary, ghost Import beside primary New event. */}
        <div className="flex items-end gap-2.5">
          <div>
            <h1 className="text-display">Schedule</h1>
            <p className="text-body-sm mt-[9px]">
              {programName} · {seasonLabel(rows, today)} ·{" "}
              <span className="tabular">
                {rows.length} {rows.length === 1 ? "event" : "events"}
              </span>{" "}
              · <span className="tabular">{upcomingCount}</span> upcoming
            </p>
          </div>
          <div className="flex-1" />
          {canCreate ? (
            <>
              {/* Drawn beside New event on both artboards. Nothing behind it
                  yet — no schedule import exists — so it stands as the design
                  draws it and says so on hover, rather than as a disabled
                  control the artboard does not show. */}
              <button
                type="button"
                className={advButton("ghost", "md")}
                title="Schedule import is not available yet"
              >
                Import
              </button>
              <Link
                href="/dashboard/team/schedule/new"
                className={advButton("primary", "md")}
              >
                New event
              </Link>
            </>
          ) : null}
        </div>

            <div className="flex items-center gap-2">
              <Chip
                label="All"
                active={lifecycle === "all"}
                onClick={() => applyCut({ lifecycle: "all" })}
              />
              <Chip
                label="Upcoming"
                active={lifecycle === "upcoming"}
                onClick={() => applyCut({ lifecycle: "upcoming" })}
              />
              <Chip
                label="Completed"
                active={lifecycle === "completed"}
                onClick={() => applyCut({ lifecycle: "completed" })}
              />
              <div className="flex-1" />
              <MatchesFilterPanel<FacetKey>
                sections={FILTER_SECTIONS}
                hasActive={hasFacets}
                isChecklistActive={() => false}
                onToggleChecklist={() => {}}
                segmentedValue={(key) => facets[key]}
                onSelectSegment={(key, value) =>
                  applyCut({
                    facets:
                      key === "kind"
                        ? { ...facets, kind: value as EventKind | null }
                        : { ...facets, site: value as EventSite | null },
                  })
                }
                onClear={() => applyCut({ facets: { kind: null, site: null } })}
                resultCount={visible.length}
                totalCount={rows.length}
                label="Filter events"
                noun={{ singular: "event", plural: "events" }}
              />
              <SortMenu value={sort} onChange={(next) => applyCut({ sort: next })} />
            </div>

            {/* The panel closes on apply; this states the cut in words. Never
                chips, never a badge — v3's Data Table law 6. */}
            {hasFacets ? (
              <div
                className="flex flex-wrap items-center gap-2 rounded-[var(--radius-element)] px-3.5 py-2.5"
                style={{ background: "var(--surface-subtle)" }}
              >
                <FilterIcon
                  className="size-[13px] shrink-0"
                  strokeWidth={1.5}
                  style={{ color: "var(--ink-500)" }}
                  aria-hidden="true"
                />
                <span className="text-[11px]" style={{ color: "var(--ink-700)" }}>
                  {describeCut(facets)}
                </span>
                <span
                  className="size-[3px] rounded-full"
                  style={{ background: "var(--ink-300)" }}
                  aria-hidden="true"
                />
                <span className="text-micro tabular">
                  {visible.length} of {rows.length}
                </span>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => applyCut({ facets: { kind: null, site: null } })}
                  className="whitespace-nowrap text-[11px] font-medium"
                  style={{ color: "var(--blue)" }}
                >
                  Clear filter
                </button>
              </div>
            ) : null}

            {visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <p className="mb-1 text-[14px] font-medium" style={{ color: "var(--ink-900)" }}>
                  No events match
                </p>
                <button
                  type="button"
                  onClick={() =>
                    applyCut({ lifecycle: "all", facets: { kind: null, site: null } })
                  }
                  className="mt-1 text-[11px] font-medium"
                  style={{ color: "var(--blue)" }}
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              <ScheduleTable
                rows={visible}
                details={details}
                selectedId={selectedId}
                onSelect={toggle}
              />
            )}

            {/* The season footer. It used to be drawn at day zero too, on the
                old rule that the frame never moves — but that rule went with
                the title row, and "Season 0–0 in duals · 0 of 0 lines
                analyzed" under a page that has never held an event is a
                readout of nothing. Once there is one event it is back, and
                from then on it never moves again. */}
            <div className="flex items-center gap-2.5">
              <span className="text-micro" style={{ color: "var(--ink-500)" }}>
                Season {tabularNumerals(seasonFacts(season))}
              </span>
              <div className="flex-1" />
              {nextLineupHref ? (
                <Link
                  href={nextLineupHref}
                  className="text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
                >
                  Set next lineup
                </Link>
              ) : null}
            </div>
          </>
        )}
      </div>

      {drawer ? (
        <EventDrawer
          detail={drawer}
          opponent={opponentOf(drawer, opponents)}
          index={drawerIndex}
          total={visible.length}
          closing={closing}
          autoFocus={openedByKeyboard}
          onStep={step}
          onClose={() => close(drawerId)}
          onClosed={finishClose}
          canEdit={canCreate}
        />
      ) : null}
    </div>
  );
}

/* ── The cut ─────────────────────────────────────────────────────────────── */

/** By the calendar: an event whose last day is still ahead. */
function isUpcoming(row: ScheduleRow, today: string): boolean {
  return row.endsOn >= today;
}

function cutByFacets(rows: ScheduleRow[], facets: Facets): ScheduleRow[] {
  return rows.filter(
    (row) =>
      (facets.kind === null || row.kind === facets.kind) &&
      (facets.site === null || row.site === facets.site)
  );
}

function cutByLifecycle(
  rows: ScheduleRow[],
  lifecycle: Lifecycle,
  today: string
): ScheduleRow[] {
  if (lifecycle === "all") return rows;
  return rows.filter((row) =>
    lifecycle === "upcoming" ? isUpcoming(row, today) : !isUpcoming(row, today)
  );
}

/**
 * Rows arrive newest first — the schedule's own reading order. Oldest first is
 * that list reversed, which is the reversal `ProgramSchedule`'s doc comment
 * asks a forwards-in-time surface to do rather than ordering the table a
 * second way.
 */
function order(rows: ScheduleRow[], sort: SortOrder): ScheduleRow[] {
  return sort === "newest" ? rows : [...rows].reverse();
}

const FILTER_SECTIONS: FilterPanelSection<FacetKey>[] = [
  {
    label: "Type",
    segmented: [
      {
        key: "kind",
        options: [
          { value: null, label: "Any" },
          { value: "dual", label: "Dual" },
          { value: "tournament", label: "Tournament" },
        ],
      },
    ],
  },
  {
    label: "Venue",
    segmented: [
      {
        key: "site",
        options: [
          { value: null, label: "Any" },
          { value: "home", label: "Home" },
          { value: "away", label: "Away" },
          { value: "neutral", label: "Neutral" },
        ],
      },
    ],
  },
];

/** "Duals at home" — the applied cut, as one plain sentence. */
function describeCut(facets: Facets): string {
  const what =
    facets.kind === "dual"
      ? "Duals"
      : facets.kind === "tournament"
        ? "Tournaments"
        : "Events";
  const where =
    facets.site === "home"
      ? "at home"
      : facets.site === "away"
        ? "away"
        : facets.site === "neutral"
          ? "at neutral sites"
          : null;
  return where ? `${what} ${where}` : what;
}

/**
 * "2025 season", or "2025–26 season" when the events on file span two
 * calendar years. Derived from the dates rather than drawn: the artboard's
 * "2025 season" is its sample's, and this app holds no season record to
 * print instead. With nothing on file yet it names the current year.
 */
function seasonLabel(rows: ScheduleRow[], today: string): string {
  const years = rows.map((row) => Number(row.startsOn.slice(0, 4)));
  if (years.length === 0) return `${today.slice(0, 4)} season`;
  const first = Math.min(...years);
  const last = Math.max(...years);
  return first === last
    ? `${first} season`
    : `${first}–${String(last).slice(2)} season`;
}

/** Which program stands across the net — read off the first line that names one. */
function opponentOf(
  detail: EventDetail,
  opponents: Record<string, OpponentProgram>
): OpponentProgram | null {
  if (detail.event.kind !== "dual") return null;
  const id = detail.entries.find((entry) => entry.opponentProgramId)?.opponentProgramId;
  return id ? (opponents[id] ?? null) : null;
}

/* ── Chrome ──────────────────────────────────────────────────────────────── */

/**
 * One lifecycle pill, with its count inside — the one place a count lives
 * outside a tooltip, because it is page content rather than chrome.
 */
/** "Newest first" ▾ — the two orders a season can be read in. */
function SortMenu({
  value,
  onChange,
}: {
  value: SortOrder;
  onChange: (next: SortOrder) => void;
}) {
  const [open, setOpen] = useState(false);
  const options: { value: SortOrder; label: string }[] = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
  ];
  const current = options.find((option) => option.value === value) ?? options[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`Sort: ${current.label}`}
          className={cn(
            "flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--radius-element)] px-2 text-[12px] transition-colors duration-150",
            open ? "" : "hover:bg-[var(--surface-subtle)]"
          )}
          style={{
            background: open ? "var(--surface-subtle)" : undefined,
            color: open ? "var(--ink-900)" : "var(--ink-600)",
            fontWeight: open ? 500 : 400,
          }}
        >
          {current.label}
          <ChevronDown
            className="size-3"
            strokeWidth={1.5}
            style={{ color: open ? "var(--ink-500)" : "var(--ink-400)" }}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[172px] rounded-xl border-[var(--border-medium)] p-1.5 shadow-[var(--shadow-dropdown)]"
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-element)] px-2 text-left text-[12px] transition-colors duration-100 hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none"
              style={{ color: "var(--ink-900)", fontWeight: active ? 500 : 400 }}
            >
              <span className="flex-1">{option.label}</span>
              {active ? (
                <Check className="size-3" strokeWidth={2} style={{ color: "var(--ink-700)" }} aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

/* ── The footer's sentence ───────────────────────────────────────────────── */

/**
 * "3–1 in duals · 31 of 36 lines analyzed" — the footer's sentence.
 *
 * One string rather than four interpolations in the JSX, so `tabularNumerals()`
 * below can find the digit runs and wrap each one exactly as the artboard
 * draws them. The punctuation is the design's and is checked at byte level by
 * `tests/schedule-static-copy.spec.ts`: `–` is U+2013 and `·` is U+00B7.
 *
 * Every figure comes from `seasonSummaryFrom()`. Nothing here decides what
 * counts as a dual, a decided dual or an analyzed line — that is the loader's
 * header, deliberately, so the record and the coverage are one fact counted
 * once.
 */
function seasonFacts({ dualRecord, lines }: SeasonSummary): string {
  return (
    `${dualRecord.won}–${dualRecord.lost} in duals · ` +
    `${lines.analyzed} of ${lines.total} lines analyzed`
  );
}

/**
 * Wrap each run of digits in a `.tabular` span, as the artboard does — 3, 1,
 * 31, 36 each inside `<span class="tabular">`, the en dash between the first
 * two left outside. Splitting on digit runs reproduces that markup whatever
 * the figures turn out to be.
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

/**
 * Mirror the selection into `?event=` without a navigation.
 *
 * `history.replaceState` rather than `router.replace`: the App Router treats
 * the latter as a navigation and re-renders from the server, which for a click
 * on a row is a round trip to change one query string. The native call is one
 * the router listens to, so `useSearchParams` elsewhere still sees it.
 */
function syncUrl(eventId: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (eventId) url.searchParams.set("event", eventId);
  else url.searchParams.delete("event");
  window.history.replaceState(window.history.state, "", url);
}
