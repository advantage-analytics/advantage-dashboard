"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight,
  PanelLeft,
  Search,
  Settings,
  LogOut,
  User,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];

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
  const shouldReduceMotion = useReducedMotion();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [initials, setInitials] = useState("P");
  const [matchCrumb, setMatchCrumb] = useState<MatchCrumb | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [isMac, setIsMac] = useState(true);
  const profileRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  const isMatchDetailPage = /^\/dashboard\/matches\/[^/]+/.test(pathname);
  const isDarkPage = isMatchDetailPage;

  const matchId = isMatchDetailPage
    ? pathname.match(/^\/dashboard\/matches\/([^/]+)/)?.[1]
    : null;

  // Platform detection for shortcut display
  useEffect(() => {
    setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.platform));
  }, []);

  // Fetch match breadcrumb data
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

  // Fetch user initials
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

  // Close dropdown on outside click or Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setIsProfileOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsProfileOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Close dropdown on route change
  useEffect(() => {
    setIsProfileOpen(false);
  }, [pathname]);

  // Cmd+K / Ctrl+K search shortcut
  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        // Future: open command palette
      }
    }
    document.addEventListener("keydown", handleSearchShortcut);
    return () => document.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  // Scroll detection for border
  const handleScroll = useCallback(() => {
    const parent = headerRef.current?.parentElement;
    if (parent) setScrolled(parent.scrollTop > 0);
  }, []);

  useEffect(() => {
    const parent = headerRef.current?.parentElement;
    if (!parent) return;
    parent.addEventListener("scroll", handleScroll, { passive: true });
    return () => parent.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <header
      ref={headerRef}
      className={cn(
        "sticky top-0 z-30 flex items-center justify-between h-11 py-4 px-4 bg-white border-b transition-colors duration-200",
        scrolled
          ? isDarkPage
            ? "border-white/[0.06]"
            : "border-[#EBEBEB]"
          : "border-transparent"
      )}
    >
      {/* Left: toggle + breadcrumbs */}
      <div className="flex items-center flex-1 min-w-0">
        <button
          onClick={toggleSidebar}
          className={cn(
            "flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer transition-colors duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:outline-none",
            isDarkPage
              ? "text-white/60 hover:text-white hover:bg-white/[0.07]"
              : "text-[#8A8A8E] hover:text-[#3C3C43] hover:bg-[#F5F5F5]"
          )}
          aria-label="Toggle sidebar"
        >
          <PanelLeft className="h-[15px] w-[15px]" strokeWidth={1.5} aria-hidden="true" />
        </button>

        {breadcrumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-0.5 ml-1 text-[11px] font-normal min-w-0"
          >
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-0.5 min-w-0">
                {i > 0 && (
                  <ChevronRight
                    className={cn(
                      "h-3 w-3 shrink-0",
                      isDarkPage ? "text-white/20" : "text-[#CCCCCC]"
                    )}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                )}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className={cn(
                      "transition-colors duration-200 shrink-0",
                      isDarkPage
                        ? "text-white/40 hover:text-white/70"
                        : "text-[#888888] hover:text-[#525252]"
                    )}
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={cn(
                      "truncate",
                      i === breadcrumbs.length - 1
                        ? isDarkPage
                          ? "text-white/70"
                          : "text-[#0D0D0D]"
                        : isDarkPage
                          ? "text-white/40"
                          : "text-[#888888]"
                    )}
                  >
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
        )}
      </div>

      {/* Right: search + profile */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Search trigger — compact pill */}
        <button
          className={cn(
            "flex items-center gap-1.5 h-7 pl-2 pr-1.5 rounded-lg cursor-pointer transition-colors duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:outline-none",
            isDarkPage
              ? "text-white/40 hover:text-white/60 hover:bg-white/[0.07]"
              : "text-[#8A8A8E] hover:text-[#3C3C43] hover:bg-[#F5F5F5]"
          )}
          aria-label="Search"
        >
          <Search className="h-[14px] w-[14px]" strokeWidth={1.5} aria-hidden="true" />
          <kbd
            className={cn(
              "text-[10px] font-medium leading-none px-1 py-0.5 rounded",
              isDarkPage
                ? "text-white/25 bg-white/[0.06]"
                : "text-[#AEAEB2] bg-[#F0F0F0]"
            )}
          >
            {isMac ? "\u2318K" : "\u2303K"}
          </kbd>
        </button>

        {/* Profile */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center text-[11px] font-semibold tracking-wide cursor-pointer transition-colors duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:outline-none",
              isDarkPage
                ? "text-white/70 hover:bg-white/[0.07]"
                : "text-[#8A8A8E] hover:bg-[#F5F5F5]"
            )}
            aria-label="Profile menu"
            aria-expanded={isProfileOpen}
            aria-haspopup="menu"
          >
            {initials}
          </button>

          <AnimatePresence>
            {isProfileOpen && (
              <motion.div
                initial={{
                  opacity: 0,
                  transform: shouldReduceMotion
                    ? "scale(1) translateY(0px)"
                    : "scale(0.96) translateY(-4px)",
                }}
                animate={{
                  opacity: 1,
                  transform: "scale(1) translateY(0px)",
                }}
                exit={{
                  opacity: 0,
                  transform: shouldReduceMotion
                    ? "scale(1) translateY(0px)"
                    : "scale(0.98) translateY(-2px)",
                  transition: {
                    duration: shouldReduceMotion ? 0.06 : 0.12,
                    ease: EASE,
                  },
                }}
                transition={{
                  duration: shouldReduceMotion ? 0.08 : 0.18,
                  ease: EASE,
                }}
                style={{ transformOrigin: "top right" }}
                className="absolute right-0 top-full mt-1.5 w-44 rounded-xl overflow-hidden border border-[#E5E5EA] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]"
                role="menu"
              >
                <div className="py-1">
                  <Link
                    href="/dashboard/settings/profile"
                    className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-[#1D1D1F] hover:bg-[#F5F5F5] active:bg-[#EBEBEB] transition-colors duration-100 cursor-pointer"
                    role="menuitem"
                  >
                    <User
                      className="h-[15px] w-[15px] text-[#8A8A8E]"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    Profile
                  </Link>
                  <Link
                    href="/dashboard/settings/account"
                    className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-[#1D1D1F] hover:bg-[#F5F5F5] active:bg-[#EBEBEB] transition-colors duration-100 cursor-pointer"
                    role="menuitem"
                  >
                    <Settings
                      className="h-[15px] w-[15px] text-[#8A8A8E]"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    Account
                  </Link>
                  <div className="h-px bg-[#E5E5EA] mx-2.5 my-1" />
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-[#1D1D1F] hover:bg-[#F5F5F5] active:bg-[#EBEBEB] transition-colors duration-100 w-full cursor-pointer"
                    role="menuitem"
                  >
                    <LogOut
                      className="h-[15px] w-[15px] text-[#8A8A8E]"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    Log out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
