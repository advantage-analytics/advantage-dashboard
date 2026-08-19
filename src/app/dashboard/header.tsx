"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  ChevronDown,
  Search,
  SlidersHorizontal,
  Timer,
  CircleHelp,
  LogOut,
} from "lucide-react";
import { SearchCommandPalette } from "@/components/dashboard/search/search-command-palette";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { navLabel, settingsSection } from "@/lib/dashboard/nav";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { WorkspaceOptionList } from "@/components/dashboard/workspace-switcher";
import { useRequestLogout } from "@/components/dashboard/logout-dialog";

interface MatchCrumb {
  tournamentName: string;
  player1Name: string;
  player2Name: string;
}

/**
 * Static children of /dashboard/matches. Next resolves these before the
 * [matchId] dynamic segment, so they are never match ids — the header has to
 * mirror that or it fires a doomed match lookup (and shows a crumb skeleton)
 * on every one of them.
 */
const MATCHES_STATIC_SEGMENTS = new Set(["new"]);

const MATCHES_CRUMB = { label: "Matches", href: "/dashboard/matches" };

/**
 * The crumb for any page that is simply a navigation destination.
 *
 * Labels come from the shared route table rather than a second list here. The
 * ordered `if` chain this replaces had to test `/dashboard/team/settings`
 * before `/dashboard/settings` or the wrong crumb won, and it had already
 * drifted — the sidebar said "Help Center" where this said "Help".
 */
function getStaticBreadcrumbs(
  pathname: string
): { label: string; href?: string }[] {
  if (pathname === "/dashboard") return [];
  // The one page that is a step within a destination rather than one itself.
  if (pathname === "/dashboard/matches/new") {
    return [MATCHES_CRUMB, { label: "New match" }];
  }

  // Settings is the one destination with sub-pages of its own, so the trail
  // reaches them: "Settings › Usage" rather than six pages all called Settings.
  const section = settingsSection(pathname);
  if (section) {
    return [
      { label: "Settings", href: "/dashboard/settings" },
      { label: section.label },
    ];
  }

  const label = navLabel(pathname);
  return label ? [{ label }] : [];
}

/** "coach" → "Coach". Used for both the role and plan chips. */
function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** A quiet capsule for role and plan. Grey only — neither is an action. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-[10px] text-[var(--ink-600)]">
      {children}
    </span>
  );
}

const MENU_ITEM_CLASS =
  "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-[7px] text-[12px] text-[var(--ink-900)] transition-colors duration-100 hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none cursor-pointer";

export function Header({ activitySlot }: { activitySlot: React.ReactNode }) {
  const pathname = usePathname();
  const { active, viewer } = useWorkspace();
  const requestLogout = useRequestLogout();

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [matchCrumb, setMatchCrumb] = useState<MatchCrumb | null>(null);
  const [matchCrumbLoading, setMatchCrumbLoading] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isMac, setIsMac] = useState<boolean | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const headerRef = useRef<HTMLElement>(null);

  const matchesChildSegment =
    pathname.match(/^\/dashboard\/matches\/([^/]+)/)?.[1] ?? null;

  const isMatchDetailPage =
    matchesChildSegment !== null &&
    !MATCHES_STATIC_SEGMENTS.has(matchesChildSegment);

  const matchId = isMatchDetailPage ? matchesChildSegment : null;

  useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform: string } })
        .userAgentData?.platform ?? navigator.platform;
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

  // A match detail page is one page. `matches/[matchId]/` has no
  // sub-directories — only error/layout/loading/not-found/page — so the trail
  // that used to be built here for insights/performance/statistics/video/visuals
  // matched routes that cannot be reached.
  const breadcrumbs: { label: string; href?: string }[] =
    isMatchDetailPage && matchCrumb
      ? [
          MATCHES_CRUMB,
          { label: matchCrumb.tournamentName },
          { label: `${matchCrumb.player1Name} vs ${matchCrumb.player2Name}` },
        ]
      : getStaticBreadcrumbs(pathname);

  // Radix handles Escape, outside-click and focus return; a client-side
  // navigation from a menu item is the one dismissal it cannot see.
  useEffect(() => {
    setIsProfileOpen(false);
  }, [pathname]);

  // Keyboard shortcut: Cmd+K (search). Cmd+\ (sidebar pin) belongs to
  // SidebarStateProvider, which owns the toggle now that it lives in the rail.
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

  return (
    <>
      <header
        ref={headerRef}
        className={cn(
          "sticky top-0 z-30 flex h-11 items-center justify-between border-b bg-white px-4 py-4 transition-colors duration-200",
          scrolled ? "border-[#EBEBEB]" : "border-transparent"
        )}
      >
        {/* Left: breadcrumbs. The collapse toggle moved into the sidebar's
            bottom group, where it never shifts relative to Settings and Help. */}
        <div className="flex min-w-0 flex-1 items-center">

          {isMatchDetailPage && matchCrumbLoading && !matchCrumb && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-14 animate-pulse rounded bg-[#F0F0F0]" />
              <ChevronRight
                className="h-3 w-3 shrink-0 text-[#CCCCCC]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span className="inline-block h-3 w-24 animate-pulse rounded bg-[#F0F0F0]" />
              <ChevronRight
                className="h-3 w-3 shrink-0 text-[#CCCCCC]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span className="inline-block h-3 w-32 animate-pulse rounded bg-[#F0F0F0]" />
            </div>
          )}

          {breadcrumbs.length > 0 && !(isMatchDetailPage && matchCrumbLoading) && (
            <nav
              aria-label="Breadcrumb"
              className="flex min-w-0 items-center gap-0.5 text-[11px] font-normal"
            >
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex min-w-0 items-center gap-0.5">
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
                      className="shrink-0 text-[#888888] transition-colors duration-200 hover:text-[#525252]"
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

        {/* Right: search + activity + profile */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Named, not just an icon — a bare magnifier does not say what it
              searches, and the palette covers matches, players and help. */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="flex h-7 cursor-pointer items-center gap-1.5 rounded-[8px] pl-2 pr-1.5 text-[var(--ink-500)] transition-colors duration-150 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-700)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)]"
          >
            <Search className="h-[14px] w-[14px]" strokeWidth={1.5} aria-hidden="true" />
            <span className="text-[12px] text-[var(--ink-600)]">Search</span>
            {isMac !== null && (
              <kbd className="rounded bg-[#F0F0F0] px-1 py-0.5 text-[10px] font-medium leading-none text-[#AAAAAA]">
                {isMac ? "⌘K" : "⌃K"}
              </kbd>
            )}
          </button>

          {activitySlot}

          <span
            aria-hidden="true"
            className="h-3.5 w-px bg-[var(--border-medium)]"
          />

          {/* Profile.

              Radix, like the two menus beside it. This was ~100 lines of
              bespoke chrome — an outside-click listener, an Escape handler, a
              manual Tab/Arrow/Home/End focus trap and a hand-built enter/exit
              animation — sitting in the same flex row as two Popovers that get
              all of it for free, plus portalling and focus return that the
              hand-rolled version never had. Three adjacent menus, three
              dismissal behaviours. */}
          <Popover open={isProfileOpen} onOpenChange={setIsProfileOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "flex cursor-pointer items-center gap-1 rounded-full py-[3px] pl-[3px] pr-1.5 transition-colors duration-150 hover:bg-[var(--surface-subtle)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)]",
                  isProfileOpen && "bg-[var(--surface-subtle)]"
                )}
                aria-label="Account menu"
              >
                <span
                  aria-hidden="true"
                  className="flex size-[26px] items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[9px] font-medium text-[var(--ink-700)]"
                >
                  {viewer.initials}
                </span>
                <ChevronDown
                  className={cn(
                    "size-3 transition-transform duration-200",
                    isProfileOpen
                      ? "rotate-180 text-[var(--ink-600)]"
                      : "text-[var(--ink-400)]"
                  )}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>
            </PopoverTrigger>

            <PopoverContent
              align="end"
              sideOffset={6}
              className="w-[260px] rounded-[12px] border-[var(--border-medium)] p-1.5"
            >
              {/* Identity */}
              <div className="flex items-center gap-2.5 px-2.5 pb-2 pt-2.5">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[10px] font-medium text-[var(--ink-700)]"
                >
                  {viewer.initials}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-[var(--ink-900)]">
                    {viewer.name}
                  </p>
                  <p className="truncate text-[11px] text-[var(--ink-500)]">
                    {viewer.email}
                  </p>
                </div>
              </div>

              <div className="flex gap-1.5 px-2.5 pb-2.5">
                {/* Role is a program standing — a personal workspace has no one
                    to have standing over, so it carries only the plan. */}
                {active.kind === "team" && <Chip>{capitalize(active.role)}</Chip>}
                <Chip>{capitalize(viewer.plan)}</Chip>
              </div>

              <div className="-mx-1.5 h-px bg-[var(--border-hairline)]" />

              <p className="px-2.5 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[1.5px] text-[var(--ink-500)]">
                Workspace
              </p>
              <WorkspaceOptionList onSwitched={() => setIsProfileOpen(false)} />

              <div className="-mx-1.5 my-1.5 h-px bg-[var(--border-hairline)]" />

              <Link href="/dashboard/settings/profile" className={MENU_ITEM_CLASS}>
                <SlidersHorizontal
                  className="size-[13px] text-[var(--ink-600)]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                Preferences
              </Link>
              <Link
                href="/dashboard/settings/plan"
                className={MENU_ITEM_CLASS}
              >
                <Timer
                  className="size-[13px] text-[var(--ink-600)]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                Usage &amp; quota
              </Link>
              <Link href="/dashboard/help" className={MENU_ITEM_CLASS}>
                <CircleHelp
                  className="size-[13px] text-[var(--ink-600)]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                Help
              </Link>

              <div className="-mx-1.5 my-1.5 h-px bg-[var(--border-hairline)]" />

              <button
                onClick={() => {
                  setIsProfileOpen(false);
                  requestLogout();
                }}
                className={cn(MENU_ITEM_CLASS, "text-[var(--ink-700)]")}
              >
                <LogOut
                  className="size-[13px] text-[var(--ink-600)]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                Sign out
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </header>

      <SearchCommandPalette open={isSearchOpen} onOpenChange={setIsSearchOpen} />
    </>
  );
}
