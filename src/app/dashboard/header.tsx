"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, PanelLeft, Search, Settings, LogOut, User } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface MatchCrumb {
  tournamentName: string;
  player1Name: string;
  player2Name: string;
}

function getStaticBreadcrumbs(pathname: string): { label: string; href?: string }[] | null {
  if (pathname === "/dashboard") return [];
  if (pathname.startsWith("/dashboard/statistics")) return [{ label: "Statistics" }];
  if (pathname.startsWith("/dashboard/help")) return [{ label: "Help" }];
  if (pathname.startsWith("/dashboard/settings")) return [{ label: "Settings" }];
  if (pathname.startsWith("/dashboard/matches")) return [{ label: "Matches" }];
  return [];
}

export function Header() {
  const { toggleSidebar } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [initials, setInitials] = useState("P");
  const [matchCrumb, setMatchCrumb] = useState<MatchCrumb | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const isHomePage = pathname === "/dashboard";
  const isMatchDetailPage = /^\/dashboard\/matches\/[^/]+/.test(pathname);
  const isDarkPage = isHomePage || isMatchDetailPage;

  const matchId = isMatchDetailPage
    ? pathname.match(/^\/dashboard\/matches\/([^/]+)/)?.[1]
    : null;

  // Fetch match breadcrumb data when on a match detail page
  useEffect(() => {
    if (!matchId) { setMatchCrumb(null); return; }
    async function fetchMatchCrumb() {
      const supabase = createClient();
      const { data } = await supabase
        .from("matches")
        .select("tournament_name, player1_name, player2_name")
        .eq("id", matchId)
        .single();
      if (data) {
        setMatchCrumb({
          tournamentName: data.tournament_name ?? "Unknown Event",
          player1Name: data.player1_name,
          player2Name: data.player2_name,
        });
      }
    }
    fetchMatchCrumb();
  }, [matchId]);

  const breadcrumbs: { label: string; href?: string }[] = isMatchDetailPage && matchCrumb
    ? [
        { label: "Matches", href: "/dashboard/matches" },
        { label: matchCrumb.tournamentName },
        { label: `${matchCrumb.player1Name} vs ${matchCrumb.player2Name}` },
      ]
    : (getStaticBreadcrumbs(pathname) ?? []);

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
    <header className="absolute top-0 left-0 right-0 z-30 flex items-center px-8 py-4">
      {/* Left: Sidebar toggle + breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="p-2 -m-2 transition-transform duration-200 ease-out hover:scale-110"
          aria-label="Toggle sidebar"
        >
          <PanelLeft
            className={cn(
              "h-4 w-4",
              isDarkPage ? "text-white" : "text-[#0D0D0D]"
            )}
          />
        </button>

        {breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs font-normal">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && (
                  <span className={isDarkPage ? "text-white/30" : "text-[#999999]"}>/</span>
                )}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className={cn(
                      "transition-colors",
                      isDarkPage
                        ? "text-white/40 hover:text-white/60"
                        : "text-[#999999] hover:text-[#666666]"
                    )}
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={isDarkPage ? "text-white/50" : "text-[#999999]"}>
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right: Search, Notifications & Profile */}
      <div className="flex items-center gap-5 shrink-0">
        {/* Search Bar */}
        <div className="relative">
          <Search
            className={cn(
              "absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 z-10 pointer-events-none",
              isDarkPage ? "text-white/60" : "text-[#999]"
            )}
          />
          <input
            type="search"
            placeholder="Search matches, stats..."
            className={cn(
              "w-48 h-8 pl-9 pr-4 rounded-full text-xs outline-none transition-all duration-200 focus:w-56",
              "[&::-webkit-search-cancel-button]:appearance-none",
              isDarkPage
                ? "bg-white/15 backdrop-blur-sm text-white placeholder:text-white/40 focus:bg-white/20"
                : "bg-[#F2F2F2] text-[#0D0D0D] placeholder:text-[#999] focus:bg-[#EAEAEA]"
            )}
          />
        </div>

        {/* Notifications */}
        <button
          className="relative p-2 -m-2 transition-transform duration-200 ease-out hover:scale-110"
          aria-label="Notifications"
        >
          <Bell
            className={cn(
              "h-4 w-4",
              isDarkPage ? "text-white" : "text-[#0D0D0D]"
            )}
          />
        </button>

        {/* Profile Dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className={cn(
              "h-9 w-9 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-150",
              isDarkPage
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
