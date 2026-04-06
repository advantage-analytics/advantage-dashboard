import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
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

      <div className={cn("mt-10", sidebar
        ? "grid grid-cols-1 lg:grid-cols-[5fr_2fr] gap-8"
        : "flex flex-col gap-6"
      )}>
        {/* Left Column */}
        <div className="flex flex-col gap-6 min-w-0">
          <RecentActivity />
          <ServePlacementHome />
        </div>

        {/* Right Column */}
        {sidebar && (
          <div className="flex flex-col gap-6">
            {sidebar}
          </div>
        )}
      </div>
    </>
  );
}
