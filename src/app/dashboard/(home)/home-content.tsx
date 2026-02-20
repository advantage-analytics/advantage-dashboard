"use client";

import { useState } from "react";
import NavigationTabs, {
  TabType,
} from "@/components/dashboard/home/navigation-tabs";
import RecentActivity from "./recent-activity";
import Upcoming from "./upcoming";
import About from "./about";

export default function HomeContent() {
  const [activeTab, setActiveTab] = useState<TabType>("past");

  return (
    <div className="space-y-5">
      {/* Navigation Tabs */}
      <NavigationTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab Content */}
      {activeTab === "past" && <RecentActivity />}
      {activeTab === "upcoming" && <Upcoming />}
      {activeTab === "about" && <About />}
    </div>
  );
}
