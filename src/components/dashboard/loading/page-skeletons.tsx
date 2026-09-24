import { PendingBar, PendingFrame, PendingRegion } from "./pending";

/** Quiet placeholders only: no fabricated values, charts, or focusable controls. */

export { HomePageSkeleton } from "./home-skeleton";

export { MatchesPagePending as MatchesPageSkeleton } from "./matches-page-pending";

/**
 * `/dashboard/team/schedule/single/[matchId]` while the match is read —
 * `schedule/single-detail.tsx`'s `SingleDetail` inside `EventShell`'s padded
 * column (`px-12 pt-[26px] pb-8`), so nothing moves when it lands.
 *
 * Top to bottom: the eyebrow; the 30px matchup title with the 40px score at
 * the right (the row is `items-end gap-12`); the facts row; the hairline-topped
 * status row at `mt-[26px] pt-3.5`; then the `max-w-[560px]` section of
 * hairline rows. "From the report" (`max-w-[640px]`) renders only when the
 * match has a summary, so it is left out rather than promised. One column —
 * this page has no rail and no list.
 */
export function SingleMatchPending() {
  return (
    <PendingFrame label="match">
      <div className="flex flex-col px-12 pt-[26px] pb-8">
        <div className="flex items-end gap-12">
          <div className="min-w-0 flex-1">
            <span className="flex h-[15px] items-center">
              <PendingBar className="h-2 w-44" />
            </span>
            <span className="mt-2 flex h-[34px] items-center">
              <PendingBar className="h-[30px] w-80" />
            </span>
            <span className="mt-3 flex h-5 items-center gap-2.5">
              <PendingBar className="w-24" />
              <PendingBar className="w-16" />
            </span>
          </div>
          <PendingBar className="h-10 w-32 shrink-0" />
        </div>

        <div className="mt-[26px] flex items-center gap-2 border-t border-[var(--border-hairline)] pt-3.5">
          <PendingBar className="h-[11px] w-20" />
        </div>

        <div className="mt-7 max-w-[560px]">
          {["w-10", "w-12"].map((width) => (
            <div
              key={width}
              className="flex items-center gap-3 border-t border-[var(--border-hairline)] py-3.5"
            >
              <span className="flex h-5 flex-1 items-center">
                <PendingBar className={width} />
              </span>
              <PendingBar className="h-[11px] w-16" />
            </div>
          ))}
          <div className="border-t border-[var(--border-hairline)]" />
        </div>
      </div>
    </PendingFrame>
  );
}

/**
 * The dual's six tracks (`dual-detail.tsx`'s `GRID`). A `loading.tsx` cannot
 * tell a dual from a tournament, so it draws the dual — three strip cells too.
 */
const EVENT_TABLE_GRID =
  "grid-cols-[28px_minmax(170px,1fr)_minmax(140px,1fr)_52px_120px_minmax(96px,1fr)]";

/** One bar width per track: #, player, opponent, result, score, analysis. */
const EVENT_TABLE_HEADER = ["w-3", "w-12", "w-16", "w-10", "w-10", "w-14"];

/**
 * The team schedule's `[eventId]` page (a dual or a tournament) on
 * `schedule/event-table.tsx`'s kit, in `EventPageLayout`'s spacing: the
 * header's two lines, the summary strip, the toolbar, then `EventTable`'s one
 * white card — a header row over its hairline, one group head, and nine 48px
 * rows with no dividers of their own.
 */
export function EventTableSkeleton() {
  return (
    <PendingFrame label="event">
      <div className="flex flex-col gap-8 px-14 pt-6 pb-7">
        <div className="flex flex-col gap-6">
          <div className="flex min-w-0 flex-col gap-2">
            <span className="flex h-9 items-center">
              <PendingBar className="h-[30px] w-60" />
            </span>
            <span className="flex h-[15px] items-center">
              <PendingBar className="w-72" />
            </span>
          </div>
          <div className="flex items-stretch">
            {["w-16", "w-20", "w-14"].map((width) => (
              <div
                key={width}
                className="flex min-w-0 flex-col gap-2 border-[var(--border-hairline)] pr-7 not-first:border-l not-first:pl-7"
              >
                <PendingBar className="h-2 w-14" />
                <span className="flex h-5 items-center">
                  <PendingBar className={`h-4 ${width}`} />
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {["w-16", "w-14", "w-16", "w-24"].map((width, i) => (
                <PendingBar
                  key={i}
                  className={`h-[26px] rounded-full ${width}`}
                />
              ))}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <PendingBar className="h-7 w-16" />
              <PendingBar className="h-7 w-20" />
            </div>
          </div>
          <div className="surface-card min-w-0 px-6 pt-0.5 pb-2.5">
            <div
              className={`grid items-center gap-x-4 border-b border-[var(--border-hairline)] pt-3.5 pb-2.5 ${EVENT_TABLE_GRID}`}
            >
              {EVENT_TABLE_HEADER.map((width, i) => (
                <span key={i} className="flex h-3.5 min-w-0 items-center">
                  <PendingBar className={`h-2 ${width}`} />
                </span>
              ))}
            </div>
            <div className="flex items-center pt-3 pb-1">
              <span className="flex h-[15px] items-center">
                <PendingBar className="h-2 w-16" />
              </span>
            </div>
            {Array.from({ length: 9 }, (_, i) => (
              <div
                key={i}
                className={`grid h-12 items-center gap-x-4 ${EVENT_TABLE_GRID}`}
              >
                <PendingBar className="w-3" />
                <PendingBar className={i % 2 ? "w-28" : "w-36"} />
                <PendingBar className={i % 3 ? "w-24" : "w-32"} />
                <PendingBar className="w-8" />
                <PendingBar className="w-20" />
                <PendingBar className="w-14" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PendingFrame>
  );
}

/**
 * The dashboard root's `loading.tsx` — the boundary that catches every route
 * with no `loading.tsx` of its own (Ask, Help, Opponents, Statistics, Team
 * Ask, Team Statistics, the settings redirects). The one shape those pages
 * share is `ComingSoonPage`'s frame (`coming-soon.tsx`) and its `<h1
 * className="text-display">`, so that's all this draws — one bar at the
 * `text-display` line height, nothing invented below it.
 */
export function DashboardPagePending() {
  return (
    <PendingRegion
      label="page"
      className="flex w-full flex-1 flex-col bg-white"
    >
      <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col px-14 pt-5 pb-8">
        <PendingBar className="h-9 w-64" />
      </div>
    </PendingRegion>
  );
}

export {
  RosterPageSkeleton,
  SchedulePageSkeleton,
  TeamHomePageSkeleton,
} from "./team-page-pending";
