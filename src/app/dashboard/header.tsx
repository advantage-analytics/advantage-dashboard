"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  ChevronRight,
  PanelLeft,
  Plus,
  Search,
  Settings,
  LogOut,
  User,
} from "lucide-react";
import { UploadMatchModal } from "@/components/dashboard/home/upload-match-modal";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface MatchCrumb {
  tournamentName: string;
  player1Name: string;
  player2Name: string;
}

function getStaticBreadcrumbs(
  pathname: string
): { label: string; href?: string }[] | null {
  if (pathname === "/dashboard") return [];
  if (pathname.startsWith("/dashboard/statistics"))
    return [{ label: "Statistics" }];
  if (pathname.startsWith("/dashboard/help")) return [{ label: "Help" }];
  if (pathname.startsWith("/dashboard/settings"))
    return [{ label: "Settings" }];
  if (pathname.startsWith("/dashboard/matches"))
    return [{ label: "Matches" }];
  return [];
}

export function Header() {
  const { toggleSidebar } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCreateMatchOpen, setIsCreateMatchOpen] = useState(false);
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
    if (!matchId) {
      setMatchCrumb(null);
      return;
    }
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

  const breadcrumbs: { label: string; href?: string }[] =
    isMatchDetailPage && matchCrumb
      ? [
          { label: "Matches", href: "/dashboard/matches" },
          { label: matchCrumb.tournamentName },
          {
            label: `${matchCrumb.player1Name} vs ${matchCrumb.player2Name}`,
          },
        ]
      : (getStaticBreadcrumbs(pathname) ?? []);

  // Fetch user initials from Supabase
  useEffect(() => {
    async function fetchUserInitials() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
    <header className="absolute top-0 left-0 right-0 z-30 flex items-center px-8 h-14">
      {/* Left: Sidebar toggle + breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className={cn(
            "flex items-center justify-center w-8 h-8 rounded-full cursor-pointer transition-colors duration-200",
            isDarkPage
              ? "text-white/70 hover:text-white hover:bg-white/[0.08]"
              : "text-[#525252] hover:text-[#0D0D0D] hover:bg-[#F2F2F2]"
          )}
          aria-label="Toggle sidebar"
        >
          <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
        </button>

        {breadcrumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-0.5 text-[12px] font-normal"
          >
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-0.5">
                {i > 0 && (
                  <ChevronRight
                    className={cn(
                      "h-3 w-3",
                      isDarkPage ? "text-white/20" : "text-[#CCCCCC]"
                    )}
                    strokeWidth={1.5}
                  />
                )}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className={cn(
                      "transition-colors duration-200",
                      isDarkPage
                        ? "text-white/40 hover:text-white/70"
                        : "text-[#999999] hover:text-[#525252]"
                    )}
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={
                      i === breadcrumbs.length - 1
                        ? isDarkPage
                          ? "text-white/70"
                          : "text-[#0D0D0D]"
                        : isDarkPage
                          ? "text-white/40"
                          : "text-[#999999]"
                    }
                  >
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

      {/* Right: Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Search Bar */}
        <div className="relative">
          <Search
            className={cn(
              "absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 z-10 pointer-events-none",
              isDarkPage ? "text-white/40" : "text-[#999999]"
            )}
            strokeWidth={1.5}
          />
          <input
            type="search"
            placeholder="Search matches, stats..."
            className={cn(
              "w-48 h-8 pl-9 pr-4 rounded-full text-[12px] outline-none transition-all duration-200 focus:w-56",
              "[&::-webkit-search-cancel-button]:appearance-none",
              isDarkPage
                ? "bg-white/[0.08] text-white placeholder:text-white/30 focus:bg-white/[0.12]"
                : "bg-[#F2F2F2] text-[#0D0D0D] placeholder:text-[#999999] focus:bg-[#EAEAEA]"
            )}
          />
        </div>

        {/* Create Match */}
        <button
          onClick={() => setIsCreateMatchOpen(true)}
          aria-label="Create match"
          className={cn(
            "group flex items-center h-8 rounded-full overflow-hidden cursor-pointer transition-all duration-200 active:scale-[0.97]",
            isDarkPage
              ? "bg-white/[0.08] border border-white/[0.1] text-white/70 hover:bg-white/[0.14] hover:text-white hover:border-white/[0.18] w-8 hover:w-[136px]"
              : "bg-[#0D0D0D] text-white hover:bg-[#1D1D1F] w-8 hover:w-[136px]"
          )}
        >
          <span className="flex items-center justify-center shrink-0 w-8 h-8">
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <span className="text-[12px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pr-3">
            Create Match
          </span>
        </button>

        {/* Notifications */}
        <button
          className={cn(
            "flex items-center justify-center w-8 h-8 rounded-full cursor-pointer transition-colors duration-200",
            isDarkPage
              ? "text-white/70 hover:text-white hover:bg-white/[0.08]"
              : "text-[#525252] hover:text-[#0D0D0D] hover:bg-[#F2F2F2]"
          )}
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" strokeWidth={1.5} />
        </button>

        {/* Profile Dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-medium cursor-pointer transition-colors duration-200",
              isDarkPage
                ? "bg-white/[0.1] text-white/80 hover:bg-white/[0.16]"
                : "bg-[#F2F2F2] text-[#525252] hover:bg-[#EAEAEA]"
            )}
            aria-label="Profile menu"
            aria-expanded={isProfileOpen}
          >
            {initials}
          </button>

          {/* Dropdown Menu */}
          {isProfileOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-xl overflow-hidden border border-[#E7E7E7] bg-white shadow-[0px_4px_16px_0px_rgba(0,0,0,0.08)] animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="py-1.5">
                <Link
                  href="/dashboard/settings/profile"
                  className="flex items-center gap-3 px-4 py-2.5 text-[13px] text-[#0D0D0D] hover:bg-[#FAFAFA] transition-colors duration-200 cursor-pointer"
                >
                  <User className="h-4 w-4 text-[#999999]" strokeWidth={1.5} />
                  Profile
                </Link>
                <Link
                  href="/dashboard/settings/account"
                  className="flex items-center gap-3 px-4 py-2.5 text-[13px] text-[#0D0D0D] hover:bg-[#FAFAFA] transition-colors duration-200 cursor-pointer"
                >
                  <Settings
                    className="h-4 w-4 text-[#999999]"
                    strokeWidth={1.5}
                  />
                  Account
                </Link>
                <div className="h-px bg-[#F0F0F0] mx-3 my-1" />
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-4 py-2.5 text-[13px] text-[#0D0D0D] hover:bg-[#FAFAFA] transition-colors duration-200 w-full cursor-pointer"
                >
                  <LogOut
                    className="h-4 w-4 text-[#999999]"
                    strokeWidth={1.5}
                  />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <UploadMatchModal
        open={isCreateMatchOpen}
        onOpenChange={setIsCreateMatchOpen}
      />
    </header>
  );
}
