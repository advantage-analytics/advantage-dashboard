import type { ReactNode } from "react";
import WelcomeMessage from "@/components/dashboard/home/welcome-message";
import RecentActivity from "./recent-activity";

interface HomeContentProps {
  displayName: string;
  kpiStrip?: ReactNode;
  sidebar?: ReactNode;
}

export default function HomeContent({
  displayName,
  kpiStrip,
  sidebar,
}: HomeContentProps) {
  return (
    <>
      {/* Hero zone: Welcome message + KPI cards */}
      <WelcomeMessage name={displayName} />

      {kpiStrip && <div className="mt-8">{kpiStrip}</div>}

      {/* Below-hero: Two column layout */}
      <div className="flex flex-row gap-8 mt-8 pb-12">
        {/* Left Column */}
        <div className="flex-1 min-w-0">
          <RecentActivity />
        </div>

        {/* Right Column - Sidebar */}
        {sidebar && (
          <div className="sticky top-24 w-[384px] flex-shrink-0 self-start h-fit flex flex-col gap-6">
            {sidebar}
          </div>
        )}
      </div>
    </>
  );
}
