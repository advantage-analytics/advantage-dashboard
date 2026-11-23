import type { ReactNode } from "react";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import {
  LIST_ROW_FRAME,
  listColumnLabels,
  listGridCols,
} from "@/components/dashboard/matches/match-list-layout";
import { cn } from "@/lib/utils";
import { SectionHead } from "./home-title";

/**
 * The page's own column, shared by both Homes and their loading fallbacks —
 * the same gutters, top inset and section rhythm as Matches and Roster, and
 * like them it runs the full width of the content area.
 */
export function HomeFeedFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full flex-1 bg-[var(--surface-card)]">
      <div className="flex min-w-0 flex-1 flex-col gap-5 px-8 pt-5 pb-8 xl:px-14">
        {children}
      </div>
    </div>
  );
}

export function TitlePending({ action }: { action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <PendingRegion label="summary" innerClassName="flex flex-col gap-2.5">
        <PendingBar className="h-6 w-56" />
        <PendingBar className="w-72" />
      </PendingRegion>
      {action}
    </div>
  );
}

/** The banner's footprint, so nothing below it moves when it arrives. */
export function BannerPending() {
  return (
    <PendingRegion
      label="pilot"
      className="h-[108px] rounded-[var(--radius-card)] bg-[var(--surface-skeleton)] motion-safe:animate-pulse"
    >
      {null}
    </PendingRegion>
  );
}

/** The lead slot: the highlight card's footprint under its heading. */
export function LeadPending() {
  return (
    <div className="flex flex-col gap-3">
      <SectionHead title="Just analyzed" />
      <PendingRegion
        label="latest report"
        className="surface-card p-2"
        innerClassName="flex gap-6"
      >
        <span className="block aspect-video w-[224px] shrink-0 rounded-[var(--radius-element)] bg-[var(--surface-skeleton)] motion-safe:animate-pulse" />
        <span className="flex flex-1 flex-col justify-center gap-3 pr-4">
          <PendingBar className="w-64" />
          <PendingBar className="w-40" />
          <PendingBar />
          <PendingBar className="w-4/5" />
        </span>
      </PendingRegion>
    </div>
  );
}

function RowsPending({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-[52px] items-center gap-6">
          <PendingBar className="w-12" />
          <PendingBar className="w-40" />
          <PendingBar className="w-32" />
          <PendingBar className="w-24" />
          <PendingBar className="w-44" />
        </div>
      ))}
    </>
  );
}

export function LatestPending({ scope }: { scope: "personal" | "team" }) {
  return (
    <div className="flex flex-col gap-3">
      <SectionHead title="Latest matches" />
      <div className="surface-card" style={{ padding: "2px 24px 6px" }}>
        <div
          className={cn(
            LIST_ROW_FRAME,
            "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
          )}
          style={listGridCols(scope)}
        >
          {listColumnLabels(scope).map((label) => (
            <span key={label} className="eyebrow-sm min-w-0 truncate">
              {label}
            </span>
          ))}
        </div>
        <PendingRegion label="latest matches">
          <RowsPending rows={3} />
        </PendingRegion>
      </div>
    </div>
  );
}

export function TablePending({ title, rows }: { title: string; rows: number }) {
  return (
    <div className="flex flex-col gap-3">
      <SectionHead title={title} />
      <PendingRegion
        label={title.toLowerCase()}
        className="surface-card"
        innerClassName="px-6 pt-3 pb-1.5"
      >
        <RowsPending rows={rows} />
      </PendingRegion>
    </div>
  );
}

/** A whole Home, loading — the route fallback for both workspaces. */
export function HomeFeedSkeleton({
  scope,
  action,
}: {
  scope: "personal" | "team";
  action?: ReactNode;
}) {
  return (
    <HomeFeedFrame>
      <TitlePending action={action} />
      <BannerPending />
      <LeadPending />
      <LatestPending scope={scope} />
      <TablePending
        title={scope === "team" ? "Players" : "Your numbers"}
        rows={scope === "team" ? 6 : 5}
      />
    </HomeFeedFrame>
  );
}
