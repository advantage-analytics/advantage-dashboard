"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHeaderStatus } from "@/components/dashboard/header-status";
import { useHeaderSlot } from "@/components/dashboard/header-slot";
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
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  ChromeTooltip,
  CHROME_TOOLTIP_DELAY_MS,
} from "@/components/dashboard/shared/chrome-tooltip";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  isDestination,
  navLabel,
  scheduleLeaf,
  settingsSection,
} from "@/lib/dashboard/nav";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { workspaceTitle } from "@/lib/workspace/types";
import { WorkspaceOptionList } from "@/components/dashboard/workspace-switcher";
import { useRequestLogout } from "@/components/dashboard/logout-dialog";
import { HeaderGreeting } from "@/components/dashboard/header-greeting";
import { MENU_ROW_CLASS, MENU_RULE_CLASS } from "@/lib/ui/menu";

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
 * Label resolved through the shared route table (`navLabel`), never restated:
 * rename Schedule in the rail and this crumb renames with it — the drift
 * `nav.ts` exists to prevent. The literal is only the fallback for a table
 * that no longer lists the route at all.
 */
const SCHEDULE_HREF = "/dashboard/team/schedule";

/** `/dashboard/settings/teams/<id>` — the one settings page nested a level deeper. */
const TEAM_SETTINGS_PAGE = /^\/dashboard\/settings\/teams\/([^/]+)/;
const TEAMS_CRUMB = { label: "Teams", href: "/dashboard/settings/teams" };
const SCHEDULE_CRUMB = {
  label: navLabel(SCHEDULE_HREF) ?? "Schedule",
  href: SCHEDULE_HREF,
};

/**
 * `/dashboard/team/roster/<playerId>` — the player profile. The page publishes
 * its own leading slot (a name, or "Roster › name ⌄ n / N" with a switcher);
 * until that lands the slot stays empty rather than showing the "Roster"
 * crumb `navLabel` would prefix-match, which would flash and then be replaced
 * by a trail that starts with the same word.
 */
const ROSTER_PROFILE_PAGE = /^\/dashboard\/team\/roster\/[^/]+$/;

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
  // Pages that are steps within a destination rather than ones themselves:
  // the match wizard here, the schedule create screens just below.
  if (pathname === "/dashboard/matches/new") {
    return [MATCHES_CRUMB, { label: "New match" }];
  }

  // The schedule subtree: a leaf crumb for the four create screens (the
  // table lives in nav.ts with the other route labels), and just the linked
  // Schedule crumb for every other page under it — the event and single-match
  // detail pages name themselves in their own body's <h1>, so a leaf here
  // would restate it: same philosophy as the destination rule below, the
  // crumb slot doesn't compete with a display-type title for the same fact.
  if (pathname.startsWith(`${SCHEDULE_HREF}/`)) {
    const leaf = scheduleLeaf(pathname);
    return leaf ? [SCHEDULE_CRUMB, { label: leaf }] : [SCHEDULE_CRUMB];
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



export function Header({
  activitySlot,
  greeting,
}: {
  activitySlot: React.ReactNode;
  /** Server-chosen "Good morning" etc. — see `timeOfDayGreeting`. */
  greeting: string;
}) {
  const pathname = usePathname();
  const headerStatus = useHeaderStatus();
  const headerSlot = useHeaderSlot();
  const { active, available, viewer } = useWorkspace();

  // A program's own settings page names the program as the third crumb —
  // resolved from the workspaces the client already holds, like the settings
  // layout's title, so the trail and the title cannot disagree.
  const teamSettingsId = pathname.match(TEAM_SETTINGS_PAGE)?.[1] ?? null;
  const teamSettingsProgram = teamSettingsId
    ? available.find(
        (workspace) => workspace.kind === "team" && workspace.id === teamSettingsId
      )
    : undefined;
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

  // The personal Home greets here (Pa2). A team workspace never reaches this
  // branch: its home is /dashboard/team, which greets in its own body.
  const showGreeting = pathname === "/dashboard" && active.kind === "personal";

  // A page that publishes its own leading slot outranks every treatment below
  // — see `header-slot.tsx`. The profile route is the one that does, and it
  // also holds the slot empty while the page is still on its way.
  const pageOwnsSlot = headerSlot !== null || ROSTER_PROFILE_PAGE.test(pathname);

  /**
   * The leading slot answers "where am I" once, never twice.
   *
   * A rail destination already lights its own row in the sidebar and names
   * itself in display type in its own body, so a trail reading "Statistics"
   * above a page reading "Statistics" spends the slot restating what two other
   * things on screen already say. The workspace is the one fact the page body
   * never states — so that is what a destination gets. A position *inside* a
   * flow (`matches/[matchId]`, the upload wizard, the schedule create screens)
   * has a path worth tracing and nothing else on screen tracing it, so it
   * keeps the trail. `isDestination` matches exactly, never by prefix, for
   * precisely that reason. The two treatments are alternatives and never both:
   * a trail *and* a title in one slot reads as two competing answers to the
   * same question.
   *
   * This is a broadening. The `WORKSPACE_TITLE_PATHS` set it replaces held
   * three paths, and its own comment said Statistics, Ask and Help stayed on
   * crumbs because "their bodies do not all carry a display-type title to
   * displace". That was true when it was written and is not true now: every
   * rail destination was checked before this rule went in, and each one names
   * itself. `ComingSoonPage` renders `<h1 class="text-display">` for
   * Statistics, Ask and Opponents; Help, Roster and Schedule carry their own.
   * That premise is what the rule rests on — a destination whose body stops
   * naming itself has no name on screen at all, so check the body before
   * adding a row to the rail.
   *
   * `showGreeting` is tested first, and that order is load-bearing. Design 9g
   * gave destinations the workspace title; 1a–1g extended it to the personal
   * pair on Home, where "Personal · <name>" is the line saying *whose data* —
   * the seam a claimed college player crosses with a second workspace one
   * click away. Platform Audit Pa2 then promoted that page's greeting into
   * this slot ("Good morning, Jordan", with "Personal · Monday, Aug 24"
   * beside it), so the personal Home has a third treatment that outranks the
   * title.
   *
   * ── The two per-path exceptions, and why there are two ──────────────────
   * `showGreeting` above, and `ROSTER_PROFILE_PAGE` in `pageOwnsSlot`. The
   * second exists because a page that fills this slot itself
   * (`header-slot.tsx`) can only publish from an effect, so between the
   * route resolving and that effect there is a frame where the slot is empty
   * and the fallback below would draw "Roster" — the crumb the page is about
   * to replace with a person's name. Suppressing it needs an answer during
   * render, and the path is the only one available then.
   *
   * A `claimed` flag on the slot context was weighed as the general form and
   * rejected: a claim is also an effect, so it would move the flash rather
   * than remove it. Keep the count at two — a third path here means the slot
   * mechanism needs a render-time signal, not another regex.
   */
  const title =
    !showGreeting && !pageOwnsSlot && isDestination(pathname)
      ? workspaceTitle(active, viewer)
      : null;

  // A match detail page is one page. `matches/[matchId]/` has no
  // sub-directories — only error/layout/loading/not-found/page — so the trail
  // that used to be built here for insights/performance/statistics/video/visuals
  // matched routes that cannot be reached.
  const breadcrumbs: { label: string; href?: string }[] =
    title || showGreeting || pageOwnsSlot
      ? []
      : isMatchDetailPage && matchCrumb
      ? [
          MATCHES_CRUMB,
          { label: matchCrumb.tournamentName },
          { label: `${matchCrumb.player1Name} vs ${matchCrumb.player2Name}` },
        ]
      : teamSettingsProgram
      ? [
          { label: "Settings", href: "/dashboard/settings" },
          TEAMS_CRUMB,
          { label: teamSettingsProgram.name },
        ]
      : getStaticBreadcrumbs(pathname);

  // Radix handles Escape, outside-click and focus return; a client-side
  // navigation from a menu item is the one dismissal it cannot see.
  useEffect(() => {
    setIsProfileOpen(false);
  }, [pathname]);

  // Keyboard shortcut: Cmd+K (search). Cmd+\ (sidebar collapse) belongs to
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
        /* `shrink-0` is load-bearing: the bar is a flex item in the shell's
           scrolling column, so without it the 44px height is only a starting
           size and the row squeezes down to whatever its tallest control needs
           (33px — the avatar). The old `py-4` hid this by accident, by pushing
           the content-size suggestion past 44 so the automatic minimum pinned
           there. Spec reads "44px sticky", so say it outright.

           `px-6`: every Platform Audit frame (Pa2, Pb2, Tb4, Tc2 and the 21a
           round before them) draws the bar at `padding: 0 24px`; the 16px an
           older spec named was the drift the audit caught.

           The bottom edge rests on the hairline the frames draw and firms up
           to the scroll indicator once the column has moved — a canvas cannot
           scroll, so the frame shows only the resting state. */
        className={cn(
          "sticky top-0 z-30 flex h-11 shrink-0 items-center justify-between border-b bg-white px-6 transition-colors duration-200",
          scrolled ? "border-[#EBEBEB]" : "border-[var(--border-hairline)]"
        )}
      >
        {/* Left: the workspace title, or breadcrumbs — one or the other, never
            both. The collapse toggle moved into the sidebar's bottom group,
            where it never shifts relative to Settings and Help. */}
        <div className="flex min-w-0 flex-1 items-center">
          {headerSlot}

          {showGreeting && (
            <HeaderGreeting
              greeting={greeting}
              firstName={viewer.firstName}
              workspaceName={active.name}
            />
          )}

          {/* Workspace first and heaviest; the qualifier — the squad on a team,
              the viewer's name on a personal one — trails it in micro type with
              no dash or dot, because the pair reads as one name rather than two
              facts. The qualifier is dropped entirely — not emptied — where
              there is none, so `gap-2` has nothing to space. */}
          {title && (
            <span className="inline-flex items-baseline gap-2">
              {/* No screen-reader separator between the two spans, and none
                  needed: both are flex items, so both blockify and already
                  announce as separate nodes. `element.textContent` runs them
                  together, but nothing reads that — check the accessibility
                  tree before "fixing" it. Naming the pair is the rail's job;
                  its trigger already announces the workspace by name. */}
              <span className="text-[12px] font-medium text-[var(--ink-900)]">
                {title.name}
              </span>
              {title.qualifier && (
                /* `text-micro` bakes in --ink-500, which colors.css reserves
                   for decoration at 3.54:1 — and nothing in this slot is
                   decoration. On a team it is the only thing telling a school's
                   men's and women's workspaces apart; on a personal one it is
                   the only thing telling you whose data you are looking at,
                   since every personal workspace is called "Personal".
                   --ink-600 is the documented AA-gap token, 4.83:1. One step
                   darker than the frames draw it, deliberately: contrast is a
                   floor, and one rule in one slot beats two. Inline because the
                   DS class is unlayered and beats a Tailwind colour utility. */
                <span className="text-micro" style={{ color: "var(--ink-600)" }}>
                  {title.qualifier}
                </span>
              )}
            </span>
          )}

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

        {/* Right: page status + search + activity + profile.

            One TooltipProvider around the cluster rather than one per control:
            it owns the skip-delay timer, so moving from Search to Activity
            answers instantly instead of serving the 400ms reveal twice. */}
        <TooltipProvider delayDuration={CHROME_TOOLTIP_DELAY_MS}>
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Whatever the current page wants said up here — the upload wizard's
                "Draft saved", and nothing else so far. */}
            {headerStatus && (
              <span className="mr-1.5 text-[11px] text-[var(--ink-400)]">
                {headerStatus}
              </span>
            )}
            {/* Named, not just an icon — a bare magnifier does not say what it
                searches, and the palette covers matches, players and help.

                The shortcut is in the tooltip rather than a keycap in the bar:
                it is worth knowing once, not worth a permanent grey chip in the
                chrome. `isMac` still decides which one it names. */}
            <ChromeTooltip
              label="Search"
              detail="Matches, players, help"
              shortcut={isMac === null ? undefined : isMac ? "⌘K" : "⌃K"}
            >
              <button
                onClick={() => setIsSearchOpen(true)}
                className="group flex h-7 cursor-pointer items-center gap-[7px] rounded-[8px] px-2 text-[var(--ink-500)] transition-colors duration-150 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-700)] active:scale-[0.97] focus-visible:outline-none"
              >
                <Search className="h-[14px] w-[14px]" strokeWidth={1.5} aria-hidden="true" />
                <span className="text-[12px] text-[var(--ink-600)] transition-colors duration-150 group-hover:text-[var(--ink-700)]">
                  Search
                </span>
              </button>
            </ChromeTooltip>

            {activitySlot}

            <span
              aria-hidden="true"
              className="mx-0.5 h-3.5 w-px bg-[var(--border-medium)]"
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
                    "flex cursor-pointer items-center gap-[5px] rounded-full py-[3px] pl-[3px] pr-1.5 transition-colors duration-150 hover:bg-[var(--surface-subtle)] active:scale-[0.97] focus-visible:outline-none",
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

              {/* 288px on the popover primitive's own surface. This used to
                  override the primitive to a 12px radius and the medium border,
                  as the activity tray did; both now take the 14px hairline the
                  primitive draws, so the two menus that open 6px apart are one
                  object. Two rules, not four: identity | workspaces | everything
                  else, with Sign out in the last run rather than behind a third
                  hairline of its own. */}
              <PopoverContent
                align="end"
                sideOffset={6}
                className="w-[288px] p-2"
              >
                {/* Identity. Role and plan ride the name's line rather than
                    claiming a padded band beneath it — the chips are facts about
                    the person, and a row of their own read as a third section. */}
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[11px] font-medium text-[var(--ink-700)]"
                  >
                    {viewer.initials}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
                        {viewer.name}
                      </span>
                      {/* Role is a program standing — a personal workspace has
                          no one to have standing over, so it carries only the
                          plan. */}
                      {active.kind === "team" && (
                        <Chip>{capitalize(active.role)}</Chip>
                      )}
                      <Chip>{capitalize(viewer.plan)}</Chip>
                    </div>
                    <span className="truncate text-[11px] text-[var(--ink-500)]">
                      {viewer.email}
                    </span>
                  </div>
                </div>

                <div className={cn(MENU_RULE_CLASS, "mt-1")} />

                {/* Absent, not a list of one. A viewer holding a single
                    workspace has nothing to switch to, and a lone row with a
                    tick beside it is chrome that answers nothing. The block
                    appears the moment a second workspace does. */}
                {available.length > 1 && (
                  <>
                    <p className="eyebrow px-3 pb-1 pt-3">
                      Workspace
                    </p>
                    {/* Scrolls at four rows rather than growing the menu — a
                        coach on five programs still gets a menu that fits. */}
                    <div className="max-h-[140px] overflow-y-auto">
                      <WorkspaceOptionList
                        onSwitched={() => setIsProfileOpen(false)}
                      />
                    </div>
                    <div className={cn(MENU_RULE_CLASS, "my-2")} />
                  </>
                )}

                <Link href="/dashboard/settings/preferences" className={MENU_ROW_CLASS}>
                  <SlidersHorizontal
                    className="size-[14px] text-[var(--ink-600)]"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  Preferences
                </Link>
                <Link
                  href="/dashboard/settings/usage"
                  className={MENU_ROW_CLASS}
                >
                  <Timer
                    className="size-[14px] text-[var(--ink-600)]"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  Usage &amp; quota
                </Link>
                <Link href="/dashboard/help" className={MENU_ROW_CLASS}>
                  <CircleHelp
                    className="size-[14px] text-[var(--ink-600)]"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  Help
                </Link>
                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    requestLogout();
                  }}
                  className={cn(MENU_ROW_CLASS, "text-[var(--ink-700)]")}
                >
                  <LogOut
                    className="size-[14px] text-[var(--ink-600)]"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  Sign out
                </button>
              </PopoverContent>
            </Popover>
          </div>
        </TooltipProvider>
      </header>

      <SearchCommandPalette open={isSearchOpen} onOpenChange={setIsSearchOpen} />
    </>
  );
}
