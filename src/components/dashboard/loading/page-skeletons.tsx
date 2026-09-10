import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Quiet placeholders only: no fabricated values, charts, or focusable controls. */
function Bar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-3 max-w-full rounded-[3px] bg-[var(--surface-skeleton)]",
        className,
      )}
    />
  );
}

function Frame({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn("w-full flex-1 bg-[var(--surface-card)]", className)}
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="h-full motion-safe:animate-pulse">
        {children}
      </div>
    </div>
  );
}

function Title() {
  return (
    <div className="flex items-end justify-between gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Bar className="h-9 w-52" />
        <Bar className="w-64" />
      </div>
      <Bar className="h-8 w-24 shrink-0" />
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
          <Bar className="h-2 w-20" />
          <Bar className="h-8 w-16" />
          <Bar className="h-2 w-24" />
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
          <Bar className={i % 2 ? "w-32" : "w-40"} />
          <Bar className="w-20" />
          <Bar className="w-14" />
        </div>
      ))}
    </div>
  );
}

function Section({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-4 border-t border-[var(--border-hairline)] pt-4">
      <Bar className="h-2 w-28" />
      {children}
    </div>
  );
}

export { HomePageSkeleton } from "./home-skeleton";

export { MatchesPagePending as MatchesPageSkeleton } from "./matches-page-pending";

export function EventPageSkeleton() {
  return (
    <Frame label="Loading event">
      <div className="flex flex-col gap-6 px-12 pt-[26px] pb-8">
        <Title />
        <div className="flex gap-5">
          <Bar className="w-28" />
          <Bar className="w-20" />
          <Bar className="w-20" />
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
    </Frame>
  );
}

export function WizardPageSkeleton() {
  return (
    <Frame label="Loading form">
      <div className="flex min-h-[calc(100vh-var(--header-h))] flex-col">
        <Bar className="h-1 w-full rounded-none" />
        <div className="mx-auto flex w-full max-w-[832px] flex-1 flex-col gap-9 px-14 pt-16 pb-16">
          <div className="flex flex-col gap-3">
            <Bar className="h-2 w-20" />
            <Bar className="h-9 w-80" />
            <Bar className="w-96" />
          </div>
          <FormRows />
        </div>
        <div className="border-t border-[var(--border-hairline)]">
          <div className="mx-auto flex h-16 max-w-[832px] items-center justify-between px-14">
            <Bar className="w-16" />
            <Bar className="h-8 w-28" />
          </div>
        </div>
      </div>
    </Frame>
  );
}

function FormRows() {
  return (
    <div className="flex flex-col gap-7">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-3">
          <Bar className="h-2 w-24" />
          <div className="border-b border-[var(--border-hairline)] pb-3">
            <Bar className={i % 2 ? "w-48" : "w-64"} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Settings layout already owns the heading and navigation. */
export function SettingsFormSkeleton() {
  return (
    <Frame label="Loading settings">
      <div className="flex flex-col gap-9">
        <div className="flex items-center gap-4">
          <Bar className="size-14 shrink-0 rounded-full" />
          <div className="flex flex-col gap-3">
            <Bar className="h-5 w-40" />
            <Bar className="h-2 w-28" />
          </div>
        </div>
        <FormRows />
        <Section>
          <FormRows />
        </Section>
      </div>
    </Frame>
  );
}
export function SettingsUsageSkeleton() {
  return (
    <Frame label="Loading usage">
      <div className="flex flex-col gap-8">
        {[0, 1].map((i) => (
          <Section key={i}>
            <Bar className="h-9 w-36" />
            <Bar className="h-1 w-full" />
            <Rows count={3} />
          </Section>
        ))}
      </div>
    </Frame>
  );
}
export function SettingsTeamsSkeleton() {
  return (
    <Frame label="Loading teams">
      <div className="flex flex-col gap-5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-[var(--border-hairline)] py-5"
          >
            <Bar className="size-10 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <Bar className="h-4 w-48" />
              <Bar className="h-2 w-32" />
            </div>
            <Bar className="w-16" />
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function SettingsPreferencesSkeleton() {
  return (
    <Frame label="Loading preferences">
      <div className="flex flex-col gap-9">
        {[0, 1, 2].map((i) => (
          <Section key={i}>
            {[0, 1, 2].map((j) => (
              <div
                key={j}
                className="flex items-center justify-between gap-5 py-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <Bar className="w-40" />
                  <Bar className="h-2 w-64" />
                </div>
                <Bar className="h-5 w-9 shrink-0 rounded-full" />
              </div>
            ))}
          </Section>
        ))}
      </div>
    </Frame>
  );
}

export function SettingsAccountSkeleton() {
  return (
    <Frame label="Loading account">
      <div className="flex flex-col gap-9">
        {[0, 1, 2].map((i) => (
          <Section key={i}>
            <FormRows />
            <Bar className="h-8 w-28" />
          </Section>
        ))}
      </div>
    </Frame>
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
