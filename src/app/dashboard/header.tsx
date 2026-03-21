"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, PanelLeft, Search, Settings, LogOut, User } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export function Header() {
  const { toggleSidebar } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [initials, setInitials] = useState("P");
  const profileRef = useRef<HTMLDivElement>(null);

  const isHomePage = pathname === "/dashboard";

  // Fetch user initials from Supabase
  useEffect(() => {
    async function fetchUserInitials() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("users")
        .select("first_name, last_name")
        .eq("id", user.id)
        .single();

      if (data) {
        const firstInitial = data.first_name?.[0] || "";
        const lastInitial = data.last_name?.[0] || "";
        setInitials((firstInitial + lastInitial).toUpperCase() || "P");
      }
    }
    fetchUserInitials();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close dropdown on route change
  useEffect(() => {
    setIsProfileOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <header className="absolute top-0 left-0 right-0 z-30 flex items-center gap-4 px-8 py-6">
      {/* Left: Navigation Sidebar Button */}
      <button
        onClick={toggleSidebar}
        className="p-2 -m-2 transition-transform duration-200 ease-out hover:scale-110"
        aria-label="Toggle sidebar"
      >
        <PanelLeft
          className={cn(
            "h-4 w-4",
            isHomePage ? "text-white" : "text-[#0D0D0D]"
          )}
        />
      </button>

      {/* Middle: Search Bar */}
      <div className="flex-1 max-w-md mx-auto">
        <div className="relative">
          <Search
            className={cn(
              "absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 z-10 pointer-events-none",
              isHomePage ? "text-white/60" : "text-[#999]"
            )}
          />
          <input
            type="search"
            placeholder="Search matches, stats..."
            className={cn(
              "w-full h-10 pl-10 pr-4 rounded-full text-xs outline-none transition-colors duration-150",
              "[&::-webkit-search-cancel-button]:appearance-none",
              isHomePage
                ? "bg-white/15 backdrop-blur-sm text-white placeholder:text-white/40 focus:bg-white/20"
                : "bg-[#F2F2F2] text-[#0D0D0D] placeholder:text-[#999] focus:bg-[#EAEAEA]"
            )}
          />
        </div>
      </div>

      {/* Right: Notifications & Profile */}
      <div className="flex items-center gap-5 shrink-0">
        {/* Notifications */}
        <button
          className="relative p-2 -m-2 transition-transform duration-200 ease-out hover:scale-110"
          aria-label="Notifications"
        >
          <Bell
            className={cn(
              "h-4 w-4",
              isHomePage ? "text-white" : "text-[#0D0D0D]"
            )}
          />
        </button>

        {/* Profile Dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className={cn(
              "h-9 w-9 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-150",
              isHomePage
                ? "bg-white/15 backdrop-blur-sm text-white hover:bg-white/25"
                : "bg-[#F2F2F2] text-[#666] hover:bg-[#EAEAEA]"
            )}
            aria-label="Profile menu"
            aria-expanded={isProfileOpen}
          >
            {initials}
          </button>

          {/* Dropdown Menu */}
          {isProfileOpen && (
            <div
              className={cn(
                "absolute right-0 top-full mt-2 w-44 rounded-lg overflow-hidden",
                "border border-[#E5E5E5] bg-white"
              )}
            >
              <div className="py-1">
                <Link
                  href="/dashboard/settings/profile"
                  className="flex items-center gap-3 px-4 py-2.5 text-xs text-[#0D0D0D] hover:bg-[#F9F9F9] transition-colors"
                >
                  <User className="h-3.5 w-3.5 text-[#666]" />
                  Profile
                </Link>
                <Link
                  href="/dashboard/settings/account"
                  className="flex items-center gap-3 px-4 py-2.5 text-xs text-[#0D0D0D] hover:bg-[#F9F9F9] transition-colors"
                >
                  <Settings className="h-3.5 w-3.5 text-[#666]" />
                  Account
                </Link>
                <div className="border-t border-[#E5E5E5] my-1" />
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-4 py-2.5 text-xs text-[#0D0D0D] hover:bg-[#F9F9F9] transition-colors w-full"
                >
                  <LogOut className="h-3.5 w-3.5 text-[#666]" />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
