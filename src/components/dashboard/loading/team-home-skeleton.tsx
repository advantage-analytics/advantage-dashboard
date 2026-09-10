import { COURT_RECORD_COLS } from "@/components/dashboard/team/court-record-shell";
import { COURT_RECORD_WINDOW } from "@/lib/data/team-court-record";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TeamSeasonTitleFrame } from "@/components/dashboard/team/team-season-title";
import { TopMoversFrame } from "@/components/dashboard/team/top-movers";
import { CourtRecordFrame } from "@/components/dashboard/team/court-record";
import { DualHistoryFrame } from "@/components/dashboard/team/dual-history";
import { HomeKpisPending, HomeFooterPending } from "./home-skeleton";

export function PendingBar({ className = "w-full" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block h-3 max-w-full rounded-[3px] bg-[var(--surface-skeleton)] motion-safe:animate-pulse",
        className,
      )}
    />
  );
}

export function PendingRegion({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-label={`Loading ${label}`}>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

export function TeamHomeFrame({
  title,
  kpis,
  dual,
  movers,
  insight,
  court,
  history,
  footer,
}: Record<
  | "title"
  | "kpis"
  | "dual"
  | "movers"
  | "insight"
  | "court"
  | "history"
  | "footer",
  ReactNode
>) {
  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 px-14 pt-5 pb-8">
        {title}
        <TeamHomeRegions
          kpis={kpis}
          dual={dual}
          movers={movers}
          insight={insight}
          court={court}
          history={history}
        />
        <div className="flex flex-col gap-4">{footer}</div>
      </div>
    </div>
  );
}

export function TeamHomeRegions({
  kpis,
  dual,
  movers,
  insight,
  court,
  history,
}: Pick<
  Parameters<typeof TeamHomeFrame>[0],
  "kpis" | "dual" | "movers" | "insight" | "court" | "history"
>) {
  return (
    <>
      {kpis}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-5">
          {dual}
          {movers}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          {insight}
          {court}
          {history}
        </div>
      </div>
    </>
  );
}

export function TeamTitlePending({ action }: { action?: ReactNode }) {
  return (
    <TeamSeasonTitleFrame action={action}>
      <PendingRegion label="team summary">
        <div className="flex h-[18px] items-center">
          <PendingBar className="w-64" />
        </div>
      </PendingRegion>
    </TeamSeasonTitleFrame>
  );
}

export function DualPending() {
  return (
    <section aria-label="Dual" className="surface-card p-5">
      <span className="eyebrow">Dual</span>
      <PendingRegion label="dual">
        <PendingBar className="mt-4 h-6 w-48" />
        <PendingBar className="mt-3 w-32" />
        <div className="mt-3.5 border-t border-[var(--border-hairline)] pt-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex h-[38px] items-center gap-4">
              <PendingBar className="w-4" />
              <PendingBar className="w-28" />
              <PendingBar className="ml-auto w-20" />
            </div>
          ))}
        </div>
        <PendingBar className="mt-4 w-44" />
      </PendingRegion>
    </section>
  );
}
export function MoversBodyPending() {
  return (
    <PendingRegion label="top movers">
      <div className="mt-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex h-12 items-center gap-3.5">
            <PendingBar className="size-[26px] shrink-0 rounded-full" />
            <PendingBar className="w-28" />
            <PendingBar className="ml-auto w-16" />
            <PendingBar className="w-7" />
          </div>
        ))}
      </div>
    </PendingRegion>
  );
}
export function CourtBodyPending() {
  return (
    <PendingRegion label="court record">
      <div className="mt-3.5 flex flex-col gap-[5px] pt-[19px]">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="grid items-center gap-1"
            style={{ gridTemplateColumns: COURT_RECORD_COLS }}
          >
            <span className="text-[11px] text-[var(--ink-500)]">S{i + 1}</span>
            {Array.from({ length: COURT_RECORD_WINDOW }, (_, j) => (
              <PendingBar key={j} className="size-5" />
            ))}
            <PendingBar className="h-1.5 w-5 justify-self-end" />
          </div>
        ))}
      </div>
      <PendingBar className="mt-6 w-48" />
    </PendingRegion>
  );
}
export function HistoryBodyPending() {
  return (
    <PendingRegion label="dual history">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex h-[52px] items-center gap-3">
          <PendingBar className="size-8 shrink-0" />
          <div className="flex-1">
            <PendingBar className="w-28" />
            <PendingBar className="mt-2 w-16" />
          </div>
          <PendingBar className="w-11" />
        </div>
      ))}
      <PendingBar className="mt-5 w-40" />
    </PendingRegion>
  );
}
export function TeamHomeSkeleton({ action }: { action?: ReactNode }) {
  return (
    <TeamHomeFrame
      title={<TeamTitlePending action={action} />}
      kpis={<HomeKpisPending />}
      dual={<DualPending />}
      movers={
        <TopMoversFrame>
          <MoversBodyPending />
        </TopMoversFrame>
      }
      insight={null}
      court={
        <CourtRecordFrame>
          <CourtBodyPending />
        </CourtRecordFrame>
      }
      history={
        <DualHistoryFrame>
          <HistoryBodyPending />
        </DualHistoryFrame>
      }
      footer={<HomeFooterPending />}
    />
  );
}
