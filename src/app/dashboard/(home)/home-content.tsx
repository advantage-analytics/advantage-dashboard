import type { ReactNode } from "react";
import WelcomeMessage from "@/components/dashboard/home/welcome-message";
import RecentActivity from "./recent-activity";
import ServePlacementHome from "@/components/dashboard/home/serve-placement-home";

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
      <WelcomeMessage name={displayName} />

      {kpiStrip && <div className="mt-8">{kpiStrip}</div>}

      <div className="flex flex-row gap-8 mt-10">
        {/* Left Column */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          <RecentActivity />
          <ServePlacementHome />
        </div>

        {/* Right Column - Sidebar */}
        {sidebar && (
          <div className="w-[384px] flex-shrink-0 flex flex-col gap-6">
            {sidebar}
          </div>
        )}
      </div>
    </>
  );
}
