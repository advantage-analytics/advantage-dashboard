import { PendingBar } from "@/components/dashboard/loading/pending";
import { SCHEDULE_ENABLED } from "@/lib/schedule/availability";
import {
  LIST_ROW_FRAME,
  listGridCols,
} from "@/components/dashboard/matches/match-list-layout";

/**
 * The profile's shape while its reads land — the identity row with its fact
 * pills, the five-tile strip, the last match beside serve placement, then
 * the full-width match history — each at the height it will settle at, so
 * the page does not jump when the data arrives.
 */
export default function Loading() {
  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]" aria-busy="true">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-5 px-6 pt-5 pb-8 sm:px-8 xl:px-14">
        {/* Identity */}
        <div className="flex items-center gap-5">
          <PendingBar className="size-[72px] rounded-full" />
          <div className="flex flex-1 flex-col gap-2.5">
            <PendingBar className="h-8 w-[260px] max-w-full rounded-md" />
            <div className="flex gap-1.5">
              <PendingBar className="h-6 w-20 rounded-full" />
              <PendingBar className="h-6 w-20 rounded-full" />
              <PendingBar className="h-6 w-24 rounded-full" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <PendingBar className="size-8 rounded-[6px]" />
            <PendingBar className="size-8 rounded-[6px]" />
            <PendingBar className="ml-2 h-9 w-[110px] rounded-[6px]" />
          </div>
        </div>

        {/* KPI strip */}
        <div className="surface-card flex overflow-hidden">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex min-w-0 flex-1 flex-col gap-3 px-5 py-5"
            >
              <PendingBar className="h-2.5 w-20 rounded" />
              <PendingBar className="h-7 w-16 rounded-md" />
              <PendingBar className="h-2.5 w-24 rounded" />
            </div>
          ))}
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[1.9fr_1fr]">
          <div
            className="surface-card flex flex-col gap-3.5"
            style={{ padding: "18px 20px" }}
          >
            <PendingBar className="h-2.5 w-20 rounded" />
            <div className="flex items-center gap-3">
              <PendingBar className="size-8 rounded-[6px]" />
              <div className="flex flex-1 flex-col gap-1.5">
                <PendingBar className="h-3.5 w-32 rounded" />
                <PendingBar className="h-2.5 w-44 rounded" />
              </div>
              <PendingBar className="h-4 w-24 rounded" />
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div
              className="surface-card flex flex-col gap-3"
              style={{ padding: "18px 20px" }}
            >
              <PendingBar className="h-2.5 w-28 rounded" />
              <PendingBar className="h-4 w-48 rounded" />
              <PendingBar className="h-3.5 w-full rounded-[4px]" />
              <PendingBar className="h-3.5 w-full rounded-[4px]" />
            </div>
            {/* Line history — not drawn while the Schedule is a coming-soon
                page, matching the page (`lib/schedule/availability.ts`). */}
            {SCHEDULE_ENABLED && (
              <div
                className="surface-card flex flex-col gap-3"
                style={{ padding: 20 }}
              >
                <PendingBar className="h-2.5 w-20 rounded" />
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex h-8 items-center gap-3">
                    <PendingBar className="h-2.5 w-6 rounded" />
                    <PendingBar className="h-3 w-8 rounded" />
                    <PendingBar className="h-2.5 flex-1 rounded" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Match history — the Matches list's own columns, full width. */}
        <div
          className="surface-card flex flex-col"
          style={{ padding: "20px 24px 8px" }}
        >
          <PendingBar className="h-2.5 w-24 rounded" />
          <div className="mt-4 flex h-6 items-center gap-4 border-b border-[var(--border-hairline)]">
            <PendingBar className="h-2 w-10 rounded" />
          </div>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`${LIST_ROW_FRAME} h-[52px]`}
              style={listGridCols("personal")}
            >
              <PendingBar className="h-3 w-12 rounded" />
              <PendingBar className="h-3 w-36 rounded" />
              <PendingBar className="size-3.5 rounded-full" />
              <PendingBar className="h-3 w-20 rounded" />
              <PendingBar className="h-3 w-28 rounded" />
              <PendingBar className="h-3 w-20 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
