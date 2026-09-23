import type { ReactNode } from "react";

import { PendingBar, PendingFrame } from "./pending";

/** Quiet placeholders only: no fabricated values, charts, or focusable controls. */

function Title() {
  return (
    <div className="flex items-end justify-between gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <PendingBar className="h-9 w-52" />
        <PendingBar className="w-64" />
      </div>
      <PendingBar className="h-8 w-24 shrink-0" />
    </div>
  );
}

function Kpis({ count = 5 }: { count?: number }) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-5 py-4">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex min-w-0 flex-col gap-3 border-t border-[var(--border-hairline)] pt-3"
        >
          <PendingBar className="h-2 w-20" />
          <PendingBar className="h-8 w-16" />
          <PendingBar className="h-2 w-24" />
        </div>
      ))}
    </div>
  );
}

function Rows({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="grid h-[52px] grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-5"
        >
          <PendingBar className={i % 2 ? "w-32" : "w-40"} />
          <PendingBar className="w-20" />
          <PendingBar className="w-14" />
        </div>
      ))}
    </div>
  );
}

function Section({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-4 border-t border-[var(--border-hairline)] pt-4">
      <PendingBar className="h-2 w-28" />
      {children}
    </div>
  );
}

export { HomePageSkeleton } from "./home-skeleton";

export { MatchesPagePending as MatchesPageSkeleton } from "./matches-page-pending";

export function EventPageSkeleton() {
  return (
    <PendingFrame label="event">
      <div className="flex flex-col gap-6 px-12 pt-[26px] pb-8">
        <Title />
        <div className="flex gap-5">
          <PendingBar className="w-28" />
          <PendingBar className="w-20" />
          <PendingBar className="w-20" />
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Section>
            <Rows count={9} />
          </Section>
          <div className="flex flex-col gap-6">
            <Section>
              <Kpis count={2} />
            </Section>
            <Section>
              <Rows count={3} />
            </Section>
          </div>
        </div>
      </div>
    </PendingFrame>
  );
}

/**
 * The team schedule's `[eventId]` page (a dual or a tournament) on
 * `schedule/event-table.tsx`'s kit: the header's two lines, the summary strip,
 * the toolbar, then one white card of 48px rows. Spacing is
 * `EventPageLayout`'s, so the page does not jump when it lands.
 */
export function EventTableSkeleton() {
  return (
    <PendingFrame label="event">
      <div className="flex flex-col gap-8 px-14 pt-6 pb-7">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-6">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <PendingBar className="h-8 w-60" />
              <PendingBar className="w-72" />
            </div>
            <PendingBar className="h-8 w-24 shrink-0" />
          </div>
          <div className="flex">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex flex-col gap-2 border-[var(--border-hairline)] pr-7 not-first:border-l not-first:pl-7"
              >
                <PendingBar className="h-2 w-14" />
                <PendingBar className="h-5 w-20" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-2">
              <PendingBar className="h-7 w-14 rounded-full" />
              <PendingBar className="h-7 w-20 rounded-full" />
              <PendingBar className="h-7 w-20 rounded-full" />
            </div>
            <PendingBar className="h-7 w-24" />
          </div>
          <div className="surface-card min-w-0 px-6 py-2">
            {Array.from({ length: 9 }, (_, i) => (
              <div
                key={i}
                className="grid h-12 grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-5 border-[var(--border-hairline)] not-last:border-b"
              >
                <PendingBar className={i % 2 ? "w-32" : "w-40"} />
                <PendingBar className={i % 3 ? "w-28" : "w-36"} />
                <PendingBar className="w-16" />
                <PendingBar className="w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PendingFrame>
  );
}

export function SimplePageLoader() {
  return (
    <div
      role="status"
      className="flex flex-1 items-center justify-center gap-2 py-20 text-[13px] text-[var(--ink-600)]"
    >
      <span
        aria-hidden="true"
        className="size-4 rounded-full border-2 border-[var(--border-hairline)] border-t-[var(--ink-400)] motion-safe:animate-spin"
      />
      <span className="sr-only">Loading page</span>
    </div>
  );
}

export {
  RosterPageSkeleton,
  SchedulePageSkeleton,
  TeamHomePageSkeleton,
} from "./team-page-pending";
