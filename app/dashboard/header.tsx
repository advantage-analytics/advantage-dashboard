"use client";

import { Bell, Menu, Search } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

export function Header() {
  const { toggleSidebar } = useSidebar();

  return (
    <header className="absolute top-0 left-0 right-0 z-30 flex items-center gap-4 px-8 py-6">
      {/* Left: Navigation Sidebar Button */}
      <button
        onClick={toggleSidebar}
        className="transition-transform duration-200 ease-out hover:scale-120"
      >
        <Menu className="h-5 w-5 text-white" />
      </button>

      {/* Middle: Search Bar */}
      <div className="flex-1 max-w-md mx-auto">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 z-10 pointer-events-none" />
          <input
            type="search"
            placeholder="Search..."
            className="w-full h-10 pl-10 pr-4 rounded-full backdrop-blur text-[14px] text-gray-500 outline-none focus:outline-none focus:ring-0 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-cancel-button]:cursor-pointer [&::-webkit-search-cancel-button]:opacity-70 hover:[&::-webkit-search-cancel-button]:opacity-100"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.4)",
              mixBlendMode: "luminosity",
            }}
          />
        </div>
      </div>

      {/* Right: Notifications & Profile */}
      <div className="flex items-center gap-6 shrink-0">
        <button className="transition-transform duration-200 ease-out hover:scale-120">
          <Bell className="h-5 w-5 text-white" />
        </button>

        {/* Profile Button */}
        <div className="h-8 w-8 rounded-full bg-gray-100"></div>
      </div>
    </header>
  );
}
