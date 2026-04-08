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
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useSidebar } from "@/components/ui/sidebar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SearchCommandPalette } from "@/components/dashboard/search/search-command-palette";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useUnsavedChanges } from "@/components/dashboard/settings/unsaved-changes-context";

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
  const [initials, setInitials] = useState<string | null>(null);
  const [matchCrumb, setMatchCrumb] = useState<MatchCrumb | null>(null);
  const [matchCrumbLoading, setMatchCrumbLoading] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isMac, setIsMac] = useState<boolean | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const { hasUnsavedChanges } = useUnsavedChanges();
  const profileRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  const isMatchDetailPage = /^\/dashboard\/matches\/[^/]+/.test(pathname);

  const matchId = isMatchDetailPage
    ? pathname.match(/^\/dashboard\/matches\/([^/]+)/)?.[1]
    : null;

  // Platform detection for shortcut display
  useEffect(() => {
    const platform = (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData?.platform ?? navigator.platform;
    setIsMac(/mac/i.test(platform));
  }, []);

  // Fetch match breadcrumb data
  useEffect(() => {
    if (!matchId) {
      setMatchCrumb(null);
      setMatchCrumbLoading(false);
      return;
    }
    setMatchCrumbLoading(true);
    async function fetchMatchCrumb() {
      try {
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
      } finally {
        setMatchCrumbLoading(false);
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
      try {
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
          const computed = (firstInitial + lastInitial).toUpperCase();
          if (computed) setInitials(computed);
        }
      } catch {
        // Keep initials as null — will show fallback icon
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

  // Trap focus inside profile dropdown when open
  useEffect(() => {
    if (!isProfileOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const focusableEls = menu.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled])"
    );
    if (focusableEls.length === 0) return;

    const first = focusableEls[0];
    const last = focusableEls[focusableEls.length - 1];

    // Focus the first item when opened
    first.focus();

    function handleMenuKeys(event: KeyboardEvent) {
      const items = Array.from(focusableEls);
      const index = items.indexOf(document.activeElement as HTMLElement);

      if (event.key === "Tab") {
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        items[(index + 1) % items.length].focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        items[(index - 1 + items.length) % items.length].focus();
      } else if (event.key === "Home") {
        event.preventDefault();
        first.focus();
      } else if (event.key === "End") {
        event.preventDefault();
        last.focus();
      }
    }

    menu.addEventListener("keydown", handleMenuKeys);
    return () => menu.removeEventListener("keydown", handleMenuKeys);
  }, [isProfileOpen]);

  // Close dropdown on route change
  useEffect(() => {
    setIsProfileOpen(false);
  }, [pathname]);

  // Keyboard shortcut: Cmd+K (search)
  // Note: Cmd+B (sidebar) is handled by SidebarProvider in sidebar.tsx
  useEffect(() => {
    function handleShortcuts(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === "k") {
        event.preventDefault();
        setIsSearchOpen(true);
      }
    }
    document.addEventListener("keydown", handleShortcuts);
    return () => document.removeEventListener("keydown", handleShortcuts);
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
    setIsLoggingOut(true);
    setLogoutError(false);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
    } catch {
      setIsLoggingOut(false);
      setLogoutError(true);
    }
  };

  return (
    <>
    <header
      ref={headerRef}
      className={cn(
        "sticky top-0 z-30 flex items-center justify-between h-11 py-4 px-4 bg-white border-b transition-colors duration-200",
        scrolled ? "border-[#EBEBEB]" : "border-transparent"
      )}
    >
      {/* Left: toggle + breadcrumbs */}
      <div className="flex items-center flex-1 min-w-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleSidebar}
              className="flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer transition-colors duration-150 text-[#8A8A8E] hover:text-[#3C3C43] hover:bg-[#F5F5F5] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:outline-none"
              aria-label="Toggle sidebar"
            >
              <PanelLeft className="h-[15px] w-[15px]" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            Toggle sidebar
            {isMac !== null && (
              <span className="ml-1.5 text-white/50">{isMac ? "\u2318B" : "\u2303B"}</span>
            )}
          </TooltipContent>
        </Tooltip>

        {/* Breadcrumb skeleton while loading match detail */}
        {isMatchDetailPage && matchCrumbLoading && !matchCrumb && (
          <div className="flex items-center gap-1.5 ml-1">
            <span className="inline-block h-3 w-14 rounded animate-pulse bg-[#F0F0F0]" />
            <ChevronRight
              className="h-3 w-3 shrink-0 text-[#CCCCCC]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="inline-block h-3 w-24 rounded animate-pulse bg-[#F0F0F0]" />
            <ChevronRight
              className="h-3 w-3 shrink-0 text-[#CCCCCC]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="inline-block h-3 w-32 rounded animate-pulse bg-[#F0F0F0]" />
          </div>
        )}

        {breadcrumbs.length > 0 && !(isMatchDetailPage && matchCrumbLoading) && (
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-0.5 ml-1 text-[11px] font-normal min-w-0"
          >
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-0.5 min-w-0">
                {i > 0 && (
                  <ChevronRight
                    className="h-3 w-3 shrink-0 text-[#CCCCCC]"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                )}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="transition-colors duration-200 shrink-0 text-[#888888] hover:text-[#525252]"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={cn(
                      "truncate",
                      i === breadcrumbs.length - 1
                        ? "text-[#0D0D0D]"
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
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setIsSearchOpen(true)}
              className="flex items-center gap-1.5 h-7 pl-2 pr-1.5 rounded-lg cursor-pointer transition-colors duration-150 text-[#8A8A8E] hover:text-[#3C3C43] hover:bg-[#F5F5F5] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:outline-none"
              aria-label="Search"
            >
              <Search className="h-[14px] w-[14px]" strokeWidth={1.5} aria-hidden="true" />
              {isMac !== null && (
                <kbd className="text-[10px] font-medium leading-none px-1 py-0.5 rounded text-[#AEAEB2] bg-[#F0F0F0]">
                  {isMac ? "\u2318K" : "\u2303K"}
                </kbd>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            Search
          </TooltipContent>
        </Tooltip>

        {/* Profile */}
        <div className="relative" ref={profileRef}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center text-[11px] font-semibold tracking-wide cursor-pointer transition-colors duration-150 text-[#8A8A8E] hover:bg-[#F5F5F5] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:outline-none",
                  isProfileOpen ? "bg-[#F5F5F5]" : "bg-transparent"
                )}
                aria-label="Profile menu"
                aria-expanded={isProfileOpen}
                aria-haspopup="menu"
              >
                {initials ?? (
                  <User
                    className="h-[15px] w-[15px]"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              Account
            </TooltipContent>
          </Tooltip>

          <AnimatePresence>
            {isProfileOpen && (
              <motion.div
                ref={menuRef}
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
                <div className="p-1">
                  <Link
                    href="/dashboard/settings/profile"
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-[#1D1D1F] hover:bg-[#F5F5F5] focus-visible:bg-[#F5F5F5] focus-visible:outline-none active:bg-[#EBEBEB] transition-colors duration-100 cursor-pointer"
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
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-[#1D1D1F] hover:bg-[#F5F5F5] focus-visible:bg-[#F5F5F5] focus-visible:outline-none active:bg-[#EBEBEB] transition-colors duration-100 cursor-pointer"
                    role="menuitem"
                  >
                    <Settings
                      className="h-[15px] w-[15px] text-[#8A8A8E]"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    Account
                  </Link>
                  <div className="h-px bg-[#E5E5EA] mx-2 my-1" />
                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      setIsLogoutOpen(true);
                    }}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-[#E51837] hover:bg-[rgba(229,24,55,0.05)] focus-visible:bg-[rgba(229,24,55,0.05)] focus-visible:outline-none active:bg-[rgba(229,24,55,0.1)] transition-colors duration-100 w-full cursor-pointer"
                    role="menuitem"
                  >
                    <LogOut
                      className="h-[15px] w-[15px] text-[#E51837]"
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

    <SearchCommandPalette open={isSearchOpen} onOpenChange={setIsSearchOpen} />

    {/* Logout confirmation */}
    <AlertDialog open={isLogoutOpen} onOpenChange={(open) => { setIsLogoutOpen(open); if (!open) { setLogoutError(false); setIsLoggingOut(false); } }}>
      <AlertDialogContent className="sm:max-w-[320px] sm:rounded-2xl p-5 gap-0 border border-[#E5E5EA] shadow-[0_8px_30px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <AlertDialogHeader className="space-y-0 text-left mb-5">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="h-7 w-7 rounded-full bg-[rgba(229,24,55,0.15)] flex items-center justify-center shrink-0">
              <LogOut className="h-3 w-3 text-[#E51837]" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <AlertDialogTitle className="text-[16px] font-medium text-[#1D1D1F] tracking-[-0.4px]">
              Log out
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-[13px] text-[#888888] leading-[1.5]">
            {hasUnsavedChanges
              ? "You have unsaved changes that will be lost. "
              : ""}
            You&#39;ll need to sign in again to access your matches and statistics.
          </AlertDialogDescription>
          {logoutError && (
            <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-[6px] bg-[rgba(229,24,55,0.15)]">
              <div className="h-1 w-1 rounded-full bg-[#E51837] shrink-0" />
              <p className="text-[12px] font-normal text-[#E51837]">
                Could not log out. Please try again.
              </p>
            </div>
          )}
        </AlertDialogHeader>
        <div className="flex items-center justify-end gap-2.5">
          <AlertDialogCancel
            disabled={isLoggingOut}
            className="h-8 rounded-[6px] px-4 border border-[#EAECF0] bg-transparent text-[10px] font-medium uppercase tracking-[1.5px] text-[#525252] hover:bg-[#F5F5F5] active:scale-[0.97] transition-colors duration-200 cursor-pointer m-0 focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:outline-none"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="h-8 rounded-[6px] px-4 border-none bg-[#E51837] hover:bg-[#CC1530] text-[10px] font-medium uppercase tracking-[1.5px] text-white active:scale-[0.97] transition-colors duration-200 cursor-pointer shadow-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:outline-none"
          >
            {isLoggingOut ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                Logging out
              </span>
            ) : logoutError ? (
              "Try again"
            ) : (
              "Log out"
            )}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
